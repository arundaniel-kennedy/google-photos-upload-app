# Photo Drop — Google Photos Portal

Friends upload photos to a staging area; an admin reviews them and approves the
ones that should be pushed to their Google Photos library.

The portal (`/`) is open to everyone: enter a name and upload one or more
images. Uploads are staged for review and attributed to the typed name. No
sign-in is required to contribute.

The **admin dashboard** (`/admin`) groups pending photos into a section per
person (name on the left, **Approve all** on the right, a rule between the
heading and the grid). Hovering a photo reveals **Approve** / **Reject**.
Approved photos are pushed to the admin's Google Photos, then the local copy is
deleted.

## Stack

- Next.js 14 (App Router) — full-stack, API routes + React.
- better-sqlite3 — zero-config local state for pending/approved/rejected photos.
- google-auth-library — OAuth 2.0 with automatic access-token refresh.

## How it differs from a naive MVP

- **Real OAuth** instead of a pasted access token; refresh tokens are stored
  server-side so uploads keep working without re-login.
- **Uploads are stored in `data/uploads/`** (outside `/public`) and previewed only
  through an auth-gated route — the raw bytes are never publicly served.
- **The admin dashboard requires Google login** restricted to `ADMIN_EMAIL`.
- Upload endpoint validates MIME type and size; approve/reject look the record up
  server-side rather than trusting a client-supplied file path.

## Setup

1. In the [Google Cloud Console](https://console.cloud.google.com/): create OAuth
   credentials (Web application), enable the **Photos Library API**, add
   `http://localhost:3000/api/auth/callback` as an authorized redirect URI, and
   add these scopes on the consent screen: `openid`, `email`, and
   `.../auth/photoslibrary.appendonly` (the admin pushes approved photos).
2. Copy `.env.example` to `.env` and fill in the values.
3. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Open `/admin`, sign in with the `ADMIN_EMAIL` account, then share `/` with friends.

> Requires Node.js 22+. `better-sqlite3` is a native module — allow its build
> script when pnpm prompts (already configured in `pnpm-workspace.yaml`).

## Environment variables

See `.env.example`. Key ones: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `ADMIN_EMAIL`, `MAX_UPLOAD_BYTES`, `COOKIE_SECURE`.

## Security

- **Auth** — httpOnly / SameSite=Lax / (optionally) Secure session cookies;
  sessions validated server-side. Only `ADMIN_EMAIL` gets admin rights.
- **CSRF** — OAuth `state` param plus an Origin/Referer check on every
  state-changing endpoint (upload, approve, reject, approve-all).
- **Resource limits** — upload MIME allowlist + size cap; approvals push one
  file at a time so a large batch never accumulates in memory.
- **Input** — uploader names are sanitized (control chars stripped, whitespace
  collapsed) and length-bounded; stored filenames are server-generated UUIDs.
- **Headers** — CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`; `X-Powered-By` disabled.
- Staged files live outside `/public` and are previewable only by the admin.

## Production

Build and run behind an Nginx reverse proxy with PM2:

```bash
pnpm build
pm2 start ecosystem.config.js
```

Set `COOKIE_SECURE=true` when serving over HTTPS.
