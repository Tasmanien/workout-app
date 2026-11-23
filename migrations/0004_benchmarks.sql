CREATE TABLE benchmark (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL,
  protocol TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE benchmark_measure (
  id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL REFERENCES benchmark(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('time', 'rounds_reps', 'reps', 'cal', 'cm', 'deg', 'kg', 'm')),
  better TEXT NOT NULL CHECK (better IN ('higher', 'lower'))
);
CREATE INDEX benchmark_measure_benchmark ON benchmark_measure(benchmark_id, position);

CREATE TABLE benchmark_result (
  id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL REFERENCES benchmark(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  variant TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX benchmark_result_benchmark_date ON benchmark_result(benchmark_id, date);

CREATE TABLE benchmark_value (
  result_id TEXT NOT NULL REFERENCES benchmark_result(id) ON DELETE CASCADE,
  measure_id TEXT NOT NULL REFERENCES benchmark_measure(id),
  value REAL NOT NULL CHECK (value >= 0),
  PRIMARY KEY (result_id, measure_id)
);
CREATE INDEX benchmark_value_measure ON benchmark_value(measure_id);
