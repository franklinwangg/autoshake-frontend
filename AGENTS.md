# AutoShake Agents

## Folder Structure

```
autoshake-frontend/
├── src/
│   ├── agents/        # the 4 main extension scripts
│   │   ├── background.ts
│   │   ├── content.ts
│   │   ├── inject.ts
│   │   └── popup.ts
│   ├── api/           # backend API calls (auth, resume upload, job generation)
│   ├── types/         # shared TypeScript types
│   └── utils/         # shared utility functions (popupUtils, etc.)
├── public/            # static assets
│   ├── hello.html
│   ├── styles.css
│   └── images/
├── dist/              # build output (committed to git)
├── tests/
└── manifest.json
```

**Rules:**
- All agent scripts live in `src/agents/` — nothing else goes there
- Backend calls go in `src/api/` — agents never call `fetch` to the backend directly
- Types shared across agents go in `src/types/` — agent-specific types can stay local
- `dist/` is always committed so teammates can load the extension without building

---

The extension is composed of four scripts, each running in a different context. Chrome storage is the shared state between all of them.

## Data Flow

```
Handshake page makes GraphQL request
  → inject.ts intercepts it
  → posts to content.ts via window.postMessage
  → content.ts saves to chrome.storage.local
  → popup.ts reads from chrome.storage.local and displays it
```

---

## inject.ts

**Context:** Main page world (same JS context as Handshake's own code)

Intercepts Handshake's outgoing GraphQL requests by hooking into `fetch` and `XMLHttpRequest`. Parses responses to extract job IDs, then forwards the data to `content.ts` via `window.postMessage`.

Runs at `document_start` so it hooks network calls before the page makes them.

---

## content.ts

**Context:** Isolated content script world

Listens for `AUTOSHAKE_GRAPHQL_RESPONSE` messages from `inject.ts` and writes job GraphQL data to `chrome.storage.local`. Also tracks which job links the user clicks and sends them to `background.ts` via `chrome.runtime.sendMessage`.

---

## background.ts

**Context:** Service worker (persistent background process)

Receives `storeJob` messages from `content.ts` and writes job entries to `chrome.storage.local`. Checks whether tracking is enabled before storing — if disabled, it rejects the message.

---

## popup.ts

**Context:** Extension popup window

Renders the UI shown when the user clicks the extension icon. Reads job data from `chrome.storage.local` and displays the list of viewed jobs. Manages three views: login, create account, and main job list.

HTML structure lives in `hello.html`, styles in `styles.css`.
