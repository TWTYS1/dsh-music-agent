# DSH Music Agent

独立、只读、最小可运行的 DSH 音乐 Agent。当前仅提供确定性 Mock 搜歌与推荐，不连接外部音乐服务，也不提供播放、登录、收藏或歌单写操作。

定位与路线见 [`docs/DESIGN.md`](docs/DESIGN.md)。

## 能力

### 乐理引擎

纯函数实现，不经过模型推理 —— 乐理有唯一正确答案，交给模型会算错。

| 工具 | 作用 |
|---|---|
| `get_scale` | 音阶推导，含级数、功能名称与调号 |
| `get_chord` | 和弦构成与转位，含音程结构与和弦符号 |
| `get_interval` | 音程计算，区分增四度与减五度 |
| `get_key_signature` | 调号、变化音与关系调 |
| `get_circle_of_fifths` | 五度圈邻调、关系调、同主音调 |
| `generate_exercise` | 按规则生成练习题，含答案与讲解，支持 seed 复现 |

音名采用「字母 + 变化音」建模而非半音数，因此 G 大调第七音是 `F#` 而不是 `Gb`，
C 减七和弦第七音是 `Bbb` 而不是 `A`。

### 曲库

| 工具 | 作用 |
|---|---|
| `search_tracks` | 按关键词、情绪、场景检索，当前为 Mock 数据 |

### 音频

| 工具 | 作用 |
|---|---|
| `play_notes` | 合成并播放音符，支持同时奏响、依次奏响、先依次再同时 |

纯 Node 合成 WAV 后交给系统播放器，无原生依赖。音色为基频加五阶泛音，
带 attack/release 斜坡以避免爆音，叠加后归一化防削波。

### 运行形态

- 隔离 profile：`dsh-music-agent-dev`（网页界面）、`dsh-music-agent-cli`（一次性问答）
- 独立 `DSH_HOME`：`.dsh-music-dev`
- 音乐专用 agent preset：不含 Shell、文件系统、子代理与工作流
- 固定入口：`启动音乐助手.cmd` → `http://127.0.0.1:3080`

## 打开桌面界面

双击项目根目录的 `启动音乐助手.cmd`，或执行：

```powershell
pnpm run dsh:gui
```

它会构建插件、在固定地址 `http://127.0.0.1:3080` 启动服务，并以**独立桌面窗口**打开界面：没有地址栏和标签页，有自己的任务栏图标。

桌面窗口用 Edge 或 Chrome 的 `--app` 模式实现，不需要安装 Electron 之类的运行时。它使用独立的 `--user-data-dir`（在 `.dsh-music-dev/desktop-shell`），因此与日常浏览器的会话互不影响。

想用普通浏览器标签页打开，加 `-Browser`；换端口用 `-Port`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dsh-music-dev.ps1 gui -Browser
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dsh-music-dev.ps1 gui -Port 3100
```

界面由 `@deepseek-ai/dsh-web-app` bundle 提供，脚本会自动把它写入 web profile 的 `bundles`，并保证它排在 `dsh-music-agent` 之前（后面的层会覆盖前面的 persona）。

## 改代码不需要重新部署

profile 里的插件是指向本项目的 Junction 目录链接，`dsh:sync` 只在首次链接或依赖变化时需要。日常开发只要让 `dist` 保持最新：

```powershell
pnpm run watch
```

配合 base 层启用的 HMR 插件，保存代码后无需重启界面。

## 其他命令

```powershell
pnpm run check
pnpm run build
pnpm run smoke
pnpm run dsh:init
pnpm run dsh:sync
pnpm run dsh:config
pnpm run dsh:ask "推荐几首适合通勤的轻松音乐"
```

`dsh:gui` 和 `dsh:start` 是长运行命令，请在自己的终端启动。
