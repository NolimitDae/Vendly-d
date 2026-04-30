import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgetPassForm from './ForgetPassForm';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: {
    forgotPassword: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Silence ReusableInput's complex internals by rendering what matters
jest.mock('@/components/reusable/InputFiled/ReusableInput', () => ({
  __esModule: true,
  default: ({ label, placeholder, value, onChange, type }: any) => (
    <div>
      <label>{label}</label>
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        type={type ?? 'text'}
      />
    </div>
  ),
}));

jest.mock('@/icons/EmailIcon', () => ({ __esModule: true, default: () => null }));
jest.mock('../GenericButton', () => ({
  __esModule: true,
  GenericButton: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

import { AuthService } from '@/service/auth/auth.service';
import { toast } from 'react-toastify';

describe('ForgetPassForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the email input and Send OTP button', () => {
    render(<ForgetPassForm />);
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send otp/i })).toBeInTheDocument();
  });

  it('shows a toast error when submitted with empty email', async () => {
    const user = userEvent.setup();
    render(<ForgetPassForm />);
    await user.click(screen.getByRole('button', { name: /send otp/i }));
    expect(toast.error).toHaveBeenCalledWith('Please enter your email address');
    expect(AuthService.forgotPassword).not.toHaveBeenCalled();
  });

  it('calls AuthService.forgotPassword with the entered email', async () => {
    (AuthService.forgotPassword as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<ForgetPassForm />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(AuthService.forgotPassword).toHaveBeenCalledWith('john@example.com');
    });
  });

  it('navigates to OTP page on success', async () => {
    (AuthService.forgotPassword as jest.Mock).mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<ForgetPassForm />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/otp?email=${encodeURIComponent('john@example.com')}&purpose=reset`,
      );
    });
    expect(toast.success).toHaveBeenCalledWith('OTP sent to your email');
  });

  it('shows error toast when API returns success=false', async () => {
    (AuthService.forgotPassword as jest.Mock).mockResolvedValue({
      data: { success: false, message: 'Email not found' },
    });
    const user = userEvent.setup();
    render(<ForgetPassForm />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Email not found');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows generic error toast when API call throws', async () => {
    (AuthService.forgotPassword as jest.Mock).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<ForgetPassForm />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to send OTP. Please try again.');
    });
  });

  it('shows "Sending…" text and disables button while loading', async () => {
    let resolve: (v: any) => void;
    (AuthService.forgotPassword as jest.Mock).mockImplementation(
      () => new Promise((res) => { resolve = res; }),
    );
    const user = userEvent.setup();
    render(<ForgetPassForm />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    });

    resolve!({ data: { success: true } });
  });
});
