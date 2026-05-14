const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const popupHtml = fs.readFileSync(path.join(rootDir, "popup.html"), "utf8");
const popupScript = fs.readFileSync(path.join(rootDir, "popup.js"), "utf8");

assert.ok(popupHtml.includes('id="openReadme"'));
assert.ok(!popupHtml.includes('id="openReadmeKo"'));
assert.ok(!popupHtml.includes('id="popupHint"'));
assert.ok(!popupHtml.includes('id="tryChromeAutoUpdate"'));
assert.ok(!popupHtml.includes('id="openGitRelease"'));
assert.ok(!popupHtml.includes('id="openExtensionsPage"'));
assert.ok(!popupHtml.includes('id="reloadExtension"'));

assert.ok(!popupScript.includes("popupHint"));
assert.ok(!popupScript.includes("tryChromeAutoUpdate"));
assert.ok(!popupScript.includes("openLatestReleasePage"));
assert.ok(!popupScript.includes("openChromeExtensionsPage"));
assert.ok(!popupScript.includes("응답 micro-cache는 기본 1개입니다"));
