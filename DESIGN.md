# DESIGN.md

Source-of-truth design tokens for Timeline. Decisions locked during /plan-design-review on 2026-04-24 against the approved Variant B (Cinematic) direction with Amber accent.

For tokens not yet decided, run `/design-consultation` to expand this file. This is a v1 minimum, not the final shape.

## Reference

The visual bar is **Apple Weather / Apple Maps Flyover** for polish, **a premium travel publication** (Pudding.cool / NYT Magazine) for hierarchy and intent. Mobile-first, dark-mode-first.

Approved mockups:
- Public reel landing (Variant B + Amber): `~/.gstack/projects/usbryanchlam-timeline-revamp/designs/public-reel-landing-20260424/accent-board.html`

## Typography

| Role | Family | Weight | Why |
|---|---|---|---|
| Display (city name 44pt+, chapter title) | Inter Tight | 800 | Optical-size variant kerns better than vanilla Inter at large sizes |
| UI / body / metadata | Inter | 400, 500, 600 | Apple-adjacent, modern, recently updated |
| Mono (timestamps, code) | Geist Mono or JetBrains Mono | 400 | Decide if needed; default to no mono in v1 |
| Fallback | system-ui | — | Only if Google Fonts CDN fails; never the primary face |

**Self-host both Inter and Inter Tight from `/fonts/` in production.** CDN dependency is a perf risk. Variable fonts to keep payload tight.

**Letter-spacing:**
- City name 44pt+: `-0.035em`
- Body: `0`
- All-caps small text (labels, "Playing", chapter numbers): `+0.06em` to `+0.14em`

## Color tokens

```css
/* Dark surface (primary) */
--color-bg:           #0A0E1A;  /* deep navy-black */
--color-bg-elevated:  #1C2845;  /* photo card border, raised surfaces */

/* Type */
--color-text-primary:    #FFFFFF;       /* main type, city names */
--color-text-secondary:  rgba(255,255,255,0.60); /* dates, metadata */
--color-text-tertiary:   rgba(255,255,255,0.40); /* hint text, disabled */

/* Accent (Amber — golden-hour) */
--color-accent:        #FFD470;       /* active pin, current rail dot, CTA hover */
--color-accent-glow:   rgba(255,212,112,0.20); /* halo around active pin */
--color-accent-glow-2: rgba(255,212,112,0.08); /* outer halo */

/* Map roads (vector tile color overrides) */
--color-road-major:    rgba(255,212,112,0.45);
--color-road-minor:    rgba(255,212,112,0.30);
--color-water:         rgba(140,200,240,0.50);

/* Borders */
--color-border-subtle: rgba(255,255,255,0.12);  /* photo card border */
--color-border-glass:  rgba(255,255,255,0.20);  /* pill button border */

/* Glass blur (for top-right CTA pill) */
--bg-glass:            rgba(255,255,255,0.10);
--blur-glass:          blur(20px);
```

**Light theme (system preference fallback):** v1 ships dark-only on the public reel. The authenticated `/app` may follow `prefers-color-scheme: light` for non-reel surfaces (forms, lists). Decide in W3.

## Spacing scale

Use Tailwind defaults (4px base unit) but only these steps:
`px, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24` → `1px, 2px, 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px`

Avoid `5, 7, 9, 10, 11` — they are noise that creates inconsistent rhythms.

## Radius

| Element | Radius |
|---|---|
| Photo card | `12px` |
| Pill button | `999px` (fully rounded) |
| Sheet / modal | `24px` top corners |
| Map pin | `50%` (perfect circle) |
| App phone screen | `38px` (matches iOS device frame) |
| Default button / input | `8px` |

**No** uniform border-radius across all elements. That is AI slop blacklist item #5.

## Shadow / elevation

```css
--shadow-photo:    0 8px 24px rgba(0,0,0,0.4);          /* photo card on dark */
--shadow-modal:    0 30px 80px -30px rgba(0,0,0,0.4);   /* sheet over reel */
--shadow-pin-glow: 0 4px 22px rgba(255,212,112,0.7);    /* amber pin */
```

No decorative shadows on cards just for visual weight. If a card doesn't need to feel raised, no shadow.

## Motion

| Element | Duration | Easing | Why |
|---|---|---|---|
| Camera flyTo between chapters | 2400ms | MapLibre `easeIn` cubic | Reads cinematic, not jarring |
| Photo card cross-fade | 320ms | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Material standard, calm |
| Caption text fade | 240ms | linear | Synced to camera arrival |
| Chapter rail dot active | 180ms | ease-out | Snappy state change |
| Sheet open | 320ms | ease-out | Native-feeling |
| `prefers-reduced-motion`: all of the above clamp to 0ms | — | — | Mandatory |

**Camera bearing change rate:** ≤ 30°/sec. Faster reads as motion-sickness territory.

## Interaction states

(Already specified in the design doc — Empty / 1-city / N-cities / Photo upload / MP4 fail / MapTiler limit / Offline. See `~/.gstack/projects/usbryanchlam-timeline-revamp/bryanlam-main-design-20260423-104825.md` § "Empty and error states.")

## Microcopy voice

Cinematic, unhurried, intentional. Not chatty, not jargon, not marketing.

| Surface | DO | DON'T |
|---|---|---|
| Empty public reel | "No trips yet. Check back soon." | "Oh no! Looks like there's nothing here yet 😢" |
| Photo upload error | "Upload failed. Tap to retry." | "Oops! Something went wrong. Please try again." |
| MP4 ready notification | "Your reel is ready." | "🎉 Your awesome video is now ready to share!" |
| Handle taken | "`bryan` is taken. Try `bryan-2`?" | "Sorry, that username has already been claimed by another user." |
| Onboarding (first city) | "Add your first city." | "Welcome to Timeline! Let's get started by adding your first travel destination." |
| MapTiler degraded | "Map service limited; some detail reduced." | "Unfortunately, due to current network conditions, certain map features may be temporarily unavailable." |

**Rule:** if a string is over 8 words, find a way to cut it. Sentence case (not title case) on all UI strings.

## Iconography

Use **Lucide** (open-source, MIT, Tailwind-compatible). 1.5px stroke at 24px base. No emoji as icons. No icons-in-colored-circles (AI slop #3).

## Components (v1 inventory)

| Component | Notes |
|---|---|
| `<CityCaption />` | 44pt city name + date metadata. The brand. |
| `<PhotoStack />` | 3-card stack of photo thumbnails, fan-style |
| `<ChapterRail />` | Bottom progress rail, 12 segments, amber active fill |
| `<PillCTA />` | Glass-blur pill "Make your own" |
| `<MapCanvas />` | Full-bleed MapLibre + amber pin overlay |
| `<DetailSheet />` | Bottom sheet for photo gallery (W6) |
| `<HandlePicker />` | Username claim form (W4b) |

Each component lives in `src/design-system/` and is the only place that touches its tokens. No inline `bg-[#FFD470]` Tailwind escapes — always reference the variable.

## Responsive breakpoints (v1)

| Width | Treatment |
|---|---|
| 320px (iPhone SE) | Primary target. Test every weekend. |
| 390px (iPhone 13/14/15) | Default design canvas. |
| 768px (iPad portrait) | Letterbox the reel composition (max-width 480px, centered). Same content, more breathing room. |
| ≥1024px (desktop) | Same letterbox. Adds an optional QR code in the corner pointing to the mobile URL. Desktop is "also works," not the target. |

**No bespoke desktop layout in v1.** Defer to v2 if recruiter feedback says it matters.

## What this file does NOT decide

- Bottom-nav visual (Reel | Trips | Me) — decide in W3 against this DESIGN.md.
- Light-theme palette for `/app` private surfaces — decide in W3.
- Detail-sheet photo gallery layout — decide in W6.
- Handle-picker visual — decide in W4b.
- MP4 export progress UI — decide in W10.

When deciding any of these, calibrate against the reference (Apple Weather / Apple Maps Flyover) and the tokens above. New tokens added here, not inline in components.
