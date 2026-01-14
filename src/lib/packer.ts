// MaxRects 装箱算法实现
export interface ImageItem {
  id: string;
  name: string;
  width: number;
  height: number;
  image: HTMLImageElement;
  url: string;
}

export interface PackedItem extends ImageItem {
  x: number;
  y: number;
  rotated: boolean;
  placed: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PackingAlgorithm = 'maxrects-bssf' | 'maxrects-blsf' | 'maxrects-baf' | 'shelf';

export interface PackerOptions {
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotation: boolean;
  powerOfTwo: boolean;
  algorithm: PackingAlgorithm;
  trimAlpha: boolean;
  extrude: number;
}

export class MaxRectsPacker {
  private maxWidth: number;
  private maxHeight: number;
  private padding: number;
  private allowRotation: boolean;
  private freeRects: Rect[] = [];
  private usedRects: Rect[] = [];

  constructor(options: PackerOptions) {
    this.maxWidth = options.maxWidth;
    this.maxHeight = options.maxHeight;
    this.padding = options.padding;
    this.allowRotation = options.allowRotation;
    this.freeRects = [{ x: 0, y: 0, width: this.maxWidth, height: this.maxHeight }];
  }

  pack(images: ImageItem[]): PackedItem[] {
    // 按面积从大到小排序
    const sorted = images.slice().sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      return areaB - areaA;
    });

    const packed: PackedItem[] = [];

    for (const img of sorted) {
      const paddedWidth = img.width + this.padding * 2;
      const paddedHeight = img.height + this.padding * 2;
      
      let result = this.findBestRect(paddedWidth, paddedHeight);
      let rotated = false;

      // 尝试旋转
      if (!result && this.allowRotation && img.width !== img.height) {
        result = this.findBestRect(paddedHeight, paddedWidth);
        if (result) rotated = true;
      }

      if (result) {
        const placed: PackedItem = {
          ...img,
          x: result.x + this.padding,
          y: result.y + this.padding,
          rotated,
          placed: true,
        };
        packed.push(placed);
        this.placeRect(result);
      } else {
        packed.push({ ...img, x: 0, y: 0, rotated: false, placed: false });
      }
    }

    return packed;
  }

  private findBestRect(width: number, height: number): Rect | null {
    let bestRect: Rect | null = null;
    let bestShortSideFit = Infinity;
    let bestLongSideFit = Infinity;

    for (const rect of this.freeRects) {
      if (rect.width >= width && rect.height >= height) {
        const leftoverX = rect.width - width;
        const leftoverY = rect.height - height;
        const shortSideFit = Math.min(leftoverX, leftoverY);
        const longSideFit = Math.max(leftoverX, leftoverY);

        if (shortSideFit < bestShortSideFit ||
          (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestRect = { x: rect.x, y: rect.y, width, height };
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
        }
      }
    }

    return bestRect;
  }

  private placeRect(rect: Rect): void {
    const numRectsToProcess = this.freeRects.length;

    for (let i = 0; i < numRectsToProcess; i++) {
      if (this.splitFreeNode(this.freeRects[i], rect)) {
        this.freeRects.splice(i, 1);
        i--;
      }
    }

    this.pruneFreeList();
    this.usedRects.push(rect);
  }

  private splitFreeNode(freeNode: Rect, usedNode: Rect): boolean {
    if (usedNode.x >= freeNode.x + freeNode.width ||
      usedNode.x + usedNode.width <= freeNode.x ||
      usedNode.y >= freeNode.y + freeNode.height ||
      usedNode.y + usedNode.height <= freeNode.y) {
      return false;
    }

    if (usedNode.x < freeNode.x + freeNode.width && usedNode.x + usedNode.width > freeNode.x) {
      if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
        const newNode = { ...freeNode };
        newNode.height = usedNode.y - newNode.y;
        this.freeRects.push(newNode);
      }

      if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
        const newNode = { ...freeNode };
        newNode.y = usedNode.y + usedNode.height;
        newNode.height = freeNode.y + freeNode.height - (usedNode.y + usedNode.height);
        this.freeRects.push(newNode);
      }
    }

    if (usedNode.y < freeNode.y + freeNode.height && usedNode.y + usedNode.height > freeNode.y) {
      if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
        const newNode = { ...freeNode };
        newNode.width = usedNode.x - newNode.x;
        this.freeRects.push(newNode);
      }

      if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
        const newNode = { ...freeNode };
        newNode.x = usedNode.x + usedNode.width;
        newNode.width = freeNode.x + freeNode.width - (usedNode.x + usedNode.width);
        this.freeRects.push(newNode);
      }
    }

    return true;
  }

  private pruneFreeList(): void {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isContainedIn(a: Rect, b: Rect): boolean {
    return a.x >= b.x && a.y >= b.y &&
      a.x + a.width <= b.x + b.width &&
      a.y + a.height <= b.y + b.height;
  }

  getUsedBounds(): { width: number; height: number } {
    if (this.usedRects.length === 0) {
      return { width: 0, height: 0 };
    }

    let maxX = 0;
    let maxY = 0;

    for (const rect of this.usedRects) {
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    return { width: maxX, height: maxY };
  }
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

export type ExportFormat = 'json' | 'json-array' | 'css' | 'xml' | 'cocos2d' | 'phaser3' | 'unity';

export function generateExportData(
  packed: PackedItem[],
  width: number,
  height: number,
  format: ExportFormat,
  imageName: string = 'spritesheet.png'
): string {
  switch (format) {
    case 'json':
      return generateJsonHash(packed, width, height, imageName);
    case 'json-array':
      return generateJsonArray(packed, width, height, imageName);
    case 'css':
      return generateCSS(packed, imageName);
    case 'xml':
      return generateXML(packed, width, height, imageName);
    case 'cocos2d':
      return generateCocos2d(packed, width, height, imageName);
    case 'phaser3':
      return generatePhaser3(packed, width, height, imageName);
    case 'unity':
      return generateUnity(packed, width, height, imageName);
    default:
      return generateJsonHash(packed, width, height, imageName);
  }
}

function generateJsonHash(packed: PackedItem[], width: number, height: number, imageName: string): string {
  const data = {
    meta: {
      image: imageName,
      size: { w: width, h: height },
      scale: 1,
      format: 'RGBA8888',
    },
    frames: {} as Record<string, object>,
  };

  packed.forEach((item) => {
    const w = item.rotated ? item.height : item.width;
    const h = item.rotated ? item.width : item.height;
    data.frames[item.name] = {
      frame: { x: item.x, y: item.y, w, h },
      rotated: item.rotated,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height },
      sourceSize: { w: item.width, h: item.height },
    };
  });

  return JSON.stringify(data, null, 2);
}

function generateJsonArray(packed: PackedItem[], width: number, height: number, imageName: string): string {
  const data = {
    meta: {
      image: imageName,
      size: { w: width, h: height },
      scale: 1,
    },
    frames: packed.map((item) => ({
      filename: item.name,
      frame: { x: item.x, y: item.y, w: item.rotated ? item.height : item.width, h: item.rotated ? item.width : item.height },
      rotated: item.rotated,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height },
      sourceSize: { w: item.width, h: item.height },
    })),
  };

  return JSON.stringify(data, null, 2);
}

function generateCSS(packed: PackedItem[], imageName: string): string {
  let css = `.sprite { background-image: url('${imageName}'); background-repeat: no-repeat; }\n\n`;
  
  packed.forEach((item) => {
    css += `.sprite-${item.name.replace(/[^a-zA-Z0-9]/g, '-')} {\n`;
    css += `  width: ${item.width}px;\n`;
    css += `  height: ${item.height}px;\n`;
    css += `  background-position: -${item.x}px -${item.y}px;\n`;
    css += `}\n\n`;
  });

  return css;
}

function generateXML(packed: PackedItem[], width: number, height: number, imageName: string): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<TextureAtlas imagePath="${imageName}" width="${width}" height="${height}">\n`;
  
  packed.forEach((item) => {
    xml += `  <SubTexture name="${item.name}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}"`;
    if (item.rotated) xml += ` rotated="true"`;
    xml += `/>\n`;
  });
  
  xml += `</TextureAtlas>`;
  return xml;
}

function generateCocos2d(packed: PackedItem[], width: number, height: number, imageName: string): string {
  let plist = '<?xml version="1.0" encoding="UTF-8"?>\n';
  plist += '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';
  plist += '<plist version="1.0">\n';
  plist += '<dict>\n';
  plist += '  <key>frames</key>\n';
  plist += '  <dict>\n';

  packed.forEach((item) => {
    plist += `    <key>${item.name}</key>\n`;
    plist += '    <dict>\n';
    plist += `      <key>frame</key>\n`;
    plist += `      <string>{{${Math.round(item.x)},${Math.round(item.y)},{${item.width},${item.height}}}</string>\n`;
    plist += `      <key>offset</key>\n`;
    plist += `      <string>{0,0}</string>\n`;
    plist += `      <key>rotated</key>\n`;
    plist += `      <${item.rotated ? 'true' : 'false'}/>\n`;
    plist += `      <key>sourceColorRect</key>\n`;
    plist += `      <string>{{0,0},{${item.width},${item.height}}}</string>\n`;
    plist += `      <key>sourceSize</key>\n`;
    plist += `      <string>{${item.width},${item.height}}</string>\n`;
    plist += '    </dict>\n';
  });

  plist += '  </dict>\n';
  plist += '  <key>metadata</key>\n';
  plist += '  <dict>\n';
  plist += '    <key>format</key>\n';
  plist += '    <integer>2</integer>\n';
  plist += '    <key>size</key>\n';
  plist += `    <string>{${width},${height}}</string>\n`;
  plist += '    <key>textureFileName</key>\n';
  plist += `    <string>${imageName}</string>\n`;
  plist += '  </dict>\n';
  plist += '</dict>\n';
  plist += '</plist>';

  return plist;
}

function generatePhaser3(packed: PackedItem[], width: number, height: number, imageName: string): string {
  const data = {
    textures: [{
      image: imageName,
      format: 'RGBA8888',
      size: { w: width, h: height },
      scale: 1,
      frames: packed.map((item) => ({
        filename: item.name,
        rotated: item.rotated,
        trimmed: false,
        sourceSize: { w: item.width, h: item.height },
        spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height },
        frame: { x: item.x, y: item.y, w: item.rotated ? item.height : item.width, h: item.rotated ? item.width : item.height },
      })),
    }],
  };

  return JSON.stringify(data, null, 2);
}

function generateUnity(packed: PackedItem[], width: number, height: number, imageName: string): string {
  const sprites = packed.map((item) => ({
    name: item.name,
    rect: { x: item.x, y: height - item.y - item.height, width: item.width, height: item.height },
    pivot: { x: 0.5, y: 0.5 },
    border: { x: 0, y: 0, z: 0, w: 0 },
  }));

  return JSON.stringify({ texture: imageName, sprites }, null, 2);
}
