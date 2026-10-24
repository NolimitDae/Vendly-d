import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspirationPhotos, InspirationPhotosPicker } from './InspirationPhotos';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
import { toast } from 'react-toastify';

const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = jest.fn(() => `blob:preview-${++n}`);
  URL.revokeObjectURL = jest.fn();
});
beforeEach(() => jest.clearAllMocks());

describe('InspirationPhotosPicker', () => {
  it('adds photos, previews them and removes one', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<InspirationPhotosPicker onChange={onChange} />);
    expect(screen.getByText('Drop your images here (max 10)')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Add inspiration photos'), [jpg('a.jpg'), jpg('b.jpg')]);
    expect(screen.getAllByRole('img', { name: /inspiration photo \d/i })).toHaveLength(2);
    expect(onChange).toHaveBeenLastCalledWith([expect.any(File), expect.any(File)]);
    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(onChange.mock.lastCall[0].map((f: File) => f.name)).toEqual(['b.jpg']);
  });

  it('takes dropped files and stops at 10', () => {
    const onChange = jest.fn();
    render(<InspirationPhotosPicker onChange={onChange} />);
    const zone = screen.getByRole('button', { name: /drop your images here/i });
    fireEvent.drop(zone, { dataTransfer: { files: Array.from({ length: 12 }, (_, i) => jpg(`${i}.jpg`)) } });
    expect(onChange.mock.lastCall[0]).toHaveLength(10);
    expect(toast.error).toHaveBeenCalledWith('You can add up to 10 photos.');
    // full: the drop zone goes away
    expect(screen.queryByRole('button', { name: /drop your images here/i })).toBeNull();
  });

  it('refuses files that are not photos', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onChange = jest.fn();
    render(<InspirationPhotosPicker onChange={onChange} />);
    await user.upload(screen.getByLabelText('Add inspiration photos'), [new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' }), jpg('a.jpg')]);
    expect(toast.error).toHaveBeenCalledWith('Photos must be JPEG, PNG, WebP or GIF, under 10 MB each.');
    expect(onChange.mock.lastCall[0].map((f: File) => f.name)).toEqual(['a.jpg']);
  });
});

describe('InspirationPhotos', () => {
  it('shows the signed links as thumbnails, and nothing without photos', () => {
    const { container, rerender } = render(<InspirationPhotos urls={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<InspirationPhotos urls={['https://api.test/api/request-photos/a', 'https://api.test/api/request-photos/b']} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Inspiration photo 1 of 2' })).toHaveAttribute('src', 'https://api.test/api/request-photos/a');
  });
});
