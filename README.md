# claude-mods

Keith's Claude Code mods. Each one is a small hooks module; install the ones you want.

| Mod | What it does |
| --- | --- |
| `usage-band` | Band above the prompt: 7-day and 5-hour limits with % left and reset time, prompt-cache warm/cold timer, tokens in context, and what the next message costs on Fable, Opus, Sonnet and Haiku (your model highlighted). `/usage-band` shows or hides it. Terminal and desktop app. |
| `cache-alarm` | Pop-up 50 minutes after Claude's last reply: the prompt cache goes cold in 10 minutes. |
| `limit-alarm` | Pop-up when the 5-hour or 7-day limit passes 80% and again at 95%. |
| `push-gate` | Before `git push` to main, runs `.claude/pre-push.sh` if the repo has one, else (repos with `scripts/check-client.sh`) `tsc --noEmit`, `vitest run` and the client-script scan; blocks the push if any fail. |
| `deploy-watch` | After a push to main of `sst-coaching-connector`, polls `/app/api/version` and says when the new build is live. |

## Install

At the prompt of a terminal session:

```
/plugin install usage-band --marketplace srslystrng/claude-mods
/plugin install cache-alarm --marketplace srslystrng/claude-mods
/plugin install limit-alarm --marketplace srslystrng/claude-mods
/plugin install push-gate --marketplace srslystrng/claude-mods
/plugin install deploy-watch --marketplace srslystrng/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope.

From a shell: `claude plugin install <mod> --marketplace srslystrng/claude-mods`

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `srslystrng/claude-mods`, then Add plugin.

This repository is private: installing needs read access on GitHub and a git credential for github.com on that machine (an SSH key, or `gh auth login` then `gh auth setup-git`).
