import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OptionPriceMode, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { packageUnit, PricingError } from './pricing';
import { cleanOptionGroups, OfferedGroup, OptionChoice, OptionGroupInput, optionPriceText, OptionSetupError, priceOptionChoices, selectionText, UnitBasis } from './package-options';

/** Customizations with their options, in the vendor's order (for `include`). */
export const OPTION_GROUPS_INCLUDE = {
  orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
  include: { options: { orderBy: [{ sort: 'asc' }, { created_at: 'asc' }] } },
} satisfies Prisma.VendorListing$option_groupsArgs;

type GroupRow = Prisma.ListingOptionGroupGetPayload<{ include: { options: true } }>;

/** A package's customizations for the apps: each with its options and how their upcharge reads. */
export function formatOptionGroups(groups: GroupRow[] | null | undefined, priceUnit?: string | null) {
  const unit = packageUnit(priceUnit);
  return (groups ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    required: g.required,
    max_select: g.max_select,
    selection_text: selectionText(g.max_select),
    options: g.options.map((o) => ({
      id: o.id,
      label: o.label,
      price: Number(o.price),
      price_mode: o.price_mode,
      price_text: optionPriceText(o.price, o.price_mode, unit),
    })),
  }));
}

@Injectable()
export class PackageOptionsService {
  constructor(private prisma: PrismaService) {}

  private async ownListing(vendorId: string, listingId: string) {
    const l = await this.prisma.vendorListing.findFirst({ where: { id: listingId, deleted_at: null }, select: { id: true, vendor_id: true, price_unit: true } });
    if (!l) throw new NotFoundException('Listing not found');
    if (l.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    return l;
  }

  private load(listingId: string) {
    return this.prisma.listingOptionGroup.findMany({ where: { listing_id: listingId }, ...OPTION_GROUPS_INCLUDE });
  }

  async forListingAsVendor(vendorId: string, listingId: string) {
    const l = await this.ownListing(vendorId, listingId);
    return { success: true, data: formatOptionGroups(await this.load(listingId), l.price_unit) };
  }

  /**
   * Replaces a package's customizations with `input`, in that order. Ones sent with their id are
   * updated in place (so a customer mid-booking keeps their choice); the rest are created, and any
   * not sent are removed. Bookings keep their own copy of what was chosen, so they never change.
   */
  async setForListing(vendorId: string, listingId: string, input: OptionGroupInput[]) {
    const l = await this.ownListing(vendorId, listingId);
    let groups;
    try {
      groups = cleanOptionGroups(input);
    } catch (e) {
      if (e instanceof OptionSetupError) throw new BadRequestException(e.message);
      throw e;
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.listingOptionGroup.findMany({ where: { listing_id: listingId }, include: { options: { select: { id: true } } } });
      const keptGroups = new Set<string>();
      for (const [sort, g] of groups.entries()) {
        const current = g.id ? existing.find((e) => e.id === g.id) : undefined;
        const data = { title: g.title, required: g.required, max_select: g.max_select, sort };
        const groupId = current
          ? (await tx.listingOptionGroup.update({ where: { id: current.id }, data, select: { id: true } })).id
          : (await tx.listingOptionGroup.create({ data: { ...data, listing_id: listingId }, select: { id: true } })).id;
        keptGroups.add(groupId);
        const keptOptions: string[] = [];
        for (const [i, o] of g.options.entries()) {
          const odata = { label: o.label, price: o.price, price_mode: o.price_mode as OptionPriceMode, sort: i };
          const mine = !!o.id && !!current?.options.some((x) => x.id === o.id);
          const id = mine
            ? (await tx.listingOption.update({ where: { id: o.id! }, data: odata, select: { id: true } })).id
            : (await tx.listingOption.create({ data: { ...odata, group_id: groupId }, select: { id: true } })).id;
          keptOptions.push(id);
        }
        await tx.listingOption.deleteMany({ where: { group_id: groupId, id: { notIn: keptOptions } } });
      }
      await tx.listingOptionGroup.deleteMany({ where: { listing_id: listingId, id: { notIn: [...keptGroups] } } });
    });
    return { success: true, data: formatOptionGroups(await this.load(listingId), l.price_unit) };
  }

  /** The package's customizations, ready to check a booking against. */
  async offered(listingId: string): Promise<OfferedGroup[]> {
    const rows = await this.load(listingId);
    return rows.map((g) => ({ id: g.id, title: g.title, required: g.required, max_select: g.max_select, options: g.options.map((o) => ({ id: o.id, label: o.label, price: o.price, price_mode: o.price_mode })) }));
  }

  /** Checks and prices a customer's choices for a package. Throws a 400 the customer can act on. */
  async priceChoices(listingId: string, choices: OptionChoice[] | undefined, basis: UnitBasis) {
    const offered = await this.offered(listingId);
    try {
      return priceOptionChoices(offered, choices, basis);
    } catch (e) {
      if (e instanceof PricingError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
