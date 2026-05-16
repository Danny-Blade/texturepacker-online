'use client';

import { useTpStore } from '@/lib/store';
import { getTranslations, type Locale } from '@/lib/i18n';

interface ToolbarProps {
  locale: Locale;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  onSaveProjectAs?: () => void;
  onAddSprites?: () => void;
  onAddFolder?: () => void;
  onPublish?: () => void;
}

type IconName =
  | 'file-plus'
  | 'folder-open'
  | 'save'
  | 'image-plus'
  | 'folder-plus'
  | 'package';

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'file-plus':
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M12 12v6" />
          <path d="M9 15h6" />
        </svg>
      );
    case 'folder-open':
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
          <path d="M3 9h18l-2 9a2 2 0 0 1-2 1.6H5a2 2 0 0 1-2-1.6z" />
        </svg>
      );
    case 'save':
      return (
        <svg {...common}>
          <path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M8 3v5h8V3" />
          <path d="M7 21v-8h10v8" />
        </svg>
      );
    case 'image-plus':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="M21 14l-4-4-7 7" />
          <path d="M18 19v4" />
          <path d="M16 21h4" />
        </svg>
      );
    case 'folder-plus':
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M12 11v6" />
          <path d="M9 14h6" />
        </svg>
      );
    case 'package':
      return (
        <svg {...common}>
          <path d="M21 16V8L12 3 3 8v8l9 5 9-5z" />
          <path d="M3 8l9 5 9-5" />
          <path d="M12 13v9" />
        </svg>
      );
  }
}

interface ToolButtonProps {
  icon: IconName;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}

function ToolButton({ icon, title, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md flex items-center justify-center transition-colors"
      style={{
        width: 28,
        height: 28,
        color: disabled ? 'var(--tp-text-dim)' : 'var(--tp-text)',
        background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--tp-panel-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--tp-accent-soft)';
      }}
      onMouseUp={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--tp-panel-2)';
      }}
    >
      <Icon name={icon} />
    </button>
  );
}

function Divider() {
  return (
    <div
      className="mx-1"
      style={{ width: 1, height: 20, background: 'var(--tp-border)' }}
    />
  );
}

export default function Toolbar({
  locale,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs: _onSaveProjectAs,
  onAddSprites,
  onAddFolder,
  onPublish,
}: ToolbarProps) {
  const t = getTranslations(locale);
  const imageCount = useTpStore((s) => s.images.length);
  const hasImages = imageCount > 0;

  void _onSaveProjectAs;

  const notify = (msg: string) => useTpStore.getState().showNotification(msg);

  const handleNew = () => {
    if (onNewProject) {
      onNewProject();
    } else {
      const store = useTpStore.getState();
      store.clearImages();
      store.setFileName('spritesheet');
    }
  };
  const handleOpen = () => {
    if (onOpenProject) onOpenProject();
    else notify('Open project: not yet wired in Phase 1');
  };
  const handleSave = () => {
    if (onSaveProject) onSaveProject();
    else notify('Save project: not yet wired in Phase 1');
  };
  const handleAddSprites = () => {
    if (onAddSprites) onAddSprites();
    else notify('Add sprites: not yet wired in Phase 1');
  };
  const handleAddFolder = () => {
    if (onAddFolder) onAddFolder();
    else notify('Add folder: not yet wired in Phase 1');
  };
  const handlePublish = () => {
    if (onPublish) onPublish();
    else notify('Publish: not yet wired in Phase 1');
  };

  return (
    <div
      className="h-10 flex items-center px-2 gap-1"
      style={{
        background: 'var(--tp-bg-elev)',
        borderBottom: '1px solid var(--tp-border)',
      }}
    >
      <ToolButton icon="file-plus" title={t.toolbar.tooltipNew} onClick={handleNew} />
      <ToolButton icon="folder-open" title={t.toolbar.tooltipOpen} onClick={handleOpen} />
      <ToolButton
        icon="save"
        title={t.toolbar.tooltipSave}
        disabled={!hasImages}
        onClick={handleSave}
      />

      <Divider />

      <ToolButton
        icon="image-plus"
        title={t.toolbar.tooltipAddSprites}
        onClick={handleAddSprites}
      />
      <ToolButton
        icon="folder-plus"
        title={t.toolbar.tooltipAddFolder}
        onClick={handleAddFolder}
      />

      <button
        type="button"
        title={t.toolbar.tooltipPublish}
        aria-label={t.toolbar.tooltipPublish}
        onClick={handlePublish}
        disabled={!hasImages}
        className="tp-btn tp-btn-primary ml-auto flex items-center gap-1.5"
        style={{ height: 28, padding: '0 12px', fontSize: 12 }}
      >
        <Icon name="package" size={14} />
        <span>{t.toolbar.publish}</span>
      </button>
    </div>
  );
}
