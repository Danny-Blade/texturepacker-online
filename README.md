# Web TexturePacker

A free, browser-based sprite sheet generator built with Next.js. Images are decoded, packed, rendered, and exported locally in the browser; they are not uploaded to an image-processing server.

English is available at `/` and Chinese at `/zh`.

## Supported features

The following features are implemented and covered by automated tests:

- MaxRects BSSF, BLSF, BAF, Bottom-Left, Contact Point, Best, and Shelf packing strategies.
- Rotation, Fixed/Max sizing, POT/Any/Multiple-of-4/Word alignment, Force Square, Pack Mode, complete Trim/Crop modes, extrusion, and automatic multi-sheet packing.
- Separate Border Padding, Shape Padding, and Inner Padding controls.
- Arbitrary named scaling variants with filters, sort modes, scaling algorithms, per-variant limits, same-layout/repack controls, and Common Divisor alignment.
- Automatic and manual Multipack, stable named sheets, drag assignment, duplicate-sprite aliases, and `{n}/{n0}/{n1}/{v}` filename placeholders.
- Per-sprite Pivot/Anchor and 9-slice authoring, project persistence, preview, and JSON/Cocos2d/Unity export metadata.
- Numeric-suffix animation detection, manual animation groups, FPS/loop/playback controls, and Pivot-aligned preview.
- PNG, indexed PNG-8 (`PLTE` with optional `tRNS`), JPG, and WebP texture output.
- Direct downloads, ZIP bundles, and supported-browser directory writes.
- 18 data exporters with golden compatibility fixtures.
- Versioned `.wtp.json` project files containing settings, variants, per-sprite metadata, animations, sprites, view state, and Smart Folder descriptors.
- Actionable validation for unsupported or duplicate images, files over 100 MB, unsafe dimensions/pixel counts, Canvas allocation failures, and encoding failures.

### Export formats

| Format | Output |
| --- | --- |
| JSON (Hash) | TexturePacker-style JSON object |
| JSON (Array) | TexturePacker-style JSON array |
| CSS | CSS sprite classes |
| XML | Starling/Sparrow atlas |
| Cocos2d | plist metadata |
| Cocos Creator | SpriteAtlas JSON |
| Phaser 3 | Phaser atlas JSON |
| Unity | Sprite metadata JSON |
| Spine | `.atlas` metadata |
| Godot | `.tres` AtlasTexture resources |
| GameMaker | Atlas JSON |
| PixiJS | Pixi-compatible JSON |
| LibGDX | `.atlas` metadata |
| Defold | `.tpinfo` text protobuf for `extension-texturepacker` |
| SpriteKit | legacy TexturePacker plist metadata (`.atlasc`) |
| Unreal / Paper2D | `.paper2dsprites` JSON |
| MonoGame Extended | Texture2DAtlas JSON 1.2 |
| Solar2D | Lua ImageSheet options and frame lookup |

See [export format compatibility](docs/export-format-compatibility.md) for target versions and known constraints.

## Experimental or partial features

- **Polygon Outline** extracts and exports a sprite outline. Packing still uses rectangular MaxRects bounds; this is not polygon packing and does not produce triangulated mesh indices.
- **Smart Folder** uses the File System Access API, IndexedDB handle restoration, permission checks, immediate sync, and polling. Handles remain browser/profile-specific; unsupported browsers provide a clear reauthorization/import fallback.
- **Desktop `.tps` import** maps a supported subset of TexturePacker settings. Web TexturePacker projects are saved as `.wtp.json`; they are not lossless desktop `.tps` files.
- Image effects and specialized exporter fields are still being expanded and may not match every target engine option.

See [the TexturePacker gap analysis](docs/texturepacker-gap-analysis.md) and [the ordered task list](tasks.md) for planned work.

## Browser limitations

- Input support depends on the browser decoder. PNG, JPEG, GIF, WebP, SVG, and BMP are accepted; PSD, KTX/KTX2, DDS, ASTC, Basis, and similar production texture formats are not supported.
- Directory selection/writes and Smart Folder work best in Chromium-based browsers with the File System Access API. Other browsers fall back to downloads where possible.
- Web TexturePacker rejects a source file over 100 MB, an image dimension over 16,384 px, or an image over 67,108,864 pixels. A browser or device may have a lower Canvas or memory limit.
- Large atlases, many scale variants, PNG-8 quantization, and ZIP creation can use substantial client memory. Split large projects with Multipack when necessary.
- JPG and WebP encoding quality and availability are provided by the browser.
- There is currently no Node CLI, server renderer, GPU texture compression, or headless production pipeline.

## Project files

Use `.wtp.json` for native projects. Schema version 1 preserves packer settings, export format, publish options, embedded sprite image data, view state, and Smart Folder descriptors. Legacy Web TexturePacker JSON projects can be migrated in memory and should then be saved as `.wtp.json`.

Opening a CodeAndWeb TexturePacker `.tps` file uses a separate best-effort compatibility importer and may report downgraded or ignored settings.

## Development

Requirements: a current Node.js release and npm.

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Lint and run the Vitest unit/compatibility suite
npm run lint
npm test

# Run Vitest while developing
npm run test:watch

# Install Chromium once, then run Playwright publish-flow tests
npx playwright install chromium
npm run test:e2e

# Production verification and server
npm run build
npm start
```

Vitest covers the packer core, padding semantics, multi-scale metadata, real PNG-8 chunks, all 18 exporters, project migration, and resource validation. Playwright currently covers browser upload/publish, regular PNG download, and multi-scale ZIP contents; it is not yet a complete cross-browser matrix for every output format or delivery path.

## Tech stack

- Next.js 16 with App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Zustand
- Vitest and Playwright

## Environment variables

```env
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## License

MIT
