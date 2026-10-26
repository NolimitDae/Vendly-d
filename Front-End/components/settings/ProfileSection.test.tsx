import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSection from './ProfileSection';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/auth/auth.service', () => ({ AuthService: { me: jest.fn(), updateProfile: jest.fn() } }));
const refresh = jest.fn();
jest.mock('@/providers/OnboardingProvider', () => ({ useOnboarding: () => ({ refresh }) }));
import { AuthService } from '@/service/auth/auth.service';
import { toast } from 'react-toastify';

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
});
beforeEach(() => {
  jest.clearAllMocks();
  (AuthService.me as jest.Mock).mockResolvedValue({ data: { data: { first_name: 'Ada', last_name: 'Obi', address: '', avatar_url: null } } });
  (AuthService.updateProfile as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('ProfileSection', () => {
  it('saves a photo, name and city, then re-checks the setup checklist', async () => {
    render(<ProfileSection />);
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    const photo = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('avatar-input'), photo);
    await userEvent.type(screen.getByLabelText('City'), 'Austin, TX');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(AuthService.updateProfile).toHaveBeenCalled());
    const fd = (AuthService.updateProfile as jest.Mock).mock.calls[0][0] as FormData;
    expect(fd.get('address')).toBe('Austin, TX');
    expect(fd.get('name')).toBe('Ada Obi');
    expect((fd.get('image') as File).name).toBe('me.jpg');
    expect(toast.success).toHaveBeenCalledWith('Profile saved');
    expect(refresh).toHaveBeenCalledWith(true);
  });

  it('refuses files that are not photos or too big', async () => {
    render(<ProfileSection />);
    await screen.findByRole('heading', { name: 'Profile' });
    await userEvent.upload(screen.getByTestId('avatar-input'), new File(['%PDF'], 'id.pdf', { type: 'application/pdf' }), { applyAccept: false });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Choose a photo'));
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('avatar-input'), big);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('over 5 MB'));
  });

  it('saves a phone number, checked loosely, and sends an empty one to clear it', async () => {
    render(<ProfileSection />);
    await screen.findByRole('heading', { name: 'Profile' });
    const phone = screen.getByLabelText(/Phone number/);
    expect(phone).toHaveAttribute('autocomplete', 'tel');
    await userEvent.type(phone, 'call me');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('only digits'));
    expect(AuthService.updateProfile).not.toHaveBeenCalled();

    await userEvent.clear(phone);
    await userEvent.type(phone, '+1 (512) 555-0134');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(AuthService.updateProfile).toHaveBeenCalled());
    expect(((AuthService.updateProfile as jest.Mock).mock.calls[0][0] as FormData).get('phone_number')).toBe('+1 (512) 555-0134');
  });

  it('needs a first name', async () => {
    render(<ProfileSection />);
    await screen.findByRole('heading', { name: 'Profile' });
    await userEvent.clear(screen.getByLabelText('First name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(AuthService.updateProfile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Add your first name.');
  });
});
