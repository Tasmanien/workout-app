CREATE TABLE movement (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE exercise (
  id TEXT PRIMARY KEY,
  name TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE exercise_part (
  exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  movement_id TEXT NOT NULL REFERENCES movement(id),
  reps INTEGER NOT NULL DEFAULT 1 CHECK (reps >= 1),
  PRIMARY KEY (exercise_id, position)
);
CREATE INDEX exercise_part_movement ON exercise_part(movement_id);

CREATE TABLE scheme (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('max', 'fixed', 'free')),
  sets INTEGER,
  reps INTEGER,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE log_entry (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  scheme_id TEXT NOT NULL REFERENCES scheme(id),
  date TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'jefit')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX log_entry_exercise_date ON log_entry(exercise_id, date);
CREATE INDEX log_entry_scheme ON log_entry(scheme_id);

CREATE TABLE log_set (
  id TEXT PRIMARY KEY,
  log_entry_id TEXT NOT NULL REFERENCES log_entry(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  reps INTEGER NOT NULL CHECK (reps >= 1),
  weight_kg REAL NOT NULL CHECK (weight_kg >= 0),
  success INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX log_set_entry ON log_set(log_entry_id);

INSERT INTO scheme (id, name, kind, sets, reps, position) VALUES
  ('scheme-1rm', '1RM', 'max', NULL, 1, 1),
  ('scheme-2rm', '2RM', 'max', NULL, 2, 2),
  ('scheme-3rm', '3RM', 'max', NULL, 3, 3),
  ('scheme-5rm', '5RM', 'max', NULL, 5, 4),
  ('scheme-5x5', '5x5', 'fixed', 5, 5, 5),
  ('scheme-3x3', '3x3', 'fixed', 3, 3, 6),
  ('scheme-free', 'Free sets', 'free', NULL, NULL, 99);
