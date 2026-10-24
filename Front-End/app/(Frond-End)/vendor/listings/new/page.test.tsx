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

jest.mock('@/service/add-ons/add-ons.service', () => ({
  AddOnsService: {
    list: jest.fn().mockResolvedValue({ data: { data: [] } }),
    create: jest.fn(),
    setForListing: jest.fn(),
  },
}));

jest.mock('@/service/geo/geo.service', () => ({
  GeoService: { suggest: jest.fn().mockResolvedValue({ data: { data: [] } }), reverse: jest.fn() },
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: { me: jest.fn().mockResolvedValue({ data: { success: true, data: { type: 'VENDOR', license_status: 'APPROVED' } } }) },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { SubscriptionService } from '@/service/subscription/subscription.service';
import { MarketplaceService } from '@/service/marketplace/marketplace.service';
import { VendorListingService } from '@/service/vendor/vendor-listing.service';
import { toast } from 'react-toastify';
import { AddOnsService } from '@/service/add-ons/add-ons.service';
import { AuthService } from '@/service/auth/auth.service';

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
    // vendor plans are optional until subscriptions launch
    beforeEach(() => {
      process.env.NEXT_PUBLIC_REQUIRE_VENDOR_PLAN = 'true';
    });
    afterEach(() => {
      delete process.env.NEXT_PUBLIC_REQUIRE_VENDOR_PLAN;
    });

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
      expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Package location' })).toBeInTheDocument();
    });

    it('loads categories into the category search', async () => {
      setupActivePlan();
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));
      await waitFor(() => expect(MarketplaceService.getCategories).toHaveBeenCalled());
      await user.click(screen.getByRole('combobox', { name: 'Category' }));
      expect(await screen.findByRole('option', { name: /Photography/ })).toBeInTheDocument();
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

    it('sends the chosen category, location and travel radius', async () => {
      setupActivePlan();
      (VendorListingService.create as jest.Mock).mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      render(<NewListingPage />);

      await waitFor(() => screen.getByText('Create New Listing'));
      await waitFor(() => expect(MarketplaceService.getCategories).toHaveBeenCalled());
      await user.type(screen.getByPlaceholderText(/professional wedding photography/i), 'Title');
      await user.type(screen.getByPlaceholderText(/describe your service/i), 'Description');
      await user.type(screen.getByPlaceholderText(/0\.00/), '50');
      await user.click(screen.getByRole('combobox', { name: 'Category' }));
      await user.click(await screen.findByRole('option', { name: /Photography/ }));
      await user.type(screen.getByRole('combobox', { name: 'Package location' }), 'Austin, TX');
      await user.click(screen.getByRole('button', { name: '25 mi' }));
      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => expect(VendorListingService.create).toHaveBeenCalled());
      const fd = (VendorListingService.create as jest.Mock).mock.calls[0][0] as FormData;
      expect(fd.get('category_id')).toBe('cat-1');
      expect(fd.get('sub_category_id')).toBeNull();
      expect(fd.get('location')).toBe('Austin, TX');
      expect(fd.get('lat')).toBeNull(); // typed, not picked: the server geocodes it
      expect(fd.get('service_radius_miles')).toBe('25');
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

  it('tells a vendor without an approved licence that the package is saved as a draft', async () => {
    setupActivePlan();
    (AuthService.me as jest.Mock).mockResolvedValueOnce({ data: { success: true, data: { type: 'VENDOR', license_status: 'PENDING', license_uploaded: false } } });
    render(<NewListingPage />);
    expect(await screen.findByText(/You need an approved business licence to publish packages/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload your licence' })).toHaveAttribute('href', '/vendor/profile#licence');
  });

  it('shows no licence note to an approved vendor', async () => {
    setupActivePlan();
    render(<NewListingPage />);
    await waitFor(() => screen.getByText('Create New Listing'));
    await waitFor(() => expect(AuthService.me).toHaveBeenCalled());
    expect(screen.queryByText(/approved business licence/)).not.toBeInTheDocument();
  });

  it('does not require a vendor plan unless NEXT_PUBLIC_REQUIRE_VENDOR_PLAN is set', async () => {
    setupNoActivePlan();
    render(<NewListingPage />);
    await waitFor(() => {
      expect(screen.queryByText('Subscription Required')).not.toBeInTheDocument();
    });
    expect(SubscriptionService.getCurrentPlan).not.toHaveBeenCalled();
  });

  describe('per-unit pricing and add-ons', () => {
    const library = [
      { id: 'ao-1', kind: 'ADD_ON', name: 'Bartender', description: null, price: 40, price_unit: 'PER_HOUR', price_text: '$40.00 per hour', max_quantity: null, in_library: true },
      { id: 'fee-1', kind: 'FEE', name: 'Cleaning', description: null, price: 100, price_unit: 'FIXED', price_text: '$100.00', max_quantity: null, in_library: true },
    ];

    async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByPlaceholderText(/professional wedding photography/i), 'Taco Catering');
      await user.type(screen.getByPlaceholderText(/describe your service/i), 'Tacos for your event');
      await user.type(screen.getByPlaceholderText(/0\.00/), '45');
    }

    it('asks for minimum and maximum guests on a per-person package and sends them', async () => {
      setupActivePlan();
      (VendorListingService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });
      const user = userEvent.setup();
      render(<NewListingPage />);
      await waitFor(() => screen.getByText('Create New Listing'));
      await fillBasics(user);
      expect(screen.queryByLabelText(/minimum guests/i)).not.toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText('Per'), 'person');
      expect(screen.getByText('$45 per person')).toBeInTheDocument();
      expect(screen.getByLabelText(/price per person/i)).toBeInTheDocument();
      await user.type(screen.getByLabelText(/minimum guests/i), '50');
      await user.type(screen.getByLabelText(/maximum guests/i), '300');
      await user.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => expect(VendorListingService.create).toHaveBeenCalled());
      const fd = (VendorListingService.create as jest.Mock).mock.calls[0][0] as FormData;
      expect(fd.get('price_unit')).toBe('person');
      expect(fd.get('min_quantity')).toBe('50');
      expect(fd.get('max_quantity')).toBe('300');
      // nothing picked: the package's add-ons aren't touched
      expect(AddOnsService.setForListing).not.toHaveBeenCalled();
    });

    it('stops a minimum above the maximum', async () => {
      setupActivePlan();
      const user = userEvent.setup();
      render(<NewListingPage />);
      await waitFor(() => screen.getByText('Create New Listing'));
      await fillBasics(user);
      await user.selectOptions(screen.getByLabelText('Per'), 'person');
      await user.type(screen.getByLabelText(/minimum guests/i), '300');
      await user.type(screen.getByLabelText(/maximum guests/i), '50');
      await user.click(screen.getByRole('button', { name: /save as draft/i }));
      expect(toast.error).toHaveBeenCalledWith("The minimum can't be more than the maximum.");
      expect(VendorListingService.create).not.toHaveBeenCalled();
    });

    it('saves chosen library add-ons and a custom one after the package is created', async () => {
      setupActivePlan();
      (AddOnsService.list as jest.Mock).mockResolvedValue({ data: { data: library } });
      (AddOnsService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'ao-new' } } });
      (AddOnsService.setForListing as jest.Mock).mockResolvedValue({ data: { success: true } });
      (VendorListingService.create as jest.Mock).mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } });
      const user = userEvent.setup();
      render(<NewListingPage />);
      await waitFor(() => screen.getByText('Create New Listing'));
      await fillBasics(user);

      await user.click(await screen.findByRole('checkbox', { name: /cleaning/i }));
      await user.click(screen.getByRole('checkbox', { name: /bartender/i }));
      await user.click(screen.getByRole('button', { name: /new add-on for this package/i }));
      await user.type(screen.getByLabelText('Name'), 'Churro bar');
      await user.type(screen.getByLabelText('Price'), '6');
      await user.selectOptions(screen.getByLabelText(/how the add-on is priced/i), 'PER_PERSON');
      await user.click(screen.getByRole('button', { name: 'Add add-on' }));
      expect(screen.getByText('$6.00 per person')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /save as draft/i }));
      await waitFor(() => expect(AddOnsService.setForListing).toHaveBeenCalled());
      expect(AddOnsService.create).toHaveBeenCalledWith({
        kind: 'ADD_ON',
        name: 'Churro bar',
        description: undefined,
        price: 6,
        price_unit: 'PER_PERSON',
        in_library: false,
        listing_ids: ['new-1'],
      });
      // order kept: picked first, then the new one
      expect(AddOnsService.setForListing).toHaveBeenCalledWith('new-1', ['fee-1', 'ao-1', 'ao-new']);
      expect(mockPush).toHaveBeenCalledWith('/vendor/listings');
    });
  });
});
