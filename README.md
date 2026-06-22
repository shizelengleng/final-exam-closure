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
- **图片 OCR** - Tesseract.js 中英文识别，上传图片自动提取文字用于分类
- **AI 辅助分类** - 当规则分类置信度不足时，AI 自动辅助决策
- **AI 搜集** - 智能搜索互联网复习资料，多源聚合
- **AI 出题** - 基于资料生成 5 种题型（单选/多选/判断/简答/资料分析）
- **交互式答题** - 答题界面 + 按需查看解析
- **错题本** - 自动记录错题，支持重练和导出

### 增强功能
- **Wiki 知识库** - 从资料自动构建结构化知识库，支持概念提取、综合复习页、AI 对话
- **智能文档生成** - 6 阶段编排流水线（素材分析→大纲→风格锚定→并行生成→终审→修复），3 个用户检查点，一键返工
- **文档生成** - 自动生成结构化复习文档（Markdown/PDF），集成在 Wiki 中
- **知识图谱** - 概念关系可视化，交互式图谱
- **AI 答疑** - 基于资料库的对话式答疑
- **薄弱点分析** - 基于答题数据的分析报告
- **终端** - 内置终端支持 Claude Code/MiMo 等 CLI 工具
- **主题切换** - 6 种配色主题（深海蓝/森林绿/暖阳橙/暮光紫/玫瑰红/暗夜模式）
- **视频制作** - 将学习资料转化为视频脚本
- **漂亮文章** - 将学习资料转化为精美文章

### 搜索引擎
- **多源聚合搜索** - 25+ 搜索源并行搜索（学术 API + 垂直领域 + 站点爬取）
- **AnySearch API** - 23 个垂直领域搜索（学术/代码/技术/教育），无需浏览器
- **学术搜索** - Semantic Scholar / arXiv / CrossRef / DBLP / OpenAlex 五大免费 API
- **智能去重** - URL 标准化 + 跨引擎交叉验证 + 标题去重
- **内容预览** - 搜索结果可展开查看网页全文（AnySearch 提取 + BrowserWindow 兜底）
- **反爬对抗** - UA 伪装、验证码检测、超时保护、DDG HTML 兜底

### 资料筛选
- 全部资料 / 收藏 / 图片 / 非图片 / 自定义标签

## 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn

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

### 配置 AI（可选）

1. 启动应用后，点击右上角设置图标
2. 在「AI 配置」标签页选择 AI 模型（DeepSeek/MiMo/Claude Code）
3. 输入 API Key 并保存

> 不配置 AI 也可使用全部本地功能（分类、OCR、出题等）

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
| 本地存储 | JSON 文件 (Electron IPC) |
| 图片 OCR | Tesseract.js (中英文) |
| AI 模型 | DeepSeek / MiMo / Claude (可选) |
| 搜索引擎 | AnySearch API + 学术 API + 浏览器爬取 |
| 打包工具 | electron-builder |

## 项目结构

```
final-exam-closure/
├── electron/                # 主进程
│   ├── main.ts             # 入口文件
│   ├── preload.ts          # 预加载脚本
│   ├── db/                 # 数据存储 (JSON)
│   ├── ipc/                # IPC 通信
│   ├── services/           # 服务层
│   │   ├── aiClient.ts     # AI 调用
│   │   ├── documentOrchestrator.ts # 智能文档编排（6阶段状态机）
│   │   ├── searchEngine.ts # 搜索引擎核心
│   │   ├── anysearch.ts    # AnySearch API 客户端
│   │   ├── browserSearch.ts# 浏览器搜索 (Bing/Baidu)
│   │   ├── academicSearch.ts# 学术 API 搜索
│   │   ├── wikiBuilder.ts  # Wiki 构建
│   │   └── wikiReader.ts   # Wiki 读取
│   └── terminal/           # 终端功能
├── src/                    # 渲染进程
│   ├── components/         # React 组件
│   │   ├── Analysis/       # 薄弱点分析
│   │   ├── Chat/           # AI 答疑
│   │   ├── Common/         # 通用组件 (Header, Sidebar, FileViewer, ErrorBoundary...)
│   │   ├── Content/        # 智能文档生成 (ContentGenerator, Checkpoint*, OrchestrationProgress...)
│   │   ├── KnowledgeGraph/ # 知识图谱
│   │   ├── Materials/      # 资料管理
│   │   ├── Overview/       # 学科总览
│   │   ├── Quiz/           # AI 出题与答题
│   │   ├── Review/         # 错题本
│   │   ├── Search/         # AI 搜集（含内容预览）
│   │   ├── Skills/         # 视频制作/漂亮文章
│   │   └── Wiki/           # Wiki 浏览器 + AI 对话
│   ├── contexts/           # React Context (主题)
│   ├── lib/                # 工具库
│   │   └── classifier.ts   # 本地分类引擎
│   ├── stores/             # 状态管理 (orchestrationStore...)
│   └── styles/             # 样式
├── config/                 # 配置文件
└── package.json
```

## 本地分类引擎

分类系统完全本地运行，无需网络：

1. **内置词典** - 60+ 大学学科关键词（历史/思政/数学/物理/化学/计算机/英语/经管/法学/文学/教育/医学）
2. **别名匹配** - 自动识别学科缩写（"习概"、"马原"、"史纲"等）
3. **共享词降权** - 多学科共有的关键词自动降低权重，避免误分类
4. **模糊匹配** - 容忍 OCR 文本中的空格和字符缺失（70% 阈值）
5. **AI 兜底** - 置信度不足时可选调用 AI 辅助决策

### 关键词管理

- 新建/编辑学科时可自定义关键词
- 不填写关键词时自动使用内置词典
- AI 可为新学科自动生成关键词列表

## 使用说明

### 上传资料
1. 选择或创建一个学科
2. 点击「我的资料」标签
3. 拖拽或点击上传 PDF、DOCX、Markdown、图片文件
4. 图片会自动 OCR 识别文字

### 一键分类
1. 点击侧边栏「未分类」
2. 上传待分类的文件
3. 点击「一键分类到学科」，瞬间完成

### AI 出题
1. 选择学科，点击「AI 出题」标签
2. 选择参考资料（可选）
3. 设置题型、难度、数量
4. 点击「开始 AI 出题」

### 知识图谱
1. 选择学科，点击「知识图谱」标签
2. 选择资料来源
3. 点击「生成知识图谱」

## 作者

**矢泽冷冷** - [GitHub](https://github.com/shizelengleng)

## 许可证

MIT License
