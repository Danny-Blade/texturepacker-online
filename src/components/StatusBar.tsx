'use client';

import { getTranslations } from '@/lib/i18n';
import { selectEfficiency, selectExceedsMax, useTpStore } from '@/lib/store';

interface StatusBarProps {
  locale: 'en' | 'zh';
}

interface PillInfo {
  color: string;
  label: string;
}

export default function StatusBar({ locale }: StatusBarProps) {
  const t = getTranslations(locale);

  const images = useTpStore((s) => s.images);
  const packResult = useTpStore((s) => s.packResult);
  const zoom = useTpStore((s) => s.zoom);
  const notification = useTpStore((s) => s.notification);
  const efficiency = useTpStore(selectEfficiency);
  const exceedsMax = useTpStore(selectExceedsMax);
  const isPacking = useTpStore((s) => s.isPacking);
  const packProgress = useTpStore((s) => s.packProgress);
  const packError = useTpStore((s) => s.packError);

  const failedCount = packResult?.failed.length ?? 0;

  let pill: PillInfo;
  if (packError) {
    const truncated = packError.length > 40 ? `${packError.slice(0, 40)}…` : packError;
    pill = { color: 'var(--tp-danger)', label: `Error: ${truncated}` };
  } else if (images.length === 0) {
    pill = { color: 'var(--tp-text-dim)', label: t.status.ready };
  } else if (failedCount > 0) {
    pill = {
      color: 'var(--tp-danger)',
      label: `${failedCount} ${t.status.failed}`,
    };
  } else if (exceedsMax) {
    pill = { color: 'var(--tp-warn)', label: 'Exceeds max size' };
  } else {
    pill = { color: 'var(--tp-success)', label: 'Packed' };
  }

  const progressPct = Math.round(packProgress * 100);

  const sizeLabel = packResult
    ? `${packResult.width} × ${packResult.height}`
    : '—';
  const efficiencyLabel = packResult ? `${efficiency}%` : '—';
  const separator = (
    <span className="text-[var(--tp-text-dim)]">·</span>
  );

  return (
    <div className="flex h-6 items-center gap-4 border-t border-[var(--tp-border)] bg-[var(--tp-bg-elev)] px-3 text-[11px] text-[var(--tp-text-muted)]">
      {isPacking && !packError ? (
        <div className="flex items-center gap-2" style={{ color: 'var(--tp-accent)' }}>
          <div
            className="h-1 w-[60px] overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--tp-bg-elev)' }}
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{
                width: `${progressPct}%`,
                backgroundColor: 'var(--tp-accent)',
              }}
            />
          </div>
          <span>Packing… {progressPct}%</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: pill.color }}
            aria-hidden
          />
          <span>{pill.label}</span>
        </div>
      )}

      {separator}

      <span className="text-[var(--tp-text)]">
        {images.length} {t.status.sprites}
      </span>

      {separator}

      <span>{sizeLabel === '—' ? '—' : <span className="text-[var(--tp-text)]">{sizeLabel}</span>}</span>

      {separator}

      <span>
        {efficiencyLabel === '—' ? (
          '—'
        ) : (
          <span className="text-[var(--tp-text)]">{efficiencyLabel}</span>
        )}
      </span>

      <div className="ml-auto flex items-center gap-3">
        {notification && (
          <span className="rounded bg-[var(--tp-accent-soft)] px-2 py-0.5 text-[var(--tp-accent)]">
            {notification}
          </span>
        )}
        <span className="text-[var(--tp-text)]">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
