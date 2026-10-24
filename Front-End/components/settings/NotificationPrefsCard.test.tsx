import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationPrefsCard from './NotificationPrefsCard';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/notification/notification.service', () => ({ NotificationService: { getPrefs: jest.fn(), updatePrefs: jest.fn() } }));
import { NotificationService } from '@/service/notification/notification.service';
import { toast } from 'react-toastify';

const allOn = { booking_updates: true, messages: true, payments: true, reminders: true, review_requests: true, email: true };

beforeEach(() => {
  jest.clearAllMocks();
  (NotificationService.getPrefs as jest.Mock).mockResolvedValue({ data: { success: true, data: { ...allOn, messages: false } } });
});

describe('NotificationPrefsCard', () => {
  it('shows the saved switches and says what is always sent', async () => {
    render(<NotificationPrefsCard />);
    expect(await screen.findByRole('switch', { name: 'Messages' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Booking updates' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(screen.getByText('Security and receipts are always sent.')).toBeInTheDocument();
  });

  it('saves a change straight away', async () => {
    (NotificationService.updatePrefs as jest.Mock).mockResolvedValue({ data: { success: true } });
    render(<NotificationPrefsCard />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Review requests' }));
    expect(screen.getByRole('switch', { name: 'Review requests' })).toHaveAttribute('aria-checked', 'false');
    expect(NotificationService.updatePrefs).toHaveBeenCalledWith({ review_requests: false });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('puts the switch back and says so when saving fails', async () => {
    (NotificationService.updatePrefs as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<NotificationPrefsCard />);
    await userEvent.click(await screen.findByRole('switch', { name: 'Email' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Email' })).toHaveAttribute('aria-checked', 'true'));
    expect(toast.error).toHaveBeenCalledWith("Couldn't save your notification settings. Please try again.");
  });

  it('says when the settings could not be loaded', async () => {
    (NotificationService.getPrefs as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<NotificationPrefsCard />);
    expect(await screen.findByText(/couldn't load your notification settings/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
