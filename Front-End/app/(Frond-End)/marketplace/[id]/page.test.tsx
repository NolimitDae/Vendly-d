import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListingDetailPage from './page';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useParams: () => ({ id: 'listing-abc' }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/service/marketplace/marketplace.service', () => ({
  MarketplaceService: { getListing: jest.fn() },
}));

jest.mock('@/service/savedListings/savedListings.service', () => ({
  SavedListingsService: {
    getSavedIds: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: { me: jest.fn() },
}));

jest.mock('@/service/events/events.service', () => ({
  EventsService: { list: jest.fn(), linkBooking: jest.fn() },
}));

jest.mock('@/helper/cookie.helper', () => ({
  CookieHelper: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Stub out child components that have their own tests
jest.mock('@/components/marketplace/BookingModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="booking-modal">
      <button onClick={onClose}>Close Booking</button>
    </div>
  ),
}));

jest.mock('@/components/marketplace/ReviewList', () => ({
  __esModule: true,
  default: () => <div data-testid="review-list" />,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import { MarketplaceService } from '@/service/marketplace/marketplace.service';
import { SavedListingsService } from '@/service/savedListings/savedListings.service';
import { AuthService } from '@/service/auth/auth.service';
import { EventsService } from '@/service/events/events.service';
import { CookieHelper } from '@/helper/cookie.helper';
import { toast } from 'react-toastify';

const mockListing = {
  id: 'listing-abc',
  title: 'Professional Photography',
  description: 'Top-quality photography for all events.',
  price: 250,
  price_unit: 'hour',
  images: ['https://example.com/photo.jpg'],
  tags: ['photography', 'events'],
  location: 'New York',
  avg_rating: 4.8,
  _count: { reviews: 12, bookings: 30 },
  category: { id: 'cat-1', name: 'Photography' },
  vendor: {
    id: 'vendor-1',
    name: 'John Doe',
    created_at: '2022-01-01T00:00:00Z',
    vendorProfile: { business_name: 'JD Photography' },
  },
};

function setupListingMock(override?: object) {
  (MarketplaceService.getListing as jest.Mock).mockResolvedValue({
    data: { success: true, data: { ...mockListing, ...override } },
  });
}

function setupNotLoggedIn() {
  (CookieHelper.get as jest.Mock).mockReturnValue(null);
}

function setupLoggedIn(type = 'CLIENT') {
  (CookieHelper.get as jest.Mock).mockReturnValue('mock-token');
  (AuthService.me as jest.Mock).mockResolvedValue({
    data: { success: true, data: { id: 'user-1', name: 'Test User', type } },
  });
  (SavedListingsService.getSavedIds as jest.Mock).mockResolvedValue({
    data: { success: true, data: [] },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ListingDetailPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows a spinner while loading', () => {
      (MarketplaceService.getListing as jest.Mock).mockReturnValue(new Promise(() => {}));
      setupNotLoggedIn();
      render(<ListingDetailPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('not found state', () => {
    it('shows not-found message when listing is missing', async () => {
      (MarketplaceService.getListing as jest.Mock).mockResolvedValue({
        data: { success: false },
      });
      setupNotLoggedIn();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Listing not found')).toBeInTheDocument();
      });
    });
  });

  describe('loaded state', () => {
    it('renders listing title and description', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Professional Photography')).toBeInTheDocument();
      });
      expect(screen.getByText(/Top-quality photography/)).toBeInTheDocument();
    });

    it('renders the price and price unit', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('$250.00')).toBeInTheDocument();
      });
      expect(screen.getByText(/\/ hour/)).toBeInTheDocument();
    });

    it('renders the category badge', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Photography')).toBeInTheDocument();
      });
    });

    it('renders vendor business name', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('JD Photography')).toBeInTheDocument();
      });
    });

    it('renders location', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('New York')).toBeInTheDocument();
      });
    });

    it('renders tag chips', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('#photography')).toBeInTheDocument();
      });
      expect(screen.getByText('#events')).toBeInTheDocument();
    });

    it('renders review list component', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId('review-list')).toBeInTheDocument();
      });
    });
  });

  describe('unauthenticated user', () => {
    it('shows "Log in to Book" link instead of Book Now button', async () => {
      setupNotLoggedIn();
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Log in to Book')).toBeInTheDocument();
      });
      expect(screen.queryByText('Book Now')).not.toBeInTheDocument();
    });

    it('shows toast when unauthenticated user clicks the save button', async () => {
      setupNotLoggedIn();
      setupListingMock();
      const user = userEvent.setup();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByText('Professional Photography'));
      const saveBtn = screen.getByRole('button', { name: /save listing/i });
      await user.click(saveBtn);
      expect(toast.info).toHaveBeenCalledWith('Log in to save listings');
    });
  });

  describe('authenticated CLIENT user', () => {
    it('shows Book Now button', async () => {
      setupLoggedIn('CLIENT');
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Book Now' })).toBeInTheDocument();
      });
    });

    it('does NOT show Add to Event button', async () => {
      setupLoggedIn('CLIENT');
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByRole('button', { name: 'Book Now' }));
      expect(screen.queryByText(/add to event/i)).not.toBeInTheDocument();
    });

    it('opens BookingModal when Book Now is clicked', async () => {
      setupLoggedIn('CLIENT');
      setupListingMock();
      const user = userEvent.setup();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByRole('button', { name: 'Book Now' }));
      await user.click(screen.getByRole('button', { name: 'Book Now' }));
      expect(screen.getByTestId('booking-modal')).toBeInTheDocument();
    });

    it('calls SavedListingsService.save when heart button is clicked', async () => {
      setupLoggedIn('CLIENT');
      (SavedListingsService.save as jest.Mock).mockResolvedValue({ data: { success: true } });
      setupListingMock();
      const user = userEvent.setup();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByText('Professional Photography'));
      await user.click(screen.getByRole('button', { name: /save listing/i }));
      await waitFor(() => {
        expect(SavedListingsService.save).toHaveBeenCalledWith('listing-abc');
      });
      expect(toast.success).toHaveBeenCalledWith('Saved to your favourites');
    });

    it('calls SavedListingsService.remove when already-saved heart is clicked', async () => {
      setupLoggedIn('CLIENT');
      (SavedListingsService.getSavedIds as jest.Mock).mockResolvedValue({
        data: { success: true, data: ['listing-abc'] },
      });
      (SavedListingsService.remove as jest.Mock).mockResolvedValue({ data: { success: true } });
      setupListingMock();
      const user = userEvent.setup();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByRole('button', { name: /remove from saved/i }));
      await user.click(screen.getByRole('button', { name: /remove from saved/i }));
      await waitFor(() => {
        expect(SavedListingsService.remove).toHaveBeenCalledWith('listing-abc');
      });
    });
  });

  describe('authenticated EVENT_PLANNER user', () => {
    beforeEach(() => {
      setupLoggedIn('EVENT_PLANNER');
      (EventsService.list as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          data: [
            { id: 'ev-1', name: 'Spring Wedding', status: 'PLANNING' },
            { id: 'ev-2', name: 'Birthday Bash', status: 'CONFIRMED' },
          ],
        },
      });
    });

    it('shows both Book Now and Add to Event buttons', async () => {
      setupListingMock();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByRole('button', { name: 'Book Now' }));
      expect(screen.getByRole('button', { name: /add to event/i })).toBeInTheDocument();
    });

    it('opens the select-event modal when Add to Event is clicked', async () => {
      setupListingMock();
      const user = userEvent.setup();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByRole('button', { name: /add to event/i }));
      await user.click(screen.getByRole('button', { name: /add to event/i }));
      await waitFor(() => {
        expect(screen.getByText('Spring Wedding')).toBeInTheDocument();
      });
    });

    it('transitions to BookingModal when "Continue to Book" is clicked', async () => {
      setupListingMock();
      const user = userEvent.setup();
      render(<ListingDetailPage />);
      await waitFor(() => screen.getByRole('button', { name: /add to event/i }));
      await user.click(screen.getByRole('button', { name: /add to event/i }));
      await waitFor(() => screen.getByText('Spring Wedding'));
      await user.click(screen.getByRole('button', { name: /continue to book/i }));
      expect(screen.getByTestId('booking-modal')).toBeInTheDocument();
    });
  });
});
