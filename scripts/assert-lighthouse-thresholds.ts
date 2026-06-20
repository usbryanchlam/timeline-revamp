// assert-lighthouse-thresholds.ts — gate the v1.0.0 launch on PERF-01/03/04.
//
//   PERF-01: Lighthouse mobile perf score ≥ 90
//   PERF-03: LCP ≤ 2500 ms
//   PERF-04: CLS ≤ 0.1
//
// Reads docs/lighthouse/v1.0.0-baseline.json (symlinked by
// scripts/lighthouse-baseline.sh to the latest timestamped run) and exits
// non-zero with a human-readable diagnosis if any threshold is missed.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface LighthouseReport {
  readonly categories: {
    readonly performance: { readonly score: number };
  };
  readonly audits: {
    readonly 'largest-contentful-paint': { readonly numericValue: number };
    readonly 'cumulative-layout-shift': { readonly numericValue: number };
  };
}

const REPORT_PATH = resolve(
  process.cwd(),
  'docs/lighthouse/v1.0.0-baseline.json',
);

const raw = readFileSync(REPORT_PATH, 'utf-8');
const report = JSON.parse(raw) as LighthouseReport;

const perfScore = report.categories.performance.score * 100;
const lcpMs = report.audits['largest-contentful-paint'].numericValue;
const clsValue = report.audits['cumulative-layout-shift'].numericValue;

const failures: readonly string[] = [
  ...(perfScore < 90 ? [`perf=${perfScore.toFixed(1)} < 90 (PERF-01)`] : []),
  ...(lcpMs > 2500 ? [`LCP=${Math.round(lcpMs)}ms > 2500ms (PERF-03)`] : []),
  ...(clsValue > 0.1 ? [`CLS=${clsValue.toFixed(3)} > 0.1 (PERF-04)`] : []),
];

if (failures.length > 0) {
  // eslint-disable-next-line no-console
  console.error('Lighthouse thresholds FAIL:');
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(
  `Lighthouse OK: perf=${perfScore.toFixed(1)} LCP=${Math.round(lcpMs)}ms CLS=${clsValue.toFixed(3)}`,
);
