import fetch from 'node-fetch'

export type AIProvider = 'deepseek' | 'mimo' | 'claude-code'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  baseUrl: string
}

const PROVIDER_CONFIG: Record<Exclude<AIProvider, 'claude-code'>, { baseUrl: string; model: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  mimo: {
    baseUrl: 'https://api.xiaomimimo.com',
    model: 'mimo-v2-flash',
  },
}

const DEFAULT_CLI_SYSTEM_INSTRUCTION = `【系统指令】你是一个考试出题 AI。你正在通过 API 被调用，不要尝试访问任何文件或目录。
下面的内容是用户提供的学习资料文本（不是文件路径），请基于这些文本内容完成任务。
请直接返回 JSON，不要返回其他任何内容，不要尝试读取文件。`

async function callClaudeCLI(prompt: string, systemInstruction?: string): Promise<string> {
  const { spawn } = require('child_process')
  const instruction = systemInstruction || DEFAULT_CLI_SYSTEM_INSTRUCTION
  const wrappedPrompt = `${instruction}

【用户请求】
${prompt}`

  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '-', '--output-format', 'json', '--no-session-persistence'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    child.stdin.write(wrappedPrompt)
    child.stdin.end()

    child.on('close', (code: number | null) => {
      if (code !== 0 && code !== null) {
        const msg = stderr || ''
        if (msg.includes('command not found') || msg.includes('ENOENT')) {
          reject(new Error('未找到 claude CLI，请先安装 Claude Code: npm install -g @anthropic-ai/claude-code'))
        } else {
          reject(new Error(`Claude CLI 调用失败 (exit ${code}): ${msg.substring(0, 300)}`))
        }
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim())
        resolve(parsed.result || '')
      } catch {
        // 如果不是 JSON，直接返回原始输出（可能是 Markdown）
        const raw = stdout.trim()
        if (raw.length > 0) {
          resolve(raw)
        } else {
          reject(new Error(`Claude CLI 返回为空。stderr: ${stderr.substring(0, 200)}`))
        }
      }
    })

    child.on('error', (err: Error) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error('未找到 claude CLI，请先安装 Claude Code: npm install -g @anthropic-ai/claude-code'))
      } else {
        reject(new Error(`Claude CLI 启动失败: ${err.message}`))
      }
    })
  })
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export async function callAI(
  config: AIConfig,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; systemInstruction?: string } = {}
): Promise<string> {
  if (config.provider === 'claude-code') {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) throw new Error('No user message')
    // For CLI, extract the user text directly — no "User:" prefix
    const userText = typeof lastUserMsg.content === 'string'
      ? lastUserMsg.content
      : lastUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join('')
    return callClaudeCLI(userText, options.systemInstruction)
  }

  const providerConfig = PROVIDER_CONFIG[config.provider as Exclude<AIProvider, 'claude-code'>]
  if (!providerConfig) throw new Error(`未知的 AI 提供商: ${config.provider}`)
  const baseUrl = config.baseUrl || providerConfig.baseUrl

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI API 调用失败: ${response.status} - ${error}`)
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[]
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 返回内容为空')
  return content
}

export interface GenerateQuestionParams {
  content: string
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'analysis'
  difficulty: 'easy' | 'medium' | 'hard'
  count: number
}

export interface GeneratedQuestion {
  id: string
  content: string
  options: { value: string; label: string }[]
  answer: string
  explanation: string
  type: string
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  short_answer: '简答题',
  analysis: '资料分析题',
}

function buildPrompt(params: GenerateQuestionParams): string {
  const typeLabel = QUESTION_TYPE_LABELS[params.type]
  const difficultyLabel = { easy: '简单', medium: '中等', hard: '困难' }[params.difficulty]

  const difficultyInstructions: Record<string, string> = {
    easy: '侧重基本概念和定义的记忆性考察，选项差异明显',
    medium: '侧重理解和应用，需要结合材料分析才能作答，干扰项具有一定迷惑性',
    hard: '侧重综合分析和深度理解，需要多步推理或跨知识点关联，干扰项高度相似',
  }

  return `你是一个专业的期末考试出题专家。请根据以下学习资料，严格生成恰好 ${params.count} 道${typeLabel}。

## 质量要求
1. 每道题必须基于学习资料内容，不要凭空编造
2. 选项设计：错误选项必须具有合理迷惑性，不能出现明显不相关或荒谬的选项
3. 题目之间不能重复考察同一个知识点，要覆盖资料中的不同内容
4. 题目表述清晰准确，避免歧义
5. 解析要说明为什么选这个答案，以及为什么其他选项不对

## 难度标准
难度等级：${difficultyLabel}
${difficultyInstructions[params.difficulty] || ''}

## 学习资料
${sanitizeContentForAI(params.content.substring(0, 12000))}

## 输出格式
请严格按以下 JSON 格式返回，不要包含任何其他文字：
[
  {
    "content": "题目内容",
    "options": [
      {"value": "A", "label": "A. 选项内容"},
      {"value": "B", "label": "B. 选项内容"},
      {"value": "C", "label": "C. 选项内容"},
      {"value": "D", "label": "D. 选项内容"}
    ],
    "answer": "A",
    "explanation": "解析说明：为什么选A，以及其他选项为什么不对"
  }
]

## 格式规则
- 选择题必须有 4 个选项（A/B/C/D），多选题同理
- 判断题选项固定为：{"value": "true", "label": "A. 正确"}，{"value": "false", "label": "B. 错误"}
- 简答题和分析题的 options 设为空数组，answer 为参考答案
- 多选题的 answer 用逗号分隔，如 "A,B,C"
- 必须返回恰好 ${params.count} 道题，不要多也不要少
- 确保返回合法的 JSON 数组`
}

function cleanJsonString(raw: string): string {
  // 先尝试从 markdown code block 中提取
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  let text = codeBlockMatch ? codeBlockMatch[1].trim() : raw

  // 找到第一个 [ 到最后一个 ] 之间的内容
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket === -1 || lastBracket === -1) return text
  text = text.substring(firstBracket, lastBracket + 1)

  // 修复字符串值中的未转义控制字符
  text = text.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
  })

  return text
}

function sanitizeContentForAI(content: string): string {
  // 清理资料内容中的特殊字符，防止干扰 AI 输出 JSON
  return content
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 移除控制字符
    .replace(/\\/g, '\\\\')  // 转义反斜杠
    .replace(/"/g, "'")       // 双引号替换为单引号，避免干扰 JSON
}

function parseQuestions(raw: string, type?: string): GeneratedQuestion[] {
  console.log('[parseQuestions] raw length:', raw.length, 'preview:', raw.substring(0, 300))
  const cleaned = cleanJsonString(raw)
  console.log('[parseQuestions] cleaned length:', cleaned.length, 'preview:', cleaned.substring(0, 300))

  let parsed: Record<string, unknown>[]
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.log('[parseQuestions] JSON.parse failed:', (e as Error).message)
    console.log('[parseQuestions] cleaned content:', cleaned.substring(0, 500))
    // 尝试更宽松的提取：逐个找 {...} 对象
    const objectMatches: Record<string, unknown>[] = []
    const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    let m: RegExpExecArray | null
    while ((m = objRegex.exec(cleaned)) !== null) {
      try {
        objectMatches.push(JSON.parse(m[0]))
      } catch { /* skip invalid objects */ }
    }
    console.log('[parseQuestions] fallback found', objectMatches.length, 'objects')
    if (objectMatches.length === 0) throw new Error(`AI 返回格式错误，无法解析题目。原始内容前200字：${raw.substring(0, 200)}`)
    parsed = objectMatches
  }

  return parsed.map((q, i) => ({
    id: `ai_${Date.now()}_${i}`,
    content: q.content as string,
    options: (q.options as { value: string; label: string }[]) || [],
    answer: q.answer as string,
    explanation: q.explanation as string,
    type: type || '',
  }))
}

export async function generateQuestions(
  config: AIConfig,
  params: GenerateQuestionParams
): Promise<GeneratedQuestion[]> {
  const prompt = buildPrompt(params)
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const content = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 8192 })
    const questions = parseQuestions(content, params.type)

    if (questions.length >= params.count) {
      return questions.slice(0, params.count)
    }

    // 数量不够，最后一次尝试直接返回已有结果
    if (attempt === maxRetries) {
      if (questions.length > 0) return questions
      throw new Error('AI 返回的题目数量不足，请重试')
    }
  }

  throw new Error('生成题目失败，请重试')
}

export interface GraphConcept {
  id: string
  name: string
  description: string
  category: string
  difficulty: string
}

export interface GraphRelation {
  from: string
  to: string
  type: string
  label: string
}

export interface GraphResult {
  nodes: GraphConcept[]
  edges: GraphRelation[]
}

function buildGraphPrompt(subject: string): string {
  return `你是一个知识图谱构建专家。请根据学科主题"${subject}"，提取核心知识点和它们之间的关系。

要求：
1. 提取 10-20 个核心概念节点
2. 概念分为以下类别：definition(定义), principle(原理), example(示例), application(应用), theory(理论), process(流程)
3. 概念难度分为：basic(基础), intermediate(中级), advanced(高级)
4. 提取概念之间的关系，关系类型包括：prerequisite_of(前置知识), part_of(组成部分), influences(影响), leads_to(导致), example_of(示例), contrasts_with(对比), relates_to(关联)
5. 每个关系需要有简洁的中文标签

请严格按以下 JSON 格式返回，不要包含任何其他文字：
{
  "nodes": [
    {
      "id": "c1",
      "name": "概念名称",
      "description": "简短描述",
      "category": "definition",
      "difficulty": "basic"
    }
  ],
  "edges": [
    {
      "from": "c1",
      "to": "c2",
      "type": "prerequisite_of",
      "label": "前置"
    }
  ]
}`
}

function buildGraphFromContentPrompt(content: string): string {
  return `你是一个知识图谱构建专家。请根据以下学习资料内容，提取核心知识点和它们之间的关系。

资料内容：
${content}

要求：
1. 从资料中提取 10-20 个核心概念节点，必须基于资料实际内容
2. 概念分为以下类别：definition(定义), principle(原理), example(示例), application(应用), theory(理论), process(流程)
3. 概念难度分为：basic(基础), intermediate(中级), advanced(高级)
4. 提取概念之间的关系，关系类型包括：prerequisite_of(前置知识), part_of(组成部分), influences(影响), leads_to(导致), example_of(示例), contrasts_with(对比), relates_to(关联)
5. 每个关系需要有简洁的中文标签
6. 每个概念的 description 应从资料中提取具体说明

请严格按以下 JSON 格式返回，不要包含任何其他文字：
{
  "nodes": [
    {
      "id": "c1",
      "name": "概念名称",
      "description": "从资料中提取的简短描述",
      "category": "definition",
      "difficulty": "basic"
    }
  ],
  "edges": [
    {
      "from": "c1",
      "to": "c2",
      "type": "prerequisite_of",
      "label": "前置"
    }
  ]
}`
}

function parseGraph(raw: string): GraphResult {
  const cleaned = cleanJsonString(raw)

  // 找到最外层的 { ... }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) throw new Error('AI 返回格式错误，无法解析知识图谱')

  const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
  return {
    nodes: (parsed.nodes || []).map((n: Record<string, string>, i: number) => ({
      id: n.id || `c${i + 1}`,
      name: n.name || '',
      description: n.description || '',
      category: ['definition', 'principle', 'example', 'application', 'theory', 'process'].includes(n.category) ? n.category : 'other',
      difficulty: ['basic', 'intermediate', 'advanced'].includes(n.difficulty) ? n.difficulty : 'basic',
    })),
    edges: (parsed.edges || []).map((e: Record<string, string>) => ({
      from: e.from || '',
      to: e.to || '',
      type: ['prerequisite_of', 'part_of', 'influences', 'leads_to', 'example_of', 'contrasts_with', 'relates_to'].includes(e.type) ? e.type : 'relates_to',
      label: e.label || '',
    })),
  }
}

export async function generateGraph(
  config: AIConfig,
  subject: string
): Promise<GraphResult> {
  const prompt = buildGraphPrompt(subject)
  const result = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 4096 })
  return parseGraph(result)
}

export async function generateGraphFromContent(
  config: AIConfig,
  content: string
): Promise<GraphResult> {
  const prompt = buildGraphFromContentPrompt(content)
  const result = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 4096 })
  return parseGraph(result)
}

export async function categorizeMaterial(
  config: AIConfig,
  materialName: string,
  materialContent: string,
  existingCategories: string[],
  imageBase64?: string
): Promise<string> {
  const catList = existingCategories.join('、')
  const textPart = `你是一个资料分类助手。请根据以下资料的文件名和内容，判断它属于哪个学科分类。

已有分类：${catList}

资料文件名：${materialName}
${imageBase64 ? '这是一张图片，请根据图片内容判断分类。' : `内容摘要：${materialContent.substring(0, 500)}`}

请只返回分类名称（必须是已有分类之一），不要返回其他内容。`

  const userContent: ContentPart[] = [{ type: 'text', text: textPart }]
  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
    })
  }

  const result = await callAI(config, [{ role: 'user', content: imageBase64 ? userContent : textPart }], { temperature: 0.3, maxTokens: 50 })
  const trimmed = result.trim()
  const matched = existingCategories.find((c) => trimmed.includes(c))
  return matched || existingCategories[0] || 'default'
}

export interface GraphInstructionResult {
  materialIds: string[]
  instruction: string
}

export async function selectMaterialsForGraph(
  config: AIConfig,
  userMessage: string,
  materialList: { id: string; name: string; content: string }[]
): Promise<GraphInstructionResult> {
  const matSummary = materialList
    .map((m, i) => `${i + 1}. [id:${m.id}] ${m.name} (前200字: ${m.content.substring(0, 200)})`)
    .join('\n')

  const prompt = `你是一个学习助手。用户想要生成知识图谱，请根据用户的需求和可用资料，选择最相关的资料。

用户需求：${userMessage}

可用资料：
${matSummary}

请返回 JSON 格式：
{
  "materialIds": ["选中的资料id"],
  "instruction": "根据用户需求总结的生成指令"
}

只返回 JSON，不要其他内容。`

  const content = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 1024 })
  const cleaned = cleanJsonString(content)
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) throw new Error('AI 返回格式错误')

  const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
  return {
    materialIds: parsed.materialIds || materialList.map((m) => m.id),
    instruction: parsed.instruction || userMessage,
  }
}

export async function chat(
  config: AIConfig,
  message: string
): Promise<string> {
  return callAI(config, [{ role: 'user', content: message }], { temperature: 0.7, maxTokens: 2048 })
}

export interface SourceManageResult {
  action: string
  source?: { name: string; type: string; searchUrl: string; enabled: boolean; priority: number }
  sourceId?: string
  message: string
}

export async function manageSources(
  config: AIConfig,
  userMessage: string,
  currentSources: { id: string; name: string; type: string; searchUrl: string; enabled: boolean; priority: number }[]
): Promise<SourceManageResult> {
  const sourceList = currentSources
    .map((s) => `- ${s.id}: ${s.name} (类型:${s.type}, URL:${s.searchUrl}, ${s.enabled ? '启用' : '禁用'}, 优先级:${s.priority})`)
    .join('\n')

  const prompt = `你是一个搜索源管理助手。用户可以让你添加、修改、删除或禁用搜索源。
用户请求：${userMessage}
当前搜索源列表：
${sourceList}

可使用的类型: courseware(课件), qa(问答), video(视频), academic(学术), ebook(电子书), pan-search(网盘), code(代码), tech(技术)

请根据用户意图返回 JSON：
{
  "action": "add" | "update" | "delete" | "toggle" | "list",
  "source": { "name": "名称", "type": "类型", "searchUrl": "搜索URL", "enabled": true, "优先级": N },
  "sourceId": "用于update/delete/toggle的id",
  "message": "操作说明"
}

规则：
- add: 必须提供 source 对象，priority 默认为当前最大值+1
- update: 必须提供 sourceId 和要更新的 source 字段
- delete: 必须提供 sourceId
- toggle: 必须提供 sourceId，切换启用/禁用
- list: 仅列出当前所有源，不需要 source 和 sourceId

只返回 JSON，不要其他内容。`

  const content = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 1024 })
  const cleaned = cleanJsonString(content)
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) throw new Error('AI 返回格式错误')

  const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
  return {
    action: parsed.action || 'list',
    source: parsed.source,
    sourceId: parsed.sourceId,
    message: parsed.message || '操作完成',
  }
}

export interface DocumentResult {
  title: string
  content: string
}

function buildDocumentPrompt(
  materials: { name: string; content: string }[],
  instruction: string,
  template: string
): string {
  const matContent = materials
    .map((m) => `【${m.name}】\n${m.content.substring(0, 5000)}`)
    .join('\n\n---\n\n')
    .substring(0, 25000)

  const formatRules = `你是一位专业的期末考试复习资料整理专家。请根据学习资料生成一份系统的复习文档。

排版格式要求：
1. **表格优先**：概念对比、参数、分类、步骤等事实性内容用 Markdown 表格呈现
2. **箭头链**：流程、因果关系用 → 连接，如 "定义 → 公式 → 推导 → 应用"
3. **高频考点标记**：🔥（高频考点）或 ⭐（必背考点）
4. **加粗关键词**：核心术语用 **加粗**
5. **层级清晰**：# ## ### 标题层级，每个 ## 下不超过 5 个 ###
6. **对比表格**：易混淆概念放在一起对比
7. **每个专题**配 1-2 道模拟练习题 + 答案解析
8. **文档末尾**加「核心对比表」和「考试自检清单」`

  const templateExtras: Record<string, string> = {
    quick_ref: `
速查手册模式：每个考点独立成表格（定义/公式/例题/易错点），标注 🔥 或 ⭐`,

    recite: `
背诵手册模式：开头加「全书脉络速览」表格，核心概念一句话定义，必背公式单独列表`,

    analysis: `
材料分析题模式：每个专题以「场景→理论→练习→答案拆解」结构组织，答案按分步给分`,

    custom: ``,
  }

  return `${formatRules}

${templateExtras[template] || ''}

用户需求：${instruction || '帮我整理成系统的复习文档'}

学习资料：
${matContent}

请直接返回 Markdown 文档内容。第一个 # 标题为文档标题。
只返回 Markdown，不要包含其他说明文字。`
}

export async function generateDocument(
  config: AIConfig,
  materials: { name: string; content: string }[],
  instruction: string,
  template: string = 'general'
): Promise<DocumentResult> {
  const prompt = buildDocumentPrompt(materials, instruction, template)
  const content = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 8192 })
  if (!content) throw new Error('AI 返回内容为空')

  const titleMatch = content.match(/^#\s+(.+)/m)
  const title = titleMatch ? titleMatch[1].trim() : '复习文档'

  return { title, content }
}

export async function reviseDocument(
  config: AIConfig,
  originalContent: string,
  userMessage: string,
  materials?: { name: string; content: string }[]
): Promise<string> {
  let materialContext = ''
  if (materials && materials.length > 0) {
    materialContext = '\n\n## 参考资料（用于确保修改内容准确）\n'
    for (const mat of materials) {
      materialContext += `\n### ${mat.name}\n${mat.content.substring(0, 3000)}\n`
    }
  }

  const prompt = `你是一位专业的学习资料整理专家。用户对你生成的复习文档有修改意见，请根据用户要求修改文档。

当前文档内容：
${originalContent.substring(0, 12000)}
${materialContext}

用户修改要求：${userMessage}

请根据用户要求修改文档。如果有参考资料，请参考资料内容确保修改的准确性。
请返回修改后的完整 Markdown 文档。保持原有的高质量排版（表格优先、箭头链、高频考点标记等）。
只返回修改后的完整 Markdown，不要包含其他说明。`

  const content = await callAI(config, [{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 8192 })
  if (!content) throw new Error('AI 返回内容为空')
  return content
}
