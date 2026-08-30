# HeavyCamp

HeavyCamp is a private, mobile-first PWA for listening to a Bandcamp fan Collection through Bandcamp's official Subsonic endpoint.

## Stack

- React + TypeScript + Vite
- Vercel Functions + daily Vercel Cron
- Bandcamp Subsonic API
- Neon PostgreSQL via `@neondatabase/serverless`
- PWA service worker + Web App Manifest + Web Push
- Media Session API for Android notification, lock-screen and headset controls

## Current features

- Bandcamp Collection library, cover art and range-compatible streaming
- Hero player with sequential/shuffle queues and Smart Pick
- Filtering by genre and sorting by date, band or country when metadata exists
- HeavyCamp likes/dislikes, listening history and recommendation signals in Neon
- Local HeavyCamp playlists in Neon; Bandcamp playlist write-sync is intentionally deferred until the beta endpoints are verified with real writes
- Queue/position persistence
- PWA installation and Android Media Session controls
- Daily safe Collection scan and optional push notifications; external Bandcamp discovery remains disabled until an official automated source is available
- Single-user access key with HttpOnly session cookie; Bandcamp credentials stay server-side

## Environment

Copy `.env.example` to `.env.local` for local development. Production requires the same variables in Vercel. Never expose Bandcamp credentials through `VITE_*` variables or commit them to GitHub.

## Neon bootstrap

After `DATABASE_URL` and `HEAVYCAMP_ACCESS_KEY` are configured, unlock HeavyCamp and use **Settings → Initialize database** once. The bootstrap is idempotent and creates the HeavyCamp schema in Neon.

## Development

```bash
npm install
npm run dev
```

HeavyCamp only relies on Bandcamp endpoints that were verified against the current Bandcamp beta implementation. Unsupported/optional OpenSubsonic features fall back to HeavyCamp/Neon rather than being assumed available.
