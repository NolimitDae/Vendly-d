import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AddOnKind, AddOnPriceUnit, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { BulkAttachDto, CreateAddOnDto, UpdateAddOnDto } from './dto/add-ons.dto';
import { AddOnLine, EventInput, PricingError, priceAddOn, unitPriceText } from './pricing';

/** At most this many add-ons and fees on one package. */
export const MAX_PER_LISTING = 40;

type AddOnRow = Prisma.VendorAddOnGetPayload<{}>;

/** Ready-made ideas a vendor can start from (they still set their own price). */
export const SUGGESTIONS: Record<AddOnKind, { name: string; price_unit: AddOnPriceUnit; description?: string }[]> = {
  ADD_ON: [
    { name: 'Extra hour', price_unit: AddOnPriceUnit.FIXED },
    { name: 'Additional server', price_unit: AddOnPriceUnit.PER_HOUR, description: 'One more server for your event' },
    { name: 'Bartender', price_unit: AddOnPriceUnit.PER_HOUR },
    { name: 'Dessert table', price_unit: AddOnPriceUnit.PER_PERSON },
    { name: 'Appetizers', price_unit: AddOnPriceUnit.PER_PERSON },
    { name: 'Plates, cutlery and napkins', price_unit: AddOnPriceUnit.PER_PERSON },
    { name: 'Delivery and setup', price_unit: AddOnPriceUnit.FIXED },
    { name: 'Rush delivery', price_unit: AddOnPriceUnit.FIXED },
    { name: 'Extra item', price_unit: AddOnPriceUnit.PER_ITEM },
  ],
  FEE: [
    { name: 'Late return', price_unit: AddOnPriceUnit.PER_HOUR, description: 'Rented items returned after the agreed time' },
    { name: 'Overtime', price_unit: AddOnPriceUnit.PER_HOUR, description: 'Staying past the booked end time' },
    { name: 'Cleaning', price_unit: AddOnPriceUnit.FIXED, description: 'Items or venue left needing extra cleaning' },
    { name: 'Damaged or missing item', price_unit: AddOnPriceUnit.PER_ITEM },
    { name: 'Extra travel', price_unit: AddOnPriceUnit.FIXED },
    { name: 'Cake cutting', price_unit: AddOnPriceUnit.PER_PERSON },
  ],
};

export function formatAddOn(a: AddOnRow & { listings?: { listing_id: string }[] }) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    description: a.description,
    price: Number(a.price),
    price_unit: a.price_unit,
    price_text: unitPriceText(a.price, a.price_unit),
    max_quantity: a.max_quantity,
    in_library: a.in_library,
    ...(a.listings ? { listing_ids: a.listings.map((l) => l.listing_id) } : {}),
  };
}

@Injectable()
export class AddOnsService {
  constructor(private prisma: PrismaService) {}

  // ─── Vendor library ────────────────────────────────────────────────────────

  async list(vendorId: string, kind?: AddOnKind, listingId?: string) {
    const rows = await this.prisma.vendorAddOn.findMany({
      where: {
        vendor_id: vendorId,
        deleted_at: null,
        ...(kind ? { kind } : {}),
        // the library, plus this package's own custom ones
        OR: [{ in_library: true }, ...(listingId ? [{ listings: { some: { listing_id: listingId } } }] : [])],
      },
      include: { listings: { select: { listing_id: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return { success: true, data: rows.map(formatAddOn) };
  }

  suggestions(kind?: AddOnKind) {
    return { success: true, data: kind ? SUGGESTIONS[kind] : SUGGESTIONS };
  }

  /** The vendor's own active packages among `ids`; anything else is refused. */
  private async ownListings(vendorId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const found = await this.prisma.vendorListing.findMany({ where: { id: { in: unique }, vendor_id: vendorId, deleted_at: null }, select: { id: true } });
    if (found.length !== unique.length) throw new ForbiddenException('One of those packages isn’t yours.');
    return unique;
  }

  private async ownAddOns(vendorId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.vendorAddOn.findMany({ where: { id: { in: unique }, vendor_id: vendorId, deleted_at: null } });
    if (found.length !== unique.length) throw new NotFoundException('One of those add-ons wasn’t found.');
    return found;
  }

  private checkUnit(unit: AddOnPriceUnit, max?: number | null) {
    if (max != null && max > 0 && unit !== AddOnPriceUnit.PER_ITEM) throw new BadRequestException('A maximum quantity only applies to items priced each.');
  }

  private async assertRoom(listingIds: string[], adding: number) {
    if (!listingIds.length) return;
    const counts = await this.prisma.listingAddOn.groupBy({ by: ['listing_id'], where: { listing_id: { in: listingIds }, add_on: { deleted_at: null } }, _count: { _all: true } });
    const full = counts.find((c) => c._count._all + adding > MAX_PER_LISTING);
    if (full) throw new BadRequestException(`A package can have up to ${MAX_PER_LISTING} add-ons and fees.`);
  }

  async create(vendorId: string, dto: CreateAddOnDto) {
    const kind = dto.kind ?? AddOnKind.ADD_ON;
    const unit = dto.price_unit ?? AddOnPriceUnit.FIXED;
    this.checkUnit(unit, dto.max_quantity);
    const listingIds = await this.ownListings(vendorId, dto.listing_ids ?? []);
    const inLibrary = dto.in_library ?? true;
    if (!inLibrary && !listingIds.length) throw new BadRequestException('Choose the package for this custom add-on.');
    await this.assertRoom(listingIds, 1);
    const created = await this.prisma.vendorAddOn.create({
      data: {
        vendor_id: vendorId,
        kind,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        price: dto.price,
        price_unit: unit,
        max_quantity: unit === AddOnPriceUnit.PER_ITEM ? dto.max_quantity || null : null,
        in_library: inLibrary,
        listings: { create: listingIds.map((listing_id) => ({ listing_id })) },
      },
      include: { listings: { select: { listing_id: true } } },
    });
    return { success: true, data: formatAddOn(created) };
  }

  async update(vendorId: string, id: string, dto: UpdateAddOnDto) {
    const [current] = await this.ownAddOns(vendorId, [id]);
    const unit = dto.price_unit ?? current.price_unit;
    const max = dto.max_quantity !== undefined ? dto.max_quantity || null : current.max_quantity;
    this.checkUnit(unit, unit === AddOnPriceUnit.PER_ITEM ? null : dto.max_quantity);
    // bookings keep the name and price they were made with; changes apply from now on
    const updated = await this.prisma.vendorAddOn.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.price !== undefined && { price: dto.price }),
        price_unit: unit,
        max_quantity: unit === AddOnPriceUnit.PER_ITEM ? max : null,
        ...(dto.in_library !== undefined && { in_library: dto.in_library || current.in_library }),
      },
      include: { listings: { select: { listing_id: true } } },
    });
    return { success: true, data: formatAddOn(updated) };
  }

  /** Removes it from every package. Bookings that already include it keep their copy. */
  async remove(vendorId: string, id: string) {
    await this.ownAddOns(vendorId, [id]);
    await this.prisma.$transaction([
      this.prisma.listingAddOn.deleteMany({ where: { add_on_id: id } }),
      this.prisma.vendorAddOn.update({ where: { id }, data: { deleted_at: new Date() } }),
    ]);
    return { success: true };
  }

  /** Adds (or removes) several add-ons to several packages at once. */
  async bulkAttach(vendorId: string, dto: BulkAttachDto) {
    if (!dto.add_on_ids.length || !dto.listing_ids.length) throw new BadRequestException('Choose at least one add-on and one package.');
    await this.ownAddOns(vendorId, dto.add_on_ids);
    const listingIds = await this.ownListings(vendorId, dto.listing_ids);
    const addOnIds = [...new Set(dto.add_on_ids)];
    if (dto.mode === 'remove') {
      const res = await this.prisma.listingAddOn.deleteMany({ where: { listing_id: { in: listingIds }, add_on_id: { in: addOnIds } } });
      return { success: true, data: { removed: res.count } };
    }
    const existing = await this.prisma.listingAddOn.findMany({ where: { listing_id: { in: listingIds }, add_on_id: { in: addOnIds } }, select: { listing_id: true, add_on_id: true } });
    const have = new Set(existing.map((e) => `${e.listing_id}:${e.add_on_id}`));
    const rows = listingIds.flatMap((listing_id) => addOnIds.filter((add_on_id) => !have.has(`${listing_id}:${add_on_id}`)).map((add_on_id) => ({ listing_id, add_on_id })));
    for (const l of listingIds) await this.assertRoom([l], rows.filter((r) => r.listing_id === l).length);
    const res = await this.prisma.listingAddOn.createMany({ data: rows, skipDuplicates: true });
    return { success: true, data: { added: res.count } };
  }

  /** Vendor view of one package's add-ons and fees (library and custom), in order. */
  async forListingAsVendor(vendorId: string, listingId: string) {
    await this.ownListings(vendorId, [listingId]);
    return { success: true, data: await this.forListing(listingId) };
  }

  /** Replaces a package's set of add-ons and fees. Custom ones dropped from it are deleted. */
  async setForListing(vendorId: string, listingId: string, addOnIds: string[]) {
    await this.ownListings(vendorId, [listingId]);
    const ids = [...new Set(addOnIds)];
    if (ids.length > MAX_PER_LISTING) throw new BadRequestException(`A package can have up to ${MAX_PER_LISTING} add-ons and fees.`);
    if (ids.length) await this.ownAddOns(vendorId, ids);
    const before = await this.prisma.listingAddOn.findMany({ where: { listing_id: listingId }, select: { add_on_id: true, add_on: { select: { in_library: true } } } });
    const dropped = before.filter((b) => !ids.includes(b.add_on_id));
    await this.prisma.$transaction(async (tx) => {
      await tx.listingAddOn.deleteMany({ where: { listing_id: listingId, add_on_id: { notIn: ids } } });
      for (const [sort, add_on_id] of ids.entries()) {
        await tx.listingAddOn.upsert({ where: { listing_id_add_on_id: { listing_id: listingId, add_on_id } }, create: { listing_id: listingId, add_on_id, sort }, update: { sort } });
      }
      // a custom add-on lives on its package only; once it's off every package it's gone
      for (const d of dropped.filter((x) => !x.add_on.in_library)) {
        const still = await tx.listingAddOn.count({ where: { add_on_id: d.add_on_id } });
        if (!still) await tx.vendorAddOn.update({ where: { id: d.add_on_id }, data: { deleted_at: new Date() } });
      }
    });
    return { success: true, data: await this.forListing(listingId) };
  }

  // ─── Customers ─────────────────────────────────────────────────────────────

  /** A package's add-ons (customers can pick these) and fees (shown up front), in the vendor's order. */
  async forListing(listingId: string) {
    const links = await this.prisma.listingAddOn.findMany({
      where: { listing_id: listingId, add_on: { deleted_at: null } },
      include: { add_on: true },
      orderBy: [{ sort: 'asc' }, { created_at: 'asc' }],
    });
    const all = links.map((l) => formatAddOn(l.add_on));
    return { add_ons: all.filter((a) => a.kind === AddOnKind.ADD_ON), fees: all.filter((a) => a.kind === AddOnKind.FEE) };
  }

  /**
   * Prices the add-ons a customer picked for a package. Only add-ons on that package can be chosen;
   * fees can't be. Throws a 400 with a message the customer can act on.
   */
  async priceSelection(listingId: string, picks: { add_on_id: string; quantity?: number }[] | undefined, ev: EventInput) {
    const { add_ons, fees } = await this.forListing(listingId);
    const lines: (AddOnLine & { description: string | null })[] = [];
    const seen = new Set<string>();
    for (const p of picks ?? []) {
      if (seen.has(p.add_on_id)) continue;
      seen.add(p.add_on_id);
      const a = add_ons.find((x) => x.id === p.add_on_id);
      if (!a) throw new BadRequestException('One of the add-ons you picked is no longer offered. Please review your choices.');
      try {
        lines.push({ ...priceAddOn(a, ev, p.quantity), description: a.description });
      } catch (e) {
        if (e instanceof PricingError) throw new BadRequestException(e.message);
        throw e;
      }
    }
    return { lines, fees };
  }
}
