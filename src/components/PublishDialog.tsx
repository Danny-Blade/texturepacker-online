'use client';

import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTpStore } from '@/lib/store';
import { getTranslations, type Locale } from '@/lib/i18n';
import { ALL_EXPORT_FORMATS, FORMATS } from '@/lib/formats';
import { performPublish, previewFilenames } from '@/lib/publish';
import type { ExportFormat } from '@/lib/packer';

interface PublishDialogProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
}

const SUPPORTED_SCALES: number[] = [0.5, 1, 2];

function scaleLabel(scale: number): string {
  if (scale === 1) return '@1x';
  if (scale === 2) return '@2x';
  if (scale === 0.5) return '@0.5x';
  return `@${scale}x`;
}

export default function PublishDialog({ locale, isOpen, onClose }: PublishDialogProps) {
  const t = getTranslations(locale);

  const {
    publishOptions,
    exportFormat,
    fileName,
    packResult,
    dirHandle,
    setPublishOptions,
    setExportFormat,
    showNotification,
  } = useTpStore(
    useShallow((s) => ({
      publishOptions: s.publishOptions,
      exportFormat: s.exportFormat,
      fileName: s.fileName,
      packResult: s.packResult,
      dirHandle: s.dirHandle,
      setPublishOptions: s.setPublishOptions,
      setExportFormat: s.setExportFormat,
      showNotification: s.showNotification,
    })),
  );

  const [isPublishing, setIsPublishing] = useState(false);

  const sheetCount = Math.max(1, packResult?.sheets.length ?? 0);
  const scaleCount = Math.max(1, publishOptions.scales.length);
  const fileCount = sheetCount * scaleCount * 2;

  const preview = useMemo(
    () =>
      previewFilenames({
        packResult,
        publishOptions,
        exportFormat,
        fileName,
      }),
    [packResult, publishOptions, exportFormat, fileName],
  );

  const toggleScale = (scale: number) => {
    const has = publishOptions.scales.includes(scale);
    const next = has
      ? publishOptions.scales.filter((s) => s !== scale)
      : [...publishOptions.scales, scale].sort((a, b) => a - b);
    setPublishOptions({ scales: next });
  };

  const setImageFormat = (fmt: 'png' | 'jpg' | 'webp') => {
    setPublishOptions({ imageFormat: fmt });
  };

  const handlePublish = async () => {
    if (!packResult) {
      showNotification(t.errors.noImages);
      return;
    }
    if (publishOptions.scales.length === 0) {
      showNotification(t.publish.emptyScales);
      return;
    }
    setIsPublishing(true);
    try {
      const result = await performPublish({
        packResult,
        publishOptions,
        exportFormat,
        fileName,
        dirHandle,
      });
      showNotification(t.publish.done.replace('{n}', String(result.files.length)));
      onClose();
    } catch {
      showNotification(t.project.saveError);
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isOpen) return null;

  const segBtn = (active: boolean) =>
    `h-7 px-3 rounded-md text-xs border transition ${
      active
        ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent)] border-[var(--tp-accent)]'
        : 'bg-[var(--tp-bg-elev)] text-[var(--tp-text-muted)] border-[var(--tp-border)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
    }`;

  const sectionTitleClass =
    'tp-label mb-2 block';

  const summaryText = t.publish.summary
    .replace('{sheets}', String(sheetCount))
    .replace('{scales}', String(scaleCount))
    .replace('{files}', String(fileCount));

  const formatChoices: Array<{ key: 'png' | 'jpg' | 'webp'; label: string }> = [
    { key: 'png', label: 'PNG' },
    { key: 'jpg', label: 'JPG' },
    { key: 'webp', label: 'WEBP' },
  ];

  const qualityDisabled = publishOptions.imageFormat === 'png';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-w-2xl w-full max-h-[90vh] overflow-auto rounded-lg border border-[var(--tp-border)] bg-[var(--tp-panel)] shadow-2xl"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--tp-border)]">
          <h2 className="text-sm font-semibold text-[var(--tp-text)]">{t.publish.title}</h2>
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

        <div className="p-4 space-y-5">
          <section>
            <span className={sectionTitleClass}>{t.publish.outputFiles}</span>
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                  {t.publish.imageFile}
                </span>
                <input
                  type="text"
                  className="tp-input"
                  value={publishOptions.imageFileTemplate}
                  onChange={(e) => setPublishOptions({ imageFileTemplate: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                  {t.publish.dataFile}
                </span>
                <input
                  type="text"
                  className="tp-input"
                  value={publishOptions.dataFileTemplate}
                  onChange={(e) => setPublishOptions({ dataFileTemplate: e.target.value })}
                />
              </label>
              <div className="text-[10px] text-[var(--tp-text-dim)] leading-relaxed font-mono">
                {t.publish.legend}
              </div>
              <div className="rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2 max-h-32 overflow-auto">
                <div className="text-[10px] text-[var(--tp-text-muted)] mb-1 uppercase tracking-wide">
                  {t.publish.preview}
                </div>
                <ul className="space-y-0.5 font-mono text-[11px] text-[var(--tp-text)]">
                  {preview.images.map((name, i) => (
                    <li key={`img-${i}`} className="truncate">
                      {name}
                    </li>
                  ))}
                  {preview.dataFiles.map((name, i) => (
                    <li key={`data-${i}`} className="truncate text-[var(--tp-text-muted)]">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section>
            <span className={sectionTitleClass}>{t.publish.imageFormat}</span>
            <div className="flex items-center gap-1">
              {formatChoices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setImageFormat(c.key)}
                  className={segBtn(publishOptions.imageFormat === c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className={`mt-3 ${qualityDisabled ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--tp-text-muted)]">{t.publish.imageQuality}</span>
                <span className="text-[11px] tabular-nums text-[var(--tp-text)]">
                  {Math.round(publishOptions.imageQuality * 100)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(publishOptions.imageQuality * 100)}
                onChange={(e) =>
                  setPublishOptions({ imageQuality: Number(e.target.value) / 100 })
                }
                disabled={qualityDisabled}
                className="w-full"
              />
            </div>
          </section>

          <section>
            <span className={sectionTitleClass}>{t.publish.dataFormat}</span>
            <select
              className="tp-input"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            >
              {ALL_EXPORT_FORMATS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {FORMATS[fmt].label}
                </option>
              ))}
            </select>
          </section>

          <section>
            <span className={sectionTitleClass}>{t.publish.scales}</span>
            <div className="flex items-center gap-3 flex-wrap">
              {SUPPORTED_SCALES.map((s) => {
                const checked = publishOptions.scales.includes(s);
                return (
                  <label
                    key={s}
                    className="inline-flex items-center gap-2 text-xs text-[var(--tp-text)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScale(s)}
                      className="accent-[var(--tp-accent)]"
                    />
                    {scaleLabel(s)}
                  </label>
                );
              })}
            </div>
            {publishOptions.scales.length === 0 && (
              <p className="mt-2 text-[11px] text-[var(--tp-danger)]">{t.publish.emptyScales}</p>
            )}
          </section>

          <section>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--tp-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={publishOptions.bundleZip}
                onChange={(e) => setPublishOptions({ bundleZip: e.target.checked })}
                className="accent-[var(--tp-accent)]"
              />
              {t.publish.bundle}
            </label>
            {fileCount > 2 && !publishOptions.bundleZip && (
              <p className="mt-1 text-[10px] text-[var(--tp-text-dim)]">{t.publish.bundleHint}</p>
            )}
          </section>

          <section>
            <span className={sectionTitleClass}>{t.publish.summaryTitle}</span>
            <div className="rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] px-3 py-2 text-xs text-[var(--tp-text)]">
              {summaryText}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--tp-border)] bg-[var(--tp-bg-elev)]">
          <button type="button" onClick={onClose} className="tp-btn" disabled={isPublishing}>
            {t.publish.cancel}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            className="tp-btn tp-btn-primary"
            disabled={
              isPublishing || !packResult || publishOptions.scales.length === 0
            }
          >
            {isPublishing ? t.publish.publishing : t.publish.publish}
          </button>
        </footer>
      </div>
    </div>
  );
}
