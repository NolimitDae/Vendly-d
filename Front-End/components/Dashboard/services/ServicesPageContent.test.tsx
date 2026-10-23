import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ServicesPageContent from './ServicesPageContent';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/service/admin/admin.service', () => ({
  AdminService: {
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    deleteCategory: jest.fn(),
    renameCategory: jest.fn(),
    createSubcategory: jest.fn(),
    renameSubcategory: jest.fn(),
    deleteSubcategory: jest.fn(),
  },
}));
import { AdminService } from '@/service/admin/admin.service';
import { toast } from 'react-toastify';

const ok = { data: { success: true } };
const categories = [
  { id: 'music', name: 'Music & Entertainment', _count: { vendor_listings: 3, sub_categories: 2 }, sub_categories: [{ id: 'dj', name: 'DJ', _count: { vendor_listings: 2 } }, { id: 'band', name: 'Live Band', _count: { vendor_listings: 0 } }] },
  { id: 'food', name: 'Catering & Food', _count: { vendor_listings: 0, sub_categories: 0 }, sub_categories: [] },
];

beforeEach(() => {
  jest.clearAllMocks();
  (AdminService.getCategories as jest.Mock).mockResolvedValue({ data: { success: true, data: categories } });
  for (const k of ['createCategory', 'deleteCategory', 'renameCategory', 'createSubcategory', 'renameSubcategory', 'deleteSubcategory']) (AdminService as any)[k].mockResolvedValue(ok);
  window.confirm = jest.fn(() => true);
});

describe('ServicesPageContent', () => {
  it('lists categories and finds one by a sub-category name', async () => {
    render(<ServicesPageContent />);
    expect(await screen.findByText('Music & Entertainment')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Find a category' }), 'dj');
    expect(screen.getByText('Music & Entertainment')).toBeInTheDocument();
    expect(screen.queryByText('Catering & Food')).not.toBeInTheDocument();
  });

  it('renames a category with Enter', async () => {
    render(<ServicesPageContent />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Catering & Food' }));
    const input = screen.getByRole('textbox', { name: 'New name for Catering & Food' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Food & Drink{Enter}');
    await waitFor(() => expect(AdminService.renameCategory).toHaveBeenCalledWith('food', 'Food & Drink'));
    expect(toast.success).toHaveBeenCalledWith('Category renamed');
  });

  it('adds, renames and deletes sub-categories', async () => {
    render(<ServicesPageContent />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show sub-categories of Music & Entertainment' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New sub-category in Music & Entertainment' }), 'MC / Host');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(AdminService.createSubcategory).toHaveBeenCalledWith('music', 'MC / Host'));

    await userEvent.click(screen.getByRole('button', { name: 'Delete DJ' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 packages keep their category'));
    await waitFor(() => expect(AdminService.deleteSubcategory).toHaveBeenCalledWith('dj'));
  });

  it('warns what deleting a category takes with it', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    render(<ServicesPageContent />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Music & Entertainment' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('its 2 sub-categories and the category on 3 packages'));
    expect(AdminService.deleteCategory).not.toHaveBeenCalled();
  });

  it('shows the server reason when a save fails', async () => {
    (AdminService.createCategory as jest.Mock).mockRejectedValue({ response: { data: { message: 'Category with this name already exists' } } });
    render(<ServicesPageContent />);
    await screen.findByText('Music & Entertainment');
    await userEvent.type(screen.getByRole('textbox', { name: 'New category name' }), 'Venues');
    await userEvent.click(screen.getByRole('button', { name: /Add category/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Category with this name already exists'));
  });
});
