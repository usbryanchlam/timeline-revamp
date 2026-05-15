// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrbitReducedMotionReel } from './OrbitReducedMotionReel';
import { GlobeReducedMotionReel } from './GlobeReducedMotionReel';
import type { CityDTO } from '@/types/city';
import type { PublicReelPhotoDTO } from '@/api/publicReel';

function city(): CityDTO {
  return {
    id: 'c1',
    userId: 'u1',
    orderIndex: 0,
    name: 'Kyoto',
    tripLabel: null,
    lat: 35.0,
    lng: 135.7,
    zoom: 14,
    pitch: 60,
    bearing: 0,
    arrivedAt: '2026-04-01T00:00:00.000Z',
    caption: 'spring rain on bamboo',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };
}

function photo(id: string, order: number): PublicReelPhotoDTO {
  return {
    id,
    cityId: 'c1',
    masterUrl: `https://oci.test/master/${id}.jpg`,
    thumbUrl: `https://oci.test/thumb/${id}.jpg`,
    orderIndex: order,
  };
}

describe('OrbitReducedMotionReel', () => {
  it('renders the city name as a header', () => {
    render(<OrbitReducedMotionReel city={city()} photos={[]} />);
    expect(screen.getByText('Kyoto')).toBeTruthy();
  });

  it('renders one <img> per photo with thumbUrl as src', () => {
    const photos = [photo('a', 0), photo('b', 1), photo('c', 2)];
    const { container } = render(
      <OrbitReducedMotionReel city={city()} photos={photos} />,
    );
    // <img alt=""> is implicit role="presentation", so getAllByRole('img')
    // returns 0. Query the DOM directly for <img> elements.
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(3);
    expect(imgs[0]!.getAttribute('src')).toBe('https://oci.test/thumb/a.jpg');
    expect(imgs[1]!.getAttribute('src')).toBe('https://oci.test/thumb/b.jpg');
    expect(imgs[2]!.getAttribute('src')).toBe('https://oci.test/thumb/c.jpg');
  });

  it('renders no image list when photos is empty', () => {
    const { container } = render(
      <OrbitReducedMotionReel city={city()} photos={[]} />,
    );
    expect(container.querySelectorAll('img').length).toBe(0);
  });
});

describe('GlobeReducedMotionReel', () => {
  it('renders the literal caption "No trips yet. Check back soon."', () => {
    render(<GlobeReducedMotionReel />);
    expect(screen.getByText('No trips yet. Check back soon.')).toBeTruthy();
  });
});
