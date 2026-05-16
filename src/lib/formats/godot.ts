import type { FormatGenerator } from './types';

const godot: FormatGenerator = {
  extension: 'tres',
  label: 'Godot',
  generate(sheet, opts) {
    const image = opts.imageFileName(sheet.index);
    const subIds = sheet.packed.map((item) => sanitizeId(item.name));
    const loadSteps = sheet.packed.length + 2;
    let out = '';
    out += `[gd_resource type="Resource" load_steps=${loadSteps} format=3]\n\n`;
    out += `[ext_resource type="Texture2D" path="res://${image}" id="1"]\n\n`;
    for (let i = 0; i < sheet.packed.length; i++) {
      const item = sheet.packed[i];
      const id = subIds[i];
      const fw = item.rotated ? item.height : item.width;
      const fh = item.rotated ? item.width : item.height;
      const marginX = item.spriteSourceSize.x;
      const marginY = item.spriteSourceSize.y;
      const marginR = item.sourceSize.w - item.spriteSourceSize.x - item.spriteSourceSize.w;
      const marginB = item.sourceSize.h - item.spriteSourceSize.y - item.spriteSourceSize.h;
      out += `[sub_resource type="AtlasTexture" id="${id}"]\n`;
      out += `atlas = ExtResource("1")\n`;
      out += `region = Rect2(${item.x}, ${item.y}, ${fw}, ${fh})\n`;
      out += `margin = Rect2(${marginX}, ${marginY}, ${marginR}, ${marginB})\n`;
      out += `filter_clip = false\n\n`;
    }
    out += `[resource]\n`;
    out += `textures = {\n`;
    for (let i = 0; i < sheet.packed.length; i++) {
      const item = sheet.packed[i];
      const id = subIds[i];
      const comma = i < sheet.packed.length - 1 ? ',' : '';
      out += `"${escapeStr(item.name)}": SubResource("${id}")${comma}\n`;
    }
    out += `}\n`;
    return out;
  },
};

function sanitizeId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export default godot;
