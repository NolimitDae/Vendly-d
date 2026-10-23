import * as dns from 'dns';
import * as https from 'https';
import { BlockList, isIP, type LookupFunction } from 'net';
import * as zlib from 'zlib';

/**
 * Fetches a vendor's calendar address without letting it reach our own network (SSRF):
 * https only on the default port, every address the host resolves to must be public (checked again at
 * connect time, so a DNS rebind can't slip a private address in), redirects re-checked, 10 s and 2 MB caps.
 */

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_CALENDAR_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class CalendarFetchError extends Error {}

// separate lists: a BlockList also matches IPv4 addresses against its IPv6 rules (as ::ffff:a.b.c.d)
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) blocked4.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::', 96], // IPv4-compatible
  ['::ffff:0:0', 96], // IPv4-mapped (could hide a private IPv4)
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local NAT64
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4)
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) blocked6.addSubnet(net, prefix, 'ipv6');

/** True for loopback, private, link-local, multicast and other non-public addresses (and anything unparseable). */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.replace(/^\[|\]$/g, '').split('%')[0];
  const family = isIP(address);
  if (family === 4) return blocked4.check(address, 'ipv4');
  if (family === 6) return blocked6.check(address, 'ipv6');
  return true;
}

/**
 * Turns what the vendor pasted into the URL we fetch: webcal:// (Apple) becomes https://, anything else
 * must already be https on the default port, with no user:password.
 */
export function normalizeCalendarUrl(raw: string): URL {
  const trimmed = (raw ?? '').trim().replace(/^webcals?:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CalendarFetchError('That doesn’t look like a web address. Paste the full iCal link (it starts with https://).');
  }
  if (url.protocol !== 'https:') throw new CalendarFetchError('Only secure (https://) calendar addresses are supported.');
  if (url.username || url.password) throw new CalendarFetchError('Calendar addresses with a username or password aren’t supported.');
  if (url.port && url.port !== '443') throw new CalendarFetchError('Calendar addresses on a custom port aren’t supported.');
  if (!url.hostname) throw new CalendarFetchError('That calendar address has no host.');
  return url;
}

type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

const systemLookup: Lookup = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Resolves the host and refuses it unless every address is public. Returns the addresses. */
export async function assertPublicHost(hostname: string, lookup: Lookup = systemLookup) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new CalendarFetchError('That calendar address points to a private network.');
    return [{ address: host, family: isIP(host) }];
  }
  if (/^localhost$/i.test(host) || /\.(localhost|local|internal)$/i.test(host)) {
    throw new CalendarFetchError('That calendar address points to a private network.');
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new CalendarFetchError(`Couldn’t find ${host}. Check the address and try again.`);
  }
  if (!addresses.length) throw new CalendarFetchError(`Couldn’t find ${host}. Check the address and try again.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new CalendarFetchError('That calendar address points to a private network.');
  return addresses;
}

/** Connect-time lookup: the address the socket actually uses is checked too. */
function guardedLookup(lookup: Lookup): LookupFunction {
  return (hostname, options, callback) => {
    assertPublicHost(hostname, lookup).then(
      (addresses) => {
        const wanted = typeof options === 'object' && options?.family ? addresses.filter((a) => a.family === options.family) : addresses;
        const list = wanted.length ? wanted : addresses;
        if (typeof options === 'object' && options?.all) (callback as any)(null, list);
        else callback(null, list[0].address, list[0].family);
      },
      (err) => callback(err, '', 0),
    );
  };
}

type FetchOptions = { timeoutMs?: number; maxBytes?: number; lookup?: Lookup };

function getOnce(url: URL, opts: Required<FetchOptions>, deadline: number): Promise<{ redirect?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new CalendarFetchError('The calendar took too long to respond.'));
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      reject(err instanceof CalendarFetchError ? err : new CalendarFetchError(`Couldn’t load the calendar (${err.message}).`));
    };
    const req = https.get(
      url,
      {
        lookup: guardedLookup(opts.lookup),
        headers: { 'User-Agent': 'Vendly-CalendarSync/1.0', Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.1', 'Accept-Encoding': 'gzip, deflate' },
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          settled = true;
          clearTimeout(timer);
          return resolve({ redirect: new URL(res.headers.location, url).toString() });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return fail(
            new CalendarFetchError(
              status === 404 || status === 410
                ? 'That calendar address wasn’t found. It may have been reset; copy it again from your calendar.'
                : status === 401 || status === 403
                  ? 'That calendar isn’t public. Use the secret or public iCal address.'
                  : `The calendar server answered with an error (${status}).`,
            ),
          );
        }
        if (Number(res.headers['content-length'] ?? 0) > opts.maxBytes) return fail(new CalendarFetchError('That calendar is too large to import (over 2 MB).'));
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) return fail(new CalendarFetchError('That calendar is too large to import (over 2 MB).'));
          chunks.push(chunk);
        });
        stream.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ body: Buffer.concat(chunks).toString('utf8') });
        });
        stream.on('error', fail);
      },
    );
    const timer = setTimeout(() => fail(new CalendarFetchError('The calendar took too long to respond.')), remaining);
    req.on('error', fail);
  });
}

/** Downloads an iCal feed safely and returns its text. Throws CalendarFetchError with a message fit for the vendor. */
export async function fetchCalendar(raw: string, options: FetchOptions = {}): Promise<string> {
  const opts: Required<FetchOptions> = {
    timeoutMs: options.timeoutMs ?? FETCH_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? MAX_CALENDAR_BYTES,
    lookup: options.lookup ?? systemLookup,
  };
  const deadline = Date.now() + opts.timeoutMs;
  let url = normalizeCalendarUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // fail fast with a clear message; the connect-time lookup checks again
    await assertPublicHost(url.hostname, opts.lookup);
    const res = await getOnce(url, opts, deadline);
    if (res.body !== undefined) return res.body;
    url = normalizeCalendarUrl(res.redirect!);
  }
  throw new CalendarFetchError('The calendar address redirected too many times.');
}
