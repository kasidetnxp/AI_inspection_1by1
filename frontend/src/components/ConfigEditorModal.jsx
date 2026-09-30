import React, { useState, useEffect, useRef } from "react";
import { useInspection } from "../context/InspectionContext";

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
  const [errorMsg, setErrorMsg] = useState(null);
  const [jsonError, setJsonError] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  const textareaRef = useRef(null);

  // Check if current file is active in runtime
  const isCurrentActive =
    !isNew &&
    ((configType === "product" && configLibrary.active_recipe === initialFilename) ||
      (configType === "machine" && configLibrary.active_machine === initialFilename));

  const fetchedKeyRef = useRef("");

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

      // Clone from activeConfigTemplate if provided
      let templateStr = "{\n  \n}";
      if (activeConfigTemplate && typeof activeConfigTemplate === "object") {
        try {
          templateStr = JSON.stringify(activeConfigTemplate, null, 2);
        } catch {
          templateStr = "{\n  \n}";
        }
      }
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

  // Live JSON validation
  useEffect(() => {
    if (!content.trim()) {
      setJsonError("Content cannot be empty");
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
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (e) {
      setJsonError(`Cannot format: ${e.message}`);
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

    try {
      JSON.parse(content);
    } catch (e) {
      setErrorMsg(`Cannot save: Invalid JSON - ${e.message}`);
      return;
    }

    setSaving(true);
    try {
      const oldFilename = !isNew && initialFilename && cleanFilename !== initialFilename ? initialFilename : null;
      const result = await saveConfigFile(configType, cleanFilename, content, shouldActivate, oldFilename);
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
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
        boxSizing: "border-box"
      }}
    >
      <div
        className="hmi-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "920px",
          maxWidth: "96vw",
          height: "85vh",
          maxHeight: "850px",
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px",
          border: "1px solid var(--border-color)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.45)",
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
                width: "36px",
                height: "36px",
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
                    fontWeight: "700",
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
                    style={{ fontSize: "11px", padding: "3px 8px", fontWeight: "700" }}
                  >
                    ACTIVE IN RUNTIME
                  </span>
                )}
              </div>
              <div style={{ fontSize: "13.5px", color: "var(--text-muted)", marginTop: "3px" }}>
                {isNew
                  ? "Define rules and parameters based on current active template"
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
            background: "rgba(0, 0, 0, 0.15)"
          }}
        >
          {/* Filename input / display */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
            <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              File Name:
            </span>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="e.g. Recipe_KMI710_Rev2.txt"
              className="font-mono"
              style={{
                flex: 1,
                maxWidth: "380px",
                padding: "8px 12px",
                fontSize: "14.5px",
                borderRadius: "6px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                color: "var(--text-main)",
                fontWeight: "600"
              }}
              title={!isNew ? "Edit to rename file" : "Enter configuration filename"}
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
            {jsonError ? (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "var(--color-fail)",
                  background: "rgba(239, 68, 68, 0.12)",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  maxWidth: "280px",
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
              title="Auto format and beautify JSON"
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
              title="Reset content to initial"
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
              fontSize: "12.5px",
              fontWeight: "600",
              borderBottom: "1px solid rgba(239, 68, 68, 0.25)"
            }}
          >
            {errorMsg}
          </div>
        )}
        {saveSuccessMsg && (
          <div
            style={{
              padding: "10px 22px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "var(--color-pass)",
              fontSize: "12.5px",
              fontWeight: "600",
              borderBottom: "1px solid rgba(16, 185, 129, 0.25)"
            }}
          >
            ✓ {saveSuccessMsg}
          </div>
        )}

        {/* EDITOR AREA */}
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
                fontSize: "14.5px",
                lineHeight: "1.6",
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
            <span>Tab key inserts 2 spaces. Saving an active config automatically updates runtime.</span>
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
              disabled={saving || !!jsonError}
              className="select-file-btn"
              style={{
                padding: "9px 20px",
                fontSize: "14px",
                fontWeight: "700",
                borderRadius: "6px",
                opacity: jsonError ? 0.6 : 1
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || !!jsonError}
              className="select-file-btn"
              style={{
                padding: "9px 22px",
                fontSize: "14px",
                fontWeight: "700",
                borderRadius: "6px",
                background: "var(--color-pass, #10b981)",
                borderColor: "var(--color-pass, #10b981)",
                color: "#ffffff",
                opacity: jsonError ? 0.6 : 1,
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)"
              }}
            >
              {saving ? "Applying..." : "Save & Activate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
