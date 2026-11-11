import type { Register } from 'claude-code'
import { batchCommands, buildPage, inlineReason, layout, parseBatch, parseInput, pngSize, resolveTheme, rowsFor, sessionName } from './lens-core.mjs'

const TOOL = 'mcp__occam__lens'
const MAX_PNG_BYTES = 2 * 1024 * 1024

type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }
const imageOf = (output: unknown): string | undefined =>
  Array.isArray(output) ? (output.find((b: any) => b?.type === 'image') as ImageBlock | undefined)?.source?.data : undefined

// The ToolUse hook sees the chat width; tool.call does not. The hook runs while
// the input streams, so the width is known before the call starts.
let lastColumns: number | undefined
let renders = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'lens',
      description:
        'Draw a picture inline in the chat: a json-render spec (shadcn components and charts), custom HTML, or Mermaid. ' +
        'Returns the picture to you, with page errors and a clipped flag. Read the occam lens skill before the first call.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['spec', 'html', 'mermaid'] },
          source: { description: 'The spec (object or JSON string), the HTML body, or the Mermaid source.' },
          alt: { type: 'string', description: 'One sentence that says what the picture shows.' },
          tokens: { type: 'string', description: "The repo's design tokens as CSS (:root and .dark blocks)." },
        },
        required: ['kind', 'source', 'alt'],
      },
    })
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = parseInput(e)
    if ('error' in input) return { deny: input.error }

    const [setting, apple, tmp, force, termProgram, term, sid] = await Promise.all([
      $.settings.read({ key: 'theme' }).catch(() => undefined),
      $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle']).then(r => (r.exitCode === 0 ? r.stdout : ''), () => ''),
      $.env.get('TMPDIR'),
      $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
      $.env.get('TERM_PROGRAM'),
      $.env.get('TERM'),
      $.session.id(),
    ])
    const theme = resolveTheme(typeof setting === 'string' ? setting : undefined, apple)
    const name = sessionName(sid)
    const dir = `${(tmp ?? '/tmp').replace(/\/$/, '')}/occam-lens/${name}`
    const n = ++renders
    const html = `${dir}/${n}.html`
    const png = `${dir}/${n}.png`
    const { width, maxHeight } = layout(lastColumns)
    const template = (await $.fs.read(`${$.plugin.root}/skills/lens/page.html`)) as string
    await $.fs.write(html, buildPage(template, { ...input, theme, width, maxHeight }))

    const shoot = async (scale: number) => {
      const r = await $.process.run(['agent-browser', '--session', name, 'batch', '--json'], {
        stdin: JSON.stringify(batchCommands({ width, scale, theme, url: `file://${html}`, png })),
        timeoutMs: 60000,
      })
      return parseBatch(r.stdout || r.stderr)
    }
    let shot
    try {
      shot = await shoot(2)
    } catch (err) {
      return { deny: `agent-browser failed to start (${String(err)}). Run /lens --setup.` }
    }
    let data = shot.shot ? ((await $.fs.read(png, { as: 'bytes' })) as { base64: string }).base64 : undefined
    if (data && data.length * 0.75 > MAX_PNG_BYTES) {
      shot = await shoot(1)
      data = shot.shot ? ((await $.fs.read(png, { as: 'bytes' })) as { base64: string }).base64 : undefined
    }

    const text = [
      inlineReason({ force, termProgram, term }) ?? 'shown inline',
      `clipped: ${shot.clipped}`,
      shot.errors.length ? ['errors:', ...shot.errors.map(x => `- ${x}`)].join('\n') : 'errors: none',
    ].join('\n')
    if (!data) return { result: `${text}\nno picture: the screenshot failed.` }
    return { result: [{ type: 'text', text }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] } as any
  }).catch(($, e, next) => ({ deny: `lens failed: ${next.error.kind}${next.error.message ? `: ${next.error.message}` : ""}` }))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== TOOL) return next(e)
    if (e.viewport?.columns) lastColumns = e.viewport.columns
    const data = e.props.isRunning ? undefined : imageOf(e.props.output)
    const { Box, Image } = $.ui.resolve(e) as any
    if (!data || !Image) return next(e)
    const { cols } = layout(e.viewport?.columns)
    const { width, height } = pngSize(data)
    const alt = String((e.props.input as { alt?: unknown })?.alt ?? 'lens picture')
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Image source={{ png: data }} columns={cols} rows={rowsFor(cols, width, height)} alt={alt} />
      </Box>
    )
  })

  on('session.end', async ($, e, next) => {
    const name = sessionName(e.sessionId)
    const tmp = (await $.env.get('TMPDIR')) ?? '/tmp'
    await $.process.run(['agent-browser', '--session', name, 'close']).catch(() => {})
    await $.process.run(['rm', '-rf', `${tmp.replace(/\/$/, '')}/occam-lens/${name}`]).catch(() => {})
    return next(e)
  })
}
