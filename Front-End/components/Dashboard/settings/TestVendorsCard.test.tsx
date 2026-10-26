import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestVendorsCard from './TestVendorsCard';

jest.mock('@/service/admin/test-data.service', () => ({ TestDataService: { status: jest.fn(), create: jest.fn(), remove: jest.fn() } }));
jest.mock('@/service/geo/geo.service', () => ({ GeoService: { suggest: jest.fn(), reverse: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { TestDataService } from '@/service/admin/test-data.service';
import { GeoService } from '@/service/geo/geo.service';
import { toast } from 'react-toastify';

const account = { email: 'test-catering-food-1@vendly.test', business_name: 'Golden Fork Catering Co (Test)', shop_url: 'http://localhost:3000/v/test-catering-food-1', packages: 2 };
const empty = { data: { data: { accounts: [], counts: { vendors: 0, packages: 0 } } } };
const one = { data: { data: { accounts: [account], counts: { vendors: 1, packages: 2 } } } };

describe('TestVendorsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
  });

  it('creates nothing until asked, needs a place, then shows the shared password once', async () => {
    (TestDataService.status as jest.Mock).mockResolvedValueOnce(empty).mockResolvedValue(one);
    (GeoService.suggest as jest.Mock).mockResolvedValue({ data: { data: [{ label: 'Atlanta, GA', lat: 33.75, lng: -84.39 }] } });
    (TestDataService.create as jest.Mock).mockResolvedValue({
      data: {
        message: 'Test vendors are ready.',
        data: {
          ...one.data.data,
          created: { vendors_created: 1, packages_created: 2, add_ons_created: 3, contracts_created: 1, rental_items_created: 0 },
          skipped: [],
          near: 'Atlanta, GA',
          timezone: 'America/New_York',
          password: 'Kp7r-xQ2m-9fTa-Wc4z',
          password_note: 'Every test vendor signs in with this password. It is shown only once.',
        },
      },
    });
    const user = userEvent.setup();
    render(<TestVendorsCard />);
    expect(await screen.findByText('No test vendors yet.')).toBeInTheDocument();
    expect(TestDataService.create).not.toHaveBeenCalled();
    // removing has nothing to remove yet
    expect(screen.getByRole('button', { name: /remove test vendors/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /create test vendors/i }));
    expect(toast.error).toHaveBeenCalledWith('Enter where the test vendors should be, like Atlanta, GA.');
    expect(TestDataService.create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Near'), 'Atlan');
    await user.click(await screen.findByRole('option', { name: 'Atlanta, GA' }));
    await user.click(screen.getByRole('button', { name: /create test vendors/i }));
    await waitFor(() => expect(TestDataService.create).toHaveBeenCalledWith({ near: 'Atlanta, GA', lat: 33.75, lng: -84.39 }));
    expect(await screen.findByTestId('test-vendors-password')).toHaveTextContent('Kp7r-xQ2m-9fTa-Wc4z');
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    expect(await screen.findByText('1 test vendor with 2 live packages.')).toBeInTheDocument();
    expect(screen.getByText('test-catering-food-1@vendly.test')).toBeInTheDocument();
  });

  it('resets the password without a place, and removes after confirming, listing cancelled bookings', async () => {
    (TestDataService.status as jest.Mock).mockResolvedValueOnce(one).mockResolvedValueOnce(one).mockResolvedValue(empty);
    (TestDataService.create as jest.Mock).mockResolvedValue({
      data: { data: { ...one.data.data, created: { vendors_created: 0, packages_created: 0, add_ons_created: 0, contracts_created: 0, rental_items_created: 0 }, skipped: [], near: 'Atlanta, GA', timezone: 'America/New_York', password: 'Nw3w-Pass-Word-Abcd', password_note: 'Every test vendor now signs in with this new password. It is shown only once.' } },
    });
    (TestDataService.remove as jest.Mock).mockResolvedValue({
      data: {
        message: 'Test vendors removed.',
        data: {
          removed: [account.email],
          kept: [],
          cancelled: [{ booking_id: 'b1', package: 'Southern Buffet Dinner', status: 'CONFIRMED', refunded: 950 }],
          not_cancelled: [],
          counts: { removed: 1, kept: 0, cancelled: 1, not_cancelled: 0 },
        },
      },
    });
    const user = userEvent.setup();
    render(<TestVendorsCard />);
    await user.click(await screen.findByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(TestDataService.create).toHaveBeenCalledWith({ reset_password: true }));
    expect(await screen.findByTestId('test-vendors-password')).toHaveTextContent('Nw3w-Pass-Word-Abcd');

    await user.click(screen.getByRole('button', { name: /remove test vendors/i }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(TestDataService.remove).toHaveBeenCalled());
    expect(await screen.findByText(/Removed 1 test vendor\. Cancelled 1 open booking/)).toBeInTheDocument();
    expect(screen.getByText(/Southern Buffet Dinner \(b1\): \$950\.00 refunded/)).toBeInTheDocument();
    expect(screen.queryByTestId('test-vendors-password')).not.toBeInTheDocument();
  });

  it('does nothing when removal isn’t confirmed', async () => {
    (TestDataService.status as jest.Mock).mockResolvedValue(one);
    window.confirm = jest.fn(() => false);
    const user = userEvent.setup();
    render(<TestVendorsCard />);
    await user.click(await screen.findByRole('button', { name: /remove test vendors/i }));
    expect(TestDataService.remove).not.toHaveBeenCalled();
  });
});
