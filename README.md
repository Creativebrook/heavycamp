# HeavyCamp

HeavyCamp is a mobile-first PWA for listening to a Bandcamp fan collection through Bandcamp's official Subsonic endpoint.

## Stack

- React + TypeScript + Vite
- Vercel Functions
- Bandcamp Subsonic API
- Neon Postgres + Drizzle ORM
- PWA service worker + Web App Manifest
- Media Session API for Android media controls

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add Bandcamp Subsonic credentials and the Neon `DATABASE_URL`.
3. `npm install`
4. `npm run dev`

## Security

Bandcamp credentials are only read by server-side API routes. Never expose them through `VITE_*` variables or commit them to GitHub.

## Current Bandcamp capability profile

HeavyCamp only relies on endpoints verified against Bandcamp's current beta implementation. Queue, likes, history and recommendation signals are stored in HeavyCamp/Neon rather than assuming optional OpenSubsonic extensions.
