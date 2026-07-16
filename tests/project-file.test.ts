import { describe, expect, it } from 'vitest';
import {
  createProjectDocument,
  decodeProjectSprites,
  parseProject,
  ProjectSpriteDecodeError,
  projectFileName,
  serializeProject,
} from '../src/lib/projectFile';

interface MutableSerializedProject {
  exportFormat?: unknown;
  settings: Record<string, unknown>;
  publishOptions: Record<string, unknown>;
  view: { pan: Record<string, unknown> };
  sprites: Array<Record<string, unknown>>;
  smartFolders: Array<Record<string, unknown>>;
  animations?: Array<Record<string, unknown>>;
}

describe('animation project persistence', () => {
  it('round-trips manual animation order and playback settings', () => {
    const document = createProjectDocument(projectState(), [{
      id: 'manual:hero',
      name: 'Hero run',
      frameIds: ['hero-id'],
      fps: 24,
      loop: false,
      source: 'manual',
    }]);

    expect(parseProject(serializeProject(document)).project.animations).toEqual([{
      id: 'manual:hero',
      name: 'Hero run',
      frameIds: ['hero-id'],
      fps: 24,
      loop: false,
      source: 'manual',
    }]);
  });

  it('opens older schema-v1 projects without animation data', () => {
    const document = createProjectDocument(projectState());
    const raw = JSON.parse(serializeProject(document)) as MutableSerializedProject;
    delete raw.animations;
    expect(parseProject(JSON.stringify(raw)).project.animations).toEqual([]);
  });

  it('rejects animation frames that reference missing sprites', () => {
    const document = createProjectDocument(projectState());
    const raw = JSON.parse(serializeProject(document)) as MutableSerializedProject;
    raw.animations = [{
      id: 'manual:bad', name: 'Bad', frameIds: ['missing'], fps: 12, loop: true, source: 'manual',
    }];
    expect(() => parseProject(JSON.stringify(raw))).toThrow('reference existing sprites');
  });
});

function projectState() {
  return {
    images: [
      {
        id: 'hero-id',
        name: 'characters/hero',
        width: 32,
        height: 48,
        image: {} as HTMLImageElement,
        url: 'data:image/png;base64,AA==',
        metadata: { pivot: { x: 0.5, y: 1 }, tags: ['player'] },
      },
    ],
    settings: {
      maxWidth: 2048,
      maxHeight: 2048,
      padding: 2,
      borderPadding: 1,
      shapePadding: 2,
      innerPadding: 3,
      allowRotation: true,
      powerOfTwo: true,
      forceSquare: false,
      algorithm: 'maxrects-bssf' as const,
      trimAlpha: true,
      trimThreshold: 2,
      trimMode: 'rect' as const,
      polygonTolerance: 2,
      extrude: 1,
      multipack: true,
    },
    exportFormat: 'json' as const,
    fileName: 'atlas',
    selectedDirPath: '/exports',
    publishOptions: {
      imageFormat: 'webp' as const,
      imageQuality: 0.8,
      scales: [0.5, 1, 2],
      imageFileTemplate: '{name}{suffix}{n}.{ext}',
      dataFileTemplate: '{name}{suffix}{n}.{ext}',
      bundleZip: true,
    },
    zoom: 1.5,
    pan: { x: 12, y: -3 },
    showBorders: false,
    showSpriteNames: true,
    bgMode: 'solid' as const,
    bgColor: '#123456',
    inspectorSections: {
      output: true,
      data: false,
      layout: true,
      effects: false,
      sprites: true,
    },
    leftPanelWidth: 300,
    rightPanelWidth: 340,
    sortMode: 'name-asc' as const,
    collapsedFolders: ['characters'],
    activeSheet: 1,
    smartFolders: [
      { id: 'folder-id', name: 'characters', trackedIds: ['hero-id'], lastSync: 123 },
    ],
  };
}

describe('project file schema', () => {
  it.each(['defold', 'spritekit', 'paper2d', 'monogame', 'solar2d'])(
    'round-trips the %s export format',
    (format) => {
      const raw = JSON.parse(
        serializeProject(createProjectDocument(projectState())),
      ) as MutableSerializedProject;
      raw.exportFormat = format;
      expect(parseProject(JSON.stringify(raw)).project.exportFormat).toBe(format);
    },
  );

  it('round-trips settings, publish options, view state, sprites, and smart-folder descriptors', () => {
    const document = createProjectDocument(projectState());
    const { project, warnings } = parseProject(serializeProject(document));
    expect(warnings).toEqual([]);
    expect(project.fileName).toBe('atlas');
    expect(project.settings).toEqual(document.settings);
    expect(project.settings).not.toHaveProperty('padding');
    expect(project.publishOptions.scales).toEqual([0.5, 1, 2]);
    expect(project.view.pan).toEqual({ x: 12, y: -3 });
    expect(project.sprites[0].name).toBe('characters/hero');
    expect(project.sprites[0].metadata).toEqual({
      pivot: { x: 0.5, y: 1 },
      tags: ['player'],
    });
    expect(project.smartFolders[0]).toMatchObject({
      name: 'characters',
      trackedSpriteNames: ['characters/hero'],
      requiresAuthorization: true,
    });
  });

  it('migrates the legacy JSON project shape and asks the user to resave', () => {
    const state = projectState();
    const legacy = JSON.stringify({
      version: '1.0',
      tool: 'web-texturepacker',
      settings: { ...state.settings, padding: 9, shapePadding: 2, trimMode: 'polygon' },
      exportFormat: state.exportFormat,
      fileName: state.fileName,
      selectedDirPath: state.selectedDirPath,
      images: state.images.map((image) => ({
        id: image.id,
        name: image.name,
        width: image.width,
        height: image.height,
        imageData: image.url,
      })),
    });
    const parsed = parseProject(legacy);
    expect(parsed.project.sprites).toHaveLength(1);
    expect(parsed.project.settings.shapePadding).toBe(9);
    expect(parsed.project.settings).not.toHaveProperty('padding');
    expect(parsed.project.settings.trimMode).toBe('polygon-outline');
    expect(parsed.project.publishOptions).toMatchObject({ imageFormat: 'png', scales: [1] });
    expect(parsed.warnings[0]).toContain('migrated');
  });

  it('migrates the old polygon label to explicit outline metadata semantics', () => {
    const document = createProjectDocument(projectState());
    const raw = JSON.stringify({
      ...document,
      settings: { ...document.settings, trimMode: 'polygon' },
    });
    expect(parseProject(raw).project.settings.trimMode).toBe('polygon-outline');
  });

  it('rejects unsupported schemas and sanitizes output names', () => {
    expect(() => parseProject('{"format":"web-texturepacker-project","schemaVersion":99}')).toThrow(
      'schema version',
    );
    expect(projectFileName('ui:atlas')).toBe('ui-atlas.wtp.json');
  });

  it.each([
    ['invalid algorithm', (project: MutableSerializedProject) => { project.settings.algorithm = 'magic'; }],
    ['invalid publish scale', (project: MutableSerializedProject) => { project.publishOptions.scales = [1, 0]; }],
    ['invalid nested view', (project: MutableSerializedProject) => { project.view.pan.x = 'left'; }],
    ['non-embedded sprite', (project: MutableSerializedProject) => { project.sprites[0].imageData = 'blob:expired'; }],
    ['invalid Smart Folder', (project: MutableSerializedProject) => { project.smartFolders[0].requiresAuthorization = false; }],
  ])('rejects %s instead of casting it into application state', (_label, mutate) => {
    const project = JSON.parse(
      serializeProject(createProjectDocument(projectState())),
    ) as MutableSerializedProject;
    mutate(project);
    expect(() => parseProject(JSON.stringify(project))).toThrow(/invalid|settings/i);
  });

  it('rejects duplicate sprite ids', () => {
    const project = createProjectDocument(projectState());
    project.sprites.push({ ...project.sprites[0], name: 'characters/hero-copy' });
    expect(() => parseProject(serializeProject(project))).toThrow('ids must be unique');
  });

  it('retains pending Smart Folder names when a restored project is saved again', () => {
    const parsed = parseProject(serializeProject(createProjectDocument(projectState()))).project;
    const restoredState = {
      ...projectState(),
      smartFolders: parsed.smartFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        trackedIds: [],
        trackedSpriteNames: [...folder.trackedSpriteNames],
        lastSync: folder.lastSync,
        requiresAuthorization: true,
      })),
    };

    expect(createProjectDocument(restoredState).smartFolders[0].trackedSpriteNames).toEqual([
      'characters/hero',
    ]);
  });
});

describe('project sprite decoding', () => {
  function imageFactory(outcomes: Array<'load' | 'error'>): () => HTMLImageElement {
    let index = 0;
    return () => {
      const outcome = outcomes[index++] ?? 'load';
      let source = '';
      const image = {
        width: 16,
        height: 24,
        onload: null as null | (() => void),
        onerror: null as null | (() => void),
        get src() { return source; },
        set src(value: string) {
          source = value;
          queueMicrotask(() => outcome === 'load' ? image.onload?.() : image.onerror?.());
        },
      };
      return image as unknown as HTMLImageElement;
    };
  }

  it('decodes all sprites and carries forward per-sprite metadata', async () => {
    const project = createProjectDocument(projectState());
    const decoded = await decodeProjectSprites(project.sprites, imageFactory(['load']));

    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      name: 'characters/hero',
      width: 16,
      height: 24,
      metadata: { pivot: { x: 0.5, y: 1 }, tags: ['player'] },
    });
  });

  it('rejects the whole decode batch and identifies corrupt sprites', async () => {
    const project = createProjectDocument(projectState());
    project.sprites.push({
      ...project.sprites[0],
      id: 'broken-id',
      name: 'broken',
      imageData: 'data:image/png;base64,broken',
    });

    const decoding = decodeProjectSprites(project.sprites, imageFactory(['load', 'error']));
    await expect(decoding).rejects.toBeInstanceOf(ProjectSpriteDecodeError);
    await expect(decoding).rejects.toMatchObject({
      name: 'ProjectSpriteDecodeError',
      spriteNames: ['broken'],
    });
  });
});
