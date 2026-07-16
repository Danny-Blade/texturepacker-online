# Web TexturePacker 项目文档

一个基于 Next.js 15 的免费在线精灵图生成器，所有图像处理完全在浏览器中完成。

## 项目概览

Web TexturePacker 允许用户将多张图片打包成优化的纹理图集（sprite sheets），用于游戏开发和 Web 应用。这是一个纯前端应用，不涉及任何服务器端图像处理。

## 技术栈

- **Next.js 15** - React 框架（使用 App Router）
- **React 19.2.3** - UI 库
- **TypeScript** - 类型安全
- **Tailwind CSS v4** - 样式框架

## 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── page.tsx             # 英文主页
│   ├── zh/                  # 中文版本
│   │   ├── layout.tsx       # 中文布局
│   │   └── page.tsx         # 中文主页
│   ├── layout.tsx           # 根布局和 SEO 元数据
│   ├── globals.css          # Tailwind 全局样式
│   ├── robots.ts            # SEO robots.txt
│   └── sitemap.ts           # SEO 站点地图
├── components/              # React 组件
│   ├── TexturePacker.tsx    # 核心纹理打包组件
│   ├── Header.tsx           # 导航头部
│   ├── Footer.tsx           # 页脚
│   ├── Features.tsx         # 功能展示
│   └── FAQ.tsx              # 常见问题
└── lib/                     # 核心逻辑
    ├── packer.ts            # 纹理打包算法
    └── i18n.ts              # 国际化配置
```

## 核心功能

### 打包算法
- **MaxRects BSSF** - 最佳短边优先
- **MaxRects BLSF** - 最佳长边优先
- **MaxRects BAF** - 最佳区域适配
- **Shelf** - 货架算法

### 导出格式
- **JSON** (Hash/Array) - 标准游戏引擎格式
- **CSS** - Web sprite 格式
- **XML** - Starling/Sparrow 格式
- **Cocos2d** - Cocos2d-x plist 格式
- **Phaser 3** - Phaser 3 atlas 格式
- **Unity** - Unity sprite 元数据

### 高级选项
- 图像旋转支持
- 可配置的填充和外扩
- 2 的幂次尺寸
- Alpha 修剪
- 背景颜色自定义
- 自定义最大尺寸

## 开发指南

### 安装依赖
```bash
npm install
```

### 开发服务器
```bash
npm run dev
```

### 生产构建
```bash
npm run build
npm run start
```

### 代码检查
```bash
npm run lint
```

## 架构说明

### 客户端处理
所有图像处理都在浏览器中完成：
- Canvas API 用于渲染
- 自定义 MaxRects 二维打包算法实现
- FileReader API 用于图像加载
- 无服务器端处理或上传

### 国际化 (i18n)
支持的语言：
- 英语（默认路由 `/`）
- 中文（路由 `/zh`）
- 翻译配置在 `lib/i18n.ts`

### SEO 优化
- Meta 标签和 Open Graph 数据
- 站点地图生成
- Robots.txt 配置
- 规范 URL
- Twitter 卡片支持

## 核心组件

### TexturePacker 组件
主要的纹理打包组件，负责：
- 状态管理（图像、设置、导出选项）
- 图像上传和处理
- Canvas 渲染
- 导出生成
- 用户交互

### Packer 模块 (`lib/packer.ts`)
实现核心打包逻辑：
- MaxRectsPacker 类实现二维打包算法
- 支持旋转和填充
- 高效的矩形放置策略
- 多种算法变体

## 隐私与安全

- 所有图像处理完全在客户端进行
- 不上传任何图像到服务器
- 无需用户注册
- 生成的输出无水印

## 注意事项

1. **纯前端应用**：所有处理都在浏览器中完成，确保性能优化
2. **类型安全**：项目启用了 TypeScript 严格模式
3. **国际化**：添加新功能时需要同时更新英文和中文翻译
4. **路径别名**：使用 `@/*` 引用 `src/*` 目录
5. **Tailwind CSS v4**：使用最新版本的 Tailwind CSS

## 相关文件

- [package.json](package.json) - 依赖和脚本配置
- [next.config.ts](next.config.ts) - Next.js 配置
- [tsconfig.json](tsconfig.json) - TypeScript 配置
- [eslint.config.mjs](eslint.config.mjs) - ESLint 配置
- [src/lib/packer.ts](src/lib/packer.ts) - 打包算法实现
- [src/components/TexturePacker.tsx](src/components/TexturePacker.tsx) - 主组件
