# Contributing

Keep changes focused and describe the problem, resulting behaviour and validation. Discuss major changes in an issue before implementation. No contribution or review turnaround is guaranteed.

1. Fork and clone the repository; use Node.js 24 and `npm ci`.
2. Use `npm run demo` for synthetic UI work. Real sign-in requires your own local OAuth configuration.
3. Preserve read-only YouTube access, account separation, export validation and launcher process-ownership checks.
4. Run `npm run check:privacy`, `npm test`, `npm run test:launcher`, `npm run test:tooling` and `npm run build`.
5. Inspect your staged diff. Include no personal account data, credentials, exports or local paths. Check your Git author email before committing.
6. Open a pull request explaining the change and tests. Mark anything not tested clearly.

Prefer synthetic reproductions. Do not attach personal library backups or recordings of real accounts. Report vulnerabilities as described in SECURITY.md. Participation is subject to CODE_OF_CONDUCT.md; contributions are under the repository's MIT licence.
