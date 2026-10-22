import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyIdPage from './page';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/app/_components/Container', () => ({ __esModule: true, default: ({ children }: any) => <div>{children}</div> }));
jest.mock('@/service/identity/identity.service', () => ({ IdentityService: { status: jest.fn(), submit: jest.fn() } }));

import { IdentityService } from '@/service/identity/identity.service';

const img = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

beforeAll(() => {
  (global.URL as any).createObjectURL = jest.fn(() => 'blob:preview');
});
beforeEach(() => jest.clearAllMocks());

describe('VerifyIdPage', () => {
  it('sends the ID photos, name and selfie for review', async () => {
    (IdentityService.status as jest.Mock).mockResolvedValue({ data: { data: { status: 'NONE' } } });
    (IdentityService.submit as jest.Mock).mockResolvedValue({ data: { success: true, message: 'Thanks!' } });
    const user = userEvent.setup();
    const { container } = render(<VerifyIdPage />);

    await user.type(await screen.findByLabelText('Full legal name'), 'Jane Q Doe');
    const send = screen.getByRole('button', { name: 'Send for review' });
    expect(send).toBeDisabled();

    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(3);
    await user.upload(inputs[0] as HTMLInputElement, img('front.jpg'));
    await user.upload(inputs[1] as HTMLInputElement, img('back.jpg'));
    await user.upload(inputs[2] as HTMLInputElement, img('me.jpg'));
    await user.click(send);

    await waitFor(() => expect(IdentityService.submit).toHaveBeenCalled());
    const form: FormData = (IdentityService.submit as jest.Mock).mock.calls[0][0];
    expect(form.get('document_type')).toBe('DRIVERS_LICENSE');
    expect(form.get('legal_name')).toBe('Jane Q Doe');
    expect((form.get('front') as File).name).toBe('front.jpg');
    expect((form.get('selfie') as File).name).toBe('me.jpg');
    expect(push).toHaveBeenCalledWith('/settings#roles');
  });

  it('does not ask for the back of a passport', async () => {
    (IdentityService.status as jest.Mock).mockResolvedValue({ data: { data: { status: 'NONE' } } });
    const user = userEvent.setup();
    const { container } = render(<VerifyIdPage />);
    await user.selectOptions(await screen.findByLabelText('Document'), 'PASSPORT');
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(screen.queryByText('Back of ID')).not.toBeInTheDocument();
  });

  it('shows the review is in progress instead of the form', async () => {
    (IdentityService.status as jest.Mock).mockResolvedValue({ data: { data: { status: 'PENDING' } } });
    render(<VerifyIdPage />);
    expect(await screen.findByText("We're reviewing your ID")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for review' })).not.toBeInTheDocument();
  });
});
