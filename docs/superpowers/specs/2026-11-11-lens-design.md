# Lens — pictures in the chat

A new `occam` skill, `lens`, that shows a result as a picture inline in the
Claude Code chat. It draws UI prototypes, charts, layouts, dense concepts and
Mermaid diagrams. A Claude Code mod in occam draws the picture under a tool
call with the kitty graphics protocol. A local page renders the picture and
agent-browser takes a screenshot of it.

`lens` replaces the user-level `show-me` skill (`~/.claude/skills/show-me`).
The text views of `show-me` stay in `lens` as text.

## Why

The user does research, analysis and quick prototyping in Claude Code inside
Rex. Claude often answers with tables and numbers where a chart or a mockup
shows the result faster. Today `show-me` writes an HTML file and runs `open`,
which moves the user out of the chat to a browser. The user wants the picture
in the chat, where the answer is.

Success: during build work (plans, designs, brainstorm options) and during
research, Claude shows a sharp, readable picture in the chat when a picture
fits, without a request from the user.

## Evidence from the spike (2026-11-11)

A throwaway mod (`chart-spike`) proved the core path in Rex:

- A mod tool `show_chart` drew a PNG with
  `<Image source={{ file, format: 'png' }} columns={80} rows={18} alt=… />`
  in a `ui.render` hook on `{ component: 'ToolUse' }`. Rex showed the chart
  inline, under the tool row.
- Claude Code draws pictures only for terminals it knows by name.
  `TERM_PROGRAM=rex` is not on its list, so without an override the `alt`
  text shows. `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` turns pictures on. Rex
  draws them correctly with kitty Unicode placeholders.
- The `ToolUse` hook also runs while the tool input still streams. A partial
  input made the engine refuse the tree ("Image source.file must be an
  absolute path"). The hook must draw only when `isRunning` is false and the
  input is complete.

## Goals

- `/lens` and `/occam:lens` work like every other occam skill.
- Claude can send three kinds of source: a json-render spec, custom HTML, or
  Mermaid source. Each one becomes one picture inline in the chat.
- The json-render catalog is the shadcn components plus a chart library.
  It is the default path. Custom HTML is for views the catalog cannot show.
- The picture follows the user's theme: light or dark.
- The picture fills the chat width and stays readable. Its height follows the
  content.
- razor uses `lens` on its own whenever a picture fits, in the build flow and
  in research and analysis.

## Non-goals

- Interaction with the picture in the chat. A still picture is enough. A live
  stream (agent-browser `stream`) is a possible later step, not this one.
- The desktop, VS Code and mobile surfaces. Only the terminal surface has
  `Image`. On other surfaces the tool row shows the `alt` text.
- Terminals without kitty graphics. They show the `alt` text.
- A build step, a bundler or `node_modules` in occam.

## Anti-goals

These make the feature a failure even if it technically works:

- A picture that clashes with the user's theme: a white page in a dark
  terminal.
- Text in the picture too small to read at the chat width.
- A silent failure. When a render breaks, Claude must know it, and the user
  must see why.
- A slow picture that blocks the turn for a long time.
- A browser or a server that stays alive after the session ends.
- Data from the spec or the HTML sent to any host. The page fetches only the
  library code from the CDN.

## Constraints

- occam has no build step and no dependencies (`CLAUDE.md`). Skills are
  Markdown and hooks are plain Node. Keep this rule.
- The page loads its libraries from a CDN through an import map, at exact,
  pinned versions. The user accepts that pictures need the network.
- The page must render with no transpile step: no TSX or JSX source in the
  repo that needs a compiler.
- agent-browser is the renderer. `/proof --setup` already installs it.
  Version 0.41.0 is on the user's machine.
- The mod module follows the Claude Code mod contract: `register(on)`, `$`
  for everything outside the module, no DOM and no Node APIs in the module.
- The release loop in occam `CLAUDE.md` applies: tests pass, version bump in
  `plugin.json` and `marketplace.json`, CHANGELOG entry.

## Decided

### Name and place

- The skill is `lens`, at `skills/lens/`. The user chose the name to match
  the suite.
- Everything lives in the occam repo, not in a sibling plugin. The user
  chose this over a sibling plugin with a build.

### Sources

| Source | Use | Renders with |
|---|---|---|
| json-render spec | default: UI prototypes, dashboards, cards, tables, charts | json-render with the shadcn catalog and the chart components |
| custom HTML | a view the catalog cannot show | the same page shell, theme and fonts |
| Mermaid | flows, sequences, state machines, entity diagrams | Mermaid in the same page shell |

The chart library is Recharts, because the shadcn chart components use it.
That was Claude's call; the user did not object.

### Which views stay text

Pseudocode, call trees, file trees and diffs stay as fenced text in the chat,
as `show-me` shows them now. A picture adds nothing to them.

### Flow

1. The mod registers a tool, for example `lens` (full name
   `mcp__occam__lens`). Claude calls it with the source kind, the source, and
   an `alt` sentence.
2. The tool makes sure the local page server runs. It starts the server on
   first use in the session.
3. The tool tells agent-browser to load the page with the source, set the
   viewport, wait for the render, and take a screenshot to a PNG file.
4. The tool result gives Claude the picture itself, plus any render errors
   or console errors from the page. Claude looks at every picture. When it
   is blank, clipped, unreadable or wrong, Claude fixes the source and calls
   the tool again. The user chose this, and accepts the image-token cost.
5. The mod's `ToolUse` hook draws the PNG under the tool row. It draws only
   after the call ends and only for a complete input.

### Image source

The mod draws the picture from PNG bytes (`{ png: base64 }`), not from a
file path. A Rex client on another machine (Rex iOS, a remote Rex server)
cannot read this machine's files and draws a blank box for a `file` source.
Bytes are capped at 2 MiB decoded, so the tool lowers the device scale
factor, then the height cap, until the PNG fits. (Claude's call.)

### Product look

A prototype matches the product in the current repo, as `show-me` asks now:
its colours, type, radius and spacing. The tool takes the repo's design
tokens (CSS variables, font, radius) as an optional input. The page shell
applies them to the shadcn components, the Recharts colours and the Mermaid
theme. The skill tells Claude to read the tokens from the repo (for example
its Tailwind config or global CSS) before the first prototype in a session.
Without tokens, the page uses stock shadcn. The user chose this.

### Theme

The page renders in light or dark to match the user. It sets the shadcn and
Tailwind dark class, the chart colours and the Mermaid theme from one value.

### Viewport

The picture uses the chat width: the mod reads `viewport.columns`. The page
width in CSS pixels is set so that body text stays readable at that size. The
screenshot covers the full height of the content. The `rows` of the `Image`
follow from the picture's aspect ratio and the cell shape.

### razor

razor's rules and its injected digest get one rule: a result that reads
better as a picture (a chart, a UI, a layout, a flow) goes through `lens`.
The rule applies to the build flow and to research and analysis.

Claude's calls about where `lens` fires:

- Only in the main session. A subagent does not render: nobody sees its
  chat. The rule says so, because the digest is also injected at
  SubagentStart.
- When a picture cannot show (no kitty graphics, the env var missing, the
  desktop, VS Code or mobile surface), the tool reports "not shown inline"
  and Claude writes the content as text. The user never gets only an `alt`
  line where a table belongs.
- The tool stays deferred (`isDeferred`), so occam users who never use
  `lens` pay no prompt cost for its schema.

### Setup

`/lens --setup`, like `/proof --setup`, checks agent-browser and tells the
user to add `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` to the `env` of their
Claude Code settings. The README states the same.

## Open risk — prove first

occam's `hooks/hooks.json` holds command hooks under `"hooks"`. A mod names
its module in `hooks/hooks.json` under `"modules"`. It is not yet known
whether one plugin can carry both. The first task of the plan proves this
with a minimal module in occam. If it is not possible, stop and go back to
the user before any other work; the fallback is a sibling plugin in the occam
marketplace.

## Left to the builder

- The tool name and its exact input schema.
- How the tool runs the server and agent-browser (`$.process`, a script in
  `skills/lens/`, or both), and how it stops them at session end.
- The server: plain Node `http`, its port choice, and how it passes the
  source to the page.
- Where the theme value comes from. A suggested order: Claude Code's own
  `theme` setting, then the macOS appearance when that setting is `auto`.
- The CSS pixel width per column, the maximum `rows`, and the device scale
  factor of the screenshot.
- Where PNG files go and when they are deleted.
- How the tool knows a picture cannot show, and the exact token input shape.
- How the shadcn components load with no transpile step, for example a
  json-render shadcn package from the CDN, or components written as plain
  JavaScript with `htm`.
- The wording of the razor rule and of the `lens` skill body.
- The tests: plain `node --test` for the server and the pure parts, and
  `claude plugin test` for the mod.
