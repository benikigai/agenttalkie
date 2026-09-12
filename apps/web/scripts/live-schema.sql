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
