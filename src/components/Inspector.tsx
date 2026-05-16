'use client';

import { useCallback } from 'react';
import { getTranslations } from '@/lib/i18n';
import { useTpStore, type BackgroundMode, type InspectorSectionState } from '@/lib/store';
import type { ExportFormat, PackingAlgorithm } from '@/lib/packer';

interface InspectorProps {
  locale: 'en' | 'zh';
}

const ALGORITHMS: PackingAlgorithm[] = [
  'maxrects-bssf',
  'maxrects-blsf',
  'maxrects-baf',
  'shelf',
];

const EXPORT_FORMATS: ExportFormat[] = [
  'json',
  'json-array',
  'css',
  'xml',
  'cocos2d',
  'phaser3',
  'unity',
];

const SIZE_OPTIONS = [256, 512, 1024, 2048, 4096, 8192] as const;

const FORMAT_EXT: Record<ExportFormat, string> = {
  json: 'json',
  'json-array': 'json',
  css: 'css',
  xml: 'xml',
  cocos2d: 'plist',
  phaser3: 'json',
  unity: 'json',
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s ease',
      }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface SectionProps {
  title: string;
  sectionKey: keyof InspectorSectionState;
  open: boolean;
  children: React.ReactNode;
}

function Section({ title, sectionKey, open, children }: SectionProps) {
  const toggleInspectorSection = useTpStore((s) => s.toggleInspectorSection);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => toggleInspectorSection(sectionKey)}
        className="flex h-8 items-center justify-between border-b border-[var(--tp-border)] bg-[var(--tp-bg-elev)] px-3 hover:bg-[var(--tp-panel-2)] cursor-pointer"
      >
        <div className="flex items-center gap-2 text-[var(--tp-text)]">
          <ChevronIcon open={open} />
          <span className="text-xs font-medium uppercase tracking-wide">
            {title}
          </span>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-b border-[var(--tp-border)] px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <div className="tp-label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer text-xs text-[var(--tp-text)]">
      <span>{label}</span>
      <span className="relative inline-block w-9 h-5">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <span className="absolute inset-0 rounded-full bg-[var(--tp-panel-2)] peer-checked:bg-[var(--tp-accent)] transition" />
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

interface BgSegmentedProps {
  value: BackgroundMode;
  onChange: (m: BackgroundMode) => void;
  labels: { checker: string; solid: string; transparent: string };
}

function BgSegmented({ value, onChange, labels }: BgSegmentedProps) {
  const modes: { key: BackgroundMode; label: string }[] = [
    { key: 'checker', label: labels.checker },
    { key: 'solid', label: labels.solid },
    { key: 'transparent', label: labels.transparent },
  ];
  return (
    <div className="grid grid-cols-3 gap-0 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0.5">
      {modes.map((m) => {
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={`h-6 rounded text-[11px] transition ${
              active
                ? 'bg-[var(--tp-accent)] text-white'
                : 'text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Inspector({ locale }: InspectorProps) {
  const t = getTranslations(locale);

  const sections = useTpStore((s) => s.inspectorSections);
  const fileName = useTpStore((s) => s.fileName);
  const setFileName = useTpStore((s) => s.setFileName);
  const exportFormat = useTpStore((s) => s.exportFormat);
  const setExportFormat = useTpStore((s) => s.setExportFormat);
  const settings = useTpStore((s) => s.settings);
  const setSettings = useTpStore((s) => s.setSettings);
  const bgMode = useTpStore((s) => s.bgMode);
  const setBgMode = useTpStore((s) => s.setBgMode);
  const bgColor = useTpStore((s) => s.bgColor);
  const setBgColor = useTpStore((s) => s.setBgColor);
  const images = useTpStore((s) => s.images);
  const packResult = useTpStore((s) => s.packResult);

  const dataExt = FORMAT_EXT[exportFormat];
  const dataFileName = `${fileName}.${dataExt}`;

  const onAlgorithmChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSettings({ algorithm: e.target.value as PackingAlgorithm });
    },
    [setSettings],
  );

  const onMaxWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSettings({ maxWidth: Number(e.target.value) });
    },
    [setSettings],
  );

  const onMaxHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSettings({ maxHeight: Number(e.target.value) });
    },
    [setSettings],
  );

  const onPaddingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(32, Number(e.target.value) || 0));
      setSettings({ padding: v });
    },
    [setSettings],
  );

  const onExtrudeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(0, Math.min(16, Number(e.target.value) || 0));
      setSettings({ extrude: v });
    },
    [setSettings],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--tp-panel)] text-[var(--tp-text)]">
      <div className="flex h-8 shrink-0 items-center border-b border-[var(--tp-border)] px-2">
        <span className="text-xs uppercase tracking-wider text-[var(--tp-text-muted)]">
          {t.panels.inspector}
        </span>
      </div>

      <Section
        title={t.inspector.output}
        sectionKey="output"
        open={sections.output}
      >
        <Field label={t.inspector.textureFormat}>
          <select className="tp-input" value="png-32" disabled>
            <option value="png-32">PNG-32</option>
          </select>
        </Field>

        <Field label={t.inspector.imageFile}>
          <div className="relative">
            <input
              type="text"
              className="tp-input pr-12"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--tp-text-muted)]">
              .png
            </span>
          </div>
        </Field>

        <Field label={t.inspector.dataFile}>
          <span className="block rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] px-2 py-1 font-mono text-xs text-[var(--tp-text-muted)]">
            {dataFileName}
          </span>
        </Field>
      </Section>

      <Section
        title={t.inspector.data}
        sectionKey="data"
        open={sections.data}
      >
        <Field label={t.inspector.dataFormat}>
          <select
            className="tp-input"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {EXPORT_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {t.formats[fmt]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title={t.inspector.layout}
        sectionKey="layout"
        open={sections.layout}
      >
        <Field label={t.inspector.algorithm}>
          <select
            className="tp-input"
            value={settings.algorithm}
            onChange={onAlgorithmChange}
          >
            {ALGORITHMS.map((alg) => (
              <option key={alg} value={alg}>
                {t.algorithms[alg]}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <div className="tp-label mb-1.5">{t.inspector.maxSize}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {t.inspector.width}
              </div>
              <select
                className="tp-input"
                value={settings.maxWidth}
                onChange={onMaxWidthChange}
              >
                {SIZE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-[var(--tp-text-dim)]">
                {t.inspector.height}
              </div>
              <select
                className="tp-input"
                value={settings.maxHeight}
                onChange={onMaxHeightChange}
              >
                {SIZE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <Field label={t.inspector.padding}>
          <input
            type="number"
            min={0}
            max={32}
            className="tp-input tp-num"
            value={settings.padding}
            onChange={onPaddingChange}
          />
        </Field>

        <Field label={t.inspector.extrude}>
          <input
            type="number"
            min={0}
            max={16}
            className="tp-input tp-num"
            value={settings.extrude}
            onChange={onExtrudeChange}
          />
        </Field>

        <ToggleRow
          label={t.inspector.allowRotation}
          value={settings.allowRotation}
          onChange={(v) => setSettings({ allowRotation: v })}
        />
        <ToggleRow
          label={t.inspector.powerOfTwo}
          value={settings.powerOfTwo}
          onChange={(v) => setSettings({ powerOfTwo: v })}
        />
        <ToggleRow
          label={t.inspector.trimAlpha}
          value={settings.trimAlpha}
          onChange={(v) => setSettings({ trimAlpha: v })}
        />

        <div>
          <div className="tp-label mb-1.5">{t.inspector.backgroundColor}</div>
          <BgSegmented
            value={bgMode}
            onChange={setBgMode}
            labels={{
              checker: t.canvas.bgChecker,
              solid: t.canvas.bgSolid,
              transparent: t.canvas.bgTransparent,
            }}
          />
          {bgMode === 'solid' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="tp-input flex-1 font-mono"
              />
            </div>
          )}
        </div>
      </Section>

      {images.length === 0 && !packResult && (
        <div className="px-3 py-3 text-[11px] italic text-[var(--tp-text-dim)]">
          Add sprites to see live results
        </div>
      )}
    </div>
  );
}
