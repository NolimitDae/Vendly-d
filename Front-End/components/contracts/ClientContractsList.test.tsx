import React from 'react';
import { render, screen } from '@testing-library/react';
import ClientContractsList from './ClientContractsList';

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }));
jest.mock('@/service/contracts/contracts.service', () => ({ ContractsService: { clientEventContracts: jest.fn() } }));
import { ContractsService } from '@/service/contracts/contracts.service';

describe('ClientContractsList', () => {
  it('lists the event contracts and offers co-signing on the one waiting for the client', async () => {
    (ContractsService.clientEventContracts as jest.Mock).mockResolvedValue({
      data: {
        data: [
          { id: 'c1', status: 'AWAITING_CLIENT', title: 'Contract', version: 1, can_sign: true, listing_title: 'Wedding DJ', vendor_name: 'DJ Sam' },
          { id: 'c2', status: 'EXECUTED', title: 'Contract', version: 1, can_sign: false, listing_title: 'Catering', vendor_name: 'Bella' },
        ],
      },
    });
    render(<ClientContractsList eventId="e1" />);
    expect(await screen.findByRole('link', { name: 'Review & co-sign' })).toHaveAttribute('href', '/contracts/c1');
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/contracts/c2');
    expect(screen.getByText('Awaiting client co-signature')).toBeInTheDocument();
    expect(ContractsService.clientEventContracts).toHaveBeenCalledWith('e1');
  });
});
