import { test, expect, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Phase 11 A11Y-07 / A11Y-01 e2e sweep. Routes are tested on the iPhone 13
// webkit profile with reduced-motion + dark-color-scheme emulation so the
// gradient-scrim contrast and the reduced-motion path both get exercised.
test.use({ ...devices['iPhone 13'] });

const ROUTES = ['/', '/u/bryan', '/app/reel', '/app/trips', '/app/me'] as const;

for (const route of ROUTES) {
  test(`${route} reduced-motion has 0 wcag2a/wcag2aa violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
}
