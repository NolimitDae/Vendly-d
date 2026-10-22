import React from 'react';
import { render, screen } from '@testing-library/react';
import VendorShop from './VendorShop';

jest.mock('next/image', () => ({ __esModule: true, default: ({ alt, src }: any) => <img alt={alt} src={src} /> }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), info: jest.fn() } }));
jest.mock('@/components/marketplace/ReviewList', () => ({ __esModule: true, default: ({ vendorId }: any) => <div>reviews for {vendorId}</div> }));
jest.mock('@/service/marketplace/marketplace.service', () => ({ MarketplaceService: { getVendorProfile: jest.fn() } }));

import { MarketplaceService } from '@/service/marketplace/marketplace.service';
const getVendorProfile = MarketplaceService.getVendorProfile as jest.Mock;

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
    expect(screen.getByRole('button', { name: /Copy shop link/ })).toBeInTheDocument();
    // reviews are loaded by vendor id, not by the handle in the address
    expect(screen.getByText('reviews for user-1')).toBeInTheDocument();
  });

  it('says the shop was not found for an unknown handle', async () => {
    getVendorProfile.mockRejectedValue(new Error('404'));
    render(<VendorShop idOrHandle="nobody" />);
    expect(await screen.findByText("We couldn't find that shop")).toBeInTheDocument();
  });
});
