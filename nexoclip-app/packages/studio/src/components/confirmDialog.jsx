import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// Promise-based replacement for window.confirm, styled like the Studio
// toasts. It mounts its own root on first use, so no studio needs a provider:
//   if (!(await confirmDialog({ title: "Delete this item?", destructive: true }))) return;
// Requests queue and show one at a time.

let root = null;
let queue = [];

function render() {
  if (typeof document === "undefined") return;
  if (!root) {
    const container = document.createElement("div");
    container.setAttribute("data-studio-dialog-host", "");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  const current = queue[0];
  root.render(current ? <ConfirmModal key={current.id} request={current} /> : null);
}

function settle(request, value) {
  if (queue[0] !== request) return;
  queue = queue.slice(1);
  request.resolve(value);
  render();
}

let nextId = 0;
export function confirmDialog(options) {
  const normalized = typeof options === "string" ? { title: options } : options;
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    queue = [...queue, { id: ++nextId, options: normalized, resolve }];
    render();
  });
}

function ConfirmModal({ request }) {
  const { title, description, confirmLabel = "OK", cancelLabel = "Cancel", destructive = false } = request.options;
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") settle(request, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) settle(request, false); }}
      style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: 16 }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="studio-confirm-title"
        style={{ width: "100%", maxWidth: 420, background: "#18181b", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.6)", padding: 20 }}
      >
        <h2 id="studio-confirm-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
        {description ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.65)", whiteSpace: "pre-line" }}>{description}</p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => settle(request, false)}
            style={{ padding: "8px 14px", fontSize: 13, borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.8)", cursor: "pointer" }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => settle(request, true)}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 10, border: "none", background: destructive ? "#ef4444" : "#ffffff", color: destructive ? "#ffffff" : "#18181b", cursor: "pointer" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
