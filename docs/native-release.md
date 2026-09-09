# Native release preparation

The repository includes a pinned Capacitor 8 runtime and CLI for packaging the
same self-contained `dist/` game on iOS and Android. This is a packaging scaffold,
not a signed binary or a claim of App Store approval. No developer credentials,
provisioning profiles, keystores, or store submissions are included.

## Reproduce a native project

Use Node 22 or newer. Run these commands from the repository root:

```sh
npm ci
npm run check
# Run once for each platform you intend to ship:
npm run native:add:android
npm run native:add:ios
# After subsequent web changes:
npm run native:sync
```

`native:add` creates the platform project and copies the current production build.
`native:sync` rebuilds the game and synchronizes every platform already added.
The scaffold deliberately leaves native projects ungenerated in this PR. After
creating them on the release workstation, commit their source files and retain
their generated `.gitignore` rules; platform-specific changes must be reviewed
alongside web changes. Never commit signing secrets.

The bundle identifier is provisionally `com.collectiveai.codex`. Confirm ownership
and availability in the developer accounts before generating release projects.
The config packages local game files and has no development-server URL or
mixed-content permission. Production native logging is disabled. Safe-area
spacing belongs to the web UI, so iOS does not add another content inset.

## Toolchains and device runs

iOS builds require macOS, Xcode 26 or newer, and its command-line tools. Capacitor 8
uses Swift Package Manager by default. Android builds require Android Studio
2025.2.1 or newer and the Android SDK. Install the SDK/Java versions requested by
the generated project's Gradle configuration. See the official
[environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
and [native workflow](https://capacitorjs.com/docs/basics/workflow).

```sh
npm run native:open:android
npm run native:open:ios
# Or select a connected device interactively:
npm run native:run:android
npm run native:run:ios
```

Physical-device validation is still required: smallest supported screen, tablet,
notches and safe areas, portrait/landscape, Android back navigation, screen-reader
focus, reduced motion, background/resume, sound behavior, full offline launch,
saved decks/matches after process death and app upgrade, and a complete match
under memory pressure. Record device, OS, build number, result, and defects.
Browser emulation does not replace these checks.

## Release evidence still needed

- Replace native template icons/splash assets with the approved game identity;
  check the final installed app on both light and dark system themes.
- Set platform version/build numbers, orientations, supported OS/device families,
  and signing in Xcode and Android Studio. Build an iOS archive and Android App
  Bundle, then test the signed artifacts through TestFlight and Play internal
  testing.
- Verify privacy declarations against the final binary and all dependencies.
  Complete App Privacy, Android Data safety, content/age ratings, privacy-policy
  and support URLs, screenshots, description, and art/font licensing records.
- Review any generated Apple privacy manifest and required-reason APIs. Do not
  assume a web-only implementation removes native SDK disclosure requirements.
- Confirm current store submission requirements at release time, resolve every
  release-blocking device defect, and submit using the owner's developer accounts.

Signing, physical-device performance, TestFlight/Play testing, and store review
remain unverified until those steps produce actual evidence. Refer to Capacitor's
[iOS distribution guide](https://capacitorjs.com/docs/ios/deploying-to-app-store)
and [Android distribution guide](https://capacitorjs.com/docs/android/deploying-to-google-play).
