// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from '../../test/setup';
import { GlobeReducedMotionReel } from './GlobeReducedMotionReel';

describe('GlobeReducedMotionReel — A11Y-01 hard gate + A11Y-03 landmark', () => {
  it('renders with zero axe violations', async () => {
    const { container } = render(<GlobeReducedMotionReel />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('exposes role=region with aria-label', () => {
    const { container } = render(<GlobeReducedMotionReel />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toMatch(/.+/);
  });
});
