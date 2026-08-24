const assert = require("node:assert/strict");
const test = require("node:test");

const Client = require("../src/content/content-background-client.js");

function createHarness() {
  const messages = [];
  let responseCallback;
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        messages.push(message);
        if (message.type === "CANCEL") callback({ cancelled: true });
        else responseCallback = callback;
      }
    }
  };
  const constants = {
    MESSAGE_TYPES: { CANCEL_TRANSLATION: "CANCEL" },
    getMessage: () => "timed out"
  };
  const client = Client.create({
    chrome,
    window: globalThis,
    constants,
    createAbortError() {
      const error = new Error("aborted");
      error.name = "AbortError";
      return error;
    }
  });
  return { client, messages, respond: (value) => responseCallback(value) };
}

test("content background client resolves runtime responses", async () => {
  const harness = createHarness();
  const pending = harness.client.send({ type: "TRANSLATE" }, 1000);
  harness.respond({ ok: true });
  assert.deepEqual(await pending, { ok: true });
});

test("content background client propagates abort and cancels the matching operation", async () => {
  const harness = createHarness();
  const controller = new AbortController();
  const pending = harness.client.send({ type: "TRANSLATE", operationId: "frame:2" }, 1000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(harness.messages[1], { type: "CANCEL", operationId: "frame:2" });
});
