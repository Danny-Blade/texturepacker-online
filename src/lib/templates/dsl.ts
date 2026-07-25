/**
 * Sandboxed Mustache-like template DSL for custom exporters.
 *
 * The parser produces a plain AST which the renderer walks with pure JS —
 * no `eval`, no `new Function`, no host access. This keeps the "user provides
 * template text" surface area small and inspectable.
 *
 * Supported syntax:
 *   {{name}}           — output an HTML-escaped variable
 *   {{{name}}}         — output an unescaped variable
 *   {{#section}}...{{/section}}  — iterate array / enter object / branch on truthy
 *   {{^section}}...{{/section}}  — inverted section (render on falsy / empty)
 *   {{! comment }}     — comment (not rendered)
 *
 * Dotted paths (`sheet.width`, `sprite.name`) and the loop-body identifier
 * `.` (current item) are both supported.
 */

export interface TemplateContext {
  imageFile: string;
  dataFile: string;
  sheet: { index: number; width: number; height: number };
  sprites: Array<{
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotated: boolean;
    trimmed: boolean;
    sourceSize: { w: number; h: number };
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    polygon?: number[];
  }>;
  meta: { app: string; version: string; scale: number };
}

export interface CompiledTemplate {
  render(ctx: TemplateContext): string;
}

const MAX_SOURCE_LENGTH = 64 * 1024; // 64 KB
const MAX_RENDER_LENGTH = 4 * 1024 * 1024; // 4 MB

type TextNode = { kind: 'text'; value: string };
type VarNode = { kind: 'var'; path: string; escape: boolean; line: number };
type SectionNode = {
  kind: 'section';
  path: string;
  inverted: boolean;
  children: Node[];
  line: number;
};
type Node = TextNode | VarNode | SectionNode;

interface RawToken {
  type: 'text' | 'var' | 'raw' | 'open' | 'inverted' | 'close' | 'comment';
  value: string;
  line: number;
}

function tokenize(source: string): RawToken[] {
  const tokens: RawToken[] = [];
  let i = 0;
  let line = 1;
  while (i < source.length) {
    const openIdx = source.indexOf('{{', i);
    if (openIdx === -1) {
      const rest = source.slice(i);
      if (rest.length > 0) tokens.push({ type: 'text', value: rest, line });
      break;
    }
    if (openIdx > i) {
      const chunk = source.slice(i, openIdx);
      tokens.push({ type: 'text', value: chunk, line });
      for (let k = 0; k < chunk.length; k++) if (chunk.charCodeAt(k) === 10) line++;
    }
    const tagStartLine = line;
    // Detect {{{ ... }}} (raw) — must be handled before the plain {{ path.
    if (source.startsWith('{{{', openIdx)) {
      const rawEnd = source.indexOf('}}}', openIdx + 3);
      if (rawEnd === -1) {
        throw compileError(`Unclosed raw tag at line ${tagStartLine}: {{{...}}}`, tagStartLine);
      }
      const inner = source.slice(openIdx + 3, rawEnd).trim();
      tokens.push({ type: 'raw', value: inner, line: tagStartLine });
      for (let k = openIdx; k < rawEnd + 3; k++) if (source.charCodeAt(k) === 10) line++;
      i = rawEnd + 3;
      continue;
    }
    const close = source.indexOf('}}', openIdx + 2);
    if (close === -1) {
      throw compileError(`Unclosed tag at line ${tagStartLine}: {{...}}`, tagStartLine);
    }
    const rawInner = source.slice(openIdx + 2, close);
    const trimmed = rawInner.trim();
    let type: RawToken['type'];
    let value: string;
    if (trimmed.startsWith('!')) {
      type = 'comment';
      value = trimmed.slice(1).trim();
    } else if (trimmed.startsWith('#')) {
      type = 'open';
      value = trimmed.slice(1).trim();
    } else if (trimmed.startsWith('^')) {
      type = 'inverted';
      value = trimmed.slice(1).trim();
    } else if (trimmed.startsWith('/')) {
      type = 'close';
      value = trimmed.slice(1).trim();
    } else if (trimmed.startsWith('&')) {
      // Mustache-compat: {{& name}} is equivalent to {{{name}}}.
      type = 'raw';
      value = trimmed.slice(1).trim();
    } else {
      type = 'var';
      value = trimmed;
    }
    if (type !== 'comment' && value.length === 0) {
      throw compileError(`Empty tag at line ${tagStartLine}: {{${rawInner}}}`, tagStartLine);
    }
    if (type !== 'comment' && !isValidPath(value)) {
      throw compileError(
        `Invalid identifier "${value}" at line ${tagStartLine}. Use letters, digits, underscore, or "." — no expressions.`,
        tagStartLine,
      );
    }
    tokens.push({ type, value, line: tagStartLine });
    for (let k = openIdx; k < close + 2; k++) if (source.charCodeAt(k) === 10) line++;
    i = close + 2;
  }
  return tokens;
}

function isValidPath(p: string): boolean {
  if (p === '.') return true;
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(p);
}

function compileError(message: string, line: number): Error {
  const err = new Error(message);
  (err as Error & { line?: number }).line = line;
  return err;
}

function parse(source: string): Node[] {
  const tokens = tokenize(source);
  const root: Node[] = [];
  const stack: Array<{ path: string; inverted: boolean; children: Node[]; line: number }> = [];
  let currentChildren: Node[] = root;
  for (const token of tokens) {
    if (token.type === 'comment') continue;
    if (token.type === 'text') {
      currentChildren.push({ kind: 'text', value: token.value });
    } else if (token.type === 'var') {
      currentChildren.push({ kind: 'var', path: token.value, escape: true, line: token.line });
    } else if (token.type === 'raw') {
      currentChildren.push({ kind: 'var', path: token.value, escape: false, line: token.line });
    } else if (token.type === 'open' || token.type === 'inverted') {
      const frame = {
        path: token.value,
        inverted: token.type === 'inverted',
        children: [] as Node[],
        line: token.line,
      };
      stack.push(frame);
      currentChildren = frame.children;
    } else if (token.type === 'close') {
      const frame = stack.pop();
      if (!frame) {
        throw compileError(
          `Unexpected {{/${token.value}}} at line ${token.line} with no matching section.`,
          token.line,
        );
      }
      if (frame.path !== token.value) {
        throw compileError(
          `Mismatched section: expected {{/${frame.path}}} (opened at line ${frame.line}) but got {{/${token.value}}} at line ${token.line}.`,
          token.line,
        );
      }
      const parentChildren = stack.length === 0 ? root : stack[stack.length - 1].children;
      parentChildren.push({
        kind: 'section',
        path: frame.path,
        inverted: frame.inverted,
        children: frame.children,
        line: frame.line,
      });
      currentChildren = parentChildren;
    }
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    throw compileError(
      `Unclosed section at line ${top.line}: {{${top.inverted ? '^' : '#'}${top.path}}}`,
      top.line,
    );
  }
  return root;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

function resolvePath(path: string, scopes: unknown[]): unknown {
  if (path === '.') {
    return scopes.length > 0 ? scopes[scopes.length - 1] : undefined;
  }
  const segments = path.split('.');
  const head = segments[0];
  // Walk the scope chain from innermost to outermost, looking for the first
  // scope that owns the leading identifier. This is the standard Mustache
  // resolution rule and lets `{{name}}` inside `{{#sprites}}` find the sprite's
  // name without shadowing the top-level context.
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (!isRecord(scope)) continue;
    if (!(head in scope)) continue;
    let current: unknown = scope[head];
    for (let j = 1; j < segments.length; j++) {
      if (!isRecord(current)) return undefined;
      current = current[segments[j]];
    }
    return current;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // Objects/arrays fall back to JSON so users don't accidentally get "[object Object]".
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined || value === false || value === 0 || value === '') {
    return false;
  }
  return true;
}

class RenderBuffer {
  private parts: string[] = [];
  private size = 0;
  append(s: string): void {
    if (!s) return;
    this.size += s.length;
    if (this.size > MAX_RENDER_LENGTH) {
      throw new Error(
        `Custom template output exceeded ${MAX_RENDER_LENGTH} characters (${this.size} rendered). Simplify the template or reduce the sprite count.`,
      );
    }
    this.parts.push(s);
  }
  toString(): string {
    return this.parts.join('');
  }
}

function renderNodes(nodes: Node[], scopes: unknown[], buffer: RenderBuffer): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      buffer.append(node.value);
      continue;
    }
    if (node.kind === 'var') {
      const value = resolvePath(node.path, scopes);
      const text = stringify(value);
      buffer.append(node.escape ? escapeHtml(text) : text);
      continue;
    }
    const value = resolvePath(node.path, scopes);
    if (node.inverted) {
      if (!isTruthy(value)) renderNodes(node.children, scopes, buffer);
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        renderNodes(node.children, [...scopes, entry], buffer);
      }
      continue;
    }
    if (isTruthy(value)) {
      // For non-array truthy sections we push the value as a new scope so
      // `{{#sheet}}{{width}}{{/sheet}}` and `{{sheet.width}}` behave the same.
      const nextScopes = isRecord(value) ? [...scopes, value] : scopes;
      renderNodes(node.children, nextScopes, buffer);
    }
  }
}

export function compileTemplate(source: string): CompiledTemplate {
  if (typeof source !== 'string') {
    throw new Error('Custom template source must be a string.');
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(
      `Custom template exceeds ${MAX_SOURCE_LENGTH} characters (${source.length} provided). Split it into a smaller template.`,
    );
  }
  const ast = parse(source);
  return {
    render(ctx: TemplateContext): string {
      const buffer = new RenderBuffer();
      renderNodes(ast, [ctx as unknown as Record<string, unknown>], buffer);
      return buffer.toString();
    },
  };
}
