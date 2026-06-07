// Motion constants for the cinematic reel — single source of truth.
//
// Two layers consume these:
//   1. MapCanvas.tsx — passes them to MapLibre's flyTo()
//   2. gestures/stateMachine.ts — schedules CHAPTER_FLY_DONE after the
//      camera animation should be complete, so the gesture machine stays
//      in lockstep with the visual transition
//
// Keeping the two in sync mattered enough to factor it out: prior to this
// extraction the duration constant was duplicated and drifted (MapCanvas
// at 1800 and stateMachine at 1800; bumping one without the other would
// re-enable gestures mid-fly).
//
// Values track DESIGN.md "Motion" section. Update both DESIGN.md and this
// file when tuning; the runtime is downstream of the design contract.

// DESIGN --motion-cinematic. Map flyTo between chapters runs this long; the
// gesture state machine's CHAPTER_FLY_DONE fires after the same elapsed
// time. Currently in UAT tuning — bumped from the W1 value of 2400 to give
// each transition the "taking flight" feel; AUTOPLAY_DWELL_MS in timing.ts
// must stay >= this so a chapter isn't half-flown when autoplay advances.
export const FLY_DURATION_MS = 8000 as const;

// MapLibre `curve` parameter — controls the zoom-out arc during transit
// (how high the camera rises before descending into the target). NOT
// locked in DESIGN.md (no single numeric value there); tuned by feel to
// land in Apple Maps Flyover territory while keeping the takeoff/cruise/
// landing arc legible. 1.42 = MapLibre default (subtle), 1.6 = moderate,
// 2.0–2.5 = pronounced plane-arc.
export const FLY_CURVE = 2.2 as const;

// DESIGN --ease-camera: cubic-bezier(0.25, 0.1, 0.25, 1.0). "Long, settling."
// EXPLICITLY DIFFERENT from --ease-arrival (cubic-bezier(0.16, 1, 0.3, 1)
// with overshoot), which is reserved for the photo-card landing pulse —
// the signature brand beat. Camera motion is the weighty journey; the
// arrival pulse is the surprise punctuation layered on top of camera arrival.
//
// Implementation: Newton-Raphson solve to find the bezier parameter s such
// that bezierX(s) = input t, then evaluate bezierY(s). Eight iterations is
// overkill for this curve — visually-indistinguishable accuracy converges
// in 3–4. Called at MapLibre's ~60Hz tick during the 2.4s flight: ~144
// invocations per chapter change; constant-time per call.
export function easeCamera(t: number): number {
  // Polynomial coefficients for bezier(0.25, 0.1, 0.25, 1.0).
  const ax = 1; // 1 - 3*x2 + 3*x1
  const bx = -0.75; // 3*x2 - 6*x1
  const cx = 0.75; // 3*x1
  const ay = -1.7; // 1 - 3*y2 + 3*y1
  const by = 2.4; // 3*y2 - 6*y1
  const cy = 0.3; // 3*y1

  let s = t;
  for (let i = 0; i < 8; i++) {
    const xs = ((ax * s + bx) * s + cx) * s;
    const dx = (3 * ax * s + 2 * bx) * s + cx;
    if (Math.abs(dx) < 1e-6) break;
    const delta = (xs - t) / dx;
    s -= delta;
    if (Math.abs(delta) < 1e-6) break;
  }
  return ((ay * s + by) * s + cy) * s;
}
