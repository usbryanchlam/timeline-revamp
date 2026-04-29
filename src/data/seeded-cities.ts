import type { CityChapter } from '@/types/reel';

/**
 * W1 hardcoded reel — 10 chapters spanning the globe so the camera shows off
 * cinematic flyTo across continents on the 30-second test. Real photos arrive in W6;
 * for now each chapter ships two gradient placeholders (ramped from the chapter's
 * mood color into deep navy) so the photo-stack composition reads at the right size.
 *
 * Zoom note: chapters land at zoom 11-13.5 so MapTiler vector tiles render
 * city-block-level detail (streets, place labels) under the photo stack. The
 * camera arrives high and pitched for that Apple-Maps-Flyover signature.
 */
export const SEEDED_CITIES: readonly CityChapter[] = [
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    center: [139.7671, 35.6812],
    zoom: 12.5,
    pitch: 55,
    bearing: -18,
    arrivedAt: '2024-03-12',
    caption: 'Neon under rain. Convenience-store onigiri at 2am.',
    photos: [
      { id: 'tokyo-1', gradient: ['#FF7AA2', '#0A0E1A'], alt: 'Shibuya crossing at dusk' },
      { id: 'tokyo-2', gradient: ['#7AB8FF', '#0A0E1A'], alt: 'Tokyo skyline from Mori Tower' },
    ],
  },
  {
    id: 'kyoto',
    name: 'Kyoto',
    country: 'Japan',
    center: [135.7681, 35.0116],
    zoom: 13,
    pitch: 50,
    bearing: 24,
    arrivedAt: '2024-03-18',
    caption: 'Bamboo grove before the tour buses arrived.',
    photos: [
      { id: 'kyoto-1', gradient: ['#7DE3A1', '#0A0E1A'], alt: 'Arashiyama bamboo forest' },
      { id: 'kyoto-2', gradient: ['#E07AFF', '#0A0E1A'], alt: 'Fushimi Inari torii gates' },
    ],
  },
  {
    id: 'seoul',
    name: 'Seoul',
    country: 'South Korea',
    center: [126.978, 37.5665],
    zoom: 12,
    pitch: 48,
    bearing: -8,
    arrivedAt: '2024-04-05',
    caption: 'Grilled pork belly and a karaoke room past midnight.',
    photos: [
      { id: 'seoul-1', gradient: ['#FFB36B', '#0A0E1A'], alt: 'Seoul tower from Namsan' },
      { id: 'seoul-2', gradient: ['#6BD0FF', '#0A0E1A'], alt: 'Bukchon Hanok Village' },
    ],
  },
  {
    id: 'reykjavik',
    name: 'Reykjavik',
    country: 'Iceland',
    center: [-21.9426, 64.1466],
    zoom: 11,
    pitch: 60,
    bearing: 12,
    arrivedAt: '2024-06-21',
    caption: 'Midnight sun. The horizon refused to set.',
    photos: [
      { id: 'reykjavik-1', gradient: ['#9FB8FF', '#0A0E1A'], alt: 'Hallgrímskirkja at sunset' },
      { id: 'reykjavik-2', gradient: ['#7AFFE0', '#0A0E1A'], alt: 'Black sand beach' },
    ],
  },
  {
    id: 'lisbon',
    name: 'Lisbon',
    country: 'Portugal',
    center: [-9.1393, 38.7223],
    zoom: 13,
    pitch: 55,
    bearing: -22,
    arrivedAt: '2024-07-09',
    caption: 'Pastel de nata still warm from the oven.',
    photos: [
      { id: 'lisbon-1', gradient: ['#FFC56B', '#0A0E1A'], alt: 'Tram 28 climbing Alfama' },
      { id: 'lisbon-2', gradient: ['#FF8A7A', '#0A0E1A'], alt: 'Rooftops from São Jorge' },
    ],
  },
  {
    id: 'marrakech',
    name: 'Marrakech',
    country: 'Morocco',
    center: [-7.9811, 31.6295],
    zoom: 13.5,
    pitch: 50,
    bearing: 30,
    arrivedAt: '2024-09-14',
    caption: 'Lost in the souk. Found mint tea instead.',
    photos: [
      { id: 'marrakech-1', gradient: ['#FF9D5C', '#0A0E1A'], alt: 'Jemaa el-Fnaa at dusk' },
      { id: 'marrakech-2', gradient: ['#FFD470', '#0A0E1A'], alt: 'Bahia Palace courtyard' },
    ],
  },
  {
    id: 'cape-town',
    name: 'Cape Town',
    country: 'South Africa',
    center: [18.4241, -33.9249],
    zoom: 11.5,
    pitch: 58,
    bearing: -15,
    arrivedAt: '2024-10-22',
    caption: 'Table Mountain, no clouds, gallery for the day.',
    photos: [
      { id: 'cape-town-1', gradient: ['#5CC8FF', '#0A0E1A'], alt: 'Table Mountain from V&A' },
      { id: 'cape-town-2', gradient: ['#FF7A8A', '#0A0E1A'], alt: 'Bo-Kaap rainbow houses' },
    ],
  },
  {
    id: 'queenstown',
    name: 'Queenstown',
    country: 'New Zealand',
    center: [168.6626, -45.0312],
    zoom: 12,
    pitch: 62,
    bearing: 45,
    arrivedAt: '2025-01-08',
    caption: 'Lake Wakatipu. Quiet that you can hear.',
    photos: [
      { id: 'queenstown-1', gradient: ['#7AC9FF', '#0A0E1A'], alt: 'The Remarkables at dawn' },
      { id: 'queenstown-2', gradient: ['#9FFFB8', '#0A0E1A'], alt: 'Lake Wakatipu jetty' },
    ],
  },
  {
    id: 'cusco',
    name: 'Cusco',
    country: 'Peru',
    center: [-71.9675, -13.5319],
    zoom: 13,
    pitch: 55,
    bearing: -10,
    arrivedAt: '2025-03-11',
    caption: 'Three thousand four hundred meters. Coca leaves help.',
    photos: [
      { id: 'cusco-1', gradient: ['#FFB87A', '#0A0E1A'], alt: 'Plaza de Armas at night' },
      { id: 'cusco-2', gradient: ['#C77AFF', '#0A0E1A'], alt: 'Sacred Valley terraces' },
    ],
  },
  {
    id: 'banff',
    name: 'Banff',
    country: 'Canada',
    center: [-115.5708, 51.1784],
    zoom: 11,
    pitch: 65,
    bearing: 28,
    arrivedAt: '2025-08-02',
    caption: 'Lake Louise the color of a postcard. Worth the drive.',
    photos: [
      { id: 'banff-1', gradient: ['#7AFFC8', '#0A0E1A'], alt: 'Lake Louise turquoise' },
      { id: 'banff-2', gradient: ['#AFC8FF', '#0A0E1A'], alt: 'Moraine Lake reflection' },
    ],
  },
] as const;
