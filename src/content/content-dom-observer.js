(function initAcademyLensContentDomObserver(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensContentDomObserver = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function contentDomObserverFactory() {
  "use strict";

  function create(options = {}) {
    const doc = options.document;
    const view = options.window || (doc && doc.defaultView) || globalThis;
    const MutationObserverRef = options.MutationObserver || view.MutationObserver;
    const mutationElement =
      typeof options.mutationElement === "function" ? options.mutationElement : (node) => node?.parentElement || node;
    const shouldIgnore = typeof options.shouldIgnore === "function" ? options.shouldIgnore : () => false;
    const inspectNode = typeof options.inspectNode === "function" ? options.inspectNode : () => ({});
    const reconcileMutations =
      typeof options.reconcileMutations === "function" ? options.reconcileMutations : () => ({});
    const checkRouteChange = typeof options.checkRouteChange === "function" ? options.checkRouteChange : () => false;
    const dispatchPendingFrameCommand =
      typeof options.dispatchPendingFrameCommand === "function" ? options.dispatchPendingFrameCommand : () => {};
    const onSignals = typeof options.onSignals === "function" ? options.onSignals : () => {};
    const now = typeof options.now === "function" ? options.now : Date.now;
    const scanDelay = Number.isFinite(options.scanDelay) ? options.scanDelay : 140;
    const frameDispatchDelay = Number.isFinite(options.frameDispatchDelay) ? options.frameDispatchDelay : 80;
    const maxPendingNodes = Number.isFinite(options.maxPendingNodes) ? options.maxPendingNodes : 80;

    if (!doc || !view || typeof MutationObserverRef !== "function") {
      throw new Error("AcademyLensContentDomObserver requires document, window, and MutationObserver");
    }

    let observer = null;
    let mutationScanTimer = 0;
    let suppressMutationUntil = 0;
    const pendingMutationScanNodes = new Set();

    function suppress(durationMs = 250) {
      suppressMutationUntil = Math.max(suppressMutationUntil, now() + durationMs);
    }

    function queueScan(node) {
      const element = mutationElement(node);
      if (!element || shouldIgnore(element)) return;
      if (pendingMutationScanNodes.size < maxPendingNodes) pendingMutationScanNodes.add(element);
      view.clearTimeout(mutationScanTimer);
      mutationScanTimer = view.setTimeout(runScan, Math.max(0, scanDelay));
    }

    function dispatchFramesSoon() {
      view.setTimeout(() => dispatchPendingFrameCommand(), Math.max(0, frameDispatchDelay));
    }

    function runScan() {
      mutationScanTimer = 0;
      const remainingSuppression = suppressMutationUntil - now();
      if (remainingSuppression > 0) {
        mutationScanTimer = view.setTimeout(runScan, remainingSuppression + 20);
        return;
      }

      const nodes = Array.from(pendingMutationScanNodes);
      pendingMutationScanNodes.clear();
      let sawFrameMutation = false;
      let sawTranslatableMutation = false;
      for (const node of nodes) {
        if (!node || !node.isConnected || shouldIgnore(node)) continue;
        const signal = inspectNode(node) || {};
        sawFrameMutation ||= Boolean(signal.sawFrameMutation);
        sawTranslatableMutation ||= Boolean(signal.sawTranslatableMutation);
        if (sawFrameMutation && sawTranslatableMutation) break;
      }

      if (sawFrameMutation) dispatchFramesSoon();
      if (sawFrameMutation || sawTranslatableMutation) {
        onSignals({ sawFrameMutation, sawTranslatableMutation, needsDeferredScan: false }, false);
      }
    }

    function handleMutations(mutations) {
      const routeChanged = checkRouteChange();
      if (now() < suppressMutationUntil) return;
      const signal = reconcileMutations(mutations, queueScan) || {};
      if (signal.sawFrameMutation) dispatchFramesSoon();
      onSignals(signal, routeChanged);
    }

    function start() {
      if (observer || !doc.body) return false;
      observer = new MutationObserverRef(handleMutations);
      observer.observe(doc.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
      return true;
    }

    function stop() {
      observer?.disconnect();
      observer = null;
      view.clearTimeout(mutationScanTimer);
      mutationScanTimer = 0;
      pendingMutationScanNodes.clear();
    }

    return {
      get pendingCount() {
        return pendingMutationScanNodes.size;
      },
      get started() {
        return Boolean(observer);
      },
      suppress,
      queueScan,
      start,
      stop
    };
  }

  return { create };
});
