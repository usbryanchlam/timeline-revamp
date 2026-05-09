// Meta-test (leading `__` prefix): asserts a project-wide architectural
// invariant rather than testing a single module. BigDataCloud's keyless
// reverse-geocode endpoint is browser-only per their Fair Use Policy;
// calling it from server/ would pool browser-meant requests under one IP
// and trigger HTTP 402 across the whole user base. This walker scans every
// .ts file under server/ for the literal string "bigdatacloud" and fails
// the build if one appears.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('BigDataCloud architectural guard', () => {
  it('no file under server/ references "bigdatacloud"', () => {
    const serverRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    const files = walk(serverRoot);

    const offenders: string[] = [];
    for (const f of files) {
      // Exclude this test file itself (it mentions the word in its assertion message)
      if (f.endsWith('__no-bigdatacloud.test.ts')) continue;
      const contents = readFileSync(f, 'utf8').toLowerCase();
      if (contents.includes('bigdatacloud')) {
        offenders.push(path.relative(serverRoot, f));
      }
    }

    expect(
      offenders,
      `Server files must not reference 'bigdatacloud' — BigDataCloud Fair Use Policy forbids server-side calls to the keyless reverse-geocode endpoint. Move the call to src/geocode/bigdatacloud.ts (browser-only). Offending files: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
