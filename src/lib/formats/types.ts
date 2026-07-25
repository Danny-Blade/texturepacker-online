import type { PackSheet } from '../packer';

export interface FormatOptions {
  /** Base sheet name without extension, e.g. `spritesheet`. */
  fileName: string;
  /** Image file name for sheet 0 (and template-substituted for others), e.g. `spritesheet.png`. */
  imageFileName: (sheetIndex: number) => string;
  /** Data file name (e.g. `spritesheet.json`). For multi-sheet projects this is the canonical name; per-sheet split is left to the caller. */
  dataFileName: string;
  /**
   * Scale variant metadata (1 = 1x, 2 = @2x, etc). The supplied sheet already
   * contains physical output coordinates for this scale.
   */
  scale?: number;
  /**
   * File name of the companion normal-map atlas (e.g. `spritesheet_n.png`).
   * Only set when {@link PackerOptions.normalMapPairing} produced pairs for the
   * current sheet. Formats may reference this in their exported metadata.
   */
  normalMapImageName?: string;
  /**
   * Optional namespace override for code-file generators (Swift/C#/C++). When
   * omitted the generator picks its own convention-appropriate default.
   */
  namespace?: string;
  /**
   * Optional top-level class/enum/struct name for code-file generators (used by
   * C# and Swift). When omitted the generator falls back to its default.
   */
  className?: string;
}

export interface FormatGenerator {
  /** Produce a single data file string from one sheet. */
  generate(sheet: PackSheet, options: FormatOptions): string;
  /** File extension without dot, e.g. `json`. */
  extension: string;
  /** Human label for menus. */
  label: string;
}
