-- API SENTINEL — PostgreSQL Production Reference Schema
-- Note: In hosted AI Studio single-runtime development mode, API SENTINEL runs
-- against a local persistent file database (data/sentinel-store.json) and reports
-- that honestly in Settings. Apply this migration when deploying with PostgreSQL.

CREATE TABLE IF NOT EXISTS analysis_runs (
  run_id UUID PRIMARY KEY,
  dataset_source VARCHAR(32) NOT NULL CHECK (dataset_source IN ('synthetic', 'uploaded', 'empty')),
  dataset_label TEXT NOT NULL,
  alert_threshold INTEGER NOT NULL DEFAULT 50,
  baseline_fraction NUMERIC(4,2) NOT NULL DEFAULT 0.60,
  model_version VARCHAR(64) NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS e04_integrations (
  credential_id VARCHAR(128) PRIMARY KEY,
  integration VARCHAR(255) NOT NULL,
  system VARCHAR(128) NOT NULL,
  vendor VARCHAR(255) NOT NULL,
  scope TEXT NOT NULL,
  owner VARCHAR(255),
  ip_restriction VARCHAR(255),
  token_lifetime_days INTEGER,
  last_used TIMESTAMPTZ,
  status VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS e18_api_activity (
  request_id VARCHAR(128) PRIMARY KEY,
  ts_utc TIMESTAMPTZ NOT NULL,
  api_key_id VARCHAR(128) NOT NULL,
  caller_ip VARCHAR(64) NOT NULL,
  user_agent TEXT,
  endpoint TEXT NOT NULL,
  method VARCHAR(16) NOT NULL,
  records_returned INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_e18_api_key_ts ON e18_api_activity (api_key_id, ts_utc);

CREATE TABLE IF NOT EXISTS e19_vendor_changes (
  change_id VARCHAR(128) PRIMARY KEY,
  ts_utc TIMESTAMPTZ NOT NULL,
  vendor_id VARCHAR(128) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  field VARCHAR(128) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(255),
  channel VARCHAR(128),
  approval_ref VARCHAR(128),
  source_ip VARCHAR(64),
  request_id VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_e19_request_id ON e19_vendor_changes (request_id);

CREATE TABLE IF NOT EXISTS risk_findings (
  request_id VARCHAR(128) PRIMARY KEY REFERENCES e18_api_activity(request_id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  deterministic_score INTEGER NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  is_alert BOOLEAN NOT NULL DEFAULT FALSE,
  isolation_forest_score NUMERIC(6,4),
  signals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  triage_status VARCHAR(32) NOT NULL DEFAULT 'open'
    CHECK (triage_status IN ('open', 'in_review', 'reviewed', 'escalated')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investigation_notes (
  note_id UUID PRIMARY KEY,
  request_id VARCHAR(128) NOT NULL REFERENCES risk_findings(request_id) ON DELETE CASCADE,
  author VARCHAR(128) NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investigation_conclusions (
  request_id VARCHAR(128) PRIMARY KEY REFERENCES risk_findings(request_id) ON DELETE CASCADE,
  confirmed_facts TEXT NOT NULL,
  open_hypotheses TEXT NOT NULL,
  disposition VARCHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
