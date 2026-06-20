import { expect } from 'vitest';
import matchers from '@chialab/vitest-axe';
import axeCore from 'axe-core';

// Register the toHaveNoViolations matcher globally. @chialab/vitest-axe
// ships matchers via its default export (see node_modules/@chialab/vitest-axe/lib/index.js).
expect.extend(matchers);

/**
 * Run axe-core against a DOM container and return the AxeResults. Use with the
 * registered matcher: `expect(await axe(container)).toHaveNoViolations()`.
 *
 * The matcher is defined on AxeResults (results.violations), so this helper
 * forwards the run() result unchanged.
 */
export async function axe(
  container: Element | Document,
): Promise<axeCore.AxeResults> {
  return axeCore.run(container);
}
