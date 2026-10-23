import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';
import TodaysBooking from './todays-booking/TodaysBooking';

jest.mock('./overview/ReveneuOverview', () => ({ __esModule: true, default: () => null }));
jest.mock('./new-subscription/NewSubscription', () => ({ __esModule: true, default: () => null }));
jest.mock('./quick-actions/QuickActions', () => ({ __esModule: true, default: () => null }));
jest.mock('./common/WarningComponent', () => ({
  __esModule: true,
  default: (p: { vendorPending: number; epPending: number }) => require('react').createElement('p', null, `pending vendors ${p.vendorPending}, planners ${p.epPending}`),
}));
jest.mock('@/service/admin/admin.service', () => ({
  AdminService: {
    getVendors: jest.fn(),
    getEventPlanners: jest.fn(),
    getBookings: jest.fn(),
    getTransactions: jest.fn(),
    getPendingLicense: jest.fn(),
    getPendingEventPlanners: jest.fn(),
  },
}));
jest.mock('@/service/admin/money.service', () => ({ MoneyService: { revenue: jest.fn() } }));

import { AdminService } from '@/service/admin/admin.service';
import { MoneyService } from '@/service/admin/money.service';

beforeEach(() => {
  jest.clearAllMocks();
  (AdminService.getVendors as jest.Mock).mockResolvedValue({ data: { meta: { total: 4 } } });
  (AdminService.getEventPlanners as jest.Mock).mockResolvedValue({ data: { meta: { total: 2 } } });
  (AdminService.getBookings as jest.Mock).mockImplementation(async (p: any) => ({
    data: { meta: { total: p?.from ? (p.status === 'PENDING' ? 2 : p.status === 'CANCELLED' ? 1 : 5) : 99 } },
  }));
  // every transaction (payouts, refunds, deposits) would add up to far more than Vendly earned
  (AdminService.getTransactions as jest.Mock).mockResolvedValue({ data: [{ amount: 1000 }, { amount: 500 }] });
  (AdminService.getPendingLicense as jest.Mock).mockResolvedValue({ data: [{ type: 'VENDOR' }] });
  (AdminService.getPendingEventPlanners as jest.Mock).mockResolvedValue({ data: { data: [{}], meta: { total: 3 } } });
  (MoneyService.revenue as jest.Mock).mockResolvedValue({ data: { success: true, data: { totals: { fees: 120, commission: 5.5, vendly_revenue: 125.5 } } } });
});

describe('DashboardPage', () => {
  it("shows Vendly's revenue for the last 30 days, not the sum of every transaction", async () => {
    render(<DashboardPage />);
    expect(await screen.findByText('$125.50')).toBeInTheDocument();
    expect(screen.getByText('Vendly Revenue')).toBeInTheDocument();
    expect(screen.getByText('Fees + commission, last 30 days')).toBeInTheDocument();
    expect(screen.queryByText('$1,500')).not.toBeInTheDocument();
    expect(AdminService.getTransactions).not.toHaveBeenCalled();

    const [from, to] = (MoneyService.revenue as jest.Mock).mock.calls[0];
    const days = (new Date(to).getTime() - new Date(from).getTime()) / (24 * 3600 * 1000);
    expect(Math.round(days)).toBe(30);
  });
});

describe('DashboardPage counts and cards', () => {
  it('counts planners waiting for approval from their own list', async () => {
    render(<DashboardPage />);
    expect(await screen.findByText('pending vendors 1, planners 3')).toBeInTheDocument();
  });

  it('shows no made-up growth badge on the cards', async () => {
    render(<DashboardPage />);
    await screen.findByText('$125.50');
    expect(screen.queryByText('0.1%')).not.toBeInTheDocument();
    expect(screen.queryByText('From Last Month')).not.toBeInTheDocument();
  });
});

describe('TodaysBooking', () => {
  it('counts only bookings created since local midnight', async () => {
    render(<TodaysBooking />);
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    expect(screen.getByText("Today's Bookings")).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();

    const midnight = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    for (const [params] of (AdminService.getBookings as jest.Mock).mock.calls) {
      expect(params.from).toBe(midnight);
    }
  });
});
