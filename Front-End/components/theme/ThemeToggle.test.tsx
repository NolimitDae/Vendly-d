import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

describe('theme', () => {
  it('has a label that does not depend on the theme (no server/client mismatch)', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toBeInTheDocument();
  });

  it('applies a saved dark choice after mount', async () => {
    localStorage.setItem('app-theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it('toggles between light and dark and remembers the choice', async () => {
    const user = userEvent.setup();
    localStorage.setItem('app-theme', 'light');
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
    await user.click(screen.getByRole('button', { name: 'Toggle dark mode' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('app-theme')).toBe('dark');
  });
});
