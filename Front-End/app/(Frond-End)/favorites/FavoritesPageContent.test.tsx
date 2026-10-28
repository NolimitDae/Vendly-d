import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FavoritesPageContent from './FavoritesPageContent';

let mockSearchParams = new URLSearchParams();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/favorites',
}));

jest.mock('next/image', () => ({ __esModule: true, default: ({ alt, src }: any) => <img alt={alt} src={src} /> }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

jest.mock('@/service/savedVendors/savedVendors.service', () => ({
  SavedVendorsService: { getAll: jest.fn(), remove: jest.fn() },
}));
jest.mock('@/service/savedListings/savedListings.service', () => ({
  SavedListingsService: { getAll: jest.fn(), remove: jest.fn() },
}));

import { SavedVendorsService } from '@/service/savedVendors/savedVendors.service';
import { SavedListingsService } from '@/service/savedListings/savedListings.service';
import { toast } from 'react-toastify';

const vendors = SavedVendorsService as jest.Mocked<typeof SavedVendorsService>;
const listings = SavedListingsService as jest.Mocked<typeof SavedListingsService>;

const savedVendor = (id: string, extra: Record<string, any> = {}) => ({
  id: `sv-${id}`,
  created_at: '2026-10-01T00:00:00.000Z',
  vendor: {
    id,
    name: `Owner ${id}`,
    business_name: `Shop ${id}`,
    handle: null,
    avatar_url: null,
    logo_url: null,
    location: 'Atlanta, GA',
    categories: ['Catering'],
    listing_count: 2,
    avg_rating: 4.5,
    review_count: 3,
    ...extra,
  },
});

const savedListing = {
  id: 'sl-1',
  created_at: '2026-10-01T00:00:00.000Z',
  listing: { id: 'l1', title: 'Wedding buffet', description: 'Food for 100', price: 1200, price_unit: 'event', images: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  vendors.getAll.mockResolvedValue({ data: { success: true, data: [savedVendor('v1', { handle: 'bellas' }), savedVendor('v2')] } } as any);
  listings.getAll.mockResolvedValue({ data: { success: true, data: [savedListing] } } as any);
});

describe('Favorites page', () => {
  it('opens on the Vendors tab and links each vendor to their shop', async () => {
    render(<FavoritesPageContent />);
    expect(screen.getByRole('tab', { name: 'Vendors' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Shop v1')).toBeInTheDocument();
    expect(screen.getByText('2 vendors saved')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'View shop' });
    expect(links[0]).toHaveAttribute('href', '/v/bellas');
    expect(links[1]).toHaveAttribute('href', '/marketplace/vendors/v2');
    expect(listings.getAll).not.toHaveBeenCalled();
  });

  it('opens on the Services tab from ?tab=services and shows the saved packages', async () => {
    mockSearchParams = new URLSearchParams('tab=services');
    render(<FavoritesPageContent />);
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Wedding buffet')).toBeInTheDocument();
    expect(vendors.getAll).not.toHaveBeenCalled();
  });

  it('switches tabs and keeps the tab in the address', async () => {
    render(<FavoritesPageContent />);
    await screen.findByText('Shop v1');
    await userEvent.click(screen.getByRole('tab', { name: 'Services' }));
    expect(mockReplace).toHaveBeenCalledWith('/favorites?tab=services', { scroll: false });
    expect(await screen.findByText('Wedding buffet')).toBeInTheDocument();
  });

  it('shows an empty state when no vendors are saved', async () => {
    vendors.getAll.mockResolvedValue({ data: { success: true, data: [] } } as any);
    render(<FavoritesPageContent />);
    expect(await screen.findByText('No saved vendors yet')).toBeInTheDocument();
  });

  it('removes a vendor, and puts it back if that fails', async () => {
    vendors.remove.mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error('down'));
    render(<FavoritesPageContent />);
    await screen.findByText('Shop v1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Shop v1 from favorites' }));
    await waitFor(() => expect(screen.queryByText('Shop v1')).not.toBeInTheDocument());
    expect(vendors.remove).toHaveBeenCalledWith('v1');
    expect(toast.success).toHaveBeenCalledWith('Removed from favorites');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Shop v2 from favorites' }));
    expect(await screen.findByText('Shop v2')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Could not remove the vendor');
  });
});
