import { renderHook } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { useNotificationContext } from '@/providers/NotificationProvider';

jest.mock('@/providers/NotificationProvider', () => ({
  useNotificationContext: jest.fn(),
}));

const mockContext = {
  notifications: [],
  unread: 0,
  loading: false,
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  removeNotification: jest.fn(),
};

describe('useNotifications', () => {
  beforeEach(() => {
    (useNotificationContext as jest.Mock).mockReturnValue(mockContext);
  });

  it('returns the notification context value', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current).toBe(mockContext);
  });

  it('exposes notifications array', () => {
    const notifications = [
      {
        id: 'n-1',
        read_at: null,
        created_at: new Date().toISOString(),
        notification_event: { type: 'BOOKING_REQUEST', text: 'New booking' },
        sender: { id: 'u-1', name: 'Alice', avatar: null },
      },
    ];
    (useNotificationContext as jest.Mock).mockReturnValue({ ...mockContext, notifications, unread: 1 });
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unread).toBe(1);
  });

  it('exposes markAsRead function', () => {
    const { result } = renderHook(() => useNotifications());
    expect(typeof result.current.markAsRead).toBe('function');
  });

  it('exposes markAllAsRead function', () => {
    const { result } = renderHook(() => useNotifications());
    expect(typeof result.current.markAllAsRead).toBe('function');
  });

  it('exposes removeNotification function', () => {
    const { result } = renderHook(() => useNotifications());
    expect(typeof result.current.removeNotification).toBe('function');
  });

  it('reflects loading state', () => {
    (useNotificationContext as jest.Mock).mockReturnValue({ ...mockContext, loading: true });
    const { result } = renderHook(() => useNotifications());
    expect(result.current.loading).toBe(true);
  });

  it('returns unread count of zero when all notifications are read', () => {
    (useNotificationContext as jest.Mock).mockReturnValue({ ...mockContext, unread: 0 });
    const { result } = renderHook(() => useNotifications());
    expect(result.current.unread).toBe(0);
  });
});
