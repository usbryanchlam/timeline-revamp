# Photo test fixtures

Tests in src/photos/*.test.ts use jsdom canvas mocks; no binary fixtures are required for CI.

For manual end-to-end testing (06-03 onward), drop an iPhone HEIC sample at:
  test/fixtures/photos/sample.heic   (4032×3024, ~5 MB; gitignored)

This path is added to .gitignore in plan 06-03 task 1.
