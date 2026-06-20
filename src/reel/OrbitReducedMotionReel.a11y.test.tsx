// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from '../../test/setup';
import { OrbitReducedMotionReel } from './OrbitReducedMotionReel';
import type { CityDTO } from '@/types/city';
import type { PublicReelPhotoDTO } from '@/api/publicReel';

const mockCity: CityDTO = {
  id: 'c-1',
  userId: 'u-1',
  orderIndex: 0,
  name: 'Kyoto',
  tripLabel: null,
  lat: 35.0,
  lng: 135.7,
  zoom: 12,
  pitch: 0,
  bearing: 0,
  arrivedAt: '2024-10-01T00:00:00.000Z',
  caption: 'Autumn temples.',
  createdAt: '2024-10-01T00:00:00.000Z',
  updatedAt: '2024-10-01T00:00:00.000Z',
};

const mockPhotos: readonly PublicReelPhotoDTO[] = [
  { id: 'p1', masterUrl: 'https://example.com/m1.jpg', thumbUrl: 'https://example.com/t1.jpg', orderIndex: 0 },
];

describe('OrbitReducedMotionReel — A11Y-01 hard gate + A11Y-03 landmark', () => {
  it('renders with zero axe violations', async () => {
    const { container } = render(
      <OrbitReducedMotionReel city={mockCity} photos={mockPhotos} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('exposes role=region with aria-label', () => {
    const { container } = render(
      <OrbitReducedMotionReel city={mockCity} photos={mockPhotos} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toMatch(/.+/);
  });
});
