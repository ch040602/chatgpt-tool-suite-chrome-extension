# ChatGPT Long Chat Loader

Chrome MV3 extension for reducing long ChatGPT conversation load and RAM pressure.

Default README language: English. For Korean documentation, open [`README.ko.md`](./README.ko.md) or use the **한국어 README** button in the extension popup.

## v1.4.0 focus

v1.4.0 fixes cases where the extension appeared to run but did not trim or window the conversation at all. It keeps stable conversation refreshes trimmed, forces DOM windowing again during maintenance, and lowers the default first-load footprint.

### Fixed / changed

- Fixed a route-state bug where a live/thinking bypass could incorrectly consume the one initial-trim slot. This could make later requests pass through untrimmed forever on the same route.
- Stable conversation refreshes are now trimmed continuously instead of passing the full transcript through after the first trimmed GET.
- Stable trim completion is recorded only after a stable conversation response was actually parsed and either trimmed or confirmed small enough.
- Active generation, thinking, reasoning, and recovery responses no longer mark a route as already optimized.
- DOM windowing now re-applies during maintenance even when live-reply protection is active, so a full transcript that slips through during streaming does not remain fully visible.
- Historical completed thinking/reasoning snippets no longer protect old messages from being hidden; only the current live tail is protected.
- Added loaded-message auto-collapse: messages revealed through **Load more** are folded back to the configured recent window on the next maintenance cycle.
- Added a MAIN-world fallback injection path for tabs that were already open or skipped static content-script injection.
- Added popup actions for **Fast first-load preset** and **Patch reinjection**.
- Optimized defaults for faster first loading.
- Added periodic auto-collapse for older messages loaded through **Load More**.
- Added a Chrome-managed update-check button. It works only for Web Store / self-hosted CRX / enterprise-managed installs. Developer-mode unpacked installs still need manual folder replacement after downloading the release ZIP.

## Defaults

| Setting | Default |
|---|---:|
| Enabled | on |
| Initial API trimming | on |
| Network Safe Mode | on |
| Recent turns | 2 |
| Load-more batch | 2 |
| API prefetch batches | 0 |
| Response micro-cache entries | 1 |
| Cache item limit | 256 KB |
| Maintenance interval | 60 sec |
| Auto-collapse loaded older messages | on |
| Status badge | off |

These defaults keep only the newest message window visible. Older DOM messages are hidden and can be revealed in batches. If older messages were removed before ChatGPT rendered them, use the full-load button.

## Popup diagnostics

The popup estimates performance only while it is open. It can show:

- estimated loading improvement
- API trim count and estimated size reduction
- DOM visible/hidden counts
- response live-protection state
- Thinking Shield state
- live API original-pass state
- safety lock state
- micro-cache state
- patch health and fallback injection state
- content/main script versions

## Installation

1. Extract the ZIP.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the extracted extension folder.
6. Refresh existing ChatGPT tabs.
7. Open the popup and confirm `API patch: MAIN 1.4.0`.

## If trimming does not happen

Open the popup and check:

- `API patch`: should be `MAIN 1.4.0`.
- `Patch status`: should include `MAIN detected`.
- `Safe original pass`: should not be permanently active while the page is idle.
- DOM hidden count: should be greater than zero in a long conversation. If it is zero, press **Patch reinjection** and refresh the tab.
- `Thinking shield`: should be idle after the answer is complete.

Use **Patch reinjection** for an already-open tab. For the fastest initial load, apply **Fast first-load preset** and refresh the ChatGPT tab.

## Notes on unusual-activity warnings

This extension does not bypass OpenAI security systems. If ChatGPT displays an unusual/suspicious activity warning, the extension enters a passive safety lock and stops conversation-response rewriting temporarily. VPNs, proxies, browser/device sessions, network reputation, and account security can still trigger warnings independently of the extension.

## Update helper

The popup includes GitHub update buttons. The repository URL is fixed internally and is not shown as an editable field.

- **Chrome auto update check** calls `chrome.runtime.requestUpdateCheck()`.
- **Latest ZIP download** downloads the newest release/source ZIP from GitHub.

Developer-mode unpacked extensions cannot replace their own local files automatically. For release-based automatic updates, package the extension as a CRX with a stable key and publish a Chrome-managed update manifest. See [`UPDATE_HOSTING.md`](./UPDATE_HOSTING.md).

## Limitations

- The network response from ChatGPT still has to be downloaded before the extension can trim it. The extension mainly reduces JSON handed to the ChatGPT React app, DOM rendering, layout, and RAM pressure.
- Authenticated long-conversation E2E benchmarks must be run in your own ChatGPT session.
- ChatGPT DOM/API changes may still require selector or trim-logic updates.
- Full server-side model context is not reduced; this targets browser loading, rendering, and memory pressure.

## v1.4.0 notes

This version fixes cases where every message stayed visible after refresh or after a long session.

- Stable idle conversation GET responses are trimmed continuously instead of only once.
- DOM windowing is forced with an inline `display: none !important` fallback, so it still works if the stylesheet is delayed or skipped.
- Active replies, thinking panels, and stream-recovery rows stay visible, but old turns are still collapsed.
- Previously expanded older turns are automatically collapsed again after the maintenance interval when no live reply is active.
- Unsafe saved values that can make the whole transcript visible are normalized on upgrade.
