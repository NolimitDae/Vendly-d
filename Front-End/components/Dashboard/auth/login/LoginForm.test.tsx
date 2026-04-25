import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from './LoginForm';

jest.mock('@/service/auth/auth.service', () => ({
  AuthService: {
    login: jest.fn().mockResolvedValue({
      data: {
        success: true,
        authorization: { access_token: 'mock-token' },
        data: { type: 'CLIENT' },
      },
    }),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/helper/cookie.helper', () => ({
  CookieHelper: { set: jest.fn(), get: jest.fn(), destroy: jest.fn() },
}));

import { AuthService } from '@/service/auth/auth.service';

describe('LoginForm Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. UI Rendering', () => {
    it('renders the core elements of the login form', () => {
      render(<LoginForm />);

      expect(screen.getByPlaceholderText(/sarahjohnson@mail.com/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/•••••••••/i)).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /Log in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText(/Remember me/i)).toBeInTheDocument();
      expect(screen.getByText(/Forgot your password\?/i)).toBeInTheDocument();
    });
  });

  describe('2. User Interactions', () => {
    it('allows typing into email and password fields', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      const emailInput = screen.getByPlaceholderText(/sarahjohnson@mail.com/i);
      const passwordInput = screen.getByPlaceholderText(/•••••••••/i);

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'secretpassword123');

      expect(emailInput).toHaveValue('test@example.com');
      expect(passwordInput).toHaveValue('secretpassword123');
    });

    it('can check the Remember me checkbox', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      const rememberCheckbox = screen.getByRole('checkbox');
      expect(rememberCheckbox).not.toBeChecked();

      await user.click(rememberCheckbox);

      expect(rememberCheckbox).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('3. Login Submission', () => {
    it('calls AuthService.login with email and password on submit', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);

      await user.type(screen.getByPlaceholderText(/sarahjohnson@mail.com/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/•••••••••/i), 'password123');
      await user.click(screen.getByRole('button', { name: /Log in/i }));

      expect(AuthService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });
});
