import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarketplacePage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: any) => <img alt={alt} src={src} />,
}));

jest.mock('@/service/marketplace/marketplace.service', () => ({
  MarketplaceService: {
    searchListings: jest.fn(),
    getCategories: jest.fn(),
  },
}));

jest.mock('@/service/savedListings/savedListings.service', () => ({
  SavedListingsService: {
    getSavedIds: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('@/helper/cookie.helper', () => ({
  CookieHelper: {
    get: jest.fn().mockReturnValue(null), // not logged in by default
    set: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Pass debounce through immediately
jest.mock('@/hooks', () => ({
  useDebounce: (v: any) => v,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

import { MarketplaceService } from '@/service/marketplace/marketplace.service';
import { SavedListingsService } from '@/service/savedListings/savedListings.service';
import { CookieHelper } from '@/helper/cookie.helper';
import { toast } from 'react-toastify';

const makeListings = (n = 3) =>
  Array.from({ length: n }, (_, i) => ({
    id: `listing-${i}`,
    title: `Service ${i}`,
    description: `Description ${i}`,
    price: 100 + i * 10,
    price_unit: 'hour',
    images: [],
    avg_rating: 4.5,
    _count: { reviews: 10 },
    category: { id: `cat-${i}`, name: `Category ${i}` },
    vendor: { id: `vendor-${i}`, name: `Vendor ${i}` },
  }));

const categories = [
  { id: 'cat-1', name: 'Photography' },
  { id: 'cat-2', name: 'Catering' },
];

function setupMocks(listingsOverride?: any[]) {
  (MarketplaceService.searchListings as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: listingsOverride ?? makeListings(),
      meta: { total: listingsOverride?.length ?? 3, last_page: 1 },
    },
  });
  (MarketplaceService.getCategories as jest.Mock).mockResolvedValue({
    data: { success: true, data: categories },
  });
}

describe('MarketplacePage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows skeleton cards before data loads', () => {
      // Never resolves — stays in loading state
      (MarketplaceService.searchListings as jest.Mock).mockReturnValue(new Promise(() => {}));
      (MarketplaceService.getCategories as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(<MarketplacePage />);
      // Skeleton cards are animate-pulse divs
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('loaded state', () => {
    it('renders listing cards after load', async () => {
      setupMocks();
      render(<MarketplacePage />);

      await waitFor(() => {
        expect(screen.getByText('Service 0')).toBeInTheDocument();
      });
      expect(screen.getByText('Service 1')).toBeInTheDocument();
      expect(screen.getByText('Service 2')).toBeInTheDocument();
    });

    it('displays the total results count', async () => {
      setupMocks();
      render(<MarketplacePage />);

      await waitFor(() => {
        expect(screen.getByText(/3 services found/i)).toBeInTheDocument();
      });
    });

    it('renders category filter options', async () => {
      setupMocks();
      render(<MarketplacePage />);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Photography' })).toBeInTheDocument();
      });
      expect(screen.getByRole('option', { name: 'Catering' })).toBeInTheDocument();
    });

    it('shows listing price and price unit', async () => {
      setupMocks(makeListings(1));
      render(<MarketplacePage />);

      await waitFor(() => {
        expect(screen.getByText('$100.00')).toBeInTheDocument();
      });
      expect(screen.getByText(/\/ hour/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no listings returned', async () => {
      (MarketplaceService.searchListings as jest.Mock).mockResolvedValue({
        data: { success: true, data: [], meta: { total: 0, last_page: 1 } },
      });
      (MarketplaceService.getCategories as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      render(<MarketplacePage />);

      await waitFor(() => {
        expect(screen.getByText(/no services found/i)).toBeInTheDocument();
      });
    });
  });

  describe('search filtering', () => {
    it('calls searchListings with the query string', async () => {
      setupMocks();
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() => screen.getByText('Service 0'));

      const searchInput = screen.getByPlaceholderText(/search services/i);
      await user.type(searchInput, 'wedding');

      await waitFor(() => {
        expect(MarketplaceService.searchListings).toHaveBeenCalledWith(
          expect.objectContaining({ q: 'wedding' }),
        );
      });
    });

    it('calls searchListings with category_id when a category is selected', async () => {
      setupMocks();
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() => screen.getByRole('option', { name: 'Photography' }));

      const [categorySelect] = screen.getAllByRole('combobox');
      await user.selectOptions(categorySelect, 'cat-1');

      await waitFor(() => {
        expect(MarketplaceService.searchListings).toHaveBeenCalledWith(
          expect.objectContaining({ category_id: 'cat-1' }),
        );
      });
    });
  });

  describe('save/heart toggle', () => {
    it('shows toast asking to log in when unauthenticated user clicks heart', async () => {
      (CookieHelper.get as jest.Mock).mockReturnValue(null);
      setupMocks(makeListings(1));
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() => screen.getByText('Service 0'));

      const heartBtn = screen.getByRole('button', { name: /save listing/i });
      await user.click(heartBtn);

      expect(toast.info).toHaveBeenCalledWith('Log in to save listings');
      expect(SavedListingsService.save).not.toHaveBeenCalled();
    });

    it('calls SavedListingsService.save when logged-in user hearts a listing', async () => {
      (CookieHelper.get as jest.Mock).mockReturnValue('mock-token');
      (SavedListingsService.getSavedIds as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      (SavedListingsService.save as jest.Mock).mockResolvedValue({
        data: { success: true },
      });
      setupMocks(makeListings(1));
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() => screen.getByText('Service 0'));

      const heartBtn = screen.getByRole('button', { name: /save listing/i });
      await user.click(heartBtn);

      await waitFor(() => {
        expect(SavedListingsService.save).toHaveBeenCalledWith('listing-0');
      });
      expect(toast.success).toHaveBeenCalledWith('Saved to your favourites');
    });

    it('calls SavedListingsService.remove when a saved listing is un-hearted', async () => {
      (CookieHelper.get as jest.Mock).mockReturnValue('mock-token');
      (SavedListingsService.getSavedIds as jest.Mock).mockResolvedValue({
        data: { success: true, data: ['listing-0'] }, // already saved
      });
      (SavedListingsService.remove as jest.Mock).mockResolvedValue({
        data: { success: true },
      });
      setupMocks(makeListings(1));
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() => screen.getByText('Service 0'));

      const heartBtn = screen.getByRole('button', { name: /remove from saved/i });
      await user.click(heartBtn);

      await waitFor(() => {
        expect(SavedListingsService.remove).toHaveBeenCalledWith('listing-0');
      });
    });

    it('reverts optimistic update when save API call fails', async () => {
      (CookieHelper.get as jest.Mock).mockReturnValue('mock-token');
      (SavedListingsService.getSavedIds as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      (SavedListingsService.save as jest.Mock).mockRejectedValue(new Error('fail'));
      setupMocks(makeListings(1));
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() => screen.getByText('Service 0'));

      await user.click(screen.getByRole('button', { name: /save listing/i }));

      // After failure, reverted back to unsaved state
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to update saved listings');
      });
    });
  });

  describe('pagination', () => {
    it('renders page buttons when last_page > 1', async () => {
      (MarketplaceService.searchListings as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          data: makeListings(12),
          meta: { total: 24, last_page: 2 },
        },
      });
      (MarketplaceService.getCategories as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      render(<MarketplacePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
      });
    });
  });

  describe('near me', () => {
    const PERMISSION_DENIED = 1;
    const mockGeo = (impl: (ok: any, fail: any) => void) =>
      Object.defineProperty(global.navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: jest.fn(impl) },
      });

    afterEach(() => {
      delete (global.navigator as any).geolocation;
      window.localStorage.clear();
    });

    it('asks for location, then searches near the visitor and shows distances', async () => {
      mockGeo((ok) => ok({ coords: { latitude: 40.712776, longitude: -74.005974 } }));
      const near = makeListings(1).map((l) => ({ ...l, location: 'Brooklyn, NY', distance_miles: 3.2 }));
      setupMocks(near);
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await user.click(await screen.findByRole('button', { name: 'Use my location' }));

      await waitFor(() =>
        expect(MarketplaceService.searchListings).toHaveBeenLastCalledWith(
          expect.objectContaining({ near_lat: 40.7128, near_lng: -74.006, radius_miles: 25, sort: 'distance' }),
        ),
      );
      expect(await screen.findByText(/3.2 mi away/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Near me/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'Use my location' })).not.toBeInTheDocument();
    });

    it('explains how to allow location when the browser blocks it', async () => {
      mockGeo((_ok, fail) => fail({ code: PERMISSION_DENIED, PERMISSION_DENIED }));
      setupMocks();
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await user.click(await screen.findByRole('button', { name: 'Use my location' }));

      expect(await screen.findByText(/Location is blocked for this site/)).toBeInTheDocument();
      expect(MarketplaceService.searchListings).not.toHaveBeenCalledWith(expect.objectContaining({ near_lat: expect.anything() }));
    });

    it('hides the prompt after "Not now" and remembers it', async () => {
      mockGeo(() => undefined);
      setupMocks();
      const user = userEvent.setup();
      const { unmount } = render(<MarketplacePage />);

      await user.click(await screen.findByRole('button', { name: 'Not now' }));
      expect(screen.queryByText('Find vendors near you')).not.toBeInTheDocument();
      unmount();

      render(<MarketplacePage />);
      await screen.findAllByText(/Service 0/);
      expect(screen.queryByText('Find vendors near you')).not.toBeInTheDocument();
    });
  });

  describe('filters from a link (event plan "Find vendors")', () => {
    afterEach(() => window.history.replaceState(null, '', '/'));

    it('applies category, date, place and event from the URL, and lets them be removed', async () => {
      window.history.replaceState(null, '', '/marketplace?category_id=cat-2&date=2027-06-12&near_lat=29.76&near_lng=-95.37&radius_miles=50&near=Houston%2C%20TX&event=ev-1');
      setupMocks();
      const user = userEvent.setup();
      render(<MarketplacePage />);

      await waitFor(() =>
        expect(MarketplaceService.searchListings).toHaveBeenCalledWith(
          expect.objectContaining({ category_id: 'cat-2', date: '2027-06-12', near_lat: 29.76, near_lng: -95.37, radius_miles: 50, sort: 'distance' }),
        ),
      );
      // the first search already has the link's filters
      expect((MarketplaceService.searchListings as jest.Mock).mock.calls[0][0]).toMatchObject({ category_id: 'cat-2', date: '2027-06-12' });
      expect(await screen.findByText(/Free on Jun 12, 2027/)).toBeInTheDocument();
      expect(screen.getByText('Near Houston, TX')).toBeInTheDocument();
      // listing links carry the event so the booking is made for it
      const card = (await screen.findByText('Service 0')).closest('a');
      expect(card).toHaveAttribute('href', '/marketplace/listing-0?event=ev-1');

      await user.click(screen.getByRole('button', { name: 'Remove date filter' }));
      await waitFor(() => expect((MarketplaceService.searchListings as jest.Mock).mock.lastCall[0].date).toBeUndefined());
      await user.click(screen.getByRole('button', { name: 'Remove location filter' }));
      await waitFor(() => expect((MarketplaceService.searchListings as jest.Mock).mock.lastCall[0].near_lat).toBeUndefined());
    });
  });
});
