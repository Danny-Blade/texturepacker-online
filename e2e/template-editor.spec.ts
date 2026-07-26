import { test } from '@playwright/test';

/**
 * Custom-template UI tests. The `TemplateEditor` component (see
 * `src/components/TemplateEditor.tsx`) exists and unit-tests its behaviour,
 * but is not yet wired into the Publish dialog (no import site outside its
 * own file). Both cases below are skipped with an explanation and should
 * flip on the moment the "Templates…" button gets connected inside
 * `PublishDialog`. See CLAUDE.md — no changes to `src/` from this task.
 */

test.skip(
  'save + use template exposes the entry in the Data Format dropdown',
  () => {
    // Preconditions:
    //   1. `TemplateEditor` mounted from PublishDialog (via a "Templates…"
    //      button beneath the Data Format select).
    //   2. Selecting a template flips `exportFormat` to a synthetic
    //      "custom:<id>" value that survives dialog reopen.
    // Once both land, remove `.skip` and drive:
    //   - Open publish → Templates… → New → fill name/extension/source → Save.
    //   - Assert the "── Custom ──" separator + `test-tpl` option appear in
    //     the Data Format select.
  },
);

test.skip(
  'live preview surfaces compile errors as visible text',
  () => {
    // Same wiring precondition. When flipped on, drive:
    //   - Open publish → Templates… → New.
    //   - Type `{{#unclosed}}` into the source textarea.
    //   - Assert the preview panel is styled with the error class
    //     (`border-[var(--tp-danger)]`) and contains a locator like
    //     `/unclosed|line/i` — the exact string comes from
    //     `compileTemplate` in `src/lib/templates/dsl.ts`.
  },
);
