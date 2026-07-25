/**
 * Browser-agnostic Packer Core (P3-01).
 *
 * Everything reachable from this barrel is safe to import from a Node CLI or
 * Web Worker with no DOM shim: types + packing algorithm + format generators
 * + a factory-based image pipeline. `generateExportData` is also exported by
 * `./packer` for legacy paths, but we re-export it from `./formats` here to
 * avoid an ambiguous `export *` collision.
 */
export {
  MaxRectsPacker,
  packIntoSheets,
  tightenLayout,
  defaultPrepareSprite,
  nextPowerOfTwo,
} from './packer';
export type {
  ImageItem,
  PackedItem,
  PackSheet,
  PackResult,
  PackerOptions,
  PackingAlgorithm,
  SpriteEffects,
  SpriteMesh,
  SpritePolygon,
  SpritePreparer,
  TrimInfo,
  TrimMode,
  SizeMode,
  SizeConstraint,
  PackMode,
  ManualSheetDefinition,
  ExportFormat,
  PreparedSprite,
  TightenOptions,
} from './packer';
export * from './polygonCollision';
export * from './triangulate';
export * from './formats';
export * from './renderer';
export * from './imagePipeline';
