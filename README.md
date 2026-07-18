# 期末补完计划 (Final Exam Closure)

> AI 驱动的期末复习桌面应用

[![Electron](https://img.shields.io/badge/Electron-32-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 功能特性

### 核心功能
- **资料管理** - 支持 PDF、DOCX、Markdown、图片上传与解析，支持标签分类和收藏
- **本地智能分类** - 基于关键词的即时分类引擎，60+ 学科内置词典，支持别名/缩写匹配（如"习概"→"习近平新时代..."）
- **图片 OCR** - Tesseract.js 中英文识别 + 百度云 OCR API，上传图片/PDF 自动提取文字
- **AI 辅助分类** - 当规则分类置信度不足时，AI 自动辅助决策
- **AI 搜集** - 智能搜索互联网复习资料，多源聚合
- **错题本** - 自动记录错题，支持重练和导出

### Claude 智能助手
- **Claude 持久会话** - 基于 Claude CLI 的持久化对话，支持跨页面保持上下文，自动管理 session 生命周期
- **Skills 插件系统** - 可扩展的技能插件架构，内置 exam-review / beautiful-article / wiki-builder 三个技能，支持启用/禁用/添加/移除
- **模板化内容生成** - 四种生成模板（复习文档 / 速查手册 / 练习题集 / 文章），选择资料后一键生成
- **流式输出** - 实时显示 AI 生成内容，支持中途停止，工具调用可视化（Read/Write/Bash 等）
- **Wiki 对话式构建** - 通过 Claude 对话自动构建 Wiki 知识库，支持自定义指令和后续追问

### 智能文档编排
- **6 阶段流水线** - 素材分析 → 大纲规划 → 风格锚定 → 流式生成 → 终审检查 → 修复输出
- **3 个用户检查点** - 大纲/风格/终审阶段暂停等待用户确认，支持一键返工
- **流式生成** - 逐 topic 实时生成，已完成 topic 折叠展示 + 质量指标，当前 topic 自动滚动预览
- **GenerationSession** - 独立会话管理，支持 API / Claude CLI 双 provider，消息历史自动压缩

### PDF OCR 管线
- **双引擎支持** - Tesseract.js（本地离线）+ 百度云 OCR API（高精度在线）
- **队列式处理** - 批量 PDF OCR，浮窗进度指示，单个/批量操作
- **OCR 撤销** - 识别后支持一键恢复原始状态
- **设置面板** - 百度 OCR API Key 配置界面

### 搜索引擎
- **多源聚合搜索** - 25+ 搜索源并行搜索（学术 API + 垂直领域 + 站点爬取）
- **AnySearch API** - 23 个垂直领域搜索（学术/代码/技术/教育），无需浏览器
- **学术搜索** - Semantic Scholar / arXiv / CrossRef / DBLP / OpenAlex 五大免费 API
- **智能去重** - URL 标准化 + 跨引擎交叉验证 + 标题去重
- **内容预览** - 搜索结果可展开查看网页全文（AnySearch 提取 + BrowserWindow 兜底）
- **反爬对抗** - UA 伪装、验证码检测、超时保护、DDG HTML 兜底

### Wiki 知识库
- **自动构建** - 从资料自动提取概念、生成源文档、综合复习页
- **对话式构建** - 基于 Claude 的对话式 Wiki 生成，支持自定义指令
- **知识图谱** - 概念关系可视化，交互式图谱
- **AI 对话** - 基于 Wiki 内容的问答

### 其他
- **薄弱点分析** - 基于答题数据的分析报告
- **终端** - 内置终端支持 Claude Code/MiMo 等 CLI 工具
- **主题切换** - 6 种配色主题（深海蓝/森林绿/暖阳橙/暮光紫/玫瑰红/暗夜模式）
- **资料筛选** - 全部资料 / 收藏 / 图片 / 非图片 / 自定义标签

## 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn
- （可选）Claude Code CLI — 用于 Claude 智能助手功能

### 安装

```bash
# 克隆项目
git clone https://github.com/shizelengleng/final-exam-closure.git
cd final-exam-closure

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 配置 AI

1. 启动应用后，点击右上角设置图标
2. 在「AI 配置」标签页选择 AI 模型（DeepSeek / MiMo / Claude Code）
3. 输入 API Key 并保存

> 不配置 AI 也可使用全部本地功能（分类、OCR 等）

### 配置 Claude 智能助手（可选）

1. 安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
2. 在设置中将 AI Provider 切换为 `claude-code`
3. 进入学科 → 内容标签即可使用 Claude 智能助手

### 配置百度 OCR（可选）

1. 申请 [百度云 OCR API](https://cloud.baidu.com/product/ocr)
2. 在设置 → OCR 配置中填入 API Key 和 Secret Key
3. 在资料管理中即可选择百度 OCR 引擎识别 PDF

### 打包

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 32 |
| 前端框架 | React 18 + TypeScript |
| UI 组件 | Ant Design + Tailwind CSS |
| 状态管理 | Zustand |
| 本地存储 | JSON 文件 (Electron IPC) |
| 图片 OCR | Tesseract.js (本地) + 百度云 OCR API |
| AI 模型 | DeepSeek / MiMo / Claude Code CLI |
| 搜索引擎 | AnySearch API + 学术 API + 浏览器爬取 |
| 打包工具 | Vite 5 + electron-builder |

## 项目结构

```
final-exam-closure/
├── electron/                    # 主进程
│   ├── main.ts                 # 入口文件
│   ├── preload.ts              # 预加载脚本（Context Bridge）
│   ├── db/
│   │   └── store.ts            # JSON 文件存储引擎
│   ├── ipc/
│   │   ├── aiHandlers.ts       # AI 相关 IPC（含 Claude session、Skill 管理）
│   │   ├── dbHandlers.ts       # 数据存储 IPC
│   │   ├── searchHandlers.ts   # 搜索 IPC
│   │   ├── wikiHandlers.ts     # Wiki IPC（含对话式构建）
│   │   └── contextHandlers.ts  # 项目上下文 IPC
│   ├── services/
│   │   ├── aiClient.ts         # AI 调用层（API + Claude CLI 双通道 + 流式）
│   │   ├── claudeSessionManager.ts  # Claude CLI 持久会话管理
│   │   ├── generationSession.ts     # 文档生成会话（topic-by-topic 流式）
│   │   ├── streamBroker.ts          # 流式事件 pub/sub 总线
│   │   ├── skillManager.ts          # Skills 插件管理器
│   │   ├── documentOrchestrator.ts  # 智能文档编排（6 阶段状态机）
│   │   ├── baiduOcr.ts              # 百度云 OCR API 客户端
│   │   ├── searchEngine.ts          # 搜索引擎核心
│   │   ├── anysearch.ts             # AnySearch API 客户端
│   │   ├── browserSearch.ts         # 浏览器搜索 (Bing/Baidu)
│   │   ├── academicSearch.ts        # 学术 API 搜索
│   │   ├── wikiBuilder.ts           # Wiki 构建
│   │   ├── wikiReader.ts            # Wiki 读取
│   │   ├── docxConverter.ts         # MD → DOCX 转换
│   │   └── projectContext.ts        # 项目上下文系统
│   └── terminal/
│       ├── context.ts           # 终端上下文
│       └── globalApi.ts         # 终端全局 API
├── src/                         # 渲染进程
│   ├── App.tsx                  # 根组件（8 tab: search/materials/content/graph/review/analysis/wiki/settings）
│   ├── components/
│   │   ├── Skills/              # Claude 智能助手
│   │   │   ├── ClaudeChat.tsx   # 主对话界面（模板选择 + 流式聊天）
│   │   │   └── SkillManager.tsx # 插件管理面板
│   │   ├── Content/             # 智能文档生成
│   │   │   ├── OrchestrationProgress.tsx  # 编排进度（含流式预览）
│   │   │   └── CheckpointModal/           # 检查点确认弹窗
│   │   ├── Wiki/
│   │   │   ├── WikiBrowser.tsx      # Wiki 浏览器
│   │   │   └── WikiBuildChat.tsx    # Wiki 对话式构建
│   │   ├── Materials/
│   │   │   └── MaterialList.tsx     # 资料管理（含 PDF OCR 管线）
│   │   ├── Common/
│   │   │   ├── SettingsModal.tsx    # 设置弹窗（含 Skill/OCR 配置）
│   │   │   ├── OcrSettings.tsx      # 百度 OCR 配置
│   │   │   ├── FileViewer.tsx       # 文件预览（含 OCR 撤销）
│   │   │   ├── ConversationPanel.tsx # 统一对话面板
│   │   │   └── ...
│   │   ├── KnowledgeGraph/      # 知识图谱
│   │   ├── Quiz/                # AI 出题
│   │   ├── Review/              # 错题本
│   │   ├── Analysis/            # 薄弱点分析
│   │   ├── Search/              # AI 搜集
│   │   └── Overview/            # 学科总览
│   ├── stores/
│   │   └── orchestrationStore.ts # 编排状态管理（含流式事件处理）
│   ├── contexts/                # React Context（主题）
│   ├── lib/
│   │   └── classifier.ts        # 本地分类引擎
│   └── styles/
├── public/
│   ├── chi_sim.traineddata      # Tesseract 中文训练数据
│   └── eng.traineddata          # Tesseract 英文训练数据
└── package.json
```

## 架构概览

### 数据流

```
┌─────────────┐     IPC      ┌──────────────────┐
│  Renderer   │◄────────────►│  Main Process    │
│  (React)    │              │                  │
│             │  claude.*    │  claudeSession   │
│  ClaudeChat │─────────────►│  Manager         │──► Claude CLI (child process)
│             │◄─── delta ───│                  │
│             │              │                  │
│  Orchestra- │  orchestrat  │  document        │
│  tionProgress│────────────►│  Orchestrator    │──► streamBroker ──► GenerationSession
│             │◄─── stream ──│                  │         │
│             │              │                  │         ▼
│  Material   │  file.ocrPd  │  baiduOcr /     │    streamAI (API/CLI)
│  List       │─────────────►│  tesseract      │
│             │              │                  │
│  Skill      │  skill.*     │  skillManager    │──► userData/.claude/skills/
│  Manager    │─────────────►│                  │
└─────────────┘              └──────────────────┘
```

### AI Provider 双通道

| Provider | 调用方式 | 流式支持 | 适用场景 |
|----------|---------|---------|---------|
| DeepSeek / MiMo | HTTP API (OpenAI 兼容) | SSE | 快速出题、简单问答 |
| Claude Code CLI | 子进程 (`claude --output-format stream-json`) | stream-json | 复杂生成、Skills、Wiki 构建 |

### Skills 插件系统

Skills 是可复用的提示词/指令包，存储在 `userData/.claude/skills/` 目录下。`skillManager` 在初始化时从用户目录复制内置技能，`claudeSessionManager` 在创建会话时将 skills 目录软链到学科工作区，使 Claude CLI 能自动加载技能指令。

内置 Skills：
- **exam-review** — 考试复习文档生成
- **beautiful-article** — 精美文章排版
- **wiki-builder** — Wiki 知识库构建

## 本地分类引擎

分类系统完全本地运行，无需网络：

1. **内置词典** - 60+ 大学学科关键词（历史/思政/数学/物理/化学/计算机/英语/经管/法学/文学/教育/医学）
2. **别名匹配** - 自动识别学科缩写（"习概"、"马原"、"史纲"等）
3. **共享词降权** - 多学科共有的关键词自动降低权重，避免误分类
4. **模糊匹配** - 容忍 OCR 文本中的空格和字符缺失（70% 阈值）
5. **AI 兜底** - 置信度不足时可选调用 AI 辅助决策

## 版本历史

- **v0.4.0** — Claude 智能助手 + Skills 插件 + 流式生成 + 百度 OCR + Wiki 对话式构建
- **v0.3.0** — 对话式交互重构 + 项目上下文系统
- **v0.2.5** — 智能文档生成编排系统（6 阶段 + 3 检查点）
- **v0.2.0** — Wiki 知识库 + 搜索引擎重构 + AnySearch + 文件查看器
- **v0.1.0** — 初始发布（资料管理、出题、知识图谱、搜索、Wiki）

## 作者

**矢泽冷冷** - [GitHub](https://github.com/shizelengleng)

## 许可证

MIT License
