CREATE TABLE IF NOT EXISTS agenttalkie_threads (id uuid PRIMARY KEY, owner text NOT NULL, data jsonb NOT NULL, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS agenttalkie_threads_owner ON agenttalkie_threads(owner,updated_at DESC);
CREATE TABLE IF NOT EXISTS agenttalkie_events (id uuid PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL REFERENCES agenttalkie_threads(id), request_id uuid NOT NULL, revision integer NOT NULL, provider text NOT NULL, label text NOT NULL, state text NOT NULL, details jsonb NOT NULL DEFAULT '{}', observed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agenttalkie_voice_attempts (id uuid PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL REFERENCES agenttalkie_threads(id), attempted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agenttalkie_delegations (id text PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL, request_id uuid NOT NULL, result jsonb);
CREATE TABLE IF NOT EXISTS agenttalkie_runners (id text PRIMARY KEY, heartbeat timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS agenttalkie_jobs (id text PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL, request jsonb NOT NULL, kind text NOT NULL, state text NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agenttalkie_voice_budget (owner text NOT NULL,day date NOT NULL,attempts integer NOT NULL,PRIMARY KEY(owner,day));

CREATE UNIQUE INDEX IF NOT EXISTS agenttalkie_one_active_thread ON agenttalkie_threads(owner) WHERE data->>'status'='active';
CREATE TABLE IF NOT EXISTS agenttalkie_voice_offers (thread_id uuid NOT NULL REFERENCES agenttalkie_threads(id), offer_hash text NOT NULL, PRIMARY KEY(thread_id,offer_hash));
CREATE TABLE IF NOT EXISTS agenttalkie_documents (
  id text PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL REFERENCES agenttalkie_threads(id),
  request_id uuid NOT NULL, revision integer NOT NULL, draft jsonb NOT NULL, content_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('prepared','saving','saved','unknown')),
  save_request text, provider_ref uuid, receipt jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agenttalkie_workspace_context (
  thread_id uuid PRIMARY KEY REFERENCES agenttalkie_threads(id), owner text NOT NULL,
  workspace_id text NOT NULL, catalog jsonb NOT NULL DEFAULT '[]', selected_task_id uuid,
  observed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agenttalkie_jobs ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agenttalkie_jobs ADD COLUMN IF NOT EXISTS runner_id text;
ALTER TABLE agenttalkie_jobs ADD COLUMN IF NOT EXISTS claim_id uuid;
ALTER TABLE agenttalkie_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE TABLE IF NOT EXISTS agenttalkie_job_output (
 job_id text NOT NULL REFERENCES agenttalkie_jobs(id) ON DELETE CASCADE,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 200),
 text text NOT NULL CHECK(length(text)<=4000),
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,sequence)
);
CREATE TABLE IF NOT EXISTS agenttalkie_tool_actions (
 id text PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL REFERENCES agenttalkie_threads(id),
 tool_name text NOT NULL, arguments jsonb NOT NULL, schema_hash text NOT NULL, action_hash text NOT NULL,
 before_state jsonb, state text NOT NULL CHECK(state IN ('prepared','executing','completed','unknown')),
 approval_request text, result jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agenttalkie_runners ADD COLUMN IF NOT EXISTS build_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS agenttalkie_artifacts (
 id uuid PRIMARY KEY, owner text NOT NULL, thread_id uuid NOT NULL REFERENCES agenttalkie_threads(id),
 job_id text NOT NULL UNIQUE REFERENCES agenttalkie_jobs(id), parent_id uuid REFERENCES agenttalkie_artifacts(id),
 html text NOT NULL CHECK(length(html)<=100000), content_hash text NOT NULL,
 harness text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agenttalkie_demo_context (
 thread_id uuid PRIMARY KEY REFERENCES agenttalkie_threads(id), owner text NOT NULL, task_id uuid NOT NULL
);
