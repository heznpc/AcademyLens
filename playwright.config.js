const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]]
});
