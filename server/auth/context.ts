import type { User } from '@server/db/schema.js';

// Hono context type extension. The c.var bag is keyed by string at
// runtime; this declaration teaches TypeScript that anything that
// calls c.set('user', row) downstream returns the User row type, and
// that c.var.auth0Sub is a string (not unknown).
//
// auth0Sub + auth0Email are populated by server/auth/jwt.ts (the JWT
// middleware) from the validated JWT payload. user is populated by
// server/auth/lazyProvision.ts after a SELECT-or-INSERT against the
// users table.
//
// The trailing `export {}` makes this file a module so the `declare
// module` augmentation actually augments instead of redeclaring.
declare module 'hono' {
  interface ContextVariableMap {
    auth0Sub: string;
    auth0Email: string;
    user: User;
  }
}

export {};
