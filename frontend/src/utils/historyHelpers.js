/**
 * Robust helper utilities for inspection history data processing,
 * timestamp normalization, safe formatting, multi-column sorting,
 * custom date range validation, and standardized CSV filename generation.
 */

const MONTH_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
};

/**
 * Validates whether the selected start date and end date are in contradiction.
 * Returns true if startDate is strictly greater than endDate.
 */
export const isDateRangeInvalid = (startDate, endDate) => {
  if (!startDate || !endDate) return false;
  return startDate > endDate;
};

/**
 * Standardized CSV Export Filename Generator
 * Format: [YYYYMMDD_HHMMSS]_[Machine]_[Batch].csv
 * Example: 20260901_145025_PROBER01_B2940.csv
 */
export const generateExportFilename = ({ machine, batch, now = new Date() }) => {
  const d = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const timestampStr = `${y}${m}${day}_${hh}${mm}${ss}`;

  const cleanMachine = (machine && machine !== "ALL" && machine !== "-")
    ? String(machine).trim().replace(/[^a-zA-Z0-9_-]/g, "_")
    : "ALL";

  const cleanBatch = (batch && batch !== "ALL" && batch !== "-")
    ? String(batch).trim().replace(/[^a-zA-Z0-9_-]/g, "_")
    : "ALL";

  return `${timestampStr}_${cleanMachine}_${cleanBatch}.csv`;
};

/**
 * Gets display date/time directly from record timestamp
 */
export const getRecordDisplayDateTime = (record) => {
  if (!record) return "-";
  return record.timestamp || record.dateTime || record.time || record.timeShort || "-";
};

export const formatBatchWafer = (item) => {
  if (!item) return "-";
  const b = (item.batch && item.batch !== "-") ? String(item.batch) : "";
  const rawWafer = (item.waferNo && item.waferNo !== "-") ? String(item.waferNo) : "";
  const rawId = item.id != null ? String(item.id) : "";
  const w = rawWafer || (rawId && !rawId.startsWith("#WF") ? rawId : "");
  if (b && w) {
    if (w.includes(b)) return w;
    return `${b}${w}`;
  }
  return w || b || rawWafer || rawId || "-";
};

/**
 * Normalizes date to YYYY-MM-DD from record timestamp
 */
export const normalizeRecordDate = (record) => {
  if (!record) return "";
  const raw = record.timestamp || record.dateTime || record.time || record.timeShort || "";
  if (!raw || raw === "-") return "";

  const rawStr = String(raw).trim();

  // 1. DD-MMM-YYYY or DD/MMM/YYYY (e.g. 01-Sep-2026, 15-Jan-2026)
  const dMmmMatch = rawStr.match(/^(\d{1,2})[-/]([a-zA-Z]{3})[-/](\d{4})/);
  if (dMmmMatch) {
    const [_, d, mStr, y] = dMmmMatch;
    const mNum = MONTH_MAP[mStr.toLowerCase()] || "01";
    return `${y}-${mNum}-${d.padStart(2, "0")}`;
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY (e.g. 01-09-2026)
  const dmyMatch = rawStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 3. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = rawStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const [_, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(rawStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
};

/**
 * Gets epoch millisecond timestamp from record timestamp for accurate sorting and range calculation
 */
export const getRecordTimestampMs = (record) => {
  if (!record) return 0;
  const raw = record.timestamp || record.dateTime || record.time || "";
  if (!raw || raw === "-") return 0;

  const rawStr = String(raw).trim();

  // 1. DD-MMM-YYYY HH:mm:ss (e.g. 01-Sep-2026 14:10:25)
  const dMmmTime = rawStr.match(/^(\d{1,2})[-/]([a-zA-Z]{3})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dMmmTime) {
    const [_, d, mStr, y, h = "0", min = "0", s = "0"] = dMmmTime;
    const mNum = parseInt(MONTH_MAP[mStr.toLowerCase()] || "1", 10) - 1;
    return new Date(Number(y), mNum, Number(d), Number(h), Number(min), Number(s)).getTime();
  }

  // 2. DD-MM-YYYY HH:mm:ss (e.g. 01-09-2026 14:10:25)
  const dmyTime = rawStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyTime) {
    const [_, d, m, y, h = "0", min = "0", s = "0"] = dmyTime;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)).getTime();
  }

  // 3. YYYY-MM-DD HH:mm:ss
  const ymdTime = rawStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdTime) {
    const [_, y, m, d, h = "0", min = "0", s = "0"] = ymdTime;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)).getTime();
  }

  const parsed = new Date(rawStr);
  if (!isNaN(parsed.getTime())) return parsed.getTime();

  return 0;
};

export const getNumericValue = (val) => {
  if (val == null || val === "-") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const sortRecords = (records, sortField = "timestamp", sortOrder = "desc") => {
  if (!Array.isArray(records)) return [];
  return [...records].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    let cmp = 0;
    if (sortField === "timestamp") {
      const msA = getRecordTimestampMs(a);
      const msB = getRecordTimestampMs(b);
      cmp = msA - msB;
      if (cmp === 0) {
        cmp = String(a.id || "").localeCompare(String(b.id || ""));
      }
    } else if (sortField === "inferenceTime" || sortField === "temp" || sortField === "confidence" || sortField === "padsTotal" || sortField === "padsDetected") {
      const numA = getNumericValue(a[sortField]);
      const numB = getNumericValue(b[sortField]);
      cmp = numA - numB;
    } else if (sortField === "batch" || sortField === "waferNo") {
      const strA = formatBatchWafer(a);
      const strB = formatBatchWafer(b);
      cmp = strA.localeCompare(strB);
    } else {
      const strA = String(a[sortField] ?? "");
      const strB = String(b[sortField] ?? "");
      cmp = strA.localeCompare(strB);
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });
};
