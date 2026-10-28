import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import VendorShop from './VendorShop';

jest.mock('next/image', () => ({ __esModule: true, default: ({ alt, src }: any) => <img alt={alt} src={src} /> }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/marketplace/ReviewList', () => ({ __esModule: true, default: ({ vendorId }: any) => <div>reviews for {vendorId}</div> }));
jest.mock('@/service/marketplace/marketplace.service', () => ({ MarketplaceService: { getVendorProfile: jest.fn() } }));
jest.mock('@/lib/session', () => ({ ...jest.requireActual('@/lib/session'), isLoggedIn: jest.fn(() => false) }));
jest.mock('@/lib/currentUser', () => ({ whoAmI: jest.fn() }));
jest.mock('@/service/savedVendors/savedVendors.service', () => ({
  SavedVendorsService: { getSavedIds: jest.fn(), save: jest.fn(), remove: jest.fn() },
}));

import { MarketplaceService } from '@/service/marketplace/marketplace.service';
const getVendorProfile = MarketplaceService.getVendorProfile as jest.Mock;
import userEvent from '@testing-library/user-event';
import { isLoggedIn } from '@/lib/session';
import { whoAmI } from '@/lib/currentUser';
import { SavedVendorsService } from '@/service/savedVendors/savedVendors.service';
import { toast } from 'react-toastify';
const saved = SavedVendorsService as jest.Mocked<typeof SavedVendorsService>;

const vendor = {
  id: 'user-1',
  name: 'Bella Rossi',
  handle: 'bellas-catering',
  banner_url: 'https://cdn/banner.jpg',
  logo_url: 'https://cdn/logo.png',
  avatar_url: 'https://cdn/avatar.jpg',
  avg_rating: 4.67,
  vendorProfile: { business_name: "Bella's Catering", about_me: 'Italian food for weddings.' },
  vendorListings: [{ id: 'l1', title: 'Wedding buffet', price: '1200', price_unit: 'event', images: ['https://cdn/l1.jpg'], category: { name: 'Catering' } }],
  _count: { vendorListings: 1, receivedReviews: 3 },
};

describe('VendorShop', () => {
  beforeEach(() => getVendorProfile.mockReset());

  it('shows the banner, logo, rating and services for a shop handle', async () => {
    getVendorProfile.mockResolvedValue({ data: { success: true, data: vendor } });
    render(<VendorShop idOrHandle="bellas-catering" />);

    expect(await screen.findByRole('heading', { name: "Bella's Catering" })).toBeInTheDocument();
    expect(getVendorProfile).toHaveBeenCalledWith('bellas-catering');
    expect(screen.getByAltText("Bella's Catering banner")).toHaveAttribute('src', 'https://cdn/banner.jpg');
    expect(screen.getByAltText("Bella's Catering logo")).toHaveAttribute('src', 'https://cdn/logo.png');
    expect(screen.getByText('4.7')).toBeInTheDocument();
    expect(screen.getByText('(3 reviews)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wedding buffet/ })).toHaveAttribute('href', '/marketplace/l1');
    expect(screen.getByRole('button', { name: /Share shop/ })).toBeInTheDocument();
    // reviews are loaded by vendor id, not by the handle in the address
    expect(screen.getByText('reviews for user-1')).toBeInTheDocument();
  });

  it('marks a test vendor’s shop and packages with a "Test" badge, and no one else’s', async () => {
    getVendorProfile.mockResolvedValue({ data: { success: true, data: { ...vendor, is_test: true } } });
    const { unmount } = render(<VendorShop idOrHandle="bellas-catering" />);
    expect(await screen.findByRole('heading', { name: "Bella's Catering Test" })).toBeInTheDocument();
    expect(screen.getAllByText('Test')).toHaveLength(2);
    unmount();

    getVendorProfile.mockResolvedValue({ data: { success: true, data: vendor } });
    render(<VendorShop idOrHandle="bellas-catering" />);
    await screen.findByRole('heading', { name: "Bella's Catering" });
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('links the vendor’s social accounts, skipping empty and non-https ones', async () => {
    getVendorProfile.mockResolvedValue({
      data: { success: true, data: { ...vendor, socials: { website: 'https://bellas.com/', instagram: 'https://www.instagram.com/bella', tiktok: null, x: 'javascript:alert(1)' } } },
    });
    render(<VendorShop idOrHandle="bellas-catering" />);
    const insta = await screen.findByRole('link', { name: 'Instagram' });
    expect(insta).toHaveAttribute('href', 'https://www.instagram.com/bella');
    expect(insta).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://bellas.com/');
    expect(screen.queryByRole('link', { name: 'TikTok' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'X' })).not.toBeInTheDocument();
  });

  describe('save heart', () => {
    beforeEach(() => {
      getVendorProfile.mockResolvedValue({ data: { success: true, data: vendor } });
      (isLoggedIn as jest.Mock).mockReturnValue(true);
      (whoAmI as jest.Mock).mockResolvedValue({ id: 'me', type: 'CUSTOMER' });
      saved.getSavedIds.mockResolvedValue({ data: { success: true, data: [] } } as any);
    });
    afterEach(() => (isLoggedIn as jest.Mock).mockReturnValue(false));

    it('lets a signed-in customer save the vendor by id, and remove it again', async () => {
      saved.save.mockResolvedValue({} as any);
      saved.remove.mockResolvedValue({} as any);
      render(<VendorShop idOrHandle="bellas-catering" />);
      await userEvent.click(await screen.findByRole('button', { name: 'Save vendor' }));
      expect(saved.save).toHaveBeenCalledWith('user-1');
      expect(screen.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));
      expect(saved.remove).toHaveBeenCalledWith('user-1');
      expect(screen.getByRole('button', { name: 'Save vendor' })).toBeInTheDocument();
    });

    it('shows a saved vendor as saved, and undoes the change when it fails', async () => {
      saved.getSavedIds.mockResolvedValue({ data: { success: true, data: ['user-1'] } } as any);
      saved.remove.mockRejectedValue(new Error('down'));
      render(<VendorShop idOrHandle="bellas-catering" />);
      await userEvent.click(await screen.findByRole('button', { name: 'Remove from favorites' }));
      expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('Could not update favorites');
    });

    it('is not shown to vendors, planners, the shop owner or signed-out visitors', async () => {
      for (const me of [{ id: 'me', type: 'VENDOR' }, { id: 'me', type: 'EVENT_PLANNER' }, { id: 'user-1', type: 'CUSTOMER' }]) {
        (whoAmI as jest.Mock).mockResolvedValue(me);
        const { unmount } = render(<VendorShop idOrHandle="bellas-catering" />);
        await screen.findByRole('heading', { name: "Bella's Catering" });
        await waitFor(() => expect(whoAmI).toHaveBeenCalled());
        expect(screen.queryByRole('button', { name: 'Save vendor' })).not.toBeInTheDocument();
        unmount();
      }
      (isLoggedIn as jest.Mock).mockReturnValue(false);
      render(<VendorShop idOrHandle="bellas-catering" />);
      await screen.findByRole('heading', { name: "Bella's Catering" });
      expect(screen.queryByRole('button', { name: 'Save vendor' })).not.toBeInTheDocument();
    });
  });

  it('says the shop was not found for an unknown handle', async () => {
    getVendorProfile.mockRejectedValue(new Error('404'));
    render(<VendorShop idOrHandle="nobody" />);
    expect(await screen.findByText("We couldn't find that shop")).toBeInTheDocument();
  });
});
