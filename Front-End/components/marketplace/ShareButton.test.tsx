import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShareButton from './ShareButton';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), info: jest.fn() } }));
import { toast } from 'react-toastify';

describe('ShareButton', () => {
  afterEach(() => {
    delete (navigator as any).share;
    delete (navigator as any).clipboard;
    jest.clearAllMocks();
  });

  it('opens the share sheet with the full page link when the browser has one', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    (navigator as any).share = share;
    render(<ShareButton path="/marketplace/l1" title="Wedding buffet" text="Wedding buffet on Vendly" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Wedding buffet', text: 'Wedding buffet on Vendly', url: `${window.location.origin}/marketplace/l1` }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('copies the link when there is no share sheet, and does nothing when the sheet is closed', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };
    render(<ShareButton icon path="/v/bellas-catering" title="Bella's" label="Share shop" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share shop' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/v/bellas-catering`));
    expect(toast.success).toHaveBeenCalledWith('Link copied');

    (navigator as any).share = jest.fn().mockRejectedValue(Object.assign(new Error('closed'), { name: 'AbortError' }));
    writeText.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Share shop' }));
    await waitFor(() => expect((navigator as any).share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });
});
