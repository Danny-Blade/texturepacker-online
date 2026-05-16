'use client';

import { useEffect } from 'react';
import { getTranslations, type Locale } from '@/lib/i18n';

interface ShortcutsDialogProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
}

interface Row {
  keys: string[];
  desc: string;
}

interface Group {
  title: string;
  rows: Row[];
}

const isMac =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform);
const MOD = isMac ? 'Cmd' : 'Ctrl';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--tp-border-strong)] bg-[var(--tp-bg-elev)]">
      {children}
    </kbd>
  );
}

function renderKey(token: string, idx: number): React.ReactNode {
  if (token === '+') return <span key={`plus-${idx}`} className="text-[var(--tp-text-dim)]">+</span>;
  if (token === '/') return <span key={`sep-${idx}`} className="text-[var(--tp-text-dim)]">/</span>;
  return <Kbd key={`k-${idx}`}>{token}</Kbd>;
}

function renderKeys(tokens: string[]): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {tokens.map((tok, i) => renderKey(tok, i))}
    </span>
  );
}

export default function ShortcutsDialog({ locale, isOpen, onClose }: ShortcutsDialogProps) {
  const t = getTranslations(locale);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const s = t.shortcuts;

  const groups: Group[] = [
    {
      title: s.fileGroup,
      rows: [
        { keys: [MOD, '+', 'N'], desc: s.descNew },
        { keys: [MOD, '+', 'O'], desc: s.descOpen },
        { keys: [MOD, '+', 'S'], desc: s.descSave },
        { keys: [MOD, '+', 'Shift', '+', 'P'], desc: s.descPublish },
      ],
    },
    {
      title: s.editGroup,
      rows: [
        { keys: ['Delete'], desc: s.descRemove },
        { keys: [MOD, '+', 'A'], desc: s.descSelectAll },
        { keys: ['Esc'], desc: s.descClearSel },
        { keys: ['F2'], desc: s.descRename },
      ],
    },
    {
      title: s.viewGroup,
      rows: [
        { keys: [MOD, '+', '='], desc: s.descZoomIn },
        { keys: [MOD, '+', '-'], desc: s.descZoomOut },
        { keys: [MOD, '+', '0'], desc: s.descFit },
        { keys: ['1'], desc: s.descActual },
        { keys: ['F'], desc: s.descFitSel },
      ],
    },
    {
      title: s.canvasGroup,
      rows: [
        { keys: ['Arrows'], desc: s.descPan },
        { keys: ['Shift', '+', 'Arrows'], desc: s.descPanFast },
        { keys: ['Space', '+', 'Drag'], desc: s.descPan },
        { keys: ['Wheel'], desc: s.descWheelZoom },
        { keys: ['Middle', '+', 'Drag'], desc: s.descPan },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-md shadow-2xl flex flex-col"
        style={{
          background: 'var(--tp-panel)',
          border: '1px solid var(--tp-border-strong)',
          maxHeight: '85vh',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: 'var(--tp-border)', background: 'var(--tp-bg-elev)' }}
        >
          <h2 className="text-sm font-semibold text-[var(--tp-text)]">{s.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groups.map((g) => (
            <section key={g.title} className="mb-4 last:mb-1">
              <h3
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--tp-text-muted)' }}
              >
                {g.title}
              </h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-center">
                {g.rows.map((r, i) => (
                  <div key={`${g.title}-${i}`} className="contents">
                    <div className="whitespace-nowrap">{renderKeys(r.keys)}</div>
                    <div className="text-xs text-[var(--tp-text)]">{r.desc}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
