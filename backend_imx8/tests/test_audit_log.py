import os
import sys
import psycopg2

POSTGRES_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "postgres"
}

def test_audit_log():
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            timestamp VARCHAR(50),
            category VARCHAR(50),
            action VARCHAR(100),
            details TEXT,
            author VARCHAR(50) DEFAULT 'Operator'
        );
    """)
    conn.commit()

    # Insert test record
    cursor.execute("""
        INSERT INTO audit_logs (timestamp, category, action, details, author)
        VALUES ('2026-09-08 13:50:00', 'SETTINGS', 'TEST_AUDIT', 'Initial test audit entry', 'SystemTest');
    """)
    conn.commit()

    # Query
    cursor.execute("SELECT id, timestamp, category, action, details, author FROM audit_logs ORDER BY id DESC LIMIT 1;")
    row = cursor.fetchone()
    assert row is not None, "No row returned from audit_logs"
    assert row[2] == "SETTINGS"
    assert row[3] == "TEST_AUDIT"
    print(f"✅ [TEST AUDIT LOG PASSED] Row: {row}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    test_audit_log()
