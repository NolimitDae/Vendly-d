import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageButton from './MessageButton';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('@/lib/session', () => ({ ...jest.requireActual('@/lib/session'), isLoggedIn: jest.fn() }));
jest.mock('@/service/chat/chat.service', () => ({ ChatService: { createConversation: jest.fn() } }));
jest.mock('@/lib/currentUser', () => ({ whoAmI: jest.fn() }));
import { whoAmI } from '@/lib/currentUser';
import { isLoggedIn } from '@/lib/session';
import { ChatService } from '@/service/chat/chat.service';
import { toast } from 'react-toastify';

beforeEach(() => {
  jest.clearAllMocks();
  (isLoggedIn as jest.Mock).mockReturnValue(true);
  (whoAmI as jest.Mock).mockResolvedValue({ id: 'c1', type: 'CUSTOMER' });
});

describe('MessageButton', () => {
  it('opens a new chat', async () => {
    (ChatService.createConversation as jest.Mock).mockResolvedValue({ data: { success: true, conversation: { conversation_id: 'c-new' } } });
    render(<MessageButton userId="p1" name="GrandLine Events" />);
    await userEvent.click(screen.getByRole('button', { name: 'Message GrandLine Events' }));
    expect(ChatService.createConversation).toHaveBeenCalledWith('p1');
    expect(push).toHaveBeenCalledWith('/chat/c-new');
  });

  it('reopens the chat you already have', async () => {
    (ChatService.createConversation as jest.Mock).mockResolvedValue({ data: { success: true, conversation: { id: 'c-old' } } });
    render(<MessageButton userId="p1" name="GrandLine Events" />);
    await userEvent.click(screen.getByRole('button', { name: 'Message GrandLine Events' }));
    expect(push).toHaveBeenCalledWith('/chat/c-old');
  });

  it("shows the server's reason when a block stops the chat", async () => {
    (ChatService.createConversation as jest.Mock).mockRejectedValue({ response: { data: { message: "You can't message this person." } } });
    render(<MessageButton userId="p1" name="GrandLine Events" />);
    await userEvent.click(screen.getByRole('button', { name: 'Message GrandLine Events' }));
    expect(toast.error).toHaveBeenCalledWith("You can't message this person.");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Message GrandLine Events' })).toBeEnabled();
  });

  it('asks visitors to log in first', () => {
    (isLoggedIn as jest.Mock).mockReturnValue(false);
    render(<MessageButton userId="p1" name="GrandLine Events" />);
    expect(screen.getByRole('link', { name: /log in to message/i })).toHaveAttribute('href', '/login');
  });

  it('says "Message vendor" on a package or shop, and "Log in to message vendor" when logged out', () => {
    const { unmount } = render(<MessageButton userId="v1" name="Bloom Florals" label="Message vendor" />);
    expect(screen.getByRole('button', { name: 'Message Bloom Florals' })).toHaveTextContent('Message vendor');
    unmount();
    (isLoggedIn as jest.Mock).mockReturnValue(false);
    render(<MessageButton userId="v1" name="Bloom Florals" label="Message vendor" />);
    expect(screen.getByRole('link', { name: /log in to message vendor/i })).toHaveAttribute('href', '/login');
  });

  it("isn't shown to the vendor on their own shop", async () => {
    (whoAmI as jest.Mock).mockResolvedValue({ id: 'v1', type: 'VENDOR' });
    render(<MessageButton userId="v1" name="Bloom Florals" label="Message vendor" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Message Bloom Florals' })).not.toBeInTheDocument());
  });
});
