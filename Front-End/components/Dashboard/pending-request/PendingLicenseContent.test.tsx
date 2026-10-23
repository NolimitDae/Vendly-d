import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PendingLicenseContent from './PendingLicenseContent';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/admin/admin.service', () => ({
  AdminService: {
    getPendingLicense: jest.fn(),
    updateLicenseStatus: jest.fn(),
    getPendingEventPlanners: jest.fn(),
    updateEventPlannerStatus: jest.fn(),
  },
}));

import { AdminService } from '@/service/admin/admin.service';

const vendor = {
  id: 'u-vendor',
  email: 'v@x.com',
  type: 'VENDOR',
  name: 'Val Vendor',
  business_name: 'Val Catering',
  license_photo: ['https://api.example/public/storage/license/a.pdf'],
  created_at: '2026-10-20T10:00:00Z',
};

const planner = {
  id: 'profile-1',
  user_id: 'u-planner',
  business_name: 'Pat Plans',
  license_photo: ['https://api.example/public/storage/event-planner/license/p.pdf', 'https://api.example/public/storage/event-planner/license/q.jpg'],
  created_at: '2026-10-21T10:00:00Z',
  user: { id: 'u-planner', name: 'Pat Planner', email: 'p@x.com' },
};

beforeEach(() => {
  jest.clearAllMocks();
  (AdminService.getPendingLicense as jest.Mock).mockResolvedValue({ data: [vendor] });
  (AdminService.updateLicenseStatus as jest.Mock).mockResolvedValue({ data: { success: true } });
  (AdminService.getPendingEventPlanners as jest.Mock).mockResolvedValue({ data: { success: true, data: [planner] } });
  (AdminService.updateEventPlannerStatus as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('PendingLicenseContent', () => {
  it('lists pending planners (not vendors) on the planner page and approves by user id', async () => {
    const user = userEvent.setup();
    render(<PendingLicenseContent type="event_planner" />);

    expect(await screen.findByText('Pat Plans')).toBeInTheDocument();
    expect(screen.queryByText('Val Catering')).not.toBeInTheDocument();
    expect(AdminService.getPendingLicense).not.toHaveBeenCalled();
    expect(screen.getByText('p@x.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve & Activate' }));
    await waitFor(() => expect(AdminService.updateEventPlannerStatus).toHaveBeenCalledWith('u-planner', 'APPROVED'));
    expect(AdminService.updateLicenseStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Pat Plans')).not.toBeInTheDocument());
  });

  it('rejects a planner as SUSPENDED', async () => {
    const user = userEvent.setup();
    render(<PendingLicenseContent type="event_planner" />);
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(AdminService.updateEventPlannerStatus).toHaveBeenCalledWith('u-planner', 'SUSPENDED'));
  });

  it('links planner documents to the uploaded files', async () => {
    render(<PendingLicenseContent type="event_planner" />);
    const doc1 = await screen.findByRole('link', { name: /Document 1/ });
    expect(doc1).toHaveAttribute('href', planner.license_photo[0]);
    expect(doc1).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /Document 2/ })).toHaveAttribute('href', planner.license_photo[1]);
  });

  it('keeps the vendor page on vendor licences with working document links', async () => {
    const user = userEvent.setup();
    render(<PendingLicenseContent type="vendor" />);

    expect(await screen.findByText('Val Catering')).toBeInTheDocument();
    expect(AdminService.getPendingEventPlanners).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Document 1/ })).toHaveAttribute('href', vendor.license_photo[0]);

    await user.click(screen.getByRole('button', { name: 'Approve & Activate' }));
    await waitFor(() => expect(AdminService.updateLicenseStatus).toHaveBeenCalledWith('u-vendor', 'APPROVED'));
  });

  it('says so when there are no documents', async () => {
    (AdminService.getPendingEventPlanners as jest.Mock).mockResolvedValue({ data: { data: [{ ...planner, license_photo: [] }] } });
    render(<PendingLicenseContent type="event_planner" />);
    expect(await screen.findByText('No documents')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
