PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT,
  status TEXT NOT NULL CHECK (status IN ('planning','active','paused','archived')),
  health TEXT NOT NULL CHECK (health IN ('healthy','attention','blocked','unknown')),
  priority TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  progress_estimate INTEGER NOT NULL DEFAULT 0 CHECK (progress_estimate BETWEEN 0 AND 100),
  focus TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  branch_summary TEXT,
  status_basis TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  visibility TEXT NOT NULL CHECK (visibility IN ('private','unlisted','public')),
  public_summary TEXT,
  private_summary TEXT,
  public_progress INTEGER CHECK (public_progress IS NULL OR public_progress BETWEEN 0 AND 100),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  cover_asset_id TEXT,
  live_url TEXT,
  documentation_url TEXT,
  last_activity_at TEXT,
  last_synced_at TEXT,
  manual_lock INTEGER NOT NULL DEFAULT 0 CHECK (manual_lock IN (0,1)),
  data_source TEXT NOT NULL CHECK (data_source IN ('manual','github','mcp','migration','seed_demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_active
  ON projects(status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_visibility
  ON projects(visibility, featured, updated_at DESC);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('product','core','integration','infrastructure','academic','experiment')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  status TEXT NOT NULL CHECK (status IN ('active','paused','historical','experiment')),
  default_branch TEXT NOT NULL,
  active_branch TEXT,
  github_url TEXT NOT NULL,
  github_node_id TEXT,
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0,1)),
  last_synced_at TEXT,
  data_source TEXT NOT NULL CHECK (data_source IN ('manual','github','mcp','migration','seed_demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repositories_project
  ON repositories(project_id, status);

CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','active','validating','blocked','operational','completed')),
  priority TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  branch TEXT,
  current_delivery TEXT NOT NULL DEFAULT '',
  next_gate TEXT NOT NULL DEFAULT '',
  tests_summary TEXT NOT NULL DEFAULT '',
  evidence_summary TEXT NOT NULL DEFAULT '',
  last_signal_at TEXT,
  data_source TEXT NOT NULL CHECK (data_source IN ('manual','github','mcp','migration','seed_demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workstreams_project_status
  ON workstreams(project_id, status, priority);

CREATE TABLE IF NOT EXISTS stages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workstream_id TEXT REFERENCES workstreams(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('planning','implementation','integration','validation','release','operation')),
  state TEXT NOT NULL CHECK (state IN ('backlog','next','in_progress','blocked','completed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  planned_result TEXT NOT NULL DEFAULT '',
  current_position TEXT NOT NULL DEFAULT '',
  next_step TEXT,
  blocker TEXT,
  evidence_summary TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  manual_lock INTEGER NOT NULL DEFAULT 0 CHECK (manual_lock IN (0,1)),
  updated_from TEXT NOT NULL CHECK (updated_from IN ('manual','github','mcp','migration','seed_demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state = 'completed' OR (next_step IS NOT NULL AND length(trim(next_step)) > 0)),
  CHECK (state <> 'blocked' OR (blocker IS NOT NULL AND length(trim(blocker)) > 0)),
  CHECK (state <> 'completed' OR (progress = 100 AND done = 1)),
  CHECK (state = 'completed' OR done = 0)
);

CREATE INDEX IF NOT EXISTS idx_stages_project_order
  ON stages(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_stages_state
  ON stages(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS attention_items (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','monitoring','resolved','dismissed')),
  impact TEXT NOT NULL CHECK (impact IN ('high','medium','low')),
  type TEXT NOT NULL CHECK (type IN ('risk','blocker','decision','local_test','external_dependency','technical_debt','security')),
  owner TEXT NOT NULL CHECK (owner IN ('owner','gpt','external_environment','shared')),
  next_action TEXT NOT NULL,
  source_url TEXT,
  resolved_at TEXT,
  data_source TEXT NOT NULL CHECK (data_source IN ('manual','github','mcp','migration','seed_demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attention_open
  ON attention_items(status, impact, owner, updated_at DESC);

CREATE TABLE IF NOT EXISTS development_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  session_date TEXT NOT NULL,
  actor TEXT NOT NULL,
  branch TEXT,
  commits_json TEXT NOT NULL DEFAULT '[]',
  completed_summary TEXT NOT NULL DEFAULT '',
  tests_status TEXT NOT NULL CHECK (tests_status IN ('not_run','partial','passed','failed','blocked')),
  tests_summary TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL CHECK (result IN ('significant','partial','maintenance','no_change','failed')),
  source_url TEXT,
  automatic INTEGER NOT NULL DEFAULT 0 CHECK (automatic IN (0,1)),
  source_hash TEXT UNIQUE,
  data_source TEXT NOT NULL CHECK (data_source IN ('manual','github','mcp','migration','seed_demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_date
  ON development_sessions(project_id, session_date DESC);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id TEXT REFERENCES stages(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES development_sessions(id) ON DELETE SET NULL,
  repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('commit','pull_request','issue','workflow_run','test','document','manual_note')),
  title TEXT NOT NULL,
  url TEXT,
  external_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('observed','passed','failed','pending','superseded')),
  summary TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source_hash TEXT,
  data_source TEXT NOT NULL CHECK (data_source IN ('manual','github','mcp','migration','seed_demo')),
  UNIQUE(kind, external_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_stage
  ON evidence(stage_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_project
  ON evidence(project_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','document','external_embed')),
  storage_key TEXT,
  external_url TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private','unlisted','public')),
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  CHECK (storage_key IS NOT NULL OR external_url IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('technical_note','case_study','retrospective','decision','changelog','tutorial')),
  status TEXT NOT NULL CHECK (status IN ('private_draft','review','scheduled','published','archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('private','unlisted','public')),
  excerpt TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  cover_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  published_at TEXT,
  generated_from_session_id TEXT REFERENCES development_sessions(id) ON DELETE SET NULL,
  approved_by_owner INTEGER NOT NULL DEFAULT 0 CHECK (approved_by_owner IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status <> 'published' OR (approved_by_owner = 1 AND published_at IS NOT NULL)),
  CHECK (visibility <> 'public' OR status = 'published')
);

CREATE INDEX IF NOT EXISTS idx_publications_public
  ON publications(status, visibility, published_at DESC);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('education','project','milestone','work','learning','release')),
  visibility TEXT NOT NULL CHECK (visibility IN ('private','unlisted','public')),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual','scheduled_work','webhook','mcp','migration')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
  repositories_checked INTEGER NOT NULL DEFAULT 0,
  changes_applied INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  error_summary TEXT,
  cursor TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started
  ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1)),
  correlation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_correlation
  ON audit_events(correlation_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_digest
  ON auth_sessions(token_digest, expires_at, revoked_at);
