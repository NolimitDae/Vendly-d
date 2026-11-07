import { AddOnsService } from './add-ons.service';

const prisma: any = {
  vendorListing: { findMany: jest.fn() },
  vendorAddOn: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  listingAddOn: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a1', vendor_id: 'v1', kind: 'ADD_ON', name: 'Extra hour', description: null, price: 50, price_unit: 'FIXED', max_quantity: null, in_library: true, deleted_at: null, listings: [{ listing_id: 'l1' }], ...over,
});

describe('AddOnsService', () => {
  let service: AddOnsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vendorListing.findMany.mockResolvedValue([{ id: 'l1' }]);
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    service = new AddOnsService(prisma);
  });

  it('saves an add-on made in a package to the library too, even when asked for "this package only"', async () => {
    prisma.vendorAddOn.create.mockResolvedValue(row());
    const res = await service.create('v1', { name: ' Extra hour ', price: 50, in_library: false, listing_ids: ['l1'] } as any);
    expect(prisma.vendorAddOn.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ in_library: true, name: 'Extra hour', listings: { create: [{ listing_id: 'l1' }] } }) }));
    expect(res.data).toMatchObject({ id: 'a1', in_library: true, listing_ids: ['l1'] });
  });

  it('keeps a library add-on when it is taken off a package', async () => {
    prisma.vendorAddOn.findMany.mockResolvedValue([row({ id: 'a2' })]);
    prisma.listingAddOn.findMany
      .mockResolvedValueOnce([{ add_on_id: 'a1', add_on: { in_library: true } }, { add_on_id: 'a2', add_on: { in_library: true } }])
      .mockResolvedValue([]);
    await service.setForListing('v1', 'l1', ['a2']);
    expect(prisma.listingAddOn.deleteMany).toHaveBeenCalledWith({ where: { listing_id: 'l1', add_on_id: { notIn: ['a2'] } } });
    expect(prisma.vendorAddOn.update).not.toHaveBeenCalled();
  });

  it('lets the vendor edit an add-on, for every package using it', async () => {
    prisma.vendorAddOn.findMany.mockResolvedValue([row()]);
    prisma.vendorAddOn.update.mockResolvedValue(row({ name: 'Extra 2 hours', price: 90 }));
    const res = await service.update('v1', 'a1', { name: 'Extra 2 hours', price: 90 } as any);
    expect(prisma.vendorAddOn.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a1' }, data: expect.objectContaining({ name: 'Extra 2 hours', price: 90 }) }));
    expect(res.data).toMatchObject({ name: 'Extra 2 hours', price: 90 });
  });
});
