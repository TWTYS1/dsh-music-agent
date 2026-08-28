# DSH Music Agent

以乐理教学为主轴、记忆归用户的中文音乐学习伴侣，作为 [DSH](https://www.npmjs.com/package/@deepseek-ai/dsh) 插件运行。

乐理不交给模型推算，而由纯函数引擎计算；讲和弦时能直接放出声音；用户的乐器、水平、
音域与练习记录存在本地，跨对话持续生效。

## 为什么做这个

竞品调研（见 `docs/DESIGN.md` 第 1 节）得出的结论是：

- **对话式搜歌已经饱和。** Spotify AI DJ 有约 9400 万付费用户在用，GitHub 上「让 AI 控制音乐播放」的
  MCP 方案至少十个且免费。只做搜歌没有竞争力。
- **乐理教学有付费验证，但缺中文方案。** 已有产品做到聊天式导师加跨会话记忆并放在订阅层，
  但是英文的，且不接流媒体曲库。
- **两边的交集是空的。** 教学类产品不接曲库，曲库类产品不做教学。

所以本项目的定位不是「又一个能搜歌的 AI」，而是**用真实曲库当素材、记忆归用户的中文乐理学习伴侣**。
搜歌在这个定位里是教学的素材来源，不是卖点。

## 能力

### 乐理引擎

纯函数实现，不经过模型推理 —— 乐理有唯一正确答案，交给模型会在拼写细节上出错。

| 工具 | 作用 |
|---|---|
| `get_scale` | 11 种音阶调式，含级数、功能名称与调号 |
| `get_chord` | 11 种和弦品质、4 级转位，含音程结构与和弦符号 |
| `get_interval` | 音程计算，区分增四度与减五度 |
| `get_key_signature` | 调号、变化音与关系调 |
| `get_circle_of_fifths` | 五度圈邻调、关系调、同主音调 |
| `generate_exercise` | 4 题型 × 5 难度，按规则生成，支持 seed 复现 |

音名采用「字母 + 变化音」建模而非半音数，因此：

```
G 大调第七音    F#    而不是 Gb
C# 大调         C# D# E# F# G# A# B#
C 减七和弦      C Eb Gb Bbb    而不是 C Eb Gb A
C→F# / C→Gb    增四度 / 减五度，半音数同为 6 但功能不同
```

覆盖约 385 种音阶组合与 1540 种和弦组合，均为计算所得而非查表。

### 音频

| 工具 | 作用 |
|---|---|
| `play_notes` | 合成并播放音符，支持同时奏响、依次奏响、先依次再同时 |

纯 Node 合成 WAV 后交系统播放器，无原生依赖、无需 GPU。音色为基频加五阶泛音，
含 attack/release 斜坡防爆音，叠加后归一化防削波。

### 记忆

| 工具 | 作用 |
|---|---|
| `remember_profile` | 记录乐器、水平、唱名体系、学习目标、声乐音域 |
| `record_exercise_result` | 记录已批改的练习作答 |
| `record_track_feedback` | 记录曲目采纳、跳过、拉黑 |
| `get_memory` | 读取完整记忆与派生画像 |

三层结构：`profile`（结构化事实）、`episodes`（append-only 事件日志）、
`derived`（掌握度、薄弱项、口味，由 episodes 纯函数派生，不独立存储）。

记忆经 `ctx.systemPrompt` 的段与变量注入，每步组装重新求值，因此写入后立即生效。
数据落在 `$DSH_HOME/music-memory/`，不进版本控制。

### 曲库

| 工具 | 状态 |
|---|---|
| `search_tracks` | 按关键词、情绪、场景检索。**当前为 Mock 数据** |

真实曲库计划走网易云音乐官方开放平台的 `@music163/ncm-cli`，等待 API 凭证。

## 快速开始

```powershell
pnpm install --ignore-scripts
pnpm run dsh:init      # 初始化两个隔离 profile
pnpm run dsh:sync      # 构建并同步插件与 preset
pnpm run smoke          # 确定性检查
```

### 桌面界面

双击项目根目录的 `启动音乐助手.cmd`，或：

```powershell
pnpm run dsh:gui
```

会在 `http://127.0.0.1:3080` 启动服务，并以**独立桌面窗口**打开 —— 没有地址栏和标签页，
有自己的任务栏图标。实现方式是 Edge 或 Chrome 的 `--app` 模式，不需要 Electron。

窗口使用独立的 `--user-data-dir`，与日常浏览器会话互不影响。改用普通标签页加 `-Browser`，
换端口加 `-Port`。

### 一次性问答

```powershell
pnpm run dsh:ask "C 减七和弦由哪四个音组成？"
pnpm run dsh:ask "放一下 C 大调音阶，慢一点"
```

`dsh:gui` 与 `dsh:start` 是长运行命令，请在自己的终端启动。

## 架构

```
src/
├─ theory/     乐理引擎：纯函数、零依赖、不引用 DSH
├─ audio/      合成与编码为纯函数，仅 player.ts 有 I/O
├─ memory/     派生与渲染为纯函数，仅 store.ts 有 I/O
├─ gateway/    曲库接入，接口可替换
├─ tools/      唯一知道 DSH 存在的一层
└─ smoke.ts    确定性检查
```

分层铁律是 `theory/` 不得引用 DSH、不得有 I/O。理由是乐理有唯一正确答案，
必须能脱离运行时独立验证 —— 一旦混入运行时依赖，正确性就无法单独测量。

`audio/` 与 `memory/` 同理：纯函数部分可自动验证，只有「声音好不好听」需要人耳判断。

## 验证

不引入单测框架，用 `smoke.ts` 做确定性检查，覆盖：

- 音名拼写的易错场景（C♯ 大调、降号调、和声小调升七音、减七和弦重降音）
- 增四度与减五度的区分
- 练习生成的可复现性（同 seed 同题）
- 波形属性与 WAV 头自洽
- 记忆派生的纯度与时间衰减

```powershell
pnpm run check    # 类型检查
pnpm run smoke    # 构建并运行检查
```

记忆层的阈值缺陷就是 smoke 抓到的：它不属于类型错误，也不抛异常，只是让掌握度判定永不生效。

## 开发

profile 里的插件是指向本项目的 Junction 目录链接，`dsh:sync` 只在首次链接、依赖变化或
bundle 变化时需要。日常开发只要让 `dist` 保持最新：

```powershell
pnpm run watch
```

配合 base 层启用的 HMR，保存代码后无需重启界面。

## 当前边界

明确不做或尚未做的部分：

| 项 | 状态 |
|---|---|
| 真实曲库 | 等待开放平台凭证 |
| 概念教学（功能和声、常用进行） | 计划以 Skill 承载 |
| 谱例与键盘可视化 | 需 DSH 客户端插件层 |
| 麦克风输入、音准反馈、扒谱 | 未做 |
| 播放控制、登录、收藏、建歌单 | 有意排除（副作用操作） |
| 生成音乐 | 有意延后（版权诉讼环境） |

## 文档

- `docs/DESIGN.md` —— 定位、架构、领域模型、记忆层设计、决策记录与实施记录

## 隔离约定

- 依赖与可写的 DSH 状态只存在于本目录
- 启动脚本只为子进程设置 `DSH_HOME`，不改动用户的持久环境
- 两个隔离 profile：`dsh-music-agent-dev`（桌面界面）、`dsh-music-agent-cli`（一次性问答）
- 修改 profile 的 `cordis.patch.yml`，而非生成的 `cordis.yml`
- 凭证与会话记录落在 `.dsh-music-dev/`，已被 `.gitignore` 排除
