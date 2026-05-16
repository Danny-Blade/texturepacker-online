// Sprite effects (outline / drop-shadow / tint). Phase 7 implementation.
import type { SpriteEffects } from './packer';

/**
 * Apply outline, drop shadow, and color tint to a sprite bitmap.
 * Returns a new canvas; when there are no effects, returns the input unchanged.
 *
 * The returned canvas may be larger than the input (drop shadow expands bounds).
 * `expand` reports how many pixels were added on each side so callers can
 * adjust the sprite's frame position to keep alignment.
 */
export interface AppliedEffects {
  canvas: CanvasImageSource;
  expand: { left: number; top: number; right: number; bottom: number };
}

// Implementation choice: outline uses an 8-direction stamp pass (square kernel
// sampled at 16 angles) — fast, no dependency on ctx.filter support, and good
// enough for thin outlines (<= 8 px). For drop shadow we use the Canvas
// 'shadowBlur'/'shadowOffset' built-ins, which are well-supported.

function hasAnyEffect(effects?: SpriteEffects): boolean {
  if (!effects) return false;
  return Boolean(effects.outline || effects.dropShadow || effects.tint);
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

export function applySpriteEffects(
  source: CanvasImageSource,
  width: number,
  height: number,
  effects?: SpriteEffects,
): AppliedEffects {
  if (!hasAnyEffect(effects) || width <= 0 || height <= 0) {
    return {
      canvas: source,
      expand: { left: 0, top: 0, right: 0, bottom: 0 },
    };
  }

  const extent = effectsExtent(effects);
  const totalW = width + extent.left + extent.right;
  const totalH = height + extent.top + extent.bottom;

  const dest = makeCanvas(totalW, totalH);
  const dctx = dest.getContext('2d');
  if (!dctx) {
    return {
      canvas: source,
      expand: { left: 0, top: 0, right: 0, bottom: 0 },
    };
  }

  // origin of the sprite's top-left inside the destination canvas
  const ox = extent.left;
  const oy = extent.top;

  // 1) Drop shadow (under the sprite) ---------------------------------------
  if (effects?.dropShadow) {
    const s = effects.dropShadow;
    const shadowCanvas = makeCanvas(totalW, totalH);
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      // Draw silhouette: source → tint with shadow color → place at offset.
      const sil = makeCanvas(width, height);
      const silCtx = sil.getContext('2d');
      if (silCtx) {
        silCtx.drawImage(source, 0, 0, width, height);
        silCtx.globalCompositeOperation = 'source-in';
        silCtx.fillStyle = s.color;
        silCtx.fillRect(0, 0, width, height);
      }
      sctx.globalAlpha = clampUnit(s.opacity / 100);
      if (s.blur > 0) {
        // ctx.filter is widely supported on modern browsers (Chrome, Safari, FF).
        sctx.filter = `blur(${Math.max(0, s.blur)}px)`;
      }
      sctx.drawImage(sil, ox + s.offsetX, oy + s.offsetY);
      sctx.filter = 'none';
      sctx.globalAlpha = 1;
      dctx.drawImage(shadowCanvas, 0, 0);
    }
  }

  // 2) Build the (tinted) sprite layer --------------------------------------
  const spriteLayer = makeCanvas(width, height);
  const splctx = spriteLayer.getContext('2d');
  if (splctx) {
    splctx.drawImage(source, 0, 0, width, height);
    if (effects?.tint) {
      const t = effects.tint;
      const tintCanvas = makeCanvas(width, height);
      const tctx = tintCanvas.getContext('2d');
      if (tctx) {
        tctx.drawImage(source, 0, 0, width, height);
        tctx.globalCompositeOperation = t.mode;
        tctx.fillStyle = t.color;
        tctx.fillRect(0, 0, width, height);
        // restore alpha shape of original sprite
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(source, 0, 0, width, height);
        // blend tinted result over the source with opacity
        splctx.globalAlpha = clampUnit(t.opacity / 100);
        splctx.drawImage(tintCanvas, 0, 0);
        splctx.globalAlpha = 1;
      }
    }
  }

  // 3) Outline ring (under the sprite layer) --------------------------------
  if (effects?.outline && effects.outline.width > 0) {
    const ow = Math.max(1, Math.floor(effects.outline.width));
    const stamp = makeCanvas(totalW, totalH);
    const stx = stamp.getContext('2d');
    if (stx) {
      // 16-sample circular kernel — gives a smoother round outline than 8 dirs.
      const STEPS = 16;
      for (let i = 0; i < STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const dx = Math.round(Math.cos(a) * ow);
        const dy = Math.round(Math.sin(a) * ow);
        stx.drawImage(source, ox + dx, oy + dy, width, height);
      }
      // Colorize the stamp using the outline color.
      stx.globalCompositeOperation = 'source-in';
      stx.fillStyle = effects.outline.color;
      stx.fillRect(0, 0, totalW, totalH);
      // Subtract the original sprite area to leave a ring.
      stx.globalCompositeOperation = 'destination-out';
      stx.drawImage(source, ox, oy, width, height);
      stx.globalCompositeOperation = 'source-over';

      dctx.drawImage(stamp, 0, 0);
    }
  }

  // 4) Composite the (tinted) sprite on top --------------------------------
  dctx.drawImage(spriteLayer, ox, oy);

  return {
    canvas: dest,
    expand: { left: extent.left, top: extent.top, right: extent.right, bottom: extent.bottom },
  };
}

export function effectsExtent(effects?: SpriteEffects): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  if (!effects) return { left: 0, top: 0, right: 0, bottom: 0 };
  let l = 0, t = 0, r = 0, b = 0;
  if (effects.outline?.width) {
    const w = effects.outline.width;
    l = Math.max(l, w);
    t = Math.max(t, w);
    r = Math.max(r, w);
    b = Math.max(b, w);
  }
  if (effects.dropShadow) {
    const s = effects.dropShadow;
    const blur = Math.ceil(s.blur);
    l = Math.max(l, Math.max(0, -s.offsetX) + blur);
    t = Math.max(t, Math.max(0, -s.offsetY) + blur);
    r = Math.max(r, Math.max(0, s.offsetX) + blur);
    b = Math.max(b, Math.max(0, s.offsetY) + blur);
  }
  return { left: l, top: t, right: r, bottom: b };
}
