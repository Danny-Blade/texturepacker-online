'use client';

import { useEffect, useRef, useState } from 'react';
import { useTpStore } from '@/lib/store';
import { getTranslations, type Locale } from '@/lib/i18n';

interface MenuBarProps {
  locale: Locale;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  onSaveProjectAs?: () => void;
  onAddSprites?: () => void;
  onAddFolder?: () => void;
  onWatchFolder?: () => void;
  onOpenCutter?: () => void;
  onPublish?: () => void;
  onShowShortcuts?: () => void;
}

type MenuKey = 'file' | 'edit' | 'view' | 'effects' | 'help';

interface MenuItemDef {
  key: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
  separatorAfter?: boolean;
}

export default function MenuBar({
  locale,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  onAddSprites,
  onAddFolder,
  onWatchFolder,
  onOpenCutter,
  onPublish,
  onShowShortcuts,
}: MenuBarProps) {
  const t = getTranslations(locale);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMenu]);

  const notify = (msg: string) => useTpStore.getState().showNotification(msg);

  const fallback = (fn: (() => void) | undefined, msg: string) => () => {
    if (fn) fn();
    else notify(msg);
  };

  const handleNewProject = () => {
    if (onNewProject) {
      onNewProject();
    } else {
      const store = useTpStore.getState();
      store.clearImages();
      store.setFileName('spritesheet');
    }
  };

  const handleRemoveSelected = () => {
    const { selectedIds, removeImages } = useTpStore.getState();
    if (selectedIds.length > 0) removeImages(selectedIds);
  };

  const handleSelectAll = () => {
    const { images, selectImages } = useTpStore.getState();
    selectImages(images.map((i) => i.id));
  };

  const handleClearSelection = () => {
    useTpStore.getState().selectImages([]);
  };

  const handleZoomIn = () => useTpStore.getState().zoomIn();
  const handleZoomOut = () => useTpStore.getState().zoomOut();
  const handleZoomFit = () => useTpStore.getState().resetView();
  const handleZoomActual = () => useTpStore.getState().setZoom(1);
  const handleToggleBorders = () => useTpStore.getState().toggleBorders();
  const handleToggleNames = () => useTpStore.getState().toggleSpriteNames();

  const handleDocs = () => {
    if (typeof window !== 'undefined') {
      window.open('https://www.codeandweb.com/texturepacker/documentation', '_blank');
    }
  };
  const handleAbout = () => notify('Web TexturePacker — IDE-style sprite sheet generator');

  const menus: Record<MenuKey, { label: string; items: MenuItemDef[] }> = {
    file: {
      label: t.menu.file,
      items: [
        { key: 'new', label: t.menu.newProject, shortcut: 'Ctrl+N', onClick: handleNewProject, separatorAfter: true },
        {
          key: 'open',
          label: t.menu.openProject,
          shortcut: 'Ctrl+O',
          onClick: fallback(onOpenProject, 'Open project: not yet wired in Phase 1'),
        },
        {
          key: 'save',
          label: t.menu.saveProject,
          shortcut: 'Ctrl+S',
          onClick: fallback(onSaveProject, 'Save project: not yet wired in Phase 1'),
        },
        {
          key: 'saveAs',
          label: t.menu.saveProjectAs,
          shortcut: 'Ctrl+Shift+S',
          onClick: fallback(onSaveProjectAs, 'Save project as: not yet wired in Phase 1'),
          separatorAfter: true,
        },
        {
          key: 'addSprites',
          label: t.menu.addSprites,
          onClick: fallback(onAddSprites, 'Add sprites: not yet wired in Phase 1'),
        },
        {
          key: 'addFolder',
          label: t.menu.addFolder,
          onClick: fallback(onAddFolder, 'Add folder: not yet wired in Phase 1'),
        },
        {
          key: 'watchFolder',
          label: t.smartFolder.watchFolder,
          shortcut: 'Ctrl+Shift+W',
          onClick: fallback(onWatchFolder, t.smartFolder.notSupported),
        },
        {
          key: 'cutSpriteSheet',
          label: t.menu.cutSpriteSheet,
          shortcut: 'Ctrl+Shift+X',
          onClick: fallback(onOpenCutter, 'Cut sprite sheet: not wired'),
          separatorAfter: true,
        },
        {
          key: 'publish',
          label: t.menu.publish,
          shortcut: 'Ctrl+P',
          onClick: fallback(onPublish, 'Publish: not yet wired in Phase 1'),
        },
      ],
    },
    edit: {
      label: t.menu.edit,
      items: [
        { key: 'remove', label: t.menu.removeSelected, shortcut: 'Del', onClick: handleRemoveSelected },
        { key: 'selectAll', label: t.menu.selectAll, shortcut: 'Ctrl+A', onClick: handleSelectAll },
        { key: 'clearSel', label: t.menu.clearSelection, shortcut: 'Esc', onClick: handleClearSelection },
      ],
    },
    view: {
      label: t.menu.view,
      items: [
        { key: 'zoomIn', label: t.menu.zoomIn, shortcut: 'Ctrl++', onClick: handleZoomIn },
        { key: 'zoomOut', label: t.menu.zoomOut, shortcut: 'Ctrl+-', onClick: handleZoomOut },
        { key: 'zoomFit', label: t.menu.zoomFit, shortcut: 'Ctrl+0', onClick: handleZoomFit },
        { key: 'zoomActual', label: t.menu.zoomActual, shortcut: 'Ctrl+1', onClick: handleZoomActual, separatorAfter: true },
        { key: 'borders', label: t.menu.toggleBorders, onClick: handleToggleBorders },
        { key: 'names', label: t.menu.toggleNames, onClick: handleToggleNames },
      ],
    },
    effects: {
      label: t.menu.effects,
      items: [{ key: 'soon', label: 'Coming soon', disabled: true }],
    },
    help: {
      label: t.menu.help,
      items: [
        {
          key: 'shortcuts',
          label: t.shortcuts.menuItem,
          shortcut: '?',
          onClick: fallback(onShowShortcuts, 'Shortcuts dialog not wired'),
          separatorAfter: true,
        },
        { key: 'docs', label: t.menu.docs, onClick: handleDocs, separatorAfter: true },
        { key: 'about', label: t.menu.about, onClick: handleAbout },
      ],
    },
  };

  const handleTopClick = (key: MenuKey) => {
    setOpenMenu((cur) => (cur === key ? null : key));
  };

  const handleTopEnter = (key: MenuKey) => {
    if (openMenu !== null && openMenu !== key) setOpenMenu(key);
  };

  const handleItemClick = (item: MenuItemDef) => {
    if (item.disabled) return;
    setOpenMenu(null);
    if (item.onClick) item.onClick();
  };

  const menuOrder: MenuKey[] = ['file', 'edit', 'view', 'effects', 'help'];

  return (
    <div
      ref={barRef}
      className="relative h-8 flex items-center select-none"
      style={{
        background: 'var(--tp-bg-elev)',
        borderBottom: '1px solid var(--tp-border)',
      }}
    >
      <div className="px-3 text-xs font-semibold text-[var(--tp-text)] flex items-center h-full">
        Web TexturePacker
      </div>
      <div className="flex items-center h-full">
        {menuOrder.map((key) => {
          const m = menus[key];
          const isOpen = openMenu === key;
          return (
            <div key={key} className="relative h-full flex items-center">
              <button
                type="button"
                className="text-xs h-full flex items-center transition-colors"
                style={{
                  padding: '0 10px',
                  background: isOpen ? 'var(--tp-panel-2)' : 'transparent',
                  color: 'var(--tp-text)',
                }}
                onMouseEnter={() => handleTopEnter(key)}
                onClick={() => handleTopClick(key)}
                onMouseOver={(e) => {
                  if (!isOpen) e.currentTarget.style.background = 'var(--tp-panel-2)';
                }}
                onMouseOut={(e) => {
                  if (!isOpen) e.currentTarget.style.background = 'transparent';
                }}
              >
                {m.label}
              </button>
              {isOpen && (
                <div
                  className="absolute top-full left-0 z-50 shadow-lg py-1"
                  style={{
                    minWidth: 220,
                    background: 'var(--tp-panel)',
                    border: '1px solid var(--tp-border)',
                  }}
                >
                  {m.items.map((item) => (
                    <div key={item.key}>
                      <button
                        type="button"
                        disabled={item.disabled}
                        onClick={() => handleItemClick(item)}
                        className="w-full flex items-center justify-between text-xs text-left transition-colors"
                        style={{
                          padding: '6px 12px',
                          color: item.disabled ? 'var(--tp-text-dim)' : 'var(--tp-text)',
                          cursor: item.disabled ? 'default' : 'pointer',
                          background: 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!item.disabled) e.currentTarget.style.background = 'var(--tp-accent-soft)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <span
                            className="ml-6"
                            style={{ color: 'var(--tp-text-dim)', fontSize: 11 }}
                          >
                            {item.shortcut}
                          </span>
                        )}
                      </button>
                      {item.separatorAfter && (
                        <div
                          style={{
                            height: 1,
                            background: 'var(--tp-border)',
                            margin: '4px 0',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
