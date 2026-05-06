import { NavLink } from 'react-router';

// BottomNav: fixed bottom navigation for the authenticated /app/* tree.
// Text-only labels per Phase 3 plan (Lucide not installed; icons are a
// separate, deliberate decision and not part of APP-01).
//
// Visual tokens per DESIGN.md:
//   - Single amber accent on the active tab (no other color)
//   - 120ms tap-feedback (matches --motion-snap / --dur-instant)
//   - 64px tall row, comfortably above the 44px touch-target minimum

interface TabSpec {
  readonly to: string;
  readonly label: string;
  readonly end?: boolean;
}

const TABS: readonly TabSpec[] = [
  { to: '/app', label: 'Reel', end: true },
  { to: '/app/trips', label: 'Trips' },
  { to: '/app/me', label: 'Me' },
];

export function BottomNav() {
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 bg-bg-elev border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex justify-around items-stretch h-16">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center justify-center gap-1',
                  'h-full min-h-[44px] w-full',
                  'text-xs uppercase tracking-wider font-semibold',
                  'transition-opacity duration-[120ms] active:opacity-70',
                  isActive ? 'text-amber-500' : 'text-ink-mute',
                ].join(' ')
              }
            >
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
