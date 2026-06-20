# Deferred items found during 11-02 execution

These TypeScript errors exist in 11-01-shipped test files. They do NOT block
the 11-02 task scope (no functional regression — vitest run is green; these
files were not modified by 11-02). Documented here per the executor scope-
boundary rule (auto-fix only issues directly caused by current task).

## Pre-existing TypeScript errors (out of 11-02 scope)

1. `src/reel/GlobeReducedMotionReel.a11y.test.tsx:10:34` — `Property 'toHaveNoViolations' does not exist on type 'Assertion<AxeResults>'`
2. `src/reel/OrbitReducedMotionReel.a11y.test.tsx:27:3` — `Property 'cityId' is missing in type '...' but required in type 'PublicReelPhotoDTO'`
3. `src/reel/OrbitReducedMotionReel.a11y.test.tsx:35:34` — `Property 'toHaveNoViolations' does not exist on type 'Assertion<AxeResults>'`
4. `src/reel/ReducedMotionReel.a11y.test.tsx:10:34` — `Property 'toHaveNoViolations' does not exist on type 'Assertion<AxeResults>'`

All four trace back to the 11-01 axe matcher wiring (`test/setup.ts` registers
the matcher dynamically; the test files do not import its type augmentation).
Fix is a one-line `import '@chialab/vitest-axe';` at the top of each affected
test file (or a global ambient `.d.ts`). Out of 11-02 scope; suggest landing
as a small follow-up in 11-03 or post-11.

Vitest still runs these tests successfully — the errors are tsc-only, not
runtime. The 11-02 build chain (`bun run build`) trips on them via `tsc -b`,
so 11-02 ships a `verify:tree-shake` script that runs `bun run build` and
will hit these errors. Mitigation strategy in 11-02 SUMMARY.md: use
`bun run vite build` directly (skipping tsc) when verifying the tree-shake
gate.
