import { VendorContractStatus } from 'prisma/generated/client';
import { contractRule, pickContractForListing } from './contract-scope';
import { VendorContractsService } from './vendor-contracts.service';

const all = (version: number) => ({ id: `all-${version}`, version, applies_to_all: true, category_ids: [], listings: [] });
const forListing = (version: number, listingId: string) => ({
  id: `l-${version}`,
  version,
  applies_to_all: false,
  category_ids: [],
  listings: [{ listing_id: listingId }],
});
const forCategory = (version: number, ...categoryIds: string[]) => ({
  id: `c-${version}`,
  version,
  applies_to_all: false,
  category_ids: categoryIds,
  listings: [],
});

describe('which contract a package uses', () => {
  it('a contract naming the package beats one for its category, which beats "all packages"', () => {
    const contracts = [all(5), forCategory(4, 'cat-photo'), forListing(1, 'pkg-1')];
    expect(pickContractForListing(contracts, 'pkg-1', 'cat-photo')?.id).toBe('l-1');
    expect(pickContractForListing(contracts, 'pkg-2', 'cat-photo')?.id).toBe('c-4');
    expect(pickContractForListing(contracts, 'pkg-3', 'cat-music')?.id).toBe('all-5');
  });

  it('covers packages added to the category later (matched by category, not a saved list)', () => {
    expect(pickContractForListing([forCategory(1, 'cat-photo', 'cat-video')], 'brand-new', 'cat-video')?.id).toBe('c-1');
  });

  it('picks the newest version when two contracts use the same rule', () => {
    expect(pickContractForListing([forCategory(2, 'cat-photo'), forCategory(3, 'cat-photo')], 'pkg', 'cat-photo')?.id).toBe('c-3');
  });

  it('returns nothing when no contract covers the package', () => {
    expect(pickContractForListing([forListing(1, 'other'), forCategory(2, 'cat-music')], 'pkg', 'cat-photo')).toBeNull();
    expect(pickContractForListing([forCategory(2, 'cat-music')], 'pkg', null)).toBeNull();
    expect(pickContractForListing([], 'pkg', 'cat')).toBeNull();
  });

  it('only "all packages" applies when there is no package', () => {
    expect(contractRule(forListing(1, 'pkg'), null, null)).toBeNull();
    expect(contractRule(all(1), null, null)).toBe(3);
  });

  it('treats a missing category list as empty', () => {
    expect(contractRule({ version: 1, applies_to_all: false, category_ids: null }, 'pkg', 'cat')).toBeNull();
  });
});

describe('VendorContractsService.resolveForListing', () => {
  it('loads the package category and returns the category contract without its assignments', async () => {
    const prisma: any = {
      vendorListing: { findUnique: jest.fn().mockResolvedValue({ category_id: 'cat-photo' }) },
      vendorContract: {
        findMany: jest.fn().mockResolvedValue([
          { ...all(3), template: null },
          { ...forCategory(2, 'cat-photo'), template: null },
        ]),
      },
    };
    const service = new VendorContractsService(prisma);
    const vc: any = await service.resolveForListing('v1', 'pkg-1');
    expect(vc.id).toBe('c-2');
    expect(vc.listings).toBeUndefined();
    expect(prisma.vendorContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendor_id: 'v1', status: VendorContractStatus.ACTIVE } }),
    );
  });
});

describe('saving a contract for categories', () => {
  const VALUES = { business_legal_name: 'Vera', business_address: '1 Way', cancellation_policy: 'moderate', governing_law: 'Texas' };
  const setup = (others: any[]) => {
    const tx: any = {
      vendorContract: {
        findFirst: jest.fn().mockResolvedValue({ version: 4 }),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new', ...data, listings: [] })),
        findMany: jest.fn().mockResolvedValue(others),
        update: jest.fn(),
      },
      vendorContractListing: { deleteMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    };
    const prisma: any = {
      $transaction: (fn: any) => fn(tx),
      serviceCategory: { count: jest.fn().mockResolvedValue(1) },
      vendorListing: { count: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Vera', vendorProfile: { business_name: 'Vera Photo' } }),
      },
      contractTemplate: { findFirst: jest.fn().mockResolvedValue({ id: 't1' }) },
    };
    return { tx, prisma, service: new VendorContractsService(prisma) };
  };

  it('stores the categories and takes them over from an older category contract', async () => {
    const { tx, service } = setup([
      { id: 'old', applies_to_all: false, category_ids: ['cat-photo', 'cat-video'] },
      { id: 'everything', applies_to_all: true, category_ids: [] },
    ]);
    await service.createDefault('v1', {
      category: 'GENERAL',
      field_values: VALUES,
      applies_to_all: false,
      category_ids: ['cat-photo'],
    } as any);
    expect(tx.vendorContract.create.mock.calls[0][0].data).toMatchObject({ applies_to_all: false, category_ids: ['cat-photo'] });
    // the old one keeps its other category, and "all packages" stays as the fallback
    expect(tx.vendorContract.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: { category_ids: ['cat-video'] } });
    expect(tx.vendorContract.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'everything' } }));
  });

  it('archives an older contract once it covers nothing', async () => {
    const { tx, service } = setup([{ id: 'old', applies_to_all: false, category_ids: ['cat-photo'] }]);
    await service.createDefault('v1', {
      category: 'GENERAL',
      field_values: VALUES,
      applies_to_all: false,
      category_ids: ['cat-photo'],
    } as any);
    expect(tx.vendorContract.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: { status: VendorContractStatus.ARCHIVED } });
  });

  it('needs a listing or a category when it is not for all listings', async () => {
    const { service } = setup([]);
    await expect(
      service.createDefault('v1', { category: 'GENERAL', field_values: VALUES, applies_to_all: false } as any),
    ).rejects.toThrow('Choose at least one listing or category');
  });

  it('refuses categories that do not exist', async () => {
    const { prisma, service } = setup([]);
    prisma.serviceCategory.count.mockResolvedValue(0);
    await expect(
      service.createDefault('v1', { category: 'GENERAL', field_values: VALUES, applies_to_all: false, category_ids: ['gone'] } as any),
    ).rejects.toThrow('categories no longer exist');
  });
});
