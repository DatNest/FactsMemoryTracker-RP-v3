# Changelog

## 3.0.0-preview

- Replaced manual custom API configuration with existing SillyTavern Connection Profiles.
- Removed endpoint auto-probing.
- Added per-chat memory profile persistence and automatic switching on `CHAT_CHANGED`.
- Added character/group default bindings for new chats.
- Added incremental scan cursor, batching and overlap.
- Added structured fact metadata and knowledge ownership (`knownBy`).
- Added update/deduplicate/contradiction handling.
- Added conflict review cards.
- Added knowledge-aware prompt injection.
- Added manual/optional automatic flashbacks.
- Added generic JSON import/export.
