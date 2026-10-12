# 🧠 Facts Memory Tracker RP v3 (preview)

Clean-room rewrite of the workflow used by FactsMemoryTracker, focused on long RP continuity in current SillyTavern.

## Main changes

- **Uses existing SillyTavern Connection Profiles** through `ConnectionManagerRequestService`.
  - No API URL field.
  - No API key field.
  - No endpoint guessing/roulette.
  - Does **not** change the globally active RP connection.
- **Automatic memory-profile switching per chat.**
  - The selected FMT profile is saved in the current chat metadata.
  - Switching chats automatically restores that chat's memory profile.
  - Optional character/group binding supplies the default profile for new chats of the same character/group.
- **Incremental scanning.**
  - Only new messages plus a small overlap are scanned after the cursor.
  - Existing chats are not automatically backfilled on first load; use **«Весь чат»** explicitly.
- **Structured facts.**
  - `category`, `importance`, `subjects`, `knownBy`, source message indexes, confidence, revisions and status.
  - Scanner supports `NEW`, `UPDATE`, `DUPLICATE`, `CONTRADICTS`.
- **Knowledge-aware memory injection.**
  - Facts include who actually knows them.
  - Injection explicitly warns the RP model not to leak hidden knowledge.
- **Conflict-safe continuity.**
  - Contradictions are stored as disabled conflict cards instead of silently becoming canon.
- **Manual and automatic flashbacks.**
- **Import/export.**
  - Import accepts a v3 export, `{facts:[...]}`, or a plain array of fact-like objects, which helps migrate older exports.

## Installation / testing

This is a preview replacement, so test it without deleting your old extension first.

1. Back up/export your current FactsMemoryTracker facts.
2. Put the folder `facts-memory-tracker-rp-v3` into your SillyTavern extensions folder, or package it in your own Git repo and install through **Extensions → Install Extension**.
3. Reload SillyTavern.
4. Open **Extensions → 🧠 Память фактов RP v3**.
5. Under **Подключение сканера**, select an **existing SillyTavern Connection Profile** (for example your AITUNNEL + Mistral profile).
6. Click **Проверить профиль**. The extension sends a tiny JSON test through that profile only.
7. For an existing long chat, click **Весь чат** only if you want to backfill old history. Otherwise auto-scan starts from future messages.

## Suggested settings for RP

- Auto-scan: ON
- Every: 10–12 messages
- Batch: 10–12 messages
- Overlap: 2
- Max tokens: 4096
- Injection: Medium+
- Max injected facts: 30–40
- Auto-flashback: OFF / 0% by default

## Important notes

- Connection Manager must be enabled in SillyTavern.
- The extension deliberately does not send the character card, lorebooks or entire RP prompt to the scanner. The scanner receives only its continuity instructions, relevant existing memory, and the message batch being scanned. This keeps scanning cheaper and reduces cross-contamination.
- The extension intentionally avoids automatic full-history scanning when first opened in an old chat.
- This rewrite does not copy the original extension source code. It reimplements the public feature concept around current SillyTavern APIs.

## Data location

- Global FMT profiles/settings: SillyTavern extension settings under `facts_memory_tracker_rp_v3`.
- Per-chat facts/cursor/profile binding: current chat metadata under the same key.

