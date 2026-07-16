# 导出格式兼容性

本文固定 P1-12 新增导出器的目标版本、验证依据和已知限制。所有格式均有包含裁切、2x 坐标和第 3 个 sheet 文件名场景的 golden fixture；除 Solar2D 外均覆盖旋转。

| 格式 | 输出 | 兼容目标 | 自动验证 | 已知限制 |
| --- | --- | --- | --- | --- |
| Defold | `.tpinfo` | Defold `extension-texturepacker` 的 tpinfo v2 文本 protobuf | 验证 page、sprite、裁切字段、旋转标记和矩形三角网格 | 当前每个 multipack sheet 生成独立 tpinfo；不生成 `.tpatlas` 动画文件；`is_solid` 保守写为 false |
| SpriteKit | `.atlasc` | TexturePacker legacy SpriteKit plist format 3 | 验证 plist 头、XML 转义、旋转/裁切和纹理引用 | Apple 的编译 atlas 格式是私有格式；本文件不是 Xcode 编译出的 `.atlasc`，也不替代 `.atlas` 源目录 |
| Unreal / Paper2D | `.paper2dsprites` | Unreal Paper2D TexturePacker importer | JSON 回读并验证 `meta.target=paper2d`、frame、trim、rotation 和纹理引用 | 不生成 Flipbook 分组或自定义碰撞几何；这些资源由 Unreal 导入器创建或在编辑器内配置 |
| MonoGame Extended | `.json` | MonoGame.Extended Texture2DAtlas data format 1.2 | JSON 回读并验证 textures、frames、offset、pivot 和 90° rotation | MonoGame Content Pipeline 不允许同目录下 PNG 和 JSON 使用相同 basename；发布前应把图片模板设为例如 `{name}-texture{n}{suffix}.{ext}` |
| Solar2D | `.lua` | `graphics.newImageSheet()` complex ImageSheet options | 验证 frame、trim source、sheet 尺寸、名称索引和辅助函数 | 官方 ImageSheet frame 不支持旋转；导出器发现旋转帧会中止并提示关闭 rotation。Lua 数据按 Solar2D 惯例不内嵌图片名 |

## 目标端依据

- [Defold TexturePacker extension](https://defold.com/extension-texturepacker/) 使用 `.tpinfo` 配合 `.tpatlas`；其[格式说明](https://github.com/defold/extension-texturepacker/blob/main/README_FORMAT.md)定义 v2 text protobuf、page、sprite 和矩形 mesh 回退。
- [Apple SpriteKit atlas 文档](https://developer.apple.com/documentation/spritekit/about-texture-atlases)明确指出 Xcode 编译后的 atlas 格式是私有实现，因此这里固定的是 TexturePacker legacy plist，而不声称生成 Apple 私有二进制。
- [Unreal Paper2D 导入文档](https://dev.epicgames.com/documentation/unreal-engine/import-sprites-in-unreal-engine)规定 TexturePacker 工作流使用 `.paper2dsprites` 文件导入纹理和精灵。
- [MonoGame.Extended Texture2DAtlas 文档](https://www.monogameextended.net/docs/features/texture-handling/texture2datlas/)给出 `monogame-extended` 1.2 JSON 结构及 Content Pipeline 文件命名约束。
- [Solar2D ImageSheet 文档](https://docs.coronalabs.com/guide/media/imageSheets/index.html)定义 complex frame 的 `x/y/width/height`、裁切 `source*` 和 `sheetContent*` 字段。

## 回归规则

修改任何导出器时必须同步更新对应 golden fixture，并保留结构测试。格式版本、字段名、旋转方向、裁切偏移或文件扩展名发生变化时，必须在本文记录迁移影响；不得只更新 fixture 来掩盖不兼容变化。
