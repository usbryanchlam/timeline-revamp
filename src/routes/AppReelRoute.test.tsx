// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

// Mock the cities query hook — return [] so the 0-cities branch renders.
vi.mock('@/api/cities', () => ({
  useCitiesQuery: () => ({ data: [], error: null, refetch: vi.fn() }),
}));

// Reel transitively pulls MapLibre — but the 0-cities branch returns BEFORE
// AppReelContent mounts. Stub usePrefersReducedMotion for symmetry.
vi.mock('@/reel/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => false }));

import { AppReelRoute } from './AppReelRoute';

describe('AppReelRoute — ERR-04 empty state (CONTEXT-locked copy)', () => {
  it('renders the locked 0-cities card with amber Add-a-city CTA', () => {
    render(
      React.createElement(MemoryRouter, null,
        React.createElement(AppReelRoute, null),
      ),
    );
    expect(screen.getByRole('heading', { name: /no trips yet\./i })).toBeTruthy();
    expect(screen.getByText(/add your first city to start the camera flying\./i)).toBeTruthy();
    const cta = screen.getByRole('link', { name: /add a city/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('href')).toBe('/app/trips');
    expect(cta.className).toContain('bg-amber-500');
  });

  it('does NOT render the pre-Phase-9 copy "Your reel will appear here."', () => {
    render(
      React.createElement(MemoryRouter, null,
        React.createElement(AppReelRoute, null),
      ),
    );
    expect(screen.queryByText(/your reel will appear here\./i)).toBeNull();
  });
});
