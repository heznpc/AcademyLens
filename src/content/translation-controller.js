(function initAcademyLensTranslationController(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensTranslationController = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function translationControllerFactory() {
  "use strict";

  function create(options = {}) {
    const view = options.window || globalThis;
    const AbortControllerRef = options.AbortController || view.AbortController || globalThis.AbortController;
    const runTranslation =
      typeof options.runTranslation === "function" ? options.runTranslation : async () => undefined;
    const isContextCurrent = typeof options.isContextCurrent === "function" ? options.isContextCurrent : () => true;

    if (!view || typeof view.setTimeout !== "function" || typeof view.clearTimeout !== "function") {
      throw new Error("AcademyLensTranslationController requires a window-like timer host");
    }
    if (typeof AbortControllerRef !== "function") {
      throw new Error("AcademyLensTranslationController requires AbortController");
    }

    let generation = 0;
    let abortController = null;
    const generationWaiters = new Set();
    const queue = {
      timer: 0,
      active: false,
      pending: null,
      resolvers: []
    };

    function resolveGenerationWaiters() {
      const waiters = Array.from(generationWaiters);
      generationWaiters.clear();
      for (const resolve of waiters) resolve(generation);
    }

    function bumpGeneration() {
      if (abortController && !abortController.signal.aborted) abortController.abort();
      abortController = new AbortControllerRef();
      generation += 1;
      resolveGenerationWaiters();
      return generation;
    }

    function currentAbortSignal(expectedGeneration) {
      return expectedGeneration === generation && abortController ? abortController.signal : null;
    }

    function isCurrent(expectedGeneration, targetLanguage, pageUrl) {
      return expectedGeneration === generation && isContextCurrent(targetLanguage, pageUrl);
    }

    function watchGenerationChange(expectedGeneration) {
      if (expectedGeneration !== generation) {
        return { promise: Promise.resolve(generation), cancel() {} };
      }

      let resolveWaiter;
      const promise = new Promise((resolve) => {
        resolveWaiter = resolve;
        generationWaiters.add(resolveWaiter);
      });
      return {
        promise,
        cancel() {
          generationWaiters.delete(resolveWaiter);
        }
      };
    }

    async function raceCurrent(promise, expectedGeneration, targetLanguage, pageUrl) {
      if (!isCurrent(expectedGeneration, targetLanguage, pageUrl)) return undefined;
      const watcher = watchGenerationChange(expectedGeneration);
      try {
        /** @type {{type: "value", value: any} | {type: "error", error: any} | {type: "stale"}} */
        const result = await Promise.race([
          Promise.resolve(promise).then(
            (value) => /** @type {const} */ ({ type: "value", value }),
            (error) => /** @type {const} */ ({ type: "error", error })
          ),
          watcher.promise.then(() => /** @type {const} */ ({ type: "stale" }))
        ]);
        if (result.type === "stale" || !isCurrent(expectedGeneration, targetLanguage, pageUrl)) return undefined;
        if (result.type === "error") throw result.error;
        return result.value;
      } finally {
        watcher.cancel();
      }
    }

    function enqueue(request = {}, delay = 0) {
      return new Promise((resolve) => {
        queue.pending = {
          ...(queue.pending || {}),
          ...(request || {})
        };
        queue.resolvers.push(resolve);
        view.clearTimeout(queue.timer);
        queue.timer = view.setTimeout(runQueue, Math.max(0, delay || 0));
      });
    }

    function cancelQueued() {
      view.clearTimeout(queue.timer);
      queue.timer = 0;
      queue.pending = null;
      const resolvers = queue.resolvers.splice(0);
      for (const resolve of resolvers) resolve(undefined);
    }

    async function runQueue() {
      queue.timer = 0;
      if (queue.active || !queue.pending) return;
      const request = queue.pending;
      const resolvers = queue.resolvers.splice(0);
      queue.pending = null;
      queue.active = true;

      let result;
      try {
        result = await runTranslation(request);
      } finally {
        queue.active = false;
        for (const resolve of resolvers) resolve(result);
        if (queue.pending) queue.timer = view.setTimeout(runQueue, 0);
      }
    }

    function stop() {
      cancelQueued();
      if (abortController && !abortController.signal.aborted) abortController.abort();
      generation += 1;
      resolveGenerationWaiters();
    }

    return {
      get generation() {
        return generation;
      },
      get active() {
        return queue.active;
      },
      bumpGeneration,
      currentAbortSignal,
      isCurrent,
      raceCurrent,
      enqueue,
      cancelQueued,
      stop
    };
  }

  return { create };
});
