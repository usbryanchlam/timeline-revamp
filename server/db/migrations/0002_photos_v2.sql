-- 0002_photos_v2.sql — Phase 6 photos table delta
-- Phase 4 created an early photos table with no userId/status/masterKey.
-- The table has never been written to (verified empty before Phase 6 planning),
-- so DROP + CREATE is safe. If you are restoring from a snapshot that has
-- photo rows, replace this with ALTER TABLE statements before running.

DROP TABLE IF EXISTS photos;

CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  master_key text NOT NULL,
  thumb_key text,
  caption text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX photos_city_order ON photos (city_id, order_index);
CREATE INDEX photos_user_status ON photos (user_id, status);
