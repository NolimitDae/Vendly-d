import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';

type Licence = {
  license_status?: string | null;
  license_photo?: string[] | null;
  /** the vendor's ID check: approved (id_verified_at), else the latest one sent */
  user?: { id_verified_at?: Date | string | null; identityVerifications?: { status: string }[] } | null;
} | null | undefined;

/** An approved business licence (or, without one, the social media page or website screenshot sent in its place). NOT_APPLICABLE: an admin said none is needed. */
const licenceApproved = (licence: Licence) => licence?.license_status === 'APPROVED' || licence?.license_status === 'NOT_APPLICABLE';

/**
 * Vendors publish packages and rental items only with an approved business licence (or social page /
 * website screenshot) and an approved photo ID (driver's licence, passport, or national or state ID;
 * owner's rule, Oct 2026). Only going live is checked: what is already live stays live, and drafts can
 * always be saved.
 */
export function canPublish(licence: Licence): boolean {
  return licenceApproved(licence) && !!licence?.user?.id_verified_at;
}

/** Why a vendor can't publish yet, worded for where their licence and ID checks stand. */
export function licenceNeededMessage(licence: Licence): string {
  if (licenceApproved(licence)) {
    const idCheck = licence?.user?.identityVerifications?.[0]?.status;
    if (idCheck === 'PENDING') return 'Vendly is reviewing your ID. You can publish once it’s approved.';
    if (idCheck === 'REJECTED') return 'Your ID couldn’t be verified. Send it again from Verify your ID in your profile before you publish.';
    return 'Verify your ID before you publish: add a driver’s license, passport or other photo ID from Verify your ID in your profile, and Vendly will review it.';
  }
  if (licence?.license_status === 'SUSPENDED') {
    return 'Your business licence needs attention before you can publish. Upload it again from your profile and Vendly will review it.';
  }
  if (licence?.license_photo?.length) {
    return 'Vendly is reviewing your business licence. You can publish once it’s approved.';
  }
  return 'Your business licence needs to be approved before you can publish. Upload it from your profile (no licence? a screenshot of your business’s social media page or website) and Vendly will review it.';
}

export async function vendorLicence(prisma: Pick<PrismaService, 'vendorProfile'>, vendorId: string) {
  return prisma.vendorProfile.findUnique({
    where: { user_id: vendorId },
    select: {
      license_status: true,
      license_photo: true,
      user: { select: { id_verified_at: true, identityVerifications: { orderBy: { created_at: 'desc' }, take: 1, select: { status: true } } } },
    },
  });
}

/** Vendors need a business address on file to publish (where customers come, and where delivery and travel miles start). */
export const BUSINESS_ADDRESS_NEEDED = 'Add your business address in your profile before you publish. Customers only see it once you accept their booking; delivery and travel miles are measured from it.';

/** Throws (403) unless the vendor may publish: an approved licence, an approved ID and a business address. */
export async function assertCanPublish(prisma: Pick<PrismaService, 'vendorProfile'>, vendorId: string) {
  const licence = await vendorLicence(prisma, vendorId);
  if (!canPublish(licence)) throw new ForbiddenException(licenceNeededMessage(licence));
  const profile = await prisma.vendorProfile.findUnique({ where: { user_id: vendorId }, select: { business_address: true } });
  if (!profile?.business_address?.trim()) throw new ForbiddenException(BUSINESS_ADDRESS_NEEDED);
}
