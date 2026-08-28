<!-- inquest:sticky -->
### Merge confidence: <N>/10

<Assessment prose, 2-5 sentences: what the PR does, what blocks or clears it. On a re-run: what changed since the last reviewed SHA and which prior findings are now fixed. No headings, no boilerplate.>

<Findings, only when findings exist — one line each:
- [Warning] `file:line` — one-sentence failure mode and fix direction. (source)>

<One sentence: passes ran, prior threads verified and not re-raised. Add security or hygiene notes ONLY when something failed or deserves note.>

Head `<HEAD_SHA>` · Base `<BASE_BRANCH>` @ `<BASE_SHA>`
Codex: <ran at `CODEX_HEAD_SHA` — verdict | skipped — codex CLI not installed | not run — no base ref for this scope | invalid — could not check out the PR head> · CI: <one line: states + blocking checks>
Verdict: **<Approve | Request changes | Comment (not approved)>** — <blocking reason, or "no blockers">
