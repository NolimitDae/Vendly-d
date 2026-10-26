import { deflateSync } from 'zlib';

/**
 * Simple placeholder photos for test packages: a diagonal two-colour gradient with the category
 * name and a smaller second line in white block letters, encoded as a PNG in plain JS (no image
 * library is installed). The result goes through the normal upload checks like any photo.
 */

// 5x7 block letters; anything else is drawn as a space
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '10001', '01010', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Upper-cased text with only the letters we can draw, split into lines that fit `maxChars`. */
export function wrapText(text: string, maxChars: number, maxLines = 2): string[] {
  const clean = text.toUpperCase().replace(/[^A-Z0-9&.' -]/g, ' ').replace(/\s+/g, ' ').trim();
  const lines: string[] = [];
  let line = '';
  for (const word of clean.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) line = next;
    else {
      if (line) lines.push(line);
      line = word.slice(0, maxChars);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, maxChars - 3)}...`;
  }
  return lines;
}

const backgrounds = new Map<string, Buffer>();

/** The gradient with its soft light circle, worked out once per colour pair and size. */
function background(colors: [string, string], W: number, H: number): Buffer {
  const key = `${colors.join(',')}|${W}x${H}`;
  const cached = backgrounds.get(key);
  if (cached) return cached;
  const [a, b] = [rgb(colors[0]), rgb(colors[1])];
  const px = Buffer.alloc(W * H * 3);
  const cx = W * 0.78;
  const cy = H * 0.22;
  const reach = H * 0.55;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      // a soft light circle in the top right keeps it from looking flat
      const d = Math.hypot(x - cx, y - cy);
      const glow = d < reach ? (1 - d / reach) * 0.18 : 0;
      const i = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        const base = a[c] + (b[c] - a[c]) * t;
        px[i + c] = base + (255 - base) * glow;
      }
    }
  }
  if (backgrounds.size > 50) backgrounds.clear();
  backgrounds.set(key, px);
  return px;
}

/** A width x height PNG: gradient from `colors[0]` (top left) to `colors[1]` (bottom right), with the text centred. */
export function placeholderPng(opts: { title: string; subtitle?: string; colors: [string, string]; width?: number; height?: number }): Buffer {
  const W = opts.width ?? 1200;
  const H = opts.height ?? 800;
  const px = Buffer.from(background(opts.colors, W, H));

  const draw = (text: string, scale: number, top: number) => {
    const width = text.length * 6 * scale - scale;
    let left = Math.round((W - width) / 2);
    for (const ch of text) {
      const g = GLYPHS[ch];
      if (g) {
        for (let r = 0; r < 7; r++) {
          for (let col = 0; col < 5; col++) {
            if (g[r][col] !== '1') continue;
            for (let yy = 0; yy < scale; yy++) {
              const y = top + r * scale + yy;
              if (y < 0 || y >= H) continue;
              for (let xx = 0; xx < scale; xx++) {
                const x = left + col * scale + xx;
                if (x < 0 || x >= W) continue;
                const i = (y * W + x) * 3;
                px[i] = px[i + 1] = px[i + 2] = 255;
              }
            }
          }
        }
      }
      left += 6 * scale;
    }
  };

  const margin = Math.round(W * 0.08);
  const titleScale = 10;
  const titleLines = wrapText(opts.title, Math.floor((W - 2 * margin) / (6 * titleScale)));
  const subScale = 5;
  const subLines = opts.subtitle ? wrapText(opts.subtitle, Math.floor((W - 2 * margin) / (6 * subScale))) : [];
  const titleH = titleLines.length * 7 * titleScale + (titleLines.length - 1) * 3 * titleScale;
  const subH = subLines.length ? 4 * titleScale + subLines.length * 7 * subScale + (subLines.length - 1) * 3 * subScale : 0;
  let top = Math.round((H - titleH - subH) / 2);
  for (const line of titleLines) {
    draw(line, titleScale, top);
    top += 10 * titleScale;
  }
  top += titleScale;
  for (const line of subLines) {
    draw(line, subScale, top);
    top += 10 * subScale;
  }

  // each row: filter "Sub" (difference from the pixel on the left) so the gradient compresses well
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    const o = y * (W * 3 + 1);
    raw[o] = 1;
    for (let i = 0; i < W * 3; i++) {
      const cur = px[y * W * 3 + i];
      const left = i >= 3 ? px[y * W * 3 + i - 3] : 0;
      raw[o + 1 + i] = (cur - left) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
