# Update helper notes

v1.5.3 uses a simple GitHub ZIP update helper.

The popup only exposes:

- **Check update**
- **Download latest ZIP**

After checking, it displays only:

- **Installed version**
- **Remote version**

## Developer-mode update flow

For an unpacked developer-mode extension:

1. Press **Check update**.
2. Press **Download latest ZIP** if a newer version exists.
3. Extract the ZIP.
4. Replace the local unpacked extension folder.
5. Refresh the ChatGPT tab.

Chrome does not provide an extension API that lets an unpacked extension overwrite its own local files or install a GitHub ZIP automatically.

## GitHub release asset recommendation

Upload a release asset named like:

```text
chatgpt-tool-suite-chrome-extension-v1.5.3.zip
```

The popup prefers ZIP release assets. If no release asset exists, it can fall back to the repository source ZIP.
