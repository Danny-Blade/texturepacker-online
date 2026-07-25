import { describe, expect, it } from 'vitest';
import { getFormat } from '../src/lib/formats';
import type { PackedItem, PackSheet, SpriteMesh } from '../src/lib/packer';

/**
 * These tests confirm that the JSON Hash generator carries mesh metadata when
 * the exportMesh flag is on. We build the PackedItem manually rather than
 * driving the full packer/prepare pipeline because that path requires a real
 * DOM canvas — see tests/mesh-integration.spec area for future coverage.
 */

const polygon = [0, 0, 10, 0, 10, 6, 0, 6];

const mesh: SpriteMesh = {
  // Same as `polygon`; mesh vertices ARE the polygon in sprite-local coords.
  vertices: polygon.slice(),
  // Simple two-triangle fan for a rectangle: (0,1,2) + (0,2,3).
  triangles: [0, 1, 2, 0, 2, 3],
  // UVs normalize each vertex to the frame extent (10x6 here).
  uvs: [0, 0, 1, 0, 1, 1, 0, 1],
};

function buildSheet(withMesh: boolean): PackSheet {
  const item: PackedItem = {
    id: 'hero',
    name: 'hero.png',
    width: 10,
    height: 6,
    image: {} as HTMLImageElement,
    url: 'blob:hero',
    x: 4,
    y: 5,
    rotated: false,
    placed: true,
    sheetIndex: 0,
    trimmed: false,
    sourceSize: { w: 10, h: 6 },
    spriteSourceSize: { x: 0, y: 0, w: 10, h: 6 },
    polygon: polygon.slice(),
    mesh: withMesh ? mesh : undefined,
  };
  return { index: 0, width: 32, height: 16, packed: [item] };
}

describe('mesh export in atlas formats', () => {
  it('emits mesh.vertices/triangles/uvs in JSON Hash frames when exportMesh is on', () => {
    const json = getFormat('json').generate(buildSheet(true), {
      fileName: 'atlas',
      imageFileName: () => 'atlas.png',
      dataFileName: 'atlas.json',
      scale: 1,
    });
    const parsed = JSON.parse(json) as {
      frames: Record<string, { mesh?: { vertices: number[]; triangles: number[]; uvs: number[] } }>;
    };
    const emitted = parsed.frames['hero.png'].mesh;
    expect(emitted).toBeDefined();
    expect(emitted!.vertices).toEqual(polygon);
    expect(emitted!.vertices.length).toBe(polygon.length);
    expect(emitted!.triangles.length % 3).toBe(0);
    expect(emitted!.triangles).toEqual([0, 1, 2, 0, 2, 3]);
    expect(emitted!.uvs).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it('omits the mesh field when the packed item has no mesh', () => {
    const json = getFormat('json').generate(buildSheet(false), {
      fileName: 'atlas',
      imageFileName: () => 'atlas.png',
      dataFileName: 'atlas.json',
      scale: 1,
    });
    const parsed = JSON.parse(json) as {
      frames: Record<string, Record<string, unknown>>;
    };
    expect('mesh' in parsed.frames['hero.png']).toBe(false);
  });

  it('emits Unity tight-mesh geometry when exportMesh is on', () => {
    const json = getFormat('unity').generate(buildSheet(true), {
      fileName: 'atlas',
      imageFileName: () => 'atlas.png',
      dataFileName: 'atlas.json',
      scale: 1,
    });
    const parsed = JSON.parse(json) as {
      sprites: Array<{ mesh?: { vertices: number[]; triangles: number[]; uvs: number[] } }>;
    };
    const emitted = parsed.sprites[0].mesh;
    expect(emitted).toBeDefined();
    expect(emitted!.vertices.length).toBe(polygon.length);
    expect(emitted!.triangles.length % 3).toBe(0);
  });
});
