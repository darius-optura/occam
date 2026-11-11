// Pure parts of the lens mod. Runs in the mod environment (no Node) and
// under node --test, so only web globals: atob, JSON.

export type Kind = 'spec' | 'html' | 'mermaid'
export type Theme = 'light' | 'dark'
export type Input = { kind: Kind; source: string; alt: string; tokens: string }
export type Shot = { errors: string[]; clipped: boolean; shot: boolean }

export const KINDS: readonly Kind[] = ['spec', 'html', 'mermaid'];
const COL_PX = 8;
// razor: one cell shape for every font, measure the terminal's cell if pictures look squashed
const CELL_ASPECT = 2.1;
const MAX_COLS = 160;
const MAX_ROWS = 40;
const GUTTER = 4;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function parseInput(input: unknown): Input | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'input must be an object' };
  const raw = input as Record<string, unknown>;
  const { kind, alt, tokens = '' } = raw;
  if (!KINDS.includes(kind as Kind)) return { error: `kind must be one of: ${KINDS.join(', ')}` };
  const source = kind === 'spec' && raw.source && typeof raw.source === 'object' ? JSON.stringify(raw.source) : raw.source;
  if (typeof source !== 'string' || !source.trim()) return { error: 'source must be a non-empty string' };
  if (typeof alt !== 'string' || !alt.trim() || alt.length > 200) return { error: 'alt must be one sentence, 1 to 200 characters' };
  // Tokens land inside a <style>; a "<" could close it.
  if (typeof tokens !== 'string' || tokens.includes('<')) return { error: 'tokens must be a CSS string with no "<"' };
  return { kind: kind as Kind, source, alt, tokens };
}

export function buildPage(
  template: string,
  { kind, source, theme, tokens, width, maxHeight }: Input & { theme: Theme; width: number; maxHeight: number },
): string {
  const config = JSON.stringify({ kind, source, theme, width, maxHeight }).replace(/</g, '\\u003c');
  return template
    .replace('/*LENS_TOKENS*/', () => tokens)
    .replace('/*LENS_CONFIG*/null', () => config)
    .replace('<!--LENS_HTML-->', () => (kind === 'html' ? source : ''));
}

export function layout(columns: number | undefined): { cols: number; width: number; maxHeight: number } {
  const cols = clamp((columns ?? 104) - GUTTER, 40, MAX_COLS);
  return { cols, width: cols * COL_PX, maxHeight: Math.round(MAX_ROWS * COL_PX * CELL_ASPECT) };
}

export function rowsFor(cols: number, pxW: number, pxH: number): number {
  return clamp(Math.round((cols * pxH) / pxW / CELL_ASPECT), 1, MAX_ROWS);
}

export function pngSize(base64: string): { width: number; height: number } {
  const b = atob(base64.slice(0, 32));
  const u32 = (i: number): number => ((b.charCodeAt(i) << 24) | (b.charCodeAt(i + 1) << 16) | (b.charCodeAt(i + 2) << 8) | b.charCodeAt(i + 3)) >>> 0;
  return { width: u32(16), height: u32(20) };
}

// razor: known-terminal list, read an engine capability flag when one exists
export function inlineReason({ force, termProgram, term }: { force?: string; termProgram?: string; term?: string }): string | null {
  if (force === '1' || termProgram === 'ghostty' || term === 'xterm-kitty') return null;
  return 'not shown inline: this terminal is not known to draw pictures. Run /lens --setup.';
}

export function resolveTheme(setting: string | undefined, appleStyle: string): Theme {
  if (setting?.startsWith('dark')) return 'dark';
  if (setting?.startsWith('light')) return 'light';
  return appleStyle.trim() === 'Dark' ? 'dark' : 'light';
}

export const sessionName = (sessionId: string): string => 'lens-' + sessionId.slice(0, 8);

export function batchCommands({ width, scale, theme, url, png }: { width: number; scale: number; theme: Theme; url: string; png: string }): string[][] {
  return [
    ['set', 'viewport', String(width + 32), '900', String(scale)],
    ['set', 'media', theme],
    ['open', url],
    ['wait', '--fn', 'document.documentElement.dataset.lens'],
    ['eval', 'JSON.stringify(window.__lens)'],
    ['screenshot', '#lens', png],
  ];
}

type Step = { command: string[]; success: boolean; error: string | null; result: { result?: unknown } | null }

export function parseBatch(stdout: string): Shot {
  let steps: Step[];
  try {
    steps = JSON.parse(stdout);
  } catch {
    return { errors: [stdout.trim() || 'agent-browser printed nothing'], clipped: false, shot: false };
  }
  const page: { errors: string[]; clipped: boolean } = { errors: [], clipped: false };
  const failed: string[] = [];
  let shot = false;
  for (const s of steps) {
    const verb = s.command[0] ?? '?';
    if (!s.success) failed.push(`${verb}: ${s.error}`);
    else if (verb === 'screenshot') shot = true;
    else if (verb === 'eval' && typeof s.result?.result === 'string') {
      try { Object.assign(page, JSON.parse(s.result.result)); } catch {}
    }
  }
  return { errors: [...page.errors, ...failed], clipped: page.clipped, shot };
}
