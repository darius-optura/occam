import { expect, test } from 'claude-code/testing'

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const OUTPUT = [
  { type: 'text', text: 'shown inline\nclipped: false\nerrors: none' },
  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_1x1 } },
]

const row = (props: Record<string, unknown>) => ({
  plugin: 'occam',
  surface: 'terminal' as const,
  component: 'ToolUse' as const,
  viewport: { columns: 104, rows: 40 },
  props: {
    tool_use_id: 'tu_1',
    tool: 'mcp__occam__lens',
    input: { kind: 'spec', source: '{}', alt: 'p95 by region' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output: OUTPUT,
    ...props,
  } as any,
})

const engine = (on: any) =>
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })

test('a finished call draws its picture under the row', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(row({}))
  const img = await ui.find({ type: 'Image' })
  expect(img?.props.columns).toBe(100)
  expect(img?.props.rows).toBe(40) // a square picture at 100 columns, capped
  expect(img?.props.alt).toBe('p95 by region')
  expect((img?.props.source as any).png).toBe(PNG_1x1)
  expect((await ui.find({ type: 'Text', text: /row/ }))?.text).toBe('row')
  await ui.unmount()
})

test('a running call or one with no picture draws only the row', async ($, on) => {
  engine(on)
  for (const props of [{ isRunning: true }, { output: undefined }, { output: 'agent-browser not found' }]) {
    const ui = await $.ui.mount(row(props))
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    await ui.unmount()
  }
})

test('another tool is left alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(row({ tool: 'Bash' }))
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})
