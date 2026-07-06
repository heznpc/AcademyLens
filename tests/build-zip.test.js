const assert = require("node:assert/strict");
const test = require("node:test");
const { checksumLine, dosDateTime, sha256Hex, zipTimestampDate } = require("../scripts/build-zip.js");

test("zip timestamp defaults to a deterministic value", () => {
  const previous = process.env.SOURCE_DATE_EPOCH;
  delete process.env.SOURCE_DATE_EPOCH;

  try {
    assert.equal(zipTimestampDate().toISOString(), "2026-01-01T00:00:00.000Z");
    assert.deepEqual(dosDateTime(zipTimestampDate()), {
      day: ((2026 - 1980) << 9) | (1 << 5) | 1,
      time: 0
    });
  } finally {
    if (previous === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = previous;
  }
});

test("zip timestamp respects SOURCE_DATE_EPOCH", () => {
  const previous = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = "1704067200";

  try {
    assert.equal(zipTimestampDate().toISOString(), "2024-01-01T00:00:00.000Z");
  } finally {
    if (previous === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = previous;
  }
});

test("zip checksum sidecar uses sha256 and zip basename", () => {
  const digest = sha256Hex(Buffer.from("academy-lens"));

  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(checksumLine("dist/academy-lens.zip", digest), `${digest}  academy-lens.zip\n`);
});
