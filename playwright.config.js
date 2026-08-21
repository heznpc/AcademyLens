const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 20_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
