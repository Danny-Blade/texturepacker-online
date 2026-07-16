# Web TexturePacker 与 TexturePacker 桌面版差距分析

> 调研日期：2026-07-16
> 对照对象：CodeAndWeb TexturePacker 当前官方文档
> 项目基线：`main` / `b332250`
> 开发顺序和完成状态以 [`tasks.md`](../tasks.md) 为准；完成任务后必须在该文件勾选对应项目。

## 1. 结论摘要

当前项目已经是一个可用的中级 Web 图集打包器，不再只是演示版。它已经具备图片/文件夹导入、MaxRects、多图集底层能力、矩形与轮廓裁切、旋转、挤出、13 种数据格式、4 种图像输出选项、项目保存、监听文件夹和 Web Worker 异步打包。

但它还不能作为 TexturePacker 桌面版的等价替代品，主要差距集中在：

1. **现有功能正确性**：多倍率发布、Padding 控件、PNG-8、多边形模式存在语义或接线问题。
2. **专业图集能力**：真正的多边形排布、手动 Multipack、重复精灵别名、法线贴图、缩放变体、Pivot、9-patch、动画预览缺失。
3. **格式与压缩生态**：项目有 13 种数据格式，但桌面版官方列出约 55 种框架/数据格式；GPU 纹理压缩和像素格式基本空白。
4. **自动化管线**：没有 CLI、增量构建哈希、批处理、CI/容器工作流和自定义导出器。

按下文 38 个能力项粗略计分（完整 = 1，部分 = 0.5，缺失 = 0）：

| 指标 | 估算 |
| --- | ---: |
| 完整实现 | 9 项 |
| 部分实现 | 12 项 |
| 缺失 | 17 项 |
| 桌面版功能广度覆盖 | **约 40%** |
| 基础 PNG 图集主流程覆盖 | **约 70%–75%** |
| 专业生产管线覆盖 | **约 25%–30%** |

这里的百分比用于排开发优先级，不代表逐行兼容率。长尾导出格式与 GPU 压缩会显著拉低“全功能”覆盖率，但不一定应该最先开发。

## 2. 数量差距

### 2.1 数据格式

- 本项目：13 种，包括 JSON Hash/Array、CSS、XML、Cocos2d、Cocos Creator、Phaser 3、Unity、Spine、Godot、GameMaker、PixiJS、LibGDX。
- TexturePacker：官方快速入门当前列出约 55 种框架/数据格式。
- 按名称数量计算：**13 / 55，约 24%**。

通用 JSON 能服务更多引擎，因此实际可用范围高于 24%；但专用格式所需的 Pivot、9-patch、动画、网格和导入插件语义不能由通用 JSON 自动补齐。

### 2.2 纹理输出

- 本项目：PNG、JPG、WebP，以及名为 PNG-8 的量化 PNG。
- TexturePacker 设置页列出 17 类常用纹理容器：PNG、PNG-8、JPG、BMP、TGA、TIFF、WebP、PVR3、PVR3GZ、PVR3CCZ、PKM、KTX、KTX2、ZKTX、ASTC、Basis、DDS。
- 本项目完全匹配的主要是 PNG/JPG/WebP，约 **3 / 17，18%**。
- 当前 `png8.ts` 会减少颜色后仍交给浏览器 PNG 编码器，源码注释也明确说明结果并非真正的 `PLTE+tRNS` 索引 PNG，因此不能计作完整 PNG-8。

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
| 下载、目录写入、ZIP 发布 | 完整 | `publish.ts` |
| 本地处理与 Web Worker 异步打包 | 完整 | `packerClient.ts`、`packer.worker.ts` |

### 3.2 已实现但不完整

| 能力 | 状态 | 主要差距 |
| --- | --- | --- |
| Smart Folder | 部分 | 依赖 File System Access API 和 4 秒轮询；跨浏览器、权限恢复、重命名与项目重开后的恢复不足 |
| 项目保存/打开 | 部分 | 自定义 JSON 使用 `.tps` 扩展名；未完整保存发布选项、Smart Folder、视图和未来的逐精灵元数据 |
| 桌面 `.tps` 导入 | 部分 | 只映射部分设置；无法自动恢复桌面文件路径；多项设置被忽略或降级 |
| 输入格式 | 部分 | 依赖浏览器解码，专业纹理/PSD 格式缺失 |
| Basic/Shelf 排布 | 部分 | 有 Shelf，但没有桌面版 Basic 的完整排序策略和 Grid |
| 自动 Multipack | 部分 | 打包和发布底层已存在，但 UI 没有可见开关和完整命名校验 |
| 尺寸约束 | 部分 | 最大尺寸与 POT 可用；Force Square 有状态但无 UI；缺少 Fixed Size、MultipleOf4、WordAligned、Pack Mode |
| Padding | 部分 | `borderPadding`、`shapePadding` 有底层字段但 UI 只改 `padding`；当前 packer 优先读取 `shapePadding`，导致 UI Padding 很可能不生效 |
| Trim/Crop | 部分 | 支持 none/rect/polygon outline；缺少 Trim、CropKeepPos、Crop、Trim Margin 等完整语义 |
| Scaling Variants | 部分 | 只有 0.5x/1x/2x；缺名称、过滤器、缩放算法、独立最大尺寸、相同布局；当前数据坐标没有随图片倍率同步缩放 |
| 数据导出器 | 部分 | 13 种；缺长尾格式、框架专属选项和官方样例回归验证 |
| 输出命名与格式语义 | 部分 | 支持 `{name}/{suffix}/{n}/{ext}`，但与桌面 `{v}/{n0}/{n1}` 语义不同；缺 Texture Path、缓存破坏、二级文件 |

### 3.3 关键缺失

| 能力 | 状态 | 价值 |
| --- | --- | --- |
| Grid 排布 | 缺失 | 固定尺寸图块和规则动画常用 |
| 真正的 Polygon Packer | 缺失 | 当前只计算轮廓，仍使用矩形 MaxRects；没有允许包围盒重叠的多边形排布 |
| 网格三角化与标准顶点/索引导出 | 缺失 | 当前仅输出轮廓点，不能等价替代 Unity 等引擎的 tight mesh |
| Manual Multipack | 缺失 | 无法按关卡、颜色、渲染层手动控制 atlas 稳定性和 draw call |
| Detect identical sprites / alias | 缺失 | 重复图不会共享纹理区域 |
| Common Divisor / 坐标对齐 | 缺失 | 无法保证缩放变体整数坐标和相同布局 |
| Normal Map 同布局打包 | 缺失 | 2D 光照项目的重要专业能力 |
| 真正的 PNG-8 与 PNG 优化等级 | 缺失 | 当前文件仍是 PNG24/32 流，没有索引色表和专业压缩优化 |
| GPU 纹理与像素压缩 | 缺失 | KTX2/Basis/ASTC/ETC/PVRTC/DDS 等均不支持 |
| Dithering 与 Alpha 处理 | 缺失 | 缺 Floyd-Steinberg/Atkinson、alpha bleed、清透明色、预乘 Alpha |
| 二级代码/数据文件 | 缺失 | 无 Swift/C#/C++ sprite ID 或源码输出 |
| 自定义导出器 | 缺失 | 无模板系统和导出器插件机制 |
| Pivot/Anchor 逐精灵编辑 | 缺失 | Unity 输出目前固定为 `(0.5, 0.5)` |
| 9-patch / 9-slice | 缺失 | UI 图集常用元数据无法编辑和导出 |
| 动画识别与预览 | 缺失 | 无按数字后缀分组、帧率/循环和 Pivot 联动预览 |
| Sprite Sheet Cutter | 缺失 | 无网格、透明间隔、纯色背景或数据文件反切图 |
| CLI、增量构建、批处理和 CI | 缺失 | 无 headless API、smart update hash、批量 `.tps` 和容器化构建入口 |

## 4. 必须先处理的正确性问题

这些问题应优先于新增导出格式，否则会扩大不可靠能力的表面积。

### P0-1 多倍率发布数据不一致

`publish.ts` 缩放了输出 Canvas，但各格式生成器大多仍输出原始 sheet 尺寸和 frame 坐标，仅在 meta 中记录 `scale`。0.5x/2x 文件可能出现纹理尺寸与坐标不一致。

**完成标准：** 每个倍率要么独立重采样并重新打包，要么严格同步缩放 sheet、frame、trim、sourceSize、polygon、extrude 和所有格式字段；为旋转、裁切、多图集组合增加 golden tests。

### P0-2 Padding 控件未接到底层有效字段

Inspector 修改 `settings.padding`，但 `MaxRectsPacker` 优先读取一直存在的 `shapePadding`。默认 `shapePadding = 2` 时，UI Padding 改动可能没有效果。

**完成标准：** 明确拆分 Border Padding、Shape Padding、Inner Padding；移除重复的 `padding` 或定义唯一映射；用布局坐标测试证明设置生效。

### P0-3 PNG-8 名称与实际文件不符

当前实现做颜色量化后调用浏览器 `toBlob('image/png')`，不是索引色 PNG-8。

**完成标准：** 接入真正的索引 PNG 编码器（推荐 Worker/WASM），或在完成前把 UI 改名为“Quantized PNG”并明确仍为 RGBA PNG。

### P0-4 Polygon 模式不是 Polygon Packing

当前轮廓可用于部分 JSON 输出，但排布仍按矩形宽高进行，也没有三角化索引。

**完成标准：** 在真正多边形排布完成前，将 UI 命名为“Polygon outline/mesh metadata”，避免宣称等价于 TexturePacker Polygon 算法。

### P0-5 导出格式缺少兼容性测试

13 个格式生成器没有官方 fixture、解析器回读或目标引擎导入测试，部分字段只是近似格式。

**完成标准：** 每个格式至少有一个包含 rotation + trim + multipack + scale 的 golden fixture；核心格式增加目标引擎/官方样例回读验证。

### P0-6 项目文件扩展名存在误导

项目将自定义 JSON 保存成 `.tps`，但桌面 TexturePacker 的 `.tps` 是 plist 结构；当前只能部分导入桌面文件，不能无损互转。

**完成标准：** 自有格式改为 `.wtp.json` 或实现真正 `.tps` 写入；加入 schema version、迁移器和完整状态保存。

## 5. 待完成功能清单

### Phase 0：可信基线（建议 1–2 个迭代）

- [ ] 修复 Padding 设置接线，补齐 Border/Shape/Inner Padding 的模型与 UI。
- [ ] 修复多倍率纹理与所有元数据坐标同步。
- [ ] 修复或重命名伪 PNG-8。
- [ ] 区分 Polygon Outline 与真正 Polygon Packing。
- [ ] 给 packer 增加不重叠、不越界、旋转、POT、裁切、挤出、Multipack 属性测试。
- [ ] 给 13 个导出器增加 golden fixtures 和格式快照。
- [ ] 增加发布 E2E：PNG/JPG/WebP、ZIP、目录写入、多个 sheet、多个 scale。
- [ ] 设计 `.wtp.json` schema、版本迁移和完整状态持久化。
- [ ] 对超大图片、空透明图片、同名精灵、浏览器 Canvas 上限和内存不足给出明确错误。
- [ ] 更新 README，区分“完整”“实验性”“浏览器限制”功能。

### Phase 1：补齐高频桌面工作流（建议 3–5 个迭代）

- [ ] 完整 Layout 面板：Fixed/Max Size、POT/Any/MultipleOf4、Force Square、Pack Mode。
- [ ] 完整 Trim：Trim、Crop Keep Position、Crop Flush、Threshold、Margin。
- [ ] 自动 Multipack UI、失败精灵提示、模板占位符校验和 sheet 管理。
- [ ] Manual Multipack：新增/重命名 sheet，拖动精灵或 Smart Folder 到指定 sheet。
- [ ] Detect identical sprites：像素哈希、alias 元数据、预览标记和开关。
- [ ] Scaling Variants v2：任意倍率、名称、过滤器、缩放算法、独立最大尺寸、强制相同布局。
- [ ] Common Divisor X/Y 和坐标对齐。
- [ ] Pivot/Anchor 编辑器与逐精灵元数据模型。
- [ ] 9-patch/9-slice 编辑器，并先支持 Unity、Cocos2d、JSON。
- [ ] 自动动画分组和动画预览，与 Pivot 编辑联动。
- [ ] Smart Folder 权限恢复、立即同步、重命名处理和项目重开恢复。
- [ ] 增加优先导出格式：Defold、SpriteKit、Unreal/Paper2D、MonoGame、Solar2D。

### Phase 2：专业图集和压缩（建议独立里程碑）

- [ ] 真正的 Polygon Packer：凸分解/碰撞检测/允许矩形包围盒重叠。
- [ ] 轮廓三角化，导出 vertices、triangles、UV，并对 Unity tight mesh 验证。
- [ ] Normal Map 自动识别、后缀/路径过滤和相同布局输出。
- [ ] Alpha Handling：Keep/Clear/Alpha Bleeding/Premultiply Alpha。
- [ ] Dithering：Floyd-Steinberg、Atkinson，以及 alpha 版本。
- [ ] 真正 PNG-8、可调色数、透明色表、压缩等级和体积/质量预览。
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

1. **先可信**：完成 Phase 0，让现有按钮和导出结果可验证。
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
