import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBatchWafer,
  normalizeRecordDate,
  getRecordTimestampMs,
  getNumericValue,
  sortRecords,
  getRecordDisplayDateTime,
  generateExportFilename,
  isDateRangeInvalid
} from "./historyHelpers.js";

test("generateExportFilename generates [YYYYMMDD_HHMMSS]_[Machine]_[Batch].csv format", () => {
  const mockDate = new Date(2026, 8, 1, 14, 50, 25); // 2026-09-01 14:50:25

  assert.equal(
    generateExportFilename({ machine: "PROBER01", batch: "B2940", now: mockDate }),
    "20260901_145025_PROBER01_B2940.csv"
  );

  assert.equal(
    generateExportFilename({ machine: "ALL", batch: "ALL", now: mockDate }),
    "20260901_145025_ALL_ALL.csv"
  );

  assert.equal(
    generateExportFilename({ machine: "", batch: "", now: mockDate }),
    "20260901_145025_ALL_ALL.csv"
  );

  assert.equal(
    generateExportFilename({ machine: "WP 288 #1", batch: "LOT-99/A", now: mockDate }),
    "20260901_145025_WP_288__1_LOT-99_A.csv"
  );
});

test("isDateRangeInvalid detects invalid start and end date ranges", () => {
  assert.equal(isDateRangeInvalid("2026-09-10", "2026-09-01"), true);
  assert.equal(isDateRangeInvalid("2026-09-01", "2026-09-10"), false);
  assert.equal(isDateRangeInvalid("2026-09-01", "2026-09-01"), false);
  assert.equal(isDateRangeInvalid("2026-09-01", ""), false);
  assert.equal(isDateRangeInvalid("", "2026-09-01"), false);
});

test("getRecordDisplayDateTime returns timestamp directly from record", () => {
  assert.equal(getRecordDisplayDateTime({ timestamp: "01-Sep-2026 14:10:25" }), "01-Sep-2026 14:10:25");
  assert.equal(getRecordDisplayDateTime({ timestamp: "2026-09-01 10:00:00" }), "2026-09-01 10:00:00");
  assert.equal(getRecordDisplayDateTime({ timestamp: "01-09-2026 12:30" }), "01-09-2026 12:30");
  assert.equal(getRecordDisplayDateTime({ timestamp: null, dateTime: "2026-09-01 10:00" }), "2026-09-01 10:00");
  assert.equal(getRecordDisplayDateTime(null), "-");
  assert.equal(getRecordDisplayDateTime({}), "-");
});

test("normalizeRecordDate parses timestamp in various date formats directly to YYYY-MM-DD", () => {
  assert.equal(normalizeRecordDate(null), "");
  // DD-MMM-YYYY (e.g. 01-Sep-2026)
  assert.equal(normalizeRecordDate({ timestamp: "01-Sep-2026 14:10:25" }), "2026-09-01");
  assert.equal(normalizeRecordDate({ timestamp: "15-Jan-2026 09:00:00" }), "2026-01-15");
  // DD-MM-YYYY
  assert.equal(normalizeRecordDate({ timestamp: "01-09-2026 14:10:00" }), "2026-09-01");
  // YYYY-MM-DD
  assert.equal(normalizeRecordDate({ timestamp: "2026-09-01 14:10:00" }), "2026-09-01");
  // YYYY/MM/DD
  assert.equal(normalizeRecordDate({ timestamp: "2026/09/01 10:00" }), "2026-09-01");
});

test("getRecordTimestampMs calculates accurate epoch ms from timestamp", () => {
  const ms1 = getRecordTimestampMs({ timestamp: "01-Sep-2026 10:00:00" });
  const ms2 = getRecordTimestampMs({ timestamp: "01-Sep-2026 11:00:00" });
  assert.ok(ms2 > ms1, "11:00 should be greater than 10:00");

  const ms3 = getRecordTimestampMs({ timestamp: "01-09-2026 10:00:00" });
  const ms4 = getRecordTimestampMs({ timestamp: "02-09-2026 10:00:00" });
  assert.ok(ms4 > ms3, "Day 2 should be greater than Day 1");
});

test("formatBatchWafer safely handles numeric IDs, nulls, and edge cases", () => {
  assert.equal(formatBatchWafer(null), "-");
  assert.equal(formatBatchWafer({}), "-");
  assert.equal(formatBatchWafer({ id: 12345 }), "12345"); // numeric ID should not throw .startsWith error
  assert.equal(formatBatchWafer({ id: "#WF-100", batch: "B2940", waferNo: "W01" }), "B2940W01");
  assert.equal(formatBatchWafer({ id: 99, batch: "B1", waferNo: 5 }), "B15");
});

test("getNumericValue extracts numbers from temperature and strings without returning NaN", () => {
  assert.equal(getNumericValue("25.4°C"), 25.4);
  assert.equal(getNumericValue("-5.2 C"), -5.2);
  assert.equal(getNumericValue(42), 42);
  assert.equal(getNumericValue("-"), 0);
  assert.equal(getNumericValue(null), 0);
  assert.equal(getNumericValue(undefined), 0);
});

test("sortRecords safely sorts by every column without crashing on edge cases", () => {
  const sampleRecords = [
    { id: 1, machineNo: "PROBER02", batch: "B2", waferNo: 2, pad: "P2", site: "S1", xyCoord: "X10Y20", temp: "50.0°C", decision: "PASS", inferenceTime: 15, timestamp: "01-Sep-2026 10:00:00" },
    { id: 2, machineNo: "PROBER01", batch: "B1", waferNo: 1, pad: "P1", site: "S2", xyCoord: "X05Y10", temp: "25.0°C", decision: "FAIL", inferenceTime: 8, timestamp: "01-Sep-2026 12:00:00" },
    { id: 3, machineNo: "PROBER03", batch: null, waferNo: null, pad: null, site: null, xyCoord: null, temp: "-", decision: null, inferenceTime: null, timestamp: null }
  ];

  const columns = ["timestamp", "machineNo", "batch", "pad", "site", "xyCoord", "temp", "decision", "inferenceTime", "reason"];
  
  for (const col of columns) {
    // Should sort descending without error
    const sortedDesc = sortRecords([...sampleRecords], col, "desc");
    assert.equal(sortedDesc.length, 3, `Sorting by ${col} desc should keep 3 records`);

    // Should sort ascending without error
    const sortedAsc = sortRecords([...sampleRecords], col, "asc");
    assert.equal(sortedAsc.length, 3, `Sorting by ${col} asc should keep 3 records`);
  }

  // Verify numerical sorting order
  const sortedByLatencyAsc = sortRecords([...sampleRecords], "inferenceTime", "asc");
  assert.equal(sortedByLatencyAsc[0].inferenceTime, null); // 0 first
  assert.equal(sortedByLatencyAsc[1].inferenceTime, 8);
  assert.equal(sortedByLatencyAsc[2].inferenceTime, 15);

  // Verify string sorting order
  const sortedByMachineAsc = sortRecords([...sampleRecords], "machineNo", "asc");
  assert.equal(sortedByMachineAsc[0].machineNo, "PROBER01");
  assert.equal(sortedByMachineAsc[1].machineNo, "PROBER02");
  assert.equal(sortedByMachineAsc[2].machineNo, "PROBER03");

  // Verify timestamp sorting order
  const sortedByTimeDesc = sortRecords([...sampleRecords], "timestamp", "desc");
  assert.equal(sortedByTimeDesc[0].id, 2); // 12:00 first
  assert.equal(sortedByTimeDesc[1].id, 1); // 10:00 second
});
