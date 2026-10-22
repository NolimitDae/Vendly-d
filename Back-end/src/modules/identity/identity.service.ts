import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IdentityVerificationStatus } from 'prisma/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrivateStorage, SignedUrl } from '../contracts/private-storage';
import { PushService } from '../push/push.service';
import appConfig from '../../config/app.config';

export const ID_DOCUMENT_TYPES = ['DRIVERS_LICENSE', 'PASSPORT', 'NATIONAL_ID', 'STATE_ID'] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];
export const ID_MAX_BYTES = 10 * 1024 * 1024;

type Upload = { buffer: Buffer; size: number; originalname?: string };
export interface IdentityFiles {
  front?: Upload;
  back?: Upload;
  selfie?: Upload;
}

/** Works out the real image type from the file's first bytes (never trusts the name or the browser). */
export function imageKind(buf: Buffer): 'jpg' | 'png' | 'webp' | 'heic' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)$/.test(buf.subarray(8, 12).toString('ascii'))) return 'heic';
  return null;
}

const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' } as const;

/**
 * ID checks: a user uploads a photo ID and a selfie; an admin compares them and approves or rejects.
 * Approval sets User.id_verified_at, which switching or adding account roles requires.
 * Images live in private storage and are only shown to admins through short-lived signed links.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Where the user's ID check stands. */
  async status(userId: string) {
    const [user, latest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id_verified_at: true } }),
      this.prisma.identityVerification.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: { id: true, status: true, document_type: true, rejection_reason: true, created_at: true, reviewed_at: true },
      }),
    ]);
    return {
      success: true,
      data: {
        verified: !!user?.id_verified_at,
        verified_at: user?.id_verified_at ?? null,
        status: user?.id_verified_at ? 'APPROVED' : (latest?.status ?? 'NONE'),
        rejection_reason: latest?.status === 'REJECTED' ? latest.rejection_reason : null,
        submitted_at: latest?.created_at ?? null,
      },
    };
  }

  async submit(userId: string, dto: { document_type: string; legal_name: string }, files: IdentityFiles) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id_verified_at: true, type: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.type === 'ADMIN') throw new ForbiddenException('Admin accounts don’t need ID verification.');
    if (user.id_verified_at) throw new BadRequestException('Your ID is already verified.');
    if (!ID_DOCUMENT_TYPES.includes(dto.document_type as IdDocumentType)) throw new BadRequestException('Choose a document type.');
    const legalName = dto.legal_name?.trim();
    if (!legalName || legalName.length < 2) throw new BadRequestException('Enter your full legal name as it appears on your ID.');
    if (!files.front) throw new BadRequestException('Add a photo of the front of your ID.');
    if (!files.selfie) throw new BadRequestException('Add a selfie so we can match you to your ID.');
    if (dto.document_type !== 'PASSPORT' && !files.back) throw new BadRequestException('Add a photo of the back of your ID.');

    const stored: string[] = [];
    const save = async (file: Upload, label: string) => {
      if (file.size > ID_MAX_BYTES) throw new BadRequestException(`The ${label} photo is over 10 MB.`);
      const kind = imageKind(file.buffer);
      // HEIC is refused: admins review in a browser, and Chrome and Firefox can't show it
      if (!kind || kind === 'heic') throw new BadRequestException(`The ${label} photo must be a JPEG, PNG or WebP image.`);
      const key = PrivateStorage.newKey(`identity/${userId}`, kind);
      await PrivateStorage.put(key, file.buffer);
      stored.push(key);
      return key;
    };

    try {
      const front_key = await save(files.front, 'ID front');
      const back_key = files.back ? await save(files.back, 'ID back') : null;
      const selfie_key = await save(files.selfie, 'selfie');

      // One open check at a time: a new upload replaces the one waiting for review.
      const pending = await this.prisma.identityVerification.findMany({ where: { user_id: userId, status: 'PENDING' } });
      const created = await this.prisma.$transaction(async (tx) => {
        // only checks still waiting: one an admin just reviewed is kept
        if (pending.length) await tx.identityVerification.deleteMany({ where: { id: { in: pending.map((p) => p.id) }, status: 'PENDING' } });
        return tx.identityVerification.create({
          data: { user_id: userId, document_type: dto.document_type, legal_name: legalName.slice(0, 255), front_key, back_key, selfie_key },
          select: { id: true, status: true, created_at: true },
        });
      });
      await this.removeFiles(pending);
      return { success: true, message: 'Thanks! We’ll review your ID, usually within one business day.', data: created };
    } catch (err) {
      await Promise.all(stored.map((k) => PrivateStorage.remove(k).catch(() => undefined)));
      throw err;
    }
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminList(status: IdentityVerificationStatus | undefined, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.prisma.identityVerification.findMany({
        where,
        orderBy: { created_at: status === 'PENDING' ? 'asc' : 'desc' },
        skip,
        take,
        select: {
          id: true, status: true, document_type: true, legal_name: true, created_at: true, reviewed_at: true, rejection_reason: true,
          user: { select: { id: true, name: true, email: true, type: true, roles: true } },
        },
      }),
      this.prisma.identityVerification.count({ where }),
    ]);
    return { success: true, data: rows, meta: { total, page: Math.floor(skip / take) + 1, limit: take, last_page: Math.ceil(total / take) } };
  }

  /** One check with short-lived links to its images (admins only; links expire in 5 minutes). */
  async adminGet(id: string, adminId: string) {
    const v = await this.prisma.identityVerification.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true, type: true, roles: true, created_at: true } } },
    });
    if (!v) throw new NotFoundException('Verification not found');
    const link = (key: string | null, name: string) => (key ? this.fileUrl(key, adminId, v.id, name) : null);
    const { front_key, back_key, selfie_key, ...rest } = v;
    return {
      success: true,
      data: { ...rest, front_url: link(front_key, 'id-front'), back_url: link(back_key, 'id-back'), selfie_url: link(selfie_key, 'selfie') },
    };
  }

  async adminReview(id: string, adminId: string, dto: { status: 'APPROVED' | 'REJECTED'; reason?: string }) {
    if (dto.status !== 'APPROVED' && dto.status !== 'REJECTED') throw new BadRequestException('Choose approve or reject.');
    const reason = dto.reason?.trim();
    if (dto.status === 'REJECTED' && !reason) throw new BadRequestException('Tell the user why, so they can fix it.');
    const v = await this.prisma.identityVerification.findUnique({ where: { id }, select: { id: true, user_id: true, status: true } });
    if (!v) throw new NotFoundException('Verification not found');
    if (v.status !== 'PENDING') throw new BadRequestException('This check has already been reviewed.');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // the status guard stops two admins deciding the same check
      const done = await tx.identityVerification.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: dto.status, reviewed_by_id: adminId, reviewed_at: now, rejection_reason: dto.status === 'REJECTED' ? reason : null },
      });
      if (done.count !== 1) throw new BadRequestException('This check has already been reviewed.');
      if (dto.status === 'APPROVED') await tx.user.update({ where: { id: v.user_id }, data: { id_verified_at: now } });
    });

    await this.push
      .sendToUser(
        v.user_id,
        dto.status === 'APPROVED'
          ? { title: 'Your ID is verified', body: 'You can now switch between customer, vendor and planner on one login.', data: { type: 'identity', status: 'APPROVED' } }
          : { title: 'We couldn’t verify your ID', body: `${reason} Please upload new photos.`, data: { type: 'identity', status: 'REJECTED' } },
      )
      .catch((err) => this.logger.warn(`ID review push failed: ${(err as Error).message}`));
    return { success: true, message: dto.status === 'APPROVED' ? 'ID approved' : 'ID rejected' };
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  fileUrl(key: string, uid: string, cid: string, name: string) {
    const base = appConfig().app.url ?? '';
    return `${base}/api/identity/files/${SignedUrl.sign({ key, uid, cid, name })}`;
  }

  async resolveFile(token: string) {
    const claims = SignedUrl.verify(token);
    // contract links are signed with the same secret; only identity keys are served here
    if (!claims || !claims.key.startsWith('identity/')) throw new ForbiddenException('This link has expired.');
    const buffer = await PrivateStorage.get(claims.key).catch(() => {
      throw new NotFoundException('File not found');
    });
    const kind = imageKind(buffer) ?? 'jpg';
    return { buffer, type: CONTENT_TYPES[kind], name: `${claims.name}.${kind}` };
  }

  /** Account deletion: ID photos and checks are removed, not kept. */
  async purgeForUser(userId: string) {
    const rows = await this.prisma.identityVerification.findMany({ where: { user_id: userId } });
    await this.prisma.identityVerification.deleteMany({ where: { user_id: userId } });
    await this.removeFiles(rows);
  }

  private async removeFiles(rows: { front_key: string; back_key: string | null; selfie_key: string }[]) {
    const keys = rows.flatMap((r) => [r.front_key, r.back_key, r.selfie_key]).filter((k): k is string => !!k);
    await Promise.all(keys.map((k) => PrivateStorage.remove(k).catch((err) => this.logger.warn(`Couldn't remove ${k}: ${(err as Error).message}`))));
  }
}
