(function initAcademyLensFrameMessenger(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.AcademyLensFrameMessenger = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function frameMessengerFactory() {
  "use strict";

  const FRAME_MESSAGE_SOURCE = "AcademyLens";

  function defaultMessageId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function create(options = {}) {
    const doc = options.document;
    const view = options.window || (doc && doc.defaultView) || globalThis;
    const locationRef = options.location || (view && view.location) || {};
    const isTopFrame = Boolean(options.isTopFrame);
    const idFactory = typeof options.idFactory === "function" ? options.idFactory : defaultMessageId;
    const getTargetLanguage = typeof options.getTargetLanguage === "function" ? options.getTargetLanguage : () => "en";
    const setTargetLanguage = typeof options.setTargetLanguage === "function" ? options.setTargetLanguage : () => {};
    const getGeneration = typeof options.getGeneration === "function" ? options.getGeneration : () => 0;
    const getRouteVersion = typeof options.getRouteVersion === "function" ? options.getRouteVersion : () => 0;
    const getPageUrl = typeof options.getPageUrl === "function" ? options.getPageUrl : () => locationRef.href || "";
    const translatePage =
      typeof options.translatePage === "function" ? options.translatePage : async () => ({ applied: 0, failed: 0 });
    const restorePage = typeof options.restorePage === "function" ? options.restorePage : () => ({ restored: 0 });
    const setStatusMessage = typeof options.setStatusMessage === "function" ? options.setStatusMessage : () => {};
    const onFrameTranslationResult =
      typeof options.onFrameTranslationResult === "function" ? options.onFrameTranslationResult : () => {};

    if (!doc || !view) {
      throw new Error("AcademyLensFrameMessenger requires document and window");
    }

    let latestFrameCommand = null;
    const frameAggregates = new Map();
    let handledFrameMessages = new Set();
    const frameSessionToken = options.frameSessionToken || idFactory();
    let parentFrameToken = "";
    let messageListener = null;

    function currentOrigin() {
      return locationRef.origin || (view.location && view.location.origin) || "*";
    }

    function framePayload(action, extra = {}) {
      return {
        source: FRAME_MESSAGE_SOURCE,
        action,
        messageId: extra.messageId || idFactory(),
        frameToken: extra.frameToken || parentFrameToken || frameSessionToken,
        targetLanguage: extra.targetLanguage || getTargetLanguage(),
        generation: extra.generation ?? getGeneration(),
        pageUrl: extra.pageUrl || getPageUrl(),
        routeVersion: extra.routeVersion ?? getRouteVersion()
      };
    }

    function rememberCommand(payload) {
      if (!payload || !["translate", "restore"].includes(payload.action)) return;
      latestFrameCommand = payload;
    }

    function isPendingCommandCurrent(payload) {
      if (!payload) return false;
      if (!isTopFrame) return true;
      return payload.pageUrl === getPageUrl() && payload.routeVersion === getRouteVersion();
    }

    function postPayloadToWindow(targetWindow, payload) {
      if (!targetWindow || !payload) return false;
      try {
        targetWindow.postMessage(payload, currentOrigin());
        return true;
      } catch {
        return false;
      }
    }

    function postPayloadToFrame(frame, payload) {
      if (!frame || !frame.contentWindow || !payload) return false;
      return postPayloadToWindow(frame.contentWindow, payload);
    }

    function postToChildFrames(action, extra = {}) {
      let sent = 0;
      const payload = framePayload(action, extra);
      if (extra.remember !== false) rememberCommand(payload);

      for (const frame of doc.querySelectorAll("iframe")) {
        if (postPayloadToFrame(frame, payload)) {
          sent += 1;
        }
      }

      return { payload, sent };
    }

    function dispatchPendingCommand(targetWindow) {
      if (!latestFrameCommand) return 0;
      if (!isPendingCommandCurrent(latestFrameCommand)) return 0;
      if (targetWindow) {
        return postPayloadToWindow(targetWindow, latestFrameCommand) ? 1 : 0;
      }

      let sent = 0;
      for (const frame of doc.querySelectorAll("iframe")) {
        if (postPayloadToFrame(frame, latestFrameCommand)) sent += 1;
      }
      return sent;
    }

    function clearAggregates() {
      for (const aggregate of frameAggregates.values()) {
        if (aggregate.cleanupTimer) view.clearTimeout(aggregate.cleanupTimer);
      }
      frameAggregates.clear();
    }

    function postFrameResult(kind, result = {}) {
      if (isTopFrame || !view.top) return;
      view.top.postMessage(
        {
          source: FRAME_MESSAGE_SOURCE,
          action: "frameResult",
          messageId: latestFrameCommand ? latestFrameCommand.messageId : "",
          frameToken: latestFrameCommand ? latestFrameCommand.frameToken : "",
          kind,
          applied: result.applied || 0,
          failed: result.failed || 0
        },
        currentOrigin()
      );
    }

    function startAggregate(payload, expected, kind) {
      if (!isTopFrame || !payload || !payload.messageId || expected <= 0) return;
      frameAggregates.set(payload.messageId, {
        kind,
        expected,
        received: 0,
        pageApplied: 0,
        pageFailed: 0,
        frameApplied: 0,
        frameFailed: 0,
        resultSources: new WeakSet(),
        cleanupTimer: view.setTimeout(() => frameAggregates.delete(payload.messageId), 5000)
      });
    }

    function updateAggregatePage(messageId, result = {}) {
      const aggregate = messageId ? frameAggregates.get(messageId) : null;
      if (!aggregate) return;
      aggregate.pageApplied = result.applied || 0;
      aggregate.pageFailed = result.failed || 0;
    }

    function setAggregateStatus(messageIdOrAggregate) {
      const aggregate =
        typeof messageIdOrAggregate === "string" ? frameAggregates.get(messageIdOrAggregate) : messageIdOrAggregate;
      if (!aggregate || aggregate.kind !== "translate") return;
      const applied = aggregate.pageApplied || 0;
      const frameCount = aggregate.frameApplied || 0;
      const failed = (aggregate.pageFailed || 0) + (aggregate.frameFailed || 0);
      if (failed > 0 && applied === 0 && frameCount === 0) {
        setStatusMessage("status.frameFailed", { failed }, "error");
        return;
      }
      if (applied > 0 || frameCount > 0) {
        setStatusMessage("status.translatedWithFrames", { count: applied, frameCount }, failed > 0 ? "error" : "ok");
      }
    }

    function markAggregateSource(aggregate, source) {
      if (!aggregate || !source || typeof source !== "object") return false;
      if (aggregate.resultSources.has(source)) return true;
      aggregate.resultSources.add(source);
      return false;
    }

    function handleFrameResult(event, data) {
      if (!isTopFrame || !data || data.action !== "frameResult") return;
      if (data.frameToken !== frameSessionToken) return;
      const aggregate = data.messageId ? frameAggregates.get(data.messageId) : null;
      if (aggregate) {
        if (markAggregateSource(aggregate, event && event.source)) return;
        aggregate.received += 1;
        if (data.kind === "translate") {
          aggregate.frameApplied += data.applied || 0;
          aggregate.frameFailed += data.failed || 0;
          onFrameTranslationResult({ applied: data.applied || 0, failed: data.failed || 0 });
          setAggregateStatus(aggregate);
        }
        return;
      }
      if (data.kind === "translate" && data.applied > 0) {
        setStatusMessage("status.frameTranslated", { count: data.applied }, data.failed > 0 ? "error" : "ok");
      }
      if (data.kind === "translate" && data.applied === 0 && data.failed > 0) {
        setStatusMessage("status.frameFailed", { failed: data.failed }, "error");
      }
      if (data.kind === "restore") {
        setStatusMessage("status.frameRestored", {}, "ok");
      }
    }

    function rememberHandledMessage(messageId) {
      if (!messageId) return false;
      if (handledFrameMessages.has(messageId)) return true;
      handledFrameMessages.add(messageId);
      if (handledFrameMessages.size > 80) {
        handledFrameMessages = new Set([...handledFrameMessages].slice(-40));
      }
      return false;
    }

    function isKnownChildFrameSource(source) {
      if (!source) return false;
      for (const frame of doc.querySelectorAll("iframe")) {
        if (frame.contentWindow === source) return true;
      }
      return false;
    }

    function isTrustedParentCommand(event, data) {
      if (isTopFrame || !event || event.source !== view.parent) return false;
      if (!data || !["translate", "restore"].includes(data.action)) return false;
      if (!data.frameToken) return false;
      if (parentFrameToken && data.frameToken !== parentFrameToken) return false;
      parentFrameToken = data.frameToken;
      return true;
    }

    async function handleFrameCommand(event, data) {
      if (isTopFrame || !data || data.source !== FRAME_MESSAGE_SOURCE) return;
      if (!isTrustedParentCommand(event, data)) return;
      if (rememberHandledMessage(data.messageId)) return;
      if (data.targetLanguage) {
        setTargetLanguage(data.targetLanguage);
      }
      rememberCommand(framePayload(data.action, data));

      if (data.action === "translate") {
        postToChildFrames("translate", {
          messageId: data.messageId,
          frameToken: data.frameToken,
          targetLanguage: getTargetLanguage(),
          generation: data.generation,
          remember: true
        });
        const result = await translatePage({ broadcastFrames: false });
        postFrameResult("translate", result);
      }

      if (data.action === "restore") {
        postToChildFrames("restore", {
          messageId: data.messageId,
          frameToken: data.frameToken,
          targetLanguage: getTargetLanguage(),
          generation: data.generation,
          remember: true
        });
        const result = restorePage({ broadcastFrames: false });
        postFrameResult("restore", result);
      }
    }

    async function handleMessageEvent(event) {
      if (!event || event.origin !== currentOrigin()) return;
      const data = event.data || {};
      if (data.source !== FRAME_MESSAGE_SOURCE) return;
      if (data.action === "frameReady") {
        if (!isKnownChildFrameSource(event.source)) return;
        dispatchPendingCommand(event.source);
        return;
      }
      handleFrameResult(event, data);
      await handleFrameCommand(event, data);
    }

    function watchMessages() {
      if (messageListener) return;
      messageListener = (event) => {
        void handleMessageEvent(event);
      };
      view.addEventListener("message", messageListener);
    }

    function postReady() {
      if (isTopFrame || !view.parent) return false;
      return postPayloadToWindow(view.parent, {
        source: FRAME_MESSAGE_SOURCE,
        action: "frameReady"
      });
    }

    function dispose() {
      if (messageListener) {
        view.removeEventListener("message", messageListener);
        messageListener = null;
      }
      clearAggregates();
    }

    return Object.freeze({
      framePayload,
      postToChildFrames,
      dispatchPendingCommand,
      clearAggregates,
      startAggregate,
      updateAggregatePage,
      setAggregateStatus,
      handleMessageEvent,
      watchMessages,
      postReady,
      dispose,
      getFrameSessionToken: () => frameSessionToken
    });
  }

  return Object.freeze({
    create,
    FRAME_MESSAGE_SOURCE
  });
});
