# AGENTS.md — rules for working on KidsTube

KidsTube is an Android TV app: a YouTube front end for children where a parent decides what may be shown. The safety of what the child sees is the point of the project; everything else is secondary. Read this file before changing anything.

User-facing documentation lives in `README.md` (English) and `README.ru.md` (Russian). This file is for whoever changes the code.

## Project layout

| Path | What it is |
|---|---|
| `app/src/main/java/app/kidstube/tv/MainActivity.java` | Full-screen WebView hosting the UI from `assets/web`, remote-key routing, JS bridge (`window.Android`), native text-input dialog, voice input, update installation |
| `…/InnerTube.java` | YouTube's internal web API (search, "up next"). Returns **video IDs only** |
| `…/Store.java` | Settings (one JSON string in SharedPreferences), watch history and search log (JSON files) |
| `…/SettingsServer.java` | Small HTTP server on the LAN (port 8765+) for the phone settings page; every API call checks the PIN |
| `…/Updater.java` | In-app updates from the GitHub `latest` release |
| `app/src/main/assets/web/index.html`, `app.js`, `app.css` | The TV interface |
| `app/src/main/assets/web/i18n.js` | All TV UI strings, English and Russian |
| `app/src/main/assets/web/remote.html` | The phone settings page (served by `SettingsServer`), with its own string table |
| `app/src/main/assets/web/qrcode.js` | Vendored QR library (MIT) |
| `version.properties` | **The only source of the app version** |
| `.github/workflows/build.yml` | CI: build, sign, publish the `latest` release |
| `docs/screenshots/` | README screenshots |

## Invariants — never break these

### Filtering and child safety
1. **Nothing reaches the screen unfiltered.** Every video from any source (InnerTube search, "up next", Data API search, channel uploads, history, subscriptions) goes through `videoDetails()` (Data API: tags, `madeForKids`, duration, embeddable) and then `blockReason()` / `allowed()` before it is rendered or played. Never render InnerTube results directly — `InnerTube.java` deliberately returns only IDs.
2. **New content sources must use the same path**: get IDs → `videoDetails()` → `allowed()`. Autoplay-next (`playNext`) must also skip blocked videos.
3. **Blocked channels can't be opened** (`openChannel` checks `channelBlocked`). Blocked search queries are not sent to YouTube at all (`queryBlocked`).
4. **The child can't leave the app through YouTube**: the main WebView never navigates away from `app.kidstube.tv` (`shouldOverrideUrlLoading`), the player has `controls: 0`, `rel: 0`, `iv_load_policy: 3` and `pointer-events: none` on the iframe. Don't add links to youtube.com in the TV UI.
5. **Parent actions require the PIN**: TV settings, the parent menu (long-press OK), and **every** `SettingsServer` endpoint except serving `remote.html` (`checkPin`, lockout after 5 wrong tries).
6. **The YouTube Data API key is mandatory** (owner's decision). Don't make filtering work "without a key" by dropping the tag / made-for-kids checks.
7. InnerTube requests are sent with Restricted Mode (`enableSafetyMode`); the Data API fallback uses `safeSearch=strict`.

### Settings
8. The settings schema is owned by `DEFAULTS` in `app.js`. A new setting must be added **in all of**: `DEFAULTS`, the TV form (`FIELDS`), the phone page (`remote.html`: markup, `fill()`, save handler), both languages of both string tables. **Every setting and every parent action must be available from the phone page** (owner's requirement).
9. Settings must stay backward compatible: missing keys fall back to `DEFAULTS`; never rename or reinterpret an existing key — add a new one. Backups (`/api/backup`, format 1) must keep restoring.
10. Settings, history and the search log are **per Android user** (a Google TV kids profile is a separate user). Don't assume one data directory.

### Interface
11. **Two languages, English is the default.** No user-visible text in code: TV strings go to `i18n.js` (`t('key')`), phone strings to `STR` in `remote.html`, native strings through `Store.tr(context, en, ru)`. Always update **both** languages in the same change.
12. **Icons come only from the Material Symbols Rounded sprite** at the top of `index.html` (Apache 2.0, generated from the official `@material-symbols/svg-400` package, filled style). Use `icon('name')` in JS / `<svg><use href="#i-name"/></svg>` in markup. **No emoji, no text glyphs (→ ◀ ▶ ▼ ✓ ⭐) and no hand-drawn SVG as icons** — they render differently or not at all on TV boxes. To add an icon, take it from the same package (`viewBox="0 -960 960 960"`, single path) and add a `<symbol id="i-…">`. The phone page has its own small sprite with the same rules.
13. **Two styles** — `kids` (default) and `teen` ("6+"). Style differences live only in CSS (`body.theme-teen …`, CSS variables), never in separate markup or logic. Check both styles after any UI change.
14. **TV layout rules** (Android TV / Fire TV guidelines): 960×540 dp canvas (`1rem` = 16 dp), safe area 48 dp sides / 27 dp top-bottom, everything reachable with the D-pad, one clear focus state (`.focused`), up/down between rows and left/right within a row, rows remember their last focused card, Back goes to the side menu before leaving the app.
15. **Text input goes through the native dialog** (`Native.promptText` → `MainActivity.showTextDialog`). The WebView does not reliably open the on-screen keyboard on Android TV; don't rely on focusing HTML inputs on the device.
16. Keep the web code ES5-compatible (no arrow functions, `let/const`, template literals, `?.`) — Android TV boxes may ship an old System WebView. No build step and no runtime dependencies from CDNs: everything is in `assets/web`.

### Native code and build
17. `minSdk 21`, Java 8 source level, **no third-party libraries** (only the Android SDK and `org.json`). Keep the APK dependency-free.
18. **The signing key is never committed.** CI restores it from the `KEYSTORE_BASE64` / `KEYSTORE_PASSWORD` secrets (alias `kidstube`). Never replace the key: devices would refuse the update and need a reinstall. `*.jks` and `*.keystore` are git-ignored; keep it that way. History must not contain secrets.
19. **In-app updates depend on the release format**: the `latest` release must contain the `KidsTube.apk` asset and a line `versionCode: N` in its notes; the repository (or at least its releases) must be public; the repo is hard-coded in `Updater.REPO`.

## Versioning

The version has **one source: `version.properties`** (`VERSION_NAME=MAJOR.MINOR.PATCH`). Gradle and CI read it from there; never hard-code a version anywhere else.

- `versionCode = MAJOR*10000 + MINOR*100 + PATCH`, so `MINOR` and `PATCH` must stay below 100 (Gradle fails otherwise). `versionCode` must only ever grow — Android won't install a lower one over a higher one.
- Bump the version **in the same commit** as the change you want to release:
  - **PATCH** (`1.10.0 → 1.10.1`) — bug fixes, text and visual fixes without new behaviour;
  - **MINOR** (`1.10.1 → 1.11.0`, PATCH resets to 0) — new features or settings, new screens, behaviour changes that stay compatible;
  - **MAJOR** (`1.x → 2.0.0`) — anything that needs the user to act or breaks compatibility: a new signing key (reinstall), an incompatible settings or backup format, raising `minSdk`.
- Commits that shouldn't reach users (docs, README, refactoring without behaviour change, CI tweaks) **don't change the version**.
- CI builds every push to `main`, but publishes the `latest` release **only if the versionCode is higher than the published one**. Forgetting to bump the version means the change is built but not delivered.
- One release per version: if a published version has a problem, release the next PATCH — don't republish the same number.

History note: up to 1.9.10 the PATCH number was the global CI run counter (`run_number`) and MINOR was bumped by hand, which produced jumps like 1.4.2 → 1.5.5 → 1.6.6 → 1.9.10 and a new version for every push, including docs-only ones. 1.10.0 is the first version from `version.properties`; its versionCode (11000) is above the old ones (≤ 110), so updates keep working.

## Checking a change

There is no device or emulator in CI, so:
1. **Web UI**: open `assets/web/index.html` in headless Chromium (Playwright) with a stub `window.Android` (settings, history, `innertube`, `promptText`, `checkUpdate`) and with `https://www.googleapis.com/**` and `https://www.youtube.com/iframe_api` routed to fixtures. Drive it with `kt.key('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'longok')`. Check both languages and both styles, and that the page throws no errors. Without `window.Android` the page falls back to a desktop stub and keyboard arrows work.
2. **Phone page**: open `remote.html` at phone size (390×844) and route `/api/*` to fixtures.
3. **InnerTube parsing**: `InnerTube.extract()` must still find IDs and the continuation token in real recorded responses (NewPipe Extractor's mock files are a good source: `youtubesearchextractor/videos`, `youtubestreamextractordefault/*` "next").
4. **Native code**: `gradle :app:assembleRelease` must build; CI does this on every push.
5. Say clearly what was verified only in a browser and what still needs a real TV box.

## Docs, commits, releases

- Keep `README.md` and `README.ru.md` in sync; refresh `docs/screenshots/` when the UI visibly changes (both styles where relevant). Screenshots use demo content, not real YouTube videos.
- Commit messages in English: a short summary line, then what and why.
- Push to `main`; CI does the rest. A release that fails CI must be fixed with a new PATCH version.
