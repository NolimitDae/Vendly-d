import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './page';

jest.mock('@/service/twofa/twofa.service', () => ({
  TwoFAService: {
    getStatus: jest.fn(),
    generateSecret: jest.fn(),
    verifyToken: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { TwoFAService } from '@/service/twofa/twofa.service';
import { toast } from 'react-toastify';

describe('SettingsPage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('loading state', () => {
    it('shows spinner while fetching 2FA status', () => {
      (TwoFAService.getStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
      render(<SettingsPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('2FA disabled state', () => {
    beforeEach(() => {
      (TwoFAService.getStatus as jest.Mock).mockResolvedValue({
        data: { success: true, data: { enabled: false } },
      });
    });

    it('shows Disabled badge', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });
    });

    it('shows Enable 2FA button', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeInTheDocument();
      });
    });

    it('shows QR code step after clicking Enable 2FA', async () => {
      (TwoFAService.generateSecret as jest.Mock).mockResolvedValue({
        data: { success: true, data: { qrCode: 'data:image/png;base64,abc', secret: 'TOTP_SECRET' } },
      });
      const user = userEvent.setup();
      render(<SettingsPage />);
      await waitFor(() => screen.getByRole('button', { name: /enable 2fa/i }));
      await user.click(screen.getByRole('button', { name: /enable 2fa/i }));
      await waitFor(() => {
        expect(screen.getByText(/scan the qr code/i)).toBeInTheDocument();
      });
    });

    it('shows error toast if QR code generation fails', async () => {
      (TwoFAService.generateSecret as jest.Mock).mockResolvedValue({
        data: { success: false, message: 'Server error' },
      });
      const user = userEvent.setup();
      render(<SettingsPage />);
      await waitFor(() => screen.getByRole('button', { name: /enable 2fa/i }));
      await user.click(screen.getByRole('button', { name: /enable 2fa/i }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Server error');
      });
    });
  });

  describe('2FA enabled state', () => {
    beforeEach(() => {
      (TwoFAService.getStatus as jest.Mock).mockResolvedValue({
        data: { success: true, data: { enabled: true } },
      });
    });

    it('shows Enabled badge', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });

    it('shows Disable 2FA button', async () => {
      render(<SettingsPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /disable 2fa/i })).toBeInTheDocument();
      });
    });

    it('opens the disable modal when Disable 2FA is clicked', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await waitFor(() => screen.getByRole('button', { name: /disable 2fa/i }));
      await user.click(screen.getByRole('button', { name: /disable 2fa/i }));
      expect(screen.getByText('Disable Two-Factor Auth')).toBeInTheDocument();
    });
  });

  describe('verify code step', () => {
    beforeEach(async () => {
      (TwoFAService.getStatus as jest.Mock).mockResolvedValue({
        data: { success: true, data: { enabled: false } },
      });
      (TwoFAService.generateSecret as jest.Mock).mockResolvedValue({
        data: { success: true, data: { qrCode: 'data:image/png;base64,abc', secret: 'TOTP_SECRET' } },
      });
    });

    it('shows verify step after clicking Next', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await waitFor(() => screen.getByRole('button', { name: /enable 2fa/i }));
      await user.click(screen.getByRole('button', { name: /enable 2fa/i }));
      await waitFor(() => screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    });

    it('shows error when 2FA verification fails', async () => {
      (TwoFAService.verifyToken as jest.Mock).mockResolvedValue({
        data: { success: false, message: 'Invalid code' },
      });
      const user = userEvent.setup();
      render(<SettingsPage />);
      await waitFor(() => screen.getByRole('button', { name: /enable 2fa/i }));
      await user.click(screen.getByRole('button', { name: /enable 2fa/i }));
      await waitFor(() => screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));
      const input = screen.getByPlaceholderText('000000');
      await user.type(input, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid code');
      });
    });
  });

  describe('disable 2FA flow', () => {
    beforeEach(() => {
      (TwoFAService.getStatus as jest.Mock).mockResolvedValue({
        data: { success: true, data: { enabled: true } },
      });
    });

    it('successfully disables 2FA and shows success toast', async () => {
      (TwoFAService.disable as jest.Mock).mockResolvedValue({
        data: { success: true },
      });
      const user = userEvent.setup();
      render(<SettingsPage />);
      await waitFor(() => screen.getByRole('button', { name: /disable 2fa/i }));
      await user.click(screen.getByRole('button', { name: /disable 2fa/i }));
      const input = screen.getByPlaceholderText('000000');
      await user.type(input, '654321');
      // Click the confirm disable button inside modal
      const disableButtons = screen.getAllByRole('button', { name: /disable 2fa/i });
      await user.click(disableButtons[disableButtons.length - 1]);
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringMatching(/disabled/i),
        );
      });
    });
  });
});
