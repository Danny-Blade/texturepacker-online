import JSZip from 'jszip';
import type { PackResult, PackSheet, PackedItem, ExportFormat } from './packer';
import { getFormat } from './formats';
import type { PublishOptions } from './store';

export interface PublishContext {
  packResult: PackResult;
  publishOptions: PublishOptions;
  exportFormat: ExportFormat;
  fileName: string;
  dirHandle: FileSystemDirectoryHandle | null;
}

export interface PublishedFile {
  name: string;
  blob: Blob;
}

interface TemplateVars {
  name: string;
  n: string;
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
    .replace('{n}', vars.isSingleSheet ? '' : vars.n)
    .replace('{suffix}', vars.suffix)
    .replace('{name}', vars.name)
    .replace('{ext}', vars.ext);
}

export function imageMimeFor(format: 'png' | 'jpg' | 'webp'): string {
  if (format === 'jpg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

export function imageExtFor(format: 'png' | 'jpg' | 'webp'): string {
  return format === 'jpg' ? 'jpg' : format;
}

export interface PreviewFilenames {
  images: string[];
  dataFiles: string[];
}

export function previewFilenames(ctx: {
  packResult: PackResult | null;
  publishOptions: PublishOptions;
  exportFormat: ExportFormat;
  fileName: string;
}): PreviewFilenames {
  const sheets = ctx.packResult?.sheets ?? [];
  const sheetCount = Math.max(1, sheets.length);
  const scales = ctx.publishOptions.scales.length > 0 ? ctx.publishOptions.scales : [1];
  const imageExt = imageExtFor(ctx.publishOptions.imageFormat);
  const dataExt = getFormat(ctx.exportFormat).extension;
  const isSingleSheet = sheetCount <= 1;
  const images: string[] = [];
  const dataFiles: string[] = [];
  for (const scale of scales) {
    const suffix = suffixForScale(scale);
    for (let i = 0; i < sheetCount; i++) {
      const n = sheetIndexLabel(i, sheetCount);
      images.push(
        expandTemplate(ctx.publishOptions.imageFileTemplate, {
          name: ctx.fileName,
          n,
          suffix,
          ext: imageExt,
          isSingleSheet,
        }),
      );
      dataFiles.push(
        expandTemplate(ctx.publishOptions.dataFileTemplate, {
          name: ctx.fileName,
          n,
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
  scale: number,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const width = Math.max(1, Math.round(sheet.width * scale));
    const height = Math.max(1, Math.round(sheet.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }
    if (scale !== 1) ctx.scale(scale, scale);
    sheet.packed.forEach((item: PackedItem) => {
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
    if (mime === 'image/png') {
      canvas.toBlob((b) => resolve(b), mime);
    } else {
      canvas.toBlob((b) => resolve(b), mime, quality);
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
    const fh = await dh.getFileHandle(f.name, { create: true });
    const w = await fh.createWritable();
    await w.write(f.blob);
    await w.close();
  }
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface PublishResult {
  files: PublishedFile[];
  delivered: 'zip' | 'directory' | 'download';
}

export async function performPublish(ctx: PublishContext): Promise<PublishResult> {
  const { packResult, publishOptions, exportFormat, fileName, dirHandle } = ctx;
  const sheets = packResult.sheets;
  if (sheets.length === 0) {
    return { files: [], delivered: 'download' };
  }
  const scales = publishOptions.scales.length > 0 ? publishOptions.scales : [1];
  const imageExt = imageExtFor(publishOptions.imageFormat);
  const dataExt = getFormat(exportFormat).extension;
  const mime = imageMimeFor(publishOptions.imageFormat);
  const isSingleSheet = sheets.length <= 1;

  const files: PublishedFile[] = [];

  for (const scale of scales) {
    const suffix = suffixForScale(scale);

    const imageNamesForScale: string[] = sheets.map((_, i) =>
      expandTemplate(publishOptions.imageFileTemplate, {
        name: fileName,
        n: sheetIndexLabel(i, sheets.length),
        suffix,
        ext: imageExt,
        isSingleSheet,
      }),
    );

    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      const imgBlob = await renderSheetToBlob(sheet, scale, mime, publishOptions.imageQuality);
      if (imgBlob) {
        files.push({ name: imageNamesForScale[i], blob: imgBlob });
      }

      const dataName = expandTemplate(publishOptions.dataFileTemplate, {
        name: fileName,
        n: sheetIndexLabel(i, sheets.length),
        suffix,
        ext: dataExt,
        isSingleSheet,
      });

      const dataStr = getFormat(exportFormat).generate(sheet, {
        fileName,
        imageFileName: (sheetIndex) => imageNamesForScale[sheetIndex] ?? imageNamesForScale[i],
        dataFileName: dataName,
        scale,
      });
      files.push({
        name: dataName,
        blob: new Blob([dataStr], { type: 'text/plain' }),
      });
    }
  }

  if (publishOptions.bundleZip) {
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f.blob);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(`${fileName}.zip`, zipBlob);
    return { files, delivered: 'zip' };
  }

  if (dirHandle) {
    try {
      await writeToDir(dirHandle, files);
      return { files, delivered: 'directory' };
    } catch {
      /* fall through to download */
    }
  }

  for (const f of files) triggerDownload(f.name, f.blob);
  return { files, delivered: 'download' };
}
