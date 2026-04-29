import type { ReelStateName } from '@/types/reel';

interface Props {
  readonly state: ReelStateName;
}

/**
 * W1 dev affordance: a small pill that shows the current gesture state.
 * Useful for the "verify gesture transitions on a real iPhone" acceptance
 * test from the design doc. Remove (or hide behind ?debug=1) in W2.
 */
export function StateBadge({ state }: Props) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="absolute left-3 top-[max(env(safe-area-inset-top),12px)] z-30 pointer-events-none">
      <span className="glass-pill rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-400">
        {state}
      </span>
    </div>
  );
}
