# Design System — Timeline

**Memorable thing:** the motion. The map flies like a movie. Every decision below serves that.

## Product Context

- **What this is:** a cinematic travel-memory reel, mobile-first. The map is the canvas; time is the axis you scrub. Click pins → fly between cities → photos overlay → chapters tick.
- **Who it's for:** hiring managers reviewing a portfolio link on a phone in ~30 seconds. Low patience, high visual discrimination, no domain context.
- **Space/industry:** travel journal apps (memory-first category — Polarsteps, TripMemo, Day One adjacent).
- **Project type:** web app + public landing page. Mobile-first, fully responsive. Desktop is the also-works surface.
- **Reference bar:** Apple Weather / Apple Maps Flyover for polish; a premium travel publication (Kinfolk, Pudding.cool) for hierarchy and intent.
- **Approved mockups:**
  - Wireframe board: `~/.gstack/projects/usbryanchlam-timeline-revamp/designs/public-reel-landing-20260424/wireframe-board.html`
  - Accent comparison: `~/.gstack/projects/usbryanchlam-timeline-revamp/designs/public-reel-landing-20260424/accent-board.html`
  - System preview: `/private/tmp/timeline-design-preview.html`

## Aesthetic Direction

- **Direction:** Cinematic-Editorial Hybrid. Editorial restraint (typographic hierarchy, generous whitespace, single accent) wrapped around a cinematic core (camera motion as the primary delight surface).
- **Decoration level:** Minimal. The motion does the decorative work. No background patterns, no decorative blobs, no SVG illustration as chrome.
- **Mood:** unhurried, intentional, design-grade. Confidence without showing off. The recruiter feels craft before they understand the product.
- **Three deliberate risks taken** (locked, do not re-litigate):
  1. **Single-accent palette.** Only amber. Every appearance is meaningful.
  2. **Arrival-pulse signature easing.** Custom `cubic-bezier(0.16, 1, 0.3, 1)` with overshoot for photo card landing. Different from every other UI motion.
  3. **No empty-state illustrations, ever.** Brutalist photographic intent. Photos and the map are the only imagery.

## Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| Display | Inter Tight | 800 | Optical-size variant, kerns large headlines. ALWAYS for 32px+ |
| Body / UI | Inter | 400, 500, 600 | Apple-adjacent, modern, well-supported |
| Tabular | Inter | 400 with `font-variant-numeric: tabular-nums` | Trip durations, photo counts, dates |
| Code / Mono | (none in v1) | — | Add JetBrains Mono only if "view JSON" or share-link surfaces appear |
| Fallback | system-ui, sans-serif | — | Only if Google Fonts CDN fails. Never the primary face. |

**Loading:** Self-host both Inter and Inter Tight from `/fonts/` in production. Use variable-font subsets (`weight 400-800`, Latin only) to keep payload tight. Preload the woff2 of Inter Tight 800 for the LCP poster.

**Modular scale (CSS custom properties):**

```css
/* Display — Inter Tight 800, hairline letter-spacing */
--text-display-2xl: 88px / 1.0  / -0.04em;   /* OG image hero only */
--text-display-xl:  56px / 1.0  / -0.035em;  /* public reel city name on tablet+ */
--text-display-lg:  44px / 0.95 / -0.035em;  /* public reel city name mobile (DEFAULT) */
--text-display-md:  32px / 1.0  / -0.025em;  /* Trips view headers */

/* Heading — Inter 600-700 */
--text-h1: 24px / 1.2 / -0.015em;   /* modal/sheet titles */
--text-h2: 20px / 1.3 / -0.01em;    /* section headers */
--text-h3: 16px / 1.4 / -0.005em;   /* card titles */

/* Body — Inter 400-500 */
--text-lg:    18px / 1.5 / 0;
--text-base:  16px / 1.5 / 0;       /* DEFAULT */
--text-sm:    14px / 1.5 / 0;
--text-xs:    12px / 1.4 / +0.04em; /* metadata, dates */

/* All-caps — Inter 600 */
--text-caps:    11px / 1.0 / +0.14em;  /* "PLAYING", section labels */
--text-caps-sm: 10px / 1.0 / +0.18em;  /* micro labels, chapter numbers */

/* Tabular — Inter 400 with tabular-nums */
--text-tabular: 14px / 1.4 / +0.02em;
```

Letter-spacing is part of the spec, not optional. The 44pt city name with `-0.035em` looks intentional; with `0` it looks like a default.

## Color

- **Approach:** Restrained — single accent + neutrals. Color is rare and meaningful.
- **Default theme:** dark. The public reel is always dark. The authenticated `/app` may switch to light per `prefers-color-scheme`, decided in W3.

```css
/* Neutrals (cool, low-saturation) */
--neutral-0:    #FFFFFF;   /* text-primary on dark, surface on light */
--neutral-50:   #F4F5F7;   /* light surface (bg in light theme) */
--neutral-100:  #E5E7EB;   /* light border */
--neutral-400:  #9CA3AF;   /* light muted text */
--neutral-700:  #374151;   /* light surface elevated */
--neutral-900:  #1C2845;   /* dark surface elevated, photo card border */
--neutral-950:  #0A0E1A;   /* dark bg primary, public reel */

/* Accent — Amber (golden-hour, single signature color) */
--amber-400:    #FFE4A0;   /* hover state, lighter active */
--amber-500:    #FFD470;   /* PRIMARY accent: pin, rail, CTA */
--amber-600:    #E8B040;   /* pressed state, focus ring at 1.0 alpha */

/* Semantic (sparing — most UI uses neutrals + amber) */
--success-500:  #4ADE80;   /* city saved, photo uploaded, MP4 ready */
--warning-500:  #F59E0B;   /* rate limit warning, MapTiler degraded */
--error-500:    #EF4444;   /* upload failed, validation */

/* Map-specific (vector tile color overrides) */
--map-water:      rgba(140,200,240,0.50);
--map-road-major: rgba(255,212,112,0.45);   /* amber roads at golden-hour */
--map-road-minor: rgba(255,212,112,0.30);
--map-park:       rgba(74,222,128,0.10);    /* very subtle green */

/* Glass / blur */
--bg-glass:        rgba(255,255,255,0.10);
--blur-glass:      blur(20px);

/* Borders */
--color-border-subtle: rgba(255,255,255,0.12);  /* photo card border, dark theme */
--color-border-glass:  rgba(255,255,255,0.20);  /* pill button border, dark theme */
--color-focus-ring:    rgba(255,212,112,0.25);  /* 3px ring, all themes */
```

**Theme-mapped tokens:**

```css
[data-theme="dark"] {
  --bg: var(--neutral-950);
  --surface: var(--neutral-900);
  --text: var(--neutral-0);
  --muted: rgba(255,255,255,0.60);
  --accent: var(--amber-500);
  --border: var(--color-border-subtle);
}
[data-theme="light"] {
  --bg: var(--neutral-50);
  --surface: var(--neutral-0);
  --text: var(--neutral-950);
  --muted: var(--neutral-400);
  --accent: var(--amber-600);   /* slightly darker amber for AA contrast on white */
  --border: var(--neutral-100);
}
```

**Dark-mode strategy:** redesign surfaces, do not just invert. Dark theme reduces accent saturation by using `amber-500` (lighter) for type/icon accents and reserves `amber-600` for pressed states. Light theme inverts that: `amber-600` for icons (better contrast), `amber-500` for hover states.

## Spacing

- **Base unit:** 4px (Tailwind default).
- **Density:** Comfortable. Reel hero is generous (24-32px gutters); `/app` views are 16-24px.
- **Curated steps (don't use everything Tailwind offers):**

```
px (1px) · 0.5 (2px) · 1 (4px) · 2 (8px) · 3 (12px) · 4 (16px) ·
6 (24px) · 8 (32px) · 12 (48px) · 16 (64px) · 24 (96px)
```

Avoid `5, 7, 9, 10, 11`. They create inconsistent rhythms.

## Layout

- **Approach:** Hybrid — grid-disciplined for `/app` surfaces, creative-editorial for the public reel hero.
- **Grid:** 4-col on mobile (≤480px), 8-col on tablet (768-1024px), 12-col on desktop (≥1280px). Default gutter 24px.
- **Max content width:** 1280px on desktop for `/app` surfaces. Public reel is full-bleed up to 480px wide, then letterboxed center.
- **Border radius (hierarchical, not uniform — uniform radii are AI slop):**

| Element | Radius |
|---|---|
| Default button / input | `8px` |
| Photo card / thumbnail | `12px` |
| Sheet / modal | `24px` top corners only |
| Pill button / accent CTA | `999px` (fully rounded) |
| Map pin | `50%` (perfect circle) |
| App phone mock frame | `38px` (matches iOS 14+ device) |

**No** uniform radius across all elements. Critical for avoiding the AI-slop bubble look.

## Shadow / elevation

```css
/* Photo card on dark surface */
--shadow-photo:    0 8px 24px rgba(0,0,0,0.4);

/* Sheet/modal over reel */
--shadow-modal:    0 30px 80px -30px rgba(0,0,0,0.4);

/* The amber pin (signature) */
--shadow-pin-glow: 0 0 0 8px rgba(255,212,112,0.20),
                   0 0 0 22px rgba(255,212,112,0.08),
                   0 4px 22px rgba(255,212,112,0.70);
```

No decorative shadows on cards just for visual weight. If a card doesn't need to feel raised, no shadow.

## Motion (the memorable thing)

This is the signature system. Every decision serves "the map flew like a movie."

**Easing curves:**

```css
--ease-camera:  cubic-bezier(0.25, 0.1, 0.25, 1.0);   /* map flyTo. Long, settling. */
--ease-arrival: cubic-bezier(0.16, 1, 0.3, 1);        /* SIGNATURE. Photo card lands. Slight overshoot. */
--ease-ui:      cubic-bezier(0.4, 0, 0.2, 1);         /* Material standard. Buttons, sheets. */
--ease-exit:    cubic-bezier(0.4, 0, 1, 1);           /* Sheet dismiss, card disappear. */
```

**Duration scale:**

```css
--motion-instant:    0ms;     /* prefers-reduced-motion clamp */
--motion-snap:       120ms;   /* button press, chapter rail dot active */
--motion-quick:      240ms;   /* caption fade, overlay reveal, theme transition */
--motion-arrive:     320ms;   /* photo card arrival (uses ease-arrival) */
--motion-cinematic:  2400ms;  /* map flyTo between chapters (uses ease-camera) */
--motion-orbit:      8000ms;  /* single-city orbit camera, full revolution */
```

**Per-interaction class:**

| Interaction | Duration | Easing |
|---|---|---|
| Map `flyTo` chapter change | `--motion-cinematic` | `--ease-camera` |
| Photo card arrival | `--motion-arrive` | `--ease-arrival` |
| Pin glow pulse (synced to arrival) | 180ms | `--ease-arrival` |
| Caption text fade in | `--motion-quick` | linear |
| Chapter rail dot active | `--motion-snap` | `--ease-ui` |
| Button hover | `--motion-quick` | `--ease-ui` |
| Sheet open | 320ms | `--ease-ui` |
| Sheet dismiss | `--motion-quick` | `--ease-exit` |
| Theme toggle | `--motion-quick` | `--ease-ui` |
| Single-city orbit (1-city case) | `--motion-orbit` | linear |

**The signature beat:** every chapter change triggers the **arrival pulse** — the photo card lands with `--ease-arrival`'s slight overshoot, paired with a 180ms amber pin-glow pulse. That tactile beat is the brand.

**Camera bearing change rate:** ≤ 30°/sec. Faster reads as motion-sickness territory.

**`prefers-reduced-motion: reduce`** mandatory: clamps all of the above to 0ms. Reel falls back to a static chapter list with the same content. No exceptions.

## Iconography

- **Library:** Lucide (MIT license, Tailwind-friendly, comprehensive). 1.5px stroke at 24px base.
- **Custom-drawn (only):**
  - **Active map pin** — 16px circle with amber gradient + glow halo SVG, animated via `--shadow-pin-glow` and `--ease-arrival`.
  - **Chapter rail dot** — 2px tall amber-fill bar segment.
- **Never:** icons-in-colored-circles, emoji as icons, decorative blobs.

## Illustration

**None as chrome in v1.** Brutalist photographic intent. Empty states use the world-view map (0 cities), photos (≥1 cities), or the orbit camera (1 city). The photographs ARE the imagery.

**One tasteful exception (decided as a hedge during design review):** authenticated `/app` empty states (e.g., 0-trips on first signup) may use a single Lucide line-icon at 48px in `--muted` color, no character mascot. The public surfaces are illustration-free, full stop.

## Microcopy voice

Cinematic, unhurried, intentional. Sentence case. No marketing speak. No emoji. No exclamation marks (except as proper sentence terminators in user-entered notes).

| Surface | DO | DON'T |
|---|---|---|
| Empty public reel | "No trips yet. Check back soon." | "Oh no! Nothing here yet 😢" |
| Photo upload error | "Upload failed. Tap to retry." | "Oops! Something went wrong." |
| MP4 ready notification | "Your reel is ready." | "🎉 Your awesome video is ready to share!" |
| Handle taken | "`bryan` is taken. Try `bryan-2`?" | "Sorry, that username has already been claimed." |
| Onboarding (first city) | "Add your first city." | "Welcome to Timeline! Let's get started…" |
| MapTiler degraded | "Map service limited; some detail reduced." | "Due to current network conditions, certain features may be unavailable." |
| 30-second tagline | "Timeline — your travels, as a movie." | "Welcome to the future of travel journaling." |

**Rules:**
- If a string is over 8 words, find a way to cut it.
- Sentence case, never title case.
- Em-dash (`—`) for narrative pauses, not as decoration.
- "Make your own →" with the arrow is the canonical CTA. The arrow is part of the brand.

## OG image strategy

Per public reel URL (`timeline.bryanlam.dev/u/:handle`):
- Server-renders a 1200×630 PNG cached for 24h.
- Pre-rendered first chapter screenshot of the user's reel.
- 88pt city name overlay (Inter Tight 800, white, `-0.04em`).
- "TIMELINE" mark in 11pt all-caps amber, bottom-left.
- Amber pin with glow halo at the city's lat/lng on the map.
- Regenerated on city add/delete/reorder.

Implementation: a `/api/og/:handle.png` endpoint served by Hono using `@vercel/og` (Satori) or Puppeteer (already in stack for MP4 worker). Cache in OCI Object Storage `public/og/{handle}.png`.

## Favicon / app icon

- **`favicon.svg`** (light) — just the amber pin (16×16 SVG). No "T", no Timeline text.
- **`favicon-dark.svg`** — same pin against transparent background, for dark UA.
- **`apple-touch-icon.png`** (180×180) — amber pin on `--neutral-950` rounded square.
- **PWA manifest icons:**
  - `icon-192.png` — amber pin on dark, with subtle map-grid texture in background.
  - `icon-512.png` — same, 512×512, maskable for Android adaptive icons.

The favicon is *just the pin*. That's the brand mark.

## Components (v1 inventory)

| Component | Notes |
|---|---|
| `<CityCaption />` | 44pt city name + tabular date. The hero brand element. |
| `<PhotoStack />` | 3-card stack of photo thumbnails, fanned-out 8/16px, animated via `--ease-arrival`. |
| `<ChapterRail />` | Bottom progress rail, 12 segments, amber active fill. |
| `<PillCTA />` | Glass-blur pill "Make your own" with `→` arrow. Top-right of public reel. |
| `<MapCanvas />` | Full-bleed MapLibre + amber pin overlay component. |
| `<DetailSheet />` | Bottom sheet for photo gallery and city detail (W6). |
| `<HandlePicker />` | Username claim form (W4b) with reserved-word check. |
| `<TripCard />` | `/app` Trips list row: thumb + name + date + amber meta label. |
| `<AddCitySheet />` | Map-picker map + form. Default `/app` "add" flow (W5). |
| `<ThemeToggle />` | Pill button, system preference default + override. |

Each component lives in `src/design-system/` and is the *only* place that touches its tokens. No inline `bg-[#FFD470]` Tailwind escapes — always reference the variable.

## Responsive breakpoints

| Width | Treatment |
|---|---|
| 320px (iPhone SE) | Primary target. Test every weekend. City name drops to `--text-display-md` (32px) if it overflows. |
| 390px (iPhone 13/14/15) | Default design canvas. `--text-display-lg` (44px) city name. |
| 768px (iPad portrait) | Letterbox the reel composition (max-width 480px, centered). Same content, more breathing room. `--text-display-xl` (56px) city name. |
| ≥1024px (desktop) | Same letterbox. Add an optional QR code in the corner pointing to mobile URL. Desktop is "also works," not the target. |

**No bespoke desktop layout in v1.** Defer to v2 if recruiter feedback says it matters.

## Accessibility (locked from /plan-eng-review)

- **`prefers-reduced-motion: reduce`** triggers a static-chapter view: vertical list of city cards with photo + caption + date, scroll-native. Same data, no motion. Lighthouse-clean. Mandatory in W2.
- **Keyboard controls** for the reel: Left/Right = scrub ±1s, Up/Down = chapter prev/next, Space = play/pause, Enter = open detail, Esc = close sheet.
- **ARIA:** reel container is `role="region"` with `aria-label`. Chapter transitions fire `aria-live="polite"` ("Kyoto, October 2024"). Photo overlays have `alt` from user-entered captions (empty-alt if no caption — decorative).
- **Focus trap** in detail sheet, `Esc` closes, focus returns to invoking element.
- **Color contrast** audited to WCAG AA on overlay text against worst-case (bright photo) backgrounds; overlay has a gradient scrim. Light theme uses `--amber-600` for AA contrast on white.
- **Touch targets ≥44×44px** on all interactive surfaces.

## What this file does NOT decide

These are deferred to specific weekends, with calibration against this DESIGN.md when reached:

- Bottom-nav visual (Reel | Trips | Me) — final visual decided in W3.
- Light-theme palette for `/app` private surfaces — decide in W3 against `prefers-color-scheme: light`.
- Detail-sheet photo gallery layout — decide in W6 with `/design-shotgun` if needed.
- Handle-picker visual + reserved-word UX — decide in W4b.
- MP4 export progress UI (notification card) — decide in W10.
- Onboarding `<TripCard />` empty-state line-icon — pick from Lucide in W7.

When deciding any of these, calibrate against the reference (Apple Weather / Apple Maps Flyover) and the tokens above. Add new tokens to this file, never inline.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-23 | Variant B (Cinematic) chosen as visual direction | /plan-design-review wireframe board. Recruiter audience demands premium-product polish; Cinematic Apple-adjacent feel beats editorial or memoir for that signal. |
| 2026-04-23 | Inter Tight 800 + Inter type pair | /plan-design-review. Free, optical-size variant kerns large headlines, modern, well-supported. |
| 2026-04-23 | Amber `#FFD470` accent + dark `#0A0E1A` bg | /plan-design-review. Single signature color; warm against cool dark map; "alive" pulse reads as travel-warm. |
| 2026-04-25 | Cinematic-Editorial Hybrid as named direction | /design-consultation. Editorial restraint with cinematic core matches the product better than a single standard-catalog direction. |
| 2026-04-25 | Single-accent palette (Risk 1) | /design-consultation. Maximum memorability over flexibility. Every appearance of amber is meaningful. |
| 2026-04-25 | Arrival-pulse signature easing curve `cubic-bezier(0.16, 1, 0.3, 1)` (Risk 2) | /design-consultation. The motion is the memorable thing; a custom easing for photo-card landing is the unique tactile beat that becomes the brand's body language. |
| 2026-04-25 | No empty-state illustrations on public surfaces (Risk 3) | /design-consultation. Brutalist photographic intent. Photos and the map are the only imagery. Hedged with a single Lucide line-icon for `/app` private empty states. |
| 2026-04-25 | OG image strategy: server-rendered 1200×630 PNG with city name + amber pin per user reel | /design-consultation. The OG card is the second chance to win the recruiter, before they even click. Cache 24h, regen on edit. |
| 2026-04-25 | Favicon = just the amber pin, no text mark | /design-consultation. The pin IS the brand. |
