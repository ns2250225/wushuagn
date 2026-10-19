# 方块三国无双 · Block Dynasty Warriors

我的世界风格的 3D 网页三国割草动作游戏。Three.js + TypeScript + Vite，原生 DOM UI，无后端，所有美术与音频均为程序生成。

## 运行

```bash
npm install
npm run dev        # 开发服务器（--host，可用手机在局域网访问）
npm run build      # 类型检查 + 生产构建，输出到 dist/
npm run preview    # 预览构建结果
npm run check-assets   # 资源缺失检查
```

`dist/` 为纯静态文件，可直接部署到任意静态托管 / CDN（`base: './'`，支持子目录部署）。需要支持 WebGL 2.0 的浏览器。

## 操作

| 操作 | PC | 移动端 |
|---|---|---|
| 移动 | WASD / 方向键 | 左侧虚拟摇杆（任意位置按下） |
| 普通攻击（按住连段） | J / 鼠标左键 | 普攻 |
| 重攻击 / 长按蓄力 | K / 鼠标右键 | 重击（长按蓄力） |
| 技能一 / 技能二 | U / I | 技一 / 技二 |
| 无双技 | O | 无双（满能量时高亮） |
| 闪避 | 空格 | 闪避 |
| 锁定目标 | Tab | 锁定 |
| 暂停 | Esc | 右上角暂停按钮 |
| 镜头 | 鼠标移动（点击画面锁定指针）/ Q E | 右侧空白区域滑动 |

键位可在「设置」中重新映射；触屏按钮的透明度、大小、位置均可调整。

## 内容

- **武将（7 名）**：赵云、关羽（初始）、张飞、刘备、孙尚香、曹操、吕布（随战役解锁）。每名武将拥有独立连段（5–6 段）、重攻击、蓄力攻击、2 个特色技能与 1 个无双终结技（共 21 个脚本化技能）。
- **战役（6 关）**：虎牢关突围战 → 长坂坡突围 → 官渡之战 → 赤壁之战 → 成都攻防战 → 洛阳决战。目标类型包括清除波次、摧毁目标、击败敌将、保护友军、抵达地点、限时击杀；战场事件包括友军支援、敌方援军、城门开启、敌将登场。
- **难度**：简单 / 普通 / 困难 / 修罗（通关全部战役解锁）。
- **敌军**：刀盾兵（正面格挡）、长枪兵、弓兵、重装兵（霸体）、骑兵（冲锋）、精英兵（范围攻击）；9 名敌将 Boss，带登场演出、攻击范围提示、狂暴阶段、终结攻击与「破绽」反击时机。
- **成长**：武将等级（上限 50）、熟练度、每名武将 3 把武器（含炎 / 雷 / 冰 / 斩 / 风属性）、武器强化 +10、铠甲与饰品、12 项成就、关卡评价 S/A/B/C。
- **存档**：localStorage，带版本号迁移、合法性修正与备份恢复。

## 架构

```
src/
├── main.ts
├── game/        Game（状态机 / 菜单展示场景 / 结算）、Battle（战斗运行时）、GameLoop（固定步长）、GameState（存档）、PerformanceManager（画质分级与动态降级）、Pickups
├── scene/       SceneManager、CameraController（跟随 / 锁定 / 遮挡 / 特写）、LightingManager、Environment（方块建筑 + 实例化 + AABB 碰撞 + 可破坏物）、textures（像素贴图）、merge（网格合并）
├── characters/  PlayerController、CharacterFactory（方块武将）、AnimationController（程序化关键帧）、WeaponController（武器模型）、NpcController
├── combat/      CombatSystem、AttackHitbox（扇形 + 距离 + 遮挡判定）、DamageSystem、ComboSystem、SkillSystem、Projectiles
├── enemies/     EnemyAI（有限状态机 + 分组激活）、EnemySpawner（波次队列）、EnemyPool（对象池 + 空间哈希）、SoldierRenderer（单 InstancedMesh + LOD）、BossController
├── effects/     EffectManager、ParticlePool（实例化方块粒子）、SlashEffect（武器拖尾 / 刀光）、ScreenShake
├── levels/      LevelManager、BattleObjective、levels/（6 个场景，按需动态加载）
├── controls/    InputManager、KeyboardController、TouchController、VirtualJoystick
├── ui/          HUD、Menu、ResultScreen、RotateOverlay、styles.css
├── audio/       AudioManager（Web Audio 程序化音效与音乐）
└── data/        heroes / enemies / items / levels / types
```

### 性能设计

- 所有士兵的全部身体部件合并在 **一个 InstancedMesh** 中绘制；远处士兵切换为简化 LOD 模型、AI 降频更新。
- 士兵、粒子、刀光、冲击波、投射物、伤害数字全部 **对象池** 复用。
- 场景方块按类型实例化；树木、营帐、可破坏物与角色关节组按材质合并网格。
- 低 / 中 / 高三档画质 + 自动检测；运行时根据帧率动态降低渲染分辨率、粒子密度与同屏士兵上限。
- 远距离特效自动减少粒子；可关闭屏幕震动、强闪光、慢动作。
- 逻辑固定 60Hz 步长，渲染与逻辑分离；单帧时间步长上限防止切后台恢复后瞬移；切后台 / 锁屏自动暂停。

### 移动端

- 竖屏显示旋转提示并冻结战斗，横屏自动恢复；点击「出阵」时尝试全屏与 `screen.orientation.lock('landscape')`，不支持时以遮罩降级。
- 适配刘海屏安全区域（`env(safe-area-inset-*)`），按钮支持振动反馈（可关闭）。

资源来源与授权见 [ASSET_MANIFEST.md](ASSET_MANIFEST.md)。
