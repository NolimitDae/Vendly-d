import { SavedListingsService } from './saved-listings.service';
import { liveListingWhere } from '../marketplace/marketplace.service';

describe('SavedListingsService', () => {
  let prisma: any;
  let service: SavedListingsService;

  beforeEach(() => {
    prisma = {
      savedListing: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', listing_id: 'l1', listing: { id: 'l1', title: 'Wedding buffet', lat: 33.7, lng: -84.4, geocoded_at: new Date() } },
        ]),
      },
    };
    service = new SavedListingsService(prisma);
  });

  it('lists only saved packages that are live on the marketplace, without their position', async () => {
    const res = await service.findAll('me');
    expect(prisma.savedListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'me', listing: liveListingWhere() } }),
    );
    expect(res.data[0].listing).toEqual({ id: 'l1', title: 'Wedding buffet' });
  });

  it('gives the ids of live saved packages only', async () => {
    await expect(service.getSavedIds('me')).resolves.toEqual({ success: true, data: ['l1'] });
    expect(prisma.savedListing.findMany).toHaveBeenCalledWith({
      where: { user_id: 'me', listing: liveListingWhere() },
      select: { listing_id: true },
    });
  });

  it('the live filter hides drafts, removed packages and suspended or deleted vendors', () => {
    expect(liveListingWhere()).toEqual({
      status: 'ACTIVE',
      deleted_at: null,
      vendor: { deleted_at: null, OR: [{ status: null }, { status: { not: 0 } }] },
    });
  });
});
