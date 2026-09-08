# Every Cent Counts finance tracker

Simple finance app tracker 

Use the [web app](https://everycentcount.vercel.app/home) or download the [latest Android APK](https://github.com/Eugene838/Every-cent-count/releases/latest/download/Every-Cent-Counts.apk).

## Web and Android releases

This repository contains both the website (root HTML/CSS/JavaScript files) and
the Android wrapper (`android/`). The APK opens the deployed website and shares
its Supabase backend. Website changes pushed to `main` deploy through the existing
Vercel integration and are available to Android without an APK update.

Android changes need a new signed APK. To publish one:

1. Increase `versionCode` and set `versionName` in `android/AndroidManifest.xml`.
2. Commit and push the changes to `main`.
3. Tag that commit with the matching version, for example `git tag v1.0.1`, then
   `git push origin v1.0.1`.
4. The Android release workflow builds, verifies, and attaches the APK and SHA-256
   checksum to GitHub Releases. Check the Actions tab for its status.

Release tags identify an exact snapshot of both codebases. The installed Android
version describes the wrapper; the website can advance independently. Sideloaded
native updates are installed manually from Releases.

GitHub Actions uses the `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`
repository secrets. The local signing originals stay in ignored `android/signing/`;
keep a secure backup so future releases retain the same signing identity. Never
commit signing keys, passwords, or generated SDK tools. The workflow uses a standard
GitHub-hosted runner for this public repository, without paid services.

## What it includes

- Income, expenses, available balance, and savings-rate summaries
- A monthly expense budget with progress and over-budget state
- Category and daily-spending views
- Add and remove transactions
- Month navigation
- Overall yearly expenses and income

## Tech used
- HTML/CSS
- JavaScript
- Supabase(PostgreSQL)

