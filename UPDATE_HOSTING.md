# Release-based update support

The popup has two update paths.

## 1. Chrome-managed update check

The **Chrome auto update check** button calls `chrome.runtime.requestUpdateCheck()`.

This can apply an update only when Chrome already manages the extension package, for example:

- Chrome Web Store installation
- properly self-hosted CRX installation in an environment where Chrome allows self-hosted extensions
- enterprise/policy-managed installation

It cannot replace the files of a developer-mode unpacked extension.

## 2. GitHub release ZIP helper

For developer-mode unpacked installs, the popup can check GitHub Releases and download the newest ZIP. The user still has to unzip it and replace/reload the unpacked extension folder in `chrome://extensions`.

Chrome extensions do not provide an API that lets an unpacked extension overwrite its own local files or install a GitHub ZIP as an extension.

## Self-hosted CRX outline

To make Chrome-managed updates work outside Chrome Web Store, publish a packed `.crx` with a fixed key and host an update XML. A minimal XML shape is:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="YOUR_EXTENSION_ID">
    <updatecheck codebase="https://example.com/chatgpt-long-chat-loader-v1.4.0.crx" version="1.4.0" />
  </app>
</gupdate>
```

Then add an `update_url` field to the packaged manifest that points to that XML. Keep the private key stable; otherwise the extension ID changes and updates will not apply.
