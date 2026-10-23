import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddOnsLibrary from './AddOnsLibrary';

const mockReplace = jest.fn();
let mockParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useSearchParams: () => mockParams,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
jest.mock('@/service/add-ons/add-ons.service', () => ({
  AddOnsService: {
    list: jest.fn(),
    suggestions: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    attach: jest.fn(),
  },
}));
jest.mock('@/service/vendor/vendor-listing.service', () => ({
  VendorListingService: { getMyListings: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { AddOnsService } from '@/service/add-ons/add-ons.service';
import { VendorListingService } from '@/service/vendor/vendor-listing.service';

const addOns = [
  { id: 'ao-1', kind: 'ADD_ON', name: 'Bartender', description: null, price: 40, price_unit: 'PER_HOUR', price_text: '$40.00 per hour', max_quantity: null, in_library: true, listing_ids: ['l1'] },
  { id: 'ao-2', kind: 'ADD_ON', name: 'Dessert table', description: 'Cakes and cookies', price: 5, price_unit: 'PER_PERSON', price_text: '$5.00 per person', max_quantity: null, in_library: true, listing_ids: [] },
];

describe('AddOnsLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams();
    (AddOnsService.list as jest.Mock).mockResolvedValue({ data: { data: addOns } });
    (VendorListingService.getMyListings as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 'l1', title: 'Wedding package', status: 'ACTIVE' }, { id: 'l2', title: 'Party package', status: 'DRAFT' }] },
    });
  });

  it('lists add-ons with their price and packages', async () => {
    render(<AddOnsLibrary />);
    expect(await screen.findByText('Bartender')).toBeInTheDocument();
    expect(AddOnsService.list).toHaveBeenCalledWith({ kind: 'ADD_ON' });
    expect(screen.getByText('$40.00 per hour')).toBeInTheDocument();
    expect(await screen.findByText('On: Wedding package')).toBeInTheDocument();
    expect(screen.getByText('Not on any package yet')).toBeInTheDocument();
  });

  it('opens the fees tab from the link', async () => {
    mockParams = new URLSearchParams('tab=fees');
    (AddOnsService.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    render(<AddOnsLibrary />);
    await waitFor(() => expect(AddOnsService.list).toHaveBeenCalledWith({ kind: 'FEE' }));
    expect(screen.getByRole('tab', { name: 'Fees' })).toHaveAttribute('aria-selected', 'true');
  });

  it('bulk adds the selected add-ons to the chosen packages', async () => {
    (AddOnsService.attach as jest.Mock).mockResolvedValue({ data: { data: { added: 3 } } });
    const user = userEvent.setup();
    render(<AddOnsLibrary />);
    await user.click(await screen.findByRole('checkbox', { name: 'Select Bartender' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Dessert table' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Wedding package' }));
    await user.click(screen.getByRole('checkbox', { name: 'Party package' }));
    await user.click(screen.getByRole('button', { name: 'Add to packages' }));
    await waitFor(() => expect(AddOnsService.attach).toHaveBeenCalledWith(['ao-1', 'ao-2'], ['l1', 'l2'], 'add'));
  });

  it('creates an add-on from an idea', async () => {
    (AddOnsService.suggestions as jest.Mock).mockResolvedValue({ data: { data: [{ name: 'Appetizers', price_unit: 'PER_PERSON' }] } });
    (AddOnsService.create as jest.Mock).mockResolvedValue({ data: { data: { id: 'ao-3' } } });
    const user = userEvent.setup();
    render(<AddOnsLibrary />);
    await screen.findByText('Bartender');
    await user.click(screen.getByRole('button', { name: /start from an idea/i }));
    await user.click(await screen.findByRole('button', { name: 'Appetizers' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Appetizers');
    await user.type(screen.getByLabelText('Price'), '8');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(AddOnsService.create).toHaveBeenCalledWith({ kind: 'ADD_ON', name: 'Appetizers', description: undefined, price: 8, price_unit: 'PER_PERSON' }),
    );
  });
});
