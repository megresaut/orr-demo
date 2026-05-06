-- ORR multi-tenant schema (MVP)
-- Each tenant = one organization. Everything client-facing is org-scoped.

CREATE TABLE IF NOT EXISTS organizations (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  logo_url        TEXT,
  address         TEXT,
  phone           TEXT,
  contact_email   TEXT,
  -- Connector preferences (slide 13). MVP only supports excel; the strings
  -- are stored so the Settings UI can light up the connector cards.
  pm_connector    TEXT NOT NULL DEFAULT 'excel',         -- 'excel' | 'asana' | 'trello' | ...
  time_connector  TEXT NOT NULL DEFAULT 'excel',         -- 'excel' | 'minute7' | 'deputy' | ...
  acct_connector  TEXT NOT NULL DEFAULT 'excel',         -- 'excel' | 'quickbooks' | 'xero' | 'wave'
  plan_tier       TEXT NOT NULL DEFAULT 'standard',      -- standard|professional|premium|elite|ultimate
  trial_ends_at   TIMESTAMPTZ,
  cc_on_file      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT,
  role            TEXT NOT NULL DEFAULT 'admin',         -- admin|member
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users(org_id);

CREATE TABLE IF NOT EXISTS projects (
  id                       SERIAL PRIMARY KEY,
  org_id                   INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  code                     TEXT,                          -- DDXXX-MM-YYYY
  location                 TEXT,
  description              TEXT,
  start_date               DATE,
  end_date                 DATE,
  client_name              TEXT,
  client_contact           TEXT,
  client_email             TEXT,
  client_phone             TEXT,
  client_address           TEXT,
  contract_amount          NUMERIC(14,2) DEFAULT 0,
  allowance                NUMERIC(14,2) DEFAULT 0,
  total_services_to_date   NUMERIC(14,2) DEFAULT 0,
  overhead_multiplier      NUMERIC(6,3) DEFAULT 1.66,
  profit_pct               NUMERIC(6,3) DEFAULT 10,
  invoice_seq              TEXT DEFAULT 'INVOICE_01',
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_org_idx ON projects(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_org_code_idx ON projects(org_id, code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_rates (
  id           SERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  name         TEXT,
  rate         NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS project_rates_project_idx ON project_rates(project_id);

CREATE TABLE IF NOT EXISTS project_tasks (
  id                SERIAL PRIMARY KEY,
  org_id            INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_code         TEXT,                                  -- e.g. 1.01.02
  task_name         TEXT NOT NULL,
  assignee_name     TEXT,
  assignee_email    TEXT,
  start_date        DATE,
  due_date          DATE,
  budget_hours      NUMERIC(10,2) DEFAULT 0,
  billed_hours      NUMERIC(10,2) DEFAULT 0,
  billing_rate      NUMERIC(10,2) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON project_tasks(project_id);

CREATE TABLE IF NOT EXISTS time_entries (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_code     TEXT,                                      -- matched against project_tasks.task_code
  entry_date    DATE NOT NULL,
  start_time    TEXT,
  end_time      TEXT,
  hours         NUMERIC(8,2) NOT NULL,
  resource_name TEXT NOT NULL,
  description   TEXT,
  source        TEXT NOT NULL DEFAULT 'excel',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS time_entries_project_idx ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS time_entries_date_idx ON time_entries(entry_date);

CREATE TABLE IF NOT EXISTS invoices (
  id             SERIAL PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  overhead       NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',            -- draft|sent|paid
  pdf_path       TEXT,
  xlsx_path      TEXT,
  payload        JSONB NOT NULL,                            -- line items snapshot
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  sent_at        TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS invoices_org_idx ON invoices(org_id);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON invoices(project_id);
