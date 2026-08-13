-- Wafer Inspection Database Schema
-- Auto-executed on first PostgreSQL container startup

CREATE TABLE IF NOT EXISTS inspections (
    id              SERIAL PRIMARY KEY,
    wafer_id        VARCHAR(50) NOT NULL,
    timestamp       VARCHAR(50) NOT NULL,
    decision        VARCHAR(20) NOT NULL,
    pads_total      INTEGER DEFAULT 0,
    pads_detected   INTEGER DEFAULT 0,
    probe_marks     INTEGER DEFAULT 0,
    grains          INTEGER DEFAULT 0,
    confidence      DOUBLE PRECISION DEFAULT 0.0,
    inference_time  DOUBLE PRECISION DEFAULT 0.0,
    rule_time       DOUBLE PRECISION DEFAULT 0.0,
    machine_action  VARCHAR(50)
);
