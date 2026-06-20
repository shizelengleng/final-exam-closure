import fs from 'fs'
import path from 'path'
import { callAI } from './aiClient'
import type { AIConfig } from './aiClient'
import { readCollection } from '../db/store'

// Wiki 构建专用系统指令 —— 覆盖默认的出题 AI 指令
const WIKI_SYSTEM_INSTRUCTION = `你是一个 Wiki 知识库构建助手。你的任务是根据学习资料生成结构化的 Wiki 页面。
你必须严格按照用户请求中要求的格式输出。不要闲聊，不要返回无关内容，不要尝试读取文件或访问目录。
根据任务要求，直接输出指定的内容格式（Markdown 或 JSON）。`

interface SubjectRecord {
  id: string
  name: string
  wikiDir?: string
}

async function getSubjectName(subjectId: string): Promise<string> {
  const subjects = await readCollection<SubjectRecord>('subjects')
  const subject = subjects.find(s => s.id === subjectId)
  return subject?.name || subjectId
}

async function ensureDirs(wikiDir: string, subjectName: string): Promise<string> {
  const subjectDir = path.join(wikiDir, subjectName)
  const dirs = [
    path.join(subjectDir, 'concepts'),
    path.join(subjectDir, 'sources'),
    path.join(subjectDir, 'synthesis'),
  ]
  for (const dir of dirs) {
    await fs.promises.mkdir(dir, { recursive: true })
  }
  return subjectDir
}

async function writeMdFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(filePath, content, 'utf-8')
}

async function readMdFile(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

async function appendLog(wikiDir: string, entry: string): Promise<void> {
  const logPath = path.join(wikiDir, 'log.md')
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const time = now.toTimeString().split(' ')[0]
  const line = `## [${date} ${time}] ${entry}\n\n`
  try {
    const existing = await fs.promises.readFile(logPath, 'utf-8')
    await fs.promises.writeFile(logPath, existing + line, 'utf-8')
  } catch {
    await fs.promises.writeFile(logPath, `# Wiki Log\n\n${line}`, 'utf-8')
  }
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.promises.readdir(dir)
    return files.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

async function buildIndex(wikiDir: string, subjectName: string): Promise<void> {
  const indexPath = path.join(wikiDir, 'index.md')
  const subjectDir = path.join(wikiDir, subjectName)
  const conceptsDir = path.join(subjectDir, 'concepts')
  const sourcesDir = path.join(subjectDir, 'sources')
  const synthesisDir = path.join(subjectDir, 'synthesis')

  const concepts = await listMdFiles(conceptsDir)
  const sources = await listMdFiles(sourcesDir)
  const synthesis = await listMdFiles(synthesisDir)

  let content = `---\ntype: index\nupdated: ${new Date().toISOString().split('T')[0]}\n---\n\n# Wiki 索引\n\n`

  if (synthesis.length > 0) {
    content += `## 综合页\n\n`
    for (const name of synthesis) {
      content += `- [[${subjectName}/synthesis/${name}|${name}]]\n`
    }
    content += '\n'
  }

  if (concepts.length > 0) {
    content += `## 知识点\n\n`
    for (const name of concepts) {
      content += `- [[${subjectName}/concepts/${name}|${name}]]\n`
    }
    content += '\n'
  }

  if (sources.length > 0) {
    content += `## 来源\n\n`
    for (const name of sources) {
      content += `- [[${subjectName}/sources/${name}|${name}]]\n`
    }
    content += '\n'
  }

  await writeMdFile(indexPath, content)
}

// ============================================================
// Schema 文件
// ============================================================

const SCHEMA_CONTENT = `---
type: schema
updated: ${new Date().toISOString().split('T')[0]}
---

# Wiki Schema

本文件定义了 Wiki 的结构规范和维护工作流。LLM 在操作 Wiki 时必须遵循此文件。

## 目录结构

\`\`\`
{subjectName}/
├── concepts/      # 知识点页面，每个概念一个 .md
├── sources/       # 来源摘要，每份资料一个 .md
└── synthesis/     # 综合页（总览、对比、复习提纲等）
\`\`\`

## 页面格式

### Frontmatter（必须）

每个页面必须包含 YAML frontmatter：

\`\`\`yaml
---
type: concept | source | synthesis
tags: [学科名]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: ["[[sources/资料名]]"]  # concept/synthesis 页面需要
---
\`\`\`

### Concept 页面格式

\`\`\`markdown
# 概念名称

## 核心定义
（1-2句话精确定义）

## 关键要点
- 要点1
- 要点2

## 关联知识点
- [[concepts/相关概念]]
\`\`\`

### Source 页面格式

\`\`\`markdown
# 资料名 — 来源摘要

## 文档概述
## 核心知识点
## 重要概念
## 提取的概念列表
\`\`\`

### Synthesis 页面格式

\`\`\`markdown
# 学科名期末复习总览

## 知识框架
## 核心考点
## 重要对比
## 考试重点
\`\`\`

## 维护工作流

### Ingest（新资料入库）

1. 读取原始资料内容
2. 生成 source 页面
3. 读取所有已有 concept 页面
4. 增量更新 concept 页面：合并新信息、补充交叉引用
5. 更新 synthesis 页面
6. 更新 index.md
7. 追加 log.md 记录

### Query（查询）

1. 读取 index.md 找到相关页面
2. 读取具体页面内容
3. 综合回答
4. 有价值的回答应存回 wiki 作为新页面

### Lint（健康检查）

定期检查：
- 孤立页面（无入站链接）
- 缺失交叉引用
- 过时内容
- 重要概念缺少独立页面

## 交叉引用规范

- 使用 \`[[concepts/概念名]]\` 格式引用知识点
- 使用 \`[[sources/资料名]]\` 格式引用来源
- concept 页面的「关联知识点」部分必须链接到相关概念
- synthesis 页面必须链接到所有相关的 concepts 和 sources
`

// ============================================================
// 构建 Source 页面
// ============================================================

export async function buildSourcePage(
  config: AIConfig,
  subjectId: string,
  materialName: string,
  materialContent: string,
  wikiDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subjectName = await getSubjectName(subjectId)
    const subjectDir = await ensureDirs(wikiDir, subjectName)
    const sourcesDir = path.join(subjectDir, 'sources')

    const cleanName = materialName.replace(/\.(pdf|docx?|txt|md)$/i, '')

    const prompt = `你是一个学习资料分析专家。请根据以下学习资料，生成一个结构化的来源摘要页面。

## 资料名称
${cleanName}

## 资料内容
${materialContent.substring(0, 10000)}

## 输出要求
请返回一个纯 Markdown 页面（不要包含 YAML frontmatter），格式如下：

# ${cleanName} — 来源摘要

## 文档概述
2-3句话概括这份资料的核心内容和用途。

## 核心知识点
列出资料中提到的关键知识点，每个一行，用 - 开头。

## 重要概念
列出资料中定义或解释的重要概念，简要说明每个概念。

## 关键公式/定理
列出资料中出现的重要公式或定理（如适用）。

## 提取的概念列表
列出可以独立成为 Wiki 知识点的概念名称，每行一个。

请直接返回 Markdown 内容，不要包含其他文字说明。`

    const messages = [{ role: 'user' as const, content: prompt }]
    const content = await callAI(config, messages, { temperature: 0.3, maxTokens: 2000, systemInstruction: WIKI_SYSTEM_INSTRUCTION })

    const sourceWithFrontmatter = `---
type: source
tags: [${subjectName}]
created: ${new Date().toISOString().split('T')[0]}
source_file: ${materialName}
---

${content}`

    const filePath = path.join(sourcesDir, `${cleanName}.md`)
    await writeMdFile(filePath, sourceWithFrontmatter)
    await appendLog(wikiDir, `ingest | ${subjectName}/sources/${cleanName}`)

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ============================================================
// 增量构建 Concepts 和 Synthesis
// ============================================================

export async function buildConceptsAndSynthesis(
  config: AIConfig,
  subjectId: string,
  wikiDir: string,
  onProgress?: (phase: string, progress: number, message: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const subjectName = await getSubjectName(subjectId)
    const subjectDir = await ensureDirs(wikiDir, subjectName)
    const sourcesDir = path.join(subjectDir, 'sources')
    const conceptsDir = path.join(subjectDir, 'concepts')
    const synthesisDir = path.join(subjectDir, 'synthesis')

    const sourceFiles = await listMdFiles(sourcesDir)
    if (sourceFiles.length === 0) {
      return { success: false, error: '没有 source 页面，请先上传资料' }
    }

    // 读取所有 source 内容
    const sourceContents = await Promise.all(
      sourceFiles.map(async name => {
        const content = await fs.promises.readFile(path.join(sourcesDir, `${name}.md`), 'utf-8')
        return `【${name}】\n${content}`
      })
    )
    const allSourceContent = sourceContents.join('\n\n---\n\n')

    // 读取已有 concept 页面
    const existingConceptFiles = await listMdFiles(conceptsDir)
    const existingConcepts: Array<{ name: string; content: string }> = []
    for (const name of existingConceptFiles) {
      const content = await readMdFile(path.join(conceptsDir, `${name}.md`))
      if (content) existingConcepts.push({ name, content })
    }

    const hasExisting = existingConcepts.length > 0

    // Phase 1: 提取/更新知识点
    onProgress?.('concepts', 20, hasExisting ? '正在增量更新知识点...' : '正在提取知识点...')

    const conceptsPrompt = hasExisting
      ? `你是一个学科知识提取专家。以下已有知识点页面，请根据新增资料进行增量更新。

## 学科：${subjectName}

## 已有知识点
${existingConcepts.map(c => `### ${c.name}\n${c.content.substring(0, 500)}`).join('\n\n')}

## 新增资料内容
${allSourceContent.substring(0, 15000)}

## 输出要求
请返回一个 JSON 数组。对于已有知识点，如果新资料提供了补充信息，返回更新后的版本；对于新概念，创建新条目。

[
  {
    "name": "知识点名称",
    "definition": "核心定义（1-2句话）",
    "keyPoints": ["要点1", "要点2", "要点3"],
    "relatedConcepts": ["相关概念1", "相关概念2"],
    "isNew": false
  }
]

要求：
- 保留已有知识点的核心内容，补充新资料中的信息
- 新资料中有而旧页面没有的要点要补充进去
- 新增知识点标记 "isNew": true
- 更新知识点标记 "isNew": false
- 交叉引用要完整
- 只返回 JSON，不要其他文字`
      : `你是一个学科知识提取专家。请根据以下学科资料，提取核心知识点。

## 学科：${subjectName}

## 资料内容
${allSourceContent.substring(0, 15000)}

## 输出要求
请返回一个 JSON 数组，每个元素代表一个知识点：
[
  {
    "name": "知识点名称",
    "definition": "核心定义（1-2句话）",
    "keyPoints": ["要点1", "要点2", "要点3"],
    "relatedConcepts": ["相关概念1", "相关概念2"],
    "isNew": true
  }
]

要求：
- 提取 8-15 个核心知识点
- 每个知识点要有清晰的定义和关键要点
- 标注知识点之间的关联
- 只返回 JSON，不要其他文字`

    const conceptsMessages = [{ role: 'user' as const, content: conceptsPrompt }]
    const conceptsJson = await callAI(config, conceptsMessages, { temperature: 0.3, maxTokens: 4096, systemInstruction: WIKI_SYSTEM_INSTRUCTION })

    let concepts: Array<{ name: string; definition: string; keyPoints: string[]; relatedConcepts: string[]; isNew?: boolean }>
    try {
      const cleaned = conceptsJson.replace(/```json\s*/g, '').replace(/```\s*/g, '')
      const firstBracket = cleaned.indexOf('[')
      const lastBracket = cleaned.lastIndexOf(']')
      concepts = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1))
    } catch {
      concepts = []
    }

    onProgress?.('concepts', 50, `正在生成 ${concepts.length} 个知识点页面...`)

    let newCount = 0
    let updatedCount = 0

    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i]
      const relatedLinks = c.relatedConcepts?.map(r => `- [[${r}]]`).join('\n') || ''
      const today = new Date().toISOString().split('T')[0]

      // 读取已有页面的 created 时间
      let created = today
      if (!c.isNew) {
        const existing = existingConcepts.find(ec => ec.name === c.name)
        if (existing) {
          const createdMatch = existing.content.match(/created:\s*(\d{4}-\d{2}-\d{2})/)
          if (createdMatch) created = createdMatch[1]
        }
      }

      const page = `---
type: concept
tags: [${subjectName}]
created: ${created}
updated: ${today}
---

# ${c.name}

## 核心定义
${c.definition}

## 关键要点
${c.keyPoints?.map(p => `- ${p}`).join('\n') || ''}

## 关联知识点
${relatedLinks}
`
      await writeMdFile(path.join(conceptsDir, `${c.name}.md`), page)
      if (c.isNew) newCount++
      else updatedCount++
      onProgress?.('concepts', 50 + Math.floor((i / concepts.length) * 30), `生成知识点：${c.name}`)
    }

    // Phase 2: 更新综合页
    onProgress?.('synthesis', 85, hasExisting ? '正在更新综合页...' : '正在生成综合页...')

    const today = new Date().toISOString().split('T')[0]

    // 判断学科类型：偏文 or 偏理
    const SCIENCE_KEYWORDS = ['数学', '物理', '化学', '计算机', '编程', '算法', '数据结构', '线性代数', '微积分', '概率', '统计', '力学', '电磁', '热学', '光学', '量子', '程序', '软件', '工程', '生物']
    const isScience = SCIENCE_KEYWORDS.some(kw => subjectName.includes(kw))

    const FORMAT_RULES = `通用格式规则：
1. **表格优先**：概念对比、分类、步骤等用 Markdown 表格呈现
2. **箭头链**：流程、因果关系用 → 连接
3. **优先级标记**：🔥 高频考点 ⭐ 必背考点 📌 重点理解
4. **加粗关键词**：核心术语用 **加粗**
5. **清晰层级**：# ## ### 标题层级，每个 ## 下不超过 5 个 ###
6. **末尾自检**：最后加一个「考前自检清单」，用 checkbox 格式列出所有关键点`

    const SYNTHESIS_HUMANITIES = `${FORMAT_RULES}

## 知识框架
用时间线表格或理论脉络图梳理学科体系。展示各章节/流派/理论之间的逻辑关系和发展脉络。

## 核心考点
列出 10-15 个最高频的考试知识点，每个考点包含：
- 考点名称（**加粗**，标注 🔥 或 ⭐）
- 核心定义（1-2 句话）
- 常见考法（选择/填空/简答/论述/材料分析）
- 典型材料分析示例（给出一段材料，展示如何运用该知识点分析）

## 重要对比
用表格对比容易混淆的概念，至少 5 组，每组包含：
- 对比维度（定义/代表人物/核心观点/适用范围/优缺点）
- 对比结论

## 材料分析题解题模板
提供论述题/材料题的通用答题框架：
1. 审题技巧（如何从材料中提取关键信息）
2. 答题结构（总-分-总 / 观点-论据-总结）
3. 得分要点（哪些是必答点，哪些是加分项）
4. 常见失分原因

## 易混淆概念辨析
列出学生最容易混淆的概念对，逐一辨析异同。

## 模拟练习题
提供 3-5 道综合练习题，包含：
- 材料分析题（附材料原文）
- 论述题
- 每道题附详细答案解析和评分标准

## 考前自检清单
用 checkbox 列出所有关键复习点，方便学生逐项核对。`

    const SYNTHESIS_SCIENCE = `${FORMAT_RULES}

## 知识框架
用表格梳理概念依赖关系。展示各章节/模块之间的前置知识关系和逻辑递进。

## 核心考点
列出 10-15 个最高频的考试知识点，每个考点包含：
- 考点名称（**加粗**，标注 🔥 或 ⭐）
- 核心定义（1-2 句话）
- 关键公式（用 LaTeX 或代码块格式）
- 适用条件和限制

## 公式定理速查表
用表格整理所有重要公式：
| 公式名称 | 表达式 | 适用条件 | 易错点 |
每个公式附简要说明和典型应用场景。

## 题型归纳与解法
按题型分类，每种题型包含：
- 识别特征（如何判断是这种题型）
- 解题步骤（分步骤详细说明）
- 注意事项（常见陷阱）
- 典型例题 + 完整解题过程

## 多种解题技巧
对同一类问题展示不同解法，对比各方法的优劣和适用场景。

## 常见计算错误与陷阱
列出高频计算错误、概念陷阱和典型错例，给出防范方法。

## 模拟练习题
提供 3-5 道综合练习题，包含：
- 计算题（附完整解题步骤）
- 证明题
- 综合应用题
- 每道题附多种解法和详细步骤解析

## 考前自检清单
用 checkbox 列出所有关键公式、定理和解题方法，方便学生逐项核对。`

    const synthesisBody = isScience ? SYNTHESIS_SCIENCE : SYNTHESIS_HUMANITIES

    const synthesisPrompt = hasExisting
      ? `你是一个资深的${isScience ? '理工科' : '文科'}期末考试辅导专家。你正在为学生生成一份高质量的复习提纲。

## 学科：${subjectName}
## 类型：${isScience ? '偏理类（注重公式定理、解题技巧、题型归纳）' : '偏文类（注重资料整合对比、材料分析、观点论述）'}

## 已有复习总览
（以下为上次生成的内容，请在此基础上增量更新，保留好的部分，补充新内容）

## 更新后的知识点
${concepts.map(c => `- **${c.name}**：${c.definition}`).join('\n')}

## 新增资料内容
${allSourceContent.substring(0, 15000)}

## 输出要求
请生成一份结构优良、复习到位的期末复习提纲。要求：
1. 内容全面覆盖所有知识点，不遗漏
2. 重点突出，用 🔥⭐📌 标记优先级
3. 实用性强，学生拿到就能直接用于复习
4. ${isScience ? '公式完整准确，解题步骤详细清晰，包含多种解法对比' : '材料分析有模板有示例，对比分析深入到位，论述题有答题框架'}

请直接返回以下结构的 Markdown 内容，不要包含 frontmatter：

${synthesisBody}`
      : `你是一个资深的${isScience ? '理工科' : '文科'}期末考试辅导专家。你正在为学生生成一份高质量的复习提纲。

## 学科：${subjectName}
## 类型：${isScience ? '偏理类（注重公式定理、解题技巧、题型归纳）' : '偏文类（注重资料整合对比、材料分析、观点论述）'}

## 知识点
${concepts.map(c => `- **${c.name}**：${c.definition}`).join('\n')}

## 资料内容
${allSourceContent.substring(0, 15000)}

## 输出要求
请生成一份结构优良、复习到位的期末复习提纲。要求：
1. 内容全面覆盖所有知识点，不遗漏
2. 重点突出，用 🔥⭐📌 标记优先级
3. 实用性强，学生拿到就能直接用于复习
4. ${isScience ? '公式完整准确，解题步骤详细清晰，包含多种解法对比' : '材料分析有模板有示例，对比分析深入到位，论述题有答题框架'}

请直接返回以下结构的 Markdown 内容，不要包含 frontmatter：

${synthesisBody}`

    const synthesisMessages = [{ role: 'user' as const, content: synthesisPrompt }]
    const synthesisContent = await callAI(config, synthesisMessages, { temperature: 0.5, maxTokens: 4096, systemInstruction: WIKI_SYSTEM_INSTRUCTION })

    const sourceLinks = sourceFiles.map(s => `"[[sources/${s}]]"`).join(', ')
    const synthesisWithFrontmatter = `---
type: synthesis
tags: [${subjectName}]
created: ${today}
updated: ${today}
sources: [${sourceLinks}]
---

${synthesisContent}`

    await writeMdFile(path.join(synthesisDir, `${subjectName}期末复习总览.md`), synthesisWithFrontmatter)

    // 更新 index
    await buildIndex(wikiDir, subjectName)
    const action = hasExisting ? 'update' : 'build'
    await appendLog(wikiDir, `${action} | ${subjectName} — ${newCount} new concepts, ${updatedCount} updated concepts, 1 synthesis`)

    onProgress?.('done', 100, 'Wiki 构建完成')

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ============================================================
// 初始化 Wiki 目录 + Schema
// ============================================================

export async function initWikiDir(wikiDir: string, subjectName: string): Promise<void> {
  await ensureDirs(wikiDir, subjectName)

  // Schema 文件
  const schemaPath = path.join(wikiDir, 'schema.md')
  try {
    await fs.promises.access(schemaPath)
  } catch {
    await writeMdFile(schemaPath, SCHEMA_CONTENT)
  }

  // Index 文件
  const indexPath = path.join(wikiDir, 'index.md')
  try {
    await fs.promises.access(indexPath)
  } catch {
    await writeMdFile(indexPath, `---\ntype: index\nupdated: ${new Date().toISOString().split('T')[0]}\n---\n\n# Wiki 索引\n\n`)
  }

  // Log 文件
  const logPath = path.join(wikiDir, 'log.md')
  try {
    await fs.promises.access(logPath)
  } catch {
    await writeMdFile(logPath, `# Wiki Log\n\n`)
  }
}

// ============================================================
// Lint — Wiki 健康检查
// ============================================================

interface LintIssue {
  type: 'orphan' | 'missing_ref' | 'stale' | 'missing_page'
  page: string
  message: string
}

export async function lintWiki(
  subjectId: string,
  wikiDir: string
): Promise<{ issues: LintIssue[]; summary: string }> {
  const subjectName = await getSubjectName(subjectId)
  const { conceptsDir, sourcesDir, synthesisDir } = {
    conceptsDir: path.join(wikiDir, subjectName, 'concepts'),
    sourcesDir: path.join(wikiDir, subjectName, 'sources'),
    synthesisDir: path.join(wikiDir, subjectName, 'synthesis'),
  }

  const issues: LintIssue[] = []

  // 收集所有页面
  const allPages: Array<{ name: string; type: string; content: string; path: string }> = []

  for (const { dir, type } of [
    { dir: conceptsDir, type: 'concept' },
    { dir: sourcesDir, type: 'source' },
    { dir: synthesisDir, type: 'synthesis' },
  ]) {
    const files = await listMdFiles(dir)
    for (const name of files) {
      const filePath = path.join(dir, `${name}.md`)
      const content = await readMdFile(filePath)
      allPages.push({ name, type, content, path: filePath })
    }
  }

  // 收集所有 wiki link 目标
  const allLinkTargets = new Set<string>()
  const pageNames = new Set(allPages.map(p => p.name))

  for (const page of allPages) {
    // 提取 [[...]] 链接
    const linkRegex = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = linkRegex.exec(page.content)) !== null) {
      const link = match[1].split('|')[0] // 去掉显示文本
      const targetName = link.split('/').pop() || link
      allLinkTargets.add(targetName)
    }
  }

  // 检查 1: 孤立页面（没有其他页面链接到它）
  for (const page of allPages) {
    if (page.type === 'source') continue // source 页面被 synthesis 引用是正常的
    if (!allLinkTargets.has(page.name)) {
      issues.push({
        type: 'orphan',
        page: page.name,
        message: `页面「${page.name}」没有被其他页面链接（孤立页面）`,
      })
    }
  }

  // 检查 2: 链接指向不存在的页面
  for (const page of allPages) {
    const linkRegex = /\[\[([^\]]+)\]\]/g
    let match
    while ((match = linkRegex.exec(page.content)) !== null) {
      const link = match[1].split('|')[0]
      const targetName = link.split('/').pop() || link
      if (!pageNames.has(targetName) && !link.includes('/')) {
        issues.push({
          type: 'missing_page',
          page: page.name,
          message: `页面「${page.name}」链接到不存在的页面「${targetName}」`,
        })
      }
    }
  }

  // 检查 3: concept 页面缺少交叉引用
  for (const page of allPages) {
    if (page.type !== 'concept') continue
    const linkCount = (page.content.match(/\[\[/g) || []).length
    if (linkCount === 0) {
      issues.push({
        type: 'missing_ref',
        page: page.name,
        message: `知识点「${page.name}」没有交叉引用其他页面`,
      })
    }
  }

  // 检查 4: 过时内容（超过30天未更新）
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  for (const page of allPages) {
    const updatedMatch = page.content.match(/updated:\s*(\d{4}-\d{2}-\d{2})/)
    if (updatedMatch) {
      const updated = new Date(updatedMatch[1])
      if (updated < thirtyDaysAgo) {
        issues.push({
          type: 'stale',
          page: page.name,
          message: `页面「${page.name}」超过30天未更新（${updatedMatch[1]}）`,
        })
      }
    }
  }

  // 检查 5: 重要概念被提到但没有独立页面
  const conceptMentions = new Map<string, number>()
  for (const page of allPages) {
    if (page.type !== 'concept') continue
    const otherPages = allPages.filter(p => p.name !== page.name)
    for (const other of otherPages) {
      if (other.content.includes(page.name) && !other.content.includes(`[[${page.name}]]`)) {
        conceptMentions.set(page.name, (conceptMentions.get(page.name) || 0) + 1)
      }
    }
  }
  for (const [name, count] of conceptMentions) {
    if (count >= 3) {
      issues.push({
        type: 'missing_ref',
        page: name,
        message: `概念「${name}」被提及 ${count} 次但缺少反向链接`,
      })
    }
  }

  const summary = `检查完成：${allPages.length} 个页面，发现 ${issues.length} 个问题`
  return { issues, summary }
}

// ============================================================
// 保存查询结果到 Wiki
// ============================================================

export async function saveQueryResult(
  subjectId: string,
  wikiDir: string,
  title: string,
  content: string,
  sources: string[] = []
): Promise<{ success: boolean; error?: string; path?: string }> {
  try {
    const subjectName = await getSubjectName(subjectId)
    const subjectDir = await ensureDirs(wikiDir, subjectName)
    const synthesisDir = path.join(subjectDir, 'synthesis')

    const today = new Date().toISOString().split('T')[0]
    const sourceLinks = sources.map(s => `"[[sources/${s}]]"`).join(', ')

    const page = `---
type: synthesis
tags: [${subjectName}]
created: ${today}
updated: ${today}
sources: [${sourceLinks}]
---

${content}
`

    const filePath = path.join(synthesisDir, `${title}.md`)
    await writeMdFile(filePath, page)

    await buildIndex(wikiDir, subjectName)
    await appendLog(wikiDir, `query-save | ${subjectName}/synthesis/${title}`)

    return { success: true, path: filePath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function deleteWikiPage(
  subjectId: string,
  wikiDir: string,
  pageName: string,
  pageType: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subjectName = await getSubjectName(subjectId)
    const typeDir = pageType === 'synthesis' ? 'synthesis' : pageType === 'concept' ? 'concepts' : 'sources'
    const dirPath = path.join(wikiDir, subjectName, typeDir)
    const filePath = path.join(dirPath, `${pageName}.md`)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    await buildIndex(wikiDir, subjectName)
    await appendLog(wikiDir, `delete-page | ${subjectName}/${typeDir}/${pageName}`)

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}
