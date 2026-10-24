import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddToTeamButton, TeamEditorDialog } from './VendorTeams';

jest.mock('next/image', () => ({ __esModule: true, default: ({ alt, src }: any) => <img alt={alt} src={src} /> }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
// no wait for the search box in tests
jest.mock('@/hooks/useDebounce', () => ({ useDebounce: (v: unknown) => v }));
jest.mock('@/lib/session', () => ({ ...jest.requireActual('@/lib/session'), isLoggedIn: jest.fn(() => true) }));
jest.mock('@/lib/currentUser', () => ({ whoAmI: jest.fn() }));
jest.mock('@/service/events/eventTools.service', () => ({
  MAX_TEAM_SIZE: 3,
  EventToolsService: { searchTeamVendors: jest.fn(), saveTeam: jest.fn(), teams: jest.fn() },
}));
import { EventToolsService } from '@/service/events/eventTools.service';
import { whoAmI } from '@/lib/currentUser';
import { toast } from 'react-toastify';

const v = (id: string, name: string, category: string | null = 'Catering') => ({ id, name, avatar_url: null, category });

beforeEach(() => {
  jest.clearAllMocks();
  (EventToolsService.saveTeam as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('TeamEditorDialog', () => {
  it('builds a new team from searched vendors who were never booked', async () => {
    (EventToolsService.searchTeamVendors as jest.Mock).mockResolvedValue({ data: { data: [v('v1', 'Gourmet Bites'), v('v2', 'Floral Fantasy', 'Flowers')] } });
    const onSaved = jest.fn();
    const onClose = jest.fn();
    render(<TeamEditorDialog onClose={onClose} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('Team name'), 'Wedding crew');
    await userEvent.type(screen.getByLabelText('Search vendors'), 'cat');
    await waitFor(() => expect(EventToolsService.searchTeamVendors).toHaveBeenLastCalledWith('cat'));
    await userEvent.click(await screen.findByRole('button', { name: 'Add Gourmet Bites' }));

    const results = screen.getByRole('list', { name: 'Search results' });
    expect(within(results).getByText('In team')).toBeInTheDocument();
    expect(screen.getByText('Vendors (1/3)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save team' }));
    expect(EventToolsService.saveTeam).toHaveBeenCalledWith({ name: 'Wedding crew', vendor_ids: ['v1'] }, undefined);
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('edits a team: remove a vendor and save under the same team', async () => {
    const team = { id: 't1', name: 'Crew', vendor_ids: ['v1', 'v2'], vendors: [v('v1', 'Gourmet Bites'), v('v2', 'Floral Fantasy')] };
    render(<TeamEditorDialog team={team} onClose={jest.fn()} onSaved={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Edit team' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Gourmet Bites' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save team' }));
    expect(EventToolsService.saveTeam).toHaveBeenCalledWith({ name: 'Crew', vendor_ids: ['v2'] }, 't1');
  });

  it('stops adding at the size cap', async () => {
    (EventToolsService.searchTeamVendors as jest.Mock).mockResolvedValue({ data: { data: [v('v4', 'Sound Max')] } });
    const team = { id: 't1', name: 'Crew', vendor_ids: ['a', 'b', 'c'], vendors: [v('a', 'A'), v('b', 'B'), v('c', 'C')] };
    render(<TeamEditorDialog team={team} onClose={jest.fn()} onSaved={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Search vendors'), 'sound');
    expect(await screen.findByRole('button', { name: 'Add Sound Max' })).toBeDisabled();
    expect(screen.getByText('A team can have up to 3 vendors.')).toBeInTheDocument();
  });

  it("shows the server's reason when a vendor can't be added", async () => {
    (EventToolsService.saveTeam as jest.Mock).mockRejectedValue({ response: { data: { message: "You can't add someone you've blocked or who has blocked you." } } });
    render(<TeamEditorDialog initialVendors={[v('v1', 'Gourmet Bites')]} onClose={jest.fn()} onSaved={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Team name'), 'Crew');
    await userEvent.click(screen.getByRole('button', { name: 'Save team' }));
    expect(toast.error).toHaveBeenCalledWith("You can't add someone you've blocked or who has blocked you.");
  });

  it('needs a name and a vendor', async () => {
    render(<TeamEditorDialog onClose={jest.fn()} onSaved={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save team' }));
    expect(toast.info).toHaveBeenCalledWith('Give the team a name.');
    await userEvent.type(screen.getByLabelText('Team name'), 'Crew');
    await userEvent.click(screen.getByRole('button', { name: 'Save team' }));
    expect(toast.info).toHaveBeenCalledWith('Add at least one vendor.');
    expect(EventToolsService.saveTeam).not.toHaveBeenCalled();
  });
});

describe('AddToTeamButton', () => {
  const vendor = v('v9', 'Capture The Moment', 'Photography');

  it('is only for planners', async () => {
    (whoAmI as jest.Mock).mockResolvedValue({ id: 'c1', type: 'CUSTOMER' });
    render(<AddToTeamButton vendor={vendor} />);
    await waitFor(() => expect(whoAmI).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /add to team/i })).toBeNull();
  });

  it('adds the vendor to a saved team, keeping the team as it is', async () => {
    (whoAmI as jest.Mock).mockResolvedValue({ id: 'p1', type: 'EVENT_PLANNER' });
    (EventToolsService.teams as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 't1', name: 'Crew', vendor_ids: ['v1'], vendors: [v('v1', 'Gourmet Bites')] }, { id: 't2', name: 'Already', vendor_ids: ['v9'], vendors: [vendor] }] },
    });
    render(<AddToTeamButton vendor={vendor} />);
    await userEvent.click(await screen.findByRole('button', { name: /add to team/i }));
    const panel = await screen.findByRole('dialog', { name: 'Add to a team' });
    expect(within(panel).getByRole('button', { name: /Already \(1\)/ })).toBeDisabled();
    await userEvent.click(within(panel).getByRole('button', { name: /Crew \(1\)/ }));
    expect(EventToolsService.saveTeam).toHaveBeenCalledWith({ name: 'Crew', vendor_ids: ['v1', 'v9'] }, 't1');
    expect(toast.success).toHaveBeenCalledWith('Added Capture The Moment to Crew');
  });

  it('starts a new team with the vendor already in it', async () => {
    (whoAmI as jest.Mock).mockResolvedValue({ id: 'p1', type: 'EVENT_PLANNER' });
    (EventToolsService.teams as jest.Mock).mockResolvedValue({ data: { data: [] } });
    render(<AddToTeamButton vendor={vendor} />);
    await userEvent.click(await screen.findByRole('button', { name: /add to team/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'New team with Capture The Moment' }));
    expect(screen.getByRole('heading', { name: 'New team' })).toBeInTheDocument();
    expect(screen.getByText('Vendors (1/3)')).toBeInTheDocument();
  });
});
