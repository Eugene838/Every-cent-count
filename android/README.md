# Android APK

This small Android WebView app opens https://everycentcount.vercel.app/home.
It uses the deployed website and existing Supabase accounts/data. An internet
connection is required. Website deployments appear automatically in the app.
It is not an offline copy of the website. No Play Store account is needed.

## Install

Copy `dist/Every-Cent-Counts.apk` to an Android 8.0 or newer phone. Open it from
Files and allow that app to install unknown apps if Android requests it.
Sign in with your existing account. Email verification links open in your usual
browser; return to the app to sign in after confirmation.

## Build on Windows

Run `powershell -ExecutionPolicy Bypass -File android/build.ps1` from the project.
The build expects JDK 17 in `.android-tools/java/<jdk-folder>` and the Android
SDK in `.android-tools/sdk`, with `platforms;android-35` and
`build-tools;35.0.0` installed using Google's sdkmanager.

The script creates a private signing key and random password on the first build
in `android/signing`. Back up this folder securely: future APK updates must use
the same key. Never commit or share it. It and generated build tools/APKs are
excluded from Git. Increase `android:versionCode` in AndroidManifest.xml for
future native releases.

The application requests only internet access, allows in-app navigation on its
own HTTPS host, opens external HTTPS links in a browser, and does not bypass TLS
errors. No JavaScript-to-native bridge is exposed. Android Back and offline retry
are supported. Passwords and session storage are handled by the existing website.
