const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const ContentDomObserver = require("../src/content/content-dom-observer.js");

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await wait(5);
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
  await waitFor(
    () => signals.some((signal) => signal.needsDeferredScan) && signals.some((signal) => signal.sawTranslatableMutation)
  );

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

test("DOM observer replays real page mutations received during translation-write suppression", async () => {
  const dom = new JSDOM("<!doctype html><body><main id='surface'></main></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  let now = 100;
  const signals = [];
  const controller = ContentDomObserver.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    now: () => now,
    scanDelay: 0,
    mutationElement: (node) => (node.nodeType === dom.window.Node.ELEMENT_NODE ? node : node.parentElement),
    inspectNode: (node) => ({ sawTranslatableMutation: /Site lesson update/.test(node.textContent) }),
    reconcileMutations: (mutations, queueScan) => {
      let needsDeferredScan = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== dom.window.Node.ELEMENT_NODE) continue;
          queueScan(node);
          needsDeferredScan = true;
        }
      }
      return { needsDeferredScan };
    },
    onSignals: (signal) => signals.push(signal)
  });

  controller.start();
  controller.suppress(25);
  const lesson = dom.window.document.createElement("p");
  lesson.textContent = "Site lesson update";
  dom.window.document.querySelector("#surface").append(lesson);
  await wait(5);

  assert.equal(signals.length, 0);
  now = 200;
  await waitFor(() => signals.some((signal) => signal.sawTranslatableMutation));

  assert.equal(
    signals.some((signal) => signal.needsDeferredScan),
    true
  );
  assert.equal(
    signals.some((signal) => signal.sawTranslatableMutation),
    true
  );
  controller.stop();
  dom.window.close();
});

test("DOM observer drops marked internal writes instead of replaying them after suppression", async () => {
  const dom = new JSDOM("<!doctype html><body><p id='translated'>Translated lesson</p></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  let now = 100;
  const signals = [];
  const controller = ContentDomObserver.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    now: () => now,
    shouldIgnoreSuppressedMutation: (mutation) => mutation.target.parentElement?.id === "translated",
    reconcileMutations: () => ({ sawTranslatableMutation: true }),
    onSignals: (signal) => signals.push(signal)
  });

  controller.start();
  controller.suppress(25);
  dom.window.document.querySelector("#translated").firstChild.textContent = "Original lesson";
  await wait(5);
  now = 200;
  await wait(50);

  assert.deepEqual(signals, []);
  controller.stop();
  dom.window.close();
});

test("DOM observer rescans the document when a mutation burst exceeds the pending-node cap", async () => {
  const dom = new JSDOM("<!doctype html><body><main id='surface'></main></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  const inspected = [];
  const signals = [];
  const controller = ContentDomObserver.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    scanDelay: 0,
    maxPendingNodes: 2,
    inspectNode: (node) => {
      inspected.push(node.tagName);
      return { sawTranslatableMutation: /Overflow lesson/.test(node.textContent) };
    },
    onSignals: (signal) => signals.push(signal)
  });
  const surface = dom.window.document.querySelector("#surface");
  for (let index = 0; index < 3; index += 1) {
    const control = dom.window.document.createElement("button");
    control.textContent = `Control ${index}`;
    surface.append(control);
    controller.queueScan(control);
  }
  const lesson = dom.window.document.createElement("p");
  lesson.textContent = "Overflow lesson";
  surface.append(lesson);
  controller.queueScan(lesson);

  await wait(15);

  assert.deepEqual(inspected, ["BODY"]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].overflowed, true);
  assert.equal(signals[0].sawTranslatableMutation, true);
  controller.stop();
  dom.window.close();
});
