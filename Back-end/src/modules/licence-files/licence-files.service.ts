import { ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { PHOTOS_OR_PDF, sniffUpload } from 'src/common/helper/upload-files';
import { withJobLock } from 'src/common/helper/job-lock';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  LICENCE_TYPES,
  LicenceKind,
  isLegacyName,
  isLicenceKey,
  legacyPublicKey,
  licenceSource,
  movedLicenceKey,
  readPublicFile,
} from './licence-files';
import { storageSettings } from 'src/common/lib/Disk/storage-settings';

/** Wait this long after start-up before moving old files, so the server is serving first. */
const MOVE_DELAY_MS = 15_000;

export type MoveResult = { rows: number; moved: number; failed: number };

@Injectable()
export class LicenceFilesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LicenceFilesService.name);

  constructor(private prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => void this.runLegacyMove(), MOVE_DELAY_MS).unref();
  }

  /** One server moves the old public licence files into private storage; the others skip. Never throws. */
  async runLegacyMove() {
    // with public files in S3 but no private bucket, "private" would be this container's disk, which
    // the next deploy wipes: never move (and delete the public copies) then
    const settings = storageSettings();
    if (settings.driver === 's3' && !settings.privateBucket) {
      this.logger.warn('Licence files not moved: S3_PRIVATE_BUCKET is not set');
      return;
    }
    try {
      const r = await withJobLock(this.prisma, 'licence-files-move', () => this.moveLegacy());
      if (!r) return;
      if (r.rows) this.logger.log(`Licence files: moved ${r.moved} to private storage, ${r.failed} left to retry (${r.rows} profiles)`);
    } catch (err) {
      this.logger.warn(`Licence file move stopped: ${(err as Error).message}`);
    }
  }

  /**
   * Moves every legacy licence (a bare file name in the public bucket) to private storage: read the
   * public copy, write the private one, point the profile at it, then delete the public copy. A file
   * that fails stays as it is and is tried again on the next start, so running it twice is harmless.
   */
  async moveLegacy(): Promise<MoveResult> {
    const total: MoveResult = { rows: 0, moved: 0, failed: 0 };
    for (const kind of ['vendor', 'planner'] as LicenceKind[]) {
      const rows = await this.profiles(kind).findMany({ where: { license_photo: { isEmpty: false } }, select: { user_id: true, license_photo: true } });
      for (const row of rows as { user_id: string; license_photo: string[] }[]) {
        if (row.license_photo.every(isLicenceKey)) continue;
        total.rows++;
        const r = await this.moveRow(kind, row.user_id, row.license_photo);
        total.moved += r.moved;
        total.failed += r.failed;
      }
    }
    return total;
  }

  private async moveRow(kind: LicenceKind, userId: string, values: string[]) {
    const next: string[] = [];
    const moved: string[] = [];
    let failed = 0;
    for (const value of values) {
      if (isLicenceKey(value)) {
        next.push(value);
        continue;
      }
      try {
        if (!isLegacyName(value)) throw new Error('not a file name');
        const buffer = await readPublicFile(legacyPublicKey(kind, value));
        const key = movedLicenceKey(kind, userId, value);
        await PrivateStorage.put(key, buffer);
        next.push(key);
        moved.push(value);
      } catch (err) {
        this.logger.warn(`Licence file ${kind}/${userId}/${value} not moved: ${(err as Error).message}`);
        next.push(value);
        failed++;
      }
    }
    if (!moved.length) return { moved: 0, failed };

    // only if the profile still holds the same files (the owner may have uploaded new ones meanwhile)
    const done = await this.profiles(kind)
      .updateMany({ where: { user_id: userId, license_photo: { equals: values } }, data: { license_photo: next } })
      .catch((err: Error) => {
        this.logger.warn(`Licence files for ${kind}/${userId} not saved: ${err.message}`);
        return { count: 0 };
      });
    if (done.count !== 1) {
      // the public copies are untouched; drop the private ones and try again next start, unless the
      // profile already points at them (another run got there first)
      const now = await this.profiles(kind).findUnique({ where: { user_id: userId }, select: { license_photo: true } }).catch(() => null);
      const inUse = new Set<string>(now?.license_photo ?? []);
      await Promise.all(
        moved.map((v) => movedLicenceKey(kind, userId, v)).filter((k) => !inUse.has(k)).map((k) => PrivateStorage.remove(k).catch(() => null)),
      );
      return { moved: 0, failed: failed + moved.length };
    }
    for (const v of moved) {
      await TanvirStorage.delete(legacyPublicKey(kind, v)).catch((err: Error) =>
        this.logger.warn(`Public copy of licence ${kind}/${userId}/${v} not deleted: ${err.message}`),
      );
    }
    return { moved: moved.length, failed };
  }

  private profiles(kind: LicenceKind): any {
    return kind === 'vendor' ? this.prisma.vendorProfile : this.prisma.eventPlannerProfile;
  }

  /**
   * Serves a licence from a signed link. Only licence keys of the owner named in the link, and only
   * while the viewer it was issued to is that owner or still an admin.
   */
  async resolve(token: string) {
    const claims = SignedUrl.verify(token);
    const source = claims && licenceSource(claims);
    if (!claims || !source) throw new ForbiddenException('This link has expired.');
    if (claims.uid !== claims.cid && !(await this.isAdmin(claims.uid))) throw new ForbiddenException('This link has expired.');

    const buffer = await this.read(source).catch(() => {
      throw new NotFoundException('File not found');
    });
    const ext = sniffUpload(buffer, PHOTOS_OR_PDF);
    // older uploads weren't checked: anything that isn't a photo or PDF is only offered as a download
    return ext
      ? { buffer, type: LICENCE_TYPES[ext], name: `${claims.name}.${ext}`, inline: true }
      : { buffer, type: 'application/octet-stream', name: claims.name, inline: false };
  }

  private async read(source: NonNullable<ReturnType<typeof licenceSource>>): Promise<Buffer> {
    if (source.at === 'private') return PrivateStorage.get(source.key);
    // not moved yet, or moved since the link was signed
    return readPublicFile(source.key).catch(() => PrivateStorage.get(source.moved));
  }

  private async isAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { type: true, deleted_at: true } });
    return !!u && !u.deleted_at && u.type === 'ADMIN';
  }
}
