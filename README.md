# Web TexturePacker

A free online sprite sheet generator built with Next.js 15. Pack multiple images into optimized texture atlases for games and web applications.

## Features

- **Multiple Packing Algorithms**: MaxRects BSSF, BLSF, BAF, and Shelf
- **Multiple Export Formats**: JSON (Hash/Array), CSS, XML, Cocos2d, Phaser 3, Unity
- **Advanced Options**: Rotation, padding, extrusion, power of two, background color
- **Real-time Preview**: Instant preview with zoom and border visualization
- **Internationalization**: English (default) and Chinese (/zh)
- **SEO Optimized**: Meta tags, Open Graph, sitemap, robots.txt
- **Privacy First**: All processing in browser, no server uploads
- **Completely Free**: No registration, no watermarks, no limitations

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- MaxRects bin packing algorithm

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Routes

- `/` - English version (default)
- `/zh` - Chinese version

## Export Formats

| Format | Description |
|--------|-------------|
| JSON (Hash) | Standard format for most game engines |
| JSON (Array) | Array-based JSON format |
| CSS | CSS sprites for web |
| XML | Starling/Sparrow format |
| Cocos2d | Cocos2d-x plist format |
| Phaser 3 | Phaser 3 atlas format |
| Unity | Unity sprite metadata |

## Environment Variables

```env
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## License

MIT
