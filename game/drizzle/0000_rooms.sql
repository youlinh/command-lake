CREATE TABLE rooms (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX rooms_updated ON rooms(updated);
