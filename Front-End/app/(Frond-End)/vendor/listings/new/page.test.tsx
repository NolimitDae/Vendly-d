import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewListingPage from './page';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: any) => <img alt={alt} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

jest.mock('@/service/subscription/subscription.service', () => ({
  SubscriptionService: {
    getCurrentPlan: jest.fn(),
  },
}));

jest.mock('@/service/marketplace/marketplace.service', () => ({
  MarketplaceService: {
    getCategories: jest.fn(),
  },
}));

jest.mock('@/service/vendor/vendor-listing.service', () => ({
  VendorListingService: {
    create: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { SubscriptionService } from '@/service/subscription/subscription.service';
import { MarketplaceService } from '@/service/marketplace/marketplace.service';
import { VendorListingService } from '@/service/vendor/vendor-listing.service';
import { toast } from 'react-toastify';

const mockCategories = [{ id: 'cat-1', name: 'Photography', sub_categories: [] }];

function setupActivePlan() {
  (SubscriptionService.getCurrentPlan as jest.Mock).mockResolvedValue({
    data: { success: true, data: { vendorPlan: { payment_status: 'PAID' } } },
  });
  (MarketplaceService.getCategories as jest.Mock).mockResolvedValue({
    data: { success: true, data: mockCategories },
  });
}

function setupNoActivePlan() {
  (SubscriptionService.getCurrentPlan as jest.Mock).mockResolvedValue({
    data: { success: true, data: { vendorPlan: { payment_status: 'UNPAID' } } },
  });
  (MarketplaceService.getCategories as jest.Mock).mockResolvedValue({
    data: { success: true, data: mockCategories },
  });
}

describe('NewListingPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('subscription gate', () => {
    it('shows subscription blocked screen when plan is inactive', async () => {
      setupNoActivePlan();
      render(<NewListingPage />);

      await waitFor(() => {
        expect(screen.getByText('Subscription Required')).toBeInTheDocument();
      });
      expect(screen.getByRole('link', { name: /view subscription plans/i })).toHaveAttribute(
        'href',
        '/vendor/subscription?reason=no-plan',
      );
    });

    it('redirects to subscription page when 403 is returned', async () => {
      (SubscriptionService.getCurrentPlan as jest.Mock).mockRejectedValue({
        response: { status: 403 },
      });
      (MarketplaceService.getCategories as jest.Mock).mockResolvedValue({
        data: { success: true, data: [] },
      });
      render(<NewListingPage />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/vendor/subscription?reason=no-plan');
      });
    });

    it('shows the form when plan is active', async () => {
      setupActivePlan();
      render(<NewListingPage />);

      await waitFor(() => {
        expect(screen.getByText('Create New Listing')).toBeInTheDocument();
      });
    });
  });

  describe('form rendering', () => {
    it('renders all required form fields', async () => {
      setupActivePlan();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      expect(screen.getByPlaceholderText(/professional wedding photography/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/describe your service/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/0\.00/)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /select category/i })).toBeInTheDocument();
    });

    it('loads categories into the category select', async () => {
      setupActivePlan();
      render(<NewListingPage />);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Photography' })).toBeInTheDocument();
      });
    });
  });

  describe('form validation', () => {
    it('shows error toast when submitting with empty required fields', async () => {
      setupActivePlan();
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      expect(toast.error).toHaveBeenCalledWith(
        'Title, description, and price are required',
      );
      expect(VendorListingService.create).not.toHaveBeenCalled();
    });

    it('shows error toast when only title is missing', async () => {
      setupActivePlan();
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      await user.type(screen.getByPlaceholderText(/describe your service/i), 'A great service');
      await user.type(screen.getByPlaceholderText(/0\.00/), '99');
      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      expect(toast.error).toHaveBeenCalledWith(
        'Title, description, and price are required',
      );
    });
  });

  describe('form submission', () => {
    it('calls VendorListingService.create and redirects on success', async () => {
      setupActivePlan();
      (VendorListingService.create as jest.Mock).mockResolvedValue({
        data: { success: true },
      });
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      await user.type(
        screen.getByPlaceholderText(/professional wedding photography/i),
        'My Service Title',
      );
      await user.type(screen.getByPlaceholderText(/describe your service/i), 'A detailed description');
      await user.type(screen.getByPlaceholderText(/0\.00/), '150');

      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => {
        expect(VendorListingService.create).toHaveBeenCalled();
      });
      expect(toast.success).toHaveBeenCalledWith('Listing created!');
      expect(mockPush).toHaveBeenCalledWith('/vendor/listings');
    });

    it('shows error toast when API returns success=false', async () => {
      setupActivePlan();
      (VendorListingService.create as jest.Mock).mockResolvedValue({
        data: { success: false, message: 'Limit reached' },
      });
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      await user.type(screen.getByPlaceholderText(/professional wedding photography/i), 'Title');
      await user.type(screen.getByPlaceholderText(/describe your service/i), 'Description');
      await user.type(screen.getByPlaceholderText(/0\.00/), '50');
      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Limit reached');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows error toast when API throws', async () => {
      setupActivePlan();
      (VendorListingService.create as jest.Mock).mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      await user.type(screen.getByPlaceholderText(/professional wedding photography/i), 'Title');
      await user.type(screen.getByPlaceholderText(/describe your service/i), 'Description');
      await user.type(screen.getByPlaceholderText(/0\.00/), '50');
      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to create listing');
      });
    });

    it('disables submit button while submitting', async () => {
      setupActivePlan();
      let resolve: (v: any) => void;
      (VendorListingService.create as jest.Mock).mockImplementation(
        () => new Promise((res) => { resolve = res; }),
      );
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      await user.type(screen.getByPlaceholderText(/professional wedding photography/i), 'Title');
      await user.type(screen.getByPlaceholderText(/describe your service/i), 'Description');
      await user.type(screen.getByPlaceholderText(/0\.00/), '50');
      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save as draft/i })).toBeDisabled();
      });
      resolve!({ data: { success: true } });
    });
  });

  describe('price unit select', () => {
    it('renders all price unit options', async () => {
      setupActivePlan();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));

      expect(screen.getByRole('option', { name: 'Fixed' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Hour' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Day' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Event' })).toBeInTheDocument();
    });
  });
});
