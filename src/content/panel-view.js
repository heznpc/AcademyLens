(function initAcademyLensPanelView(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensPanelView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function panelViewFactory() {
  "use strict";

  const PANEL_STYLES = String.raw`
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: none;
        }
        .panel {
          position: fixed;
          right: 22px;
          bottom: calc(20px + var(--academylens-bottom-offset, 0px));
          z-index: 2147483647;
          width: min(408px, calc(100vw - 44px));
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          color: #111827;
          font-size: 14.5px;
          line-height: 1.45;
          overflow: hidden;
          pointer-events: auto;
          opacity: 0;
          transform: translate3d(0, 10px, 0) scale(0.985);
          transform-origin: right bottom;
          transition:
            bottom 180ms ease,
            box-shadow 180ms ease,
            width 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 180ms ease-out,
            transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
          will-change: opacity, transform;
        }
        .panel[data-mounted="true"] {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 56px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.1);
        }
        .brand {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          gap: 9px;
        }
        .brand-icon {
          width: 22px;
          height: 22px;
          border-radius: 7px;
          flex: 0 0 auto;
        }
        .name {
          font-size: 15.5px;
          font-weight: 750;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .badge {
          font-size: 12.5px;
          color: #475569;
          white-space: nowrap;
        }
        .top-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .icon-button {
          display: inline-grid;
          width: 34px;
          min-height: 34px;
          place-items: center;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 8px;
          background: rgba(248, 250, 252, 0.9);
          color: #334155;
          font-size: 16px;
          line-height: 1;
        }
        .toggle-icon {
          display: none;
          width: 24px;
          height: 24px;
          border-radius: 8px;
        }
        [data-toggle-symbol] {
          line-height: 1;
        }
        .body {
          display: grid;
          gap: 12px;
          max-height: min(348px, calc(100vh - 156px));
          overflow-y: auto;
          padding: 14px 16px;
          opacity: 1;
          transform: translateY(0);
          transition:
            max-height 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 140ms ease,
            padding 190ms cubic-bezier(0.2, 0.8, 0.2, 1),
            transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .panel[data-collapsed="true"] {
          width: 56px;
          border-radius: 999px;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
        }
        .panel[data-collapsed="true"] .top {
          justify-content: center;
          min-height: 54px;
          padding: 5px;
          border-bottom: 0;
        }
        .panel[data-collapsed="true"] .brand,
        .panel[data-collapsed="true"] .badge {
          display: none;
        }
        .panel[data-collapsed="true"] .top-actions {
          gap: 0;
        }
        .panel[data-collapsed="true"] .icon-button {
          width: 44px;
          min-height: 44px;
          border-color: #111827;
          border-radius: 999px;
          background: #111827;
          color: #fff;
          font-size: 13px;
          font-weight: 760;
        }
        .panel[data-collapsed="true"] .toggle-icon {
          display: block;
        }
        .panel[data-collapsed="true"] .body {
          max-height: 0;
          padding-top: 0;
          padding-bottom: 0;
          opacity: 0;
          pointer-events: none;
          transform: translateY(-4px);
        }
        .field {
          display: grid;
          gap: 8px;
        }
        .note {
          color: #64748b;
          font-size: 13px;
          line-height: 1.45;
        }
        .note[data-glossary="true"] {
          color: #047857;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .settings {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .toggles {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          min-width: 0;
        }
        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #475569;
          font-size: 13.5px;
          line-height: 1;
        }
        .toggle input {
          width: 16px;
          height: 16px;
          margin: 0;
        }
        .provider {
          justify-self: start;
          max-width: 100%;
          min-height: 24px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 999px;
          padding: 3px 9px;
          background: rgba(248, 250, 252, 0.9);
          color: #475569;
          font-size: 12px;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .provider[data-provider="native"],
        .provider[data-provider="nativeReady"] {
          border-color: rgba(4, 120, 87, 0.2);
          color: #047857;
        }
        .provider[data-provider="nativeDownloadable"],
        .provider[data-provider="nativeDownloading"] {
          border-color: rgba(180, 83, 9, 0.22);
          color: #92400e;
        }
        .correction {
          display: none;
          gap: 8px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding-top: 10px;
        }
        .correction[data-active="true"] {
          display: grid;
        }
        .correction label {
          display: grid;
          gap: 6px;
          color: #475569;
          font-size: 12px;
        }
        .correction textarea {
          min-height: 56px;
          resize: vertical;
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 8px;
          padding: 8px 10px;
          color: #111827;
          font: inherit;
          font-size: 13px;
          line-height: 1.4;
        }
        .correction-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .manager {
          display: grid;
          gap: 8px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding-top: 10px;
        }
        .manager summary {
          cursor: pointer;
          color: #475569;
          font-size: 12.5px;
          font-weight: 700;
        }
        .manager-body {
          display: grid;
          gap: 8px;
          padding-top: 8px;
        }
        .manager-preview,
        .diagnostics-output {
          min-height: 20px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        .manager-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .manager-actions.single {
          grid-template-columns: 1fr;
        }
        button, select {
          min-height: 42px;
          border-radius: 8px;
          border: 1px solid rgba(15, 23, 42, 0.16);
          background: #fff;
          color: #111827;
          font: inherit;
          font-size: 14.5px;
          padding: 0 14px;
        }
        button {
          cursor: pointer;
          font-weight: 650;
        }
        button.primary {
          background: #111827;
          color: #fff;
          border-color: #111827;
        }
        .panel[data-busy="true"] button.primary {
          background: #1f2937;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .status {
          min-height: 20px;
          color: #475569;
          font-size: 13px;
          line-height: 1.5;
        }
        .status[data-tone="error"] {
          color: #b42318;
        }
        .status[data-tone="ok"] {
          color: #047857;
        }
        .progress {
          --value: 0%;
          flex: 1;
          height: 6px;
          min-width: 96px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.08);
        }
        .progress::before {
          display: block;
          width: var(--value);
          height: 100%;
          border-radius: inherit;
          background: #18b6a7;
          content: "";
          transition: width 160ms ease;
        }
        .progress[data-active="true"]::before {
          background: #3578e5;
        }
        @media (max-width: 420px) {
          .panel {
            right: 12px;
            bottom: calc(14px + var(--academylens-bottom-offset, 0px));
            width: calc(100vw - 24px);
          }
          .panel[data-collapsed="true"] {
            width: 56px;
          }
          .panel[data-bottom-overlay="true"][data-collapsed="true"] {
            top: 84px;
            bottom: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .panel,
          .body,
          .progress::before {
            transition: none;
          }
          .panel {
            opacity: 1;
            transform: none;
          }
        }
      </style>
  `;

  function renderPanel(options = {}) {
    const message = typeof options.message === "function" ? options.message : (key) => key;
    const providerMessageKey =
      typeof options.providerMessageKey === "function" ? options.providerMessageKey : (mode) => mode;
    const version = options.version || "dev";
    const iconUrl = options.iconUrl || "";
    const browserTranslatorStatus = options.browserTranslatorStatus || "unchecked";
    const providerMode = options.providerMode || "checking";

    return `
${PANEL_STYLES}
      <section class="panel" data-collapsed="true" data-version="${version}" data-browser-translator="${browserTranslatorStatus}">
        <div class="top">
          <div class="brand">
            <img class="brand-icon" src="${iconUrl}" alt="" />
            <div class="name">AcademyLens</div>
          </div>
          <div class="top-actions">
            <div class="badge">${message("badge.unofficial")}</div>
            <button type="button" class="icon-button" data-collapse aria-expanded="true" aria-label="${message("action.collapse")}">
              <img class="toggle-icon" src="${iconUrl}" alt="" />
              <span data-toggle-symbol aria-hidden="true">-</span>
            </button>
          </div>
        </div>
        <div class="body">
          <div class="field">
            <select data-language aria-label="${message("field.targetLanguage")}"></select>
            <div class="note" data-language-note></div>
          </div>
          <div class="settings">
            <div class="toggles">
              <label class="toggle">
                <input type="checkbox" data-auto-translate />
                <span>${message("panel.autoTranslate")}</span>
              </label>
              <label class="toggle">
                <input type="checkbox" data-native-download />
                <span>${message("panel.nativeDownloads")}</span>
              </label>
            </div>
            <div class="progress" data-progress role="progressbar" aria-label="${message("progress.translation")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
          </div>
          <div class="provider" data-provider-chip data-provider="${providerMode}">${message(providerMessageKey(providerMode))}</div>
          <div class="correction" data-correction data-active="false">
            <label>
              <span>${message("panel.correction")}</span>
              <textarea data-correction-input></textarea>
            </label>
            <div class="correction-actions">
              <button type="button" data-save-correction>${message("action.saveCorrection")}</button>
              <button type="button" data-cancel-correction>${message("action.cancelCorrection")}</button>
            </div>
          </div>
          <details class="manager" data-corrections-manager>
            <summary>${message("panel.corrections")} <span data-correction-count>0</span></summary>
            <div class="manager-body">
              <select data-correction-list aria-label="${message("panel.corrections")}"></select>
              <div class="manager-preview" data-correction-preview>${message("panel.noCorrections")}</div>
              <div class="manager-actions">
                <button type="button" data-delete-correction>${message("action.deleteCorrection")}</button>
                <button type="button" data-clear-corrections>${message("action.clearCorrections")}</button>
              </div>
            </div>
          </details>
          <details class="manager" data-diagnostics>
            <summary>${message("panel.diagnostics")}</summary>
            <div class="manager-body">
              <div class="diagnostics-output" data-diagnostics-output>${message("panel.diagnosticsIdle")}</div>
              <div class="manager-actions single">
                <button type="button" data-clear-cache>${message("action.clearCache")}</button>
              </div>
            </div>
          </details>
          <div class="row">
            <button type="button" class="primary" data-translate>${message("action.translate")}</button>
            <button type="button" data-restore>${message("action.restore")}</button>
          </div>
          <div class="status" data-status role="status" aria-live="polite" aria-atomic="true">${message("status.ready")}</div>
        </div>
      </section>
    `;
  }

  return Object.freeze({
    renderPanel
  });
});
