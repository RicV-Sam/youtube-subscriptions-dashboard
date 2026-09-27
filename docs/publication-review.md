# Publication review — 2026-09-27

## Privacy findings

No personal credentials or account data were identified in the publication candidates reviewed. Checks covered known private environment values from the original local project, the configured personal Git email, local home paths, common credential patterns, email addresses, JSON exports, network destinations, binary assets and commit identity configuration.

The public GitHub handle and repository URL are intentionally present. The repository has no prior commits. Local Git author configuration uses the public handle and GitHub no-reply address. Recheck author/committer metadata at the actual commit step.

The binary icons were inspected and show the React logo. PNG chunk inspection found no text or EXIF metadata in the original PNG icons or the new screenshot. The screenshot was captured from the labelled synthetic demo and visually reviewed; no Google account was connected or personal library imported. Git configuration, generated builds and ignored local audit reports are excluded from publication.

## Validation after the Vite migration

- Clean installation with npm ci succeeded.
- 46 React/API/library/player tests passed under Vitest.
- 11 launcher/lifecycle tests passed, including Vite readiness and rejection of unrelated/old servers.
- One real Vite integration test passed: application/icon serving, intended client-ID exposure, and blocked access to Git configuration and private audit files.
- ESLint and the production build passed.
- Full dependency audit: zero known vulnerabilities (including development dependencies).
- Real browser lifecycle check: two tabs connected; closing one and refreshing the other kept the server running; closing the final tab stopped both dashboard and companion.
- Manual-start adoption also passed: the launcher took over this folder’s npm-started server and stopped it after the last tab closed.
- Synthetic demo: fake sign-in, failed-channel retry, saving to queue and accessibility control worked without console errors. The accessibility result had no detected violations, with colour contrast incomplete; this is not certification.

Real Google sign-in was not exercised in this public-copy review. GitHub Actions has not run remotely. Windows was tested locally; Linux CI is configured but not yet run on GitHub. The batch launcher remains Windows-specific.

## Publication status

Read [maintenance status](maintenance.md) for the dependency result and ongoing limits, and the [GitHub launch checklist](github-launch.md) for proposed topics, security settings, social preview and release steps. Remote settings have not been applied. The source has not been committed or pushed.

Privacy scanning cannot prove the absence of every possible personal detail. Review the final staged snapshot, any later screenshots, commit metadata and GitHub release content at publication time.
