(() => {
  "use strict";

  const PENDING_UPDATE_KEY = "cgptLongChatLoader.pendingChromeUpdate";
  const DEFAULTS_VERSION_KEY = "cgptLongChatLoader.defaultsVersion";

  if (chrome.runtime && chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      // Normalize old settings that can keep the extension in an unexpectedly slow/no-trim state.
      chrome.storage.local.get(null, (value) => {
        const current = value || {};
        const patch = {};
        const defaultsVersion = String(current[DEFAULTS_VERSION_KEY] || "");
        const looksLikeOldDefault =
          (!Object.prototype.hasOwnProperty.call(current, "visibleTurns") || Number(current.visibleTurns) === 3) &&
          (!Object.prototype.hasOwnProperty.call(current, "loadMoreBatch") || Number(current.loadMoreBatch) === 3 || Number(current.loadMoreBatch) === 4) &&
          (!Object.prototype.hasOwnProperty.call(current, "prefetchBatches") || Number(current.prefetchBatches) === 1) &&
          (!Object.prototype.hasOwnProperty.call(current, "apiCacheMaxKb") || Number(current.apiCacheMaxKb) === 512) &&
          (!Object.prototype.hasOwnProperty.call(current, "maintenanceIntervalSec") || Number(current.maintenanceIntervalSec) === 45);

        const visibleTurnsNum = Number(current.visibleTurns);
        const loadMoreBatchNum = Number(current.loadMoreBatch);
        const prefetchBatchesNum = Number(current.prefetchBatches);

        if (defaultsVersion !== "1.4.0" && looksLikeOldDefault) {
          patch.visibleTurns = 2;
          patch.loadMoreBatch = 2;
          patch.prefetchBatches = 0;
          patch.apiCacheMaxKb = 256;
          patch.maintenanceIntervalSec = 60;
          patch.autoCollapseLoadedMessages = true;
        }

        // Prevent stale popup values from making every old turn visible. Users can
        // still raise these later, but the upgrade path resets unsafe all-visible values.
        if (!Number.isFinite(visibleTurnsNum) || visibleTurnsNum > 8) patch.visibleTurns = 2;
        if (!Number.isFinite(loadMoreBatchNum) || loadMoreBatchNum > 12) patch.loadMoreBatch = 2;
        if (!Number.isFinite(prefetchBatchesNum) || prefetchBatchesNum > 2) patch.prefetchBatches = 0;

        if (!Number.isFinite(Number(current.apiCacheEntries)) || Number(current.apiCacheEntries) < 1) patch.apiCacheEntries = 1;
        if (!Number.isFinite(Number(current.apiCacheMaxKb)) || Number(current.apiCacheMaxKb) > 4096) patch.apiCacheMaxKb = 256;
        if (!Object.prototype.hasOwnProperty.call(current, "safeNetworkMode")) patch.safeNetworkMode = true;
        if (!Object.prototype.hasOwnProperty.call(current, "autoCollapseLoadedMessages")) patch.autoCollapseLoadedMessages = true;
        patch[DEFAULTS_VERSION_KEY] = "1.4.0";
        if (Object.keys(patch).length) chrome.storage.local.set(patch);
      });
    });
  }

  if (chrome.runtime && chrome.runtime.onUpdateAvailable) {
    chrome.runtime.onUpdateAvailable.addListener((details) => {
      const payload = {
        version: details && details.version ? details.version : "unknown",
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [PENDING_UPDATE_KEY]: payload }, () => {
        // Apply Chrome-managed updates immediately. This only works for Web Store or
        // properly self-hosted CRX installs; unpacked development installs have no
        // downloadable Chrome-managed update payload.
        try { chrome.runtime.reload(); } catch { /* ignore */ }
      });
    });
  }
})();
