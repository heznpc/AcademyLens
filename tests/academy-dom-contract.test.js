const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const Contract = require("../src/lib/academy-dom-contract.js");

test("Academy DOM contract accepts a public course listing surface", () => {
  const dom = new JSDOM(`<!doctype html><html><body><header>Academy navigation</header><main>
    <h1>Courses for everyone who wants to learn practical artificial intelligence skills</h1>
    <a href="/public/courses/example">Open the complete course and start learning with the community</a>
  </main></body></html>`);
  const report = Contract.inspect(dom.window.document, Contract.PUBLIC_COURSES_URL);
  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
});

test("Academy DOM contract reports missing structural surfaces", () => {
  const dom = new JSDOM("<!doctype html><html><body>Unavailable</body></html>");
  const report = Contract.inspect(dom.window.document, Contract.PUBLIC_COURSES_URL);
  assert.equal(report.ok, false);
  assert(report.failures.includes("primary-surface-missing"));
  assert(report.failures.includes("course-links-missing"));
});
