(function initAcademyLensReadingAssistant(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.AcademyLensReadingAssistant = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function readingAssistantFactory() {
  "use strict";

  const LABELS = {
    en: {
      open: "Original & notes", close: "Close", original: "Original", translated: "Translation",
      previous: "Previous passage", next: "Next passage", explain: "Explain this passage",
      empty: "Translate a passage, then select it here or click its text.",
      notes: "Notes", terms: "Terms & references", loading: "Preparing an explanation…",
      generated: "AI-generated explanation", failed: "An explanation is unavailable with this connection. Choose a model that supports explanations in extension settings.",
      reference: "Source-based terminology note",
      references: "Terminology references; not evidence that these sources verify the generated explanation.",
      glossary: "Glossary wording", select: "Select a passage", stale: "This passage has changed. Select it again."
    },
    ko: {
      open: "원문·각주", close: "닫기", original: "원문", translated: "번역",
      previous: "이전 문단", next: "다음 문단", explain: "이 문단 설명 보기",
      empty: "본문을 번역한 뒤 여기서 문단을 선택하거나 본문을 클릭하세요.",
      notes: "각주", terms: "용어·참고 자료", loading: "설명을 준비하고 있습니다…",
      generated: "AI 생성 설명", failed: "이 연결에서 설명을 제공할 수 없습니다. 확장 설정에서 설명을 지원하는 모델을 선택하세요.",
      reference: "출처 기반 용어 설명",
      references: "용어 참고 자료이며, 생성된 설명의 내용을 이 자료로 검증했다는 의미는 아닙니다.",
      glossary: "용어집 표기", select: "문단 선택", stale: "본문이 바뀌었습니다. 문단을 다시 선택하세요."
    }
  };

  function create(options = {}) {
    const doc = options.document;
    const view = options.window;
    const runtime = options.domTranslation;
    const getSettings = options.getSettings;
    const getGlossary = options.getGlossary || (() => null);
    const getContext = options.getContext || (() => "");
    const explain = options.explain;
    const words = LABELS[options.uiLocale] || LABELS.en;
    let host = null;
    let shadow = null;
    let selected = null;
    let active = false;
    let controller = null;
    let generation = 0;
    let returnFocus = null;
    const explanationCache = new Map();

    function node(tag, text, attributes = {}) {
      const element = doc.createElement(tag);
      if (text) element.textContent = text;
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    }

    function currentRecords() {
      return runtime.currentRecords().filter((record) => runtime.isCurrentRecordStillOwned(record));
    }

    function cancel() {
      generation += 1;
      if (controller) controller.abort();
      controller = null;
    }

    function sourceText(record) {
      return record ? String(record.originalText || record.normalized || "") : "";
    }

    function matchingTerms(record) {
      const glossary = getGlossary();
      const original = sourceText(record);
      return ((glossary && glossary.terms) || []).filter((term) => {
        const escaped = term.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^A-Za-z0-9_'’-])${escaped}(?=$|[^A-Za-z0-9_'’-])`, "i").test(original);
      }).slice(0, 12);
    }

    function renderTerms() {
      const list = shadow.querySelector("[data-terms]");
      list.replaceChildren();
      const glossary = getGlossary();
      for (const term of matchingTerms(selected)) {
        const item = node("li");
        item.append(node("span", `${term.target} — ${term.source}`));
        // `note` is an editorial translation instruction, not a definition.
        for (const id of term.sources || []) {
          const source = glossary && glossary.sourceCatalog && glossary.sourceCatalog[id];
          if (!source || !source.url) continue;
          let url;
          try { url = new URL(source.url); } catch { continue; }
          if (url.protocol !== "https:") continue;
          item.append(node("a", source.title || id, { href: url.href, target: "_blank", rel: "noopener noreferrer" }));
        }
        list.append(item);
      }
      shadow.querySelector("[data-terms-section]").hidden = !list.children.length;
    }

    function select(record) {
      cancel();
      selected = record || null;
      const settings = getSettings();
      const original = shadow.querySelector("[data-original]");
      const translated = shadow.querySelector("[data-translated]");
      original.textContent = sourceText(selected);
      translated.textContent = selected ? selected.translated : words.empty;
      translated.lang = settings.targetLanguage || "en";
      shadow.querySelector("[data-notes]").replaceChildren();
      shadow.querySelector("[data-note-sources]").replaceChildren();
      shadow.querySelector("[data-status]").textContent = "";
      shadow.querySelector("[data-explain]").disabled = !selected;
      shadow.querySelector("[data-position]").textContent = selected ? `${currentRecords().indexOf(selected) + 1} / ${currentRecords().length}` : "0 / 0";
      renderTerms();
    }

    function open(record, focus = false) {
      mount();
      if (shadow.querySelector("[data-reader]").hidden) returnFocus = shadow.activeElement || doc.activeElement;
      shadow.querySelector("[data-reader]").hidden = false;
      shadow.querySelector("[data-open]").setAttribute("aria-expanded", "true");
      select(record || selected || currentRecords()[0] || null);
      if (focus) shadow.querySelector("[data-close]").focus();
    }

    function close() {
      cancel();
      if (!shadow) return;
      shadow.querySelector("[data-reader]").hidden = true;
      shadow.querySelector("[data-open]").setAttribute("aria-expanded", "false");
      if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === "function") returnFocus.focus();
      returnFocus = null;
    }

    function move(step) {
      const records = currentRecords();
      if (!records.length) return select(null);
      const index = Math.max(0, records.indexOf(selected));
      const record = records[(index + step + records.length) % records.length];
      select(record);
      const target = runtime.recordTarget(record);
      const element = target.nodeType === view.Node.TEXT_NODE ? target.parentElement : target;
      element?.scrollIntoView({ block: "center", behavior: "auto" });
    }

    function renderExplanation(response) {
      const list = shadow.querySelector("[data-notes]");
      list.replaceChildren();
      const item = node("li", response.text);
      item.lang = getSettings().targetLanguage || "en";
      list.append(item);
      const isReference = response.kind === "reference" || response.sourceKind === "reference";
      shadow.querySelector("[data-status]").textContent = `${isReference ? words.reference : words.generated} · ${response.provider || getSettings().translationEngine}`;
      const sources = shadow.querySelector("[data-note-sources]");
      sources.replaceChildren();
      if (isReference) {
        for (const source of response.sources || []) {
          let url;
          try { url = new URL(source.url); } catch { continue; }
          if (url.protocol !== "https:") continue;
          sources.append(node("a", source.title || url.hostname, { href: url.href, target: "_blank", rel: "noopener noreferrer" }));
        }
      }
    }

    async function explainSelected() {
      if (!selected || !runtime.isCurrentRecordStillOwned(selected)) {
        shadow.querySelector("[data-status]").textContent = words.stale;
        return;
      }
      cancel();
      const requestGeneration = generation;
      const record = selected;
      const settings = getSettings();
      const original = sourceText(record);
      const context = getContext(record);
      const settingsKey = JSON.stringify([settings.targetLanguage, settings.translationEngine, settings.ollamaModel, settings.apiEndpoint, settings.apiModel, settings.puterModel, settings.providerRevision]);
      const contextKey = typeof context === "string" ? context : JSON.stringify(context || {});
      const cacheKey = `${settingsKey}\n${contextKey}\n${original}`;
      if (explanationCache.has(cacheKey)) return renderExplanation(explanationCache.get(cacheKey));
      controller = new view.AbortController();
      shadow.querySelector("[data-explain]").disabled = true;
      shadow.querySelector("[data-status]").textContent = words.loading;
      try {
        const response = await explain({ original, targetLanguage: settings.targetLanguage, context, signal: controller.signal });
        if (generation !== requestGeneration || selected !== record || !active) return;
        if (!runtime.isCurrentRecordStillOwned(record)) throw new Error(words.stale);
        if (!response || !response.ok || !response.text) throw new Error(words.failed);
        explanationCache.set(cacheKey, response);
        if (explanationCache.size > 30) explanationCache.delete(explanationCache.keys().next().value);
        renderExplanation(response);
      } catch (error) {
        if (generation !== requestGeneration) return;
        shadow.querySelector("[data-status]").textContent = error && error.message === words.stale ? words.stale : words.failed;
      } finally {
        if (generation === requestGeneration) {
          controller = null;
          shadow.querySelector("[data-explain]").disabled = !selected;
        }
      }
    }

    function onDocumentClick(event) {
      const element = event.target && event.target.nodeType === 1 ? event.target : event.target?.parentElement;
      if (!element || element.closest("[data-academylens-skip], .academylens-root, a, button, input, select, textarea, label, [contenteditable], [role='button'], [role='dialog']")) return;
      const caret = typeof doc.caretRangeFromPoint === "function" ? doc.caretRangeFromPoint(event.clientX, event.clientY) : null;
      const record = runtime.recordForTarget(caret && caret.startContainer) || currentRecords().find((candidate) => {
        const target = runtime.recordTarget(candidate);
        return target.nodeType === view.Node.TEXT_NODE ? target.parentElement === element : target === element || target.contains(element);
      });
      if (record && runtime.isCurrentRecordStillOwned(record)) open(record);
    }

    function mount() {
      if (host) return;
      host = node("div", "", { "data-academylens-skip": "", "data-academylens-reader": "", lang: options.uiLocale || "en" });
      host.style.cssText = "all:initial;position:fixed;left:12px;bottom:12px;z-index:2147483646;width:0;height:0";
      shadow = host.attachShadow({ mode: "open" });
      const style = node("style");
      style.textContent = `:host{font:14px/1.5 system-ui,sans-serif;color:#17212b}*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;cursor:pointer;background:#fff;color:#17212b;border:1px solid #9da8b4;border-radius:8px;padding:6px 10px}button:focus-visible,a:focus-visible{outline:3px solid #1267cc;outline-offset:2px}button:disabled{cursor:default;opacity:.55}[data-open]{position:absolute;bottom:0;left:0;white-space:nowrap;box-shadow:0 2px 12px #0002}[data-reader]{position:absolute;left:0;bottom:42px;width:min(430px,calc(100vw - 24px));max-height:calc(100vh - 82px);overflow:auto;background:#fff;border:1px solid #a9b5bf;border-radius:12px;padding:16px;box-shadow:0 4px 24px #0003}header,.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header strong{flex:1}h3{font-size:14px;margin:15px 0 5px}p,li{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}ol{padding-left:24px}a{display:block;color:#125ba5;font-size:12px}small,[data-status]{font-size:12px;color:#4a5662}[data-original]{border-left:3px solid #a9b5bf;padding-left:10px}[data-status]{min-height:1.5em}`;
      shadow.append(style);
      const launcher = node("button", words.open, { "data-open": "", "aria-expanded": "false", "aria-controls": "academylens-reader" });
      const reader = node("section", "", { "data-reader": "", id: "academylens-reader", role: "region", "aria-label": words.open });
      reader.hidden = true;
      const header = node("header");
      const closeButton = node("button", words.close, { "data-close": "" });
      header.append(node("strong", words.open), closeButton);
      const controls = node("div", "", { class: "controls", "aria-label": words.select });
      const previous = node("button", "←", { "aria-label": words.previous });
      const next = node("button", "→", { "aria-label": words.next });
      controls.append(previous, node("span", "", { "data-position": "", "aria-live": "polite" }), next);
      const explanationButton = node("button", words.explain, { "data-explain": "" });
      const terms = node("section", "", { "data-terms-section": "" });
      terms.append(node("h3", words.terms), node("small", words.references), node("ol", "", { "data-terms": "" }));
      reader.append(header, controls, node("h3", words.translated), node("p", "", { "data-translated": "", dir: "auto" }), node("h3", words.original), node("p", "", { "data-original": "", lang: "en", dir: "auto" }), terms, node("h3", words.notes), explanationButton, node("p", "", { "data-status": "", role: "status", "aria-live": "polite" }), node("ol", "", { "data-notes": "", dir: "auto" }), node("div", "", { "data-note-sources": "" }));
      shadow.append(launcher, reader);
      launcher.addEventListener("click", () => reader.hidden ? open(null, true) : close());
      closeButton.addEventListener("click", close);
      previous.addEventListener("click", () => move(-1));
      next.addEventListener("click", () => move(1));
      explanationButton.addEventListener("click", explainSelected);
      shadow.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
      doc.documentElement.append(host);
      select(null);
    }

    function start() {
      if (active) return;
      active = true;
      mount();
      host.style.display = "block";
      doc.addEventListener("click", onDocumentClick);
    }

    function reset() {
      close();
      selected = null;
      explanationCache.clear();
      if (shadow) select(null);
    }

    function stop() {
      active = false;
      reset();
      doc.removeEventListener("click", onDocumentClick);
      if (host) host.style.display = "none";
    }

    return Object.freeze({ start, stop, reset, open });
  }

  return Object.freeze({ create });
});
