# ChatGPT Long Chat Loader v0.3.0

[English](README.md) | [한국어](README.ko.md)

Chrome MV3 extension for reducing ChatGPT long-conversation loading, rendering, and RAM pressure.

## Problem cause

Long ChatGPT conversations can become slow because the browser receives a large conversation graph, parses it into JavaScript objects, lets the ChatGPT React app build state for old messages, and then keeps many Markdown/code/tool DOM nodes alive. Hiding old DOM after the fact helps scrolling, but the larger improvement comes from shrinking the conversation response before React ingests it.

## What this extension does

1. Patches `window.fetch` in the page MAIN world at `document_start`.
2. Intercepts `GET /backend-api/conversation/<id>` and `GET /backend-api/f/conversation/<id>` JSON responses.
3. Keeps only the current conversation chain tail before ChatGPT React consumes it.
4. Drops old visible user/assistant nodes and old tool nodes before the cutoff while preserving root/system/developer scaffolding.
5. Keeps old DOM turns hidden behind a `Load more` control when the full DOM is already present.
6. Applies `content-visibility:auto` to visible turns where supported.
7. Calculates estimated speedup only when the extension popup is opened.

## v0.3.0 changes after live page check

The public `https://chatgpt.com/` and `/c/<uuid>` shells load with a login/new-chat shell even without an authenticated conversation. Based on that check, v0.3.0 reduces work on non-chat routes and improves compatibility:

- Route-aware observer: active on `/`, `/c/...`, `/share/...`, and `/g/...`; disabled on non-chat pages such as app/gallery pages.
- MAIN-world `history.pushState`/`replaceState` patch dispatches route-change events, reducing reliance on frequent polling.
- Polling fallback relaxed to 3 seconds.
- Primary DOM selector widened to `[data-testid^="conversation-turn-"]` instead of assuming only `section`.
- Conversation endpoint matcher now also supports `/backend-api/f/conversation/<id>`.
- Non-JSON response types are not read or parsed.
- Old tool messages before the retained tail are no longer counted as renderable messages and are dropped unless they are inside the retained tail.
- Status badge is off by default.

## Default settings

| Setting | Default |
|---|---:|
| Recent turns | 4 |
| Load-more batch | 4 |
| API prefetch batches | 2 |
| API response body cache | 0 |
| CSS containment | On |
| Status badge | Off |

With defaults, the API tail keeps roughly:

```text
recent turns * 2 + load-more batch * prefetch batches * 2
= 4 * 2 + 4 * 2 * 2
= 24 renderable user/assistant messages
```

## Popup-only estimated speedup

The extension does not continuously calculate speedup on the page. When the popup opens, it requests a one-time snapshot from the active tab and estimates improvement from:

- API message reduction
- API JSON size reduction, using string length to avoid extra `TextEncoder`/`Blob` buffers
- hidden DOM turn ratio
- `content-visibility` support
- JS heap, when Chromium exposes `performance.memory`

This is an estimate, not a controlled benchmark.

## GPU and RAM notes

- The extension does not force `will-change`, `translateZ(0)`, or layer promotion. For text-heavy long chats, forced layer creation can increase GPU memory and layer-management overhead.
- The extension cannot toggle Chrome hardware acceleration. Check `chrome://gpu` manually if GPU compositing is suspected.
- The most important RAM reduction is avoiding full React state/DOM creation for old messages during conversation load.
- A JSON response must still be read and parsed once to rewrite it. That peak cannot be fully eliminated from an extension that rewrites `fetch` responses.

## Install

1. Unzip this package.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the `chatgpt-long-chat-loader-v0.3.0` folder.
6. Open a long conversation on `https://chatgpt.com`.
7. Click the extension icon to view the current-tab estimate and settings.

## Limitations

- Authenticated long-conversation E2E testing is required for final performance numbers.
- ChatGPT internal DOM/API changes may require selector or endpoint updates.
- Full-history search, old message editing, and old branch navigation require the `전체 대화 로드하기` bypass.
- Server-side model context is not reduced; only browser UI loading/rendering pressure is reduced.
- Shared chats may use different delivery paths; DOM windowing may still help, but API trim is not guaranteed there.

## Privacy

No message content is sent to an external server. Settings are stored in `chrome.storage.local` and bridged to the page via `localStorage` for MAIN-world access.
