(function initAcademyLensDomTranslationRuntime(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensDomTranslationRuntime = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function domTranslationRuntimeFactory() {
  "use strict";

  const INLINE_MERGE_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption";
  const SAFE_INLINE_TAGS = new Set(["B", "EM", "I", "MARK", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U"]);
  const UNSAFE_INLINE_MERGE_SELECTOR = [
    "button",
    "canvas",
    "code",
    "form",
    "iframe",
    "input",
    "kbd",
    "pre",
    "samp",
    "script",
    "select",
    "svg",
    "textarea",
    "[contenteditable='true']",
    "[role='button']"
  ].join(",");

  function create(options = {}) {
    const doc = options.document;
    const view = options.window || (doc && doc.defaultView) || globalThis;
    const Text = options.Text;
    const limits = options.limits || {};
    const getTargetLanguage = typeof options.getTargetLanguage === "function" ? options.getTargetLanguage : () => "en";
    const getPanelElement = typeof options.getPanelElement === "function" ? options.getPanelElement : () => null;
    const suppressMutationReactions =
      typeof options.suppressMutationReactions === "function" ? options.suppressMutationReactions : () => {};

    if (!doc || !Text) {
      throw new Error("AcademyLensDomTranslationRuntime requires document and Text utilities");
    }

    let replacements = [];
    let nodeRecords = new WeakMap();

    function currentRecords() {
      return replacements.filter((record) => record.target && record.target.isConnected);
    }

    function recordTarget(record) {
      return record ? record.target || record.node : null;
    }

    function recordForTarget(target) {
      return target ? nodeRecords.get(target) || null : null;
    }

    function forgetRecord(record) {
      const target = recordTarget(record);
      if (target) nodeRecords.delete(target);
      replacements = replacements.filter((item) => item !== record);
    }

    function isCurrentRecordStillOwned(record) {
      const target = recordTarget(record);
      if (!target || !target.isConnected) return false;
      return target.textContent === record.translated;
    }

    function restoreRecordOriginal(record) {
      const target = recordTarget(record);
      if (!target || !target.isConnected || !isCurrentRecordStillOwned(record)) return false;
      suppressMutationReactions();
      if (record.kind === "element") {
        target.innerHTML = record.original;
      } else {
        target.textContent = record.original;
      }
      nodeRecords.delete(target);
      return true;
    }

    function restoreAllRecords() {
      let restored = 0;
      suppressMutationReactions();
      for (const record of currentRecords()) {
        const target = recordTarget(record);
        if (!target || !target.isConnected) continue;
        if (restoreRecordOriginal(record)) restored += 1;
        nodeRecords.delete(target);
      }
      replacements = [];
      nodeRecords = new WeakMap();
      return restored;
    }

    function shouldSkipRecordedTarget(target) {
      const record = recordForTarget(target);
      if (!record) return false;
      if (isCurrentRecordStillOwned(record)) return true;
      forgetRecord(record);
      return false;
    }

    function isInsideRecordedElement(node) {
      let current = node && node.parentElement;
      while (current && current !== doc.body) {
        if (shouldSkipRecordedTarget(current)) return true;
        current = current.parentElement;
      }
      return false;
    }

    function hasOnlySafeInlineContent(element) {
      for (const child of element.children) {
        if (!SAFE_INLINE_TAGS.has(child.tagName)) return false;
        if (child.matches(UNSAFE_INLINE_MERGE_SELECTOR) || child.querySelector(UNSAFE_INLINE_MERGE_SELECTOR)) {
          return false;
        }
      }
      return true;
    }

    function shouldMergeInlineElement(element) {
      if (!element || !element.matches(INLINE_MERGE_SELECTOR)) return false;
      if (nodeRecords.has(element)) return !shouldSkipRecordedTarget(element);
      if (Text.isExcludedElement(element) || !Text.isElementVisible(element)) return false;
      if (!hasOnlySafeInlineContent(element)) return false;
      const textNodes = Array.from(element.childNodes).filter(
        (node) => node.nodeType === view.Node.TEXT_NODE && Text.normalizeWhitespace(node.textContent)
      );
      if (textNodes.length === 0 || element.children.length === 0) return false;
      return Text.shouldTranslateText(element.textContent, getTargetLanguage(), limits.maxTextLength, element);
    }

    function candidateRect(candidate) {
      const target = candidate && candidate.target;
      if (!target) return null;
      const element = target.nodeType === view.Node.TEXT_NODE ? target.parentElement : target;
      if (!element || typeof element.getBoundingClientRect !== "function") return null;
      return element.getBoundingClientRect();
    }

    function candidateViewportScore(candidate) {
      const rect = candidateRect(candidate);
      if (!rect) return Number.MAX_SAFE_INTEGER;
      if (rect.bottom >= 0 && rect.top <= view.innerHeight) {
        return Math.max(0, rect.top);
      }
      if (rect.top > view.innerHeight) {
        return 100000 + rect.top - view.innerHeight;
      }
      return 200000 + Math.abs(rect.bottom);
    }

    function sortCandidatesByViewport(candidates) {
      return candidates
        .map((candidate, index) => ({ candidate, index, score: candidateViewportScore(candidate) }))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map((item) => item.candidate);
    }

    function collectInlineElementCandidates() {
      if (!doc.body) return [];
      const retained = [];
      const maxCandidates = limits.maxCandidateScanNodes || limits.maxTextNodesPerPass;
      let index = 0;
      for (const element of doc.body.querySelectorAll(INLINE_MERGE_SELECTOR)) {
        if (!shouldMergeInlineElement(element)) continue;
        const candidate = {
          kind: "element",
          target: element,
          original: element.innerHTML,
          originalText: element.textContent,
          normalized: Text.normalizeWhitespace(element.textContent)
        };
        retained.push({ candidate, index, score: candidateViewportScore(candidate) });
        index += 1;
        if (retained.length > maxCandidates * 2) {
          retained.sort((a, b) => a.score - b.score || a.index - b.index);
          retained.length = maxCandidates;
        }
      }
      return retained
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .slice(0, maxCandidates)
        .map((item) => item.candidate);
    }

    function collectCandidates() {
      if (!doc.body) return [];
      const elementCandidates = collectInlineElementCandidates();
      const elementCandidateTargets = new WeakSet(elementCandidates.map((candidate) => candidate.target));
      const isInsideInlineCandidate = (node) => {
        let current = node && node.parentElement;
        while (current && current !== doc.body) {
          if (elementCandidateTargets.has(current)) return true;
          current = current.parentElement;
        }
        return false;
      };
      const nodes = Text.collectTranslatableTextNodes(doc.body, {
        targetLanguage: getTargetLanguage(),
        maxTextLength: limits.maxTextLength,
        maxNodes: limits.maxCandidateScanNodes || limits.maxTextNodesPerPass,
        scoreNode(node) {
          return candidateViewportScore({ target: node });
        },
        shouldSkipNode(node) {
          return isInsideRecordedElement(node) || isInsideInlineCandidate(node) || shouldSkipRecordedTarget(node);
        }
      });

      const nodeCandidates = nodes
        .filter((node) => !isInsideRecordedElement(node))
        .filter((node) => !isInsideInlineCandidate(node))
        .filter((node) => !shouldSkipRecordedTarget(node))
        .map((node) => ({
          kind: "text",
          target: node,
          node,
          original: node.textContent,
          normalized: Text.normalizeWhitespace(node.textContent)
        }))
        .filter((item) => item.normalized);

      return sortCandidatesByViewport([...elementCandidates, ...nodeCandidates]).slice(0, limits.maxTextNodesPerPass);
    }

    function directGlossaryTranslation(prepared) {
      if (!prepared || !prepared.text || !Array.isArray(prepared.placeholders)) return "";
      const token = prepared.text.trim();
      if (!/^__AL_TERM_\d+__$/.test(token)) return "";
      const placeholder = prepared.placeholders.find((item) => item.token === token);
      return placeholder ? placeholder.value : "";
    }

    function appendTextPart(fragment, value) {
      if (value) fragment.append(doc.createTextNode(value));
    }

    function inlineChildrenFor(element) {
      return Array.from(element.children).filter(
        (child) =>
          SAFE_INLINE_TAGS.has(child.tagName) &&
          !child.matches(UNSAFE_INLINE_MERGE_SELECTOR) &&
          !child.querySelector(UNSAFE_INLINE_MERGE_SELECTOR) &&
          Text.normalizeWhitespace(child.textContent)
      );
    }

    function prepareInlinePlaceholders(candidate, prepared) {
      if (!candidate || candidate.kind !== "element" || !candidate.target || !prepared) return prepared;

      const glossaryValues = new Set((prepared.placeholders || []).map((item) => Text.normalizeWhitespace(item.value)));
      const inlinePlaceholders = [];
      let text = prepared.text;
      for (const child of inlineChildrenFor(candidate.target)) {
        const childText = Text.normalizeWhitespace(child.textContent);
        if (!childText || glossaryValues.has(childText)) continue;

        const index = text.indexOf(childText);
        if (index === -1) continue;

        const token = `__AL_INLINE_${inlinePlaceholders.length}__`;
        text = `${text.slice(0, index)}${token}${text.slice(index + childText.length)}`;
        inlinePlaceholders.push({
          token,
          value: childText,
          child
        });
      }

      if (!inlinePlaceholders.length) return prepared;
      return {
        ...prepared,
        text,
        inlinePlaceholders
      };
    }

    function createInlineTokenFragment(translated, inlinePlaceholders) {
      if (!Array.isArray(inlinePlaceholders) || inlinePlaceholders.length === 0) return null;

      const tokens = new Map(inlinePlaceholders.map((item) => [item.token, item]));
      const pattern = new RegExp(
        inlinePlaceholders.map((item) => item.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "g"
      );
      const fragment = doc.createDocumentFragment();
      let cursor = 0;
      let preserved = 0;
      for (const match of translated.matchAll(pattern)) {
        appendTextPart(fragment, translated.slice(cursor, match.index));
        const placeholder = tokens.get(match[0]);
        if (placeholder && placeholder.child) {
          const clone = placeholder.child.cloneNode(false);
          clone.textContent = placeholder.value;
          fragment.append(clone);
          preserved += 1;
        } else {
          appendTextPart(fragment, match[0]);
        }
        cursor = match.index + match[0].length;
      }
      appendTextPart(fragment, translated.slice(cursor));

      return preserved > 0 ? fragment : null;
    }

    function createInlinePreservingFragment(element, translated) {
      const inlineChildren = inlineChildrenFor(element);
      if (!inlineChildren.length) return null;

      const fragment = doc.createDocumentFragment();
      let cursor = 0;
      let preserved = 0;
      for (const child of inlineChildren) {
        const childText = Text.normalizeWhitespace(child.textContent);
        const index = translated.indexOf(childText, cursor);
        if (index === -1) continue;

        appendTextPart(fragment, translated.slice(cursor, index));
        const clone = child.cloneNode(false);
        clone.textContent = translated.slice(index, index + childText.length);
        fragment.append(clone);
        cursor = index + childText.length;
        preserved += 1;
      }

      if (preserved === 0) return null;
      appendTextPart(fragment, translated.slice(cursor));
      return fragment;
    }

    function applyTranslatedElement(element, translated, inlinePlaceholders) {
      const fragment =
        createInlineTokenFragment(translated, inlinePlaceholders) ||
        createInlinePreservingFragment(element, translated);
      if (fragment) {
        element.replaceChildren(fragment);
        return;
      }
      element.textContent = translated;
    }

    function applyCandidateTranslation(candidate, translated, inlinePlaceholders, translationSource = "provider") {
      if (!candidate || !candidate.target || !candidate.target.isConnected) return false;
      if (Text.normalizeWhitespace(candidate.target.textContent) !== candidate.normalized) return false;
      if (!translated || translated === candidate.normalized) return false;

      const record = {
        kind: candidate.kind,
        target: candidate.target,
        node: candidate.node || null,
        original: candidate.original,
        originalText: candidate.originalText || candidate.original,
        normalized: candidate.normalized,
        translated,
        inlinePlaceholders: inlinePlaceholders || null,
        translationSource,
        hash: Text.stableHash(candidate.normalized)
      };
      nodeRecords.set(candidate.target, record);
      replacements.push(record);
      suppressMutationReactions();
      if (candidate.kind === "element") {
        applyTranslatedElement(candidate.target, translated, inlinePlaceholders);
      } else {
        Text.applyTranslatedText(candidate.target, translated);
      }
      return true;
    }

    function recordMatchesClickedElement(record, element) {
      if (!record || !element) return false;
      const target = recordTarget(record);
      if (!target || !target.isConnected) return false;
      if (target.nodeType === view.Node.TEXT_NODE) {
        return element.contains(target);
      }
      return target === element || target.contains(element);
    }

    function recordForClickedElement(element) {
      const panel = getPanelElement();
      if (!element || (panel && panel.contains(element))) return null;
      return currentRecords().find((record) => recordMatchesClickedElement(record, element)) || null;
    }

    function applyCorrectionToRecord(record, translated) {
      const target = recordTarget(record);
      if (!target || !target.isConnected) return false;
      record.translated = translated;
      record.translationSource = "correction";
      suppressMutationReactions();
      if (record.kind === "element") {
        applyTranslatedElement(target, translated, record.inlinePlaceholders);
      } else {
        target.textContent = translated;
      }
      return true;
    }

    return Object.freeze({
      currentRecords,
      recordTarget,
      recordForTarget,
      forgetRecord,
      isCurrentRecordStillOwned,
      restoreRecordOriginal,
      restoreAllRecords,
      collectCandidates,
      directGlossaryTranslation,
      prepareInlinePlaceholders,
      applyCandidateTranslation,
      recordForClickedElement,
      applyCorrectionToRecord
    });
  }

  return Object.freeze({
    create,
    INLINE_MERGE_SELECTOR,
    SAFE_INLINE_TAGS,
    UNSAFE_INLINE_MERGE_SELECTOR
  });
});
