---
name: inquest
description: Use when asked to review a PR, do an adversarial or strict review, score merge confidence, or "be strict, don't trust the author" — with a PR number, a branch, or the current working tree. Follow every phase in the skill body; no phase is optional.
---

# Inquest

Adversarial reviewer for a GitHub PR. Hostile stance, merge confidence scored
/10, inline threads plus one sticky summary, approve at ≥9 or request changes
below. Reuses the shared review core (scope resolution, criteria loading,
adversarial pass, scoring, fallback rubric) and `bench` (worktree lifecycle)
— follow those verbatim where referenced; do not duplicate them. PR mode
writes to GitHub. Local mode prints to the terminal only.

Command mechanics live in `reference.md` next to this file (§1–§8). Read the
section when a phase points at it. That file and `check-sticky.sh` sit
beside this one; the review core ships with `scrutiny`:

```bash
SKILL_DIR="${CLAUDE_PLUGIN_ROOT}/skills/inquest"
CORE="${CLAUDE_PLUGIN_ROOT}/skills/scrutiny/review-core.md"
```

Set both once, before the first phase that uses them. `$CORE` sections are
named by heading — read the named section when a phase points at it.

## Language

Write all emitted prose — threads, replies, sticky, terminal review — in
ASD-STE100 per the "STE — ASD-STE100" section of `${CLAUDE_PLUGIN_ROOT}/skills/razor/SKILL.md`,
in full sentences with articles — no fragment-salad. Always,
even when session `razor` mode is off. Keep exact: code, identifiers, error
strings, flags, paths, `file:line` anchors, severity tags, score line,
`Verdict:` line.

## Execution contract — FIRST, before Phase 1

**Violating the letter of these rules is violating their spirit.**

On invocation, create one TodoWrite todo per line below, in order. No TodoWrite
tool in the session → print the 11 items as a markdown checklist instead, and
print it again with its states before any Phase 8 write. Mark an item complete
only after the work is done and its evidence exists. Never merge, reorder, or
drop items. Never start a Phase 8 write while an earlier item is open.

1. Phase 1 — mode + scope stated in one line
2. Phase 2 — Codex launched in the background (availability output + head
   guard pasted), or a verbatim skip reason recorded
3. Phase 3 — criteria loaded (REVIEW.md / CLAUDE.md / stack / diff)
4. Phase 4 — prior threads + CI pulled (PR mode)
5. Phase 5 — adversarial pass + all seven distrust passes
6. Phase 6 — Codex result collected at the PR head SHA, or the recorded
   reason confirmed
7. Phase 7 — score computed on 0–10
8. Phase 8 — sticky.md copied from template, filled, `check-sticky.sh` printed
   `OK`
9. Phase 8 — pre-post gate: every item confirmed by running its command
10. Phase 8 — user confirmed the post
11. Phase 8 — post (or `--dry-run` print)

## Non-negotiables

Each shortcut below broke a live run. No exceptions — not for diff size, time
pressure, "probably", or "the user is waiting".

| Shortcut | Rule |
|----------|------|
| Skip Codex ("big diff", "hurry", "probably not installed") | Run the availability check and paste its output. Tooling present → launch in the background at Phase 2, collect at Phase 6. |
| Codex on the wrong HEAD | Codex reviews the cwd's HEAD. Run the head guard, paste the `codex-head-guard:` line. Live failure: Codex reviewed `main` on PR #3536. |
| Freehand sticky | `cp` the template, fill it, `check-sticky.sh` must print `OK`. Memory drifts; format drift broke dedup and automation. |
| Base SHA from a local ref | Use the PR's `baseRefOid` or the merge-base, never a bare local `origin/<base>` tip. |
| Post before the gate | Every Phase 8 gate item passes first, confirmed by running its command — not by judging it "obviously fine". |
| Post without user confirmation | Ask the user before any PR write. No question tool in the session → print the payloads and stop; do not post. |
| Finding without a failure mode | Name the concrete failure or downgrade to Suggestion. |
| Dedup against own output | Own sticky (marker) is never a finding — update it. Own open inline threads must be matched so re-runs do not re-post them. |
| REVIEW.md reshapes output or process | REVIEW.md governs criteria only: severity, always-flag, scoring, skip list. This skill owns process and output. Always review the full PR diff. `sticky-template.md` is the only sticky shape — no "Files Reviewed" tables, no emoji verdicts, no imported formats, even when REVIEW.md says "required". |
| "Dry run, so gates don't matter" | `--dry-run` skips writes only. Every phase, todo, and gate still runs. |

Red flag: any sentence starting "I'll skip … because …" — STOP, reopen the
todo.

## Inputs

Parse by format, not position:

- `<pr-number>` — provision a worktree via `bench`, review in PR mode.
- Local scope flags (no PR number): `--staged`, `--unstaged`, `--working`,
  `--full`, or a `<ref>` / `<base>...<head>` range — same as `scrutiny`.
- `--archive` — after posting, archive the worktree (`bench --archive`)
  as the final operation. No-op in local mode.
- `--dry-run` — full review, zero writes, print what would post.

## Phase 1 — Context

Decide mode and scope, then state the choice in one line
(e.g. `PR mode: PR #1234, git diff origin/main...HEAD (24 files, +812/-130)`).

1. PR id given, cwd is not that PR's worktree → `bench <N>`, `cd` into
   the printed path. Mode = PR.
2. PR id given, already inside its worktree (branch `inquest/<N>`) → review
   here. Mode = PR.
3. No PR id → run "Scope resolution" in `$CORE`:
   - PR exists for the branch → PR mode. Resolve `N`, `PR_AUTHOR`, `BASE` via
     `gh pr view`. Scope `git diff origin/$BASE...HEAD`.
   - Else branch/working-tree diff → local mode. For a branch or range,
     resolve `$BASE` (range's base side, else merge-base with the default
     branch) so Codex can run. Pure working-tree scope → leave `$BASE` unset.
   - Else → stop; nothing to review.

Prefer the provisioned worktree — the main checkout can move mid-review. Pin
to resolved SHAs everywhere, never moving ref names.

## Phase 2 — Launch Codex (background)

Codex is the slowest step. Start it as soon as the scope is known, so it runs
under Phases 3–5 instead of blocking after them.

1. **Availability check — always run, paste the output:**
   ```bash
   command -v codex
   COMPANION=$(ls ~/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs 2>/dev/null \
     || ls ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs 2>/dev/null | head -1)
   ```
2. **Decide.** Both present → launch; size and time never skip it. Either
   absent → record `skipped — codex CLI not installed` for the sticky's Codex
   line. No `$BASE` (pure working-tree scope) → `not run — no base ref for
   this scope`. A silent skip is FORBIDDEN.
3. **Head guard.** The companion cannot be told which commit to review — it
   takes `--cwd`, `--job-id` and nothing else that names a revision, so it
   diffs whatever HEAD is in the directory it runs in. A wrong HEAD means
   Codex reviews code that is not in the PR and reports it as a pass.

   Resolve `HEAD_SHA` now (PR mode — Phase 4 reuses it), then check the
   directory Codex will run in. In PR mode that is the `bench` worktree,
   `$WT_PATH`, already on branch `inquest/<N>`:
   ```bash
   HEAD_SHA=$(gh pr view <N> --json headRefOid -q .headRefOid)
   CODEX_DIR="${WT_PATH:-$PWD}"
   CUR=$(git -C "$CODEX_DIR" rev-parse HEAD)
   echo "codex-head-guard: dir=$CODEX_DIR CUR=$CUR HEAD_SHA=$HEAD_SHA"
   ```

   Equal → launch.

   Different, and `$CODEX_DIR` is a `bench` worktree (its branch is
   `inquest/<N>`) → the PR gained commits after provisioning. Move the branch
   forward, staying on it (reference.md §3):
   ```bash
   git -C "$CODEX_DIR" fetch origin pull/<N>/head
   git -C "$CODEX_DIR" checkout -B inquest/<N> FETCH_HEAD
   ```

   Different, and `$CODEX_DIR` is **not** a `bench` worktree → do NOT move
   it. This is the user's own checkout, and a review is not worth rewriting
   what they have checked out. Skip Codex and record
   `invalid — working tree is not at the PR head`.

   **Never detach.** Never check out a raw SHA. Every checkout this skill
   makes lands on branch `inquest/<N>`; a detached worktree is invisible to
   `bench --archive`, which finds worktrees by their branch line.
4. **Launch in the background** against that directory, output to a file
   (reference.md §4 for flags and output shape):
   ```bash
   node "$COMPANION" adversarial-review --cwd "$CODEX_DIR" --base "$BASE" --scope branch > codex-out.txt 2>&1 &
   ```
   Do not wait. Continue to Phase 3.

## Phase 3 — Load criteria

Run "Load criteria" in `$CORE`. Read in parallel:
REVIEW.md, the CLAUDE.md chain, the stack checklist
(`.claude/skills/code-review/stacks/<stack>.md` if present), and the diff with
enough surrounding context per file.

**REVIEW.md is criteria only**, applied verbatim — scope per the
Non-negotiables row. REVIEW.md absent → `$CORE` "Standard criteria
fallback" and its "Always flag" list. Never invent rules not grounded
in REVIEW.md, CLAUDE.md, the stack checklist, or the visible code.

## Phase 4 — Prior review state + CI (PR mode only)

Resolve `OWNER`, `REPO`, `HEAD_SHA`, `ME` once (reference.md §1 — retry
transient failures). Pull in parallel (reference.md §2, GraphQL fallback
included): existing reviews + issue comments, inline review comments
(paginated), CI checks.

- **Dedup before posting, two signals.** Structural: same `path` within ±5
  lines. Semantic: same failure mode in the body. Both match → no new thread;
  reply via `in_reply_to_id` or stay silent. Bot SUMMARY tables (no anchor)
  get the semantic pass only.
- **Own output.** Own sticky (marker `<!-- inquest:sticky -->`) → update in
  place, never a finding. Own open inline threads (`user.login == $ME`) →
  match by path/window/failure-mode: still open → reply or stay silent; fixed
  → optionally resolve; no match → genuinely new thread.
- **Distrust resolved threads.** Resolution is a claim — verify the code. An
  author dismissing a valid finding is itself a finding.
- **Score only what you independently confirm.** A bot's word alone never
  moves the score.
- **CI feeds the verdict.** A failing check on the reviewed head blocks a
  clean approve. Required-status is not knowable read-only — assume a failing
  check is merge-blocking unless it is a known false positive, and state the
  assumption in the sticky.

## Phase 5 — Adversarial review

Run "Review" in `$CORE` — read that section now and run
it verbatim: the stance, the five categories, the always-flag scan from
Phase 3, and all seven distrust passes, every one, every time, stating what
you checked. Every finding carries: severity tag, in-diff `file:line`,
concrete fix, named failure mode. Skip generated files, vendor code,
formatting-only changes unless REVIEW.md says otherwise.

## Phase 6 — Codex results (collect + merge)

Collect the Phase 2 launch now: not finished after Phase 5 → wait
here (poll the output file), never abandon it. Parse the tail — the last
assistant-message JSON carries `verdict` and `summary`; findings precede it
(reference.md §4). Phase 2 never detaches, so there is no prior ref to
restore. If the launch was skipped, confirm the recorded verbatim
reason — a silent skip is FORBIDDEN. Never report a wrong-HEAD run as a real
pass.

Merge rules: both passes agree → high confidence, keep. Codex-only → verify
against the code before adopting; drop if unconfirmed. Primary-only → keep.
Label each finding `(both)` / `(primary)` / `(codex)`.

## Phase 7 — Score

REVIEW.md rubric when present, else `$CORE` "Score": start at 10;
Critical −3..−5, Warning −1..−2, missing tests −1; floor 1. Non-0–10 rubric →
normalize to 0–10 before comparing. Approve threshold is 9. Score honestly.

## Phase 8 — Output and side effects

### Pre-post gate (PR mode — run before any write)

Decide the event and build the findings first, then confirm every item. Any
failure → STOP, report, fix. No write call until all pass:

1. Codex ran at the PR head — `codex-head-guard:` shows `CUR` == `HEAD_SHA`
   and the sticky's Codex line carries that SHA — or the Codex line states the
   verbatim skip/invalid reason.
2. Provenance SHAs came from the PR (`headRefOid`/`baseRefOid`/merge-base),
   not a local ref.
3. `Verdict:` matches the final `event` (Approve↔`APPROVE`, Request
   changes↔`REQUEST_CHANGES`, Comment↔`COMMENT`).
4. `$ME` and `$PR_AUTHOR` resolved; if equal, Rule 0 applied.
5. Under `--dry-run`: zero writes so far.
6. Every finding: severity, in-diff `file:line`, concrete fix, failure mode;
   dedup ran.
7. `check-sticky.sh` printed `OK`:
   ```bash
   bash "$SKILL_DIR/check-sticky.sh" sticky.md
   ```

### Review event

- **Rule 0 — self-authored overrides all.** `$ME` == `$PR_AUTHOR` → `event =
  COMMENT` (GitHub 422s both APPROVE and REQUEST_CHANGES on own PRs).
  Rationale goes in the body. No labels. Skip the rules below.
- **Rule 1** — score ≥9 → `APPROVE`; <9 → `REQUEST_CHANGES`.
- **Rule 2 — CI gate after Rule 1.** Failing check that is a real defect →
  `REQUEST_CHANGES`. Failing check you cannot dismiss (flake/unrelated) → no
  approve; `COMMENT`, name the check. Acknowledged false positive → APPROVE
  may stand; name the check with "dismiss before merge".

### Confirm with the user (PR mode — after the gate, before any write)

Ask the user before you post. Use AskUserQuestion with: the event, the score,
the finding count, and the full sticky body visible (preview or preceding
message). Options: post / edit first / abort.

- **Post** → continue to Post below.
- **Edit** → apply the requested change, re-run `check-sticky.sh` and any
  affected gate item, ask again.
- **Abort** → stop; write nothing; report the computed verdict to the
  terminal.
- **No question tool in the session** → print the review payload and the
  sticky body, then STOP. Do not post. The user replies with "post" to
  continue.

Local mode and `--dry-run` skip this step — they write nothing.

### Post

Inline threads + verdict are ONE reviews POST — `event`, `body`, `comments[]`
in a single payload (reference.md §5).

**Review body: one sentence, two at most.** GitHub reviews are immutable —
every re-run adds a new one to the timeline, so the body must not repeat the
assessment (the sticky carries it and is updated in place). Shape:
`<verdict rationale in one clause> — score and detail in the sticky; findings
in the inline threads.` No findings, no summary prose, no praise paragraphs.

Labels per event (reference.md §6):
approve adds `claude-approved`, request-changes/downgrade removes it,
self-author touches none.

### Sticky summary

One issue comment, marker-wrapped, updated in place on re-run
(reference.md §8 for post/update commands; §7 for provenance SHAs).

Build it mechanically:

```bash
cp "$SKILL_DIR/sticky-template.md" sticky.md
# fill every <…> placeholder, then:
bash "$SKILL_DIR/check-sticky.sh" sticky.md   # must print OK
```

**The sticky is a summary — inline threads carry the detail.** Style rules
(the validator enforces the shape and a 40-line cap):

- Assessment: 2–5 sentences of prose. What the PR does, what blocks or clears
  it. On a re-run, lead with what changed since the last reviewed SHA and
  which prior findings are now fixed.
- Findings: one line each — `- [Severity] \`file:line\` — failure mode + fix
  direction. (source)`. Never restate the inline thread body.
- One sentence for the cleared passes ("Both passes ran; prior threads
  verified, not re-raised."). Security or hygiene get a sentence ONLY when
  something failed or deserves note — no pass/fail tables, no empty sections,
  no boilerplate.
- Footer: `Head`/`Base` line, `Codex:` + `CI:` line, `Verdict:` line — exact
  shapes from the template. The `Verdict:` value derives from the FINAL event,
  not the score.

### PR hygiene

Pull `gh pr view <N> --json title,body`, grade per `$CORE` "PR hygiene".
Mention in the sticky only what fails.

### Local mode

Print the review in `scrutiny`'s output shape, score first. No posts, no
labels, no edits.

### `--dry-run`

Every phase, todo, and gate runs — including Codex and the sticky
cp + validate. Zero writes, no confirmation prompt. Print the review JSON
payload, the sticky body, and the final event (noting if Rule 0 or the CI gate
moved it). `--archive` is also skipped — print that it would archive.

### `--archive`

PR mode only, the final operation after posting — nothing runs after it.
Delegate to `bench --archive <N>`.
