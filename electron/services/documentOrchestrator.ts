import type { AIConfig } from './aiClient'
import { callAI } from './aiClient'
import { appendFileSync } from 'fs'
import { join } from 'path'

const DEBUG_LOG = join(process.env.TEMP || '/tmp', 'orchestrator-debug.log')
function debugLog(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`
  try { appendFileSync(DEBUG_LOG, line) } catch {}
  console.log(`[Orchestrator] ${msg}`)
}

// === Phase definitions ===
export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5

export type PhaseName =
  | 'source_processing'
  | 'planning'
  | 'style_anchor'
  | 'parallel_generation'
  | 'final_review'
  | 'repair_output'

const PHASE_LABELS: Record<PhaseId, string> = {
  0: '素材分析',
  1: '大纲规划',
  2: '风格锚定',
  3: '并行生成',
  4: '终审检查',
  5: '修复输出',
}

// === Knowledge point from Phase 0 ===
export interface KnowledgePoint {
  id: string
  topic: string
  subtopics: string[]
  keyFormulas: string[]
  keyConcepts: string[]
  sourceMaterialNames: string[]
  estimatedDepth: 'basic' | 'intermediate' | 'advanced'
}

// === Document plan from Phase 1 ===
export interface TopicPlan {
  id: string
  title: string
  subtopics: string[]
  exerciseStrategy: string
  depthNotes: string
  materialRefs: string[]
}

export interface DocumentPlan {
  title: string
  overview: string
  topics: TopicPlan[]
  formatPlan: string
  totalEstimatedTopics: number
}

// === Style anchor from Phase 2 ===
export interface StyleAnchor {
  topicId: string
  content: string
  structuralElements: string[]
  wordCount: number
}

// === Parallel generation result from Phase 3 ===
export interface TopicContent {
  topicId: string
  topicTitle: string
  content: string
  qualityPassed: boolean
  qualityIssues: string[]
}

// === Review output from Phase 4 ===
export interface ReviewIssue {
  id: string
  severity: 'critical' | 'warning' | 'info'
  topicId: string | null
  description: string
  suggestedFix: string
}

// === Orchestration snapshot (sent to renderer) ===
export interface OrchestrationSnapshot {
  id: string
  status: 'running' | 'paused_checkpoint' | 'completed' | 'failed'
  currentPhase: PhaseId
  currentPhaseName: PhaseName
  phaseProgress: {
    current: number
    total: number
    label: string
  } | null
  qualityCheckResult: {
    passed: boolean
    issues: string[]
  } | null
  checkpointData: CheckpointPayload | null
  elapsedMs: number
  error: string | null
  failedPhase: PhaseId | null
  intermediateResults: {
    knowledgePoints: KnowledgePoint[] | null
    documentPlan: DocumentPlan | null
    styleAnchor: StyleAnchor | null
    topicContents: TopicContent[]
    reviewIssues: ReviewIssue[]
  }
}

// === Checkpoint payload ===
export type CheckpointPayload =
  | { checkpoint: 1; plan: DocumentPlan }
  | { checkpoint: 2; anchor: StyleAnchor }
  | { checkpoint: 3; issues: ReviewIssue[]; fullDocument: string }

// === Orchestration input ===
export interface OrchestrationInput {
  materials: { name: string; content: string }[]
  instruction: string
  template: string
  subjectName?: string
}

// === Final result ===
export interface OrchestrationResult {
  title: string
  content: string
  orchestrationId: string
  phasesCompleted: PhaseId[]
  totalElapsedMs: number
}

// === Internal state ===
interface OrchestrationState {
  id: string
  input: OrchestrationInput
  snapshot: OrchestrationSnapshot
  startTime: number
  webContents: Electron.WebContents
  checkpointResolvers: Map<number, { resolve: (approved: boolean) => void; userNotes?: string }>
  cancelled: boolean
}

const activeOrchestrations = new Map<string, OrchestrationState>()

// === Helpers ===
let idCounter = 0
function nextId(): string {
  return `orch_${Date.now()}_${++idCounter}`
}

function createSnapshot(id: string): OrchestrationSnapshot {
  return {
    id,
    status: 'running',
    currentPhase: 0,
    currentPhaseName: 'source_processing',
    phaseProgress: null,
    qualityCheckResult: null,
    checkpointData: null,
    elapsedMs: 0,
    error: null,
    failedPhase: null,
    intermediateResults: {
      knowledgePoints: null,
      documentPlan: null,
      styleAnchor: null,
      topicContents: [],
      reviewIssues: [],
    },
  }
}

function sanitizeSnapshot(snapshot: OrchestrationSnapshot): OrchestrationSnapshot {
  const s = { ...snapshot }
  // Strip checkpoint fullDocument
  if (s.checkpointData && 'fullDocument' in s.checkpointData) {
    s.checkpointData = { ...s.checkpointData, fullDocument: '' }
  }
  // Strip all content from intermediateResults — UI only needs metadata
  s.intermediateResults = {
    knowledgePoints: s.intermediateResults.knowledgePoints?.map(kp => ({
      ...kp, keyFormulas: [], keyConcepts: [],
    })) || null,
    documentPlan: s.intermediateResults.documentPlan ? {
      ...s.intermediateResults.documentPlan,
      topics: s.intermediateResults.documentPlan.topics.map(t => ({
        ...t, materialRefs: [],
      })),
    } : null,
    styleAnchor: s.intermediateResults.styleAnchor ? {
      ...s.intermediateResults.styleAnchor,
      content: s.intermediateResults.styleAnchor.content.substring(0, 1500),
    } : null,
    topicContents: s.intermediateResults.topicContents.map(tc => ({
      topicId: tc.topicId, topicTitle: tc.topicTitle, content: '',
      qualityPassed: tc.qualityPassed, qualityIssues: tc.qualityIssues,
    })),
    reviewIssues: s.intermediateResults.reviewIssues,
  }
  return s
}

function sendProgress(state: OrchestrationState) {
  state.snapshot.elapsedMs = Date.now() - state.startTime
  debugLog(`sendProgress: status=${state.snapshot.status}, phase=${state.snapshot.currentPhase}, hasCheckpoint=${!!state.snapshot.checkpointData}`)
  if (state.webContents && !state.webContents.isDestroyed()) {
    const sanitized = sanitizeSnapshot(state.snapshot)
    state.webContents.send('orchestrator:progress', sanitized)
  }
}

function setPhase(state: OrchestrationState, phase: PhaseId) {
  state.snapshot.currentPhase = phase
  state.snapshot.currentPhaseName = ['source_processing', 'planning', 'style_anchor', 'parallel_generation', 'final_review', 'repair_output'][phase] as PhaseName
  state.snapshot.qualityCheckResult = null
  state.snapshot.phaseProgress = null
  sendProgress(state)
}

function setQualityResult(state: OrchestrationState, passed: boolean, issues: string[]) {
  state.snapshot.qualityCheckResult = { passed, issues }
  sendProgress(state)
}

// JSON parsing helper
function cleanJsonString(raw: string): string {
  // Remove markdown code block wrapper
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  let text = codeBlockMatch ? codeBlockMatch[1].trim() : raw
  const firstBracket = text.indexOf('{')
  const lastBracket = text.lastIndexOf('}')
  if (firstBracket === -1 || lastBracket === -1) return text
  text = text.substring(firstBracket, lastBracket + 1)
  // Fix consecutive double quotes
  text = text.replace(/"{2,}/g, '\\"')
  // Fix trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, '$1')
  // Fix unescaped newlines/tabs inside strings
  text = text.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  })
  return text
}

function parseJsonFromAI<T>(raw: string): T {
  const cleaned = cleanJsonString(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch (e) {
    debugLog(`JSON parse error: ${(e as Error).message}, attempting regex fallback`)
    // Try regex fallback for array JSON
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]) as T
      } catch { /* continue to throw */ }
    }
    throw e
  }
}

// Concurrency limiter
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (index: number, result: T) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const i = nextIndex++
      results[i] = await tasks[i]()
      onProgress?.(i, results[i])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext())
  await Promise.all(workers)
  return results
}

// === Checkpoint mechanism ===
function awaitCheckpoint(
  state: OrchestrationState,
  checkpointNum: number,
  payload: CheckpointPayload
): Promise<boolean> {
  debugLog(`awaitCheckpoint: checkpoint=${checkpointNum}, payloadKeys=${Object.keys(payload)}`)
  return new Promise<boolean>((resolve) => {
    state.checkpointResolvers.set(checkpointNum, { resolve })
    state.snapshot.status = 'paused_checkpoint'
    state.snapshot.checkpointData = payload
    debugLog(`awaitCheckpoint: sending progress, status=${state.snapshot.status}`)
    sendProgress(state)
  })
}

// === Exported functions ===
export async function resumeCheckpoint(
  orchestrationId: string,
  checkpoint: number,
  approved: boolean,
  userNotes?: string
): Promise<void> {
  debugLog(`resumeCheckpoint: id=${orchestrationId}, checkpoint=${checkpoint}, approved=${approved}, notes=${userNotes?.substring(0, 50) || 'none'}`)
  const state = activeOrchestrations.get(orchestrationId)
  if (!state) {
    debugLog(`resumeCheckpoint: state not found for ${orchestrationId}`)
    return
  }
  const resolver = state.checkpointResolvers.get(checkpoint)
  if (resolver) {
    if (userNotes) {
      state.input.instruction = (state.input.instruction || '') + '\n\n用户修改意见：' + userNotes
    }
    resolver.userNotes = userNotes
    resolver.resolve(approved)
    state.checkpointResolvers.delete(checkpoint)
    state.snapshot.status = 'running'
    state.snapshot.checkpointData = null
    sendProgress(state)
  }
}

export async function cancelOrchestration(orchestrationId: string): Promise<void> {
  const state = activeOrchestrations.get(orchestrationId)
  if (state) {
    state.cancelled = true
    // Resolve any pending checkpoints to unblock
    for (const [, resolver] of state.checkpointResolvers) {
      resolver.resolve(false)
    }
    state.checkpointResolvers.clear()
  }
}

// ===================================================================
// Phase 0: Source Processing
// ===================================================================
async function phase0SourceProcessing(
  state: OrchestrationState,
  config: AIConfig
): Promise<KnowledgePoint[]> {
  const { materials } = state.input

  const matContent = materials
    .map((m, i) => `【资料${i + 1}：${m.name}】\n${m.content.substring(0, 4000)}`)
    .join('\n\n---\n\n')
    .substring(0, 15000)

  const prompt = `你是一个学习资料分析专家。请分析以下学习资料，提取关键知识点并按主题组织。

要求：
1. 识别所有核心主题（大知识点），通常 5-10 个
2. 每个主题下列出关键子主题（2-5 个）
3. 标注每个主题的难度级别（basic/intermediate/advanced）
4. 列出每个主题涉及的公式（如果是理科）
5. 标注每个知识点来源于哪些资料

学习资料：
${matContent}

请严格按以下 JSON 格式返回，不要包含其他文字：
{
  "knowledgePoints": [
    {
      "id": "kp_1",
      "topic": "主题名称",
      "subtopics": ["子主题1", "子主题2"],
      "keyFormulas": ["公式1"],
      "keyConcepts": ["概念1", "概念2"],
      "sourceMaterialNames": ["资料名称"],
      "estimatedDepth": "intermediate"
    }
  ]
}

【重要】JSON 格式规则：
- 所有字符串值中不要使用双引号，如果需要引号请用单引号
- subtopics 数组中每个元素必须是纯文本，不要包含任何引号符号
- keyConcepts 同样不要使用双引号
- 确保 JSON 可以被 JSON.parse 直接解析`

  if (state.cancelled) throw new Error('cancelled')

  debugLog(`Phase 0: calling AI (prompt ${prompt.length} chars)`)
  const t0 = Date.now()
  const raw = await callAI(config, [{ role: 'user', content: prompt }], {
    temperature: 0.3,
    maxTokens: 8192,
    systemInstruction: '你是一个内容处理助手。请基于用户提供的文本完成任务，直接返回 JSON 格式结果。',
    noContinue: true,
  })
  debugLog(`Phase 0: AI returned ${raw.length} chars in ${Date.now() - t0}ms`)

  try {
    const parsed = parseJsonFromAI<{ knowledgePoints: KnowledgePoint[] }>(raw)
    const points = parsed.knowledgePoints || []

    const check = checkKnowledgePoints(points)
    setQualityResult(state, check.passed, check.issues)

    return points
  } catch (e) {
    debugLog(`Phase 0: parse error: ${(e as Error).message}`)
    debugLog(`Phase 0: raw first 500: ${raw.substring(0, 500)}`)
    throw new Error('Phase 0: 无法解析知识点 JSON')
  }
}

function checkKnowledgePoints(points: KnowledgePoint[]): { passed: boolean; issues: string[] } {
  const issues: string[] = []
  if (points.length < 3) {
    issues.push(`仅提取了 ${points.length} 个知识点，建议至少 3 个`)
  }
  for (const p of points) {
    if (!p.topic) issues.push(`知识点 ${p.id} 缺少主题名称`)
    if (!p.subtopics || p.subtopics.length === 0) issues.push(`知识点 "${p.topic}" 缺少子主题`)
  }
  return { passed: issues.length === 0, issues }
}

// ===================================================================
// Phase 1: Planning
// ===================================================================
async function phase1Planning(
  state: OrchestrationState,
  config: AIConfig,
  knowledgePoints: KnowledgePoint[]
): Promise<DocumentPlan> {
  const { instruction, template, subjectName } = state.input

  const prompt = `你是一个文档规划专家。根据以下已提取的知识点，创建一份完整的期末复习文档大纲。

知识点列表：
${JSON.stringify(knowledgePoints, null, 2)}

用户需求：${instruction || '帮我整理成系统的复习文档'}
文档模板类型：${template}
学科：${subjectName || '未知'}

要求：
1. 将知识点组织为逻辑清晰的专题（3-8 个，根据知识点数量合理规划）
2. 每个专题规划练习题类型和数量（如"2 单选 + 2 多选 + 2 简答 + 1 辨析"）
3. 确保覆盖所有知识点，不遗漏
4. 专题之间有逻辑递进关系（基础→进阶）
5. 每个专题标注重点讲解方向
6. overview 必须准确描述实际包含的专题，不得夸大覆盖范围
7. 所有专题的 exerciseStrategy 格式和数量必须统一（如都是"2单选+2多选+2简答+1辨析"）
8. formatPlan 必须明确规定统一的结构模板（标题层级、板块名称、总结表格等）

请按以下 JSON 格式返回，不要包含其他文字：
{
  "title": "文档标题",
  "overview": "文档概述（一段话）",
  "topics": [
    {
      "id": "topic_1",
      "title": "专题标题",
      "subtopics": ["子主题1", "子主题2"],
      "exerciseStrategy": "2 选择题 + 1 计算题",
      "depthNotes": "重点讲解...",
      "materialRefs": ["相关资料名"]
    }
  ],
  "formatPlan": "统一格式说明",
  "totalEstimatedTopics": 8
}

【重要】JSON 格式规则：
- 所有字符串值中不要使用双引号，如果需要引号请用单引号
- subtopics、depthNotes、exerciseStrategy 中不要包含任何引号符号
- 确保 JSON 可以被 JSON.parse 直接解析`

  if (state.cancelled) throw new Error('cancelled')

  debugLog(`Phase 1: calling AI`)
  const t1 = Date.now()
  const raw = await callAI(config, [{ role: 'user', content: prompt }], {
    temperature: 0.3,
    maxTokens: 8192,
    systemInstruction: '你是一个内容处理助手。请基于用户提供的文本完成任务，直接返回 JSON 格式结果。',
    noContinue: true,
  })
  debugLog(`Phase 1: AI returned ${raw.length} chars in ${Date.now() - t1}ms`)

  try {
    const plan = parseJsonFromAI<DocumentPlan>(raw)
    if (!plan.topics || plan.topics.length === 0) {
      throw new Error('No topics')
    }

    const check = checkDocumentPlan(plan, knowledgePoints)
    setQualityResult(state, check.passed, check.issues)

    return plan
  } catch (e) {
    debugLog(`Phase 1: parse error: ${(e as Error).message}`)
    debugLog(`Phase 1: raw first 500: ${raw.substring(0, 500)}`)
    throw new Error('Phase 1: 无法解析文档计划 JSON')
  }
}

function checkDocumentPlan(plan: DocumentPlan, knowledgePoints: KnowledgePoint[]): { passed: boolean; issues: string[] } {
  const issues: string[] = []

  // 1. Coverage
  const allKP = knowledgePoints.map(kp => kp.topic.toLowerCase())
  for (const kp of allKP) {
    const covered = plan.topics.some(t =>
      t.title.toLowerCase().includes(kp) ||
      t.subtopics.some(s => s.toLowerCase().includes(kp)) ||
      t.materialRefs.some(r => r.toLowerCase().includes(kp))
    )
    if (!covered) issues.push(`知识点 "${kp}" 未被任何专题覆盖`)
  }

  // 2. Balance
  if (plan.topics.length > 1) {
    const subtopicCounts = plan.topics.map(t => t.subtopics.length)
    const median = subtopicCounts.sort((a, b) => a - b)[Math.floor(subtopicCounts.length / 2)]
    for (const t of plan.topics) {
      if (t.subtopics.length > median * 3 && median > 0) {
        issues.push(`专题 "${t.title}" 子主题数 (${t.subtopics.length}) 远多于其他专题`)
      }
    }
  }

  // 3. Depth notes
  for (const t of plan.topics) {
    if (!t.depthNotes) issues.push(`专题 "${t.title}" 缺少深度说明`)
  }

  // 4. Exercise plan
  for (const t of plan.topics) {
    if (!t.exerciseStrategy) issues.push(`专题 "${t.title}" 缺少练习策略`)
  }

  // 5. Format plan
  if (!plan.formatPlan) issues.push('缺少格式计划说明')

  return { passed: issues.length === 0, issues }
}

// ===================================================================
// Phase 2: Style Anchor
// ===================================================================
async function phase2StyleAnchor(
  state: OrchestrationState,
  config: AIConfig,
  plan: DocumentPlan
): Promise<StyleAnchor> {
  const { materials, subjectName, template } = state.input
  const firstTopic = plan.topics[0]

  // Filter materials relevant to this topic
  const relevantMats = materials.filter(m =>
    firstTopic.materialRefs.some(ref => m.name.includes(ref))
  )
  const matContent = (relevantMats.length > 0 ? relevantMats : materials)
    .map(m => `【${m.name}】\n${m.content.substring(0, 6000)}`)
    .join('\n\n---\n\n')
    .substring(0, 12000)

  const prompt = `你是一位专业的复习文档撰写专家。请根据以下文档大纲，完整撰写第一个专题的内容，作为后续专题的写作范本。

文档大纲：
标题：${plan.title}
概述：${plan.overview}
格式要求：${plan.formatPlan}

第一个专题：
${JSON.stringify(firstTopic, null, 2)}

学科：${subjectName || '未知'}
模板类型：${template}

要求：
1. 严格按照大纲中该专题的 subtopics 和 exerciseStrategy 撰写
2. 每个知识点展开 150-300 字详细讲解
3. 每个公式配完整推导过程（如果是理科）
4. 至少 2 道例题（含完整解题步骤）
5. 按 exerciseStrategy 的要求出练习题并附完整答案和解析
6. 使用 Markdown 格式，第一个 ## 标题为专题标题

相关资料：
${matContent}

请直接返回该专题的完整 Markdown 内容，不要包含其他说明文字。`

  let retries = 1
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (state.cancelled) throw new Error('cancelled')

    debugLog(`Phase 2: calling AI (attempt ${attempt + 1}, maxTokens=16384)`)
    const t2 = Date.now()
    const content = await callAI(config, [{ role: 'user', content: prompt }], {
      temperature: 0.5,
      maxTokens: 16384,
    })
    debugLog(`Phase 2: AI returned ${content.length} chars in ${Date.now() - t2}ms`)

    if (!content || content.length < 200) {
      if (attempt === retries) throw new Error('Phase 2: 生成内容过短')
      await new Promise(r => setTimeout(r, 1000))
      continue
    }

    const anchor: StyleAnchor = {
      topicId: firstTopic.id,
      content,
      structuralElements: extractHeadings(content),
      wordCount: content.length,
    }

    const check = checkStyleAnchor(anchor)
    setQualityResult(state, check.passed, check.issues)

    return anchor
  }

  throw new Error('Phase 2: 风格锚定失败')
}

function extractHeadings(content: string): string[] {
  const headings: string[] = []
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{2,3})\s+(.+)/)
    if (match) headings.push(match[2].trim())
  }
  return headings
}

function checkStyleAnchor(anchor: StyleAnchor): { passed: boolean; issues: string[] } {
  const issues: string[] = []
  if (anchor.wordCount < 800) issues.push(`内容过短（${anchor.wordCount} 字），建议至少 800 字`)
  if (anchor.structuralElements.length < 2) issues.push(`仅有 ${anchor.structuralElements.length} 个子标题，建议至少 2 个`)

  const hasExercise = /练习|习题|例题|选择题|计算题|简答题/.test(anchor.content)
  if (!hasExercise) issues.push('未检测到练习题部分')

  const hasAnswer = /答案|解析|解题|参考答案/.test(anchor.content)
  if (!hasAnswer) issues.push('未检测到答案/解析部分')

  return { passed: issues.length === 0, issues }
}

// ===================================================================
// Phase 3: Parallel Generation
// ===================================================================
async function phase3ParallelGeneration(
  state: OrchestrationState,
  config: AIConfig,
  plan: DocumentPlan,
  anchor: StyleAnchor
): Promise<TopicContent[]> {
  const { materials, subjectName } = state.input
  const topics = plan.topics.slice(1) // Skip first topic (already generated as anchor)

  if (topics.length === 0) {
    // Only one topic in plan, return just the anchor
    return [{
      topicId: anchor.topicId,
      topicTitle: plan.topics[0].title,
      content: anchor.content,
      qualityPassed: true,
      qualityIssues: [],
    }]
  }

  // Build style anchor summary (structural template for other generators)
  const anchorSummary = buildAnchorSummary(anchor, plan)

  const concurrency = config.provider === 'claude-code' ? 2 : 3
  const totalTopics = plan.topics.length

  // Set initial progress
  state.snapshot.phaseProgress = { current: 0, total: totalTopics, label: `生成专题 0/${totalTopics}` }
  sendProgress(state)

  const topicResults: TopicContent[] = [{
    topicId: anchor.topicId,
    topicTitle: plan.topics[0].title,
    content: anchor.content,
    qualityPassed: true,
    qualityIssues: [],
  }]

  // Generate remaining topics with concurrency control
  const tasks = topics.map((topicPlan, idx) => async (): Promise<TopicContent> => {
    return generateSingleTopic(state, config, plan, topicPlan, anchorSummary, materials, subjectName)
  })

  const results = await runWithConcurrency(tasks, concurrency, (idx, result) => {
    topicResults.push(result)
    state.snapshot.phaseProgress = {
      current: idx + 1,
      total: topics.length,
      label: `生成专题 ${idx + 1}/${topics.length}`,
    }
    sendProgress(state)
  })

  // Check for failed topics and retry once
  const failedTopics = results.filter(r => !r.qualityPassed)
  if (failedTopics.length > 0) {
    for (const failed of failedTopics) {
      if (state.cancelled) break
      const topicPlan = topics.find(t => t.id === failed.topicId)
      if (!topicPlan) continue

      const retryResult = await generateSingleTopic(state, config, plan, topicPlan, anchorSummary, materials, subjectName)
      // Replace the failed result
      const idx = topicResults.findIndex(r => r.topicId === failed.topicId)
      if (idx >= 0) topicResults[idx] = retryResult
    }
  }

  return topicResults
}

async function generateSingleTopic(
  state: OrchestrationState,
  config: AIConfig,
  plan: DocumentPlan,
  topicPlan: TopicPlan,
  anchorSummary: string,
  materials: { name: string; content: string }[],
  subjectName?: string
): Promise<TopicContent> {
  if (state.cancelled) {
    return { topicId: topicPlan.id, topicTitle: topicPlan.title, content: '', qualityPassed: false, qualityIssues: ['cancelled'] }
  }

  // Filter materials for this topic
  const relevantMats = materials.filter(m =>
    topicPlan.materialRefs.some(ref => m.name.includes(ref))
  )
  const matContent = (relevantMats.length > 0 ? relevantMats : materials)
    .map(m => `【${m.name}】\n${m.content.substring(0, 4000)}`)
    .join('\n\n---\n\n')
    .substring(0, 10000)

  const prompt = `你是一位专业的复习文档撰写专家。请严格按照以下风格范本的结构和格式，撰写指定专题。

【风格范本（第一个专题的结构参考）】
${anchorSummary}

【文档大纲】
标题：${plan.title}
概述：${plan.overview}

【本次要撰写的专题】
${JSON.stringify(topicPlan, null, 2)}

学科：${subjectName || '未知'}

【格式一致性要求 - 极其重要】
1. 必须使用与风格范本完全相同的 ## 和 ### 标题层级结构
2. 练习题板块的名称必须与风格范本完全一致（如"四、真题与模拟练习"）
3. 每个专题必须包含：知识讲解、例题、练习题、答案解析、复习小结表格、答题技巧提示
4. 练习题数量必须严格按 exerciseStrategy 执行，不多不少
5. 每道题的答案和解析必须完整，不得戛然而止
6. 如果资料中涉及具体历史事件、会议、年份，必须准确引用，不得遗漏关键节点
7. 使用 Markdown 格式，第一个 ## 标题为专题标题

【禁止事项】
- 不要使用代码块包裹知识框架（会导致嵌套渲染问题）
- 不要输出任何前言说明文字，直接从 # 标题开始
- 答案解析必须有完整的论证逻辑和总结性结论

相关资料：
${matContent}

请直接返回该专题的完整 Markdown 内容，以 # 标题开头。`

  const maxRetries = 2
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await callAI(config, [{ role: 'user', content: prompt }], {
        temperature: 0.5,
        maxTokens: 16384,
      })

      if (!content || content.length < 200) {
        if (attempt === maxRetries) {
          return { topicId: topicPlan.id, topicTitle: topicPlan.title, content: '', qualityPassed: false, qualityIssues: ['生成内容过短'] }
        }
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      const topicContent: TopicContent = {
        topicId: topicPlan.id,
        topicTitle: topicPlan.title,
        content,
        qualityPassed: true,
        qualityIssues: [],
      }

      // Quality check
      const check = checkTopicContent(content, anchorSummary, topicPlan)
      topicContent.qualityPassed = check.passed
      topicContent.qualityIssues = check.issues

      return topicContent
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          topicId: topicPlan.id,
          topicTitle: topicPlan.title,
          content: '',
          qualityPassed: false,
          qualityIssues: [(err as Error).message],
        }
      }
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  return { topicId: topicPlan.id, topicTitle: topicPlan.title, content: '', qualityPassed: false, qualityIssues: ['重试次数已用完'] }
}

function buildAnchorSummary(anchor: StyleAnchor, plan: DocumentPlan): string {
  const lines: string[] = []
  lines.push(`专题标题: ${plan.topics[0].title}`)
  lines.push(`内容长度: 约 ${anchor.wordCount} 字`)
  lines.push('')
  lines.push('结构层级:')
  for (const h of anchor.structuralElements) {
    lines.push(`  - ${h}`)
  }
  lines.push('')
  // Extract first 300 chars of each major section as formatting example
  const sections = anchor.content.split(/\n(?=##\s)/).filter(Boolean)
  lines.push('各节格式示例:')
  for (const section of sections.slice(0, 4)) {
    const heading = section.split('\n')[0]?.trim() || ''
    const preview = section.substring(0, 300).replace(/\n/g, ' ').trim()
    lines.push(`  ${heading}`)
    lines.push(`  ${preview}...`)
    lines.push('')
  }
  return lines.join('\n')
}

function checkTopicContent(content: string, anchorSummary: string, topicPlan: TopicPlan): { passed: boolean; issues: string[] } {
  const issues: string[] = []

  if (content.length < 800) issues.push(`内容过短（${content.length} 字）`)

  const headings = content.match(/^#{2,3}\s+.+/gm) || []
  if (headings.length < 2) issues.push(`仅有 ${headings.length} 个子标题`)

  const hasExercise = /练习|习题|例题|选择题|计算题|简答题/.test(content)
  if (!hasExercise) issues.push('未检测到练习题')

  const hasAnswer = /答案|解析|解题|参考答案/.test(content)
  if (!hasAnswer) issues.push('未检测到答案/解析')

  // Check first heading is not identical to anchor's
  const firstHeading = headings[0] || ''
  const anchorTitleMatch = anchorSummary.match(/专题标题:\s*(.+)/)
  if (anchorTitleMatch && firstHeading.includes(anchorTitleMatch[1])) {
    issues.push('标题与风格锚点重复')
  }

  return { passed: issues.length === 0, issues }
}

// ===================================================================
// Phase 4: Final Review
// ===================================================================
async function phase4FinalReview(
  state: OrchestrationState,
  config: AIConfig,
  fullDocument: string
): Promise<ReviewIssue[]> {
  const truncated = fullDocument.length > 25000
    ? fullDocument.substring(0, 25000) + '\n\n[...文档较长，以上为主要内容...]'
    : fullDocument

  const prompt = `你是一位严格的学习资料审阅专家。请审阅以下期末复习文档，逐项检查：

1. 答案完整性：每道练习题的答案和解析是否完整（不得戛然而止，必须有完整论证和结论）
2. 格式一致性：各专题的结构是否完全统一（标题层级、板块名称、编号风格必须一致）
3. 内容覆盖：概述中提到的内容是否全部包含，有无遗漏专题
4. 练习题一致性：各专题的练习题数量、类型、命名是否统一
5. 历史准确性：涉及历史事件、会议、年份的内容是否准确完整
6. 格式问题：是否有代码块嵌套、Markdown 渲染异常等问题
7. 总结板块：每个专题是否都包含复习小结表格和答题技巧提示
8. 逻辑连贯性：专题之间的衔接是否自然

请返回 JSON 格式的审阅结果，不要包含其他文字：
{
  "issues": [
    {
      "id": "issue_1",
      "severity": "critical",
      "topicId": "topic_1",
      "description": "问题描述",
      "suggestedFix": "建议修改方式"
    }
  ]
}

如果文档质量良好没有问题，返回 { "issues": [] }

【重要】JSON 格式规则：
- 所有字符串值中不要使用双引号，如果需要引号请用单引号
- description 和 suggestedFix 中不要包含任何引号符号
- 确保 JSON 可以被 JSON.parse 直接解析

文档内容：
${truncated}`

  if (state.cancelled) throw new Error('cancelled')

  const raw = await callAI(config, [{ role: 'user', content: prompt }], {
    temperature: 0.3,
    maxTokens: 8192,
    systemInstruction: '你是一个内容处理助手。请基于用户提供的文本完成任务，直接返回 JSON 格式结果。',
    noContinue: true,
  })

  try {
    const parsed = parseJsonFromAI<{ issues: ReviewIssue[] }>(raw)
    const issues = parsed.issues || []

    const check = { passed: issues.filter(i => i.severity === 'critical').length === 0, issues: issues.map(i => i.description) }
    setQualityResult(state, check.passed, check.issues)

    return issues
  } catch {
    // If JSON parsing fails, return empty issues (no review needed)
    return []
  }

  return []
}

// ===================================================================
// Phase 5: Repair
// ===================================================================
async function phase5Repair(
  state: OrchestrationState,
  config: AIConfig,
  fullDocument: string,
  issues: ReviewIssue[]
): Promise<string> {
  const prompt = `你是一位文档修复专家。请根据以下审阅意见，精确修复文档中的问题。

【待修复的问题】
${JSON.stringify(issues, null, 2)}

【当前文档】
${fullDocument.substring(0, 25000)}

要求：
1. 只修复列出的问题，不要重写没有问题的部分
2. 保持文档的整体结构和格式不变
3. 修复后直接返回完整的修改后文档（Markdown）

【极其重要】
- 第一个字符必须是 #（Markdown 标题），不要输出任何前言、说明、解释
- 不要输出"Now I'll write"、"Here is"、"以下是"等任何前缀文字
- 直接输出修复后的完整 Markdown 文档`

  const content = await callAI(config, [{ role: 'user', content: prompt }], {
    temperature: 0.5,
    maxTokens: 32768,
    noContinue: true,
  })

  if (!content) throw new Error('Phase 5: 修复后内容为空')

  // Strip any preamble the AI might have added before the actual Markdown
  const firstHeading = content.indexOf('\n#')
  const firstHeadingAlt = content.indexOf('\r\n#')
  const headingPos = firstHeadingAlt >= 0 ? firstHeadingAlt : firstHeading
  const finalContent = headingPos > 0 && headingPos < 500
    ? content.substring(headingPos + 1)
    : content.startsWith('#') ? content : content

  // Quality check: length should be within 80%-150% of input
  const inputLen = fullDocument.length
  const outputLen = finalContent.length
  if (outputLen < inputLen * 0.5 || outputLen > inputLen * 2) {
    console.log('[Orchestrator] Phase 5 warning: output length', outputLen, 'vs input', inputLen)
  }

  return finalContent
}

// ===================================================================
// Main orchestrator
// ===================================================================
export async function startOrchestration(
  webContents: Electron.WebContents,
  input: OrchestrationInput,
  config: AIConfig
): Promise<OrchestrationResult> {
  // Prevent multiple orchestrations from the same window
  for (const [, existing] of activeOrchestrations) {
    if (existing.webContents === webContents && !existing.cancelled) {
      throw new Error('已有生成任务在运行中')
    }
  }

  const id = nextId()
  const snapshot = createSnapshot(id)
  const state: OrchestrationState = {
    id,
    input,
    snapshot,
    startTime: Date.now(),
    webContents,
    checkpointResolvers: new Map(),
    cancelled: false,
  }

  activeOrchestrations.set(id, state)
  const phasesCompleted: PhaseId[] = []
  debugLog(`Orchestration ${id} started`)

  try {
    // Phase 0: Source Processing
    debugLog('Phase 0: Source Processing - starting')
    setPhase(state, 0)
    const knowledgePoints = await phase0SourceProcessing(state, config)
    debugLog(`Phase 0: done, ${knowledgePoints.length} knowledge points`)
    state.snapshot.intermediateResults.knowledgePoints = knowledgePoints
    phasesCompleted.push(0)

    if (state.cancelled) throw new Error('cancelled')

    // Phase 1: Planning
    debugLog('Phase 1: Planning - starting')
    setPhase(state, 1)
    let plan = await phase1Planning(state, config, knowledgePoints)
    state.snapshot.intermediateResults.documentPlan = plan
    phasesCompleted.push(1)
    debugLog(`Phase 1: done, ${plan.topics.length} topics planned`)

    // Checkpoint 1: User confirms outline
    let approved1 = false
    while (!approved1) {
      debugLog(`Checkpoint 1: waiting for user confirmation (plan topics: ${plan.topics.length})`)
      approved1 = await awaitCheckpoint(state, 1, { checkpoint: 1, plan })
      debugLog(`Checkpoint 1: approved=${approved1}, cancelled=${state.cancelled}`)
      if (state.cancelled) throw new Error('cancelled')
      if (!approved1) {
        debugLog('Checkpoint 1: rejected, re-running Phase 1')
        setPhase(state, 1)
        try {
          plan = await phase1Planning(state, config, knowledgePoints)
          state.snapshot.intermediateResults.documentPlan = plan
          debugLog(`Checkpoint 1: re-run done, ${plan.topics.length} topics`)
        } catch (e) {
          debugLog(`Checkpoint 1: re-run failed: ${(e as Error).message}`)
          throw e
        }
      }
    }

    // Phase 2: Style Anchor
    debugLog('Phase 2: Style Anchor - starting')
    setPhase(state, 2)
    let anchor = await phase2StyleAnchor(state, config, plan)
    state.snapshot.intermediateResults.styleAnchor = anchor
    phasesCompleted.push(2)
    debugLog(`Phase 2: done, ${anchor.wordCount} words`)

    // Checkpoint 2: User confirms style
    let approved2 = false
    while (!approved2) {
      debugLog('Checkpoint 2: waiting for user confirmation')
      approved2 = await awaitCheckpoint(state, 2, { checkpoint: 2, anchor })
      debugLog(`Checkpoint 2: approved=${approved2}`)
      if (state.cancelled) throw new Error('cancelled')
      if (!approved2) {
        debugLog('Checkpoint 2: rejected, re-running Phase 2')
        setPhase(state, 2)
        anchor = await phase2StyleAnchor(state, config, plan)
        state.snapshot.intermediateResults.styleAnchor = anchor
      }
    }

    // Phase 3: Parallel Generation
    debugLog('Phase 3: Parallel Generation - starting')
    setPhase(state, 3)
    const topicContents = await phase3ParallelGeneration(state, config, plan, anchor)
    state.snapshot.intermediateResults.topicContents = topicContents
    phasesCompleted.push(3)
    debugLog(`Phase 3: done, ${topicContents.length} topics generated`)

    if (state.cancelled) throw new Error('cancelled')

    // Assemble full document
    const fullDocument = assembleDocument(plan, topicContents)
    debugLog(`Document assembled, ${fullDocument.length} chars`)

    // Phase 4: Final Review
    debugLog('Phase 4: Final Review - starting')
    setPhase(state, 4)
    const reviewIssues = await phase4FinalReview(state, config, fullDocument)
    state.snapshot.intermediateResults.reviewIssues = reviewIssues
    phasesCompleted.push(4)
    debugLog(`Phase 4: done, ${reviewIssues.length} issues found`)

    // Checkpoint 3: User confirms review
    if (reviewIssues.length > 0) {
      let approved3 = false
      while (!approved3) {
        approved3 = await awaitCheckpoint(state, 3, { checkpoint: 3, issues: reviewIssues, fullDocument })
        if (state.cancelled) throw new Error('cancelled')
        if (!approved3) {
          // User wants to re-run review — re-assemble and re-review
          debugLog('Checkpoint 3: rejected, re-running Phase 4')
          setPhase(state, 4)
          const newReviewIssues = await phase4FinalReview(state, config, fullDocument)
          reviewIssues.length = 0
          reviewIssues.push(...newReviewIssues)
          state.snapshot.intermediateResults.reviewIssues = reviewIssues
        }
      }

      if (reviewIssues.length > 0) {
        // Phase 5: Repair
        setPhase(state, 5)
        const repaired = await phase5Repair(state, config, fullDocument, reviewIssues)
        phasesCompleted.push(5)

        const titleMatch = repaired.match(/^#\s+(.+)/m)
        const title = titleMatch ? titleMatch[1].trim() : plan.title

        state.snapshot.status = 'completed'
        sendProgress(state)

        return {
          title,
          content: repaired,
          orchestrationId: id,
          phasesCompleted,
          totalElapsedMs: Date.now() - state.startTime,
        }
      }
    }

    // No repairs needed or user skipped
    const titleMatch = fullDocument.match(/^#\s+(.+)/m)
    const title = titleMatch ? titleMatch[1].trim() : plan.title

    state.snapshot.status = 'completed'
    sendProgress(state)

    return {
      title,
      content: fullDocument,
      orchestrationId: id,
      phasesCompleted,
      totalElapsedMs: Date.now() - state.startTime,
    }
  } catch (err) {
    const msg = (err as Error).message
    debugLog(`Orchestration error: ${msg}`)
    debugLog(`Error stack: ${(err as Error).stack}`)
    if (msg === 'cancelled') {
      state.snapshot.status = 'failed'
      state.snapshot.error = '用户取消'
    } else {
      state.snapshot.status = 'failed'
      state.snapshot.error = msg
      state.snapshot.failedPhase = state.snapshot.currentPhase
    }
    sendProgress(state)
    throw err
  } finally {
    activeOrchestrations.delete(id)
  }
}

function assembleDocument(plan: DocumentPlan, topicContents: TopicContent[]): string {
  const parts: string[] = []

  // Title
  parts.push(`# ${plan.title}`)
  parts.push('')
  parts.push(plan.overview)
  parts.push('')

  // Topics
  for (const tc of topicContents) {
    if (tc.content) {
      parts.push(tc.content)
      parts.push('')
      parts.push('---')
      parts.push('')
    } else {
      parts.push(`## ${tc.topicTitle}`)
      parts.push('')
      parts.push(`<!-- [${tc.topicTitle}] 待补充 -->`)
      parts.push('')
    }
  }

  return parts.join('\n')
}
