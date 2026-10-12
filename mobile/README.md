# Altitude React Native app

This is a React Native implementation of Altitude using Expo and Expo Router. Its screens use React Native views and controls; it does not load the website in a WebView. The original browser app and Java WebView APK remain in the repository.

## Features

- Focused home, roadmap, calendar, and insights screens
- The same 24 starter checkpoints and phase data as the browser app
- Add, edit, delete, search, filter, and complete checkpoints and tasks
- Notes, resource links, local progress storage, haptics, and deadline reminders
- Compatible JSON backup import/export and .ics calendar export

## Run

From the mobile directory:

    npm install
    npx expo start

Use Expo Go to preview on a phone. For a standalone Android build, install JDK 17 or newer and the Android SDK, then run:

    npx expo prebuild --platform android
    cd android
    ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a

The standalone APK is at android/app/build/outputs/apk/release/app-release.apk. The generated Android template currently signs this personal build with its debug keystore. Use a private release key before publishing through an app store. The generated android folder is ignored by Git; Expo creates it from app.json and the installed packages.

## Move progress from the old APK

The React Native app uses a separate Android application ID, com.mustansir.altitudern, so it installs alongside the original WebView APK. Open the original Altitude app, choose ⋯ then Export backup, and save the JSON file. Then open the React Native app, choose ⋯ then Import backup, and select that file. Check that your progress and notes appear before removing the original APK.

The two apps have separate on-phone storage. The React Native app works offline from its installed JavaScript bundle. Publishing the old Vercel site does not change this app.

## Update the interface without reinstalling

This project uses `expo-updates` and the `production` update channel. Install the version 1.2 APK over version 1.1 once. The existing 1.1 APK cannot receive remote updates because it was built before `expo-updates` was added. The app's `runtimeVersion` follows its native app version, so leave `version` at `1.2.0` for JavaScript-only updates to this APK.

Sign in to the linked Expo project before publishing:

    npx eas-cli@latest login

After that one-time install, publish UI, JavaScript, and image changes with:

    npx eas-cli@latest update --channel production --platform android --environment production --message "Describe the change"

The installed app checks for updates when opened. A downloaded update runs on the next cold start, or use **Settings → App updates → Check** to apply it immediately. A native dependency, permission, icon, or SDK change still requires a new APK and a new runtime version.
