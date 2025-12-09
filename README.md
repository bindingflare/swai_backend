# 개인정보와드 백엔드

- `GET /`: Returns a simple health message.
- `GET /api/check`: Analyze consent text; accepts query `text` and returns V2 risk summary.
- `POST /api/check`: Same as GET but via body (`{"text": "..."}`) or raw text.
- `GET /api/checkSummary`: Same analysis as `/api/check` but input is capped at 200 characters; response includes `meta` with `charLimit`, `trimmed`, `usedChars`, and `fullLink` (built from `FRONTEND_ENDPOINT` if set).
- `POST /api/checkSummary`: POST variant of the summary endpoint; same payload handling as `POST /api/check`.

## Configuration
- `PORT`: HTTP port (default `3000`).
- `FRONTEND_ENDPOINT`: Base URL used to build `meta.fullLink` in summary responses; trailing slashes are stripped.
