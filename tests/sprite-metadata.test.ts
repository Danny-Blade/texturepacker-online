import { describe, expect, it } from 'vitest';
import type { ImageItem, PackSheet, PackedItem, PackerOptions } from '../src/lib/packer';
import jsonHash from '../src/lib/formats/jsonHash';
import jsonArray from '../src/lib/formats/jsonArray';
import unity from '../src/lib/formats/unity';
import cocos2d from '../src/lib/formats/cocos2d';
import {
  createProjectDocument,
  parseProject,
  serializeProject,
} from '../src/lib/projectFile';
import {
  normalizeNineSlice,
  resolvePivot,
  spriteMetadataForExport,
} from '../src/lib/spriteMetadata';

const image = {} as HTMLImageElement;
const metadata = {
  pivot: { mode: 'absolute' as const, x: 8, y: 3 },
  nineSlice: {
    border: { left: 2, right: 4, top: 1, bottom: 3 },
    content: { left: 5, right: 2, top: 4, bottom: 1 },
  },
};

function packed(): PackedItem {
  return {
    id: 'button', name: 'ui/button.png', width: 16, height: 10, image, url: 'data:image/png;base64,AA==', metadata,
    x: 4, y: 6, rotated: false, placed: true, sheetIndex: 0, trimmed: false,
    sourceSize: { w: 16, h: 10 }, spriteSourceSize: { x: 0, y: 0, w: 16, h: 10 },
  };
}

function sheet(): PackSheet {
  return { index: 0, width: 64, height: 32, packed: [packed()] };
}

const formatOptions = {
  fileName: 'atlas', imageFileName: () => 'atlas.png', dataFileName: 'atlas.json', scale: 1,
};

describe('sprite pivot and 9-slice metadata', () => {
  it('resolves relative and absolute pivots', () => {
    expect(resolvePivot({ pivot: { mode: 'relative', x: 0.25, y: 0.75 } }, 20, 10)).toMatchObject({
      normalized: { x: 0.25, y: 0.75 }, pixels: { x: 5, y: 7.5 },
    });
    expect(resolvePivot({ pivot: { mode: 'absolute', x: 5, y: 7.5 } }, 20, 10)).toMatchObject({
      normalized: { x: 0.25, y: 0.75 }, pixels: { x: 5, y: 7.5 },
    });
  });

  it('clamps opposite 9-slice insets to the source dimensions', () => {
    expect(normalizeNineSlice({
      border: { left: 8, right: 8, top: 6, bottom: 6 },
      content: { left: 2, right: 3, top: 4, bottom: 5 },
    }, 10, 10)).toEqual({
      border: { left: 8, right: 2, top: 6, bottom: 4 },
      content: { left: 2, right: 3, top: 4, bottom: 5 },
    });
  });

  it('scales absolute metadata while preserving normalized pivot values', () => {
    expect(spriteMetadataForExport(metadata, 16, 10, 2)).toEqual({
      pivot: {
        mode: 'absolute', x: 8, y: 3,
        normalized: { x: 0.5, y: 0.3 }, pixels: { x: 16, y: 6 },
      },
      nineSlice: {
        border: { left: 4, right: 8, top: 2, bottom: 6 },
        content: { left: 10, right: 4, top: 8, bottom: 2 },
      },
    });
  });

  it.each([jsonHash, jsonArray])('exports authored metadata in JSON', (format) => {
    const data = JSON.parse(format.generate(sheet(), formatOptions));
    const frame = Array.isArray(data.frames) ? data.frames[0] : data.frames['ui/button.png'];
    expect(frame.metadata.pivot.normalized).toEqual({ x: 0.5, y: 0.3 });
    expect(frame.metadata.nineSlice.border).toEqual(metadata.nineSlice.border);
  });

  it('maps pivot and border to Unity conventions', () => {
    const data = JSON.parse(unity.generate(sheet(), formatOptions));
    expect(data.sprites[0].pivot).toEqual({ x: 0.5, y: 0.3 });
    expect(data.sprites[0].border).toEqual({ x: 2, y: 3, z: 4, w: 1 });
    expect(data.sprites[0].contentPadding).toEqual(metadata.nineSlice.content);
  });

  it('emits Cocos2d anchor, capInsets and contentRect', () => {
    const output = cocos2d.generate(sheet(), formatOptions);
    expect(output).toContain('<key>anchor</key>\n      <string>{0.5,0.3}</string>');
    expect(output).toContain('<key>capInsets</key>\n      <string>{{2,3},{10,6}}</string>');
    expect(output).toContain('<key>contentRect</key>\n      <string>{{5,1},{9,5}}</string>');
  });
});

describe('project sprite metadata', () => {
  const settings: PackerOptions = {
    maxWidth: 64, maxHeight: 64, borderPadding: 0, shapePadding: 1, innerPadding: 0,
    allowRotation: false, powerOfTwo: false, forceSquare: false, algorithm: 'maxrects-bssf',
    trimAlpha: false, trimThreshold: 1, trimMode: 'none', polygonTolerance: 2,
    extrude: 0, multipack: false,
  };
  const sprite: ImageItem = { ...packed() };

  it('round-trips pivot and 9-slice in .wtp.json', () => {
    const project = createProjectDocument({
      images: [sprite], settings, exportFormat: 'json', fileName: 'atlas', selectedDirPath: '',
      publishOptions: { imageFormat: 'png', imageQuality: 0.9, scales: [1], imageFileTemplate: '{name}.{ext}', dataFileTemplate: '{name}.{ext}', bundleZip: false },
      zoom: 1, pan: { x: 0, y: 0 }, showBorders: true, showSpriteNames: false,
      bgMode: 'checker', bgColor: '#000000', inspectorSections: { output: true, data: true, layout: true, effects: true, sprites: true },
      leftPanelWidth: 280, rightPanelWidth: 320, sortMode: 'manual', collapsedFolders: [], activeSheet: 0, smartFolders: [],
    });
    expect(parseProject(serializeProject(project)).project.sprites[0].metadata).toEqual(metadata);
  });

  it('rejects malformed known metadata without accepting a partial project', () => {
    const raw = JSON.stringify({
      format: 'web-texturepacker-project', schemaVersion: 1, savedAt: new Date().toISOString(),
      settings, exportFormat: 'json', fileName: 'atlas', selectedDirPath: '',
      publishOptions: { imageFormat: 'png', imageQuality: 0.9, scales: [1], imageFileTemplate: '{name}.{ext}', dataFileTemplate: '{name}.{ext}', bundleZip: false },
      view: { zoom: 1, pan: { x: 0, y: 0 }, showBorders: true, showSpriteNames: false, bgMode: 'checker', bgColor: '#000', inspectorSections: { output: true, data: true, layout: true, effects: true, sprites: true }, leftPanelWidth: 280, rightPanelWidth: 320, sortMode: 'manual', collapsedFolders: [], activeSheet: 0 },
      sprites: [{ id: 'x', name: 'x.png', width: 1, height: 1, imageData: 'data:image/png;base64,AA==', metadata: { pivot: { mode: 'relative', x: 2, y: 0 } } }],
      smartFolders: [],
    });
    expect(() => parseProject(raw)).toThrow('Project sprites are invalid');
  });
});
