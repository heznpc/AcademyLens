(function initAcademyLensContentLifecycle(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensContentLifecycle = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function contentLifecycleFactory() {
  "use strict";

  function create(options = {}) {
    const view = options.window || globalThis;
    const historyRef = options.history || view.history;
    const locationRef = options.location || view.location;
    const onRouteChange = typeof options.onRouteChange === "function" ? options.onRouteChange : () => {};
    const onResize = typeof options.onResize === "function" ? options.onResize : () => {};
    const onScroll = typeof options.onScroll === "function" ? options.onScroll : () => {};
    const onPageHide = typeof options.onPageHide === "function" ? options.onPageHide : () => {};

    if (!view || !historyRef || !locationRef) {
      throw new Error("AcademyLensContentLifecycle requires window, history, and location");
    }

    let lastUrl = locationRef.href || "";
    let routeVersion = 0;
    let started = false;
    let ownsHistoryWrappers = false;
    let originalPushState = null;
    let originalReplaceState = null;

    function checkRouteChange() {
      const nextUrl = locationRef.href || "";
      if (nextUrl === lastUrl) return false;
      const previousUrl = lastUrl;
      lastUrl = nextUrl;
      routeVersion += 1;
      onRouteChange({ previousUrl, url: nextUrl, routeVersion });
      return true;
    }

    function handlePageHide() {
      onPageHide();
      stop();
    }

    function start() {
      if (started) return true;
      if (historyRef.pushState.__academylensWrapped || historyRef.replaceState.__academylensWrapped) return false;

      originalPushState = historyRef.pushState;
      originalReplaceState = historyRef.replaceState;
      historyRef.pushState = function pushStateWithAcademyLens() {
        const result = originalPushState.apply(this, arguments);
        view.setTimeout(checkRouteChange, 0);
        return result;
      };
      historyRef.replaceState = function replaceStateWithAcademyLens() {
        const result = originalReplaceState.apply(this, arguments);
        view.setTimeout(checkRouteChange, 0);
        return result;
      };
      historyRef.pushState.__academylensWrapped = true;
      historyRef.replaceState.__academylensWrapped = true;
      ownsHistoryWrappers = true;

      view.addEventListener("popstate", checkRouteChange);
      view.addEventListener("hashchange", checkRouteChange);
      view.addEventListener("resize", onResize);
      view.addEventListener("scroll", onScroll, { passive: true });
      view.addEventListener("pagehide", handlePageHide);
      started = true;
      return true;
    }

    function stop() {
      if (!started) return;
      view.removeEventListener("popstate", checkRouteChange);
      view.removeEventListener("hashchange", checkRouteChange);
      view.removeEventListener("resize", onResize);
      view.removeEventListener("scroll", onScroll);
      view.removeEventListener("pagehide", handlePageHide);
      if (ownsHistoryWrappers && historyRef.pushState.__academylensWrapped) {
        historyRef.pushState = originalPushState;
      }
      if (ownsHistoryWrappers && historyRef.replaceState.__academylensWrapped) {
        historyRef.replaceState = originalReplaceState;
      }
      ownsHistoryWrappers = false;
      started = false;
    }

    return {
      get lastUrl() {
        return lastUrl;
      },
      get routeVersion() {
        return routeVersion;
      },
      get started() {
        return started;
      },
      checkRouteChange,
      start,
      stop
    };
  }

  return { create };
});
