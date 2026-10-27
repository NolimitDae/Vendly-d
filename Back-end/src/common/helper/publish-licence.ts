import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';

type Licence = { license_status?: string | null; license_photo?: string[] | null } | null | undefined;

/**
 * Vendors publish packages and rental items only with an approved business licence. NOT_APPLICABLE
 * is an admin saying this vendor doesn't need one, so it counts as approved. Only going live is
 * checked: what is already live stays live, and drafts can always be saved.
 */
export function canPublish(licence: Licence): boolean {
  return licence?.license_status === 'APPROVED' || licence?.license_status === 'NOT_APPLICABLE';
}

/** Why a vendor can't publish yet, worded for where their licence check stands. */
export function licenceNeededMessage(licence: Licence): string {
  if (licence?.license_status === 'SUSPENDED') {
    return 'Your business licence needs attention before you can publish. Upload it again from your profile and Vendly will review it.';
  }
  if (licence?.license_photo?.length) {
    return 'Vendly is reviewing your business licence. You can publish once it’s approved.';
  }
  return 'Your business licence needs to be approved before you can publish. Upload it from your profile and Vendly will review it.';
}

export async function vendorLicence(prisma: Pick<PrismaService, 'vendorProfile'>, vendorId: string) {
  return prisma.vendorProfile.findUnique({ where: { user_id: vendorId }, select: { license_status: true, license_photo: true } });
}

/** Vendors need a business address on file to publish (where customers come, and where delivery and travel miles start). */
export const BUSINESS_ADDRESS_NEEDED = 'Add your business address in your profile before you publish. Customers only see it once you accept their booking; delivery and travel miles are measured from it.';

/** Throws (403) unless the vendor may publish: an approved licence and a business address. */
export async function assertCanPublish(prisma: Pick<PrismaService, 'vendorProfile'>, vendorId: string) {
  const licence = await vendorLicence(prisma, vendorId);
  if (!canPublish(licence)) throw new ForbiddenException(licenceNeededMessage(licence));
  const profile = await prisma.vendorProfile.findUnique({ where: { user_id: vendorId }, select: { business_address: true } });
  if (!profile?.business_address?.trim()) throw new ForbiddenException(BUSINESS_ADDRESS_NEEDED);
}
