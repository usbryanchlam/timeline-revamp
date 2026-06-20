import { expect } from 'vitest';
import { toHaveNoViolations } from '@chialab/vitest-axe';
expect.extend({ toHaveNoViolations });
