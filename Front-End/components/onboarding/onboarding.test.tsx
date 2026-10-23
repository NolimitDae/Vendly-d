import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingChecklist from './OnboardingChecklist';
import OnboardingPopup from './OnboardingPopup';
import type { Onboarding } from '@/service/onboarding/onboarding.service';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...rest }: any) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onClick?.(e); }} {...rest}>{children}</a>
  ),
}));

const markSeen = jest.fn();
let ctx: { data: Onboarding | null } = { data: null };
jest.mock('@/providers/OnboardingProvider', () => ({ useOnboarding: () => ({ ...ctx, markSeen, refresh: jest.fn() }) }));

// jsdom has <dialog> but not its modal methods
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => jest.clearAllMocks());

const customer = (over: Partial<Onboarding> = {}): Onboarding => ({
  role: 'CUSTOMER',
  steps: [
    { key: 'verify_email', title: 'Verify your email', description: 'x', state: 'done' },
    { key: 'verify_id', title: 'Verify your ID', description: 'Keeps everyone safe', state: 'pending', note: 'In review' },
    { key: 'add_card', title: 'Add a card', description: 'Saved with Stripe', state: 'todo' },
    { key: 'profile_photo', title: 'Add a profile photo', description: 'So vendors know you', state: 'todo' },
  ],
  completed: 1,
  total: 4,
  complete: false,
  popup: null,
  visible: true,
  ...over,
});

describe('OnboardingChecklist', () => {
  it('shows progress, ticks, reviews and where to do each step', () => {
    render(<OnboardingChecklist data={customer()} />);
    expect(screen.getByRole('heading', { name: 'Get set up to book' })).toBeInTheDocument();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText(/Verify your email/)).toHaveTextContent('(done)');
    expect(screen.getByText('In review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add a card/ })).toHaveAttribute('href', '/settings/payment-methods');
    // no web page for the photo yet: points to the app instead of a dead link
    expect(screen.queryByRole('link', { name: /profile photo/ })).not.toBeInTheDocument();
    expect(screen.getByText('In the Vendly app')).toBeInTheDocument();
  });

  it('vendor steps link to their pages', () => {
    render(
      <OnboardingChecklist
        data={{
          ...customer(),
          role: 'VENDOR',
          steps: [{ key: 'first_package', title: 'Publish your first package', description: 'x', state: 'todo' }],
        }}
      />,
    );
    expect(screen.getByRole('link', { name: /first package/ })).toHaveAttribute('href', '/vendor/listings/new');
  });
});

describe('OnboardingPopup', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  it('shows the welcome checklist, records it as soon as it shows, and closes', async () => {
    ctx = { data: customer({ popup: 'intro' }) };
    render(<OnboardingPopup />);
    expect(screen.queryByText('Welcome to Vendly')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1300));
    expect(screen.getByRole('heading', { name: 'Welcome to Vendly' })).toBeInTheDocument();
    // recorded on screen, so closing the tab mid-popup doesn't show it again
    expect(markSeen).toHaveBeenCalledWith('intro');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/settings/payment-methods');
    await user().click(screen.getByRole('button', { name: 'I’ll do it later'.replace('’', "'") }));
    expect(screen.queryByText('Welcome to Vendly')).not.toBeInTheDocument();
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it('opening a step from the popup closes it', async () => {
    ctx = { data: customer({ popup: 'intro' }) };
    render(<OnboardingPopup />);
    act(() => jest.advanceTimersByTime(1300));
    await user().click(screen.getByRole('link', { name: 'Get started' }));
    expect(screen.queryByText('Welcome to Vendly')).not.toBeInTheDocument();
  });

  it('says "all set" when everything is done', async () => {
    ctx = { data: customer({ popup: 'complete', complete: true, completed: 4 }) };
    render(<OnboardingPopup />);
    act(() => jest.advanceTimersByTime(1300));
    expect(screen.getByRole('heading', { name: 'You’re all set'.replace('’', "'") })).toBeInTheDocument();
    expect(markSeen).toHaveBeenCalledWith('complete');
    await user().click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('nothing to show, nothing rendered', () => {
    ctx = { data: customer() };
    const { container } = render(<OnboardingPopup />);
    act(() => jest.advanceTimersByTime(2000));
    expect(container).toBeEmptyDOMElement();
  });
});
