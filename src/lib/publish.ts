import JSZip from 'jszip';
import { packIntoSheets, type PackResult, type PackSheet, type PackedItem, type ExportFormat, type PackerOptions } from './packer';
import { getFormat } from './formats';
import { encodePng8, type Png8EncodeOptions } from './png8';
import type { PublishOptions, ScalingVariant } from './store';
import { prepareSpriteForAtlas } from './imageProcessing';
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from './imageValidation';

export interface PublishContext {
  packResult: PackResult;
  publishOptions: PublishOptions;
  exportFormat: ExportFormat;
  fileName: string;
  dirHandle: FileSystemDirectoryHandle | null;
  packerOptions?: PackerOptions;
}

export interface PublishedFile {
  name: string;
  blob: Blob;
}

interface TemplateVars {
  name: string;
  n: string;
  n0: string;
  n1: string;
  v?: string;
  suffix: string;
  ext: string;
  isSingleSheet: boolean;
}

export function suffixForScale(scale: number): string {
  if (scale === 1) return '';
  if (scale === 2) return '@2x';
  if (scale === 0.5) return '@0.5x';
  return `@${scale}x`;
}

export function sheetIndexLabel(idx0: number, totalSheets: number): string {
  if (totalSheets <= 1) return '';
  const i = idx0 + 1;
  return totalSheets >= 10 ? String(i).padStart(2, '0') : String(i);
}

export function expandTemplate(template: string, vars: TemplateVars): string {
  return template
    .replaceAll('{n0}', vars.isSingleSheet ? '' : vars.n0)
    .replaceAll('{n1}', vars.isSingleSheet ? '' : vars.n1)
    .replaceAll('{n}', vars.isSingleSheet ? '' : vars.n)
    .replaceAll('{v}', vars.v ?? '')
    .replaceAll('{suffix}', vars.suffix)
    .replaceAll('{name}', vars.name)
    .replaceAll('{ext}', vars.ext);
}

interface ResolvedVariant extends ScalingVariant {
  sameLayout: boolean;
}

function resolveVariants(options: PublishOptions): ResolvedVariant[] {
  if (options.variants && options.variants.length > 0) {
    return options.variants.map((variant) => ({ ...variant, sameLayout: variant.sameLayout ?? true }));
  }
  const scales = options.scales.length > 0 ? options.scales : [1];
  return scales.map((scale) => ({
    id: `scale-${scale}`,
    name: `${scale}x`,
    scale,
    suffix: suffixForScale(scale),
    sort: 'layout',
    algorithm: 'bilinear',
    sameLayout: true,
  }));
}

function sheetsForVariant(
  packResult: PackResult,
  variant: ResolvedVariant,
  packerOptions?: PackerOptions,
): PackSheet[] {
  const needle = variant.filter?.trim().toLowerCase();
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);
  const filteredSheets = needle
    ? packResult.sheets
        .map((sheet) => ({ ...sheet, packed: sheet.packed.filter((item) => matches(item.name)) }))
        .filter((sheet) => sheet.packed.length > 0)
    : packResult.sheets;
  if (variant.sameLayout || !packerOptions) return filteredSheets;

  const seen = new Set<string>();
  const items = filteredSheets
    .flatMap((sheet) => sheet.packed)
    .filter((item) => !seen.has(item.id) && seen.add(item.id));
  if (variant.sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  if (variant.sort === 'area') items.sort((a, b) => b.width * b.height - a.width * a.height);
  const maxWidth = Math.max(1, Math.floor((variant.maxWidth ?? packerOptions.maxWidth * variant.scale) / variant.scale));
  const maxHeight = Math.max(1, Math.floor((variant.maxHeight ?? packerOptions.maxHeight * variant.scale) / variant.scale));
  return packIntoSheets(items, {
    ...packerOptions,
    maxWidth,
    maxHeight,
    multipack: true,
    multipackMode: 'auto',
  }, prepareSpriteForAtlas).sheets;
}

export type ImageFileFormatLite = 'png' | 'png-8' | 'jpg' | 'webp';

export function imageMimeFor(format: ImageFileFormatLite): string {
  if (format === 'jpg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

export function imageExtFor(format: ImageFileFormatLite): string {
  if (format === 'jpg') return 'jpg';
  if (format === 'png-8') return 'png';
  return format;
}

export interface PreviewFilenames {
  images: string[];
  dataFiles: string[];
}

/**
 * Convert an atlas sheet to the physical pixel coordinates of a scale variant.
 *
 * Atlas formats generally require integer pixel coordinates, so every numeric
 * field uses the same nearest-pixel rule. Bitmap sources are deliberately kept
 * by reference: renderSheetToBlob resamples them into the scaled destination
 * rectangles described by the returned sheet.
 */
export function scalePackSheet(sheet: PackSheet, scale: number): PackSheet {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('Publish scale must be a finite number greater than zero.');
  }

  const coordinate = (value: number): number => Math.round(value * scale);
  const dimension = (value: number): number => Math.max(1, coordinate(value));

  return {
    ...sheet,
    width: dimension(sheet.width),
    height: dimension(sheet.height),
    packed: sheet.packed.map((item) => ({
      ...item,
      x: coordinate(item.x),
      y: coordinate(item.y),
      width: dimension(item.width),
      height: dimension(item.height),
      sourceSize: {
        w: dimension(item.sourceSize.w),
        h: dimension(item.sourceSize.h),
      },
      spriteSourceSize: {
        x: coordinate(item.spriteSourceSize.x),
        y: coordinate(item.spriteSourceSize.y),
        w: dimension(item.spriteSourceSize.w),
        h: dimension(item.spriteSourceSize.h),
      },
      extrudePadding:
        item.extrudePadding === undefined ? undefined : coordinate(item.extrudePadding),
      polygon: item.polygon?.map(coordinate),
      // Mesh vertices live in sprite-local (unrotated, frame-relative)
      // coordinates. Scaling them alongside the frame keeps atlas consumers
      // in sync with the scaled trimmed-frame dimensions; UVs are normalized
      // to the frame so they stay untouched by scaling.
      mesh: item.mesh
        ? {
            vertices: item.mesh.vertices.map(coordinate),
            triangles: item.mesh.triangles.slice(),
            uvs: item.mesh.uvs.slice(),
          }
        : undefined,
      normalMapFrame: item.normalMapFrame
        ? {
            x: coordinate(item.normalMapFrame.x),
            y: coordinate(item.normalMapFrame.y),
            w: dimension(item.normalMapFrame.w),
            h: dimension(item.normalMapFrame.h),
          }
        : undefined,
      normalMapImage: item.normalMapImage,
    })),
  };
}

export function previewFilenames(ctx: {
  packResult: PackResult | null;
  publishOptions: PublishOptions;
  exportFormat: ExportFormat;
  fileName: string;
}): PreviewFilenames {
  const imageExt = imageExtFor(ctx.publishOptions.imageFormat);
  const dataExt = getFormat(ctx.exportFormat).extension;
  const images: string[] = [];
  const dataFiles: string[] = [];
  for (const variant of resolveVariants(ctx.publishOptions)) {
    const sheets = ctx.packResult ? sheetsForVariant(ctx.packResult, variant) : [];
    const sheetCount = Math.max(1, sheets.length);
    const isSingleSheet = sheetCount <= 1;
    const suffix = variant.suffix;
    for (let i = 0; i < sheetCount; i++) {
      const n = sheetIndexLabel(i, sheetCount);
      const n0 = sheetCount >= 10 ? String(i).padStart(2, '0') : String(i);
      const n1 = sheetCount >= 10 ? String(i + 1).padStart(2, '0') : String(i + 1);
      images.push(
        expandTemplate(ctx.publishOptions.imageFileTemplate, {
          name: ctx.fileName,
          n,
          n0,
          n1,
          v: variant.name,
          suffix,
          ext: imageExt,
          isSingleSheet,
        }),
      );
      dataFiles.push(
        expandTemplate(ctx.publishOptions.dataFileTemplate, {
          name: ctx.fileName,
          n,
          n0,
          n1,
          v: variant.name,
          suffix,
          ext: dataExt,
          isSingleSheet,
        }),
      );
    }
  }
  return { images, dataFiles };
}

function renderSheetToBlob(
  sheet: PackSheet,
  format: ImageFileFormatLite,
  quality: number,
  scalingAlgorithm: ScalingVariant['algorithm'] = 'bilinear',
  png8Options?: Png8EncodeOptions,
  layer: 'color' | 'normal' = 'color',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (sheet.width > MAX_IMAGE_DIMENSION || sheet.height > MAX_IMAGE_DIMENSION) {
      reject(
        new Error(
          `Output sheet ${sheet.index + 1} is ${sheet.width}×${sheet.height}; reduce the maximum size below ${MAX_IMAGE_DIMENSION}px.`,
        ),
      );
      return;
    }
    if (sheet.width * sheet.height > MAX_IMAGE_PIXELS) {
      reject(
        new Error(
          `Output sheet ${sheet.index + 1} needs ${sheet.width * sheet.height} pixels; enable Multipack or reduce its maximum size.`,
        ),
      );
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = sheet.width;
    canvas.height = sheet.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(
        new Error(
          `The browser could not allocate a ${sheet.width}×${sheet.height} canvas for sheet ${sheet.index + 1}. Enable Multipack or reduce the maximum atlas size.`,
        ),
      );
      return;
    }
    ctx.imageSmoothingEnabled = scalingAlgorithm !== 'nearest';
    if (ctx.imageSmoothingEnabled) {
      ctx.imageSmoothingQuality = scalingAlgorithm === 'bicubic' ? 'high' : 'medium';
    }
    sheet.packed.forEach((item: PackedItem) => {
      // Normal-map pass: skip sprites without a paired normal, and draw the
      // normal image at the colour frame's coordinates so both atlases share
      // the same layout.
      if (layer === 'normal') {
        if (!item.normalMapImage || !item.normalMapFrame) return;
        const nf = item.normalMapFrame;
        ctx.save();
        if (item.rotated) {
          ctx.translate(nf.x + nf.h, nf.y);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(item.normalMapImage, 0, 0, nf.w, nf.h);
        } else {
          ctx.drawImage(item.normalMapImage, nf.x, nf.y, nf.w, nf.h);
        }
        ctx.restore();
        return;
      }
      const src = item.pixelSource ?? item.image;
      const ex = item.extrudePadding ?? 0;
      ctx.save();
      if (item.rotated) {
        ctx.translate(item.x + item.height, item.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(src, -ex, -ex, item.width + ex * 2, item.height + ex * 2);
      } else {
        ctx.drawImage(src, item.x - ex, item.y - ex, item.width + ex * 2, item.height + ex * 2);
      }
      ctx.restore();
    });
    if (format === 'png-8') {
      encodePng8(canvas, png8Options).then(
        (b) => resolve(b),
        (error) => reject(error instanceof Error ? error : new Error(String(error))),
      );
      return;
    }
    const mime = imageMimeFor(format);
    if (mime === 'image/png') {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('PNG encoding failed. Try a smaller atlas or another browser.')),
        mime,
      );
    } else {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(
                new Error(
                  `${format.toUpperCase()} encoding failed in this browser. Try PNG output or another browser.`,
                ),
              ),
        mime,
        quality,
      );
    }
  });
}

interface DirHandleAny {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

async function writeToDir(
  dirHandle: FileSystemDirectoryHandle,
  files: PublishedFile[],
): Promise<void> {
  const dh = dirHandle as unknown as DirHandleAny;
  for (const f of files) {
    try {
      const fh = await dh.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable();
      await w.write(f.blob);
      await w.close();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not write "${f.name}" (${reason}). Check the folder permission and available disk space.`,
      );
    }
  }
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  let appended = false;
  try {
    document.body.appendChild(a);
    appended = true;
    a.click();
  } finally {
    if (appended) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export interface PublishResult {
  files: PublishedFile[];
  delivered: 'zip' | 'directory' | 'download';
  warnings: string[];
}

function unpackedSpritesWarning(packResult: PackResult): string | null {
  if (packResult.failed.length === 0) return null;
  const visibleNames = packResult.failed.slice(0, 5).map((item) => `"${item.name}"`);
  const remaining = packResult.failed.length - visibleNames.length;
  const names = `${visibleNames.join(', ')}${remaining > 0 ? ` and ${remaining} more` : ''}`;
  return `${packResult.failed.length} sprite(s) were not packed and are missing from the published files: ${names}. Enable Multipack or increase the maximum atlas size, then publish again for a complete result.`;
}

function publishImageError(
  fileName: string,
  sheet: PackSheet,
  scale: number,
  error: unknown,
): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `Could not create "${fileName}" from sheet ${sheet.index + 1} at ${scale}x (${sheet.width}×${sheet.height}): ${reason} If the problem persists, try a smaller atlas, PNG output, or another browser.`,
  );
}

export async function performPublish(ctx: PublishContext): Promise<PublishResult> {
  const { packResult, publishOptions, exportFormat, fileName, dirHandle } = ctx;
  const sheets = packResult.sheets;
  const warnings: string[] = [];
  const unpackedWarning = unpackedSpritesWarning(packResult);
  if (unpackedWarning) warnings.push(unpackedWarning);
  if (sheets.length === 0) {
    if (unpackedWarning) throw new Error(unpackedWarning);
    return { files: [], delivered: 'download', warnings };
  }
  const imageExt = imageExtFor(publishOptions.imageFormat);
  const dataExt = getFormat(exportFormat).extension;

  const files: PublishedFile[] = [];

  for (const variant of resolveVariants(publishOptions)) {
    const variantSheets = sheetsForVariant(packResult, variant, ctx.packerOptions);
    if (variantSheets.length === 0) {
      warnings.push(`Scaling variant "${variant.name}" matched no sprites and was skipped.`);
      continue;
    }
    const scale = variant.scale;
    const suffix = variant.suffix;
    const isSingleSheet = variantSheets.length <= 1;

    const imageNamesForScale: string[] = variantSheets.map((_, i) =>
      expandTemplate(publishOptions.imageFileTemplate, {
        name: fileName,
        n: sheetIndexLabel(i, variantSheets.length),
        n0: String(i),
        n1: String(i + 1),
        v: variant.name,
        suffix,
        ext: imageExt,
        isSingleSheet,
      }),
    );

    for (let i = 0; i < variantSheets.length; i++) {
      const sheet = scalePackSheet(variantSheets[i], scale);
      if ((variant.maxWidth && sheet.width > variant.maxWidth)
        || (variant.maxHeight && sheet.height > variant.maxHeight)) {
        throw new Error(
          `Scaling variant "${variant.name}" produced ${sheet.width}×${sheet.height}, exceeding its ${variant.maxWidth ?? '∞'}×${variant.maxHeight ?? '∞'} limit. Enable variant repacking or increase the limit.`,
        );
      }
      let imgBlob: Blob;
      try {
        imgBlob = await renderSheetToBlob(
          sheet,
          publishOptions.imageFormat,
          publishOptions.imageQuality,
          variant.algorithm,
          {
            maxColors: publishOptions.png8Colors,
            dither: publishOptions.png8Dither,
            ditherStrength: publishOptions.png8DitherStrength,
          },
        );
      } catch (error) {
        throw publishImageError(imageNamesForScale[i], sheet, scale, error);
      }
      files.push({ name: imageNamesForScale[i], blob: imgBlob });

      // Companion normal-map atlas — same layout, dedicated `_n.<ext>` file.
      // Only emitted when at least one packed sprite on the sheet has a
      // detected normal-map pair.
      const hasNormalMap = sheet.packed.some((item) => item.normalMapImage && item.normalMapFrame);
      let normalMapFileName: string | undefined;
      if (hasNormalMap) {
        const baseImage = imageNamesForScale[i];
        const dot = baseImage.lastIndexOf('.');
        normalMapFileName = dot > 0
          ? `${baseImage.slice(0, dot)}_n${baseImage.slice(dot)}`
          : `${baseImage}_n`;
        try {
          const normalBlob = await renderSheetToBlob(
            sheet,
            publishOptions.imageFormat,
            publishOptions.imageQuality,
            variant.algorithm,
            {
              maxColors: publishOptions.png8Colors,
              dither: publishOptions.png8Dither,
              ditherStrength: publishOptions.png8DitherStrength,
            },
            'normal',
          );
          files.push({ name: normalMapFileName, blob: normalBlob });
        } catch (error) {
          throw publishImageError(normalMapFileName, sheet, scale, error);
        }
      }

      const dataName = expandTemplate(publishOptions.dataFileTemplate, {
        name: fileName,
        n: sheetIndexLabel(i, variantSheets.length),
        n0: String(i),
        n1: String(i + 1),
        v: variant.name,
        suffix,
        ext: dataExt,
        isSingleSheet,
      });

      const dataStr = getFormat(exportFormat).generate(sheet, {
        fileName,
        imageFileName: (sheetIndex) => imageNamesForScale[sheetIndex] ?? imageNamesForScale[i],
        dataFileName: dataName,
        scale,
        normalMapImageName: normalMapFileName,
      });
      files.push({
        name: dataName,
        blob: new Blob([dataStr], { type: 'text/plain' }),
      });
    }
  }

  if (publishOptions.bundleZip) {
    const zipName = `${fileName}.zip`;
    let zipBlob: Blob;
    try {
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.blob);
      zipBlob = await zip.generateAsync({ type: 'blob' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not create "${zipName}" (${reason}). Disable ZIP bundling or reduce the atlas size and try again.`,
      );
    }
    try {
      triggerDownload(zipName, zipBlob);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not download "${zipName}" (${reason}). Check browser download permissions.`);
    }
    return { files, delivered: 'zip', warnings };
  }

  if (dirHandle) {
    try {
      await writeToDir(dirHandle, files);
      return { files, delivered: 'directory', warnings };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`Directory write failed (${reason}); files were downloaded instead.`);
    }
  }

  for (const f of files) {
    try {
      triggerDownload(f.name, f.blob);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not download "${f.name}" (${reason}). Check browser download permissions or publish as a ZIP file.`,
      );
    }
  }
  return { files, delivered: 'download', warnings };
}
