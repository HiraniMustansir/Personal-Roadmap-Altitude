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
    ./gradlew assembleRelease

The standalone APK is at android/app/build/outputs/apk/release/app-release.apk. The generated Android template currently signs this personal build with its debug keystore. Use a private release key before publishing through an app store. The generated android folder is ignored by Git; Expo creates it from app.json and the installed packages.

## Move progress from the old APK

The React Native app uses a separate Android application ID, com.mustansir.altitudern, so it installs alongside the original WebView APK. Open the original Altitude app, choose ⋯ then Export backup, and save the JSON file. Then open the React Native app, choose ⋯ then Import backup, and select that file. Check that your progress and notes appear before removing the original APK.

The two apps have separate on-phone storage. The React Native app works offline from its installed JavaScript bundle. Changes to its interface require a new build or an Expo update process; publishing the old Vercel site does not change this app.
