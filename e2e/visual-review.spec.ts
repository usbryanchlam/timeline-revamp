import { test, devices } from '@playwright/test';

// Phase 11-03 Task 1: v1.0.0 visual-review matrix.
// Captures 5 routes × 2 themes = 10 PNGs via Playwright iPhone 13 emulation
// against `bun run preview` (vite preview, port 4173). Output sits at
// docs/visual-review/v1.0.0/{slug}-{theme}.png. Human verdicts land in
// docs/visual-review/v1.0.0/INDEX.md per Task 2 checkpoint.
//
// Limitations recorded in INDEX.md:
// - Playwright WebKit on macOS ≠ iOS Safari (different graphics stacks);
//   iOS globe projection rendering carries to v1.1.
// - `/app/*` routes are Auth0-gated; the screenshots may show the
//   logged-out splash or Auth0 redirect when no auth state is seeded.
// - `/u/bryan` requires the backend API + a DB user with handle "bryan";
//   on `vite preview` alone (no backend), it renders the NotFound state.
// - DESIGN.md:72 lock: public reel always dark — the "light" variant for
//   `/` and `/u/:handle` is captured anyway to surface accidental drift.

test.use({ ...devices['iPhone 13'] });

const ROUTES = [
  { path: '/', slug: 'public-reel' },
  { path: '/u/bryan', slug: 'u-bryan' },
  { path: '/app/reel', slug: 'app-reel' },
  { path: '/app/trips', slug: 'app-trips' },
  { path: '/app/me', slug: 'app-me' },
] as const;
const THEMES = ['dark', 'light'] as const;

for (const { path, slug } of ROUTES) {
  for (const theme of THEMES) {
    test(`visual ${slug} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      // Some routes (Auth0-gated `/app/*`, backend-dependent `/u/bryan`)
      // may never reach networkidle if Auth0 returns an external redirect
      // or the backend API is offline. Fall back to a 5s settle window.
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page
        .waitForLoadState('networkidle', { timeout: 8_000 })
        .catch(() => {
          // Acceptable per limitations above — capture whatever painted.
        });
      // Brief settle for animations + late paints.
      await page.waitForTimeout(1_500);
      await page.screenshot({
        path: `docs/visual-review/v1.0.0/${slug}-${theme}.png`,
        fullPage: false,
      });
    });
  }
}

// Phase 7 deferred mobile UAT item #3 re-verification: mixed-case URL
// should normalize to lowercase. On `vite preview` without backend, the
// SPA still receives the URL and HandleReelRoute reads `handle` from
// useParams; lowercase normalization sits in Phase 7-02 code paths that
// fire when the route mounts. We capture the redirect/resolution outcome
// to a screenshot for the INDEX.md note.
test('mixed-case URL /u/BRYAN renders without throwing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/u/BRYAN', { waitUntil: 'domcontentloaded' });
  await page
    .waitForLoadState('networkidle', { timeout: 8_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
  await page.screenshot({
    path: 'docs/visual-review/v1.0.0/u-BRYAN-mixedcase-dark.png',
    fullPage: false,
  });
});
