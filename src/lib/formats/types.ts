import type { PackSheet } from '../packer';

export interface FormatOptions {
  /** Base sheet name without extension, e.g. `spritesheet`. */
  fileName: string;
  /** Image file name for sheet 0 (and template-substituted for others), e.g. `spritesheet.png`. */
  imageFileName: (sheetIndex: number) => string;
  /** Data file name (e.g. `spritesheet.json`). For multi-sheet projects this is the canonical name; per-sheet split is left to the caller. */
  dataFileName: string;
  /** Scale variant (1 = 1x, 2 = @2x, etc). Affects sizes recorded in the data. */
  scale?: number;
}

export interface FormatGenerator {
  /** Produce a single data file string from one sheet. */
  generate(sheet: PackSheet, options: FormatOptions): string;
  /** File extension without dot, e.g. `json`. */
  extension: string;
  /** Human label for menus. */
  label: string;
}
