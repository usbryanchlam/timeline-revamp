// @vitest-environment jsdom
// CityList tests — covers drag-and-drop list rendering, Photos button wiring,
// and accessibility constraints (tap target, focus-visible ring).

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CityList } from './CityList';
import type { CityDTO } from '@/types/city';

// @dnd-kit uses pointer events; jsdom doesn't ship with them so we mock the
// heavy DnD machinery at the module boundary.
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>(
    '@dnd-kit/core',
  );
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const actual =
    await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => undefined,
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

const CITIES: readonly CityDTO[] = [
  {
    id: 'city-1',
    userId: 'user-1',
    name: 'Paris',
    tripLabel: null,
    lat: 48.8566,
    lng: 2.3522,
    zoom: 10,
    pitch: 0,
    bearing: 0,
    arrivedAt: '2024-06-01T00:00:00.000Z',
    orderIndex: 0,
    caption: null,
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
  },
  {
    id: 'city-2',
    userId: 'user-1',
    name: 'Tokyo',
    tripLabel: null,
    lat: 35.6762,
    lng: 139.6503,
    zoom: 10,
    pitch: 0,
    bearing: 0,
    arrivedAt: '2024-08-15T00:00:00.000Z',
    orderIndex: 1,
    caption: 'Great food',
    createdAt: '2024-08-15T00:00:00.000Z',
    updatedAt: '2024-08-15T00:00:00.000Z',
  },
];

const noop = async () => {};

describe('CityList', () => {
  // ── Baseline rendering ──────────────────────────────────────────────────

  it('renders all city names', () => {
    render(
      <CityList cities={CITIES} onCardClick={noop} onReorder={noop} />,
    );
    expect(screen.getByText('Paris')).toBeTruthy();
    expect(screen.getByText('Tokyo')).toBeTruthy();
  });

  it('renders a Reorder button for each city', () => {
    render(
      <CityList cities={CITIES} onCardClick={noop} onReorder={noop} />,
    );
    const handles = screen.getAllByRole('button', { name: /reorder/i });
    expect(handles).toHaveLength(CITIES.length);
  });

  // ── onPhotosClick absent → no Photos buttons ────────────────────────────

  it('does NOT render Photos buttons when onPhotosClick is undefined', () => {
    render(
      <CityList cities={CITIES} onCardClick={noop} onReorder={noop} />,
    );
    expect(
      screen.queryByRole('button', { name: /view photos/i }),
    ).toBeNull();
  });

  // ── onPhotosClick provided → Photos buttons appear ──────────────────────

  it('renders a Photos button for each city when onPhotosClick is provided', () => {
    render(
      <CityList
        cities={CITIES}
        onCardClick={noop}
        onReorder={noop}
        onPhotosClick={noop}
      />,
    );
    const photosBtns = screen.getAllByRole('button', { name: /view photos for/i });
    expect(photosBtns).toHaveLength(CITIES.length);
  });

  it('Photos button has accessible label for the correct city', () => {
    render(
      <CityList
        cities={CITIES}
        onCardClick={noop}
        onReorder={noop}
        onPhotosClick={noop}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'View photos for Paris' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'View photos for Tokyo' }),
    ).toBeTruthy();
  });

  // ── clicking Photos calls onPhotosClick with the city id ────────────────

  it('clicking Photos calls onPhotosClick with the city id', () => {
    const onPhotosClick = vi.fn();
    render(
      <CityList
        cities={CITIES}
        onCardClick={noop}
        onReorder={noop}
        onPhotosClick={onPhotosClick}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'View photos for Paris' }),
    );
    expect(onPhotosClick).toHaveBeenCalledOnce();
    expect(onPhotosClick).toHaveBeenCalledWith('city-1');
  });

  // ── clicking Photos does NOT call onCardClick (stopPropagation) ─────────

  it('clicking Photos does NOT call onCardClick', () => {
    const onCardClick = vi.fn();
    const onPhotosClick = vi.fn();
    render(
      <CityList
        cities={CITIES}
        onCardClick={onCardClick}
        onReorder={noop}
        onPhotosClick={onPhotosClick}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'View photos for Tokyo' }),
    );
    expect(onPhotosClick).toHaveBeenCalledOnce();
    expect(onCardClick).not.toHaveBeenCalled();
  });

  // ── tap target ──────────────────────────────────────────────────────────

  it('Photos button has min-w-[44px] and min-h-[44px] classes', () => {
    render(
      <CityList
        cities={CITIES}
        onCardClick={noop}
        onReorder={noop}
        onPhotosClick={noop}
      />,
    );
    const btn = screen.getByRole('button', { name: 'View photos for Paris' });
    expect(btn.className).toMatch(/min-w-\[44px\]/);
    expect(btn.className).toMatch(/min-h-\[44px\]/);
  });

  // ── focus-visible amber ring ────────────────────────────────────────────

  it('Photos button has focus-visible amber ring classes', () => {
    render(
      <CityList
        cities={CITIES}
        onCardClick={noop}
        onReorder={noop}
        onPhotosClick={noop}
      />,
    );
    const btn = screen.getByRole('button', { name: 'View photos for Paris' });
    expect(btn.className).toMatch(/focus-visible:ring-2/);
    expect(btn.className).toMatch(/focus-visible:ring-amber-500/);
  });

  // ── onCardClick still fires on card body tap ────────────────────────────

  it('clicking the card body calls onCardClick with the city id', () => {
    const onCardClick = vi.fn();
    render(
      <CityList
        cities={CITIES}
        onCardClick={onCardClick}
        onReorder={noop}
        onPhotosClick={vi.fn()}
      />,
    );
    // The card body button contains the city name text
    fireEvent.click(screen.getByText('Paris'));
    expect(onCardClick).toHaveBeenCalledWith('city-1');
  });
});
