import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './Navbar';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: () => ({ push: jest.fn() }),
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

jest.mock('@/helper/cookie.helper', () => ({
  CookieHelper: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: {
    me: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: jest.fn(),
}));

jest.mock('@/components/landing-page/theme/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

// dayjs mocks handled by jest transform

// ── Helpers ────────────────────────────────────────────────────────────────────

import { CookieHelper } from '@/helper/cookie.helper';
import { AuthService } from '@/service/auth/auth.service';
import { useNotifications } from '@/hooks/useNotifications';

const mockUseNotifications = useNotifications as jest.Mock;

const defaultNotificationState = {
  notifications: [],
  unread: 0,
  loading: false,
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  removeNotification: jest.fn(),
};

function setupLoggedIn(type = 'CLIENT') {
  (CookieHelper.get as jest.Mock).mockReturnValue('mock-token');
  (AuthService.me as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: { id: 'user-1', name: 'Alice Smith', type },
    },
  });
}

function setupLoggedOut() {
  (CookieHelper.get as jest.Mock).mockReturnValue(null);
}

const sampleNotifications = [
  {
    id: 'n-1',
    read_at: null,
    created_at: new Date().toISOString(),
    notification_event: { type: 'BOOKING_REQUEST', text: 'You have a new booking request' },
    sender: { name: 'Bob', avatar: null },
  },
  {
    id: 'n-2',
    read_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    notification_event: { type: 'NEW_MESSAGE', text: 'You received a message' },
    sender: { name: 'Carol', avatar: null },
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Navbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNotifications.mockReturnValue(defaultNotificationState);
  });

  describe('logged-out state', () => {
    it('renders logo', () => {
      setupLoggedOut();
      render(<Navbar />);
      const logos = screen.getAllByAltText('logo');
      expect(logos.length).toBeGreaterThan(0);
    });

    it('does NOT show the notification bell', () => {
      setupLoggedOut();
      render(<Navbar />);
      expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
    });
  });

  describe('logged-in state', () => {
    it('shows the notification bell after user loads', async () => {
      setupLoggedIn();
      mockUseNotifications.mockReturnValue({ ...defaultNotificationState, unread: 0 });
      render(<Navbar />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      });
    });

    it('shows unread badge with correct count when there are unread notifications', async () => {
      setupLoggedIn();
      mockUseNotifications.mockReturnValue({
        ...defaultNotificationState,
        unread: 3,
        notifications: sampleNotifications,
      });
      render(<Navbar />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      });
      const badges = screen.getAllByText('3');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('does NOT show badge when unread count is zero', async () => {
      setupLoggedIn();
      mockUseNotifications.mockReturnValue({ ...defaultNotificationState, unread: 0 });
      render(<Navbar />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      });
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('caps badge display at 99+', async () => {
      setupLoggedIn();
      mockUseNotifications.mockReturnValue({
        ...defaultNotificationState,
        unread: 150,
        notifications: [],
      });
      render(<Navbar />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      });
      const badges = screen.getAllByText('99+');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('notification bell dropdown', () => {
    beforeEach(() => {
      setupLoggedIn();
      mockUseNotifications.mockReturnValue({
        ...defaultNotificationState,
        unread: 1,
        notifications: sampleNotifications,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
      });
    });

    it('opens dropdown when bell is clicked', async () => {
      const user = userEvent.setup();
      render(<Navbar />);
      await waitFor(() => screen.getByRole('button', { name: /notifications/i }));
      await user.click(screen.getByRole('button', { name: /notifications/i }));
      await waitFor(() => {
        expect(screen.getByText('You have a new booking request')).toBeInTheDocument();
      });
    });

    it('shows "Mark all as read" button when there are unread notifications', async () => {
      const user = userEvent.setup();
      render(<Navbar />);
      await waitFor(() => screen.getByRole('button', { name: /notifications/i }));
      await user.click(screen.getByRole('button', { name: /notifications/i }));
      await waitFor(() => {
        expect(screen.getByText(/mark all read/i)).toBeInTheDocument();
      });
    });

    it('calls markAllAsRead when "Mark all as read" is clicked', async () => {
      const markAllAsRead = jest.fn();
      mockUseNotifications.mockReturnValue({
        ...defaultNotificationState,
        unread: 1,
        notifications: sampleNotifications,
        markAllAsRead,
      });
      const user = userEvent.setup();
      render(<Navbar />);
      await waitFor(() => screen.getByRole('button', { name: /notifications/i }));
      await user.click(screen.getByRole('button', { name: /notifications/i }));
      await waitFor(() => screen.getByText(/mark all read/i));
      await user.click(screen.getByText(/mark all read/i));
      expect(markAllAsRead).toHaveBeenCalledTimes(1);
    });

    it('shows notification text from sender name', async () => {
      const user = userEvent.setup();
      render(<Navbar />);
      await waitFor(() => screen.getByRole('button', { name: /notifications/i }));
      await user.click(screen.getByRole('button', { name: /notifications/i }));
      await waitFor(() => {
        expect(screen.getByText('You have a new booking request')).toBeInTheDocument();
      });
    });

    it('closes dropdown when bell is clicked again', async () => {
      const user = userEvent.setup();
      render(<Navbar />);
      await waitFor(() => screen.getByRole('button', { name: /notifications/i }));
      const bellBtn = screen.getByRole('button', { name: /notifications/i });
      await user.click(bellBtn);
      await waitFor(() => screen.getByText('You have a new booking request'));
      await user.click(bellBtn);
      await waitFor(() => {
        expect(screen.queryByText('You have a new booking request')).not.toBeInTheDocument();
      });
    });
  });

  describe('empty notifications', () => {
    it('shows empty state message when no notifications exist', async () => {
      setupLoggedIn();
      mockUseNotifications.mockReturnValue({
        ...defaultNotificationState,
        unread: 0,
        notifications: [],
      });
      const user = userEvent.setup();
      render(<Navbar />);
      await waitFor(() => screen.getByRole('button', { name: /notifications/i }));
      await user.click(screen.getByRole('button', { name: /notifications/i }));
      await waitFor(() => {
        expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
      });
    });
  });
});
