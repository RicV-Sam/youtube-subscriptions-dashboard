# Maintenance status

Reviewed on 2026-09-27 with npm 11.1.0 and Node.js 24.11.0.

## Current result

The migrated lockfile reports **zero known vulnerabilities** in `npm audit` across all dependencies, including development packages. The earlier 28 findings were eliminated by replacing the Create React App build/test dependency tree with Vite, Vitest and explicit ESLint tooling. No forced audit fixes or dependency overrides were used for this migration.

This is a point-in-time dependency advisory result, not proof that the application has no security defects. Run `npm audit` after installation and before publication. CI includes the audit; new advisories can make a previously passing revision fail later. Dependabot is configured for reviewable updates.

## Tooling and compatibility

- Vite serves the development app on loopback port 3000 and builds to `build/`.
- `npm test` runs the migrated Vitest suite once; `npm run test:watch` is interactive.
- `npm run build` runs ESLint before bundling. `npm run test:launcher` covers the launcher/lifecycle logic; `npm run test:tooling` checks real Vite serving and private-file restrictions.
- The existing `REACT_APP_GOOGLE_CLIENT_ID` setting remains supported. No real client ID is included. `.env` is ignored.
- The synthetic demo builds to `.preview-build/` and serves on loopback port 3001. Its optional accessibility engine is loaded on demand and can produce a large-chunk build warning; it is not included in the production app.
- JSX source files now use `.jsx`. Local library keys and the backup format are unchanged.
- The Windows launcher checks the Vite entry/modules and verifies the absolute server script path before adopting a process. Ports remain fixed; unrelated occupants are not stopped.

The React team [deprecated Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app). The replacement follows [Vite's JavaScript API](https://vite.dev/guide/api-javascript) and [Vitest's migration guidance](https://vitest.dev/guide/migration/).

## Remaining limits

Keep the development server local. This repository is not a hosted multi-user service. Google OAuth consent configuration and real account access still need checking with the installer's own project. Browser tests and dependency audits do not establish Google verification or production-hosting readiness.
