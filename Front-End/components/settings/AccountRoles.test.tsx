import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountRoles from './AccountRoles';

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/session', () => ({ saveSession: jest.fn() }));
jest.mock('@/lib/navigate', () => ({ hardNavigate: jest.fn() }));
jest.mock('@/service/identity/identity.service', () => ({ IdentityService: { roles: jest.fn(), switchRole: jest.fn() } }));

import { IdentityService } from '@/service/identity/identity.service';
import { saveSession } from '@/lib/session';
import { toast } from 'react-toastify';
import { hardNavigate } from '@/lib/navigate';
const assign = hardNavigate as jest.Mock;

const roles = (over: any = {}) => ({
  data: {
    success: true,
    data: {
      active: 'CUSTOMER',
      roles: ['CUSTOMER'],
      available: ['CUSTOMER', 'VENDOR', 'EVENT_PLANNER'],
      id_verification: { verified: false, status: 'NONE', rejection_reason: null, submitted_at: null },
      ...over,
    },
  },
});

beforeEach(() => jest.clearAllMocks());

describe('AccountRoles', () => {
  it('asks for ID verification before any switch', async () => {
    (IdentityService.roles as jest.Mock).mockResolvedValue(roles());
    render(<AccountRoles />);
    expect(await screen.findByRole('link', { name: 'Verify my ID' })).toHaveAttribute('href', '/settings/verify-id');
    expect(screen.getByRole('button', { name: 'Add vendor' })).toBeDisabled();
    expect(screen.getByText('In use')).toBeInTheDocument();
  });

  it('shows why a rejected ID failed', async () => {
    (IdentityService.roles as jest.Mock).mockResolvedValue(
      roles({ id_verification: { verified: false, status: 'REJECTED', rejection_reason: 'The photo is blurry.', submitted_at: null } }),
    );
    render(<AccountRoles />);
    expect(await screen.findByText(/The photo is blurry/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload new photos' })).toBeInTheDocument();
  });

  it('adds the vendor role with a business name, saves the new session and goes to the vendor home', async () => {
    (IdentityService.roles as jest.Mock).mockResolvedValue(roles({ id_verification: { verified: true, status: 'APPROVED' } }));
    (IdentityService.switchRole as jest.Mock).mockResolvedValue({
      data: { success: true, type: 'VENDOR', added: true, message: 'You can now use Vendly as a vendor.', authorization: { access_token: 'a2', refresh_token: 'r2' } },
    });
    const user = userEvent.setup();
    render(<AccountRoles />);

    await user.click(await screen.findByRole('button', { name: 'Add vendor' }));
    await user.type(screen.getByLabelText('Business name'), 'Bella Events');
    await user.click(screen.getByRole('button', { name: 'Become a vendor' }));

    await waitFor(() => expect(IdentityService.switchRole).toHaveBeenCalledWith('VENDOR', 'Bella Events'));
    expect(saveSession).toHaveBeenCalledWith('a2', 'r2');
    expect(assign).toHaveBeenCalledWith('/vendor/listings');
  });

  it('shows the server message when a switch is refused', async () => {
    (IdentityService.roles as jest.Mock).mockResolvedValue(roles({ roles: ['CUSTOMER', 'EVENT_PLANNER'], id_verification: { verified: true, status: 'APPROVED' } }));
    (IdentityService.switchRole as jest.Mock).mockRejectedValue({ response: { data: { message: 'Verify your ID first.' } } });
    const user = userEvent.setup();
    render(<AccountRoles />);
    await user.click(await screen.findByRole('button', { name: 'Switch to event planner' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Verify your ID first.'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('still moves to the new role when no fresh tokens come back', async () => {
    (IdentityService.roles as jest.Mock).mockResolvedValue(roles({ roles: ['CUSTOMER', 'EVENT_PLANNER'], id_verification: { verified: true, status: 'APPROVED' } }));
    (IdentityService.switchRole as jest.Mock).mockResolvedValue({ data: { success: true, active: 'EVENT_PLANNER', added: false } });
    const user = userEvent.setup();
    render(<AccountRoles />);
    await user.click(await screen.findByRole('button', { name: 'Switch to event planner' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/event-planner/profile'));
    expect(saveSession).not.toHaveBeenCalled();
  });
});
