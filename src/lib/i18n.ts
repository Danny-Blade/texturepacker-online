export const locales = ['en', 'zh'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const translations = {
  en: {
    meta: {
      title: 'Web TexturePacker - Free Online Sprite Sheet Generator',
      description: 'Free online texture packer tool. Create optimized sprite sheets for games and web. Supports multiple export formats including JSON, CSS, XML, Cocos2d, Phaser3, and Unity.',
      keywords: 'texture packer, sprite sheet, sprite atlas, game development, web optimization, image packer, free online tool',
    },
    nav: {
      title: 'Web TexturePacker',
      subtitle: 'Free Online Sprite Sheet Generator',
      github: 'GitHub',
      language: 'Language',
    },
    upload: {
      title: 'Upload Images',
      button: 'Select Images',
      dragHint: 'or drag and drop images here',
      formats: 'Supports PNG, JPG, GIF, WebP, SVG',
    },
    settings: {
      title: 'Settings',
      maxWidth: 'Max Width',
      maxHeight: 'Max Height',
      padding: 'Padding',
      extrude: 'Extrude',
      algorithm: 'Algorithm',
      allowRotation: 'Allow Rotation',
      powerOfTwo: 'Power of Two',
      trimAlpha: 'Trim Alpha',
      backgroundColor: 'Background Color',
      transparent: 'Transparent',
    },
    algorithms: {
      'maxrects-bssf': 'MaxRects BSSF',
      'maxrects-blsf': 'MaxRects BLSF',
      'maxrects-baf': 'MaxRects BAF',
      'shelf': 'Shelf',
    },
    imageList: {
      title: 'Image List',
      empty: 'No images added',
      remove: 'Remove',
      removeAll: 'Remove All',
    },
    preview: {
      title: 'Preview',
      empty: 'Click "Generate" to create sprite sheet',
      zoom: 'Zoom',
      showBorders: 'Show Borders',
    },
    stats: {
      title: 'Statistics',
      size: 'Size',
      images: 'Images',
      efficiency: 'Efficiency',
      failed: 'Failed',
    },
    actions: {
      generate: 'Generate Sprite Sheet',
      clear: 'Clear All',
    },
    export: {
      title: 'Export',
      format: 'Format',
      imageName: 'Image Name',
      outputDir: 'Output Directory',
      fileName: 'File Name',
      download: 'Download',
      downloadImage: 'Download Image',
      downloadData: 'Download Data',
      copyData: 'Copy Data',
      copied: 'Copied!',
    },
    project: {
      title: 'Project',
      save: 'Save Project',
      saveAs: 'Save Project As',
      open: 'Open Project',
      new: 'New Project',
      recent: 'Recent Projects',
      saved: 'Project saved successfully',
      loaded: 'Project loaded successfully',
      saveError: 'Failed to save project',
      loadError: 'Failed to load project',
      unsupportedFormat: 'Unsupported project format',
    },
    formats: {
      json: 'JSON (Hash)',
      'json-array': 'JSON (Array)',
      css: 'CSS',
      xml: 'XML (Starling)',
      cocos2d: 'Cocos2d',
      phaser3: 'Phaser 3',
      unity: 'Unity',
    },
    errors: {
      noImages: 'Please add images first',
      packFailed: 'Some images could not be packed. Try increasing max size.',
      loadFailed: 'Failed to load image',
    },
    features: {
      title: 'Features',
      feature1: {
        title: 'Multiple Algorithms',
        desc: 'Choose from MaxRects BSSF, BLSF, BAF, or Shelf algorithms for optimal packing',
      },
      feature2: {
        title: 'Multiple Export Formats',
        desc: 'Export to JSON, CSS, XML, Cocos2d, Phaser 3, Unity and more',
      },
      feature3: {
        title: 'Advanced Options',
        desc: 'Rotation, padding, extrusion, power of two, and alpha trimming',
      },
      feature4: {
        title: 'Real-time Preview',
        desc: 'Instant preview with zoom and border visualization',
      },
      feature5: {
        title: 'Privacy First',
        desc: 'All processing happens in your browser. No uploads to server.',
      },
      feature6: {
        title: 'Completely Free',
        desc: 'No registration, no watermarks, no limitations',
      },
    },
    faq: {
      title: 'FAQ',
      q1: 'What is a sprite sheet?',
      a1: 'A sprite sheet (or texture atlas) is a single image containing multiple smaller images. It reduces HTTP requests and improves rendering performance in games and web applications.',
      q2: 'What export format should I use?',
      a2: 'Use JSON (Hash) for most game engines, CSS for web sprites, Cocos2d for Cocos2d-x games, Phaser 3 for Phaser games, and Unity format for Unity projects.',
      q3: 'Why use power of two sizes?',
      a3: 'Some game engines and GPUs perform better with textures that have dimensions that are powers of two (256, 512, 1024, 2048, etc.).',
      q4: 'Is my data safe?',
      a4: 'Yes! All image processing happens entirely in your browser. Your images are never uploaded to any server.',
    },
    footer: {
      copyright: '© 2025 Web TexturePacker. Free online sprite sheet generator.',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
    },
  },
  zh: {
    meta: {
      title: 'Web TexturePacker - 免费在线精灵图生成器',
      description: '免费在线图集打包工具。为游戏和网页创建优化的精灵图。支持多种导出格式，包括 JSON、CSS、XML、Cocos2d、Phaser3 和 Unity。',
      keywords: '图集打包, 精灵图, 纹理图集, 游戏开发, 网页优化, 图片打包, 免费在线工具',
    },
    nav: {
      title: 'Web TexturePacker',
      subtitle: '免费在线精灵图生成器',
      github: 'GitHub',
      language: '语言',
    },
    upload: {
      title: '上传图片',
      button: '选择图片',
      dragHint: '或拖拽图片到此处',
      formats: '支持 PNG、JPG、GIF、WebP、SVG',
    },
    settings: {
      title: '设置',
      maxWidth: '最大宽度',
      maxHeight: '最大高度',
      padding: '间距',
      extrude: '边缘扩展',
      algorithm: '算法',
      allowRotation: '允许旋转',
      powerOfTwo: '2的幂次尺寸',
      trimAlpha: '裁剪透明区域',
      backgroundColor: '背景颜色',
      transparent: '透明',
    },
    algorithms: {
      'maxrects-bssf': 'MaxRects BSSF',
      'maxrects-blsf': 'MaxRects BLSF',
      'maxrects-baf': 'MaxRects BAF',
      'shelf': 'Shelf',
    },
    imageList: {
      title: '图片列表',
      empty: '暂无图片',
      remove: '移除',
      removeAll: '全部移除',
    },
    preview: {
      title: '预览',
      empty: '点击"生成"按钮创建精灵图',
      zoom: '缩放',
      showBorders: '显示边框',
    },
    stats: {
      title: '统计信息',
      size: '尺寸',
      images: '图片数量',
      efficiency: '空间利用率',
      failed: '失败',
    },
    actions: {
      generate: '生成精灵图',
      clear: '清空',
    },
    export: {
      title: '导出',
      format: '格式',
      imageName: '图片名称',
      outputDir: '输出目录',
      fileName: '文件名称',
      download: '下载',
      downloadImage: '下载图片',
      downloadData: '下载数据',
      copyData: '复制数据',
      copied: '已复制！',
    },
    project: {
      title: '项目',
      save: '保存项目',
      saveAs: '项目另存为',
      open: '打开项目',
      new: '新建项目',
      recent: '最近项目',
      saved: '项目保存成功',
      loaded: '项目加载成功',
      saveError: '项目保存失败',
      loadError: '项目加载失败',
      unsupportedFormat: '不支持的项目格式',
    },
    formats: {
      json: 'JSON (Hash)',
      'json-array': 'JSON (Array)',
      css: 'CSS',
      xml: 'XML (Starling)',
      cocos2d: 'Cocos2d',
      phaser3: 'Phaser 3',
      unity: 'Unity',
    },
    errors: {
      noImages: '请先添加图片',
      packFailed: '部分图片无法打包，请尝试增大最大尺寸',
      loadFailed: '图片加载失败',
    },
    features: {
      title: '功能特性',
      feature1: {
        title: '多种算法',
        desc: '可选择 MaxRects BSSF、BLSF、BAF 或 Shelf 算法以获得最佳打包效果',
      },
      feature2: {
        title: '多种导出格式',
        desc: '支持导出为 JSON、CSS、XML、Cocos2d、Phaser 3、Unity 等格式',
      },
      feature3: {
        title: '高级选项',
        desc: '支持旋转、间距、边缘扩展、2的幂次尺寸、透明裁剪等功能',
      },
      feature4: {
        title: '实时预览',
        desc: '即时预览，支持缩放和边框显示',
      },
      feature5: {
        title: '隐私优先',
        desc: '所有处理都在浏览器中完成，图片不会上传到服务器',
      },
      feature6: {
        title: '完全免费',
        desc: '无需注册，无水印，无限制',
      },
    },
    faq: {
      title: '常见问题',
      q1: '什么是精灵图？',
      a1: '精灵图（或纹理图集）是包含多个小图片的单张图片。它可以减少 HTTP 请求并提高游戏和网页应用的渲染性能。',
      q2: '应该使用哪种导出格式？',
      a2: '大多数游戏引擎使用 JSON (Hash)，网页精灵图使用 CSS，Cocos2d-x 游戏使用 Cocos2d，Phaser 游戏使用 Phaser 3，Unity 项目使用 Unity 格式。',
      q3: '为什么要使用2的幂次尺寸？',
      a3: '某些游戏引擎和 GPU 在处理2的幂次尺寸（256、512、1024、2048等）的纹理时性能更好。',
      q4: '我的数据安全吗？',
      a4: '是的！所有图片处理都完全在您的浏览器中进行，您的图片永远不会上传到任何服务器。',
    },
    footer: {
      copyright: '© 2025 Web TexturePacker. 免费在线精灵图生成器。',
      privacy: '隐私政策',
      terms: '服务条款',
    },
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getTranslations(locale: Locale) {
  return translations[locale] || translations.en;
}

export function getLocaleFromPath(pathname: string): Locale {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'zh') return 'zh';
  return 'en';
}
