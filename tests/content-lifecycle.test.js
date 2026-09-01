const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const ContentLifecycle = require("../src/content/content-lifecycle.js");

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("content lifecycle owns SPA history hooks, route version, and teardown", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  const originalPushState = dom.window.history.pushState;
  const originalReplaceState = dom.window.history.replaceState;
  const routes = [];
  let placements = 0;
  let pageHides = 0;
  const controller = ContentLifecycle.create({
    window: dom.window,
    history: dom.window.history,
    location: dom.window.location,
    onRouteChange: (route) => routes.push(route),
    onResize: () => {
      placements += 1;
    },
    onPageHide: () => {
      pageHides += 1;
    }
  });

  assert.equal(controller.start(), true);
  dom.window.history.pushState({}, "", "/study-room/demo");
  await wait(5);

  assert.equal(controller.routeVersion, 1);
  assert.equal(routes[0].previousUrl, "https://academy.openai.com/pages/courses");
  assert.equal(routes[0].url, "https://academy.openai.com/study-room/demo");
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  assert.equal(placements, 1);

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  assert.equal(pageHides, 1);
  assert.equal(controller.started, false);
  assert.equal(dom.window.history.pushState, originalPushState);
  assert.equal(dom.window.history.replaceState, originalReplaceState);
  dom.window.close();
});

test("content lifecycle ignores a URL-stable history update", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  let changes = 0;
  const controller = ContentLifecycle.create({
    window: dom.window,
    history: dom.window.history,
    location: dom.window.location,
    onRouteChange: () => {
      changes += 1;
    }
  });

  controller.start();
  dom.window.history.replaceState({}, "", "/pages/courses");
  await wait(5);
  assert.equal(changes, 0);
  assert.equal(controller.routeVersion, 0);
  controller.stop();
  dom.window.close();
});

test("content lifecycle stays reachable through a persisted BFCache page transition", () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://academy.openai.com/pages/courses"
  });
  const originalPushState = dom.window.history.pushState;
  const transitions = [];
  const controller = ContentLifecycle.create({
    window: dom.window,
    history: dom.window.history,
    location: dom.window.location,
    onPageHide: (event) => transitions.push(`hide:${event.persisted}`),
    onPageShow: (event) => transitions.push(`show:${event.persisted}`)
  });

  controller.start();
  const pagehide = new dom.window.Event("pagehide");
  Object.defineProperty(pagehide, "persisted", { value: true });
  dom.window.dispatchEvent(pagehide);

  assert.equal(controller.started, true);
  assert.notEqual(dom.window.history.pushState, originalPushState);

  const pageshow = new dom.window.Event("pageshow");
  Object.defineProperty(pageshow, "persisted", { value: true });
  dom.window.dispatchEvent(pageshow);

  assert.deepEqual(transitions, ["hide:true", "show:true"]);
  assert.equal(controller.started, true);
  controller.stop();
  dom.window.close();
});
