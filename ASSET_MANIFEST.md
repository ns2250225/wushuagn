# ASSET_MANIFEST — 资源清单

本项目遵循 PRD「本地化资源管理」与「资源与版权要求」：**所有模型、动画、贴图、特效、音效与音乐均为程序生成的原创内容**，运行时不依赖任何第三方链接，也未使用任何从商业游戏中提取的资源。

角色外观为「方块化原创重构」：仅参考三国题材人物广为人知的配色与标志物（如长须、雉翎、偃月刀），未复制任何作品的模型、贴图或动画数据。

| 资源 | 类型 | 来源 / 生成方式 | 授权 | 用途 | 位置 |
|---|---|---|---|---|---|
| 武将方块模型（赵云、关羽、张飞、吕布、刘备、孙尚香、曹操） | 3D 模型 | 程序化立方体拼装（头、躯干、四肢、发型、胡须、头饰、盔甲、披风） | 原创 | 玩家武将 / 敌将 / NPC | `src/characters/CharacterFactory.ts`, `src/data/heroes.ts` |
| 敌将外观（华雄、张辽、夏侯惇、文丑、颜良、于禁、张郃、李傕、真·吕布） | 3D 模型参数 | 同上 | 原创 | Boss / 副将 | `src/data/enemies.ts` |
| 武器模型（长枪、偃月刀、蛇矛、方天画戟、双剑、剑、乾坤圈、大刀、钩镰、斧） | 3D 模型 | 程序化立方体拼装 | 原创 | 武器 | `src/characters/WeaponController.ts` |
| 士兵模型（刀盾 / 长枪 / 弓 / 重装 / 骑兵 / 精英 / 友军） | 3D 模型（实例化） | 程序化，所有部件合批到单个 InstancedMesh | 原创 | 普通敌兵 | `src/enemies/SoldierRenderer.ts` |
| 角色动画 | 关键帧姿势 | 程序化关键帧插值（攻击、受击、闪避、倒地、起身、无双、胜利） | 原创 | 全部角色 | `src/characters/AnimationController.ts` |
| 方块贴图（草地、泥土、石砖、木板、原木、树叶、沙、水、屋瓦、金瓦、红漆、干草、大理石等） | 16×16 像素贴图 | Canvas 运行时生成 | 原创 | 场景方块 | `src/scene/textures.ts` |
| 角色像素噪声贴图 | 8×8 像素贴图 | Canvas 运行时生成 | 原创 | 角色材质 | `src/scene/textures.ts` |
| 法阵贴图 / 战旗贴图 / 天空渐变 | 贴图 | Canvas 运行时生成 | 原创 | 特效 / 场景 | `src/scene/textures.ts` |
| 关卡地图（虎牢关、长坂坡、官渡、赤壁、成都、洛阳） | 方块地图 | 程序化模块化建筑系统 | 原创 | 6 个战役 | `src/levels/levels/*.ts` |
| 技能特效（方块剑气、冲击波、能量柱、法阵、雷电、火焰、残影、拖尾、爆炸） | 粒子 / 网格 | 程序化，对象池复用 | 原创 | 战斗特效 | `src/effects/*.ts` |
| 战斗音效（挥砍、突刺、命中、格挡、爆炸、震地、无双、号角、战鼓等 27 种） | 音效 | Web Audio API 实时合成 | 原创 | 音效 | `src/audio/AudioManager.ts` |
| 背景音乐（首页、战斗、Boss、胜利、失败） | 音乐 | 五声音阶程序化编曲，Web Audio 实时合成 | 原创 | 音乐 | `src/audio/AudioManager.ts` |
| 战场环境音（风声） | 环境音 | 滤波噪声实时合成 | 原创 | 环境音 | `src/audio/AudioManager.ts` |
| 应用图标 | SVG | 手绘像素图 | 原创 | 网页图标 | `public/icon.svg` |
| Three.js | 引擎 | npm `three@0.170.0` | MIT | 3D 渲染 | `node_modules`（构建时打包） |

## 资源检查

```bash
npm run check-assets
```

检查本清单中列出的所有本地资源文件是否存在。

## 修改记录

| 日期 | 修改 |
|---|---|
| V1.0 | 首版：7 名武将、9 名敌将、7 种士兵、6 个战场、全部程序化音效与音乐 |

## 后续接入外部资源的规范

若后续接入 GLB 模型、音频或贴图：

1. 放入 public/assets/ 下的 models、animations、textures、effects、audio、maps 子目录，构建时随项目打包，不使用运行时第三方链接。
2. 模型统一转换为 GLB（建议 Draco / Meshopt 压缩），贴图使用 KTX2 / Basis。
3. 在本表追加：名称、来源 URL、作者、许可证、修改记录与用途。
4. 运行 `npm run check-assets` 确认文件齐全。
