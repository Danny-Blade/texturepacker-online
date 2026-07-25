'use client';

import { useMemo, useState } from 'react';
import { getTranslations, type Locale } from '@/lib/i18n';
import { compileTemplate, type TemplateContext } from '@/lib/templates/dsl';
import {
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  type CustomTemplate,
} from '@/lib/templates/store';

interface TemplateEditorProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}

interface InnerProps {
  locale: Locale;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const STARTER_SOURCE = `# {{sheet.width}}x{{sheet.height}} — {{imageFile}}
{{#sprites}}
{{name}}: x={{x}} y={{y}} w={{w}} h={{h}}{{#rotated}} (rotated){{/rotated}}
{{/sprites}}
{{^sprites}}
No sprites.
{{/sprites}}
`;

/**
 * A synthetic 2-sprite context used to render the live preview. Coordinates and
 * names are picked so that basic string/loop/rotation/polygon paths all appear
 * in the output.
 */
const PREVIEW_CONTEXT: TemplateContext = {
  imageFile: 'atlas.png',
  dataFile: 'atlas.txt',
  sheet: { index: 0, width: 512, height: 256 },
  sprites: [
    {
      name: 'hero.png',
      x: 0,
      y: 0,
      w: 64,
      h: 64,
      rotated: false,
      trimmed: false,
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      polygon: [0, 0, 64, 0, 64, 64, 0, 64],
    },
    {
      name: 'boss.png',
      x: 66,
      y: 0,
      w: 80,
      h: 96,
      rotated: true,
      trimmed: true,
      sourceSize: { w: 96, h: 96 },
      spriteSourceSize: { x: 4, y: 0, w: 80, h: 96 },
    },
  ],
  meta: { app: 'Web TexturePacker', version: '1.0', scale: 1 },
};

function makeId(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'template';
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

function newDraft(): CustomTemplate {
  const now = Date.now();
  return {
    id: makeId('template'),
    name: 'Untitled template',
    extension: 'txt',
    source: STARTER_SOURCE,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Render the modal only while `isOpen` is true so the inner component can seed
 * its state via lazy `useState` initialisers. Mounting/unmounting keyed by
 * `isOpen` gives us "reset each time the dialog opens" without needing
 * setState-in-effect, which trips the react-hooks lint rule.
 */
export default function TemplateEditor({ locale, isOpen, onClose, onSaved }: TemplateEditorProps) {
  if (!isOpen) return null;
  return <TemplateEditorInner locale={locale} onClose={onClose} onSaved={onSaved} />;
}

function TemplateEditorInner({ locale, onClose, onSaved }: InnerProps) {
  const t = getTranslations(locale);
  const [templates, setTemplates] = useState<CustomTemplate[]>(() => loadTemplates());
  const [draft, setDraft] = useState<CustomTemplate | null>(() => {
    const stored = loadTemplates();
    return stored.length > 0 ? { ...stored[0] } : newDraft();
  });

  const preview = useMemo(() => {
    if (!draft) return { ok: true, output: '' as string };
    try {
      const compiled = compileTemplate(draft.source);
      return { ok: true, output: compiled.render(PREVIEW_CONTEXT) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, output: message };
    }
  }, [draft]);

  const selectTemplate = (id: string) => {
    const found = templates.find((template) => template.id === id);
    if (found) setDraft({ ...found });
  };

  const createNew = () => setDraft(newDraft());

  const handleSave = () => {
    if (!draft) return;
    const name = draft.name.trim() || 'Untitled template';
    const record: CustomTemplate = {
      ...draft,
      name,
      extension: draft.extension.trim() || 'txt',
      updatedAt: Date.now(),
      createdAt: draft.createdAt || Date.now(),
    };
    saveTemplate(record);
    setTemplates(loadTemplates());
    setDraft({ ...record });
    onSaved(record.id);
  };

  const handleDelete = (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t.templates.deleteConfirm)) return;
    deleteTemplate(id);
    const next = loadTemplates();
    setTemplates(next);
    if (draft?.id === id) setDraft(next.length > 0 ? { ...next[0] } : newDraft());
  };

  const updateDraft = (patch: Partial<CustomTemplate>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-w-4xl w-full max-h-[90vh] overflow-hidden rounded-lg border border-[var(--tp-border)] bg-[var(--tp-panel)] shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--tp-border)]">
          <h2 className="text-sm font-semibold text-[var(--tp-text)]">{t.templates.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md inline-flex items-center justify-center text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
            aria-label={t.publish.cancel}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 min-h-0 flex">
          <aside className="w-[30%] min-w-[180px] border-r border-[var(--tp-border)] bg-[var(--tp-bg)] flex flex-col">
            <div className="p-2 border-b border-[var(--tp-border)]">
              <button type="button" className="tp-btn w-full" onClick={createNew}>
                + {t.templates.new}
              </button>
            </div>
            <ul className="flex-1 overflow-auto text-xs">
              {templates.length === 0 && (
                <li className="px-3 py-4 text-[11px] text-[var(--tp-text-dim)]">
                  {t.templates.emptyState}
                </li>
              )}
              {templates.map((template) => (
                <li
                  key={template.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer border-b border-[var(--tp-border)] hover:bg-[var(--tp-panel-2)] ${
                    draft?.id === template.id ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent)]' : ''
                  }`}
                  onClick={() => selectTemplate(template.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[var(--tp-text)]">{template.name}</div>
                    <div className="truncate text-[10px] text-[var(--tp-text-dim)] font-mono">
                      .{template.extension}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(template.id);
                    }}
                    className="text-[var(--tp-text-muted)] hover:text-[var(--tp-danger)] px-1"
                    aria-label={t.templates.delete}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex-1 min-w-0 overflow-auto p-4 space-y-3 bg-[var(--tp-panel)]">
            {draft && (
              <>
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <label className="block">
                    <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                      {t.templates.name}
                    </span>
                    <input
                      type="text"
                      className="tp-input"
                      value={draft.name}
                      onChange={(e) => updateDraft({ name: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                      {t.templates.extension}
                    </span>
                    <input
                      type="text"
                      className="tp-input"
                      value={draft.extension}
                      onChange={(e) => updateDraft({ extension: e.target.value })}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                    {t.templates.source}
                  </span>
                  <textarea
                    className="tp-input font-mono text-[12px] resize-y"
                    style={{ minHeight: 300, width: '100%' }}
                    spellCheck={false}
                    value={draft.source}
                    onChange={(e) => updateDraft({ source: e.target.value })}
                  />
                </label>

                <div>
                  <div className="text-[11px] text-[var(--tp-text-muted)] mb-1 uppercase tracking-wide">
                    {t.templates.preview}
                  </div>
                  <pre
                    className={`rounded-md border p-2 max-h-56 overflow-auto text-[11px] font-mono whitespace-pre-wrap break-words ${
                      preview.ok
                        ? 'border-[var(--tp-border)] bg-[var(--tp-bg)] text-[var(--tp-text)]'
                        : 'border-[var(--tp-danger)] bg-[var(--tp-bg)] text-[var(--tp-danger)]'
                    }`}
                  >
                    {preview.output || ' '}
                  </pre>
                </div>

                <details className="rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2 text-[11px] text-[var(--tp-text-muted)]">
                  <summary className="cursor-pointer text-[var(--tp-text)]">
                    {t.templates.contextDocs.split('.')[0]}
                  </summary>
                  <p className="mt-2 font-mono leading-relaxed whitespace-pre-wrap">
                    {t.templates.contextDocs}
                  </p>
                </details>
              </>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--tp-border)] bg-[var(--tp-bg-elev)]">
          <button type="button" onClick={onClose} className="tp-btn">
            {t.publish.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="tp-btn tp-btn-primary"
            disabled={!draft || !preview.ok}
          >
            {t.templates.save}
          </button>
        </footer>
      </div>
    </div>
  );
}
