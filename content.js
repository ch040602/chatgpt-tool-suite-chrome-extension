(() => {
  "use strict";

  const CONTENT_VERSION = "1.4.0";
  const CONTENT_BOOT_FLAG = "__CGPT_LONG_CHAT_LOADER_CONTENT_ACTIVE_V140__";
  if (window[CONTENT_BOOT_FLAG]) {
    try {
      window.dispatchEvent(new CustomEvent("cgpt-lb-force-scan", { detail: CONTENT_VERSION }));
    } catch {
      // Ignore duplicate-injection notification failures.
    }
    return;
  }
  window[CONTENT_BOOT_FLAG] = CONTENT_VERSION;

  const SETTINGS_KEY = "cgptLongChatLoader.settings";
  const SETTINGS_ATTR = "data-cgpt-lb-settings";
  const TRIMMED_ATTR = "data-cgpt-lb-api-trimmed";
  const KEPT_ATTR = "data-cgpt-lb-api-kept";
  const STATS_ATTR = "data-cgpt-lb-api-stats";
  const BYPASS_KEY = "cgptLongChatLoader.bypassOnce";
  const SETTINGS_EVENT = "cgpt-lb-settings";
  const STATS_EVENT = "cgpt-lb-trim-stats";
  const DEBUG_EVENT = "cgpt-lb-debug-log";
  const LOCATION_EVENT = "cgpt-lb-locationchange";
  const MAINTENANCE_EVENT = "cgpt-lb-maintenance";
  const ACTIVE_STATE_EVENT = "cgpt-lb-active-state";
  const CACHE_SUSPENDED_UNTIL_ATTR = "data-cgpt-lb-cache-suspended-until";
  const CACHE_SUSPENDED_REASON_ATTR = "data-cgpt-lb-cache-suspended-reason";
  const LIVE_TRIM_BYPASS_UNTIL_ATTR = "data-cgpt-lb-live-trim-bypass-until";
  const LIVE_TRIM_BYPASS_REASON_ATTR = "data-cgpt-lb-live-trim-bypass-reason";
  const SAFETY_LOCK_KEY = "cgptLongChatLoader.safetyLockUntil";
  const SAFETY_LOCK_ATTR = "data-cgpt-lb-safety-lock-until";
  const SAFE_BYPASS_REASON_ATTR = "data-cgpt-lb-safe-bypass-reason";
  const ACTIVE_REPLY_ATTR = "data-cgpt-lb-active-reply";
  const HIDDEN_CLASS = "cgpt-lb-hidden";
  const CONTAINED_CLASS = "cgpt-lb-contained";
  const LIVE_PROTECTED_CLASS = "cgpt-lb-live-protected";
  const LOAD_MORE_ID = "cgpt-lb-load-more-v140";
  const LEGACY_LOAD_MORE_ID = "cgpt-lb-load-more";
  const STATUS_ID = "cgpt-lb-status";
  const RUNTIME_STYLE_ID = "cgpt-lb-runtime-style-v140";
  const TRIM_MARKER_KEY = "cgptLongChatLoader.trimMarkers.v1";
  const DEBUG_LOG_KEY = "cgptLongChatLoader.debugLog.v1";
  const TRIM_MARKER_TTL_MS = 6 * 60 * 60 * 1000;
  const MAX_TRIM_MARKERS = 20;
  const MAX_DEBUG_LOG_ENTRIES = 500;
  const MAX_DEBUG_ARG_LENGTH = 2000;
  const ACTIVE_REPLY_PROTECTION_MS = 8 * 60 * 1000;
  const THINKING_PROTECTION_MS = 15 * 60 * 1000;
  const ACTIVE_REPLY_IDLE_GRACE_MS = 60 * 1000;
  const ACTIVE_REPLY_WATCHDOG_INTERVAL_MS = 2500;
  const ACTIVE_REPLY_MAX_SILENT_MS = 3 * 60 * 1000;
  const CHARACTER_DATA_SCAN_THROTTLE_MS = 1800;
  const SAFETY_LOCK_MS = 30 * 60 * 1000;
  const TURN_SELECTOR = [
    '[data-testid^="conversation-turn-"]',
    '[data-testid*="conversation-turn"]',
    '[class*="group/conversation-turn"]',
    '[data-turn-id]',
    '[data-message-id]'
  ].join(", ");
  const ROLE_SELECTOR = [
    "[data-message-author-role]",
    "[data-message-author]",
    "[data-author-role]"
  ].join(", ");
  const TURN_CLOSEST_SELECTOR = [
    '[data-testid^="conversation-turn-"]',
    '[data-testid*="conversation-turn"]',
    '[class*="group/conversation-turn"]',
    '[data-turn-id]',
    "article",
    '[role="article"]'
  ].join(", ");

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    apiTrimEnabled: true,
    safeNetworkMode: true,
    visibleTurns: 2,
    loadMoreBatch: 2,
    prefetchBatches: 0,
    apiCacheEntries: 1,
    apiCacheMaxKb: 256,
    maintenanceEnabled: true,
    maintenanceIntervalSec: 60,
    autoCollapseLoadedMessages: true,
    cssContainmentEnabled: true,
    showStatus: false,
    debug: false
  });

  let settings = { ...DEFAULT_SETTINGS };
  let extraVisibleMessages = 0;
  let apiTrimmedCurrentConversation = false;
  let lastApiStats = null;
  let trimmedRouteKey = null;
  let lastUrl = location.href;
  let lastDomMetrics = { total: 0, hidden: 0, visible: 0 };
  let scanScheduled = false;
  let scanTimer = 0;
  let lastScanAt = 0;
  let loadMoreButton = null;
  let statusBadge = null;
  let observer = null;
  let observerTarget = null;
  let navigationTimer = 0;
  let maintenanceTimer = 0;
  let maintenanceScheduled = false;
  let lastMaintenanceAt = 0;
  let pendingRelevantMutations = 0;
  let lastObservedTurnTotal = 0;
  let lastCharacterDataScanAt = 0;
  let lastLoadMoreState = { visible: false, mode: "none", hiddenCount: 0, reason: "init", placement: "none" };
  let lastLoadMoreAt = 0;
  let liveReplyState = { active: false, reason: "init", lastSeenAt: 0, protectedCount: 0 };
  let lastActiveSignalAt = 0;
  let lastActiveSignalValue = false;
  let activeReplyWatchdogTimer = 0;
  let autoCollapseTimer = 0;
  let streamRecoverySince = 0;
  let debugLogWriteQueue = Promise.resolve();
  let mainWorldFallbackInjected = false;

  boot();

  async function boot() {
    settings = await loadSettings();
    hydrateTrimStateFromStorage();
    writeSettingsBridge();
    ensureMainWorldPatchFallback();
    listenForSettingsChanges();
    listenForPopupMetrics();
    listenForTrimStats();
    listenForDebugLogEvents();
    listenForComposerActivity();
    startNavigationWatcher();
    startMaintenanceLoop();
    window.addEventListener("cgpt-lb-force-scan", () => scheduleScan(true));

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        ensureObserverTarget();
        scheduleScan(true);
      }, { once: true });
    }

    ensureObserverTarget();
    scheduleScan(true);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleScan();
        scheduleMaintenance("visibility");
      }
    }, { passive: true });
    window.addEventListener("focus", () => scheduleMaintenance("focus"), { passive: true });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      chrome.storage.local.get(null, (value) => {
        resolve(normalizeSettings(value || {}));
      });
    });
  }

  function hasChromeStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function normalizeSettings(value) {
    const merged = { ...DEFAULT_SETTINGS, ...(value && typeof value === "object" ? value : {}) };
    const cacheValue = Object.prototype.hasOwnProperty.call(merged, "apiCacheEntries")
      ? merged.apiCacheEntries
      : merged.responseCacheMax;
    return {
      enabled: Boolean(merged.enabled),
      apiTrimEnabled: Boolean(merged.apiTrimEnabled),
      safeNetworkMode: merged.safeNetworkMode === false ? false : true,
      visibleTurns: clampInt(merged.visibleTurns, 1, 20, DEFAULT_SETTINGS.visibleTurns),
      loadMoreBatch: clampInt(merged.loadMoreBatch, 1, 20, DEFAULT_SETTINGS.loadMoreBatch),
      prefetchBatches: clampInt(merged.prefetchBatches, 0, 30, DEFAULT_SETTINGS.prefetchBatches),
      apiCacheEntries: clampInt(cacheValue, 1, 2, DEFAULT_SETTINGS.apiCacheEntries),
      apiCacheMaxKb: clampInt(merged.apiCacheMaxKb, 128, 4096, DEFAULT_SETTINGS.apiCacheMaxKb),
      maintenanceEnabled: Boolean(merged.maintenanceEnabled),
      maintenanceIntervalSec: clampInt(merged.maintenanceIntervalSec, 10, 300, DEFAULT_SETTINGS.maintenanceIntervalSec),
      autoCollapseLoadedMessages: merged.autoCollapseLoadedMessages === false ? false : true,
      cssContainmentEnabled: Boolean(merged.cssContainmentEnabled ?? merged.contentVisibilityEnabled),
      showStatus: Boolean(merged.showStatus),
      debug: Boolean(merged.debug)
    };
  }

  function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function writeSettingsBridge() {
    const raw = JSON.stringify(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, raw);
    } catch {
      // Ignore blocked storage.
    }
    if (document.documentElement) {
      document.documentElement.setAttribute(SETTINGS_ATTR, raw);
    }
    try {
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: raw }));
    } catch {
      // Ignore event bridge failures.
    }
  }

  function ensureMainWorldPatchFallback() {
    // Static MAIN-world injection at document_start is the primary path. If a tab was
    // already open when the extension was updated or Chrome skipped content scripts,
    // inject mainWorld.js as a page script so future conversation fetches are patched.
    const tryInject = () => {
      const root = document.documentElement;
      const detected = root && root.getAttribute("data-cgpt-lb-main-version");
      if (detected || mainWorldFallbackInjected || !settings.enabled || !settings.apiTrimEnabled) return;
      const runtime = typeof chrome !== "undefined" && chrome.runtime;
      if (!runtime || !runtime.getURL) return;
      try {
        const script = document.createElement("script");
        script.src = runtime.getURL("mainWorld.js");
        script.async = false;
        script.dataset.cgptLbFallbackMainWorld = CONTENT_VERSION;
        const target = document.documentElement || document.head || document.body;
        if (!target) return;
        target.appendChild(script);
        script.remove();
        mainWorldFallbackInjected = true;
        debugLog("content", "mainWorld fallback script injected");
      } catch (error) {
        debugLog("content", "mainWorld fallback injection failed", String(error && error.message ? error.message : error));
      }
    };
    setTimeout(tryInject, 80);
    setTimeout(tryInject, 800);
    setTimeout(tryInject, 2500);
  }

  function listenForSettingsChanges() {
    if (!hasChromeStorage() || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const next = { ...settings };
      let changed = false;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          next[key] = changes[key].newValue;
          changed = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(changes, "responseCacheMax")) {
        next.apiCacheEntries = changes.responseCacheMax.newValue;
        changed = true;
      }
      if (!changed) return;
      settings = normalizeSettings(next);
      if (!settings.apiTrimEnabled) clearTrimMarkerForCurrentRoute();
      else hydrateTrimStateFromStorage();
      writeSettingsBridge();
      ensureObserverTarget();
      restartMaintenanceLoop();
      scanAndApply();
    });
  }

  function listenForPopupMetrics() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "cgpt-lb-get-metrics") return false;
      try {
        scanAndApply();
        sendResponse(collectMetricsForPopup());
      } catch (error) {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      }
      return true;
    });
  }

  function listenForTrimStats() {
    window.addEventListener(STATS_EVENT, (event) => {
      const raw = event && typeof event.detail === "string" ? event.detail : "";
      const parsed = parseStats(raw);
      if (!statsApplyToThisPage(parsed)) return;
      lastApiStats = parsed;
      apiTrimmedCurrentConversation = Boolean(parsed && parsed.trimmed);
      scheduleScan();
    });
  }

  function listenForDebugLogEvents() {
    window.addEventListener(DEBUG_EVENT, (event) => {
      if (!settings.debug) return;
      const detail = event && event.detail && typeof event.detail === "object" ? event.detail : {};
      const source = typeof detail.source === "string" && detail.source ? detail.source : "mainWorld";
      const args = Array.isArray(detail.args) ? detail.args : [detail.message || detail];
      persistDebugLog(source, args);
    });
  }

  function listenForComposerActivity() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target && target.closest ? target.closest("button") : null;
      if (!button) return;
      const testId = String(button.getAttribute("data-testid") || "").toLowerCase();
      const label = String(button.getAttribute("aria-label") || button.textContent || "").toLowerCase();
      if (testId.includes("send") || label.includes("send") || label.includes("전송") || label.includes("보내")) {
        markActiveReply("send-click", ACTIVE_REPLY_PROTECTION_MS);
        scheduleScan(true);
      }
      if (testId.includes("stop") || label.includes("stop") || label.includes("중지")) {
        markActiveReply("stop-control-visible", ACTIVE_REPLY_PROTECTION_MS);
        scheduleScan(true);
      }
    }, { passive: true, capture: true });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !target.closest) return;
      if (target.closest("textarea, [contenteditable='true'], [role='textbox']")) {
        markActiveReply("composer-enter", ACTIVE_REPLY_PROTECTION_MS);
      }
    }, { passive: true, capture: true });
  }

  function startNavigationWatcher() {
    window.addEventListener(LOCATION_EVENT, checkNavigation, { passive: true });
    window.addEventListener("popstate", checkNavigation, { passive: true });
    window.addEventListener("hashchange", checkNavigation, { passive: true });
    navigationTimer = window.setInterval(checkNavigation, 3000);
  }

  function startMaintenanceLoop() {
    stopMaintenanceLoop();
    if (!settings.enabled || !settings.maintenanceEnabled) return;
    const intervalMs = settings.maintenanceIntervalSec * 1000;
    maintenanceTimer = window.setInterval(() => scheduleMaintenance("interval"), intervalMs);
  }

  function restartMaintenanceLoop() {
    startMaintenanceLoop();
    scheduleMaintenance("settings");
  }

  function stopMaintenanceLoop() {
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = 0;
    maintenanceScheduled = false;
  }

  function scheduleMaintenance(reason) {
    if (!settings.enabled || !settings.maintenanceEnabled || !isLikelyChatSurface() || document.hidden) return;
    if (maintenanceScheduled) return;
    maintenanceScheduled = true;

    const run = () => {
      maintenanceScheduled = false;
      runMaintenance(reason);
    };

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 750);
    }
  }

  function runMaintenance(reason) {
    if (!settings.enabled || !settings.maintenanceEnabled || !isLikelyChatSurface()) return;
    lastMaintenanceAt = Date.now();

    if (isActiveReplyProtected()) {
      // Keep live cache/rewrite protection alive, but still re-apply DOM windowing.
      // A full conversation can be rendered while ChatGPT is streaming/recovering;
      // leaving maintenance disabled in that state makes every old message stay visible.
      dispatchActiveStateToMain(true, liveReplyState.reason || "active reply", ACTIVE_REPLY_PROTECTION_MS);
      compactVolatileState(reason);
      ensureObserverTarget();
      scanAndApply();
      return;
    }

    dispatchMaintenanceToMain(reason);
    compactVolatileState(reason);
    ensureObserverTarget();
    scanAndApply();
  }

  function dispatchMaintenanceToMain(reason) {
    try {
      window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, {
        detail: JSON.stringify({ reason: String(reason || "interval"), timestamp: Date.now() })
      }));
    } catch {
      // Non-critical bridge failure.
    }
  }

  function compactVolatileState(reason) {
    if (!settings.apiTrimEnabled) {
      clearTrimMarkerForCurrentRoute();
    } else if (lastApiStats && !statsApplyToThisPage(lastApiStats)) {
      lastApiStats = null;
      apiTrimmedCurrentConversation = false;
      trimmedRouteKey = null;
    } else if (lastApiStats && isStaleTimestamp(lastApiStats.timestamp, 180_000)) {
      // Stale detailed stats should not drive popup estimates forever, but the
      // lightweight "this route was API-trimmed" marker must remain. Otherwise
      // the full-load button disappears a few minutes after cache/stat cleanup.
      lastApiStats = null;
      hydrateTrimStateFromStorage();
    } else if (!apiTrimmedCurrentConversation) {
      hydrateTrimStateFromStorage();
    }

    const currentTotal = lastDomMetrics.total || queryMessageTurns().length || 0;
    if (currentTotal < lastObservedTurnTotal) {
      extraVisibleMessages = Math.min(extraVisibleMessages, Math.max(0, currentTotal - settings.visibleTurns * 2));
    }
    if (settings.autoCollapseLoadedMessages && extraVisibleMessages > 0 && !isActiveReplyProtected()) {
      const collapseGraceMs = Math.max(30_000, settings.maintenanceIntervalSec * 1000);
      const canCollapse = !lastLoadMoreAt || Date.now() - lastLoadMoreAt >= collapseGraceMs;
      if (canCollapse) {
        debug("auto-collapsing previously loaded older messages", { reason, extraVisibleMessages, currentTotal });
        extraVisibleMessages = 0;
      }
    }
    lastObservedTurnTotal = currentTotal;
    pendingRelevantMutations = 0;
  }

  function scheduleAutoCollapseLoadedMessages(reason) {
    if (autoCollapseTimer) clearTimeout(autoCollapseTimer);
    if (!settings.enabled || !settings.maintenanceEnabled || !settings.autoCollapseLoadedMessages) return;
    const collapseGraceMs = Math.max(30_000, settings.maintenanceIntervalSec * 1000);
    autoCollapseTimer = window.setTimeout(() => {
      autoCollapseTimer = 0;
      scheduleMaintenance(reason || "load-more-auto-collapse");
    }, collapseGraceMs + 250);
  }

  function isStaleTimestamp(timestamp, ttlMs) {
    const value = Number(timestamp);
    return !value || Date.now() - value > ttlMs;
  }

  function checkNavigation() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    extraVisibleMessages = 0;
    apiTrimmedCurrentConversation = false;
    trimmedRouteKey = null;
    lastApiStats = null;
    lastDomMetrics = { total: 0, hidden: 0, visible: 0 };
    hideLoadMore();
    hydrateTrimStateFromStorage();
    ensureObserverTarget();
    scheduleScan(true);
    scheduleMaintenance("navigation");
  }

  function isLikelyChatSurface() {
    const path = location.pathname || "/";
    return path === "/" || path.startsWith("/c/") || path.includes("/c/") || path.startsWith("/share/") || path.startsWith("/g/");
  }

  function ensureObserverTarget() {
    if (!isLikelyChatSurface()) {
      showAllKnownTurns();
      stopObserver();
      removeStatusBadge();
      return;
    }

    const target = getMessageScope() || document.body || document.documentElement;
    if (!target || observerTarget === target) return;

    stopObserver();
    observerTarget = target;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (isRelevantMutation(mutation)) {
          pendingRelevantMutations += 1;
          scheduleScan();
          return;
        }
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy", "aria-label", "data-testid", "data-message-author-role", "data-streaming", "data-state", "class"]
    });
    debug("observer target", target.tagName || target.nodeName);
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    observerTarget = null;
  }

  function isRelevantMutation(mutation) {
    if (mutation.target instanceof Element && isExtensionUi(mutation.target)) return false;

    if (mutation.type === "characterData") {
      const parent = mutation.target && mutation.target.parentElement;
      if (parent && isInsideMessageOrComposer(parent)) {
        markActiveReply("stream-character-data", ACTIVE_REPLY_IDLE_GRACE_MS);
        return true;
      }
      return false;
    }

    if (mutation.type === "attributes") {
      const target = mutation.target instanceof Element ? mutation.target : null;
      if (!target || isExtensionUi(target)) return false;
      if (isStreamingIndicatorElement(target) || hasThinkingMarker(target) || isInsideMessageOrComposer(target)) {
        if ((matchesUnusualActivityText(target.textContent) || matchesUnusualActivityText(target.getAttribute("aria-label"))) && !isInsideUserTurnOrComposer(target)) {
          setSafetyLock("unusual-activity-notice", SAFETY_LOCK_MS);
          markActiveReply("unusual-activity-notice", SAFETY_LOCK_MS, 12);
        } else if (hasThinkingMarker(target) || matchesThinkingText(target.textContent) || matchesThinkingText(target.getAttribute("aria-label"))) {
          markActiveReply("thinking-attribute", THINKING_PROTECTION_MS, 12);
        } else if (isStreamingIndicatorElement(target)) {
          markActiveReply("stream-attribute", ACTIVE_REPLY_PROTECTION_MS, 8);
        }
        return true;
      }
      return false;
    }

    if (mutation.type !== "childList") return false;

    for (const node of mutation.addedNodes) {
      if (isRelevantNode(node)) return true;
    }
    for (const node of mutation.removedNodes) {
      if (isRelevantNode(node)) return true;
    }
    return false;
  }

  function isRelevantNode(node) {
    if (!(node instanceof Element)) return false;
    if (isExtensionUi(node)) return false;
    if (matchesUnusualActivityText(node.textContent) && !isInsideUserTurnOrComposer(node)) {
      setSafetyLock("unusual-activity-notice", SAFETY_LOCK_MS);
      markActiveReply("unusual-activity-notice", SAFETY_LOCK_MS, 12);
      return true;
    }
    if (hasThinkingMarker(node) || matchesThinkingText(node.textContent) || matchesThinkingText(node.getAttribute && node.getAttribute("aria-label"))) {
      markActiveReply("thinking-node", THINKING_PROTECTION_MS, 12);
      return true;
    }
    if (node.matches && (node.matches(TURN_SELECTOR) || node.matches(ROLE_SELECTOR))) return true;
    return Boolean(node.querySelector && node.querySelector(`${TURN_SELECTOR}, ${ROLE_SELECTOR}, [data-testid*="think"], [data-testid*="reason"], [aria-label*="think"], [aria-label*="reason"]`));
  }

  function isInsideMessageOrComposer(el) {
    if (!(el instanceof Element)) return false;
    if (isExtensionUi(el)) return false;
    return Boolean(el.closest(`${TURN_CLOSEST_SELECTOR}, [data-testid*="composer"], form, textarea, [contenteditable='true'], [role='textbox']`));
  }

  function isInsideUserTurnOrComposer(el) {
    if (!(el instanceof Element)) return false;
    const turn = el.closest && el.closest(TURN_CLOSEST_SELECTOR);
    if (turn && isLikelyUserTurn(turn)) return true;
    return Boolean(el.closest && el.closest('[data-testid*="composer"], form, textarea, [contenteditable="true"], [role="textbox"]'));
  }

  function isStreamingIndicatorElement(el) {
    if (!(el instanceof Element)) return false;
    if (isExtensionUi(el)) return false;
    const testId = String(el.getAttribute("data-testid") || "").toLowerCase();
    const aria = String(el.getAttribute("aria-label") || "").toLowerCase();
    const state = String(el.getAttribute("data-state") || "").toLowerCase();
    if (el.getAttribute("aria-busy") === "true") return true;
    if (el.getAttribute("data-streaming") === "true") return true;
    if (testId.includes("stop") || testId.includes("stream")) return true;
    if (aria.includes("stop") || aria.includes("중지") || aria.includes("generating") || aria.includes("생성")) return true;
    if (state.includes("stream") || state.includes("generat")) return true;
    return false;
  }

  function scheduleScan(immediate) {
    if (!isLikelyChatSurface()) {
      showAllKnownTurns();
      stopObserver();
      return;
    }

    if (scanScheduled && !immediate) return;
    if (scanTimer) clearTimeout(scanTimer);

    scanScheduled = true;
    const now = Date.now();
    const delay = immediate ? 0 : Math.max(0, 550 - (now - lastScanAt));

    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      const run = () => {
        scanScheduled = false;
        lastScanAt = Date.now();
        scanAndApply();
        ensureObserverTarget();
      };
      if (!immediate && typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 800 });
      } else {
        run();
      }
    }, delay);
  }

  function scanAndApply() {
    consumeApiTrimSignal();
    const turns = queryMessageTurns();
    applyVisibility(turns);
  }

  function consumeApiTrimSignal() {
    const root = document.documentElement;
    if (!root) return;

    const stats = readApiStatsFromRoot();
    if (statsApplyToThisPage(stats)) {
      if (stats && stats.trimmed) {
        rememberTrimState(stats);
      } else if (stats && stats.trimmed === false) {
        clearTrimMarkerForCurrentRoute();
        lastApiStats = stats;
      }
    }

    if (root.hasAttribute(TRIMMED_ATTR)) {
      rememberTrimState(stats && stats.trimmed ? stats : { trimmed: true, timestamp: Date.now(), pageUrl: location.href });
      root.removeAttribute(TRIMMED_ATTR);
    } else if (!apiTrimmedCurrentConversation && settings.apiTrimEnabled) {
      hydrateTrimStateFromStorage();
    }
  }

  function readApiStatsFromRoot() {
    const root = document.documentElement;
    if (!root) return null;
    return parseStats(root.getAttribute(STATS_ATTR));
  }

  function readApiStats() {
    const fromRoot = readApiStatsFromRoot();
    if (statsApplyToThisPage(fromRoot)) {
      if (fromRoot && fromRoot.trimmed) rememberTrimState(fromRoot);
      else if (fromRoot && fromRoot.trimmed === false) {
        clearTrimMarkerForCurrentRoute();
        lastApiStats = fromRoot;
      }
    }
    if (lastApiStats && statsApplyToThisPage(lastApiStats) && !isStaleTimestamp(lastApiStats.timestamp, 180_000)) {
      return { ...lastApiStats };
    }
    const marker = getTrimMarkerForCurrentRoute();
    return marker && marker.stats ? { ...marker.stats, markerOnly: true, timestamp: marker.timestamp } : null;
  }

  function parseStats(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function statsApplyToThisPage(stats) {
    if (!stats) return true;
    if (!stats.pageUrl) return true;
    return normalizeRouteKey(stats.pageUrl) === currentRouteKey();
  }

  function currentRouteKey() {
    return normalizeRouteKey(location.href);
  }

  function normalizeRouteKey(url) {
    try {
      const parsed = new URL(url, location.href);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return String(url || "").split(/[?#]/)[0];
    }
  }

  function rememberTrimState(stats) {
    if (!settings.apiTrimEnabled) return;
    const routeKey = currentRouteKey();
    const compact = compactTrimStats(stats);
    compact.pageUrl = location.href;
    compact.timestamp = Date.now();
    lastApiStats = { ...compact };
    apiTrimmedCurrentConversation = true;
    trimmedRouteKey = routeKey;
    putTrimMarker(routeKey, { routeKey, pageUrl: location.href, timestamp: compact.timestamp, stats: compact });
    debug("trim marker remembered", routeKey);
  }

  function compactTrimStats(stats) {
    const source = stats && typeof stats === "object" ? stats : {};
    return {
      trimmed: Boolean(source.trimmed),
      totalRenderableMessages: numberOrNull(source.totalRenderableMessages),
      keptRenderableMessages: numberOrNull(source.keptRenderableMessages),
      totalVisibleMessages: numberOrNull(source.totalVisibleMessages),
      keptVisibleMessages: numberOrNull(source.keptVisibleMessages),
      totalMappingNodes: numberOrNull(source.totalMappingNodes),
      keptMappingNodes: numberOrNull(source.keptMappingNodes),
      originalChars: numberOrNull(source.originalChars || source.originalBytes),
      trimmedChars: numberOrNull(source.trimmedChars || source.trimmedBytes),
      originalBytes: numberOrNull(source.originalBytes || source.originalChars),
      trimmedBytes: numberOrNull(source.trimmedBytes || source.trimmedChars),
      keepRenderableMessages: numberOrNull(source.keepRenderableMessages || source.keepVisibleMessages),
      keepVisibleMessages: numberOrNull(source.keepVisibleMessages || source.keepRenderableMessages),
      cacheHit: Boolean(source.cacheHit),
      cacheEligible: source.cacheEligible === false ? false : Boolean(source.cacheEligible),
      cacheStored: Boolean(source.cacheStored),
      cacheMaxKb: numberOrNull(source.cacheMaxKb),
      markerOnly: Boolean(source.markerOnly)
    };
  }

  function hydrateTrimStateFromStorage() {
    if (!settings.apiTrimEnabled) return false;
    const marker = getTrimMarkerForCurrentRoute();
    if (!marker) return false;
    apiTrimmedCurrentConversation = true;
    trimmedRouteKey = marker.routeKey || currentRouteKey();
    if (!lastApiStats && marker.stats) lastApiStats = { ...marker.stats, markerOnly: true, timestamp: marker.timestamp };
    return true;
  }

  function getTrimMarkerForCurrentRoute() {
    const routeKey = currentRouteKey();
    const markers = readTrimMarkers();
    const marker = markers[routeKey];
    if (!marker || isStaleTimestamp(marker.timestamp, TRIM_MARKER_TTL_MS)) {
      if (marker) {
        delete markers[routeKey];
        writeTrimMarkers(markers);
      }
      if (trimmedRouteKey === routeKey) {
        apiTrimmedCurrentConversation = false;
        trimmedRouteKey = null;
      }
      return null;
    }
    return marker;
  }

  function putTrimMarker(routeKey, marker) {
    const markers = readTrimMarkers();
    markers[routeKey] = marker;
    const entries = Object.entries(markers)
      .filter(([, value]) => value && !isStaleTimestamp(value.timestamp, TRIM_MARKER_TTL_MS))
      .sort((a, b) => Number(b[1].timestamp || 0) - Number(a[1].timestamp || 0))
      .slice(0, MAX_TRIM_MARKERS);
    writeTrimMarkers(Object.fromEntries(entries));
  }

  function clearTrimMarkerForCurrentRoute() {
    const routeKey = currentRouteKey();
    const markers = readTrimMarkers();
    if (markers[routeKey]) {
      delete markers[routeKey];
      writeTrimMarkers(markers);
    }
    if (!trimmedRouteKey || trimmedRouteKey === routeKey) {
      apiTrimmedCurrentConversation = false;
      trimmedRouteKey = null;
      lastApiStats = null;
    }
  }

  function readTrimMarkers() {
    try {
      const raw = sessionStorage.getItem(TRIM_MARKER_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeTrimMarkers(markers) {
    try {
      sessionStorage.setItem(TRIM_MARKER_KEY, JSON.stringify(markers || {}));
    } catch {
      // If sessionStorage is unavailable or full, keep the in-memory marker only.
    }
  }

  function getMessageScope() {
    return (
      document.querySelector("main") ||
      document.querySelector("[data-scroll-root]") ||
      document.querySelector('[role="main"]') ||
      document.body ||
      document.documentElement
    );
  }

  function queryMessageTurns() {
    const scope = getMessageScope();
    const exactSelector = '[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [class*="group/conversation-turn"], [data-turn-id]';

    const strategies = [
      () => safeQueryAll(exactSelector, scope).map((el) => normalizeTurnElement(el, scope)),
      () => safeQueryAll(ROLE_SELECTOR, scope).map((el) => resolveTurnFromRoleNode(el, scope)),
      () => safeQueryAll("[data-message-id]", scope).map((el) => resolveTurnFromMessageIdNode(el, scope)),
      () => safeQueryAll("article, [role='article']", scope).map((el) => normalizeTurnElement(el, scope)),
      () => safeQueryAll(".markdown, .prose", scope).map((el) => normalizeTurnElement(el, scope))
    ];

    let best = [];
    for (const build of strategies) {
      const turns = finalizeTurnCandidates(build(), scope);
      if (turns.length > best.length) best = turns;
      // In a real long conversation, two or more resolved turns means the selector is
      // specific enough. Stop here so a later fallback cannot replace it with a broad
      // conversation wrapper.
      if (turns.length >= 2) return turns;
    }

    return best;
  }

  function normalizeTurnElement(el, scope) {
    if (!(el instanceof HTMLElement)) return null;
    if (isExtensionUi(el)) return null;

    const exactSelector = '[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [class*="group/conversation-turn"], [data-turn-id]';
    if (el.matches(exactSelector) && containsWithinScope(scope, el) && !isMultiTurnWrapper(el)) return el;

    if (el.matches(ROLE_SELECTOR)) return resolveTurnFromRoleNode(el, scope);
    if (el.matches("[data-message-id]")) return resolveTurnFromMessageIdNode(el, scope);

    const direct = el.closest(exactSelector);
    if (direct instanceof HTMLElement && containsWithinScope(scope, direct) && !isMultiTurnWrapper(direct)) return direct;

    const article = el.closest("article, [role='article']");
    if (article instanceof HTMLElement && containsWithinScope(scope, article) && !isMultiTurnWrapper(article)) return article;

    return climbToStandaloneMessageContainer(el, scope);
  }

  function resolveTurnFromRoleNode(roleNode, scope) {
    if (!(roleNode instanceof HTMLElement)) return null;
    const exactSelector = '[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [class*="group/conversation-turn"], [data-turn-id]';

    const direct = roleNode.closest(exactSelector);
    if (direct instanceof HTMLElement && containsWithinScope(scope, direct) && !isMultiTurnWrapper(direct)) return direct;

    const article = roleNode.closest("article, [role='article']");
    if (article instanceof HTMLElement && containsWithinScope(scope, article) && !isMultiTurnWrapper(article)) return article;

    return climbToStandaloneMessageContainer(roleNode, scope);
  }

  function resolveTurnFromMessageIdNode(messageNode, scope) {
    if (!(messageNode instanceof HTMLElement)) return null;
    const roleWithin = messageNode.matches(ROLE_SELECTOR) || Boolean(messageNode.querySelector && messageNode.querySelector(ROLE_SELECTOR));
    if (roleWithin && !isMultiTurnWrapper(messageNode) && isLikelyMessageTurn(messageNode, scope)) return messageNode;
    return normalizeTurnElement(messageNode.parentElement || messageNode, scope);
  }

  function climbToStandaloneMessageContainer(el, scope) {
    let node = el instanceof HTMLElement ? el : null;
    let best = null;
    let depth = 0;

    while (node && node !== scope && node !== document.body && node !== document.documentElement && depth < 12) {
      if (!(node instanceof HTMLElement)) break;
      if (isExtensionUi(node) || isForbiddenMessageAncestor(node)) break;

      const roleCount = countMatchesIncludingSelf(node, ROLE_SELECTOR, 3);
      const turnMarkerCount = countMatchesIncludingSelf(node, '[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [class*="group/conversation-turn"], [data-turn-id]', 3);
      const textLength = (node.textContent || "").trim().length;
      const hasTurnClass = String(node.getAttribute("class") || "").includes("group/conversation-turn");
      const hasMessageSignal = roleCount === 1 || turnMarkerCount === 1 || hasTurnClass || node.hasAttribute("data-message-id") || Boolean(node.querySelector && node.querySelector(".markdown, .prose"));

      if (roleCount > 1 || turnMarkerCount > 1) break;
      if (hasMessageSignal && textLength > 0) best = node;

      const parent = node.parentElement;
      if (!parent || parent === scope || parent === document.body || parent === document.documentElement) break;
      const parentRoleCount = countMatchesIncludingSelf(parent, ROLE_SELECTOR, 3);
      const parentTurnMarkerCount = countMatchesIncludingSelf(parent, '[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [class*="group/conversation-turn"], [data-turn-id]', 3);
      if (parentRoleCount > 1 || parentTurnMarkerCount > 1) break;

      node = parent;
      depth += 1;
    }

    return best;
  }

  function finalizeTurnCandidates(candidates, scope) {
    const filtered = uniqueElements(candidates)
      .filter((el) => el instanceof HTMLElement)
      .filter((el) => isAttached(el) && !isExtensionUi(el))
      .filter((el) => !isMultiTurnWrapper(el))
      .filter((el) => isLikelyMessageTurn(el, scope));

    const ordered = sortDocumentOrder(filtered);
    return ordered.filter((el) => {
      // Prefer the outer single-turn wrapper over its inner role/prose node, but never
      // keep a parent that contains multiple turns.
      return !ordered.some((other) => other !== el && other.contains(el) && !isMultiTurnWrapper(other));
    });
  }

  function isMultiTurnWrapper(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (isForbiddenMessageAncestor(el)) return true;
    const roleCount = countMatchesIncludingSelf(el, ROLE_SELECTOR, 3);
    if (roleCount > 1) return true;
    const turnMarkerCount = countMatchesIncludingSelf(el, '[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"], [class*="group/conversation-turn"], [data-turn-id]', 3);
    if (turnMarkerCount > 1) return true;
    return false;
  }

  function countMatchesIncludingSelf(el, selector, limit) {
    if (!(el instanceof HTMLElement)) return 0;
    const max = Math.max(1, Number(limit) || 3);
    let count = 0;
    try {
      if (el.matches(selector) && !isExtensionUi(el)) count += 1;
      if (count >= max) return count;
      if (el.querySelectorAll) {
        for (const child of el.querySelectorAll(selector)) {
          if (child instanceof HTMLElement && !isExtensionUi(child)) count += 1;
          if (count >= max) return count;
        }
      }
    } catch {
      return count;
    }
    return count;
  }

  function isForbiddenMessageAncestor(el) {
    if (!(el instanceof HTMLElement)) return true;
    if (el.matches("html, body, main, nav, aside, header, footer, form, textarea")) return true;
    if (el.closest("nav, aside, header, footer, [data-testid='conversation-sidebar'], [data-testid*='sidebar']")) return true;
    if (el.matches("[data-scroll-root], [role='main']")) return true;
    return false;
  }

  function containsWithinScope(scope, el) {
    const root = scope && typeof scope.contains === "function" ? scope : document;
    return Boolean(root === el || root.contains(el));
  }

  function isLikelyMessageTurn(el, scope) {
    if (!(el instanceof HTMLElement)) return false;
    if (!containsWithinScope(scope, el)) return false;
    if (el.closest("nav, aside, header, footer, [data-testid='conversation-sidebar']")) return false;
    if (el.matches("nav, aside, header, footer")) return false;
    if (el.id === LOAD_MORE_ID || el.id === LEGACY_LOAD_MORE_ID || el.id === STATUS_ID) return false;

    const testId = String(el.getAttribute("data-testid") || "");
    if (testId.includes("conversation-turn")) return true;
    if (el.hasAttribute("data-turn-id")) return true;
    if (el.hasAttribute("data-message-id")) return true;
    if (el.querySelector && el.querySelector(ROLE_SELECTOR)) return true;
    if (el.querySelector && el.querySelector("[data-message-id]")) return true;

    const textLength = (el.textContent || "").trim().length;
    return textLength > 0 && Boolean(el.querySelector && el.querySelector(".markdown, .prose"));
  }

  function safeQueryAll(selector, scope) {
    try {
      const root = scope && typeof scope.querySelectorAll === "function" ? scope : document;
      return Array.from(root.querySelectorAll(selector)).filter((el) => el instanceof HTMLElement);
    } catch {
      return [];
    }
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter((el) => el instanceof HTMLElement)));
  }

  function sortDocumentOrder(elements) {
    const ordered = elements.slice();
    ordered.sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return ordered;
  }

  function removeNested(elements) {
    const result = [];
    for (const el of elements) {
      if (!result.some((parent) => parent.contains(el))) result.push(el);
    }
    return result;
  }

  function isAttached(el) {
    return Boolean(document.documentElement && document.documentElement.contains(el));
  }

  function isExtensionUi(el) {
    return Boolean(el && el.closest && el.closest(`#${LOAD_MORE_ID}, #${LEGACY_LOAD_MORE_ID}, #${STATUS_ID}`));
  }

  function detectActiveReply(turns) {
    const now = Date.now();
    const detected = detectActiveReplyNow(turns);
    if (detected.active) {
      markActiveReply(detected.reason, ACTIVE_REPLY_PROTECTION_MS, detected.protectedCount);
      return { ...liveReplyState };
    }

    if (isActiveReplyProtected()) {
      if (liveReplyState.lastSeenAt && Date.now() - liveReplyState.lastSeenAt > ACTIVE_REPLY_MAX_SILENT_MS && !findStopControl(getMessageScope())) {
        clearActiveReplyProtection("silent-expired");
        return { ...liveReplyState };
      }
      return { ...liveReplyState, active: true };
    }

    if (liveReplyState.active) {
      clearActiveReplyProtection("idle");
    }
    return { ...liveReplyState };
  }

  function detectActiveReplyNow(turns) {
    const scope = getMessageScope();
    const stopControl = findStopControl(scope);
    if (stopControl) return { active: true, reason: "stop-control", protectedCount: 6 };

    const busy = scope && safeQueryAll('[aria-busy="true"], [data-streaming="true"], [data-state*="stream"], [data-state*="generat"]', scope)[0];
    if (busy) return { active: true, reason: "busy-or-streaming-marker", protectedCount: 6 };

    const latest = Array.isArray(turns) && turns.length ? turns[turns.length - 1] : null;
    if (latest && isLikelyAssistantTurn(latest) && hasStreamingMarker(latest)) {
      return { active: true, reason: "latest-assistant-streaming", protectedCount: 8 };
    }

    const thinkingNotice = findThinkingOrReasoningElement(turns, scope);
    if (thinkingNotice) return { active: true, reason: "thinking-or-reasoning-visible", protectedCount: 12 };

    const safetyNotice = findUnusualActivityNotice(turns, scope);
    if (safetyNotice) {
      setSafetyLock("unusual-activity-notice", SAFETY_LOCK_MS);
      return { active: true, reason: "unusual-activity-notice", protectedCount: 12 };
    }

    const recoveryNotice = findStreamRecoveryNotice(turns, scope);
    if (recoveryNotice) {
      if (!streamRecoverySince) streamRecoverySince = Date.now();
      return { active: true, reason: "stream-recovery-waiting", protectedCount: 8 };
    }

    streamRecoverySince = 0;

    return { active: false, reason: "none", protectedCount: 0 };
  }

  function findStreamRecoveryNotice(turns, scope) {
    const recentTurns = Array.isArray(turns) ? turns.slice(-8) : [];
    for (const turn of recentTurns) {
      if (!isLikelyAssistantTurn(turn)) continue;
      if (matchesStreamRecoveryText(turn && turn.textContent)) return turn;
    }

    const statusCandidates = safeQueryAll('[role="status"], [role="alert"], [aria-live], [data-testid*="stream"], [data-testid*="status"], [data-testid*="toast"]', scope);
    for (const el of statusCandidates) {
      if (isExtensionUi(el)) continue;
      const enclosingTurn = el.closest && el.closest(TURN_CLOSEST_SELECTOR);
      if (enclosingTurn && isLikelyUserTurn(enclosingTurn)) continue;
      if (matchesStreamRecoveryText(el.textContent)) return el;
    }
    return null;
  }

  function matchesStreamRecoveryText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return false;
    if (text.includes("스트리밍이 중지") && (text.includes("메시지 완료") || text.includes("완료를 기다"))) return true;
    if (text.includes("streaming") && (text.includes("stopped") || text.includes("interrupted")) && (text.includes("waiting") || text.includes("complete") || text.includes("completion"))) return true;
    if (text.includes("stream") && text.includes("message") && text.includes("completion")) return true;
    return false;
  }

  function findThinkingOrReasoningElement(turns, scope) {
    const recentTurns = Array.isArray(turns) ? turns.slice(-12) : [];
    for (const turn of recentTurns) {
      if (!isLikelyAssistantTurn(turn)) continue;
      if (hasThinkingMarker(turn) || matchesThinkingText(turn && turn.textContent)) return turn;
    }

    const root = scope && typeof scope.querySelectorAll === "function" ? scope : document;
    const candidates = safeQueryAll('[data-testid*="think"], [data-testid*="reason"], [data-testid*="thought"], [aria-label*="think"], [aria-label*="reason"], [aria-label*="thought"], [data-state*="think"], [data-state*="reason"], [role="status"], [aria-live]', root);
    for (const el of candidates) {
      if (isExtensionUi(el)) continue;
      const enclosingTurn = el.closest && el.closest(TURN_CLOSEST_SELECTOR);
      if (enclosingTurn && isLikelyUserTurn(enclosingTurn)) continue;
      if (hasThinkingMarker(el) || matchesThinkingText(el.textContent) || matchesThinkingText(el.getAttribute("aria-label"))) return el;
    }
    return null;
  }

  function findUnusualActivityNotice(turns, scope) {
    const recentTurns = Array.isArray(turns) ? turns.slice(-12) : [];
    for (const turn of recentTurns) {
      if (turn && isLikelyUserTurn(turn)) continue;
      if (matchesUnusualActivityText(turn && turn.textContent)) return turn;
    }
    const root = scope && typeof scope.querySelectorAll === "function" ? scope : document;
    const candidates = safeQueryAll('[role="status"], [role="alert"], [aria-live], [data-testid*="toast"], [data-testid*="error"]', root);
    for (const el of candidates) {
      if (isExtensionUi(el) || isInsideUserTurnOrComposer(el)) continue;
      if (matchesUnusualActivityText(el.textContent) || matchesUnusualActivityText(el.getAttribute("aria-label"))) return el;
    }
    return null;
  }

  function hasThinkingMarker(el) {
    if (!(el instanceof HTMLElement)) return false;
    const haystack = [
      el.getAttribute("data-testid"),
      el.getAttribute("aria-label"),
      el.getAttribute("data-state"),
      el.getAttribute("class")
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return /think|reason|reasoning|analysis|analyz/.test(haystack);
  }

  function matchesThinkingText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return false;
    if (/\b(thinking|reasoning|analyzing|working)\b/.test(text)) return true;
    if (text.includes("생각 중") || text.includes("생각중") || text.includes("추론 중") || text.includes("추론중")) return true;
    if (text.includes("생각하는 중") || text.includes("분석 중") || text.includes("분석중")) return true;
    return false;
  }

  function matchesUnusualActivityText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return false;
    if (text.includes("unusual-activity") || text.includes("suspicious-activity")) return true;
    if (text.includes("unusual activity has been detected") && text.includes("try again later")) return true;
    if (text.includes("we detect suspicious activity") || text.includes("unusual activity detected")) return true;
    if (text.includes("비정상") && text.includes("활동")) return true;
    if (text.includes("의심스러운") && text.includes("활동")) return true;
    return false;
  }

  function isThinkingReason(value) {
    const text = String(value || "").toLowerCase();
    return /think|reason|analysis|analyz|추론|생각|분석/.test(text);
  }

  function setSafetyLock(reason, ttlMs) {
    const until = Date.now() + Math.max(60_000, Number(ttlMs) || SAFETY_LOCK_MS);
    try { localStorage.setItem(SAFETY_LOCK_KEY, String(until)); } catch { /* ignore */ }
    if (document.documentElement) {
      document.documentElement.setAttribute(SAFETY_LOCK_ATTR, String(until));
      document.documentElement.setAttribute(SAFE_BYPASS_REASON_ATTR, String(reason || "safety lock"));
      document.documentElement.setAttribute("data-cgpt-lb-safe-bypass-at", String(Date.now()));
    }
    dispatchActiveStateToMain(true, reason || "safety lock", Math.max(60_000, Number(ttlMs) || SAFETY_LOCK_MS));
  }

  function findStopControl(scope) {
    const root = scope && typeof scope.querySelectorAll === "function" ? scope : document;
    const buttons = safeQueryAll("button, [role='button']", root);
    return buttons.find((button) => {
      if (isExtensionUi(button)) return false;
      const testId = String(button.getAttribute("data-testid") || "").toLowerCase();
      const label = String(button.getAttribute("aria-label") || button.textContent || "").toLowerCase();
      return testId.includes("stop") || label.includes("stop") || label.includes("중지") || label.includes("정지");
    }) || null;
  }

  function hasStreamingMarker(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (isStreamingIndicatorElement(el)) return true;
    return Boolean(el.querySelector && el.querySelector('[aria-busy="true"], [data-streaming="true"], [data-state*="stream"], [data-state*="generat"], .result-streaming'));
  }

  function isLikelyAssistantTurn(el) {
    if (!(el instanceof HTMLElement)) return false;
    const role = getTurnRole(el);
    if (role.includes("assistant")) return true;
    const testId = String(el.getAttribute("data-testid") || "").toLowerCase();
    return testId.includes("assistant");
  }

  function isLikelyUserTurn(el) {
    if (!(el instanceof HTMLElement)) return false;
    const role = getTurnRole(el);
    if (role.includes("user")) return true;
    const testId = String(el.getAttribute("data-testid") || "").toLowerCase();
    return testId.includes("user");
  }

  function getTurnRole(el) {
    if (!(el instanceof HTMLElement)) return "";
    const roleEl = el.matches(ROLE_SELECTOR) ? el : el.querySelector(ROLE_SELECTOR);
    return roleEl
      ? String(roleEl.getAttribute("data-message-author-role") || roleEl.getAttribute("data-message-author") || roleEl.getAttribute("data-author-role") || "").toLowerCase()
      : "";
  }

  function markActiveReply(reason, ttlMs, protectedCount) {
    const now = Date.now();
    const reasonText = String(reason || "active reply");
    const thinking = isThinkingReason(reasonText);
    const effectiveTtl = Math.max(5_000, Number(ttlMs) || (thinking ? THINKING_PROTECTION_MS : ACTIVE_REPLY_IDLE_GRACE_MS));
    const count = Math.max(Number(protectedCount) || 0, liveReplyState.protectedCount || 0, thinking ? 12 : 6);
    liveReplyState = {
      active: true,
      reason: reasonText,
      lastSeenAt: now,
      protectedCount: count,
      protectUntil: now + effectiveTtl
    };
    setActiveReplyAttribute(true);
    dispatchActiveStateToMain(true, liveReplyState.reason, Math.max(30_000, effectiveTtl));
    startActiveReplyWatchdog();
  }

  function clearActiveReplyProtection(reason) {
    liveReplyState = { active: false, reason: String(reason || "idle"), lastSeenAt: Date.now(), protectedCount: 0, protectUntil: 0 };
    streamRecoverySince = 0;
    setActiveReplyAttribute(false);
    dispatchActiveStateToMain(false, reason || "idle", 0);
    stopActiveReplyWatchdog();
  }

  function startActiveReplyWatchdog() {
    if (activeReplyWatchdogTimer) return;
    activeReplyWatchdogTimer = window.setInterval(() => {
      if (!liveReplyState.active) {
        stopActiveReplyWatchdog();
        return;
      }
      if (!isLikelyChatSurface() || document.hidden) return;
      const hardExpired = Number(liveReplyState.protectUntil || 0) <= Date.now();
      if (hardExpired) {
        scheduleScan(true);
        return;
      }
      const ttl = isThinkingReason(liveReplyState.reason) ? THINKING_PROTECTION_MS : ACTIVE_REPLY_IDLE_GRACE_MS + 10_000;
      dispatchActiveStateToMain(true, liveReplyState.reason || "active reply", ttl);
      scheduleScan(isThinkingReason(liveReplyState.reason));
    }, ACTIVE_REPLY_WATCHDOG_INTERVAL_MS);
  }

  function stopActiveReplyWatchdog() {
    if (activeReplyWatchdogTimer) clearInterval(activeReplyWatchdogTimer);
    activeReplyWatchdogTimer = 0;
  }

  function isActiveReplyProtected() {
    return Boolean(liveReplyState.active && Number(liveReplyState.protectUntil || 0) > Date.now());
  }

  function setActiveReplyAttribute(active) {
    const root = document.documentElement;
    if (!root) return;
    if (active) root.setAttribute(ACTIVE_REPLY_ATTR, "true");
    else root.removeAttribute(ACTIVE_REPLY_ATTR);
  }

  function dispatchActiveStateToMain(active, reason, ttlMs) {
    const now = Date.now();
    if (active === lastActiveSignalValue && now - lastActiveSignalAt < 1200) return;
    lastActiveSignalValue = active;
    lastActiveSignalAt = now;
    try {
      window.dispatchEvent(new CustomEvent(ACTIVE_STATE_EVENT, {
        detail: JSON.stringify({
          active: Boolean(active),
          reason: String(reason || "active reply"),
          ttlMs: Math.max(0, Number(ttlMs) || 0),
          timestamp: now,
          pageUrl: location.href
        })
      }));
    } catch {
      // Non-critical bridge failure.
    }
  }

  function isLiveProtectedTurn(index, total, liveState) {
    if (!liveState || !liveState.active) return false;
    const protectedCount = Math.max(4, Number(liveState.protectedCount) || 6);
    return index >= Math.max(0, total - protectedCount);
  }

  function applyVisibility(turns) {
    ensureUi();
    const total = turns.length;
    const liveState = detectActiveReply(turns);

    if (!settings.enabled) {
      for (const el of turns) {
        removeContainment(el);
        removeLiveProtection(el);
        showElement(el);
      }
      hideLoadMore();
      updateStatus(0, total);
      lastDomMetrics = { total, hidden: 0, visible: total };
      return;
    }

    if (total === 0) {
      if (settings.apiTrimEnabled && (apiTrimmedCurrentConversation || hydrateTrimStateFromStorage() || liveState.active)) {
        updateLoadMore(0, []);
      } else {
        hideLoadMore();
      }
      updateStatus(0, total);
      lastDomMetrics = { total, hidden: 0, visible: total };
      return;
    }

    const baseVisibleMessages = Math.max(1, settings.visibleTurns) * 2;
    const requestedVisible = Math.max(2, baseVisibleMessages + Math.max(0, extraVisibleMessages));
    const protectedIndexes = computeProtectedIndexes(turns, liveState, requestedVisible);
    const visibleIndexes = computeVisibleWindowIndexes(total, requestedVisible, protectedIndexes);
    let actuallyHidden = 0;

    for (let i = 0; i < total; i += 1) {
      const el = turns[i];
      const liveProtected = protectedIndexes.has(i);
      if (liveProtected) {
        applyLiveProtection(el);
        removeContainment(el);
      } else {
        removeLiveProtection(el);
        if (settings.cssContainmentEnabled) applyContainment(el);
        else removeContainment(el);
      }

      if (visibleIndexes.has(i)) {
        showElement(el);
      } else {
        hideElement(el);
        actuallyHidden += 1;
      }
    }

    updateLoadMore(actuallyHidden, turns);
    updateStatus(actuallyHidden, total);
    lastDomMetrics = { total, hidden: actuallyHidden, visible: Math.max(0, total - actuallyHidden) };
    writeWindowingState(total, actuallyHidden, visibleIndexes.size, liveState);
  }

  function computeProtectedIndexes(turns, liveState, requestedVisible) {
    const protectedIndexes = new Set();
    const total = turns.length;
    if (!total) return protectedIndexes;

    // Keep the newest configured window visible. During active generation, expand
    // the tail so the current answer/thinking panel remains visible, but do not
    // protect historical "Thought for..." / reasoning snippets across the whole transcript.
    const minimumTail = Math.max(2, Math.min(total, requestedVisible));
    const activeTail = liveState && liveState.active
      ? Math.max(minimumTail, Math.min(total, Number(liveState.protectedCount) || 6))
      : minimumTail;
    const tailStart = Math.max(0, total - activeTail);
    for (let i = tailStart; i < total; i += 1) protectedIndexes.add(i);

    if (liveState && liveState.active) {
      for (let i = tailStart; i < total; i += 1) {
        if (isThinkingOrLiveTurn(turns[i])) protectedIndexes.add(i);
      }
    }

    // Explicit streaming markers outside the tail are rare but should not be hidden.
    for (let i = 0; i < total; i += 1) {
      if (hasStreamingMarker(turns[i])) protectedIndexes.add(i);
    }

    return protectedIndexes;
  }

  function computeVisibleWindowIndexes(total, requestedVisible, protectedIndexes) {
    const visible = new Set();
    const target = Math.min(total, Math.max(1, Number(requestedVisible) || 1));
    for (const index of protectedIndexes) {
      if (Number.isInteger(index) && index >= 0 && index < total) visible.add(index);
    }

    // Fill from the newest messages backwards until the configured window is reached.
    for (let i = total - 1; i >= 0 && visible.size < target; i -= 1) {
      visible.add(i);
    }

    return visible;
  }

  function writeWindowingState(total, hidden, visible, liveState) {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute("data-cgpt-lb-window-total", String(total));
    root.setAttribute("data-cgpt-lb-window-hidden", String(hidden));
    root.setAttribute("data-cgpt-lb-window-visible", String(visible));
    root.setAttribute("data-cgpt-lb-window-active", liveState && liveState.active ? "true" : "false");
    root.setAttribute("data-cgpt-lb-window-at", String(Date.now()));
  }

  function showAllKnownTurns() {
    const turns = queryMessageTurns();
    for (const el of turns) {
      removeContainment(el);
      removeLiveProtection(el);
      showElement(el);
    }
    hideLoadMore();
    lastDomMetrics = { total: turns.length, hidden: 0, visible: turns.length };
  }

  function isThinkingOrLiveTurn(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (hasStreamingMarker(el) || hasThinkingMarker(el)) return true;
    const compactText = String(el.textContent || "").replace(/\s+/g, " ").trim();
    if (compactText.length > 0 && compactText.length <= 320 && matchesThinkingText(compactText)) return true;
    return Boolean(el.querySelector && Array.from(el.querySelectorAll('[data-testid*="think"], [data-testid*="reason"], [data-testid*="thought"], [aria-label*="think"], [aria-label*="reason"], [aria-label*="thought"], [aria-busy="true"], [data-streaming="true"]')).some((node) => {
      const nodeText = String(node && node.textContent || "").replace(/\s+/g, " ").trim();
      return node instanceof HTMLElement && !isExtensionUi(node) && (hasThinkingMarker(node) || (nodeText.length <= 320 && matchesThinkingText(nodeText)) || isStreamingIndicatorElement(node));
    }));
  }

  function applyContainment(el) {
    if (!el.classList.contains(CONTAINED_CLASS)) el.classList.add(CONTAINED_CLASS);
  }

  function removeContainment(el) {
    if (el.classList.contains(CONTAINED_CLASS)) el.classList.remove(CONTAINED_CLASS);
  }

  function applyLiveProtection(el) {
    if (!el.classList.contains(LIVE_PROTECTED_CLASS)) el.classList.add(LIVE_PROTECTED_CLASS);
  }

  function removeLiveProtection(el) {
    if (el.classList.contains(LIVE_PROTECTED_CLASS)) el.classList.remove(LIVE_PROTECTED_CLASS);
  }

  function hideElement(el) {
    if (!(el instanceof HTMLElement)) return;
    if (el.classList.contains(LIVE_PROTECTED_CLASS)) {
      showElement(el);
      return;
    }
    if (!el.hasAttribute("data-cgpt-lb-prev-display")) {
      el.setAttribute("data-cgpt-lb-prev-display", el.style.display || "");
    }
    if (!el.hasAttribute("data-cgpt-lb-prev-content-visibility")) {
      el.setAttribute("data-cgpt-lb-prev-content-visibility", el.style.contentVisibility || "");
    }
    el.classList.add(HIDDEN_CLASS);
    el.setAttribute("data-cgpt-lb-hidden", "true");
    el.setAttribute("aria-hidden", "true");
    // Inline important fallback keeps windowing active even if Chrome injected the JS
    // before content.css, or if ChatGPT CSS has higher specificity. Previous inline
    // values are restored by showElement().
    try {
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("content-visibility", "hidden", "important");
    } catch {
      // Non-critical style fallback failure.
    }
  }

  function showElement(el) {
    if (!(el instanceof HTMLElement)) return;
    el.classList.remove(HIDDEN_CLASS);
    el.removeAttribute("data-cgpt-lb-hidden");
    el.removeAttribute("aria-hidden");
    try {
      const prevDisplay = el.getAttribute("data-cgpt-lb-prev-display");
      const prevContentVisibility = el.getAttribute("data-cgpt-lb-prev-content-visibility");
      if (prevDisplay === null || prevDisplay === "") el.style.removeProperty("display");
      else el.style.setProperty("display", prevDisplay);
      if (prevContentVisibility === null || prevContentVisibility === "") el.style.removeProperty("content-visibility");
      else el.style.setProperty("content-visibility", prevContentVisibility);
    } catch {
      // Ignore inline restore failures.
    }
    el.removeAttribute("data-cgpt-lb-prev-display");
    el.removeAttribute("data-cgpt-lb-prev-content-visibility");
  }

  function ensureUi() {
    ensureRuntimeStyle();
    removeLegacyLoadMoreButton();
    if (!loadMoreButton || !document.documentElement.contains(loadMoreButton)) {
      loadMoreButton = document.createElement("button");
      loadMoreButton.id = LOAD_MORE_ID;
      loadMoreButton.type = "button";
      loadMoreButton.hidden = true;
    }

    if (!settings.showStatus) {
      removeStatusBadge();
      return;
    }

    if (!document.body) return;
    if (!statusBadge || !document.documentElement.contains(statusBadge)) {
      statusBadge = document.createElement("div");
      statusBadge.id = STATUS_ID;
      statusBadge.setAttribute("role", "status");
      statusBadge.setAttribute("aria-live", "polite");
      document.body.appendChild(statusBadge);
    }
  }

  function ensureRuntimeStyle() {
    if (!document.documentElement) return;
    if (document.getElementById(RUNTIME_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = RUNTIME_STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS},[data-cgpt-lb-hidden="true"]{display:none!important;content-visibility:hidden!important;}
      .${LIVE_PROTECTED_CLASS}{content-visibility:visible!important;contain-intrinsic-size:unset!important;}
      @supports (content-visibility:auto){.${CONTAINED_CLASS}:not(.${HIDDEN_CLASS}){content-visibility:auto;contain-intrinsic-size:auto 720px;}}
    `;
    const target = document.head || document.documentElement;
    target.appendChild(style);
  }

  function removeStatusBadge() {
    if (statusBadge && statusBadge.parentElement) statusBadge.remove();
    statusBadge = null;
  }

  function removeLegacyLoadMoreButton() {
    const legacy = document.getElementById(LEGACY_LOAD_MORE_ID);
    if (legacy && legacy !== loadMoreButton) {
      try {
        legacy.remove();
      } catch {
        // Non-critical cleanup.
      }
    }
  }

  function updateLoadMore(hiddenCount, turns) {
    if (!loadMoreButton) return;

    const firstVisible = turns.find((el) => !el.classList.contains(HIDDEN_CLASS));
    const container = firstVisible && firstVisible.parentElement;

    if (hiddenCount > 0) {
      const batchCount = Math.min(hiddenCount, settings.loadMoreBatch * 2);
      loadMoreButton.dataset.mode = "more";
      loadMoreButton.textContent = `이전 메시지 ${batchCount}개 더 보기 · 숨김 ${hiddenCount}개`;
      lastLoadMoreState = { visible: true, mode: "more", hiddenCount, reason: "hidden-dom", placement: "pending" };
      loadMoreButton.onclick = () => {
        lastLoadMoreAt = Date.now();
        extraVisibleMessages += settings.loadMoreBatch * 2;
        scanAndApply();
        scheduleAutoCollapseLoadedMessages("load-more-auto-collapse");
        requestAnimationFrame(() => {
          if (loadMoreButton && !loadMoreButton.hidden) loadMoreButton.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      };
      showLoadMore(container, firstVisible);
      return;
    }

    if (settings.apiTrimEnabled && (apiTrimmedCurrentConversation || hydrateTrimStateFromStorage())) {
      loadMoreButton.dataset.mode = "full";
      loadMoreButton.textContent = "전체 대화 로드하기 · 느려질 수 있음";
      lastLoadMoreState = { visible: true, mode: "full", hiddenCount: 0, reason: "api-trimmed", placement: "pending" };
      loadMoreButton.onclick = () => {
        clearTrimMarkerForCurrentRoute();
        lastApiStats = null;
        try {
          localStorage.setItem(BYPASS_KEY, "true");
        } catch {
          // Ignore storage failures.
        }
        location.reload();
      };
      showLoadMore(container, firstVisible);
      return;
    }

    hideLoadMore();
  }

  function showLoadMore(container, beforeNode) {
    if (!loadMoreButton) return;

    // Prefer a body-level floating control. In recent ChatGPT layouts, inserting the
    // button into the message flex/virtual-scroll container can make it invisible or
    // clipped by an ancestor. Body-level placement keeps the control discoverable.
    if (document.body) {
      if (loadMoreButton.parentElement !== document.body) document.body.appendChild(loadMoreButton);
      loadMoreButton.dataset.floating = "true";
      loadMoreButton.hidden = false;
      loadMoreButton.removeAttribute("hidden");
      lastLoadMoreState.visible = true;
      lastLoadMoreState.placement = "body-floating";
      return;
    }

    if (!container) {
      const fallback = getMessageScope() || document.documentElement;
      if (fallback && loadMoreButton.parentElement !== fallback) fallback.prepend(loadMoreButton);
      loadMoreButton.dataset.floating = "false";
      loadMoreButton.hidden = false;
      loadMoreButton.removeAttribute("hidden");
      lastLoadMoreState.visible = true;
      lastLoadMoreState.placement = "fallback-prepend";
      return;
    }

    if (loadMoreButton.parentElement !== container || loadMoreButton.nextSibling !== beforeNode) {
      container.insertBefore(loadMoreButton, beforeNode || container.firstChild);
    }
    loadMoreButton.dataset.floating = "false";
    loadMoreButton.hidden = false;
    loadMoreButton.removeAttribute("hidden");
    lastLoadMoreState.visible = true;
    lastLoadMoreState.placement = "inline";
  }

  function hideLoadMore() {
    if (loadMoreButton) {
      loadMoreButton.hidden = true;
      loadMoreButton.setAttribute("hidden", "");
    }
    lastLoadMoreState = { visible: false, mode: "none", hiddenCount: 0, reason: "hidden", placement: "none" };
  }

  function updateStatus(hiddenCount, total) {
    if (!statusBadge) return;
    if (!settings.enabled || !settings.showStatus || total === 0) {
      statusBadge.hidden = true;
      return;
    }

    const visible = total - hiddenCount;
    const stats = readApiStats();
    const apiText = stats && stats.totalRenderableMessages
      ? ` · API ${stats.keptRenderableMessages}/${stats.totalRenderableMessages}`
      : apiTrimmedCurrentConversation
        ? " · API trim"
        : "";
    const kept = document.documentElement ? document.documentElement.getAttribute(KEPT_ATTR) : null;
    statusBadge.textContent = `표시 ${visible}/${total} · 숨김 ${hiddenCount}${apiText || (kept ? ` · API ${kept}` : "")}`;
    statusBadge.hidden = false;
  }

  function getMemorySnapshot() {
    const memory = typeof performance !== "undefined" && performance ? performance.memory : null;
    if (!memory) return null;
    return {
      usedJSHeapSize: numberOrNull(memory.usedJSHeapSize),
      totalJSHeapSize: numberOrNull(memory.totalJSHeapSize),
      jsHeapSizeLimit: numberOrNull(memory.jsHeapSizeLimit)
    };
  }

  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function readPatchHealth() {
    const root = document.documentElement;
    const mainVersion = root ? root.getAttribute("data-cgpt-lb-main-version") : "";
    const stats = readApiStats();
    const stableAt = Number(root && root.getAttribute("data-cgpt-lb-stable-initial-trim-at"));
    return {
      mainWorldDetected: Boolean(mainVersion),
      mainWorldVersion: mainVersion || null,
      fallbackInjected: Boolean(mainWorldFallbackInjected),
      hasTrimStats: Boolean(stats && stats.trimmed),
      stableInitialTrim: Boolean(stableAt && Date.now() - stableAt < 30 * 60 * 1000),
      stableInitialTrimAgeSec: stableAt ? Math.max(0, Math.round((Date.now() - stableAt) / 1000)) : null
    };
  }

  function collectMetricsForPopup() {
    const turns = queryMessageTurns();
    const total = turns.length;
    const hidden = turns.filter((el) => el.classList.contains(HIDDEN_CLASS)).length;
    const visible = Math.max(0, total - hidden);
    lastDomMetrics = { total, hidden, visible };
    return {
      ok: true,
      url: location.href,
      routeActive: isLikelyChatSurface(),
      enabled: settings.enabled,
      apiTrimmedCurrentConversation,
      contentVersion: CONTENT_VERSION,
      mainWorldVersion: document.documentElement ? document.documentElement.getAttribute("data-cgpt-lb-main-version") : null,
      mainWorldFallbackInjected,
      patchHealth: readPatchHealth(),
      settings: { ...settings },
      dom: { ...lastDomMetrics, nodes: countDomNodes() },
      api: readApiStats(),
      trimState: getTrimStateForPopup(),
      memory: getMemorySnapshot(),
      css: {
        contentVisibilitySupported: Boolean(window.CSS && CSS.supports && CSS.supports("content-visibility", "auto"))
      },
      maintenance: {
        enabled: Boolean(settings.maintenanceEnabled),
        intervalSec: settings.maintenanceIntervalSec,
        lastRunAt: lastMaintenanceAt || null,
        pendingRelevantMutations,
        lastObservedTurnTotal
      },
      liveReply: getLiveReplyForPopup(),
      cache: {
        entries: settings.apiCacheEntries,
        maxKb: settings.apiCacheMaxKb,
        ...readCacheSuspensionState()
      },
      safetyLock: readSafetyLockState(),
      safeBypass: readSafeBypassState(),
      liveTrimBypass: readLiveTrimBypassState(),
      loadMore: {
        ...lastLoadMoreState,
        inDom: Boolean(loadMoreButton && document.documentElement && document.documentElement.contains(loadMoreButton)),
        text: loadMoreButton && !loadMoreButton.hidden ? loadMoreButton.textContent : ""
      },
      timestamp: Date.now()
    };
  }

  function getLiveReplyForPopup() {
    return {
      active: isActiveReplyProtected(),
      reason: liveReplyState.reason || "none",
      ageSec: liveReplyState.lastSeenAt ? Math.max(0, Math.round((Date.now() - liveReplyState.lastSeenAt) / 1000)) : null,
      protectedCount: liveReplyState.protectedCount || 0,
      streamRecovery: Boolean(streamRecoverySince),
      streamRecoveryAgeSec: streamRecoverySince ? Math.max(0, Math.round((Date.now() - streamRecoverySince) / 1000)) : null
    };
  }

  function readCacheSuspensionState() {
    const root = document.documentElement;
    const until = Number(root && root.getAttribute(CACHE_SUSPENDED_UNTIL_ATTR));
    const reason = root ? root.getAttribute(CACHE_SUSPENDED_REASON_ATTR) : "";
    const active = Number.isFinite(until) && until > Date.now();
    return {
      suspended: active,
      suspendedReason: active ? String(reason || "active reply") : "",
      suspendedForSec: active ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
    };
  }

  function readSafetyLockState() {
    let until = 0;
    try { until = Number(localStorage.getItem(SAFETY_LOCK_KEY) || 0); } catch { until = 0; }
    const attr = Number(document.documentElement && document.documentElement.getAttribute(SAFETY_LOCK_ATTR) || 0);
    until = Math.max(until, attr || 0);
    if (until && Date.now() < until) {
      return {
        active: true,
        until,
        remainingSec: Math.max(0, Math.round((until - Date.now()) / 1000)),
        reason: String(document.documentElement && document.documentElement.getAttribute(SAFE_BYPASS_REASON_ATTR) || "safety lock")
      };
    }
    return { active: false };
  }

  function readSafeBypassState() {
    const root = document.documentElement;
    if (!root) return { active: false };
    const reason = root.getAttribute(SAFE_BYPASS_REASON_ATTR) || "";
    const url = root.getAttribute("data-cgpt-lb-safe-bypass-url") || "";
    const at = Number(root.getAttribute("data-cgpt-lb-safe-bypass-at") || 0);
    const ageSec = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;
    return { active: Boolean(reason && (!at || Date.now() - at < 180_000)), reason, url, ageSec };
  }

  function readLiveTrimBypassState() {
    const root = document.documentElement;
    const until = Number(root && root.getAttribute(LIVE_TRIM_BYPASS_UNTIL_ATTR));
    const reason = root ? root.getAttribute(LIVE_TRIM_BYPASS_REASON_ATTR) : "";
    const active = Number.isFinite(until) && until > Date.now();
    return {
      active,
      reason: active ? String(reason || "active reply") : "",
      remainingSec: active ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
    };
  }

  function getTrimStateForPopup() {
    const marker = getTrimMarkerForCurrentRoute();
    return {
      active: Boolean(apiTrimmedCurrentConversation || marker),
      routeKey: currentRouteKey(),
      remembered: Boolean(marker),
      ageSec: marker && marker.timestamp ? Math.max(0, Math.round((Date.now() - Number(marker.timestamp)) / 1000)) : null,
      statsSource: lastApiStats ? "live-or-recent" : marker ? "session-marker" : "none"
    };
  }

  function countDomNodes() {
    try {
      return document.getElementsByTagName("*").length;
    } catch {
      return null;
    }
  }

  function debug(...args) {
    if (!settings.debug) return;
    try {
      console.debug("[ChatGPT Long Chat Loader]", ...args);
    } catch {
      // Ignore console failures.
    }
    persistDebugLog("content", args);
  }

  function persistDebugLog(source, args) {
    if (!settings.debug || !hasChromeStorage()) return;
    const entry = buildDebugLogEntry(source, args);
    debugLogWriteQueue = debugLogWriteQueue.then(() => appendDebugLogEntry(entry)).catch(() => {});
  }

  function appendDebugLogEntry(entry) {
    return new Promise((resolve) => {
      chrome.storage.local.get([DEBUG_LOG_KEY], (value) => {
        const existing = value && Array.isArray(value[DEBUG_LOG_KEY]) ? value[DEBUG_LOG_KEY] : [];
        const next = existing.concat(entry).slice(-MAX_DEBUG_LOG_ENTRIES);
        chrome.storage.local.set({ [DEBUG_LOG_KEY]: next }, resolve);
      });
    });
  }

  function buildDebugLogEntry(source, args) {
    const safeArgs = (Array.isArray(args) ? args : [args]).map(safeDebugValue);
    return {
      timestamp: new Date().toISOString(),
      source: source || "content",
      version: CONTENT_VERSION,
      pageUrl: location.href,
      routeKey: currentRouteKey(),
      message: safeArgs.join(" "),
      args: safeArgs
    };
  }

  function safeDebugValue(value) {
    let text = "";
    if (value instanceof Error || (value && typeof value === "object" && typeof value.message === "string" && typeof value.name === "string")) {
      text = `${value.name}: ${value.message}`;
      if (value.stack) text += `\n${value.stack}`;
    } else if (typeof value === "string") {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    }
    if (text === undefined) text = String(value);
    return String(text).slice(0, MAX_DEBUG_ARG_LENGTH);
  }

  window.addEventListener("pagehide", cleanup, { once: true });
  window.addEventListener("beforeunload", cleanup, { once: true });

  function cleanup() {
    stopObserver();
    if (navigationTimer) clearInterval(navigationTimer);
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    if (activeReplyWatchdogTimer) clearInterval(activeReplyWatchdogTimer);
    if (autoCollapseTimer) clearTimeout(autoCollapseTimer);
    if (scanTimer) clearTimeout(scanTimer);
    navigationTimer = 0;
    maintenanceTimer = 0;
    activeReplyWatchdogTimer = 0;
    autoCollapseTimer = 0;
    maintenanceScheduled = false;
    scanTimer = 0;
    lastDomMetrics = { total: 0, hidden: 0, visible: 0 };
  }
})();
