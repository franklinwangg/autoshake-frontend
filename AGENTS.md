# AutoShake Agents

## Folder Structure

```
autoshake-frontend/
├── src/
│   ├── scripts/       # the 4 main extension scripts
│   │   ├── background.ts
│   │   ├── content.ts
│   │   ├── inject.ts
│   │   └── popup.ts
│   ├── api/           # backend API calls (auth, resume upload, job generation)
│   ├── config/        # constants, templates, and service configuration
│   │   └── constants.ts   # URLs, API endpoints, and other shared constants — put new constants here
│   ├── types/         # shared TypeScript types
│   └── utils/         # shared utility functions (popupUtils, etc.)
├── public/            # static assets
│   ├── hello.html
│   ├── styles.css
│   └── images/
├── dist/              # build output (committed to git)
├── tests/
├── scrape-and-parse/  # ⚠️ DO NOT TOUCH — standalone research/prototyping area, not part of the extension
└── manifest.json
```

## Backend API

Base URL: `https://autoshake-production.up.railway.app`

All authenticated endpoints require `Authorization: Bearer <token>` in the request header. The token is obtained from `POST /auth/login` or `POST /auth/signup` and stored in `chrome.storage.local` as `authToken`.

| Group | Method | Path | Description |
|---|---|---|---|
| Auth | POST | `/auth/signup` | Create account |
| Auth | POST | `/auth/login` | Log in, returns token |
| Auth | POST | `/auth/logout` | Invalidate session |
| User | GET | `/user/profile` | Get logged-in user info |
| User | PUT | `/user/profile` | Update name, preferences |
| Resume | POST | `/resume/upload` | Upload master PDF (multipart/form-data) |
| Resume | GET | `/resume` | Get uploaded resume |
| Resume | DELETE | `/resume` | Remove resume |
| Jobs | POST | `/jobs` | Submit scraped job batch from extension |
| Jobs | GET | `/jobs` | List all submitted jobs |
| Jobs | GET | `/jobs/{job_id}` | Get a single job's details |
| Jobs | DELETE | `/jobs/{job_id}` | Remove a job |
| Tailored Resume | POST | `/jobs/{job_id}/generate` | Trigger AI tailoring pipeline for a job |
| Tailored Resume | GET | `/jobs/{job_id}/resume` | Download generated PDF for a job |
| Tailored Resume | POST | `/generate/batch` | Kick off generation for all pending jobs |
| Pipeline | POST | `/extract-skills` | (internal) |
| Pipeline | POST | `/generate-resume` | (internal) |
| Pipeline | GET | `/templates` | (internal) |
| Pipeline | GET | `/health` | Health check |

All endpoint constants live in `src/config/constants.ts` under `API_ENDPOINTS`. The base URL is `API_BASE_URL` in the same file. All `fetch` calls to the backend go in `src/api/` — never inline in scripts.

---

**Rules:**
- All extension scripts live in `src/scripts/` — nothing else goes there
- Backend calls go in `src/api/` — scripts never call `fetch` to the backend directly
- All constants, templates, URLs, and service config live in `src/config/` — never hardcode URLs or credentials inline in scripts or api files
- Types shared across scripts go in `src/types/` — script-specific types can stay local
- `dist/` is always committed so teammates can load the extension without building
- **Never modify anything inside `scrape-and-parse/`** — it is a separate standalone project for prototyping the Handshake data pipeline

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
