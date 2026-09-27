# Detailed behaviour and local launcher

A local React subscriptions reader with an in-page YouTube player and a personal local library.

For first-time setup, start with [the README](../README.md) and [Google setup](google-setup.md).

## Run

Install dependencies with `npm install` if needed. Set `REACT_APP_GOOGLE_CLIENT_ID` in your local `.env` to your Google OAuth web client ID. Configure the matching localhost origin in your Google project and enable the YouTube Data API. Do not put a client secret in this browser app.

Run `npm start`, or use `start-dashboard.bat`. Open http://localhost:3000 and choose Sign in with Google.

The batch launcher reuses an existing dashboard on port 3000, or starts this folder's server and waits for the current library controls to be available before opening a fresh page. It does not silently move to another port or stop an unrelated app. Use `start-dashboard.bat --check` to verify the server without opening a browser. The library tabs appear above the search filters; Channel group appears after you create a group.

When launched through the batch file, closing the last dashboard tab stops the server after a 10-second grace period. Refreshing or opening another dashboard tab within that period keeps it running. A loopback-only companion on port 3010 tracks browser connections; background tabs remain connected. No Google tokens or library data are sent to it. It only stops the server it started, or an existing process verified as this folder's Vite server. If no dashboard page connects within two minutes, it shuts down. Direct `npm start` remains manually managed.

## Feed behaviour

- Discovers all available subscription pages, 50 subscriptions per request.
- Fetches up to 50 uploads per channel initially, with four concurrent channel workers. Results appear progressively.
- Load older uploads fetches the next page for each channel with more available results. Duplicate video IDs are removed.
- Search, channel and date filters apply only to loaded videos. Missing publication dates are shown as unavailable and excluded from date-limited views. Playlist insertion dates are not used as publication dates.
- Refresh rediscovers subscriptions and reloads the initial page of uploads. Older pages can be loaded again. Successful channels replace their old results; failed channels retain previous results with a warning and a retry action.
- Deleted/private placeholder videos are omitted. Missing thumbnails receive a fallback. Missing upload playlists are reported as unavailable, not silently treated as empty.
- The feed initially renders at most 60 matching cards. Show more loaded videos reveals another 60 without API requests.
- Clicking a video opens one embedded YouTube player in a dialog. Close or Escape stops playback and returns to the feed. A separate Open on YouTube link is available when a video restricts embedded playback.
- Favourite channels, save videos to a queue, and manually mark videos watched. Filter by these local watched marks. These actions do not modify YouTube playlists, subscriptions or watch history.
- Watched videos are hidden by default in every view, including after reconnecting. Marking a video watched removes it immediately from the default view. Choose All videos or Marked watched to see it again, or Undo to restore it.
- The saved queue survives feed refreshes and can include older videos outside the loaded uploads. Saved video details are fetched again on sign-in/refresh, in batches of up to 50. Unavailable videos remain removable placeholders.
- Continue watching resumes unfinished videos at the last locally saved position. The YouTube IFrame API records position every five seconds, on pause and on close. A completed video leaves Continue watching; watched marks remain manual. If player controls are blocked, playback can still work but progress and automatic queue advancement are unavailable.
- Play next in queue follows first-saved order and skips hidden or manually watched videos. Autoplay next is opt-in. The queue order is captured when opening a player; reopen it to include newly saved videos. Saved entries are not automatically removed.
- Channel groups support creation, renaming, membership in multiple groups, removal with Undo, and a group filter.
- Hide video dismisses an item without marking it watched. Restore it from Hidden or use Undo.
- Export library downloads a JSON backup. Import validates and previews the file before merging into the currently connected local library; it never replaces the entire library. Existing groups win ID conflicts and newer playback timestamps win. Backups include viewing choices and group names, so keep them private. Imports are limited to 5 MB; up to 100 groups are supported.
- Undo reverses the latest library action. Local library settings offers a confirmed clear for only the connected account.

## Sign-in and privacy

Sign-in only starts after a click and requests `youtube.readonly`, without including previously granted scopes in the new request. Tokens and video metadata remain in tab memory. Sign-out and account switching cancel requests and clear that session. Sign-out does not sign out of Google itself or revoke previous grants. Older permissions previously granted to this app remain in your Google account until you remove that connection yourself. Reconnect when a token expires.

The local library stores video/channel identifiers, choice timestamps, playback positions and user-created channel groups in browser localStorage, separated by the connected YouTube channel ID. It remains after sign-out and is available again when that account reconnects in the same browser and origin. It does not sync between devices. If identity cannot be established unambiguously, or browser storage is unavailable, the app explains that choices are temporary. Tokens and video titles/thumbnails are never saved to localStorage.

The player uses YouTube privacy-enhanced embeds and the official [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), loaded only after clicking a video. Playback remains subject to YouTube's availability and embedding restrictions. Local watched marks are manual; playing a video does not automatically mark it watched here.

## Validation

- `npm test`: mocked API and UI tests for feed loading/recovery, account isolation, legacy library migration, persistence, validated backup merging, channel groups, hide/restore, saved metadata, player progress, queue transitions and embedded-player lifecycle.
- `npm run build`: production build, including ESLint checks.
- `node scripts/preview-fixture.cjs`: isolated synthetic visual preview on http://localhost:3001. It builds with Vite into the ignored `.preview-build` folder inside this repository and uses fake sign-in plus fake API responses. It does not connect an account to Google. Its banner labels the data as synthetic; one channel deliberately fails once so Retry can be checked. It also has accessibility and 200% text checks. Stop with Ctrl+C.

The fixture entry and auth replacement are used only by the preview script; they are not part of the normal start or production build. Automated tests and fixtures cannot establish that your Google project's consent configuration or real account access works. Verify real sign-in and subscriptions manually before deployment.

The fixture's optional Use live YouTube sample button substitutes YouTube's documentation example video after Refresh feed, allowing a real embed check without connecting an account. Other fixture metadata remains synthetic.
