const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const popupScript = fs.readFileSync(path.join(rootDir, "popup.js"), "utf8");

function createElement(id) {
  const listeners = {};
  return {
    id,
    type: id === "languageMode" ? "select" : id.endsWith("Enabled") || id === "enabled" || id === "showStatus" || id === "debug" ? "checkbox" : "button",
    value: "",
    checked: false,
    textContent: "",
    className: "",
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    append() {},
    appendChild() {},
    click() {
      if (listeners.click) listeners.click();
    }
  };
}

async function loadPopup(storageData = {}) {
  const elements = new Map();
  const documentListeners = {};
  const createdTabs = [];

  const document = {
    addEventListener(type, handler) {
      documentListeners[type] = handler;
    },
    createElement(tagName) {
      return createElement(tagName);
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    }
  };

  const context = {
    URL,
    console,
    setTimeout,
    clearTimeout,
    document,
    chrome: {
      runtime: {
        lastError: null,
        getURL(filePath) {
          return `chrome-extension://test/${filePath}`;
        }
      },
      storage: {
        local: {
          get(_keys, callback) {
            callback({ ...storageData });
          },
          set(_value, callback) {
            callback();
          }
        }
      },
      tabs: {
        create(tab) {
          createdTabs.push(tab);
        },
        query(_query, callback) {
          callback([]);
        }
      }
    }
  };

  vm.runInNewContext(popupScript, context, { filename: "popup.js" });
  await documentListeners.DOMContentLoaded();

  return { elements, createdTabs };
}

(async () => {
  const koPopup = await loadPopup({ "cgptLongChatLoader.uiLanguage": "ko" });

  koPopup.elements.get("openReadme").click();

  assert.deepEqual(koPopup.createdTabs.map((tab) => tab.url), [
    "https://github.com/ch040602/chatgpt-tool-suite-chrome-extension/blob/main/README.ko.md"
  ]);

  const enPopup = await loadPopup({ "cgptLongChatLoader.uiLanguage": "en" });

  enPopup.elements.get("openReadme").click();

  assert.deepEqual(enPopup.createdTabs.map((tab) => tab.url), [
    "https://github.com/ch040602/chatgpt-tool-suite-chrome-extension/blob/main/README.md"
  ]);
})();
