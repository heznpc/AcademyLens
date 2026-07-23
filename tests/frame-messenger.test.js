const assert = require("node:assert/strict");
const test = require("node:test");

const FrameMessenger = require("../src/content/frame-messenger.js");

const ORIGIN = "https://academy.openai.com";

function createPostableWindow() {
  const messages = [];
  return {
    messages,
    postMessage(data, targetOrigin) {
      messages.push({ data, targetOrigin });
    }
  };
}

function createFakeWindow() {
  const listeners = new Map();
  const top = createPostableWindow();
  const parent = createPostableWindow();

  return {
    location: {
      href: `${ORIGIN}/courses/one`,
      origin: ORIGIN
    },
    top,
    parent,
    setTimeout(callback, delay) {
      return { callback, delay };
    },
    clearTimeout() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    listeners
  };
}

function createFakeDocument(frames = []) {
  return {
    querySelectorAll(selector) {
      return selector === "iframe" ? frames : [];
    }
  };
}

function createIdFactory() {
  let index = 0;
  return () => {
    index += 1;
    return `id-${index}`;
  };
}

test("pending frame commands are scoped to the current route before redispatch", () => {
  let pageUrl = `${ORIGIN}/courses/one`;
  let routeVersion = 1;
  const view = createFakeWindow();
  const initialChild = createPostableWindow();
  const lateChild = createPostableWindow();
  const document = createFakeDocument([{ contentWindow: initialChild }]);
  const messenger = FrameMessenger.create({
    document,
    window: view,
    location: view.location,
    isTopFrame: true,
    idFactory: createIdFactory(),
    getTargetLanguage: () => "ko",
    getGeneration: () => 7,
    getPageUrl: () => pageUrl,
    getRouteVersion: () => routeVersion
  });

  const dispatch = messenger.postToChildFrames("translate", { targetLanguage: "ko" });

  assert.equal(dispatch.sent, 1);
  assert.equal(dispatch.payload.pageUrl, pageUrl);
  assert.equal(dispatch.payload.routeVersion, 1);
  assert.equal(messenger.dispatchPendingCommand(lateChild), 1);
  assert.equal(lateChild.messages.length, 1);

  pageUrl = `${ORIGIN}/courses/two`;
  routeVersion = 2;

  assert.equal(messenger.dispatchPendingCommand(lateChild), 0);
  assert.equal(lateChild.messages.length, 1);
});

test("frameReady only redispatches pending commands to known child frame sources", async () => {
  const view = createFakeWindow();
  const knownChild = createPostableWindow();
  const unknownChild = createPostableWindow();
  const document = createFakeDocument([{ contentWindow: knownChild }]);
  const messenger = FrameMessenger.create({
    document,
    window: view,
    location: view.location,
    isTopFrame: true,
    idFactory: createIdFactory(),
    getTargetLanguage: () => "ko",
    getPageUrl: () => view.location.href,
    getRouteVersion: () => 1
  });

  messenger.postToChildFrames("restore");
  knownChild.messages.length = 0;

  await messenger.handleMessageEvent({
    origin: ORIGIN,
    source: unknownChild,
    data: { source: FrameMessenger.FRAME_MESSAGE_SOURCE, action: "frameReady" }
  });
  assert.equal(unknownChild.messages.length, 0);

  await messenger.handleMessageEvent({
    origin: ORIGIN,
    source: knownChild,
    data: { source: FrameMessenger.FRAME_MESSAGE_SOURCE, action: "frameReady" }
  });
  assert.equal(knownChild.messages.length, 1);
  assert.equal(knownChild.messages[0].data.action, "restore");
});

test("child frame commands require parent source, token, and unique message ids", async () => {
  const view = createFakeWindow();
  const document = createFakeDocument();
  let targetLanguage = "en";
  const translateCalls = [];
  const messenger = FrameMessenger.create({
    document,
    window: view,
    location: view.location,
    isTopFrame: false,
    frameSessionToken: "child-token",
    getTargetLanguage: () => targetLanguage,
    setTargetLanguage(nextLanguage) {
      targetLanguage = nextLanguage;
    },
    translatePage(options) {
      translateCalls.push(options);
      return { applied: 3, failed: 0 };
    }
  });

  await messenger.handleMessageEvent({
    origin: ORIGIN,
    source: createPostableWindow(),
    data: {
      source: FrameMessenger.FRAME_MESSAGE_SOURCE,
      action: "translate",
      messageId: "m-1",
      frameToken: "parent-token",
      targetLanguage: "ko"
    }
  });
  assert.equal(translateCalls.length, 0);

  await messenger.handleMessageEvent({
    origin: ORIGIN,
    source: view.parent,
    data: {
      source: FrameMessenger.FRAME_MESSAGE_SOURCE,
      action: "translate",
      messageId: "m-1",
      frameToken: "parent-token",
      targetLanguage: "ko",
      generation: 4
    }
  });

  assert.equal(targetLanguage, "ko");
  assert.deepEqual(translateCalls, [{ broadcastFrames: false }]);
  assert.equal(view.top.messages.length, 1);
  assert.equal(view.top.messages[0].data.action, "frameResult");
  assert.equal(view.top.messages[0].data.messageId, "m-1");
  assert.equal(view.top.messages[0].data.frameToken, "parent-token");

  await messenger.handleMessageEvent({
    origin: ORIGIN,
    source: view.parent,
    data: {
      source: FrameMessenger.FRAME_MESSAGE_SOURCE,
      action: "translate",
      messageId: "m-1",
      frameToken: "parent-token",
      targetLanguage: "ko"
    }
  });
  assert.equal(translateCalls.length, 1);
});

test("frame aggregate diagnostics ignore duplicate results from the same source", async () => {
  const view = createFakeWindow();
  const frameSource = createPostableWindow();
  const document = createFakeDocument([{ contentWindow: frameSource }]);
  const statusEvents = [];
  const diagnostics = [];
  const messenger = FrameMessenger.create({
    document,
    window: view,
    location: view.location,
    isTopFrame: true,
    frameSessionToken: "top-token",
    setStatusMessage(key, params, tone) {
      statusEvents.push({ key, params, tone });
    },
    onFrameTranslationResult(result) {
      diagnostics.push(result);
    }
  });

  messenger.startAggregate({ messageId: "m-1" }, 1, "translate");
  messenger.updateAggregatePage("m-1", { applied: 1, failed: 0 });

  const event = {
    origin: ORIGIN,
    source: frameSource,
    data: {
      source: FrameMessenger.FRAME_MESSAGE_SOURCE,
      action: "frameResult",
      messageId: "m-1",
      frameToken: "top-token",
      kind: "translate",
      applied: 2,
      failed: 1
    }
  };

  await messenger.handleMessageEvent(event);
  await messenger.handleMessageEvent(event);

  assert.deepEqual(diagnostics, [{ applied: 2, failed: 1 }]);
  assert.equal(statusEvents.length, 1);
  assert.deepEqual(statusEvents[0], {
    key: "status.translatedWithFrames",
    params: { count: 1, frameCount: 2 },
    tone: "error"
  });
});
