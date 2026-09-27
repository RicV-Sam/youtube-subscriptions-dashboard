# Google setup

For real subscriptions, each person running this local app should create their own Google Cloud project and OAuth client. No API key, client secret or shared sign-in service is supplied.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select or create a project.
2. Enable **YouTube Data API v3** in that project.
3. Configure the OAuth consent screen / Google Auth Platform branding and audience. For a personal project in testing, add the Google account you will use as a test user where required. Keep your contact information in Google's console, not this repository.
4. Create an OAuth client with application type **Web application**.
5. Add `http://localhost` and `http://localhost:3000` to **Authorized JavaScript origins**, following Google's localhost guidance. Use `http://localhost:3000` consistently in your browser. Origins have no path or trailing slash.
6. Copy `.env.example` to `.env` and set `REACT_APP_GOOGLE_CLIENT_ID` to your client ID. Do not put a client secret or access token in it. Restart the server after changes.
7. Run `npm start`, then sign in and grant read-only YouTube access.

The app uses the Google Identity Services popup token model through `@react-oauth/google`. It does not implement a server callback or require you to invent a redirect URI. Its requested scope is `https://www.googleapis.com/auth/youtube.readonly`.

A client ID is a browser-visible project identifier, not a client secret. Your personal client ID is nevertheless excluded from this public repository. This Vite setup exposes only `REACT_APP_GOOGLE_CLIENT_ID` from the old setting family. Vite also supports browser-visible `VITE_` variables: never use those for secrets. The local server is fixed to loopback port 3000; it does not move to a different port when occupied.

Google's console labels and consent requirements can change. Consult the official [client ID setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) and [token model guide](https://developers.google.com/identity/oauth2/web/guides/use-token-model). Google documentation also recommends the code model for modern applications in its [YouTube authorization guide](https://developers.google.com/youtube/v3/guides/auth/client-side-web-apps); hosting a shared service warrants a separate authentication review. Do not assume this local setup is a verified public OAuth application.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Sign-in is not configured | Create `.env`, enter your client ID, then restart the server. |
| Origin mismatch | Match the browser's scheme, hostname and port to the authorized origin. `localhost` and `127.0.0.1` are different origins. |
| Access denied / test-user restriction | Check your project's audience, test users and any Workspace administrator restrictions. |
| Popup does not open | Allow popups for this local app and retry from the sign-in button. |
| API disabled or quota exceeded | Check the YouTube Data API settings and quota in your own project. Repeated refreshes consume requests. |
| Connection expired | Use Reconnect Google. This app does not store refresh tokens. |
| Some channels fail | Retry the failed channels. Existing results are retained where available. |
| Video will not embed | Use Open on YouTube. Availability and embed restrictions are controlled by YouTube. |
| Library appears missing | Use the same browser profile, origin and YouTube account. Private browsing and cleared site data affect persistence. |
| Port 3000 / 3010 occupied | Stop the other local dashboard yourself. The Windows launcher refuses to stop an unverified process. |

Never post your `.env`, Google console screenshots, tokens or personal library export when asking for help.
