# GitHub launch checklist

These are proposed publication settings, not a claim that they are already enabled.

## About and discovery

Suggested description:

> Local YouTube subscriptions dashboard: chronological feed, channel groups, saved queue and playback progress. React, read-only YouTube API, browser-local library.

Suggested topics (choose only relevant ones):

`youtube`, `youtube-subscriptions`, `youtube-data-api`, `subscription-manager`, `video-player`, `react`, `javascript`, `local-first`, `self-hosted`, `productivity`

Use the repository's existing descriptive name. Keep the README's purpose, setup instructions and limitations near the top. Add the synthetic screenshot and, once published, the real tutorial URL. Link the repository from the video's description and relevant project/profile pages; do not invent a tutorial URL or add unrelated keywords. Topics support discovery but cannot guarantee GitHub or search-engine rankings.

## Before the first public push

- Review the final staged file list and diff, including binary assets.
- Run the privacy guard, tests and build. Confirm that no private environment values occur in candidate files.
- Check Git author and committer identity; use the public handle and GitHub-provided no-reply email, not a personal email.
- Confirm MIT licence, setup guide, demo, issue templates and security guidance are present.
- Rerun the dependency audit and review any new findings before launch.
- Use no personal OAuth configuration, exports, generated builds or browser profiles in the commit.

## GitHub settings at publication

- Set the description and topics above in About.
- Enable private vulnerability reporting and verify the reporting option before advertising it as available.
- Review secret scanning / push protection and dependency alerts available for the repository.
- Wait for the Checks workflow to pass on both platforms. Local success is not proof of GitHub CI success.
- Consider protecting main after the first successful workflow run; require review/checks as appropriate for the maintainer's workflow.
- Add a social preview using synthetic UI only. The screenshot should show the product, not a real Google account.
- Create a first release with tested setup instructions, known limitations and dependency status; no unsupported popularity or security claims.

## Follow-through

Keep setup instructions working, respond to reproducible issues when able, review dependency updates, and publish useful releases. Add the tutorial link after the video exists. These make the repository more useful and credible; they do not guarantee traffic or stars.

References: [GitHub READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes), [repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics).
