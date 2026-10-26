import React, { useState, useEffect, useRef } from "react";
import { useInspection } from "../context/InspectionContext";

// Clean templates containing ONLY active parameters, with blanks for values to be filled in
const NEW_PRODUCT_TEMPLATE = `{
  "edgeThreshold": ,
  "areaRatioThreshold": ,
  "targetWidth": 160,
  "targetHeight": 160,
  "horizontalRoi": 0.7,
  "verticalRoi": 0.7,
  "minAreaSizes": [300, 10],
  "devices": []
}`;

const NEW_MACHINE_TEMPLATE = `{
  "lot.source.folder": "N:\\\\WP269\\\\PMI\\\\IMAGE",
  "machine.result.folder": "N:\\\\WP269\\\\PMI\\\\JUDGE",
  "lot.input.folder": "M:\\\\WP269\\\\PMI\\\\PROCESSED\\\\{output.lotNo}",
  "lot.output.folder": "M:\\\\WP269\\\\PMI\\\\OUTPUT\\\\{output.lotNo}",
  "machine.result.fileFormat": "{output.result}_{output.code}_{output.machine}_{output.ts}.txt",
  "process.end.timeout": 10000,
  "input.index.processTime": 0,
  "input.index.waferId": 1,
  "input.index.siteCoordinate": 2,
  "input.index.probecardSite": 3,
  "input.index.padNo": 4,
  "input.index.detailInfo": 5,
  "input.index.device": 6,
  "input.index.temperature": 7,
  "input.index.machine": -1,
  "input.index.lotNo": -1
}`;

// Background defaults to ensure full compatibility with inference pipeline
const BACKGROUND_PRODUCT_DEFAULTS = {
  scriptName: "unet-inferencer.py",
  algorithm: "unet",
  classNames: ["pad", "probemark"],
  padShape: "rectangle",
  thingColors: ["#FF0000", "#00FF00"],
  badLabels: ["bad", "defect"],
  skipDevices: [],
  padIndex: 0,
  generateOutput: true,
  combineOutput: true,
  greyscaleThreshold: 0,
  edgeConversionFactor: 1.0
};

export default function ConfigEditorModal({
  isOpen,
  onClose,
  configType, // "product" or "machine"
  initialFilename,
  isNew = false,
  activeConfigTemplate = null,
  onSuccess
}) {
  const { fetchConfigFile, saveConfigFile, configLibrary } = useInspection();

  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [jsonError, setJsonError] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  const textareaRef = useRef(null);
  const fetchedKeyRef = useRef("");

  // Check if current file is active in runtime
  const isCurrentActive =
    !isNew &&
    ((configType === "product" && configLibrary.active_recipe === initialFilename) ||
      (configType === "machine" && configLibrary.active_machine === initialFilename));

  // Initialize or fetch file
  useEffect(() => {
    if (!isOpen) {
      fetchedKeyRef.current = "";
      return;
    }

    const currentKey = `${configType}:${initialFilename}:${isNew}`;
    if (fetchedKeyRef.current === currentKey) {
      return;
    }
    fetchedKeyRef.current = currentKey;

    setErrorMsg(null);
    setSaveSuccessMsg(null);
    setJsonError(null);

    if (isNew) {
      const defaultName =
        configType === "product"
          ? `Recipe_Custom_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.txt`
          : `Machine_Custom_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.txt`;
      setFilename(defaultName);

      const templateStr = configType === "product" ? NEW_PRODUCT_TEMPLATE : NEW_MACHINE_TEMPLATE;
      setContent(templateStr);
      setInitialContent(templateStr);
      setLoading(false);
    } else if (initialFilename) {
      setFilename(initialFilename);
      setLoading(true);
      fetchConfigFile(configType, initialFilename)
        .then((res) => {
          let text = "";
          if (typeof res === "string") {
            try {
              text = JSON.stringify(JSON.parse(res), null, 2);
            } catch {
              text = res;
            }
          } else if (res && typeof res === "object") {
            if (res._raw) {
              text = res._raw;
            } else if (res.content) {
              try {
                text = JSON.stringify(JSON.parse(res.content), null, 2);
              } catch {
                text = String(res.content);
              }
            } else if (res.parsed) {
              text = JSON.stringify(res.parsed, null, 2);
            } else {
              text = JSON.stringify(res, null, 2);
            }
          }
          setContent(text);
          setInitialContent(text);
        })
        .catch((err) => {
          setErrorMsg(err.message || "Failed to load config file");
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, configType, initialFilename, isNew, activeConfigTemplate, fetchConfigFile]);

  // Live JSON validation (gentle when empty values are waiting to be typed)
  useEffect(() => {
    if (!content.trim()) {
      setJsonError("Content cannot be empty");
      return;
    }

    // Check if user is still filling in empty template fields like `"key": ,`
    if (/:\s*,/.test(content) || /:\s*$/.test(content.trim()) || /:\s*\}/.test(content)) {
      setJsonError("WAITING_FILL");
      return;
    }

    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setJsonError("Root JSON must be an object { ... }");
      } else {
        setJsonError(null);
      }
    } catch (e) {
      setJsonError(e.message);
    }
  }, [content]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, saving, onClose]);

  // Allow tab key to insert 2 spaces
  const handleKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.target;
      const newContent = content.substring(0, selectionStart) + "  " + content.substring(selectionEnd);
      setContent(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = selectionStart + 2;
        }
      }, 0);
    }
  };

  const handleFormatJson = () => {
    if (jsonError === "WAITING_FILL") {
      setErrorMsg("กรุณากรอกค่าตัวเลขให้ครบก่อนจัดฟอร์แมต (Please fill in empty values before formatting)");
      return;
    }
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
      setJsonError(null);
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(`Cannot format: ${e.message}`);
    }
  };

  const handleReset = () => {
    setContent(initialContent);
    setJsonError(null);
    setErrorMsg(null);
  };

  const handleSave = async (shouldActivate) => {
    setErrorMsg(null);
    setSaveSuccessMsg(null);

    const cleanFilename = filename.trim();
    if (!cleanFilename) {
      setErrorMsg("Filename is required");
      return;
    }

    // Check for unfilled empty fields
    if (/:\s*,/.test(content) || /:\s*$/.test(content.trim()) || /:\s*\}/.test(content)) {
      setErrorMsg("กรุณากรอกค่าพารามิเตอร์ให้ครบก่อนบันทึก (เช่น ค่าหลัง 'edgeThreshold': หรือ 'areaRatioThreshold':)");
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      setErrorMsg(`Cannot save: Invalid JSON - ${e.message}`);
      return;
    }

    // If it's a product recipe, ensure background baseline parameters exist so the AI pipeline works seamlessly
    let finalPayload = content;
    if (configType === "product" && parsed && typeof parsed === "object") {
      const merged = { ...BACKGROUND_PRODUCT_DEFAULTS, ...parsed };
      finalPayload = JSON.stringify(merged, null, 2);
    }

    setSaving(true);
    setIsActivating(shouldActivate);
    try {
      const oldFilename = !isNew && initialFilename && cleanFilename !== initialFilename ? initialFilename : null;
      const result = await saveConfigFile(configType, cleanFilename, finalPayload, shouldActivate, oldFilename);
      if (result.success) {
        setSaveSuccessMsg(
          shouldActivate
            ? `Successfully saved and activated '${cleanFilename}'`
            : `Successfully saved '${cleanFilename}'`
        );
        setTimeout(() => {
          if (onSuccess) onSuccess(cleanFilename, shouldActivate);
          onClose();
        }, 800);
      } else {
        setErrorMsg(result.error || "Save failed");
      }
    } catch (err) {
      setErrorMsg(err.message || "An unexpected error occurred");
    } finally {
      setSaving(false);
      setIsActivating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="split-view-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        boxSizing: "border-box"
      }}
    >
      <div
        className="hmi-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "920px",
          maxWidth: "96vw",
          height: "86vh",
          maxHeight: "860px",
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          background: "var(--bg-card, #111827)"
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                background: configType === "product" ? "rgba(14, 165, 233, 0.15)" : "rgba(245, 158, 11, 0.15)",
                color: configType === "product" ? "var(--color-info)" : "var(--color-warn)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800" }}>
                  {isNew
                    ? configType === "product"
                      ? "Create New Recipe Configuration"
                      : "Create New Machine Calibration Setting"
                    : configType === "product"
                      ? "Edit Product Recipe Configuration"
                      : "Edit Machine Calibration Setting"}
                </h3>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "800",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: configType === "product" ? "rgba(14, 165, 233, 0.15)" : "rgba(245, 158, 11, 0.15)",
                    color: configType === "product" ? "var(--color-info)" : "var(--color-warn)",
                    textTransform: "uppercase"
                  }}
                >
                  {configType}
                </span>
                {isCurrentActive && (
                  <span
                    className="badge-result pass"
                    style={{ fontSize: "11px", padding: "3px 8px", fontWeight: "800" }}
                  >
                    ACTIVE IN RUNTIME
                  </span>
                )}
              </div>
              <div style={{ fontSize: "13.5px", color: "var(--text-muted)", marginTop: "3px" }}>
                {isNew
                  ? "JSON template with core parameters ready. Fill in your desired values and save."
                  : "Modify JSON configuration parameters and apply into runtime"}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="action-btn-sm"
            style={{
              padding: "6px 10px",
              fontSize: "16px",
              lineHeight: 1,
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer"
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* FILENAME & TOOLBAR ROW */}
        <div
          style={{
            padding: "12px 22px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            background: "rgba(0, 0, 0, 0.18)"
          }}
        >
          {/* Filename input */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
            <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              File Name:
            </span>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="e.g. Recipe_KMI710.txt"
              className="font-mono"
              style={{
                flex: 1,
                maxWidth: "360px",
                padding: "8px 12px",
                fontSize: "14px",
                borderRadius: "6px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                color: "var(--text-main)",
                fontWeight: "600"
              }}
              title="Configuration filename"
            />
            {!isNew && filename !== initialFilename && (
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--color-warn)",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  whiteSpace: "nowrap"
                }}
              >
                Renaming from {initialFilename}
              </span>
            )}
          </div>

          {/* Validation & Toolbar Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {jsonError === "WAITING_FILL" ? (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--color-info, #0ea5e9)",
                  background: "rgba(14, 165, 233, 0.12)",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(14, 165, 233, 0.3)"
                }}
                title="Fill in values after the colon"
              >
                ✎ กรอกค่าตัวเลขในช่องว่าง
              </span>
            ) : jsonError ? (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--color-fail)",
                  background: "rgba(239, 68, 68, 0.12)",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  maxWidth: "260px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
                title={jsonError}
              >
                ✕ JSON Syntax Error
              </span>
            ) : (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--color-pass)",
                  background: "rgba(16, 185, 129, 0.12)",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(16, 185, 129, 0.3)"
                }}
              >
                ✓ Valid JSON
              </span>
            )}

            <button
              type="button"
              onClick={handleFormatJson}
              className="select-file-btn"
              style={{ padding: "6px 14px", fontSize: "13.5px", borderRadius: "6px" }}
              title="Auto format JSON"
            >
              Format JSON
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="select-file-btn"
              style={{
                padding: "6px 14px",
                fontSize: "13.5px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.04)"
              }}
              title="Reset template to initial"
            >
              Reset
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {errorMsg && (
          <div
            style={{
              padding: "10px 22px",
              background: "rgba(239, 68, 68, 0.12)",
              color: "var(--color-fail)",
              fontSize: "13px",
              fontWeight: "600",
              borderBottom: "1px solid rgba(239, 68, 68, 0.25)"
            }}
          >
            ✕ {errorMsg}
          </div>
        )}
        {saveSuccessMsg && (
          <div
            style={{
              padding: "10px 22px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "var(--color-pass)",
              fontSize: "13px",
              fontWeight: "600",
              borderBottom: "1px solid rgba(16, 185, 129, 0.25)"
            }}
          >
            ✓ {saveSuccessMsg}
          </div>
        )}

        {/* CLEAN JSON TEXTAREA EDITOR */}
        <div style={{ flex: 1, position: "relative", minHeight: 0, display: "flex", flexDirection: "column" }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              Loading configuration content...
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              placeholder='{\n  "edgeThreshold": 8.0,\n  ...\n}'
              style={{
                flex: 1,
                width: "100%",
                height: "100%",
                padding: "18px 22px",
                border: "none",
                outline: "none",
                resize: "none",
                background: "#090d16",
                color: "#e2e8f0",
                fontFamily: "var(--font-mono, 'Consolas', 'Courier New', monospace)",
                fontSize: "15px",
                lineHeight: "1.7",
                boxSizing: "border-box"
              }}
            />
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
            gap: "12px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--color-info)" }}>ℹ</span>
            <span>
              {isNew
                ? "พิมพ์ค่าตัวเลขหลังเครื่องหมาย : แล้วกด Save เพื่อบันทึกเข้าสู่ระบบ"
                : "Tab key inserts 2 spaces. Saving an active config automatically updates runtime."}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              className="select-file-btn"
              disabled={saving}
              style={{ padding: "9px 18px", fontSize: "14px", borderRadius: "6px", background: "transparent" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving || (jsonError && jsonError !== "WAITING_FILL")}
              className="select-file-btn"
              style={{
                padding: "9px 20px",
                fontSize: "14px",
                fontWeight: "700",
                borderRadius: "6px",
                opacity: jsonError && jsonError !== "WAITING_FILL" ? 0.6 : 1
              }}
            >
              {saving && !isActivating ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || (jsonError && jsonError !== "WAITING_FILL")}
              className="select-file-btn"
              style={{
                padding: "9px 22px",
                fontSize: "14px",
                fontWeight: "700",
                borderRadius: "6px",
                background: "var(--color-pass, #10b981)",
                borderColor: "var(--color-pass, #10b981)",
                color: "#ffffff",
                opacity: jsonError && jsonError !== "WAITING_FILL" ? 0.6 : 1,
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)"
              }}
            >
              {saving && isActivating ? "Applying..." : "Save & Activate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
