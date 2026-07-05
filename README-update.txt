Ascend tutorial update based on uploaded app files

Included changes:
- Settings autosave immediately; Save settings button removed.
- Header mark shows the current rank instead of AR.
- Desktop hides the redundant RANK label in the header.
- Guided tutorial mode with isolated tutorial-data.json.
- Tutorial data never calls save/import and is restored after exit/finish.
- PWA icons, Android circular/maskable icons, and browser favicons included.
- service-worker.js cache updated to include tutorial-data.json and icon assets.

After replacing files:
1. Commit and push.
2. On Android, uninstall the old PWA/shortcut and install again so Chrome does not reuse the old cached icon.
