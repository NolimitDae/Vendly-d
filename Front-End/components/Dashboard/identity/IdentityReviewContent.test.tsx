import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdentityReviewContent from './IdentityReviewContent';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/identity/identity.service', () => ({ AdminIdentityService: { list: jest.fn(), get: jest.fn(), review: jest.fn() } }));

import { AdminIdentityService } from '@/service/identity/identity.service';
import { toast } from 'react-toastify';

const row = { id: 'iv1', status: 'PENDING', document_type: 'PASSPORT', legal_name: 'Jane Q Doe', created_at: '2026-10-22T10:00:00Z', user: { id: 'u1', name: 'Jane', email: 'j@x.com', roles: ['CUSTOMER'] } };

beforeEach(() => {
  jest.clearAllMocks();
  (AdminIdentityService.list as jest.Mock).mockResolvedValue({ data: { data: [row] } });
  (AdminIdentityService.get as jest.Mock).mockResolvedValue({ data: { data: { ...row, front_url: 'https://api/f', back_url: null, selfie_url: 'https://api/s' } } });
  (AdminIdentityService.review as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('IdentityReviewContent', () => {
  it('shows the photos and approves a check', async () => {
    const user = userEvent.setup();
    render(<IdentityReviewContent />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));

    expect(await screen.findByAltText('Front of ID check for Jane Q Doe')).toHaveAttribute('src', 'https://api/f');
    expect(screen.getByAltText('Selfie of ID check for Jane Q Doe')).toBeInTheDocument();
    expect(screen.queryByAltText('Back of ID check for Jane Q Doe')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(AdminIdentityService.review).toHaveBeenCalledWith('iv1', 'APPROVED', undefined));
  });

  it('needs a reason to reject', async () => {
    const user = userEvent.setup();
    render(<IdentityReviewContent />);
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(toast.error).toHaveBeenCalled();
    expect(AdminIdentityService.review).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason if rejecting'), 'The selfie is too dark.');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(AdminIdentityService.review).toHaveBeenCalledWith('iv1', 'REJECTED', 'The selfie is too dark.'));
  });
});
