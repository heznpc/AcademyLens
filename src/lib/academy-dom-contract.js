(function initAcademyLensDomContract(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  /** @type {any} */ (root).AcademyLensDomContract = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function academyDomContractFactory() {
  "use strict";

  const PUBLIC_COURSES_URL = "https://academy.openai.com/pages/courses";
  const SURFACES = Object.freeze({
    document: Object.freeze(["html", "body"]),
    primary: Object.freeze(["main", "[role='main']"]),
    courseLinks: Object.freeze(["a[href*='/public/courses/']", "a[href*='/courses/']", "a[href*='/learn/']"]),
    navigation: Object.freeze(["nav", "[role='navigation']", "header"]),
    embeddedCourse: Object.freeze(["iframe[src*='gradual']", "iframe[src*='scorm']", "iframe[title*='course' i]"])
  });

  function selectorCount(documentRef, selectors) {
    return selectors.reduce((total, selector) => total + documentRef.querySelectorAll(selector).length, 0);
  }

  function inspect(documentRef, url) {
    const counts = Object.fromEntries(
      Object.entries(SURFACES).map(([name, selectors]) => [name, selectorCount(documentRef, selectors)])
    );
    const bodyTextLength = String(
      documentRef.body ? documentRef.body.innerText || documentRef.body.textContent || "" : ""
    ).trim().length;
    const failures = [];
    if (counts.document < 2) failures.push("document-surface-missing");
    if (counts.primary < 1) failures.push("primary-surface-missing");
    if (bodyTextLength < 100) failures.push("public-page-content-too-small");
    if (counts.courseLinks < 1) failures.push("course-links-missing");
    return {
      ok: failures.length === 0,
      url: String(url || ""),
      title: String(documentRef.title || ""),
      counts,
      bodyTextLength,
      failures,
      signature: Object.entries(counts)
        .map(([name, count]) => `${name}:${count}`)
        .join("|")
    };
  }

  return Object.freeze({ PUBLIC_COURSES_URL, SURFACES, inspect, selectorCount });
});
