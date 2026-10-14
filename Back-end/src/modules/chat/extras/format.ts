import appConfig from 'src/config/app.config';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';

const avatarUrl = (avatar?: string | null) => (avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`) : null);

/** Prisma include that gives everything formatMessage needs. */
export const messageInclude = {
  sender: { select: { id: true, name: true, email: true, avatar: true } },
  quote: { include: { listing: { select: { id: true, title: true, images: true } } } },
} as const;

export function formatQuote(q: any) {
  if (!q) return null;
  const expired = q.status === 'PENDING' && new Date(q.expires_at) < new Date();
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    amount: Number(q.amount),
    expires_at: q.expires_at,
    status: expired ? 'EXPIRED' : q.status,
    vendor_id: q.vendor_id,
    customer_id: q.customer_id,
    event_id: q.event_id,
    booking_id: q.booking_id,
    listing: q.listing
      ? { id: q.listing.id, title: q.listing.title, image: q.listing.images?.[0] ? TanvirStorage.url(`listings/${q.listing.images[0]}`) : null }
      : null,
  };
}

/** One shape for messages everywhere (REST and socket), old fields kept for existing clients. */
export function formatMessage(msg: any) {
  return {
    id: msg.id,
    text: msg.text,
    kind: msg.kind ?? 'text',
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    status: msg.status,
    contact_flagged: !!msg.contact_flagged,
    attachments: msg.attachments ?? [],
    // older clients read these two names
    attchment: msg.attachments ?? [],
    attachments_url: (msg.attachments ?? []).map((f: string) => TanvirStorage.url(`${appConfig().storageUrl.attachment}/${f}`)),
    quote: formatQuote(msg.quote),
    sender: msg.sender
      ? { id: msg.sender.id, name: msg.sender.name, email: msg.sender.email, avater: msg.sender.avatar, avatar: avatarUrl(msg.sender.avatar), avatar_url: avatarUrl(msg.sender.avatar) }
      : null,
  };
}

export { avatarUrl };
