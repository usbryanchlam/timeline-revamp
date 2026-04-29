/**
 * Framer Motion variants for the chapter overlay choreography.
 *
 * DESIGN.md token mapping (these literals are derived from the design system):
 *   [0.16, 1, 0.3, 1]  → --ease-arrival  (signature, slight overshoot)
 *   [0.4, 0, 0.2, 1]   → --ease-ui       (Material standard)
 *   0.5s photo arrival ≈ --motion-arrive (320ms) + slight Framer-spring feel
 *   0.4s caption arrival = --motion-arrive
 *   0.08s stagger between photos = ~80ms (matches the previous CSS keyframe offset)
 *
 * Framer requires literal numeric arrays for cubic-bezier curves — CSS custom
 * properties cannot be referenced here. Keep the values in sync with
 * src/index.css `:root` motion tokens and DESIGN.md § Motion.
 */

import type { Variants } from 'framer-motion';

// --ease-arrival — signature easing for photo/city arrival.
const EASE_ARRIVAL = [0.16, 1, 0.3, 1] as const;
// --ease-ui — Material standard for type and UI affordances.
const EASE_UI = [0.4, 0, 0.2, 1] as const;

/**
 * Parent container for the photo stack. Drives child stagger so each photo
 * fades+rises in offset by 80ms, mirroring the previous CSS animationDelay.
 */
export const photoStackContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

/**
 * Individual photo card. Lands with the signature --ease-arrival overshoot,
 * rising 12px and scaling up slightly from 0.96.
 */
export const photoStackItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: EASE_ARRIVAL,
    },
  },
};

/**
 * City name + caption. Material --ease-ui curve, slightly delayed so type
 * arrives just after the photos start their entrance.
 */
export const cityNameAndCaption: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: EASE_UI,
      delay: 0.15,
    },
  },
};
