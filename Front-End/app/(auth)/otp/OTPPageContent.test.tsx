import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OTPPageContent from './OTPPageContent';

const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/',
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: {
    verifyEmail: jest.fn(),
  },
}));

// Simplify the OtpForm to a controlled input for testing purposes
jest.mock('../../../components/Dashboard/auth/otp/OtpForm', () => ({
  __esModule: true,
  default: ({ onComplete }: { onComplete: (otp: string) => Promise<void> }) => {
    const [val, setVal] = React.useState('');
    const [err, setErr] = React.useState('');
    return (
      <div>
        <input
          aria-label="otp-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        {err && <p role="alert">{err}</p>}
        <button
          onClick={async () => {
            try {
              await onComplete(val);
            } catch (e: any) {
              setErr(e.message);
            }
          }}
        >
          Submit
        </button>
      </div>
    );
  },
}));

jest.mock('@/components/Dashboard/DashboardContainer', () => ({
  __esModule: true,
  default: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('../../../components/Dashboard/auth/BackIcon', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../../components/Dashboard/auth/AuthRightSection', () => ({
  __esModule: true,
  default: () => null,
}));

import { AuthService } from '@/service/auth/auth.service';

describe('OTPPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.delete('email');
    mockSearchParams.delete('purpose');
  });

  it('renders the OTP heading', () => {
    render(<OTPPageContent />);
    expect(screen.getByText('Enter OTP')).toBeInTheDocument();
  });

  it('shows the email in the description when email param is set', () => {
    mockSearchParams.set('email', 'user@example.com');
    render(<OTPPageContent />);
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
  });

  it('renders OtpForm', () => {
    render(<OTPPageContent />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  describe('purpose=verify flow', () => {
    beforeEach(() => {
      mockSearchParams.set('email', 'user@example.com');
      mockSearchParams.set('purpose', 'verify');
    });

    it('calls AuthService.verifyEmail with email and otp on submit', async () => {
      (AuthService.verifyEmail as jest.Mock).mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      render(<OTPPageContent />);

      await user.type(screen.getByRole('textbox', { name: 'otp-input' }), '123456');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(AuthService.verifyEmail).toHaveBeenCalledWith({
          email: 'user@example.com',
          token: '123456',
        });
      });
    });

    it('redirects to /login on successful verification', async () => {
      (AuthService.verifyEmail as jest.Mock).mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      render(<OTPPageContent />);

      await user.type(screen.getByRole('textbox', { name: 'otp-input' }), '123456');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('shows error message when verification fails', async () => {
      (AuthService.verifyEmail as jest.Mock).mockResolvedValue({
        data: { success: false, message: 'Invalid OTP' },
      });
      const user = userEvent.setup();
      render(<OTPPageContent />);

      await user.type(screen.getByRole('textbox', { name: 'otp-input' }), '000000');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid OTP');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows error when API throws', async () => {
      (AuthService.verifyEmail as jest.Mock).mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      render(<OTPPageContent />);

      await user.type(screen.getByRole('textbox', { name: 'otp-input' }), '123456');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Network error');
      });
    });
  });

  describe('purpose=reset flow', () => {
    beforeEach(() => {
      mockSearchParams.set('email', 'user@example.com');
      mockSearchParams.set('purpose', 'reset');
    });

    it('navigates to change-password with email and token instead of calling verifyEmail', async () => {
      const user = userEvent.setup();
      render(<OTPPageContent />);

      await user.type(screen.getByRole('textbox', { name: 'otp-input' }), '654321');
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/change-password?email=${encodeURIComponent('user@example.com')}&token=654321`,
        );
      });
      expect(AuthService.verifyEmail).not.toHaveBeenCalled();
    });
  });
});
