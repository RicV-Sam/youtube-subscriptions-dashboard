# Maintenance status

Reviewed on 2026-11-01 with npm 11.19.1 and Node.js 24.22.2.

## Current result

The current lockfile reports **zero known vulnerabilities** in `npm audit` across all dependencies, including development packages. The November maintenance refresh updates Vite to 8.3.5, Vitest to 5.0.5 and ESLint to 10.14.0, and refreshes affected transitive packages including source-map-js, Zod and Undici. It also integrates the pending Dependabot library and GitHub Actions updates.

ESLint 10.14.0 and `@eslint/config-array` still request minimatch 10, which is affected by [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Scoped overrides select minimatch 11.0.1 for these two consumers. This crosses a major version boundary: tooling tests verify that JSX and script files are linted and generated output stays ignored. Remove the overrides when compatible upstream releases request a patched minimatch version. No forced audit fix or ESLint downgrade was used.

The September migration from Create React App to Vite, Vitest and explicit ESLint tooling eliminated the earlier 28 findings without overrides. The November overrides are a separate maintenance measure for newly reported advisories.

This is a point-in-time dependency advisory result, not proof that the application has no security defects. Run `npm audit` after installation and before publication. CI includes the audit; new advisories can make a previously passing revision fail later. Dependabot is configured for reviewable updates.

## Tooling and compatibility

- Use Node.js 24.15.0 or newer within the Node.js 24 release line, preferably its latest patched release. jsdom 30.1.1 requires this minimum for Node.js 24. `.nvmrc` continues to select the Node.js 24 release line; CI installs with engine requirements enforced.
- Vite serves the development app on loopback port 3000 and builds to `build/`.
- `npm test` runs the migrated Vitest suite once; `npm run test:watch` is interactive.
- `npm run build` runs ESLint before bundling. `npm run test:launcher` covers the launcher/lifecycle logic; `npm run test:tooling` checks real Vite serving and private-file restrictions.
- The existing `REACT_APP_GOOGLE_CLIENT_ID` setting remains supported. No real client ID is included. `.env` is ignored.
- The synthetic demo builds to `.preview-build/` and serves on loopback port 3001. Its optional accessibility engine is loaded on demand and can produce a large-chunk build warning; it is not included in the production app.
- JSX source files now use `.jsx`. Local library keys and the backup format are unchanged.
- Optional performance reporting uses web-vitals 6's `on*` APIs, with INP replacing the retired FID metric. Reporting remains disabled unless a callback is supplied; registration and installed exports are covered by tests.
- The Windows launcher checks the Vite entry/modules and verifies the absolute server script path before adopting a process. Ports remain fixed; unrelated occupants are not stopped.

The React team [deprecated Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app). The replacement follows [Vite's JavaScript API](https://vite.dev/guide/api-javascript) and [Vitest's migration guidance](https://vitest.dev/guide/migration/).

## Remaining limits

Keep the development server local. This repository is not a hosted multi-user service. Google OAuth consent configuration and real account access still need checking with the installer's own project. Browser tests and dependency audits do not establish Google verification or production-hosting readiness.
