# Altitude — Cloud / AI Journey

A static, browser-based progress tracker for the cloud computing and AI roadmap. It has 24 starter checkpoints, course links, project checklists, notes, deadlines, a calendar, insights, JSON backup, and calendar export.

## Download the Android app

**[Download Altitude 1.0 APK](https://raw.githubusercontent.com/HiraniMustansir/Personal-Roadmap-Altitude/main/Altitude-1.0.apk)**

Open the link on your Android phone, then open the downloaded APK to install it. Android may ask you to allow installs from your browser or file manager. Your checklist changes are stored on your phone. The APK and website have separate progress; use the JSON backup export and import in the app to move progress between them.

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

## Android APK

The `android/` project packages the files in `dist/` inside a small WebView app. Checkpoint progress is stored on the phone itself. Internet is only needed to open external course links or load the optional Google fonts; the roadmap works offline. The website and Android app have separate local storage, so export a JSON backup from one and import it into the other if you want to transfer progress.

To rebuild the APK after editing the website, install Android SDK Platform 35 and Build Tools 35.0.0, then run:

```bash
cd android
./gradlew assembleDebug
```

The installable file is `android/app/build/outputs/apk/debug/app-debug.apk`. Android signs this debug build automatically for personal installation. Copy the rebuilt file to `Altitude-1.0.apk` at the repository root if you want the README download link to serve the updated app.
