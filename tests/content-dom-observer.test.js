const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const ContentDomObserver = require("../src/content/content-dom-observer.js");

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("DOM observer owns mutation batching and reports deferred translation signals", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  const signals = [];
  const controller = ContentDomObserver.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    scanDelay: 0,
    frameDispatchDelay: 0,
    mutationElement: (node) => (node.nodeType === dom.window.Node.ELEMENT_NODE ? node : node.parentElement),
    inspectNode: (node) => ({
      sawFrameMutation: node.tagName === "IFRAME",
      sawTranslatableMutation: /lesson/i.test(node.textContent)
    }),
    reconcileMutations: (mutations, queueScan) => {
      let needsDeferredScan = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== dom.window.Node.ELEMENT_NODE) continue;
          queueScan(node);
          needsDeferredScan = true;
        }
      }
      return { needsDeferredScan };
    },
    onSignals: (signal) => signals.push(signal)
  });

  assert.equal(controller.start(), true);
  const lesson = dom.window.document.createElement("p");
  lesson.textContent = "Lesson content";
  dom.window.document.body.append(lesson);
  await wait(15);

  assert.equal(
    signals.some((signal) => signal.needsDeferredScan),
    true
  );
  assert.equal(
    signals.some((signal) => signal.sawTranslatableMutation),
    true
  );
  assert.equal(controller.pendingCount, 0);
  controller.stop();
  assert.equal(controller.started, false);
  dom.window.close();
});

test("DOM observer defers scans while translation writes are suppressed and clears them on stop", async () => {
  const dom = new JSDOM("<!doctype html><body><section>Lesson</section></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  let scans = 0;
  let now = 100;
  const controller = ContentDomObserver.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    now: () => now,
    scanDelay: 0,
    inspectNode: () => {
      scans += 1;
      return { sawTranslatableMutation: true };
    }
  });

  controller.suppress(25);
  controller.queueScan(dom.window.document.querySelector("section"));
  await wait(5);
  assert.equal(scans, 0);
  assert.equal(controller.pendingCount, 1);

  now = 200;
  controller.stop();
  await wait(35);
  assert.equal(scans, 0);
  assert.equal(controller.pendingCount, 0);
  dom.window.close();
});
