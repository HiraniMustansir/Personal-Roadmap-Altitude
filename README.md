# Altitude — Cloud / AI Journey

A static, browser-based progress tracker for the cloud computing and AI roadmap. It has 24 starter checkpoints, course links, project checklists, notes, deadlines, a calendar, insights, JSON backup, and calendar export.

## Run locally

Requires Node.js 18 or later. No dependencies or install step are needed.

```bash
npm run dev
```

Open http://127.0.0.1:4173. To use another port, set `PORT`, for example `PORT=5000 npm run dev`.

## Deploy later to Vercel

The root `vercel.json` configures Vercel to serve the static files in `dist/` with no build command. Import this project repository into Vercel, or run the Vercel CLI from this directory when you are ready. Do not set the Vercel project root to `dist`; keep the repository root so Vercel reads `vercel.json`.

## Data and reminders

Progress is saved in this browser's local storage. Use the in-app backup export and import to move it between browsers or devices. The calendar downloads an `.ics` file with deadlines. Browser notifications only work while the app is open and permission is granted.
# Personal-Roadmap-Altitude
