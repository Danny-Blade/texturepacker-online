# Web TexturePacker 开发任务清单

> 本文件是后续功能开发的执行清单和进度来源。
> 功能差距、背景和验收说明参见 [`docs/texturepacker-gap-analysis.md`](docs/texturepacker-gap-analysis.md)。

## 执行规则

1. 严格按照本文件从上到下的顺序开发，默认选择第一个未完成任务。
2. 除非用户明确调整优先级，否则不要跳过前面的未完成任务。
3. 每次只把实际完成并通过验证的任务从 `[ ]` 改为 `[x]`。
4. “完成”至少包括：功能实现、必要测试、Lint、生产构建和相关文档同步。
5. 如果任务只完成了一部分，保持 `[ ]`，并在任务下方添加未完成说明，不得提前打钩。
6. 修复任务时不得通过删除、隐藏或降级现有功能来绕过验收标准，除非任务本身明确要求调整功能名称或范围。

## Phase 0：可信基线

- [ ] **P0-01 修复 Padding 设置接线**
  - 补齐 Border Padding、Shape Padding、Inner Padding 的状态模型和 UI。
  - 移除重复 `padding` 字段，或定义唯一、可测试的兼容映射。
  - 验证三个设置会分别影响图集边缘、精灵间距和精灵内部扩展。

- [ ] **P0-02 修复多倍率发布坐标**
  - 同步缩放 sheet、frame、trim、sourceSize、polygon、extrude 和所有导出格式字段。
  - 覆盖 0.5x、1x、2x，以及旋转、裁切、Multipack 组合。
  - 确保输出图片尺寸与数据文件坐标完全一致。

- [ ] **P0-03 实现真正的 PNG-8 或修正功能命名**
  - 优先实现带 `PLTE+tRNS` 的索引色 PNG 编码。
  - 如果暂时不能实现，将 UI 和文档改名为 Quantized PNG，并明确其 RGBA PNG 属性。
  - 增加文件结构、透明度和最大颜色数测试。

- [ ] **P0-04 区分 Polygon Outline 与 Polygon Packing**
  - 在真正多边形打包完成前，将现有功能明确命名为 Polygon Outline 或 Mesh Metadata。
  - 更新中英文文案、Inspector、项目文件字段和导出说明。
  - 不得继续把矩形 MaxRects 排布展示为 Polygon Packer。

- [ ] **P0-05 建立 Packer 核心测试基线**
  - 增加不重叠、不越界、旋转、POT、裁切、挤出和 Multipack 测试。
  - 增加空图片、全透明图片、超大图片和无法放置图片的边界测试。
  - 同步覆盖主线程与 Web Worker 实现，防止算法分叉。

- [ ] **P0-06 建立 13 个导出器兼容性测试**
  - 为每个格式增加包含 rotation、trim、multipack、scale 的 golden fixture。
  - 核心格式增加解析器回读或目标引擎/官方样例验证。
  - 固定格式版本，避免无意改变既有输出结构。

- [ ] **P0-07 增加发布流程 E2E 测试**
  - 覆盖 PNG、JPG、WebP、PNG-8/Quantized PNG。
  - 覆盖 ZIP、目录写入、普通下载、多 sheet 和多 scale。
  - 验证文件名模板、图片引用和文件数量。

- [ ] **P0-08 建立正式项目文件格式**
  - 使用 `.wtp.json`，或实现真正兼容桌面 TexturePacker 的 `.tps` 写入。
  - 定义 schema version、迁移器和向后兼容策略。
  - 完整保存 publishOptions、Smart Folder、视图状态和未来的逐精灵元数据。

- [ ] **P0-09 完善错误处理和资源限制提示**
  - 处理超大图片、Canvas 尺寸上限、内存不足、同名精灵和图片解码失败。
  - 明确展示失败原因、受影响精灵和建议操作。
  - 避免静默跳过导致发布结果不完整。

- [ ] **P0-10 更新项目能力文档**
  - 更新 README 和中英文功能说明。
  - 区分完整功能、实验性功能和浏览器限制。
  - 确保文档描述与实际 UI、导出文件一致。

## Phase 1：高频桌面工作流

- [ ] **P1-01 完整 Layout 尺寸设置**
  - 支持 Fixed/Max Size、POT、Any Size、MultipleOf4、WordAligned、Force Square 和 Pack Mode。
  - 为所有尺寸约束增加布局和失败提示测试。

- [ ] **P1-02 完整 Trim/Crop 模式**
  - 支持 None、Trim、Crop Keep Position、Crop Flush 和 Polygon Outline。
  - 支持 Transparency Threshold 和 Trim Margin。
  - 验证不同模式的 sourceSize、spriteSourceSize 和 Pivot 语义。

- [ ] **P1-03 完善自动 Multipack**
  - 增加可见的 UI 开关、失败精灵提示和 sheet 切换管理。
  - 校验 `{n}`、`{n0}`、`{n1}` 等文件名占位符。
  - 保证各数据格式正确引用对应纹理。

- [ ] **P1-04 实现 Manual Multipack**
  - 支持新增、删除、重命名 sheet。
  - 支持将精灵或 Smart Folder 拖动到指定 sheet。
  - 保持手动 sheet 分配稳定，不因新增精灵自动改变。

- [ ] **P1-05 实现重复精灵检测和 Alias**
  - 使用像素内容哈希识别相同精灵。
  - 相同精灵共享纹理区域，但保留独立数据条目。
  - 增加预览标记、开关和各导出格式 alias 兼容处理。

- [ ] **P1-06 实现 Scaling Variants v2**
  - 支持任意倍率、变体名称、精灵过滤器和排序。
  - 支持缩放算法、每变体最大纹理尺寸和强制相同布局。
  - 支持 `{v}` 与 Multipack 占位符组合。

- [ ] **P1-07 实现 Common Divisor 和坐标对齐**
  - 支持 Common Divisor X/Y。
  - 保证缩放变体的尺寸和坐标可按要求整除。
  - 与 Trim、Crop、Padding 和相同布局协同工作。

- [ ] **P1-08 实现 Pivot/Anchor 编辑器**
  - 建立逐精灵 Pivot 元数据模型。
  - 支持相对坐标、绝对坐标、预设位置和多选批量编辑。
  - 先完成 Unity、Cocos2d 和 JSON 导出。

- [ ] **P1-09 实现 9-patch/9-slice 编辑器**
  - 支持可视化边框和内容区域编辑。
  - 保存逐精灵 9-slice 元数据。
  - 先完成 Unity、Cocos2d 和 JSON 导出与测试。

- [ ] **P1-10 实现动画识别和预览**
  - 按数字后缀自动识别动画帧。
  - 支持帧率、循环、播放控制和手动分组。
  - 动画播放时允许实时调整并验证 Pivot。

- [ ] **P1-11 完善 Smart Folder 生命周期**
  - 支持权限恢复、立即同步、文件重命名和目录结构变化。
  - 项目重开后恢复目录句柄或清晰请求重新授权。
  - 处理跨浏览器降级和不支持提示。

- [ ] **P1-12 增加高优先级导出格式**
  - 依次实现 Defold、SpriteKit、Unreal/Paper2D、MonoGame、Solar2D。
  - 每完成一个格式都必须增加 golden fixture 和目标端验证。

## Phase 2：专业图集和压缩

- [ ] **P2-01 实现真正的 Polygon Packer**
  - 实现轮廓凸分解、碰撞检测和允许矩形包围盒重叠的排布。
  - 与旋转、Padding、Multipack 和最大尺寸协同工作。
  - 对比 MaxRects 的面积利用率并增加性能基准。

- [ ] **P2-02 实现网格三角化和标准 Mesh 导出**
  - 生成 vertices、triangles、UV 和索引数据。
  - 验证旋转、裁切和缩放后的坐标变换。
  - 至少完成 Unity tight mesh 的实际导入验证。

- [ ] **P2-03 实现 Normal Map 同布局打包**
  - 支持自动识别、后缀识别和路径过滤。
  - 对主纹理与法线纹理应用相同的 trim、extrude、padding 和 layout。
  - 在一个数据文件中正确引用两张纹理。

- [ ] **P2-04 实现 Alpha Handling**
  - 支持 Keep Transparent Pixels、Clear Transparent Pixels、Alpha Bleeding 和 Premultiply Alpha。
  - 增加透明边缘颜色和渲染伪影测试。

- [ ] **P2-05 实现 Dithering**
  - 支持 Floyd-Steinberg、Atkinson 及其 Alpha 版本。
  - 为低色深和 PNG-8 提供强度/算法选项。
  - 增加质量对比和性能测试。

- [ ] **P2-06 完善 PNG-8 和 PNG 优化**
  - 支持可调颜色数量、透明色表和压缩等级。
  - 展示发布前后的文件体积与质量预览。
  - 将编码放入 Worker，避免阻塞 UI。

- [ ] **P2-07 接入 GPU 纹理压缩**
  - 先评估并实现 Worker + WASM 的 Basis Universal/KTX2。
  - 根据需求再扩展 ASTC、ETC、PVRTC 和 DDS。
  - 明确浏览器内存、编码耗时和平台兼容限制。

- [ ] **P2-08 实现自定义导出模板系统**
  - 支持变量、循环、条件和导出格式能力声明。
  - 提供安全沙箱、模板预览和错误定位。
  - 支持导入、导出和分享自定义模板。

- [ ] **P2-09 实现 Sprite Sheet Cutter**
  - 支持 Grid/Strip、透明间隔和纯色背景切图。
  - 支持从 JSON、plist、atlas 等数据文件还原精灵。
  - 支持预览、选择、命名和批量导出。

## Phase 3：自动化与生态

- [ ] **P3-01 抽离共享 Packer Core**
  - 将打包、图像处理和格式生成从 UI 中解耦。
  - 让浏览器、Node CLI、Worker 和测试共享同一实现。
  - 消除主线程与 Worker 的重复算法代码。

- [ ] **P3-02 实现 Node CLI**
  - 支持读取项目、覆盖参数、添加输入目录和批量发布。
  - 提供稳定退出码、机器可读错误和进度输出。
  - 支持在本地构建脚本中无 UI 运行。

- [ ] **P3-03 实现 Smart Update Hash**
  - 对输入内容、设置、工具版本和导出器版本生成哈希。
  - 状态未变化时跳过编码和文件写入。
  - 支持强制发布选项。

- [ ] **P3-04 提供 CI 和 Docker 工作流**
  - 提供 GitHub Actions 示例。
  - 提供 Docker 镜像或 Dockerfile。
  - 文档化依赖缓存、产物缓存和并行构建策略。

- [ ] **P3-05 实现批量图像转换模式**
  - 支持不打包图集，仅转换单张或多张纹理。
  - 复用缩放、Alpha、Dither 和压缩设置。

- [ ] **P3-06 实现二级代码文件生成**
  - 支持 Swift、C#、C++ 等 sprite ID 或源码文件。
  - 与命名空间、类名、Multipack 和 Scaling Variants 协同。

- [ ] **P3-07 按用户需求扩展长尾格式**
  - 根据真实用户数据确定后续格式顺序。
  - 每个新增格式必须包含 fixture、兼容性说明和维护负责人。
  - 不以单纯追齐格式数量替代核心质量建设。
