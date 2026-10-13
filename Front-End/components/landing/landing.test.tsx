import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/(Frond-End)/page';
import Logo from '@/components/brand/Logo';
import LandingMotion from './motion/LandingMotion';

jest.mock('gsap', () => {
  const gsap = {
    registerPlugin: jest.fn(),
    context: jest.fn((fn: () => void) => {
      fn();
      return { revert: jest.fn() };
    }),
    utils: { toArray: jest.fn(() => []) },
    fromTo: jest.fn(),
    set: jest.fn(),
    quickTo: jest.fn(() => jest.fn()),
  };
  return { __esModule: true, gsap, default: gsap };
});
jest.mock('gsap/ScrollTrigger', () => ({ __esModule: true, ScrollTrigger: { refresh: jest.fn() } }));

import { gsap } from 'gsap';

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    onchange: null,
    dispatchEvent: jest.fn(),
  }));
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn(); // not implemented in jsdom
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

beforeEach(() => mockMatchMedia(false));

describe('landing page', () => {
  it('renders every section heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Book trusted vendors\.\s*Pay when the job is done\./);
    for (const name of [
      /From the glam to the gear/,
      /Booked, signed, protected/,
      /Free to list\. Simple to book\./,
      /Join before launch/,
      /Built for everyone at the event/,
      /Held\. Proven\. Paid\./,
      /Questions, answered/,
      /Be on Vendly from day one/,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('contains no invented or premature claims', () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? '';
    for (const banned of [/17K/i, /12\+ countries/i, /91%/, /Ayana|James Hock|Amy Daina/, /milestone/i, /25%/, /48[- ]hour/i]) {
      expect(text).not.toMatch(banned);
    }
    // "escrow" may only appear in the FAQ that says Vendly is not one.
    expect(text.match(/escrow/gi)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('states free listing and a 5% fee, with an example that adds up', () => {
    render(<Home />);
    const pricing = screen.getByRole('heading', { name: /Free to list/ }).closest('section')!;
    const p = within(pricing);
    expect(p.getByText('Free')).toBeInTheDocument();
    expect(p.getByText('5%')).toBeInTheDocument();
    expect(p.getByText('$1,000')).toBeInTheDocument();
    expect(p.getByText('+ $50')).toBeInTheDocument();
    expect(p.getByText('$1,050')).toBeInTheDocument();
  });

  it('sends every primary call to action to vendor sign-up', () => {
    render(<Home />);
    const ctas = screen.getAllByRole('link', { name: /list your business free|become a founding vendor/i });
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    ctas.forEach((a) => expect(a).toHaveAttribute('href', '/register?type=VENDOR'));
  });

  it('switches role tabs by click and keyboard', async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.getByRole('heading', { name: /Plan your event without the chasing/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Vendors' }));
    expect(screen.getByRole('heading', { name: /Run your bookings in one place/ })).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Event planners' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /Every client event, every vendor/ })).toBeInTheDocument();
  });

  it('opens the planner tab when arriving via #planners', async () => {
    window.history.replaceState(null, '', '/#planners');
    render(<Home />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Event planners' })).toHaveAttribute('aria-selected', 'true'));
    window.history.replaceState(null, '', '/');
  });

  it('expands and collapses FAQ answers', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const question = screen.getByRole('button', { name: /Is Vendly an escrow service\?/ });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    await user.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/We call this a held payment/)).toBeVisible();
    await user.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Logo', () => {
  it.each(['mark', 'horizontal'] as const)('%s variant is announced as "Vendly"', (variant) => {
    render(<Logo variant={variant} />);
    expect(screen.getByRole('img', { name: 'Vendly' })).toBeInTheDocument();
  });

  it('stacked variant is announced as "Vendly Marketplace"', () => {
    render(<Logo variant="stacked" tone="dark" />);
    expect(screen.getByRole('img', { name: 'Vendly Marketplace' })).toBeInTheDocument();
  });
});

describe('motion', () => {
  it('loads GSAP when motion is allowed', async () => {
    render(<LandingMotion />);
    await waitFor(() => expect(gsap.registerPlugin).toHaveBeenCalled());
  });

  it('never loads GSAP for users who prefer reduced motion', async () => {
    mockMatchMedia(true);
    render(<LandingMotion />);
    await new Promise((r) => setTimeout(r, 50));
    expect(gsap.registerPlugin).not.toHaveBeenCalled();
    expect(gsap.context).not.toHaveBeenCalled();
  });
});
