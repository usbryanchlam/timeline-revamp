import type { CityChapter } from '@/types/reel';

/**
 * Hardcoded seeded reel — 9 chapters tracing a real Asia → UK → US itinerary
 * (Jan 2025 → Feb 2026). Each chapter lands at zoom 12–13 with cinematic
 * pitch/bearing so MapTiler vector tiles render city-block-level detail.
 *
 * Photos are served from /public/seed-photos/<city>/N.jpg (vertical CC0
 * Unsplash sources, license: https://unsplash.com/license).
 *
 * Source attribution (chosen via UAT review 2026-06-06):
 *  - hong-kong/1.jpg     https://unsplash.com/photos/cityscape-photography-during-daytime-YmvYdFU4LvE
 *  - taipei/1.jpg        https://unsplash.com/photos/black-high-rise-building-under-blue-sky-during-daytime-Q-Dh_OjmVKw
 *  - okinawa/1.jpg       https://unsplash.com/photos/green-trees-near-body-of-water-during-daytime-XzGVYPD8Nk4
 *  - osaka/1.jpg         https://unsplash.com/photos/people-walking-on-street-during-daytime-9zYjlA4LqTU
 *  - bangkok/1.jpg       https://unsplash.com/photos/blue-auto-rickshaw-on-road-RFumqN-7zI0
 *  - singapore/1.jpg     https://unsplash.com/photos/a-large-body-of-water-with-a-bunch-of-tall-buildings-in-the-background-iVqMkc8A4gM
 *  - melbourne/1.jpg     https://unsplash.com/photos/a-boat-is-docked-at-a-dock-with-a-city-in-the-background-kVCYFRUME7Q
 *  - london/1.jpg        https://unsplash.com/photos/a-large-clock-tower-towering-over-a-city-13jqPjlPwwE
 *  - san-francisco/1.jpg https://unsplash.com/photos/golden-gate-bridge-san-francisco-california-2Or2s-0OcPE
 */
export const SEEDED_CITIES: readonly CityChapter[] = [
  {
    id: 'hong-kong',
    name: 'Hong Kong',
    country: 'Hong Kong',
    center: [114.1694, 22.3193],
    zoom: 12.5,
    pitch: 58,
    bearing: -22,
    arrivedAt: '2025-01-15',
    caption: 'Star Ferry at dusk. Wonton noodles in a back alley.',
    photos: [
      {
        id: 'hong-kong-1',
        masterUrl: '/seed-photos/hong-kong/1.jpg',
        thumbUrl: '/seed-photos/hong-kong/1.jpg',
        alt: 'Hong Kong skyline over Victoria Harbour',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'taipei',
    name: 'Taipei',
    country: 'Taiwan',
    center: [121.5654, 25.033],
    zoom: 12.5,
    pitch: 50,
    bearing: 14,
    arrivedAt: '2025-03-10',
    caption: 'Night market din. Stinky tofu — better than it sounds.',
    photos: [
      {
        id: 'taipei-1',
        masterUrl: '/seed-photos/taipei/1.jpg',
        thumbUrl: '/seed-photos/taipei/1.jpg',
        alt: 'Taipei 101 tower against a blue sky',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'okinawa',
    name: 'Okinawa',
    country: 'Japan',
    center: [127.6809, 26.2124],
    zoom: 12,
    pitch: 55,
    bearing: -10,
    arrivedAt: '2025-06-05',
    caption: 'Turquoise water, no schedule. Beni-imo ice cream.',
    photos: [
      {
        id: 'okinawa-1',
        masterUrl: '/seed-photos/okinawa/1.jpg',
        thumbUrl: '/seed-photos/okinawa/1.jpg',
        alt: 'Okinawa coast — green trees over still water',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'osaka',
    name: 'Osaka',
    country: 'Japan',
    center: [135.5023, 34.6937],
    zoom: 13,
    pitch: 52,
    bearing: 28,
    arrivedAt: '2025-06-22',
    caption: 'Takoyaki off the griddle. Dotonbori signs in the river.',
    photos: [
      {
        id: 'osaka-1',
        masterUrl: '/seed-photos/osaka/1.jpg',
        thumbUrl: '/seed-photos/osaka/1.jpg',
        alt: 'Osaka street scene, pedestrians in daytime',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'bangkok',
    name: 'Bangkok',
    country: 'Thailand',
    center: [100.5018, 13.7563],
    zoom: 12,
    pitch: 50,
    bearing: -15,
    arrivedAt: '2025-07-18',
    caption: 'Tuk-tuk through the heat. Mango sticky rice as therapy.',
    photos: [
      {
        id: 'bangkok-1',
        masterUrl: '/seed-photos/bangkok/1.jpg',
        thumbUrl: '/seed-photos/bangkok/1.jpg',
        alt: 'Blue tuk-tuk on a Bangkok road',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'singapore',
    name: 'Singapore',
    country: 'Singapore',
    center: [103.8198, 1.3521],
    zoom: 12.5,
    pitch: 58,
    bearing: 12,
    arrivedAt: '2025-09-08',
    caption: 'Hawker breakfast. Marina Bay light show after dark.',
    photos: [
      {
        id: 'singapore-1',
        masterUrl: '/seed-photos/singapore/1.jpg',
        thumbUrl: '/seed-photos/singapore/1.jpg',
        alt: 'Singapore skyline across Marina Bay',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'melbourne',
    name: 'Melbourne',
    country: 'Australia',
    center: [144.9631, -37.8136],
    zoom: 12,
    pitch: 55,
    bearing: -8,
    arrivedAt: '2025-11-14',
    caption: 'Yarra River reflections. Coffee snob heaven.',
    photos: [
      {
        id: 'melbourne-1',
        masterUrl: '/seed-photos/melbourne/1.jpg',
        thumbUrl: '/seed-photos/melbourne/1.jpg',
        alt: 'Boat at a Melbourne dock, city skyline behind',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    center: [-0.1276, 51.5074],
    zoom: 12.5,
    pitch: 50,
    bearing: 22,
    arrivedAt: '2026-01-12',
    caption: 'Grey skies, warm pubs. The river always wins.',
    photos: [
      {
        id: 'london-1',
        masterUrl: '/seed-photos/london/1.jpg',
        thumbUrl: '/seed-photos/london/1.jpg',
        alt: 'Westminster clock tower above the London skyline',
        orderIndex: 0,
      },
    ],
  },
  {
    id: 'san-francisco',
    name: 'San Francisco',
    country: 'United States',
    center: [-122.4194, 37.7749],
    zoom: 12.5,
    pitch: 60,
    bearing: -25,
    arrivedAt: '2026-02-20',
    caption: 'Bridge in sunlight. Sourdough still warm at the wharf.',
    photos: [
      {
        id: 'san-francisco-1',
        masterUrl: '/seed-photos/san-francisco/1.jpg',
        thumbUrl: '/seed-photos/san-francisco/1.jpg',
        alt: 'Golden Gate Bridge under a clear blue sky',
        orderIndex: 0,
      },
    ],
  },
] as const;
