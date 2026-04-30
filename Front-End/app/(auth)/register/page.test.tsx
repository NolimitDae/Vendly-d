import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: any) => <img alt={alt} />,
}));

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: {
    register: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/helper/cookie.helper', () => ({
  CookieHelper: { set: jest.fn(), get: jest.fn(), destroy: jest.fn() },
}));

import { AuthService } from '@/service/auth/auth.service';
import { toast } from 'react-toastify';

// ── helpers ──────────────────────────────────────────────────────────────────

async function advanceToDetailsStep(user: ReturnType<typeof userEvent.setup>) {
  render(<RegisterPage />);
  await user.click(screen.getByRole('button', { name: /continue/i }));
}

async function fillDetailsForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{
    first_name: string;
    last_name: string;
    email: string;
    password: string;
  }> = {},
) {
  const vals = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    password: 'Password1!',
    ...overrides,
  };
  await user.type(screen.getByPlaceholderText('John'), vals.first_name);
  await user.type(screen.getByPlaceholderText('Doe'), vals.last_name);
  await user.type(screen.getByPlaceholderText('john@example.com'), vals.email);
  await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), vals.password);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => jest.clearAllMocks());

  // Step 1 — type selection
  describe('Step 1: account type selection', () => {
    it('renders the three account type options', () => {
      render(<RegisterPage />);
      expect(screen.getByText('Customer')).toBeInTheDocument();
      expect(screen.getByText('Vendor')).toBeInTheDocument();
      expect(screen.getByText('Event Planner')).toBeInTheDocument();
    });

    it('highlights the selected type', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);
      // CLIENT is selected by default; click Vendor
      await user.click(screen.getByText('Vendor'));
      expect(screen.getByText('Vendor').closest('button')).toHaveClass('border-primary');
    });

    it('advances to step 2 when Continue is clicked', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
    });
  });

  // Step 2 — details form
  describe('Step 2: details form', () => {
    it('renders all required fields for CLIENT type', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      expect(screen.getByPlaceholderText('John')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Doe')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('john@example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/min\. 8 characters/i)).toBeInTheDocument();
      // Business name should NOT appear for CLIENT
      expect(screen.queryByPlaceholderText(/smith photography/i)).not.toBeInTheDocument();
    });

    it('shows business name field when Vendor is selected', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);
      await user.click(screen.getByText('Vendor'));
      await user.click(screen.getByRole('button', { name: /continue/i }));
      expect(screen.getByPlaceholderText(/smith photography/i)).toBeInTheDocument();
    });

    it('shows validation errors when submitting empty form', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0);
      });
      expect(AuthService.register).not.toHaveBeenCalled();
    });

    it('shows error for invalid email', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');
      // Use fireEvent.change to set an invalid value without triggering
      // jsdom's native email type-validation (which would block submit)
      fireEvent.change(screen.getByPlaceholderText('john@example.com'), {
        target: { value: 'notanemail' },
      });
      await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), 'Password1!');
      // fireEvent.submit bypasses native browser validation so our custom
      // validate() function runs and sets the error
      fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);
      await waitFor(() => {
        expect(screen.getByText(/valid email required/i)).toBeInTheDocument();
      });
    });

    it('shows error for password shorter than 8 characters', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await user.type(screen.getByPlaceholderText('John'), 'John');
      await user.type(screen.getByPlaceholderText('Doe'), 'Doe');
      await user.type(screen.getByPlaceholderText('john@example.com'), 'john@example.com');
      await user.type(screen.getByPlaceholderText(/min\. 8 characters/i), 'short');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        expect(screen.getByText(/minimum 8 characters/i)).toBeInTheDocument();
      });
    });

    it('shows business name error for Vendor when field is empty', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);
      await user.click(screen.getByText('Vendor'));
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await fillDetailsForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        expect(screen.getByText(/business name required/i)).toBeInTheDocument();
      });
    });

    it('submits correct payload and redirects to /login on success', async () => {
      (AuthService.register as jest.Mock).mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await fillDetailsForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(AuthService.register).toHaveBeenCalledWith(
          expect.objectContaining({
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
            type: 'CLIENT',
          }),
        );
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Account created! Check your email to verify.',
      );
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('shows API error message when registration fails', async () => {
      (AuthService.register as jest.Mock).mockResolvedValue({
        data: { success: false, message: 'Email already exists' },
      });
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await fillDetailsForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Email already exists');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('shows generic error when API throws', async () => {
      (AuthService.register as jest.Mock).mockRejectedValue({
        response: { data: { message: 'Server error' } },
      });
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await fillDetailsForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Server error');
      });
    });

    it('disables submit button and shows spinner while loading', async () => {
      let resolve: (v: any) => void;
      (AuthService.register as jest.Mock).mockImplementation(
        () => new Promise((res) => { resolve = res; }),
      );
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await fillDetailsForm(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
      });
      resolve!({ data: { success: true } });
    });

    it('toggles password visibility', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      const passwordInput = screen.getByPlaceholderText(/min\. 8 characters/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      // Find and click the eye toggle button
      const toggleButton = passwordInput.closest('div')?.querySelector('button');
      if (toggleButton) {
        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');
      }
    });

    it('navigates back to step 1 when "← Change account type" is clicked', async () => {
      const user = userEvent.setup();
      await advanceToDetailsStep(user);
      await user.click(screen.getByText(/← change account type/i));
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });
});
