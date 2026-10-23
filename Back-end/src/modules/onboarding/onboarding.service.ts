import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from 'prisma/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';

export type OnboardingRole = 'CUSTOMER' | 'VENDOR' | 'EVENT_PLANNER';
/** todo: theirs to do; pending: sent, waiting on Vendly's review; done: finished */
export type StepState = 'todo' | 'pending' | 'done';
export type StepKey =
  | 'verify_email'
  | 'verify_id'
  | 'add_card'
  | 'profile_photo'
  | 'add_location'
  | 'business_license'
  | 'first_package'
  | 'payouts'
  | 'booking_contract'
  | 'shop_branding'
  | 'planner_profile'
  | 'first_event';

export interface OnboardingStep {
  key: StepKey;
  title: string;
  description: string;
  state: StepState;
  /** why it isn't done yet, e.g. "In review" or the reason an ID was turned down */
  note?: string;
}

const ROLES: OnboardingRole[] = ['CUSTOMER', 'VENDOR', 'EVENT_PLANNER'];
type Seen = Partial<Record<OnboardingRole, { intro?: string; complete?: string }>>;

const COPY: Record<StepKey, { title: string; description: string }> = {
  verify_email: { title: 'Verify your email', description: 'So booking updates and receipts reach you.' },
  verify_id: { title: 'Verify your ID', description: 'Keeps everyone on Vendly safe, and lets you switch roles.' },
  add_card: { title: 'Add a card', description: 'Saved securely with Stripe, so booking takes one tap.' },
  profile_photo: { title: 'Add a profile photo', description: 'Vendors are quicker to reply when they can see who they’re talking to.' },
  add_location: { title: 'Add your city', description: 'So we can show vendors near you.' },
  business_license: { title: 'Upload your business licence', description: 'Vendly checks it before your packages go live.' },
  first_package: { title: 'Publish your first package', description: 'Customers can find and book you once a package is live.' },
  payouts: { title: 'Set up payouts', description: 'Connect a bank account with Stripe to get paid.' },
  booking_contract: { title: 'Set up your booking contract', description: 'Use Vendly’s contract or upload your own; customers sign it when they book.' },
  shop_branding: { title: 'Brand your shop', description: 'Add a logo or banner to your shop page.' },
  planner_profile: { title: 'Complete your planner profile', description: 'Your business name and a short bio, so vendors know who they’re working with.' },
  first_event: { title: 'Create your first event', description: 'Plan vendors, budget and timeline in one place.' },
};

const STEPS: Record<OnboardingRole, StepKey[]> = {
  CUSTOMER: ['verify_email', 'verify_id', 'add_card', 'profile_photo', 'add_location'],
  VENDOR: ['verify_email', 'business_license', 'verify_id', 'first_package', 'payouts', 'booking_contract', 'shop_branding'],
  EVENT_PLANNER: ['verify_email', 'planner_profile', 'business_license', 'verify_id', 'add_card', 'first_event'],
};

/** The checklist for an account type (CLIENT is the older name for CUSTOMER); null for admins. */
const roleOf = (t: unknown): OnboardingRole | null => (t === 'CLIENT' ? 'CUSTOMER' : ROLES.includes(t as OnboardingRole) ? (t as OnboardingRole) : null);

/**
 * The "get set up" checklist for the role in use. Each step is worked out from the account itself,
 * so it ticks off however the user did it (app, website or support). The intro popup shows once
 * after sign-up (or after adding a role); the "all set" popup shows once when everything is done,
 * and then the checklist goes away.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        type: true,
        email_verified_at: true,
        id_verified_at: true,
        avatar: true,
        location: true,
        city: true,
        address: true,
        billing_id: true,
        stripe_connect_id: true,
        onboarding_seen: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const role = roleOf(user.type);
    // admins have no checklist
    if (!role) return { success: true, data: null };

    const keys = STEPS[role];
    const states = await this.states(userId, role, keys, user);
    const steps: OnboardingStep[] = keys.map((key) => ({ key, ...COPY[key], ...states[key] }));
    const completed = steps.filter((s) => s.state === 'done').length;
    const complete = completed === steps.length;
    const seen = ((user.onboarding_seen ?? {}) as Seen)[role] ?? {};

    // Someone who finished before ever seeing the intro (accounts from before the checklist) gets neither popup.
    const popup: 'intro' | 'complete' | null = complete
      ? seen.intro && !seen.complete
        ? 'complete'
        : null
      : seen.intro
        ? null
        : 'intro';

    return {
      success: true,
      data: {
        role,
        steps,
        completed,
        total: steps.length,
        complete,
        popup,
        // stays in notifications until it's finished and the "all set" popup has been seen
        visible: !complete || popup === 'complete',
      },
    };
  }

  /** Records that a popup was shown for the role in use, so it isn't shown again. */
  async markSeen(userId: string, kind: string) {
    if (kind !== 'intro' && kind !== 'complete') throw new BadRequestException('kind must be intro or complete');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { type: true, onboarding_seen: true } });
    if (!user) throw new NotFoundException('User not found');
    const role = roleOf(user.type);
    if (!role) return { success: true };
    const seen = { ...((user.onboarding_seen ?? {}) as Seen) };
    const forRole = { ...(seen[role] ?? {}) };
    if (!forRole[kind]) forRole[kind] = new Date().toISOString();
    // a finished checklist never shows the intro afterwards
    if (kind === 'complete' && !forRole.intro) forRole.intro = forRole.complete;
    seen[role] = forRole;
    await this.prisma.user.update({ where: { id: userId }, data: { onboarding_seen: seen as Prisma.InputJsonValue } });
    return { success: true };
  }

  private async states(
    userId: string,
    role: OnboardingRole,
    keys: StepKey[],
    user: {
      email_verified_at: Date | null;
      id_verified_at: Date | null;
      avatar: string | null;
      location: string | null;
      city: string | null;
      address: string | null;
      billing_id: string | null;
      stripe_connect_id: string | null;
    },
  ): Promise<Record<string, { state: StepState; note?: string }>> {
    const want = new Set(keys);
    const done = (ok: boolean) => ({ state: (ok ? 'done' : 'todo') as StepState });

    const [idCheck, vendor, planner, published, contract, events, card, payouts] = await Promise.all([
      want.has('verify_id') && !user.id_verified_at
        ? this.prisma.identityVerification.findFirst({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            select: { status: true, rejection_reason: true },
          })
        : null,
      role === 'VENDOR'
        ? this.prisma.vendorProfile.findUnique({ where: { user_id: userId }, select: { license_photo: true, license_status: true, logo: true, banner: true } })
        : null,
      role === 'EVENT_PLANNER'
        ? this.prisma.eventPlannerProfile.findUnique({ where: { user_id: userId }, select: { license_photo: true, license_status: true, business_name: true, bio: true } })
        : null,
      want.has('first_package') ? this.prisma.vendorListing.count({ where: { vendor_id: userId, status: 'ACTIVE', deleted_at: null } }) : 0,
      want.has('booking_contract') ? this.prisma.vendorContract.count({ where: { vendor_id: userId, status: 'ACTIVE' } }) : 0,
      want.has('first_event') ? this.prisma.event.count({ where: { event_planner_id: userId } }) : 0,
      want.has('add_card') ? this.hasCard(user.billing_id) : false,
      want.has('payouts') ? this.payoutsReady(user.stripe_connect_id) : false,
    ]);

    const out: Record<string, { state: StepState; note?: string }> = {
      verify_email: done(!!user.email_verified_at),
      add_card: done(card),
      profile_photo: done(!!user.avatar),
      // the app and website save the city to address; older accounts have location or city
      add_location: done(!!(user.address?.trim() || user.location?.trim() || user.city?.trim())),
      first_package: done(published > 0),
      payouts: done(payouts),
      booking_contract: done(contract > 0),
      shop_branding: done(!!(vendor?.logo || vendor?.banner || user.avatar)),
      planner_profile: done(!!(planner?.business_name?.trim() && planner?.bio?.trim())),
      first_event: done(events > 0),
    };

    if (user.id_verified_at) out.verify_id = { state: 'done' };
    else if (idCheck?.status === 'PENDING') out.verify_id = { state: 'pending', note: 'In review, usually within one business day' };
    else if (idCheck?.status === 'REJECTED')
      out.verify_id = { state: 'todo', note: idCheck.rejection_reason ? `Not approved: ${idCheck.rejection_reason}` : 'Not approved. Please try again.' };
    else out.verify_id = { state: 'todo' };

    const licence = vendor ?? planner;
    if (licence?.license_status === 'APPROVED' || licence?.license_status === 'NOT_APPLICABLE') out.business_license = { state: 'done' };
    else if (licence?.license_status === 'SUSPENDED') out.business_license = { state: 'todo', note: 'Your licence needs attention. Please upload it again.' };
    else if (licence?.license_photo?.length) out.business_license = { state: 'pending', note: 'In review' };
    else out.business_license = { state: 'todo' };

    return out;
  }

  /** Stripe being unreachable shows the step as not done rather than failing the checklist. */
  private async hasCard(billingId: string | null) {
    if (!billingId) return false;
    try {
      return (await StripePayment.listCards(billingId)).length > 0;
    } catch (err) {
      this.logger.warn(`Couldn't list cards: ${(err as Error).message}`);
      return false;
    }
  }

  private async payoutsReady(accountId: string | null) {
    if (!accountId) return false;
    try {
      const account = await StripePayment.retrieveAccount(accountId);
      return !!account.details_submitted;
    } catch (err) {
      this.logger.warn(`Couldn't check payout account: ${(err as Error).message}`);
      return false;
    }
  }
}
