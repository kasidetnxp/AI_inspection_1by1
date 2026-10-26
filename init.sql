-- Wafer Inspection Database Schema
-- Auto-executed on first PostgreSQL container startup (via /docker-entrypoint-initdb.d)

-- 1. Inspections Table (Wafer scan records & AI verdicts)
CREATE TABLE IF NOT EXISTS inspections (
    id                  SERIAL PRIMARY KEY,
    wafer_id            VARCHAR(50) NOT NULL,
    timestamp           VARCHAR(50) NOT NULL,
    decision            VARCHAR(20) NOT NULL,
    pads_total          INTEGER DEFAULT 0,
    pads_detected       INTEGER DEFAULT 0,
    probe_marks         INTEGER DEFAULT 0,
    grains              INTEGER DEFAULT 0,
    confidence          DOUBLE PRECISION DEFAULT 0.0,
    inference_time      DOUBLE PRECISION DEFAULT 0.0,
    rule_time           DOUBLE PRECISION DEFAULT 0.0,
    machine_action      VARCHAR(50),
    reason              TEXT,
    image_url           TEXT
);

-- 2. Benchmark Sessions Table (AI Model evaluation test suites)
CREATE TABLE IF NOT EXISTS benchmark_sessions (
    id                  VARCHAR(64) PRIMARY KEY,
    name                VARCHAR(255),
    model_name          VARCHAR(255),
    status              VARCHAR(50),
    dataset_name        VARCHAR(255),
    total_images        INTEGER DEFAULT 0,
    processed_images    INTEGER DEFAULT 0,
    rule_config         TEXT,
    created_at          VARCHAR(50),
    completed_at        VARCHAR(50),
    metrics             TEXT
);

-- 3. Benchmark Results Table (Individual test wafer inferences)
CREATE TABLE IF NOT EXISTS benchmark_results (
    id                      SERIAL PRIMARY KEY,
    session_id              VARCHAR(64) REFERENCES benchmark_sessions(id) ON DELETE CASCADE,
    image_name              VARCHAR(255),
    image_url               TEXT,
    annotated_image_url     TEXT,
    raw_image_url           TEXT,
    ai_decision             VARCHAR(20),
    ai_confidence           DOUBLE PRECISION,
    ai_reason               TEXT,
    inference_time_ms       DOUBLE PRECISION,
    rule_time_ms            DOUBLE PRECISION,
    min_edge_distance_um    DOUBLE PRECISION,
    mark_area_ratio_pct     DOUBLE PRECISION,
    pads_count              INTEGER,
    marks_count             INTEGER,
    grains_count            INTEGER,
    human_decision          VARCHAR(20) DEFAULT 'UNREVIEWED',
    human_reviewer          VARCHAR(100),
    reviewed_at             VARCHAR(50),
    notes                   TEXT
);

-- 4. Audit Logs Table (Configuration and recipe change history)
CREATE TABLE IF NOT EXISTS audit_logs (
    id                  SERIAL PRIMARY KEY,
    timestamp           VARCHAR(50) NOT NULL,
    category            VARCHAR(50) NOT NULL,
    action              VARCHAR(100) NOT NULL,
    details             TEXT,
    author              VARCHAR(50) DEFAULT 'Operator'
);
