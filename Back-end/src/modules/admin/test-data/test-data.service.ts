import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BookingStatus, ListingStatus, RentalItemStatus, UserType, VendorContractStatus } from 'prisma/generated/client';
import appConfig from 'src/config/app.config';
import { withJobLock } from 'src/common/helper/job-lock';
import { PrismaService } from 'src/prisma/prisma.service';
import { geocode } from 'src/modules/geo/geo';
import { VendorListingService } from 'src/modules/vendor/listing/listing.service';
import { CreateVendorListingDto } from 'src/modules/vendor/listing/dto/create-listing.dto';
import { VendorContractsService } from 'src/modules/contracts/vendor-contracts.service';
import { AddOnsService } from 'src/modules/add-ons/add-ons.service';
import { RentalsService } from 'src/modules/rentals/rentals.service';
import { BookingService } from 'src/modules/booking/booking.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { parseWorkingHours } from 'src/modules/vendor/working-hours';
import { placeholderPng } from './placeholder-image';
import { CATALOG, DemoCategory, DemoVendor, fallbackCategory, workingHoursFor } from './test-data-catalog';
import { generatePassword, guessTimeZone, spreadAround, testEmail, testHandle } from './test-data-helpers';

export interface CreateTestDataInput {
  /** "Atlanta, GA"; left out, the place the test vendors already are */
  near?: string;
  /** set when the place was picked from address suggestions */
  lat?: number;
  lng?: number;
  /** give every test vendor a new shared password */
  reset_password?: boolean;
}

type Category = { id: string; name: string; sub_categories: { id: string; name: string }[] };
type Slot = { category: Category; spec: DemoCategory; vendor: DemoVendor; n: number; email: string; index: number };
type Place = { label: string; lat: number; lng: number; timezone: string };

/** Bookings that aren't finished yet; removing test data cancels them first. */
const OPEN_STATES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];
/** A generated photo in the shape an upload arrives in, so it goes through the normal upload checks. */
const photoFile = (buffer: Buffer) => ({ buffer, originalname: 'photo.png', mimetype: 'image/png', size: buffer.length }) as Express.Multer.File;

/**
 * Test vendors and packages in the live app (Admin -> Settings -> Test vendors), so the owner can
 * try Vendly end to end. They look like real vendors in search, with a "Test" badge. Everything is
 * made through the normal services (packages, contracts, add-ons, rentals), and removal goes
 * through the normal cancel and account deletion paths.
 */
@Injectable()
export class TestDataService {
  private readonly logger = new Logger(TestDataService.name);

  constructor(
    private prisma: PrismaService,
    private listings: VendorListingService,
    private contracts: VendorContractsService,
    private addOns: AddOnsService,
    private rentals: RentalsService,
    private bookings: BookingService,
    private auth: AuthService,
  ) {}

  /** The test vendors there are now. */
  async status() {
    const users = await this.prisma.user.findMany({
      where: { is_test: true, deleted_at: null },
      orderBy: { email: 'asc' },
      select: {
        id: true,
        email: true,
        vendorProfile: { select: { business_name: true, handle: true } },
        _count: { select: { vendorListings: { where: { deleted_at: null, status: ListingStatus.ACTIVE } } } },
      },
    });
    return {
      success: true,
      data: {
        accounts: users.map((u) => this.account(u)),
        counts: { vendors: users.length, packages: users.reduce((n, u) => n + u._count.vendorListings, 0) },
      },
    };
  }

  private account(u: { email: string | null; vendorProfile?: { business_name: string | null; handle: string | null } | null; _count?: { vendorListings: number } }) {
    const handle = u.vendorProfile?.handle ?? null;
    return {
      email: u.email,
      business_name: u.vendorProfile?.business_name ?? null,
      shop_url: handle ? `${appConfig().app.client_app_url}/v/${handle}` : null,
      ...(u._count ? { packages: u._count.vendorListings } : {}),
    };
  }

  /** Creates what's missing. Running it again only fills gaps. */
  async create(input: CreateTestDataInput) {
    const result = await withJobLock(this.prisma, 'admin-test-data', () => this.fill(input));
    if (result === undefined) throw new ConflictException('Test vendors are being created or removed right now. Try again in a minute.');
    return result;
  }

  /** Cancels test vendors' open bookings, removes their packages and deletes the accounts. */
  async remove() {
    const result = await withJobLock(this.prisma, 'admin-test-data', () => this.removeAll());
    if (result === undefined) throw new ConflictException('Test vendors are being created or removed right now. Try again in a minute.');
    return result;
  }

  private async place(input: CreateTestDataInput): Promise<Place> {
    const label = input.near?.trim();
    if (!label) {
      // no place given (e.g. only resetting the password): where the test vendors already are
      const there = await this.prisma.vendorListing.findFirst({
        where: { deleted_at: null, location: { not: null }, lat: { not: null }, lng: { not: null }, vendor: { is_test: true, deleted_at: null } },
        select: { location: true, lat: true, lng: true },
      });
      if (!there) throw new BadRequestException('Enter where the test vendors should be, like Atlanta, GA.');
      const point = { lat: there.lat!, lng: there.lng! };
      return { label: there.location!, ...point, timezone: guessTimeZone(there.location!, point) };
    }
    let point = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null;
    if (!point) {
      try {
        point = await geocode(label);
      } catch (err) {
        this.logger.warn(`Geocoding "${label}" failed: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Couldn’t look up that place right now. Pick it from the suggestions, or try again in a minute.');
      }
      if (!point) throw new BadRequestException(`We couldn’t find “${label}”. Try a city and state, like Atlanta, GA.`);
    }
    return { label, ...point, timezone: guessTimeZone(label, point) };
  }

  /** Every category's planned vendors, numbered within the category. */
  private slots(categories: Category[]): Slot[] {
    let index = 0;
    return categories.flatMap((category, ci) => {
      const spec = CATALOG[category.name] ?? fallbackCategory(category.name, ci);
      return spec.vendors.map((vendor, i) => ({ category, spec, vendor, n: i + 1, email: testEmail(category.name, i + 1), index: index++ }));
    });
  }

  async fill(input: CreateTestDataInput) {
    const place = await this.place(input);
    const categories = await this.prisma.serviceCategory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, sub_categories: { select: { id: true, name: true } } } });
    if (!categories.length) throw new BadRequestException('There are no service categories yet. Add some in Admin → Services first.');
    // rentals are on unless an admin switched the flag off
    const rentalsFlag = await this.prisma.featureFlag.findUnique({ where: { key: 'rentals' }, select: { enabled: true } });
    const rentalsOn = rentalsFlag?.enabled !== false;

    const slots = this.slots(categories);
    const existing = await this.prisma.user.findMany({ where: { email: { in: slots.map((s) => s.email) }, deleted_at: null }, select: { id: true, email: true, is_test: true } });
    const byEmail = new Map(existing.map((u) => [u.email, u]));
    const missing = slots.filter((s) => !byEmail.has(s.email));
    // one shared password: a new one when accounts are created (and then for all of them), or when asked
    const password = missing.length || input.reset_password ? generatePassword() : null;
    const hash = password ? await bcrypt.hash(password, appConfig().security.salt) : null;

    const counts = { vendors_created: 0, packages_created: 0, add_ons_created: 0, contracts_created: 0, rental_items_created: 0 };
    const skipped: { email: string; reason: string }[] = [];
    for (const slot of slots) {
      const user = byEmail.get(slot.email);
      // an address someone really signed up with is never taken over
      if (user && !user.is_test) {
        skipped.push({ email: slot.email, reason: 'A real account already uses this address.' });
        continue;
      }
      try {
        const vendorId = user?.id ?? (await this.createVendor(slot, place, hash!));
        if (!user) counts.vendors_created++;
        const made = await this.fillVendor(vendorId, slot, place, rentalsOn);
        counts.packages_created += made.packages;
        counts.add_ons_created += made.addOns;
        counts.contracts_created += made.contract;
        counts.rental_items_created += made.rentals;
      } catch (err) {
        this.logger.error(`Test vendor ${slot.email}: ${(err as Error).message}`);
        skipped.push({ email: slot.email, reason: (err as Error).message });
      }
    }
    if (hash) await this.prisma.user.updateMany({ where: { is_test: true, deleted_at: null }, data: { password: hash } });

    const status = await this.status();
    const reset = !!password && existing.some((u) => u.is_test);
    return {
      success: true,
      message: counts.vendors_created || counts.packages_created ? 'Test vendors are ready.' : 'Nothing was missing: the test vendors were already there.',
      data: {
        ...status.data,
        created: counts,
        skipped,
        near: place.label,
        timezone: place.timezone,
        // shown once: only the hash is stored
        password,
        password_note: password
          ? reset
            ? 'Every test vendor now signs in with this new password. It is shown only once.'
            : 'Every test vendor signs in with this password. It is shown only once.'
          : 'The password hasn’t changed. Use “Reset password” to get a new one.',
      },
    };
  }

  private async createVendor(slot: Slot, place: Place, hash: string) {
    const now = new Date();
    const { vendor } = slot;
    const handle = testHandle(slot.category.name, slot.n);
    let taken = handle ? await this.prisma.vendorProfile.findUnique({ where: { handle }, select: { id: true, user: { select: { is_test: true, deleted_at: true } } } }) : null;
    // a removed test vendor's shop link is free again (account deletion keeps the handle)
    if (taken?.user?.is_test && taken.user.deleted_at) {
      await this.prisma.vendorProfile.update({ where: { id: taken.id }, data: { handle: null } });
      taken = null;
    }
    const hours = parseWorkingHours(workingHoursFor(vendor.hours, place.timezone));
    const user = await this.prisma.user.create({
      data: {
        email: slot.email,
        name: `${vendor.business} (Test)`,
        first_name: 'Test',
        last_name: 'Vendor',
        type: UserType.VENDOR,
        roles: [UserType.VENDOR],
        password: hash,
        is_test: true,
        email_verified_at: now,
        terms_accepted_at: now,
        // the "get set up" checklist and its popups are done
        onboarding_seen: { VENDOR: { intro: now.toISOString(), complete: now.toISOString() } },
        location: place.label,
        address: place.label,
        vendorProfile: {
          create: {
            business_name: `${vendor.business} (Test)`,
            about_me: vendor.about,
            address: place.label,
            // publishing needs a business address
            business_address: place.label,
            business_lat: place.lat,
            business_lng: place.lng,
            handle: taken ? null : handle,
            license_status: 'APPROVED',
            approved_at: now,
            working_hours: 'hours' in hours && hours.hours ? hours.hours : undefined,
          },
        },
      },
      select: { id: true },
    });
    return user.id;
  }

  /** Contract, packages, add-ons and rental items this vendor doesn't have yet. */
  private async fillVendor(vendorId: string, slot: Slot, place: Place, rentalsOn: boolean) {
    const { vendor, category, spec } = slot;
    const made = { packages: 0, addOns: 0, contract: 0, rentals: 0 };
    // test vendors made before a business address was needed to publish get one
    await this.prisma.vendorProfile.updateMany({
      where: { user_id: vendorId, OR: [{ business_address: null }, { business_address: '' }] },
      data: { business_address: place.label, business_lat: place.lat, business_lng: place.lng },
    });

    // a vendor default contract with the cancellation policy, for all their packages
    const contracts = await this.prisma.vendorContract.count({ where: { vendor_id: vendorId, status: VendorContractStatus.ACTIVE } });
    if (!contracts) {
      await this.contracts.createDefault(vendorId, {
        category: vendor.contract.category,
        field_values: {
          business_legal_name: `${vendor.business} (Test)`,
          business_address: place.label,
          cancellation_policy: vendor.contract.policy,
          governing_law: place.label,
          ...vendor.contract.fields,
        },
        applies_to_all: true,
      });
      made.contract = 1;
    }

    const point = spreadAround(place, slot.index);
    const sub = vendor.sub ? category.sub_categories.find((s) => s.name === vendor.sub) : undefined;
    const current = await this.prisma.vendorListing.findMany({ where: { vendor_id: vendorId, deleted_at: null }, select: { id: true, title: true } });
    const packageIds = current.map((l) => l.id);
    for (const pkg of vendor.packages) {
      if (current.some((l) => l.title === pkg.title)) continue;
      const photo = placeholderPng({ title: category.name, subtitle: pkg.title, colors: spec.colors });
      const dto: CreateVendorListingDto = {
        title: pkg.title,
        description: pkg.description,
        price: pkg.price,
        price_unit: pkg.unit,
        status: ListingStatus.ACTIVE,
        location: place.label,
        lat: point.lat,
        lng: point.lng,
        service_radius_miles: vendor.radius || undefined,
        category_id: category.id,
        sub_category_id: sub?.id,
        payment_plan: pkg.plan,
        min_quantity: pkg.min,
        max_quantity: pkg.max,
        included_items: pkg.included,
        min_notice_hours: pkg.notice_hours,
        tags: [],
      } as CreateVendorListingDto;
      const res = await this.listings.create(vendorId, dto, [photoFile(photo)]);
      packageIds.push(res.data.id);
      made.packages++;
    }

    // add-ons and fees from the vendor's library, offered on all their packages
    const library = await this.prisma.vendorAddOn.findMany({ where: { vendor_id: vendorId, deleted_at: null }, select: { id: true, name: true } });
    const existingIds: string[] = [];
    for (const a of vendor.addOns) {
      const have = library.find((l) => l.name === a.name);
      if (have) {
        existingIds.push(have.id);
        continue;
      }
      await this.addOns.create(vendorId, {
        kind: a.kind,
        name: a.name,
        description: a.description,
        price: a.price,
        price_unit: a.unit,
        max_quantity: a.max_quantity,
        listing_ids: packageIds,
        in_library: true,
      });
      made.addOns++;
    }
    if (existingIds.length && packageIds.length) {
      await this.addOns.bulkAttach(vendorId, { add_on_ids: existingIds, listing_ids: packageIds, mode: 'add' });
    }

    if (rentalsOn && vendor.rentals?.length) {
      const items = await this.prisma.rentalItem.findMany({ where: { vendor_id: vendorId, deleted_at: null }, select: { title: true } });
      for (const r of vendor.rentals) {
        if (items.some((i) => i.title === r.title)) continue;
        const photo = placeholderPng({ title: category.name, subtitle: r.title, colors: spec.colors });
        await this.rentals.createItem(
          vendorId,
          { title: r.title, description: r.description, daily_rate: r.daily_rate, deposit_amount: r.deposit, quantity: r.quantity, turnaround_hours: 24, category_id: category.id, location: place.label, status: RentalItemStatus.ACTIVE },
          [photoFile(photo)],
        );
        made.rentals++;
      }
    }
    return made;
  }

  async removeAll() {
    const users = await this.prisma.user.findMany({
      where: { is_test: true, deleted_at: null },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, vendorProfile: { select: { business_name: true } } },
    });
    const cancelled: { booking_id: string; package: string | null; status: string; refunded: number }[] = [];
    const notCancelled: { booking_id: string; package: string | null; reason: string }[] = [];
    const removed: string[] = [];
    const kept: { email: string | null; reason: string }[] = [];
    const wiped: { email: string | null; amount: number }[] = [];

    for (const u of users) {
      // unfinished bookings are cancelled first, through the normal path (refunds go out as usual)
      const open = await this.prisma.booking.findMany({
        where: { OR: [{ vendor_id: u.id }, { customer_id: u.id }], deleted_at: null, status: { in: OPEN_STATES } },
        select: { id: true, status: true, dispute_opened_at: true, dispute_resolved_at: true, listing: { select: { title: true } } },
      });
      for (const b of open) {
        const pkg = b.listing?.title ?? null;
        if (b.dispute_opened_at && !b.dispute_resolved_at) {
          notCancelled.push({ booking_id: b.id, package: pkg, reason: 'It has an open dispute. Resolve it in Admin → Disputes, then remove again.' });
          continue;
        }
        try {
          const res: any = await this.bookings.cancel(b.id, u.id, { reason_code: 'other', note: 'Test data removed' });
          cancelled.push({ booking_id: b.id, package: pkg, status: b.status, refunded: Number(res?.data?.refund_summary?.refund_total ?? 0) });
        } catch (err) {
          notCancelled.push({ booking_id: b.id, package: pkg, reason: (err as Error).message });
        }
      }

      // packages and rental items go first, so nothing of a kept account stays in search
      const listings = await this.prisma.vendorListing.findMany({ where: { vendor_id: u.id, deleted_at: null }, select: { id: true } });
      for (const l of listings) await this.listings.remove(l.id, u.id).catch((err) => this.logger.warn(`Removing package ${l.id}: ${(err as Error).message}`));
      const items = await this.prisma.rentalItem.findMany({ where: { vendor_id: u.id, deleted_at: null }, select: { id: true } });
      for (const i of items) await this.rentals.removeItem(i.id, u.id).catch((err) => this.logger.warn(`Removing rental item ${i.id}: ${(err as Error).message}`));

      // money left in (or owed to) a test vendor's Vendly balance is wiped, never paid out
      const amount = await this.wipeBalance(u.id);
      if (amount) wiped.push({ email: u.email, amount });

      // the normal account deletion: anonymised when bookings or contracts refer to it
      const res = await this.auth.deleteAccount(u.id).catch((err) => ({ success: false, message: (err as Error).message }));
      if (res.success) removed.push(u.email!);
      else kept.push({ email: u.email, reason: res.message });
    }

    return {
      success: true,
      message: users.length ? (kept.length ? 'Some test vendors couldn’t be removed yet.' : 'Test vendors removed.') : 'There were no test vendors to remove.',
      data: {
        removed,
        kept,
        cancelled,
        not_cancelled: notCancelled,
        wiped,
        counts: { removed: removed.length, kept: kept.length, cancelled: cancelled.length, not_cancelled: notCancelled.length, wiped: wiped.length },
      },
    };
  }

  /** Sets a test account's Vendly balance to 0, recording the amount wiped. Returns it (0 when there was none). */
  private async wipeBalance(userId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } });
      const amount = Math.round(Number(user?.balance ?? 0) * 100) / 100;
      if (!amount) return 0;
      // only if the balance hasn't moved since it was read
      const { count } = await tx.user.updateMany({ where: { id: userId, balance: user!.balance! }, data: { balance: 0 } });
      if (!count) return 0;
      await tx.paymentTransaction.create({ data: { user_id: userId, type: 'test_balance_wiped', provider: 'vendly', reference_number: userId, status: 'succeeded', amount, currency: 'usd' } });
      return amount;
    });
  }
}
