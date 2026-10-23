import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecurityPrivacyContent from './SecurityPrivacyContent';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/twofa/twofa.service', () => ({
  TwoFAService: {
    getStatus: jest.fn(),
    generateSecret: jest.fn(),
    verifyToken: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
  },
}));

import { TwoFAService } from '@/service/twofa/twofa.service';
import { toast } from 'react-toastify';

const status = (enabled: boolean) => (TwoFAService.getStatus as jest.Mock).mockResolvedValue({ data: { success: true, data: { enabled } } });

beforeEach(() => {
  jest.clearAllMocks();
  (TwoFAService.generateSecret as jest.Mock).mockResolvedValue({ data: { success: true, data: { qrCode: 'data:image/png;base64,QR', secret: 'ABCDEF' } } });
  (TwoFAService.verifyToken as jest.Mock).mockResolvedValue({ data: { success: true } });
  (TwoFAService.enable as jest.Mock).mockResolvedValue({ data: { success: true } });
  (TwoFAService.disable as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('SecurityPrivacyContent', () => {
  it('shows the real 2FA status and no made-up devices', async () => {
    status(false);
    render(<SecurityPrivacyContent />);
    expect(await screen.findByText('Enable an extra layer of security for account login.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByText('Device Management')).not.toBeInTheDocument();
    expect(screen.queryByText('MacBook Pro (You)')).not.toBeInTheDocument();
  });

  it('turns 2FA on: QR code, verify the code, then enable', async () => {
    status(false);
    const user = userEvent.setup();
    render(<SecurityPrivacyContent />);
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());

    await user.click(screen.getByRole('checkbox'));
    expect(await screen.findByAltText('2FA QR code')).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(screen.getByText('ABCDEF')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify & Enable' }));

    await waitFor(() => expect(TwoFAService.enable).toHaveBeenCalled());
    expect(TwoFAService.verifyToken).toHaveBeenCalledWith('123456');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(toast.success).toHaveBeenCalledWith('Two-factor authentication enabled');
  });

  it('does not enable 2FA when the code is wrong', async () => {
    status(false);
    (TwoFAService.verifyToken as jest.Mock).mockResolvedValue({ data: { success: false, message: 'Invalid token' } });
    const user = userEvent.setup();
    render(<SecurityPrivacyContent />);
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeDisabled());
    await user.click(screen.getByRole('checkbox'));
    await user.type(await screen.findByLabelText('Authenticator code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify & Enable' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid token'));
    expect(TwoFAService.enable).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('turns 2FA off after checking a code', async () => {
    status(true);
    const user = userEvent.setup();
    render(<SecurityPrivacyContent />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());

    await user.click(screen.getByRole('checkbox'));
    expect(TwoFAService.generateSecret).not.toHaveBeenCalled();
    await user.type(await screen.findByLabelText('Authenticator code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Disable 2FA' }));

    await waitFor(() => expect(TwoFAService.disable).toHaveBeenCalledWith('654321'));
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
  });

  it('keeps 2FA on when the server refuses the code', async () => {
    status(true);
    (TwoFAService.disable as jest.Mock).mockResolvedValueOnce({ data: { success: false, message: 'Enter the current code from your authenticator app to turn off two-step login.' } });
    const user = userEvent.setup();
    render(<SecurityPrivacyContent />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    await user.click(screen.getByRole('checkbox'));
    await user.type(await screen.findByLabelText('Authenticator code'), '111111');
    await user.click(screen.getByRole('button', { name: 'Disable 2FA' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Enter the current code from your authenticator app to turn off two-step login.'));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
