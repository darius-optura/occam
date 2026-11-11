---
name: lens
description: Show a result as a picture inline in the chat — a chart, a UI prototype or mockup, a dashboard, a layout, or a flow diagram — drawn from a json-render spec, custom HTML, or Mermaid. Keeps pseudocode, call trees, file trees and diffs as text. Use when asked to "show me", "draw", "chart this", "mock up", "prototype", or when a picture reads better than a table. `/lens --setup` checks the renderer and the terminal setting.
argument-hint: "[--setup | what to show]"
---

# Lens

Show the point of the current topic in the smallest view that makes it clear.
Put each view next to the short text it supports. Keep only the calls, files,
props, states and boundaries that answer the current question.

Run in the main session only. A subagent writes text: nobody sees its chat.

## Pick the view

| The point is | View |
|---|---|
| logic or an algorithm | pseudocode, fenced text |
| runtime control flow | call tree, fenced text |
| UI structure | component tree, fenced `tsx` |
| file responsibility or a refactor | shallow file tree, fenced text |
| what changes in a shape that exists | `diff` fence of the tree, call tree or pseudocode |
| a copyable target shape | the whole block, fenced |
| numbers, a trend, a comparison | picture: `"spec"` with a chart |
| a UI, a dashboard, a card, a form | picture: `"spec"` |
| flow, sequence, state machine, entities | picture: `"mermaid"` |
| a view the catalog cannot show | picture: `"html"` |

Text views stay text: a picture adds nothing to them.

```text
on(save)
  if content is unchanged
    return cached result
  write new content
```

```diff
 submitForm
   createSession
+    expandSkillMention
     launchAgent
```

## Draw a picture

Load the tool once with ToolSearch (`select:mcp__occam__lens`), then call it:

```json
{ "kind": "spec", "source": { "root": "…", "elements": { } }, "alt": "One sentence that says what the picture shows." }
```

| Field | Value |
|---|---|
| `kind` | `"spec"` (default), `"mermaid"`, or `"html"` |
| `source` | the spec object, the Mermaid source, or the HTML body |
| `alt` | one sentence; shows where the picture cannot |
| `tokens` | optional: the repo's design tokens as CSS, no `<` |

The page is as wide as the chat and at most about 670 CSS px tall. Body text
is 14 px. Use real labels and real data.

### Product look

Before the first prototype in a session, find the repo's tokens: the global
CSS with the `:root` and `.dark` variable blocks (shadcn names: `--background`,
`--primary`, `--radius`, `--chart-1` … `--chart-5`), an `@theme` block, and a
font `@import` from Google Fonts. Pass them as `tokens`. No tokens in the repo:
omit the field, and the page uses stock shadcn. The page picks light or dark
from the user's Claude Code theme.

### `"spec"` — json-render

A flat tree. Every element names its children by key.

```json
{
  "root": "page",
  "elements": {
    "page": { "type": "Stack", "props": { "direction": "vertical", "gap": "md", "align": "stretch" }, "children": ["kpis", "card"] },
    "kpis": { "type": "Grid", "props": { "columns": 2, "gap": "md" }, "children": ["k1", "k2"] },
    "k1": { "type": "Card", "props": { "title": "p95 latency", "description": "eu-west" }, "children": ["k1v"] },
    "k1v": { "type": "Heading", "props": { "text": "120 ms", "level": "h2" }, "children": [] },
    "k2": { "type": "Card", "props": { "title": "Error rate", "description": "last 24 h" }, "children": ["k2v"] },
    "k2v": { "type": "Heading", "props": { "text": "0.4 %", "level": "h2" }, "children": [] },
    "card": { "type": "Card", "props": { "title": "Latency by region", "description": "ms" }, "children": ["chart"] },
    "chart": { "type": "BarChart", "props": { "x": "region", "series": [{ "key": "p50" }, { "key": "p95" }],
      "data": [{ "region": "eu", "p50": 60, "p95": 120 }, { "region": "us", "p50": 45, "p95": 90 }] }, "children": [] }
  }
}
```

A vertical `Stack` aligns its children to the start. Set `"align": "stretch"`
when the children must fill the width.

Components (shadcn): `Card` (title, description, maxWidth), `Stack`
(direction, gap, align, justify), `Grid` (columns 1–6, gap), `Separator`,
`Tabs`, `Accordion`, `Collapsible`, `Heading` (text, level h1–h4), `Text`
(text, variant body|caption|muted|lead|code), `Badge` (text, variant),
`Alert` (title, message, type info|success|warning|error), `Table` (columns:
header strings, rows: arrays of cell strings, caption), `Progress` (value,
max, label), `Avatar` (name), `Image` (alt; placeholder only), `Skeleton`,
`Spinner`, `Button`, `Link`, `Input`, `Textarea`, `Select`, `Checkbox`,
`Radio`, `Switch`, `Slider`, `Toggle`, `ToggleGroup`, `ButtonGroup`,
`Pagination`, `Dialog`, `Drawer`, `Tooltip`, `Popover`, `DropdownMenu`,
`Carousel`. Every `className` takes Tailwind classes.

Charts (Recharts): `BarChart`, `LineChart`, `AreaChart`, `PieChart`. Props:
`data` (rows of string or number values), `x` (the category key), `series`
(`[{ "key", "label"? }]`, one at least; a pie uses the first), `height` (px,
default 280), `stacked` (bar and area). Colours come from `--chart-1` …
`--chart-5`.

### `"mermaid"`

Plain Mermaid source. The theme follows light or dark.

### `"html"`

A body fragment. Tailwind classes and the shadcn colour names work
(`bg-muted`, `text-muted-foreground`, `border`, `rounded-lg`). Inline
`<script>` runs. Use it only for a view the catalog cannot show: a custom
diagram, an annotated layout, a dense concept. Images must be `data:` URLs;
the page loads nothing else.

## Check every picture

The result gives three lines and the picture itself:

```
shown inline            (or: not shown inline: … Run /lens --setup.)
clipped: false
errors: none            (or: errors: and one line per error)
```

Look at the picture every time. Then:

1. `errors:` lists an error → fix the source and call again.
2. `clipped: true` → the content is taller than the page. Split it into two
   pictures, or make it denser.
3. Blank, unreadable, off-theme, cramped, or not what you meant → fix the
   source and call again.
4. `not shown inline` → the user sees only the `alt` line. Also write the
   content as text: a table, a list, or the fenced view.

## `--setup`

1. Run `command -v agent-browser`. Missing → tell the user to run
   `/proof --setup`, which installs it.
2. Read `~/.claude/settings.json`. When `env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES`
   is not `"1"`, tell the user that Claude Code draws pictures only in
   terminals it knows (Ghostty, kitty), and that Rex and others need:

   ```json
   { "env": { "CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1" } }
   ```

   Ask before you edit the file. The setting applies after a restart.
3. Draw one small chart with the tool to prove the path.
