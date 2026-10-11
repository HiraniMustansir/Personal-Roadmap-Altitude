# Altitude — Cloud / AI Journey

A static, browser-based progress tracker for the cloud computing and AI roadmap. It has 24 starter checkpoints, course links, project checklists, notes, deadlines, a calendar, insights, JSON backup, and calendar export.

## Download the Android app

**[Download the latest Android APK (1.1)](https://raw.githubusercontent.com/HiraniMustansir/Personal-Roadmap-Altitude/main/Altitude-1.1.apk)**

Open the link on your Android phone, then open the downloaded APK to install it. Version 1.1 installs over version 1.0 and moves existing on-phone progress into the new view. Android may ask you to allow installs from your browser or file manager. Your checklist changes are stored on your phone. The APK and regular phone browser have separate progress; use the JSON backup export and import to move progress between them.

### How UI updates reach the phone

Edit `dist/index.html`, `dist/styles.css`, or `dist/app.js`, then push to `main`. Vercel deploys the new website. Open Altitude and tap **↻** in the top bar to load the latest UI. You do not need to rebuild or reinstall the APK for website UI changes. The app loads the live UI when online and uses its bundled copy if the site is unreachable. Its checklist data remains in the app's local storage on the phone.

Changes to the native Android wrapper in `android/` still require a new APK. Increase `versionCode` and rebuild with the same signing key to install over the existing app without clearing its data.

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

The `android/` project packages a fallback copy of the files in `dist/` inside a small WebView app. It loads the live Vercel UI when available and keeps checkpoint progress on the phone. Internet is needed to receive new UI changes and open external course links. The website and Android app have separate local storage, so export a JSON backup from one and import it into the other if you want to transfer progress.

To rebuild the APK after editing the website, install Android SDK Platform 35 and Build Tools 35.0.0, then run:

```bash
cd android
./gradlew assembleDebug
```

The installable file is `android/app/build/outputs/apk/debug/app-debug.apk`. Android signs this debug build automatically for personal installation. If you build on another computer, its debug signing key will differ, so that APK cannot update the existing install while preserving app data. Keep the current machine's `~/.android/debug.keystore` safe for future native APK updates. Copy a rebuilt APK to the repository root and update the README download link only when you change native code.
