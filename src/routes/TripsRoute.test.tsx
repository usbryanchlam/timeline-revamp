// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

// Mock the cities query hook for empty + populated cases.
let mockCities: unknown[] = [];
vi.mock('@/api/cities', () => ({
  useCitiesQuery: () => ({ data: mockCities, error: null, refetch: vi.fn() }),
}));

// Stub MapPicker — depends on MapLibre + WebGL which jsdom can't render.
vi.mock('@/components/MapPicker', () => ({
  MapPicker: () => React.createElement('div', { 'data-testid': 'map-picker' }),
}));

// Stub auth hook so useApi works in jsdom without an Auth0 provider.
vi.mock('@/auth/useApi', () => ({
  useApi: () => async () => new Response('{}', { status: 200 }),
}));

// === W4: pre-stub ALL jsdom-hostile TripsRoute imports (DOM/Canvas/WebGL/dnd-kit at module-eval) ===
// TripsRoute.tsx imports the following at module-eval; each touches DOM/Canvas/WebGL/dnd-kit and
// would crash under jsdom. Stub every one with a minimal placeholder so the route's empty-card
// branch can render without dragging in MapLibre/Canvas.
vi.mock('@/components/CityForm', () => ({
  CityForm: () => React.createElement('div', { 'data-testid': 'city-form' }),
}));
vi.mock('@/components/CityList', () => ({
  CityList: () => React.createElement('div', { 'data-testid': 'city-list' }),
}));
vi.mock('@/components/PhotoDetailSheet', () => ({
  PhotoDetailSheet: () => React.createElement('div', { 'data-testid': 'photo-detail-sheet' }),
}));
vi.mock('@/geocode/bigdatacloud', () => ({
  reverseGeocode: async () => ({ city: '', country: '' }),
}));

import { TripsRoute } from './TripsRoute';

describe('TripsRoute — /app/trips 0-city empty-state polish', () => {
  it('renders the new bottom-overlay card with amber arrow glyph when cities=[]', () => {
    mockCities = [];
    render(
      React.createElement(MemoryRouter, null,
        React.createElement(TripsRoute, null),
      ),
    );
    expect(screen.getByText(/tap the map to add your first stop\./i)).toBeInTheDocument();
    // Amber arrow glyph
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('does NOT render the pre-Phase-9 pill copy', () => {
    mockCities = [];
    render(
      React.createElement(MemoryRouter, null,
        React.createElement(TripsRoute, null),
      ),
    );
    expect(screen.queryByText(/drop a pin on the map to start your reel/i)).not.toBeInTheDocument();
  });

  it('does NOT render the empty card when cities are present', () => {
    mockCities = [{ id: 'a', name: 'A', lat: 0, lng: 0, orderIndex: 0 }];
    render(
      React.createElement(MemoryRouter, null,
        React.createElement(TripsRoute, null),
      ),
    );
    expect(screen.queryByText(/tap the map to add your first stop\./i)).not.toBeInTheDocument();
  });

  it('empty card has pointer-events-none so the map underneath stays the CTA', () => {
    mockCities = [];
    const { container } = render(
      React.createElement(MemoryRouter, null,
        React.createElement(TripsRoute, null),
      ),
    );
    // The card is the only element with the empty-state copy.
    const card = screen.getByText(/tap the map to add your first stop\./i).closest('div');
    expect(card?.className).toContain('pointer-events-none');
    // And the GLASS-PILL class is gone.
    expect(container.querySelector('.glass-pill')).toBeNull();
  });
});
