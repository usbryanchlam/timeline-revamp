// AUTH-06: reserved handles. These collide with current or anticipated
// routes, generic terms users would expect to be unclaimable, or
// auth-flow paths. Locking this list now prevents the picker from
// accepting a handle that would later require migration away.
//
// Comparison is case-insensitive at validation time (input is
// lowercased first), so all entries here are lowercase.
//
// This module is imported by BOTH the server (defense-in-depth
// re-validation in /api/me/handle) and the frontend (HandlePickerModal
// client-side hint). Keeping the list as a frozen Set prevents
// accidental mutation either side.
export const RESERVED_HANDLES: ReadonlySet<string> = Object.freeze(new Set([
  // Path-conflicting (current and anticipated routes)
  'admin', 'api', 'app', 'u', 'auth', 'me', 'settings',
  // Auth flows
  'signup', 'sign-up', 'login', 'log-in', 'signin', 'sign-in',
  'logout', 'log-out', 'signout', 'sign-out',
  // Common static pages
  'about', 'help', 'terms', 'privacy', 'contact',
  // HTTP/system
  '404', '500', 'health',
  // Brand reservation
  'timeline',
]));
