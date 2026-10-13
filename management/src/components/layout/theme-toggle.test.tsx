import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('stores and applies an explicit browser theme preference', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('petlibro-management-theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: 'Use light theme' }),
    ).toBeInTheDocument();
  });
});
