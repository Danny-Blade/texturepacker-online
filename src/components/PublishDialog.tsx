'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTpStore, type Png8DitherMode } from '@/lib/store';
import { getTranslations, type Locale } from '@/lib/i18n';
import { ALL_EXPORT_FORMATS, FORMATS } from '@/lib/formats';
import { performPublish, previewFilenames } from '@/lib/publish';
import { performBatchConvert } from '@/lib/batchConvert';
import { encodePng8Pixels } from '@/lib/png8';
import type { ExportFormat, PackSheet } from '@/lib/packer';
import type { AlphaHandling } from '@/lib/imageProcessing';

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
    publishMode,
    exportFormat,
    fileName,
    packResult,
    dirHandle,
    settings,
    images,
    setPublishOptions,
    setPublishMode,
    setSettings,
    setExportFormat,
    showNotification,
  } = useTpStore(
    useShallow((s) => ({
      publishOptions: s.publishOptions,
      publishMode: s.publishMode,
      exportFormat: s.exportFormat,
      fileName: s.fileName,
      packResult: s.packResult,
      dirHandle: s.dirHandle,
      settings: s.settings,
      images: s.images,
      setPublishOptions: s.setPublishOptions,
      setPublishMode: s.setPublishMode,
      setSettings: s.setSettings,
      setExportFormat: s.setExportFormat,
      showNotification: s.showNotification,
    })),
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

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
  const sheetCount = Math.max(1, packResult?.sheets.length ?? 0);
  const scaleCount = Math.max(1, publishOptions.variants?.length ?? publishOptions.scales.length);
  const fileCount = preview.images.length + preview.dataFiles.length;

  const currentExtension = FORMATS[exportFormat]?.extension;
  const isCodeFileFormat =
    currentExtension === 'swift' || currentExtension === 'cs' || currentExtension === 'hpp';

  const toggleScale = (scale: number) => {
    const has = publishOptions.scales.includes(scale);
    const next = has
      ? publishOptions.scales.filter((s) => s !== scale)
      : [...publishOptions.scales, scale].sort((a, b) => a - b);
    setPublishOptions({ scales: next });
  };

  const customVariants = publishOptions.variants;
  const setCustomVariants = (variants: NonNullable<typeof customVariants>) =>
    setPublishOptions({ variants });

  const setImageFormat = (fmt: 'png' | 'png-8' | 'jpg' | 'webp') => {
    setPublishOptions({ imageFormat: fmt });
  };

  const handlePublish = async () => {
    if (!packResult) {
      showNotification(t.errors.noImages);
      return;
    }
    if (publishOptions.scales.length === 0 && !publishOptions.variants?.length) {
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
        packerOptions: settings,
        force: publishOptions.forcePublish ?? false,
      });
      const message = result.skipped
        ? t.publish.skippedUnchanged
        : (() => {
            const done = t.publish.done.replace('{n}', String(result.files.length));
            return result.warnings.length > 0 ? `${done} ${result.warnings.join(' ')}` : done;
          })();
      showNotification(
        message,
        result.warnings.length > 0 ? 8000 : 2500,
      );
      onClose();
    } catch (error) {
      const reason = error instanceof Error ? error.message : t.project.saveError;
      const publishFailed = locale === 'zh' ? '发布失败' : 'Publish failed';
      showNotification(`${publishFailed}: ${reason}`, 8000);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleBatchConvert = async () => {
    if (images.length === 0) {
      showNotification(t.errors.noImages);
      return;
    }
    if (publishOptions.scales.length === 0) {
      showNotification(t.publish.emptyScales);
      return;
    }
    setIsPublishing(true);
    setBatchProgress({ done: 0, total: images.length * publishOptions.scales.length });
    try {
      const result = await performBatchConvert(
        images,
        {
          imageFormat: publishOptions.imageFormat,
          imageQuality: publishOptions.imageQuality,
          scales: publishOptions.scales,
          imageFileTemplate: publishOptions.imageFileTemplate,
          alphaHandling: settings.alphaHandling ?? 'keep',
          alphaBleedIterations: settings.alphaBleedIterations ?? 4,
          premultiply: (settings.alphaHandling ?? 'keep') === 'premultiply',
          png8Colors: publishOptions.png8Colors,
          png8Dither: publishOptions.png8Dither,
          png8DitherStrength: publishOptions.png8DitherStrength,
          extrudePadding: settings.extrude ?? 0,
          trimAlpha: publishOptions.batchTrimAlpha ?? false,
          bundleZip: publishOptions.bundleZip,
        },
        {
          dirHandle,
          onProgress: (done, total) => setBatchProgress({ done, total }),
        },
      );
      showNotification(t.publish.batchDone.replace('{n}', String(result.written.length)));
      onClose();
    } catch (error) {
      const reason = error instanceof Error ? error.message : t.project.saveError;
      const failed = locale === 'zh' ? '批量转换失败' : 'Batch convert failed';
      showNotification(`${failed}: ${reason}`, 8000);
    } finally {
      setIsPublishing(false);
      setBatchProgress(null);
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

  const isBatchMode = publishMode === 'batch';
  const batchScaleCount = Math.max(1, publishOptions.scales.length);
  const batchTotalFiles = images.length * batchScaleCount;
  const batchSummaryText = t.publish.batchSummary
    .replace('{images}', String(images.length))
    .replace('{scales}', String(batchScaleCount))
    .replace('{total}', String(batchTotalFiles));

  const batchProgressText = batchProgress
    ? t.publish.batchProgress
        .replace('{done}', String(batchProgress.done))
        .replace('{total}', String(batchProgress.total))
    : '';

  const formatChoices: Array<{ key: 'png' | 'png-8' | 'jpg' | 'webp'; label: string }> = [
    { key: 'png', label: 'PNG' },
    { key: 'png-8', label: t.publish.png8 },
    { key: 'jpg', label: 'JPG' },
    { key: 'webp', label: 'WEBP' },
  ];

  const qualityDisabled =
    publishOptions.imageFormat === 'png' || publishOptions.imageFormat === 'png-8';

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
            <span className={sectionTitleClass}>{t.publish.mode}</span>
            <div
              role="tablist"
              aria-label={t.publish.mode}
              className="flex items-center gap-1"
            >
              {(['atlas', 'batch'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={publishMode === mode}
                  onClick={() => setPublishMode(mode)}
                  className={segBtn(publishMode === mode)}
                >
                  {mode === 'atlas' ? t.publish.modeAtlas : t.publish.modeBatch}
                </button>
              ))}
            </div>
          </section>

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
              {!isBatchMode && (
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
              )}
              <div className="text-[10px] text-[var(--tp-text-dim)] leading-relaxed font-mono">
                {t.publish.legend}
              </div>
              {!isBatchMode && (
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
              )}
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
            {publishOptions.imageFormat === 'png-8' && (
              <p className="mt-1 text-[10px] text-[var(--tp-text-dim)]">
                {t.publish.png8Hint}
              </p>
            )}
            {publishOptions.imageFormat === 'png-8' && (
              <Png8Controls
                t={t}
                colors={publishOptions.png8Colors ?? 256}
                dither={publishOptions.png8Dither ?? 'none'}
                strength={publishOptions.png8DitherStrength ?? 1}
                onChange={(patch) => setPublishOptions(patch)}
              />
            )}
            {publishOptions.imageFormat === 'png-8' && packResult && packResult.sheets.length > 0 && (
              <Png8Preview
                t={t}
                sheet={packResult.sheets[0]}
                colors={publishOptions.png8Colors ?? 256}
                dither={publishOptions.png8Dither ?? 'none'}
                strength={publishOptions.png8DitherStrength ?? 1}
              />
            )}
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

          {!isBatchMode && (
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
              {isCodeFileFormat && (
                <div className="mt-3 space-y-2 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                        {t.publish.namespace}
                      </span>
                      <input
                        type="text"
                        className="tp-input"
                        value={publishOptions.codeNamespace ?? ''}
                        onChange={(e) =>
                          setPublishOptions({
                            codeNamespace: e.target.value === '' ? undefined : e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                        {t.publish.className}
                      </span>
                      <input
                        type="text"
                        className="tp-input"
                        value={publishOptions.codeClassName ?? ''}
                        onChange={(e) =>
                          setPublishOptions({
                            codeClassName: e.target.value === '' ? undefined : e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="text-[10px] text-[var(--tp-text-dim)]">{t.publish.codeFileHint}</p>
                </div>
              )}
            </section>
          )}

          <section>
            <span className={sectionTitleClass}>{t.publish.scales}</span>
            <label className="mb-3 inline-flex items-center gap-2 text-xs text-[var(--tp-text)]">
              <input
                type="checkbox"
                checked={Boolean(customVariants)}
                onChange={(e) =>
                  setPublishOptions({
                    variants: e.target.checked
                      ? [{ id: `variant-${Date.now()}`, name: '1x', scale: 1, suffix: '', sort: 'layout', algorithm: 'bilinear', sameLayout: true }]
                      : undefined,
                  })
                }
              />
              {t.publish.customVariants}
            </label>
            {!customVariants && <div className="flex items-center gap-3 flex-wrap">
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
            </div>}
            {!customVariants && publishOptions.scales.length === 0 && (
              <p className="mt-2 text-[11px] text-[var(--tp-danger)]">{t.publish.emptyScales}</p>
            )}
            {customVariants && (
              <div className="space-y-3">
                {customVariants.map((variant, index) => {
                  const update = (patch: Partial<typeof variant>) =>
                    setCustomVariants(customVariants.map((item, i) => i === index ? { ...item, ...patch } : item));
                  return (
                    <div key={variant.id} className="space-y-2 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2">
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] text-[var(--tp-text-muted)]">{t.publish.variantName}<input className="tp-input mt-1" value={variant.name} onChange={(e) => update({ name: e.target.value })} /></label>
                        <label className="text-[10px] text-[var(--tp-text-muted)]">{t.publish.variantScale}<input type="number" min={0.05} step={0.05} className="tp-input mt-1" value={variant.scale} onChange={(e) => update({ scale: Math.max(0.05, Number(e.target.value) || 1) })} /></label>
                        <label className="text-[10px] text-[var(--tp-text-muted)]">{t.publish.variantSuffix}<input className="tp-input mt-1" value={variant.suffix} onChange={(e) => update({ suffix: e.target.value })} /></label>
                      </div>
                      <label className="block text-[10px] text-[var(--tp-text-muted)]">{t.publish.variantFilter}<input className="tp-input mt-1" placeholder="hero/" value={variant.filter ?? ''} onChange={(e) => update({ filter: e.target.value })} /></label>
                      <div className="grid grid-cols-2 gap-2">
                        <select className="tp-input" value={variant.sort ?? 'layout'} onChange={(e) => update({ sort: e.target.value as 'layout' | 'name' | 'area' })}>
                          <option value="layout">{t.publish.variantSort}: Layout</option>
                          <option value="name">{t.publish.variantSort}: Name</option>
                          <option value="area">{t.publish.variantSort}: Area</option>
                        </select>
                        <select className="tp-input" value={variant.algorithm ?? 'bilinear'} onChange={(e) => update({ algorithm: e.target.value as 'nearest' | 'bilinear' | 'bicubic' })}>
                          <option value="nearest">Nearest</option>
                          <option value="bilinear">Bilinear</option>
                          <option value="bicubic">Bicubic</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" min={1} className="tp-input" aria-label={`${t.publish.variantMax} width`} placeholder="Width" value={variant.maxWidth ?? ''} onChange={(e) => update({ maxWidth: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} />
                        <input type="number" min={1} className="tp-input" aria-label={`${t.publish.variantMax} height`} placeholder="Height" value={variant.maxHeight ?? ''} onChange={(e) => update({ maxHeight: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-[var(--tp-text)]"><input type="checkbox" checked={variant.sameLayout ?? true} onChange={(e) => update({ sameLayout: e.target.checked })} />{t.publish.sameLayout}</label>
                        <button type="button" className="tp-btn" disabled={customVariants.length <= 1} onClick={() => setCustomVariants(customVariants.filter((_, i) => i !== index))}>×</button>
                      </div>
                    </div>
                  );
                })}
                <button type="button" className="tp-btn w-full" onClick={() => setCustomVariants([...customVariants, { id: `variant-${Date.now()}`, name: `${customVariants.length + 1}x`, scale: customVariants.length + 1, suffix: `@${customVariants.length + 1}x`, sort: 'layout', algorithm: 'bilinear', sameLayout: true }])}>{t.publish.addVariant}</button>
              </div>
            )}
          </section>

          {isBatchMode && (
            <>
              <section>
                <span className={sectionTitleClass}>{t.inspector.alphaHandling}</span>
                <div className="grid grid-cols-4 gap-0.5 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-0.5">
                  {(
                    [
                      ['keep', t.inspector.alphaKeep],
                      ['clear', t.inspector.alphaClear],
                      ['bleed', t.inspector.alphaBleed],
                      ['premultiply', t.inspector.alphaPremul],
                    ] as const
                  ).map(([key, label]) => {
                    const active = (settings.alphaHandling ?? 'keep') === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSettings({ alphaHandling: key as AlphaHandling })}
                        className={`h-6 rounded text-[11px] transition ${
                          active
                            ? 'bg-[var(--tp-accent)] text-white'
                            : 'text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-2)] hover:text-[var(--tp-text)]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {(settings.alphaHandling ?? 'keep') === 'bleed' && (
                  <div className="mt-2">
                    <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
                      {t.inspector.alphaBleedIterations}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      className="tp-input"
                      value={settings.alphaBleedIterations ?? 4}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(16, Math.floor(Number(e.target.value) || 1)));
                        setSettings({ alphaBleedIterations: v });
                      }}
                    />
                  </div>
                )}
              </section>

              <section>
                <span className={sectionTitleClass}>{t.inspector.extrude}</span>
                <input
                  type="number"
                  min={0}
                  max={32}
                  className="tp-input"
                  value={settings.extrude ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(32, Math.floor(Number(e.target.value) || 0)));
                    setSettings({ extrude: v });
                  }}
                />
              </section>

              <section>
                <label className="inline-flex items-center gap-2 text-xs text-[var(--tp-text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(publishOptions.batchTrimAlpha)}
                    onChange={(e) => setPublishOptions({ batchTrimAlpha: e.target.checked })}
                    className="accent-[var(--tp-accent)]"
                  />
                  {t.publish.batchTrimAlpha}
                </label>
              </section>
            </>
          )}

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
            {!isBatchMode && fileCount > 2 && !publishOptions.bundleZip && (
              <p className="mt-1 text-[10px] text-[var(--tp-text-dim)]">{t.publish.bundleHint}</p>
            )}
          </section>

          {!isBatchMode && (
            <section>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--tp-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(publishOptions.forcePublish)}
                  onChange={(e) => setPublishOptions({ forcePublish: e.target.checked })}
                  className="accent-[var(--tp-accent)]"
                />
                {t.publish.forcePublish}
              </label>
              {publishOptions.forcePublish ? (
                <p className="mt-1 text-[10px] text-[color:#f59e0b]">
                  {t.publish.forcePublishHint}
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-[var(--tp-text-dim)]">
                  {t.publish.smartUpdateEnabled}
                </p>
              )}
            </section>
          )}

          <section>
            <span className={sectionTitleClass}>{t.publish.summaryTitle}</span>
            <div className="rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] px-3 py-2 text-xs text-[var(--tp-text)]">
              {isBatchMode ? batchSummaryText : summaryText}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--tp-border)] bg-[var(--tp-bg-elev)]">
          <button type="button" onClick={onClose} className="tp-btn" disabled={isPublishing}>
            {t.publish.cancel}
          </button>
          <button
            type="button"
            onClick={isBatchMode ? handleBatchConvert : handlePublish}
            className="tp-btn tp-btn-primary"
            disabled={
              isPublishing
              || publishOptions.scales.length === 0
              || (isBatchMode ? images.length === 0 : !packResult)
            }
          >
            {isBatchMode
              ? (isPublishing
                  ? (batchProgress ? batchProgressText : t.publish.publishing)
                  : t.publish.batchConvert)
              : (isPublishing ? t.publish.publishing : t.publish.publish)}
          </button>
        </footer>
      </div>
    </div>
  );
}

type PublishStrings = ReturnType<typeof getTranslations>['publish'];

interface Png8ControlsProps {
  t: { publish: PublishStrings };
  colors: number;
  dither: Png8DitherMode;
  strength: number;
  onChange: (patch: {
    png8Colors?: number;
    png8Dither?: Png8DitherMode;
    png8DitherStrength?: number;
  }) => void;
}

function Png8Controls({ t, colors, dither, strength, onChange }: Png8ControlsProps) {
  const clampedColors = Math.max(16, Math.min(256, Math.round(colors)));
  const clampedStrength = Math.max(0, Math.min(1, strength));
  return (
    <div className="mt-3 space-y-3 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[var(--tp-text-muted)]">{t.publish.png8Colors}</span>
          <span className="text-[11px] tabular-nums text-[var(--tp-text)]">{clampedColors}</span>
        </div>
        <input
          type="range"
          min={16}
          max={256}
          step={8}
          value={clampedColors}
          onChange={(e) => onChange({ png8Colors: Number(e.target.value) })}
          className="w-full"
          aria-label={t.publish.png8Colors}
        />
      </div>
      <div>
        <span className="text-[11px] text-[var(--tp-text-muted)] mb-1 block">
          {t.publish.png8Dither}
        </span>
        <select
          className="tp-input"
          value={dither}
          onChange={(e) => onChange({ png8Dither: e.target.value as Png8DitherMode })}
          aria-label={t.publish.png8Dither}
        >
          <option value="none">{t.publish.png8DitherNone}</option>
          <option value="floyd-steinberg">{t.publish.png8DitherFloyd}</option>
          <option value="atkinson">{t.publish.png8DitherAtkinson}</option>
        </select>
      </div>
      {dither !== 'none' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[var(--tp-text-muted)]">
              {t.publish.png8DitherStrength}
            </span>
            <span className="text-[11px] tabular-nums text-[var(--tp-text)]">
              {Math.round(clampedStrength * 100)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(clampedStrength * 100)}
            onChange={(e) => onChange({ png8DitherStrength: Number(e.target.value) / 100 })}
            className="w-full"
            aria-label={t.publish.png8DitherStrength}
          />
        </div>
      )}
    </div>
  );
}

interface Png8PreviewProps {
  t: { publish: PublishStrings };
  sheet: PackSheet;
  colors: number;
  dither: Png8DitherMode;
  strength: number;
}

interface Png8PreviewState {
  originalBytes: number;
  quantizedBytes: number;
  thumbnailUrl: string;
  width: number;
  height: number;
}

const MAX_PREVIEW_EDGE = 200;

/**
 * Render sheet[0] into an offscreen canvas, encode both a regular PNG and the
 * PNG-8 variant with the current controls, and surface size/thumbnail metrics.
 *
 * The whole pipeline stays inside a `useEffect` so it can be cancelled if the
 * user tweaks the slider mid-encode.
 */
function Png8Preview({ t, sheet, colors, dither, strength }: Png8PreviewProps) {
  const [state, setState] = useState<Png8PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const currentRequest = ++requestId.current;
    let cancelled = false;
    let objectUrl: string | null = null;

    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(sheet.width, sheet.height));
    const width = Math.max(1, Math.round(sheet.width * scale));
    const height = Math.max(1, Math.round(sheet.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      // Defer to the next microtask so React sees the effect finish first.
      queueMicrotask(() => {
        if (requestId.current === currentRequest) setError('Preview unavailable in this browser.');
      });
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    for (const item of sheet.packed) {
      const src = item.pixelSource ?? item.image;
      if (!src) continue;
      const ex = item.extrudePadding ?? 0;
      ctx.save();
      if (item.rotated) {
        ctx.translate((item.x + item.height) * scale, item.y * scale);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(
          src,
          -ex * scale,
          -ex * scale,
          (item.width + ex * 2) * scale,
          (item.height + ex * 2) * scale,
        );
      } else {
        ctx.drawImage(
          src,
          (item.x - ex) * scale,
          (item.y - ex) * scale,
          (item.width + ex * 2) * scale,
          (item.height + ex * 2) * scale,
        );
      }
      ctx.restore();
    }

    const run = async (): Promise<void> => {
      try {
        const originalBlob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/png');
        });
        if (cancelled || requestId.current !== currentRequest) return;
        const imageData = ctx.getImageData(0, 0, width, height);
        const png8 = await encodePng8Pixels(imageData.data, width, height, {
          maxColors: colors,
          dither,
          ditherStrength: strength,
        });
        if (cancelled || requestId.current !== currentRequest) return;
        const png8Blob = new Blob([png8.slice()], { type: 'image/png' });
        objectUrl = URL.createObjectURL(png8Blob);
        setError(null);
        setState({
          originalBytes: originalBlob ? originalBlob.size : 0,
          quantizedBytes: png8Blob.size,
          thumbnailUrl: objectUrl,
          width,
          height,
        });
      } catch (err) {
        if (cancelled || requestId.current !== currentRequest) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sheet, colors, dither, strength]);

  const ratio = state && state.originalBytes > 0
    ? state.quantizedBytes / state.originalBytes
    : null;

  return (
    <div className="mt-3 rounded-md border border-[var(--tp-border)] bg-[var(--tp-bg)] p-2">
      <div className="text-[10px] text-[var(--tp-text-muted)] uppercase tracking-wide mb-2">
        {t.publish.png8Preview}
      </div>
      {error ? (
        <p className="text-[11px] text-[var(--tp-danger)]">{error}</p>
      ) : !state ? (
        <p className="text-[11px] text-[var(--tp-text-muted)]">…</p>
      ) : (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.thumbnailUrl}
            alt=""
            className="rounded border border-[var(--tp-border)]"
            style={{ maxWidth: MAX_PREVIEW_EDGE, maxHeight: MAX_PREVIEW_EDGE }}
          />
          <dl className="text-[11px] text-[var(--tp-text)] space-y-1 flex-1 min-w-0">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tp-text-muted)]">{t.publish.png8OriginalSize}</dt>
              <dd className="tabular-nums">{formatBytes(state.originalBytes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tp-text-muted)]">{t.publish.png8QuantizedSize}</dt>
              <dd className="tabular-nums">{formatBytes(state.quantizedBytes)}</dd>
            </div>
            {ratio !== null && (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--tp-text-muted)]">{t.publish.png8Ratio}</dt>
                <dd className="tabular-nums">{Math.round(ratio * 100)}%</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
