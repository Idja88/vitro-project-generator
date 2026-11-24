# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Генератор проектов" plugs into the **Vitro-CAD MP** document-management system via its REST API. From a project card in "Реестр проектов", a user edits a checkbox matrix of design objects × sheet-set marks; the app creates / deletes / restores the matching folder tree in Vitro-CAD storage (СХД), copies folder templates, assigns department permissions to mark folders, and exports "Форма 10" to Excel.

All UI strings, code comments and docs are in Russian. Keep new user-facing messages in Russian.

## Commands

```bash
# backend/ — Flask, Python 3.12, uv. .env lives in backend/ (see ../.env.example)
uv sync
uv run flask --app vitro_generator run          # :5000
uv run pytest                                   # single test: uv run pytest tests/test_set_routes.py -k restore
uv run ruff check . && uv run ruff format --check .

# frontend/ — Vite + React + TS. Node via fnm (restart VS Code if `node` is not found)
npm ci
npm run dev                                     # :5173, proxies /api to :5000
npm run typecheck && npm run lint && npm test && npm run build

# Docker (Linux server): docker compose up -d ; CI builds and smoke-tests the image
```

gunicorn is Linux-only (`fcntl`) and is excluded from the lock on Windows; locally always use `flask run`.

`FLASK_CONFIG` must be `dev`, `prod` or `test` (no default — anything else is a `KeyError` at startup).

## Architecture

```
backend/vitro_generator/
  __init__.py        create_app(): config, loguru, ProxyFix+PrefixMiddleware (prod), blueprints, /healthz
  auth.py            require_token, set_token_cookie, is_production
  callback.py        POST /callback — entry point from Vitro-CAD
  api/__init__.py    /api/v1 for React: DTOs (camelCase), structure, preview, f10
  frontend.py        serves frontend/dist: /project/<id> (index.html with <base href> = prefix), /assets/*
  vitro_cad_api.py   thin requests wrappers over Vitro-CAD endpoints
  services/          matrix.py (parse/validate/order), structure.py (apply_matrix), preview.py, export_f10.py
frontend/src/
  features/matrix/model.ts   pure matrix model + reducer — the heart of the UI
  features/matrix/MatrixTable.tsx, features/project/*   UI (Mantine, dnd-kit)
  api/                       fetch client + TanStack Query hooks
```

### Request flow and auth

1. Vitro-CAD's action POSTs `{"itemIdList": [projectId]}` with an `Authorization` header to `/callback`; the token goes into cookie `mp_token` (one day) and the response's `Link-Open-New-Tab` points to `/project/<id>`.
2. `require_token` reads only `mp_token`. If absent **and** `FLASK_CONFIG != "prod"` **and** `VITRO_CAD_ADMIN_USERNAME/PASSWORD` are set, it logs in via `get_mp_token()` and sets the cookie (dev auto-login). Otherwise 401. When Vitro-CAD itself answers 401 (token expired), `vitro_cad_api` raises `VitroAuthError` instead of returning `None`; the app-level error handler turns it into 401 "сессия истекла" and clears `mp_token`. Broad `except Exception` blocks must re-raise `VitroAuthError`. Environment checks key off `app.config["FLASK_CONFIG"]`, never `app.debug`.
3. Production runs behind nginx at `PREFIX=/generator`; `PrefixMiddleware` 404s anything outside the prefix. The React build uses relative paths and `frontend.py` rewrites `<base href="/" />` to the prefix, so the same build works at `/` and `/generator/`; `apiUrl()` resolves against `document.baseURI`.

### The selection matrix

Stored as JSON in the project's `selection_matrix` field and round-tripped:

```
{ id, name, folder_structure_id, mark_order?: [ { id, number }, ... ],
  objects: [ { id, name, number, folder_structure_id, deleted, to_remove, to_restore,
               marks: [ { id, name, number, folder_structure_id, deleted, to_remove, to_restore } ] } ] }
```

- `folder_structure_id == ""` → create the folder. `to_remove` / `to_restore` are one-shot intents; the backend performs them and flips them back, updating `deleted`.
- A mark is identified by `id` **plus** `number` (АР1 ≠ АР2). In code the column key is the string `id|number` (`services/matrix.mark_key`, frontend `columnKey`), but it is never stored.
- Object id `00000000-0000-0000-0000-000000000000` is the pseudo-object «Общий объект»: marks go straight under the project folder.
- `mark_order` is the optional left-to-right column order as `{id, number}` objects. Readers ignore entries that are not such objects (columns then fall back to first-appearance order); the next save writes the current order. Row order is simply the order of `objects`.
- `buildSelectionMatrix` (frontend) and `services/preview.plan_actions` (backend) must follow the same rules as `services/structure.process_object/process_mark`; tests compare preview against apply.

## Gotchas

- **Vitro-CAD API contract changes silently.** `/api/item/update` requires `multipart/form-data` with a text part `itemListJson` (`files={"itemListJson": (None, json)}`); form-urlencoded gets 500 "Multipart boundary not found". The project code field is now `project_code_auto` (old `code` kept as fallback). When a call starts failing, check the public docs at https://portal.vitrocad.ru/spaces/MP/pages/38928599 and the JSON error body (`message`, `stackTrace`).
- `validate_matrix` allows ids of `[0-9A-Za-z-]` only: ids are interpolated into Vitro-CAD query strings (`item => ... == "<id>"`). Do not relax it.
- **Tests must set env vars before importing the app**: `Config` reads `os.getenv` at import and `load_dotenv()` would otherwise pull in the developer's real `.env`. `backend/tests/conftest.py` does it at module level; `FakeVitro` (`tests/fakes.py`) stands in for every `vitro_cad_api` function.
- loguru sinks use `diagnose=False`: tracebacks must not print variable values (they contained Vitro-CAD tokens).
- TanStack Query has `refetchOnWindowFocus: false` on purpose: a refetch resets the editor state from the saved matrix and would drop unsaved edits.
- No idempotency on partial failure: the matrix is saved to Vitro-CAD only at the end of `apply_matrix`; a failure midway loses ids of folders already created and a retry creates duplicates.

## Releases

CI (`.github/workflows/ci.yml`) runs on every push/PR; merges to `main` publish `ghcr.io/idja88/vitro-project-generator:main`, tags `vX.Y.Z` publish `X.Y.Z`, `X.Y`, `latest`. Tags must match `v*.*.*` exactly (the first release was tagged `v.0.1.0` and would not trigger publishing).
