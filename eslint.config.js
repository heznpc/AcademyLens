const js = require("@eslint/js");

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", ".chrome-profile/**", "coverage/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        CustomEvent: "readonly",
        Element: "readonly",
        Event: "readonly",
        HTMLSelectElement: "readonly",
        MutationObserver: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Promise: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        chrome: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        global: "readonly",
        globalThis: "readonly",
        history: "readonly",
        importScripts: "readonly",
        indexedDB: "readonly",
        location: "readonly",
        module: "readonly",
        navigator: "readonly",
        process: "readonly",
        require: "readonly",
        self: "readonly",
        setTimeout: "readonly",
        window: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];
