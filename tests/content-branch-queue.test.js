const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const contentScript = fs.readFileSync(path.join(rootDir, "content.js"), "utf8");

class ElementMock {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.dataset = {};
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = value;
      },
      removeProperty: (name) => {
        delete this.style[name];
      }
    };
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.values.delete(name)),
      contains: (name) => this.classList.values.has(name)
    };
    this.hidden = false;
    if (this.tagName === "TEXTAREA" || this.tagName === "INPUT") this.value = "";
    this._textContent = "";
    this.clickCount = 0;
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._textContent = String(value || "");
    this.children = [];
  }

  get childNodes() {
    const nodes = [];
    if (this._textContent) nodes.push({ textContent: this._textContent });
    return nodes.concat(this.children);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  insertBefore(child, beforeNode) {
    child.parentElement = this;
    const index = this.children.indexOf(beforeNode);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === "class") {
      this.classList.values = new Set(text.split(/\s+/).filter(Boolean));
    }
    if (name === "hidden") this.hidden = true;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[key] = text;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "hidden") this.hidden = false;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }

  click() {
    this.clickCount += 1;
    this.dispatchEvent({ type: "click", target: this });
  }

  focus() {}
  select() {}
  scrollIntoView() {}

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  matches(selector) {
    return selector.split(",").some((part) => matchesSimpleSelector(this, part.trim()));
  }

  compareDocumentPosition(other) {
    const root = getRoot(this);
    const ordered = [];
    const visit = (node) => {
      ordered.push(node);
      node.children.forEach(visit);
    };
    visit(root);
    return ordered.indexOf(this) < ordered.indexOf(other) ? 4 : 2;
  }
}

function getRoot(node) {
  let current = node;
  while (current.parentElement) current = current.parentElement;
  return current;
}

function matchesSimpleSelector(el, selector) {
  if (!selector) return false;
  if (selector === "*") return true;
  if (selector.includes(" ")) {
    const parts = selector.split(/\s+/);
    return matchesSimpleSelector(el, parts.at(-1)) && Boolean(el.closest(parts.slice(0, -1).join(" ")));
  }
  if (selector.startsWith("#")) return el.id === selector.slice(1);
  if (selector.startsWith(".")) return el.classList.contains(selector.slice(1));
  if (/^[a-z]+$/i.test(selector)) return el.tagName.toLowerCase() === selector.toLowerCase();

  const tagMatch = selector.match(/^([a-z]+)?(\[.+\])$/i);
  if (tagMatch && tagMatch[1] && el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;

  const attrParts = Array.from(selector.matchAll(/\[([^\]=~^*$\s]+)([*^$]?=)?["']?([^"'\]]*)["']?(?:\s+i)?\]/g));
  if (!attrParts.length) return false;
  return attrParts.every(([, name, op, expected]) => {
    const actual = el.getAttribute(name);
    if (actual === null) return false;
    if (!op) return true;
    const a = String(actual).toLowerCase();
    const e = String(expected).toLowerCase();
    if (op === "=") return a === e;
    if (op === "^=") return a.startsWith(e);
    if (op === "*=") return a.includes(e);
    if (op === "$=") return a.endsWith(e);
    return false;
  });
}

function makeTurn(id, role, text) {
  const turn = new ElementMock("article");
  turn.setAttribute("data-testid", `conversation-turn-${id}`);
  turn.setAttribute("data-message-id", id);
  const roleEl = new ElementMock("span");
  roleEl.setAttribute("data-message-author-role", role);
  roleEl.textContent = role;
  const body = new ElementMock("div");
  body.classList.add("markdown");
  body.textContent = text;
  turn.append(roleEl, body);
  return turn;
}

function createKeyEvent(key, target) {
  return {
    type: "keydown",
    key,
    target,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {}
  };
}

async function loadContent(storageData = {}) {
  const intervals = [];
  const documentElement = new ElementMock("html");
  const head = new ElementMock("head");
  const body = new ElementMock("body");
  const main = new ElementMock("main");
  const composer = new ElementMock("div");
  composer.setAttribute("contenteditable", "true");
  composer.setAttribute("role", "textbox");
  composer.textContent = "follow up question";
  const sendButton = new ElementMock("button");
  sendButton.setAttribute("data-testid", "send-button");
  sendButton.setAttribute("aria-label", "Send prompt");
  const busy = new ElementMock("div");
  busy.setAttribute("aria-busy", "true");

  documentElement.append(head, body);
  body.append(main, composer, sendButton);
  main.append(
    makeTurn("u1", "user", "Question 1"),
    makeTurn("a1", "assistant", "Answer 1"),
    makeTurn("u2", "user", "Question 2"),
    busy
  );

  const documentListeners = new Map();
  const document = {
    documentElement,
    head,
    body,
    hidden: false,
    readyState: "complete",
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      for (const handler of documentListeners.get(event.type) || []) handler(event);
    },
    createElement(tagName) {
      return new ElementMock(tagName);
    },
    getElementById(id) {
      return documentElement.querySelector(`#${id}`);
    },
    querySelector(selector) {
      return documentElement.querySelector(selector);
    },
    querySelectorAll(selector) {
      return documentElement.querySelectorAll(selector);
    },
    getElementsByTagName(tagName) {
      return documentElement.querySelectorAll(tagName);
    }
  };

  const windowListeners = new Map();
  const window = {
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    dispatchEvent(event) {
      for (const handler of windowListeners.get(event.type) || []) handler(event);
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    setInterval(callback) {
      intervals.push(callback);
      return intervals.length;
    },
    clearInterval() {},
    CSS: { supports: () => true }
  };

  const sessionValues = new Map();
  const context = {
    URL,
    console,
    location: {
      href: "https://chatgpt.com/c/example",
      origin: "https://chatgpt.com",
      pathname: "/c/example"
    },
    localStorage: {
      setItem() {},
      getItem() {
        return null;
      },
      removeItem() {}
    },
    sessionStorage: {
      setItem(key, value) {
        sessionValues.set(key, String(value));
      },
      getItem(key) {
        return sessionValues.has(key) ? sessionValues.get(key) : null;
      },
      removeItem(key) {
        sessionValues.delete(key);
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    Element: ElementMock,
    HTMLElement: ElementMock,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    requestIdleCallback(callback) {
      callback();
    },
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
    document,
    window,
    chrome: {
      runtime: {
        onMessage: { addListener() {} }
      },
      storage: {
        onChanged: { addListener() {} },
        local: {
          get(_keys, callback) {
            callback(storageData);
          },
          set(value, callback) {
            Object.assign(storageData, value);
            if (callback) callback();
          }
        }
      }
    }
  };
  context.CSS = window.CSS;

  vm.runInNewContext(contentScript, context, { filename: "content.js" });
  await Promise.resolve();

  return { context, document, body, main, composer, sendButton, busy, intervals, sessionValues };
}

(async () => {
  const page = await loadContent({
    branchTrackerEnabled: true,
    nextPromptQueueEnabled: true,
    nextPromptQueueShortcut: "Tab"
  });

  const graph = page.document.getElementById("cgpt-lb-branch-map-v152");
  assert.ok(graph, "branch graph should render");
  assert.match(graph.textContent, /u1/);
  assert.match(graph.textContent, /a1/);

  const event = createKeyEvent("Tab", page.composer);
  page.document.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(page.sendButton.clickCount, 0, "queued prompt waits while a reply is active");

  page.busy.remove();
  page.body.append(Object.assign(new ElementMock("div"), { textContent: "Too many requests. Try again later." }));
  page.intervals.forEach((callback) => callback());
  assert.equal(page.sendButton.clickCount, 0, "queued prompt waits while rate-limit text is visible");

  page.body.children = page.body.children.filter((child) => !/too many requests/i.test(child.textContent));
  page.intervals.forEach((callback) => callback());
  assert.equal(page.sendButton.clickCount, 1, "queued prompt sends after reply and rate-limit block clear");
})();
