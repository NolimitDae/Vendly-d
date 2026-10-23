import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';

jest.mock('../../common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: { listCards: jest.fn(), retrieveAccount: jest.fn() },
}));
const listCards = StripePayment.listCards as jest.Mock;
const retrieveAccount = StripePayment.retrieveAccount as jest.Mock;

const blankUser = {
  type: 'CUSTOMER',
  email_verified_at: null,
  id_verified_at: null,
  avatar: null,
  location: null,
  city: null,
  address: null,
  billing_id: null,
  stripe_connect_id: null,
  onboarding_seen: {},
};

function setup(user: any, extra: { vendor?: any; planner?: any; idCheck?: any; listings?: number; contracts?: number; events?: number } = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ ...blankUser, ...user }), update: jest.fn() },
    identityVerification: { findFirst: jest.fn().mockResolvedValue(extra.idCheck ?? null) },
    vendorProfile: { findUnique: jest.fn().mockResolvedValue(extra.vendor ?? null) },
    eventPlannerProfile: { findUnique: jest.fn().mockResolvedValue(extra.planner ?? null) },
    vendorListing: { count: jest.fn().mockResolvedValue(extra.listings ?? 0) },
    vendorContract: { count: jest.fn().mockResolvedValue(extra.contracts ?? 0) },
    event: { count: jest.fn().mockResolvedValue(extra.events ?? 0) },
  };
  return { service: new OnboardingService(prisma), prisma };
}
const stateOf = (data: any) => Object.fromEntries(data.steps.map((s: any) => [s.key, s.state]));
const now = new Date();

beforeEach(() => jest.clearAllMocks());

describe('OnboardingService.get', () => {
  it('a new customer gets their steps and the intro popup', async () => {
    const { service } = setup({});
    const { data } = await service.get('u1');
    expect(data!.role).toBe('CUSTOMER');
    expect(data!.steps.map((s) => s.key)).toEqual(['verify_email', 'verify_id', 'add_card', 'profile_photo', 'add_location']);
    expect(data).toMatchObject({ completed: 0, total: 5, complete: false, popup: 'intro', visible: true });
    expect(listCards).not.toHaveBeenCalled(); // no Stripe customer yet
  });

  it('ticks off what the customer has done', async () => {
    listCards.mockResolvedValue([{ id: 'pm_1' }]);
    const { service } = setup({ email_verified_at: now, billing_id: 'cus_1', avatar: 'a.jpg', city: 'Austin', onboarding_seen: { CUSTOMER: { intro: 'x' } } });
    const { data } = await service.get('u1');
    expect(stateOf(data)).toEqual({ verify_email: 'done', verify_id: 'todo', add_card: 'done', profile_photo: 'done', add_location: 'done' });
    expect(data).toMatchObject({ completed: 4, popup: null, visible: true });
  });

  it('an ID under review is pending; a turned-down one says why', async () => {
    const pending = setup({}, { idCheck: { status: 'PENDING' } });
    const a = (await pending.service.get('u1')).data!.steps.find((s) => s.key === 'verify_id')!;
    expect(a).toMatchObject({ state: 'pending', note: expect.stringContaining('In review') });
    const rejected = setup({}, { idCheck: { status: 'REJECTED', rejection_reason: 'Photo was blurry' } });
    const b = (await rejected.service.get('u1')).data!.steps.find((s) => s.key === 'verify_id')!;
    expect(b).toMatchObject({ state: 'todo', note: 'Not approved: Photo was blurry' });
  });

  it("Stripe being down doesn't break the checklist", async () => {
    listCards.mockRejectedValue(new Error('timeout'));
    const { service } = setup({ billing_id: 'cus_1' });
    expect(stateOf((await service.get('u1')).data).add_card).toBe('todo');
  });

  it('vendor steps: licence in review, first package, payouts, contract, branding', async () => {
    retrieveAccount.mockResolvedValue({ details_submitted: true });
    const { service } = setup(
      { type: 'VENDOR', email_verified_at: now, id_verified_at: now, stripe_connect_id: 'acct_1' },
      { vendor: { license_photo: ['l.jpg'], license_status: 'PENDING', logo: 'logo.png', banner: null }, listings: 1, contracts: 1 },
    );
    const { data } = await service.get('u1');
    expect(data!.steps.map((s) => s.key)).toEqual(['verify_email', 'business_license', 'verify_id', 'first_package', 'payouts', 'booking_contract', 'shop_branding']);
    expect(stateOf(data)).toEqual({
      verify_email: 'done',
      business_license: 'pending',
      verify_id: 'done',
      first_package: 'done',
      payouts: 'done',
      booking_contract: 'done',
      shop_branding: 'done',
    });
    expect(data!.complete).toBe(false); // waiting on the licence review
  });

  it('a vendor who started Stripe but did not finish has payouts to do', async () => {
    retrieveAccount.mockResolvedValue({ details_submitted: false });
    const { service } = setup({ type: 'VENDOR', stripe_connect_id: 'acct_1' }, { vendor: { license_photo: [], license_status: 'PENDING' } });
    const s = stateOf((await service.get('u1')).data);
    expect(s.payouts).toBe('todo');
    expect(s.business_license).toBe('todo');
  });

  it('only counts published packages', async () => {
    const { service, prisma } = setup({ type: 'VENDOR' }, { vendor: { license_photo: [] } });
    await service.get('u1');
    expect(prisma.vendorListing.count).toHaveBeenCalledWith({ where: { vendor_id: 'u1', status: 'ACTIVE', deleted_at: null } });
  });

  it('planner steps', async () => {
    const { service } = setup(
      { type: 'EVENT_PLANNER', onboarding_seen: { EVENT_PLANNER: { intro: 'x' } } },
      { planner: { business_name: 'Bloom Events', bio: '  ', license_photo: [], license_status: 'APPROVED' }, events: 2 },
    );
    const { data } = await service.get('u1');
    expect(stateOf(data)).toEqual({
      verify_email: 'todo',
      planner_profile: 'todo', // bio is blank
      business_license: 'done',
      verify_id: 'todo',
      add_card: 'todo',
      first_event: 'done',
    });
  });

  it('shows the "all set" popup once everything is done, then goes away', async () => {
    listCards.mockResolvedValue([{ id: 'pm_1' }]);
    const done = { email_verified_at: now, id_verified_at: now, billing_id: 'cus_1', avatar: 'a.jpg', location: 'Austin, TX' };
    const before = setup({ ...done, onboarding_seen: { CUSTOMER: { intro: 'x' } } });
    expect((await before.service.get('u1')).data).toMatchObject({ complete: true, popup: 'complete', visible: true });
    const after = setup({ ...done, onboarding_seen: { CUSTOMER: { intro: 'x', complete: 'y' } } });
    expect((await after.service.get('u1')).data).toMatchObject({ complete: true, popup: null, visible: false });
  });

  it('accounts that were already set up before the checklist see no popup', async () => {
    listCards.mockResolvedValue([{ id: 'pm_1' }]);
    const { service } = setup({ email_verified_at: now, id_verified_at: now, billing_id: 'cus_1', avatar: 'a.jpg', location: 'Austin' });
    expect((await service.get('u1')).data).toMatchObject({ complete: true, popup: null, visible: false });
  });

  it('each role has its own popups: adding a role shows its intro', async () => {
    const { service } = setup({ type: 'VENDOR', onboarding_seen: { CUSTOMER: { intro: 'x', complete: 'y' } } }, { vendor: { license_photo: [] } });
    expect((await service.get('u1')).data!.popup).toBe('intro');
  });

  it('website customers (stored as CLIENT) get the customer checklist, and an address counts as their city', async () => {
    const { service } = setup({ type: 'CLIENT', address: 'Austin, TX' });
    const { data } = await service.get('u1');
    expect(data!.role).toBe('CUSTOMER');
    expect(stateOf(data).add_location).toBe('done');
  });

  it('admins have no checklist', async () => {
    const { service } = setup({ type: 'ADMIN' });
    expect((await service.get('u1')).data).toBeNull();
  });
});

describe('OnboardingService.markSeen', () => {
  it('records the popup for the role in use and keeps other roles', async () => {
    const { service, prisma } = setup({ type: 'VENDOR', onboarding_seen: { CUSTOMER: { intro: 'c' } } });
    await service.markSeen('u1', 'intro');
    const seen = prisma.user.update.mock.calls[0][0].data.onboarding_seen;
    expect(seen.CUSTOMER).toEqual({ intro: 'c' });
    expect(seen.VENDOR.intro).toEqual(expect.any(String));
  });

  it("doesn't move an existing date, and finishing also counts as the intro", async () => {
    const { service, prisma } = setup({ onboarding_seen: { CUSTOMER: { complete: 'first' } } });
    await service.markSeen('u1', 'complete');
    expect(prisma.user.update.mock.calls[0][0].data.onboarding_seen.CUSTOMER).toEqual({ complete: 'first', intro: 'first' });
  });

  it('CLIENT accounts record under CUSTOMER', async () => {
    const { service, prisma } = setup({ type: 'CLIENT' });
    await service.markSeen('u1', 'intro');
    expect(Object.keys(prisma.user.update.mock.calls[0][0].data.onboarding_seen)).toEqual(['CUSTOMER']);
  });

  it('refuses unknown kinds', async () => {
    const { service } = setup({});
    await expect(service.markSeen('u1', 'other')).rejects.toBeInstanceOf(BadRequestException);
  });
});
