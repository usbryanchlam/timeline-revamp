// Global Vitest matcher augmentation for @chialab/vitest-axe's
// `toHaveNoViolations()`. The package's own types/matchers.d.ts declares this
// but isn't wired into tsc's include graph via a normal package export; we
// re-declare inline here so *.a11y.test.tsx files under src/ typecheck.
import 'vitest';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown;
  }
}
