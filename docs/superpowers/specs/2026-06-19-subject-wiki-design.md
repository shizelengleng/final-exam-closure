# 学科 Wiki 知识库系统 — 设计文档

> 日期：2026-06-19
> 状态：设计中

## 1. 背景与目标

当前所有 AI 工具（出题、答疑、知识图谱、文档生成等）直接读取原始 PDF 文本，存在以下问题：
- PDF 文本质量参差不齐，含大量噪声
- 每次 AI 调用都要重新理解原始文本，无知识积累
- Claude Code CLI 无法正确处理原始文本（误解为文件路径）

**目标**：引入 Wiki 层，上传 PDF 后 AI 自动提取关键信息生成结构化 Markdown 页面，所有 AI 工具基于 Wiki 内容工作。

## 2. 架构

```
Materials（原始 PDF 文本，不变）
    │ 上传后触发
    ▼
WikiBuilder（AI 提取引擎）
    │ 生成 Markdown 文件
    ▼
Wiki 目录（磁盘 .md 文件）
    │ AI 工具读取
    ▼
AI 工具（出题、答疑、知识图谱等）
```

### 三层结构

| 层 | 存储 | 内容 |
|----|------|------|
| 原始层 | JSON 数据库 `materials` | PDF 提取的原始文本（不变） |
| Wiki 层 | 磁盘 .md 文件 | AI 生成的结构化知识页面 |
| 应用层 | 内存 | AI 工具消费 Wiki 内容 |

## 3. Wiki 目录结构

用户在设置中选择 Wiki 存储目录，初始化后结构如下：

```
{wikiDir}/
├── index.md                    # 全局索引（按学科组织）
├── log.md                      # 操作日志（时间线）
├── 习概/
│   ├── concepts/               # 知识点页面（每个概念一个 .md）
│   │   ├── 习近平新时代中国特色社会主义思想.md
│   │   ├── 五位一体.md
│   │   └── ...
│   ├── sources/                # 来源摘要（每份资料一个 .md）
│   │   ├── 习概选择题打印.md
│   │   ├── 习概-2023-2024-A.md
│   │   └── ...
│   └── synthesis/              # 综合页（总览、速查手册等）
│       ├── 习概期末复习总览.md
│       └── ...
├── 高等数学/
│   ├── concepts/
│   ├── sources/
│   └── synthesis/
└── ...
```

## 4. Wiki 页面格式

### Frontmatter

```yaml
---
type: concept | source | synthesis
tags: [学科名]
created: 2026-06-19
updated: 2026-06-19
sources: ["[[sources/资料名]]"]    # 仅 concept/synthesis 页面需要
---
```

### 页面模板

**concept 页面**：
```markdown
---
type: concept
tags: [习概]
created: 2026-06-19
sources: ["[[sources/习概选择题打印]]"]
---

# 五位一体

## 核心定义
...

## 关键要点
- 要点1
- 要点2

## 关联知识点
- [[concepts/习近平新时代中国特色社会主义思想]]
```

**source 页面**：
```markdown
---
type: source
tags: [习概]
created: 2026-06-19
source_file: 习概选择题打印.pdf
---

# 习概选择题打印 — 来源摘要

## 文档概述
...

## 核心知识点
- 知识点1
- 知识点2

## 提取的概念
- [[concepts/五位一体]]
```

**synthesis 页面**：
```markdown
---
type: synthesis
tags: [习概]
created: 2026-06-19
sources: ["[[sources/习概选择题打印]]", "[[sources/习概-2023-2024-A]]"]
---

# 习概期末复习总览

## 知识框架
...

## 10大核心考点
...

## 重要对比
...
```

## 5. Wiki 构建流程

### 阶段 1 — 即时生成（<5s）

上传 PDF 后立即触发：
1. 读取材料的 `content` 文本
2. 调 AI 生成 `sources/{资料名}.md` 摘要页
3. 写入磁盘
4. 更新 `index.md` 中该学科的 sources 列表
5. 追加 `log.md` 记录

### 阶段 2 — 异步后台

后台调 AI（不阻塞 UI）：
1. 读取该学科所有 sources 页面
2. 调 AI 生成 `concepts/` 知识点页面（每个知识点一个文件）
3. 调 AI 生成 `synthesis/` 综合页（总览、复习提纲等）
4. 更新 `index.md` 中的 concepts 和 synthesis 列表
5. 追加 `log.md` 记录

### 增量更新

当新资料上传时：
- 阶段 1：新增 source 页面
- 阶段 2：重新生成该学科所有 concepts 和 synthesis 页面（基于所有 sources 的完整内容）
- 不做部分更新，因为概念间的交叉引用需要全局一致性

## 6. AI 工具消费 Wiki

### 改造方案

| AI 工具 | 当前方式 | 改造后 |
|---------|---------|--------|
| 出题 (QuizSession) | 拼接 material.content 到 prompt | 读取该学科的 synthesis + concepts 页面内容 |
| 答疑 (ChatPanel) | 拼接 material.content | 读取相关 concepts 页面 |
| 知识图谱 (KnowledgeGraph) | 读 material.content | 读取 concepts 页面（已有结构化数据） |
| 文档生成 (DocumentGenerator) | 拼接 material.content | 读取 synthesis 页面 |
| 薄弱点分析 (WeakAnalysis) | 读错题 + material.content | 读取 concepts 页面 |

### Wiki 读取 API

```typescript
// 新增 IPC 接口
window.electron.wiki.listPages(subjectId: string, type?: 'concept'|'source'|'synthesis'): WikiPage[]
window.electron.wiki.readPage(subjectId: string, pageName: string): string
window.electron.wiki.readAllPages(subjectId: string, type?: string): string  // 拼接多个页面
window.electron.wiki.getSynthesis(subjectId: string): string  // 获取综合页内容
```

## 7. 数据模型扩展

### Subject 接口

```typescript
interface Subject {
  id: string
  name: string
  color: string
  year?: string
  keywords?: string[]
  wikiDir?: string  // 新增：Wiki 目录路径
}
```

### WikiPage 接口

```typescript
interface WikiPage {
  name: string           // 页面文件名（不含 .md）
  type: 'concept' | 'source' | 'synthesis'
  path: string           // 完整文件路径
  subjectId: string
  created: string
  updated: string
}
```

### WikiBuildStatus 接口

```typescript
interface WikiBuildStatus {
  subjectId: string
  phase: 'idle' | 'sources' | 'concepts' | 'synthesis' | 'done'
  progress: number       // 0-100
  message: string
}
```

## 8. 设置页改动

在设置页新增「Wiki 配置」区域：
- Wiki 存储目录选择器（点击选择文件夹）
- 当前 Wiki 状态（已初始化 / 未初始化）
- 「重新构建 Wiki」按钮

## 9. UI 改动

### 新增 Wiki 状态指示器

在学科 Tab 栏旁显示 Wiki 构建状态：
- 空闲：不显示
- 构建中：显示进度条 + 当前阶段文字
- 完成：短暂显示对勾后消失

### Wiki 浏览（可选，后续实现）

在 Tab 栏新增「Wiki」tab，可浏览该学科的 Wiki 页面。

## 10. 文件清单

| 文件 | 操作 |
|------|------|
| `src/vite-env.d.ts` | 新增 WikiPage, WikiBuildStatus 接口；Subject 加 wikiDir |
| `electron/services/wikiBuilder.ts` | **新建** — Wiki 构建引擎 |
| `electron/services/wikiReader.ts` | **新建** — Wiki 读取 API |
| `electron/ipc/wikiHandlers.ts` | **新建** — Wiki IPC 接口 |
| `electron/main.ts` | 注册 wikiHandlers；导出 wikiDir 配置 |
| `src/components/Settings/SettingsPanel.tsx` | 新增 Wiki 目录配置 |
| `src/components/Materials/MaterialList.tsx` | 上传后触发 Wiki 构建 |
| `src/components/Quiz/QuizSession.tsx` | 改为读 Wiki 内容 |
| `src/components/Chat/ChatPanel.tsx` | 改为读 Wiki 内容 |
| `src/components/KnowledgeGraph/KnowledgeGraph.tsx` | 改为读 Wiki 内容 |
| `src/components/Document/DocumentGenerator.tsx` | 改为读 Wiki 内容 |
| `src/components/Analysis/WeakAnalysis.tsx` | 改为读 Wiki 内容 |
| `src/App.tsx` | Wiki 状态指示器 |
| `electron/services/aiClient.ts` | 移除 material.content 拼接逻辑 |

## 11. 错误处理

| 场景 | 处理方式 |
|------|---------|
| Wiki 目录不存在 | 提示用户重新选择目录 |
| AI 调用失败 | 重试 2 次，失败后标记该页面为 pending，不阻塞其他页面生成 |
| 磁盘写入失败 | 提示用户检查磁盘空间和目录权限 |
| Wiki 未初始化 | AI 工具降级读取原始 material.content（保持现有行为） |

## 12. 不做的事

- 不做 Wiki 页面的可视化编辑器（用户用 Obsidian 编辑）
- 不做 Wiki 的实时同步（每次重新构建全量）
- 不做版本控制（依赖用户自己用 git）
- 不做 Wiki 页面的手动创建 UI（全部 AI 自动生成）
