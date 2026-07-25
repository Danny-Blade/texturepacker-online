/**
 * localStorage persistence for user-authored custom export templates.
 *
 * Templates are stored per-browser (never uploaded) under a single JSON blob
 * to make backup/export a one-line operation. All accessors are SSR-safe.
 */

export interface CustomTemplate {
  id: string;
  name: string;
  extension: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'web-tp-templates';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isCustomTemplate(value: unknown): value is CustomTemplate {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.extension === 'string' &&
    typeof record.source === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number'
  );
}

export function loadTemplates(): CustomTemplate[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomTemplate);
  } catch {
    return [];
  }
}

function writeTemplates(templates: CustomTemplate[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Quota / privacy-mode errors are non-fatal; the UI shows an empty list on next load.
  }
}

export function saveTemplate(template: CustomTemplate): void {
  if (!template || typeof template.id !== 'string' || template.id.length === 0) {
    throw new Error('Custom template requires a non-empty id.');
  }
  const templates = loadTemplates();
  const idx = templates.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    templates[idx] = template;
  } else {
    templates.push(template);
  }
  writeTemplates(templates);
}

export function deleteTemplate(id: string): void {
  if (!hasStorage()) return;
  const templates = loadTemplates().filter((t) => t.id !== id);
  writeTemplates(templates);
}
