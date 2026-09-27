# Privacy and data handling

## What this source repository contains

Application source, synthetic tests, documentation and a blank `.env.example`. Personal OAuth configuration, browser profiles, library backups, build output and local review files must not be committed. Ignore rules reduce accidental inclusion; they do not inspect content or make an unsafe staged file safe.

## While using the app

Google handles sign-in and consent. The app requests read-only YouTube access and uses the token to fetch subscriptions and video details. Tokens and fetched metadata stay in the active tab's memory. Sign-out and switching accounts clear the app session; sign-out does not revoke Google's grant.

The app stores local choices in browser localStorage under a key derived from the connected YouTube channel ID: saved/watched/hidden video IDs, favourite channel IDs, groups, timestamps and playback positions. These remain after sign-out. Account separation in the UI is not encryption: someone with access to the same browser profile or scripts running on the same origin may access that storage.

Library exports contain viewing choices and group names. Keep them private even though they omit access tokens and fetched video titles. The clear-library control removes the connected account's saved library. Browser site-data controls can remove the origin's storage. Google account settings manage revocation separately.

## Network connections

Google Identity Services loads for real sign-in. Authorized requests go to the YouTube Data API. Thumbnails load from URLs returned by that API. Opening a player contacts YouTube's privacy-enhanced embed service and IFrame Player API. Google/YouTube have their own data handling and playback policies; local storage does not mean anonymous viewing.

The Windows launcher's companion listens on loopback port 3010 to track open tabs. Its local status response includes the current project directory for ownership checks. That runtime path is not a hardcoded personal path or uploaded repository data. Do not publish status responses or terminal captures showing your filesystem.

## Safe demos and bug reports

Use `npm run demo` in a fresh browser profile. Default fixtures contain invented accounts, channels and videos. Do not import a real library. Do not record real OAuth windows, browser account menus, terminal home paths or personal notifications. The optional live sample still contacts YouTube.

Run `npm run check:privacy` before staging and inspect the final staged diff. Its checks are a guardrail, not a guarantee that every possible personal detail can be detected. Git commit author names and emails are public metadata too; use a public handle and GitHub-provided no-reply address.
