# Web TexturePacker 与 TexturePacker 桌面版差距分析

> 调研日期：2026-07-16
> 对照对象：CodeAndWeb TexturePacker 当前官方文档
> 项目基线：2026-07-16 Phase 1 实现版本
> 开发顺序和完成状态以 [`tasks.md`](../tasks.md) 为准；完成任务后必须在该文件勾选对应项目。

## 1. 结论摘要

当前项目已经是一个可用的中级 Web 图集打包器，不再只是演示版。它已经具备图片/文件夹导入、MaxRects、多图集底层能力、矩形与轮廓裁切、旋转、三类 Padding、挤出、坐标一致的多倍率发布、18 种数据格式、真 PNG-8、版本化项目保存、监听文件夹和 Web Worker 异步打包。

Phase 0 已修正可信度基线；Phase 1 进一步补齐完整 Layout/Trim、自动和手动 Multipack、重复精灵 Alias、Scaling Variants v2、Common Divisor、Pivot、9-slice、动画预览、Smart Folder 权限恢复，并将导出格式扩展到 18 种。

但它还不能作为 TexturePacker 桌面版的等价替代品，主要差距集中在：

1. **专业图集能力**：真正的多边形排布、网格三角化、法线贴图、高级 Alpha/Dither 和 GPU 纹理压缩仍缺失。
2. **格式与压缩生态**：项目有 18 种经过 golden fixture 固定的数据格式，但桌面版官方列出约 55 种框架/数据格式；GPU 纹理压缩和高级像素处理仍基本空白。
3. **浏览器边界**：输入解码、Canvas/内存上限、目录权限和 JPG/WebP 编码受浏览器能力约束。
4. **自动化管线**：没有 CLI、增量构建哈希、批处理、CI/容器工作流和自定义导出器。

按下文 38 个能力项粗略计分（完整 = 1，部分 = 0.5，缺失 = 0）：

| 指标 | 估算 |
| --- | ---: |
| 完整实现 | 约 11 项 |
| 部分实现 | 12 项 |
| 缺失 | 约 15 项 |
| 桌面版功能广度覆盖 | **约 60%–65%** |
| 基础 PNG 图集主流程覆盖 | **约 85%** |
| 专业生产管线覆盖 | **约 35%–40%** |

这里的百分比用于排开发优先级，不代表逐行兼容率。长尾导出格式与 GPU 压缩会显著拉低“全功能”覆盖率，但不一定应该最先开发。

## 2. 数量差距

### 2.1 数据格式

- 本项目：18 种，包括 JSON Hash/Array、CSS、XML、Cocos2d、Cocos Creator、Phaser 3、Unity、Spine、Godot、GameMaker、PixiJS、LibGDX、Defold、SpriteKit、Unreal/Paper2D、MonoGame Extended、Solar2D。
- TexturePacker：官方快速入门当前列出约 55 种框架/数据格式。
- 按名称数量计算：**18 / 55，约 33%**。

通用 JSON 能服务更多引擎，因此实际可用范围高于 24%；但专用格式所需的 Pivot、9-patch、动画、网格和导入插件语义不能由通用 JSON 自动补齐。

### 2.2 纹理输出

- 本项目：PNG、JPG、WebP，以及真正的索引色 PNG-8。
- TexturePacker 设置页列出 17 类常用纹理容器：PNG、PNG-8、JPG、BMP、TGA、TIFF、WebP、PVR3、PVR3GZ、PVR3CCZ、PKM、KTX、KTX2、ZKTX、ASTC、Basis、DDS。
- 本项目完全匹配的主要是 PNG/PNG-8/JPG/WebP，约 **4 / 17，24%**。
- `png8.ts` 现在会量化到最多 256 色，并自行写入 `PLTE`、可选 `tRNS`、压缩后的索引扫描线和 PNG CRC。尚未提供桌面版的多种抖动、PNG 优化等级和体积/质量对比。

### 2.3 输入格式

桌面版官方支持 ASTC、Basis、BMP、DDS、GIF、ICO、JPEG、KTX/KTX2、Netpbm、PKM、PNG、PSD、PVR、SVG、TGA、TIFF、WebP 等。当前项目使用浏览器 `image/*` 解码，常见 PNG/JPEG/GIF/WebP/SVG 通常可用，但不具备 PSD、PVR、KTX、DDS、ASTC、Basis 等专业格式的确定性支持。

## 3. 能力矩阵

### 3.1 已基本完成

| 能力 | 状态 | 本项目依据 |
| --- | --- | --- |
| 单图、多图和拖放导入 | 完整 | `AppShell.tsx` |
| 递归文件夹导入和路径保留 | 完整 | `AppShell.tsx`、`spriteTree.ts` |
| 实时画布预览、缩放、平移、边框/名称显示 | 完整 | `CanvasViewport.tsx` |
| 精灵树、排序、重命名、拖放整理 | 完整 | `SpritesPanel.tsx`、`spriteTree.ts` |
| MaxRects 与多种启发式策略 | 完整 | `packer.ts`、`packer.worker.ts` |
| 90° 旋转 | 完整 | `packer.ts`、发布渲染和格式生成器 |
| 像素挤出 Extrude | 完整 | `imageProcessing.ts`、`packer.ts` |
| Border/Shape/Inner Padding | 完整 | 三个字段分别控制图集边缘、精灵间距和精灵内部透明扩展；有独立回归测试 |
| 0.5x/1x/2x 物理坐标同步 | 完整 | 发布图片与 sheet/frame/trim/sourceSize/polygon/extrude 共用缩放后的数据 |
| 真 PNG-8 | 完整 | 索引色 `PLTE`，透明图使用 `tRNS`；文件结构和颜色数有测试 |
| 18 种导出器基线 | 完整 | 每种格式都有 golden fixture 和结构验证；除明确不支持旋转的 Solar2D 外，新增格式覆盖 rotation、trim、multipack、scale |
| 原生项目保存/打开 | 完整 | `.wtp.json` schema v1，保存发布选项、图片、视图和 Smart Folder 描述；支持旧 Web 项目迁移 |
| 导入与发布资源校验 | 完整 | 文件大小、尺寸、像素数、同名、解码、Canvas 分配和编码失败均给出原因或建议 |
| 下载、目录写入、ZIP 发布 | 完整 | `publish.ts` |
| 本地处理与 Web Worker 异步打包 | 完整 | `packerClient.ts`、`packer.worker.ts` |

### 3.2 已实现但不完整

| 能力 | 状态 | 主要差距 |
| --- | --- | --- |
| Smart Folder | 完整（浏览器能力内） | 支持权限恢复、IndexedDB 句柄、立即同步、重命名/移动/内容变化对账；非 Chromium 明确降级 |
| 桌面 `.tps` 导入 | 部分 | 只映射部分设置；无法自动恢复桌面文件路径；多项设置被忽略或降级 |
| 输入格式 | 部分 | 依赖浏览器解码，专业纹理/PSD 格式缺失 |
| Basic/Shelf 排布 | 部分 | 有 Shelf，但没有桌面版 Basic 的完整排序策略和 Grid |
| 自动/手动 Multipack | 完整 | 可见开关、失败提示、稳定命名 sheet、拖放分配与多 sheet 文件引用 |
| 尺寸约束 | 完整 | Fixed/Max、POT/Any/MultipleOf4/WordAligned、Force Square 与 Fast/Good/Best Pack Mode |
| Trim/Crop | 完整 | None、Trim、Crop Keep Position、Crop Flush、Threshold、Margin 与 Polygon Outline |
| Scaling Variants | 完整 | 任意倍率/名称/过滤器/排序/算法/独立上限/相同布局或重排，并支持 Common Divisor |
| 数据导出器 | 部分 | 18 种已有 golden fixture 与结构验证；仍缺长尾格式、完整框架专属选项和完整真实目标引擎导入矩阵 |
| 输出命名与格式语义 | 部分 | 支持 `{name}/{suffix}/{n}/{n0}/{n1}/{v}/{ext}`；仍缺 Texture Path、缓存破坏和二级代码文件 |

### 3.3 关键缺失

| 能力 | 状态 | 价值 |
| --- | --- | --- |
| Grid 排布 | 缺失 | 固定尺寸图块和规则动画常用 |
| 真正的 Polygon Packer | 缺失 | 当前只计算轮廓，仍使用矩形 MaxRects；没有允许包围盒重叠的多边形排布 |
| 网格三角化与标准顶点/索引导出 | 缺失 | 当前仅输出轮廓点，不能等价替代 Unity 等引擎的 tight mesh |
| Normal Map 同布局打包 | 缺失 | 2D 光照项目的重要专业能力 |
| 高级 PNG-8/PNG 优化 | 缺失 | 已有真索引 PNG-8，但缺抖动算法、可调色数 UI、专业压缩等级和体积/质量预览 |
| GPU 纹理与像素压缩 | 缺失 | KTX2/Basis/ASTC/ETC/PVRTC/DDS 等均不支持 |
| Dithering 与 Alpha 处理 | 缺失 | 缺 Floyd-Steinberg/Atkinson、alpha bleed、清透明色、预乘 Alpha |
| 二级代码/数据文件 | 缺失 | 无 Swift/C#/C++ sprite ID 或源码输出 |
| 自定义导出器 | 缺失 | 无模板系统和导出器插件机制 |
| Sprite Sheet Cutter | 缺失 | 无网格、透明间隔、纯色背景或数据文件反切图 |
| CLI、增量构建、批处理和 CI | 缺失 | 无 headless API、smart update hash、批量 `.tps` 和容器化构建入口 |

## 4. Phase 0 可信基线现状

| 基线能力 | 当前状态 | 仍需注意 |
| --- | --- | --- |
| 三类 Padding | 已实现并有 Vitest 回归 | `padding` 只作为旧项目的 `shapePadding` 兼容别名，新代码使用明确字段 |
| 多倍率发布坐标 | 已实现并有 0.5x/1x/2x、旋转、裁切和格式测试 | 尚无任意倍率配置、Common Divisor 或各倍率独立重排 |
| PNG-8 | 已实现真正 `PLTE`/`tRNS` 索引 PNG | 暂无抖动、可调色数 UI 和专业压缩参数 |
| Polygon 语义 | UI/项目字段已明确为 Polygon Outline | 排布仍为矩形，且没有三角化、indices 或 UV；不能称为 Polygon Packer |
| Packer 测试 | Vitest 覆盖不重叠、边界、旋转、POT、裁切、挤出、Multipack、空/透明/超大输入和 Worker 协议 | 浏览器 Worker 的完整真实线程链路仍应持续集成验证 |
| 18 个导出器 | 每种格式都有 golden fixture 和目标结构验证；JSON 格式可解析回读 | SpriteKit 编译产物属于 Apple 私有格式；Solar2D 不支持旋转；完整目标引擎导入矩阵见兼容性文档 |
| 发布 E2E | Playwright 已覆盖上传、普通 PNG 下载和 0.5x/1x/2x ZIP 文件及图片尺寸 | JPG、WebP、PNG-8、目录写入和多 sheet 的浏览器 E2E 仍需扩充 |
| 项目文件 | 原生 `.wtp.json` schema v1；保存 publishOptions、图片、视图和 Smart Folder 描述；迁移旧 Web JSON | 桌面 `.tps` 仍是单独的有损兼容导入；目录句柄和权限不能随项目移植 |
| 资源错误 | 导入会报告格式、100 MB 文件、16,384 px 边长、67,108,864 像素、同名和解码错误；发布会报告 Canvas/编码失败 | 浏览器或设备可能在更低阈值耗尽内存，无法保证所有 OOM 都可捕获 |

测试命令：`npm test` 运行 Vitest，`npm run test:watch` 进入监听模式，`npm run test:e2e` 运行 Playwright。首次运行 Playwright 前执行 `npx playwright install chromium`。

## 5. 待完成功能清单

### Phase 0：可信基线（建议 1–2 个迭代）

Phase 0 的逐项完成状态只在 [`tasks.md`](../tasks.md) 勾选，避免两份清单产生冲突。本轮已建立上述可信基线；发布 E2E 的输出格式与交付路径矩阵仍应继续扩充。

### Phase 1：补齐高频桌面工作流（建议 3–5 个迭代）

- [x] 完整 Layout 面板：Fixed/Max Size、POT/Any/MultipleOf4、Force Square、Pack Mode。
- [x] 完整 Trim：Trim、Crop Keep Position、Crop Flush、Threshold、Margin。
- [x] 自动 Multipack UI、失败精灵提示、模板占位符校验和 sheet 管理。
- [x] Manual Multipack：新增/重命名 sheet，拖动精灵或 Smart Folder 到指定 sheet。
- [x] Detect identical sprites：内容相同检测、alias 元数据、预览标记和开关。
- [x] Scaling Variants v2：任意倍率、名称、过滤器、缩放算法、独立最大尺寸、强制相同布局。
- [x] Common Divisor X/Y 和坐标对齐。
- [x] Pivot/Anchor 编辑器与逐精灵元数据模型。
- [x] 9-patch/9-slice 编辑器，并支持 Unity、Cocos2d、JSON。
- [x] 自动动画分组和动画预览，与 Pivot 编辑联动。
- [x] Smart Folder 权限恢复、立即同步、重命名处理和项目重开恢复。
- [x] 增加优先导出格式：Defold、SpriteKit、Unreal/Paper2D、MonoGame、Solar2D。

### Phase 2：专业图集和压缩（建议独立里程碑）

- [ ] 真正的 Polygon Packer：凸分解/碰撞检测/允许矩形包围盒重叠。
- [ ] 轮廓三角化，导出 vertices、triangles、UV，并对 Unity tight mesh 验证。
- [ ] Normal Map 自动识别、后缀/路径过滤和相同布局输出。
- [ ] Alpha Handling：Keep/Clear/Alpha Bleeding/Premultiply Alpha。
- [ ] Dithering：Floyd-Steinberg、Atkinson，以及 alpha 版本。
- [ ] PNG-8 v2：抖动、可调色数 UI、压缩等级和体积/质量预览。
- [ ] 评估 Worker + WASM 的 Basis Universal/KTX2；再决定 ASTC/ETC/PVRTC/DDS 范围。
- [ ] 自定义导出模板：变量、循环、条件、格式能力声明和安全沙箱。
- [ ] Sprite Sheet Cutter：Grid/Strip、透明间隔、纯色背景、JSON/plist/atlas 数据切图。

### Phase 3：自动化与生态

- [ ] 抽离无 UI 的 packer core，使浏览器、Node CLI 和测试共享同一实现。
- [ ] Node CLI：读取项目、覆盖参数、批量发布、机器可读错误码。
- [ ] Smart Update Hash：输入内容、设置、版本未变化时跳过构建。
- [ ] GitHub Actions/Docker 示例和缓存策略。
- [ ] 批量图像转换模式。
- [ ] 二级代码文件生成（Swift/C#/C++ sprite IDs）。
- [ ] 长尾导出格式按用户数据逐步补充，不以“追齐 55 个”为第一目标。

## 6. 推荐开发顺序

推荐目标不是立即 1:1 复制桌面版，而是先做到“高频游戏/Web 工作流可信替代”：

1. **守住可信基线**：持续用 Vitest、golden fixtures 和 Playwright 防止 Phase 0 能力回退。
2. **再可替代**：优先 Multipack、Scaling、Alias、Pivot、9-patch、动画预览。
3. **再专业化**：Polygon mesh、Normal Map、PNG-8/Alpha/Dither。
4. **最后扩生态**：CLI、WASM GPU 压缩、自定义导出器和长尾格式。

达到 Phase 1 后，预计可覆盖桌面版约 **60%–65% 的功能广度**，并覆盖约 **85% 的常见 PNG/Web 图集工作流**。达到 Phase 2 后，才适合宣传为面向专业 2D 游戏管线的 TexturePacker 替代方案。

## 7. 本项目已有的差异化优势

这些能力不是桌面版对标的主要缺口，建议保留，但排在正确性之后继续完善：

- 免费、无需安装、无注册、图片不上传服务器。
- 中英文双语入口。
- 浏览器内实时预览和 ZIP 一次性交付。
- Outline、Drop Shadow、Tint 图像效果；当前是全局效果，未来可改为逐精灵/文件夹级效果。
- Web Worker 异步计算，适合继续接入 WASM 编码器。

## 8. 官方参考

- [TexturePacker 快速入门与数据格式列表](https://www.codeandweb.com/texturepacker/documentation)
- [Texture Settings：格式、布局、缩放、裁切、Multipack、Normal Map](https://www.codeandweb.com/texturepacker/documentation/texture-settings)
- [Texture compression：PVR/KTX/KTX2/ASTC/Basis/DDS 与像素格式](https://www.codeandweb.com/texturepacker/documentation/texture-compression)
- [GUI：Pivot、9-patch、动画预览、Manual Multipack](https://www.codeandweb.com/texturepacker/documentation/user-interface-overview)
- [支持的输入/输出图片格式](https://www.codeandweb.com/texturepacker/knowledgebase/supported-image-formats)
- [命令行与 Smart Update](https://www.codeandweb.com/texturepacker/documentation/commandline)
- [自定义导出器](https://www.codeandweb.com/texturepacker/documentation/custom-exporter)
- [Sprite Sheet Cutter](https://www.codeandweb.com/texturepacker/documentation/sprite-sheet-cutter)
