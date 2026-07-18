import type { AIConfig, ChatMessage, StreamOptions } from './aiClient'
import { streamAI } from './aiClient'
import type { DocumentPlan, TopicPlan, StyleAnchor, OrchestrationInput } from './documentOrchestrator'
import { streamBroker } from './streamBroker'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

let debugLogPath: string | null = null
function getDebugLogPath(): string {
  if (!debugLogPath) {
    try {
      debugLogPath = join(app.getPath('userData'), 'orchestrator-debug.log')
    } catch {
      debugLogPath = join(process.env.TEMP || '/tmp', 'orchestrator-debug.log')
    }
  }
  return debugLogPath
}

function debugLog(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] [Session] ${msg}\n`
  appendFile(getDebugLogPath(), line).catch(() => {})
  console.log(`[Session] ${msg}`)
}

export class GenerationSession {
  private messages: ChatMessage[] = []
  private systemPrompt: string
  private config: AIConfig
  private sessionId: string
  private isCLI: boolean

  constructor(
    config: AIConfig,
    input: OrchestrationInput,
    plan: DocumentPlan,
    anchor: StyleAnchor,
    sessionId: string
  ) {
    this.config = config
    this.sessionId = sessionId
    this.isCLI = config.provider === 'claude-code'
    this.systemPrompt = this.buildSystemPrompt(input, plan, anchor)
    this.messages = [{ role: 'system', content: this.systemPrompt }]
    debugLog(`Session created: ${sessionId}, provider=${config.provider}, system prompt ${this.systemPrompt.length} chars`)
  }

  private buildSystemPrompt(
    input: OrchestrationInput,
    plan: DocumentPlan,
    anchor: StyleAnchor
  ): string {
    const { materials, subjectName, template } = input

    // Build materials section — truncate each material to keep total manageable
    // For Claude CLI, use smaller context since there's no prompt caching benefit
    const maxPerMaterial = this.isCLI ? 2000 : 4000
    const maxTotal = this.isCLI ? 8000 : 20000
    const matContent = materials
      .map((m) => `【资料：${m.name}】\n${m.content.substring(0, maxPerMaterial)}`)
      .join('\n\n---\n\n')
      .substring(0, maxTotal)

    // Build anchor structure summary
    const anchorSummary = this.buildAnchorSummary(anchor, plan)

    // Template extras (reuse from aiClient)
    const templateExtras: Record<string, string> = {
      quick_ref: '速查手册模式：每个考点独立成表格（定义/公式/例题/易错点），标注高频考点',
      recite: '背诵手册模式：核心概念一句话定义，必背公式单独列表',
      analysis: '材料分析题模式：每个专题以"场景→理论→练习→答案拆解"结构组织',
      general: '',
      deep_dive: '深度讲解模式：每个知识点展开300-500字深度讲解，包含来龙去脉和类比',
      tutorial: '教程指南模式：Step by Step组织，从零开始逐步深入',
      lecture: '课堂讲解脚本模式：口语化风格，模拟老师讲课语气',
      explainer: '知识科普脚本模式：生动有趣语言，用类比和故事帮助记忆',
      custom: '',
    }

    return `你是一位专业的复习文档撰写专家。你的任务是根据提供的学习资料和文档大纲，逐个撰写专题内容。

## 文档信息
- 标题：${plan.title}
- 概述：${plan.overview}
- 学科：${subjectName || '未知'}
- 模板类型：${template}
- ${templateExtras[template] || ''}

## 格式要求
${plan.formatPlan}

## 风格范本（第一个专题的结构参考）
${anchorSummary}

## 格式一致性要求（极其重要）
1. 必须使用与风格范本完全相同的 ## 和 ### 标题层级结构
2. 练习题板块的名称必须与风格范本完全一致
3. 每个专题必须包含：知识讲解、例题、练习题、答案解析、复习小结表格、答题技巧提示
4. 练习题数量必须严格按专题的 exerciseStrategy 执行
5. 每道题的答案和解析必须完整，不得戛然而止
6. 使用 Markdown 格式，第一个 ## 标题为专题标题
7. 不要使用代码块包裹知识框架
8. 不要输出任何前言说明文字，直接从 # 标题开始

## 学习资料
${matContent}`
  }

  private buildAnchorSummary(anchor: StyleAnchor, plan: DocumentPlan): string {
    const lines: string[] = []
    lines.push(`专题标题: ${plan.topics[0].title}`)
    lines.push(`内容长度: 约 ${anchor.wordCount} 字`)
    lines.push('')
    lines.push('结构层级:')
    for (const h of anchor.structuralElements) {
      lines.push(`  - ${h}`)
    }
    lines.push('')
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

  private buildTopicPrompt(topicPlan: TopicPlan): string {
    return `请撰写以下专题的完整内容：

## 专题信息
${JSON.stringify({
  id: topicPlan.id,
  title: topicPlan.title,
  subtopics: topicPlan.subtopics,
  exerciseStrategy: topicPlan.exerciseStrategy,
  depthNotes: topicPlan.depthNotes,
}, null, 2)}

## 要求
1. 严格按照系统指令中的格式要求和风格范本撰写
2. 覆盖所有 subtopics，不遗漏
3. 按 exerciseStrategy 出练习题并附完整答案和解析
4. 直接返回 Markdown 内容，以 # 标题开头，不要任何前言`
  }

  async generateTopic(
    topicPlan: TopicPlan,
    index: number,
    total: number,
    onChunk?: (delta: string, accumulated: string) => void
  ): Promise<string> {
    const topicPrompt = this.buildTopicPrompt(topicPlan)
    this.messages.push({ role: 'user', content: topicPrompt })

    debugLog(`Generating topic ${index + 1}/${total}: "${topicPlan.title}" (${topicPrompt.length} chars user msg)`)

    streamBroker.publish(this.sessionId, {
      type: 'topic_start',
      topicId: topicPlan.id,
      topicTitle: topicPlan.title,
      index,
      total,
    })

    let accumulated = ''
    const options: StreamOptions = {
      temperature: 0.5,
      maxTokens: 16384,
      // Pass the session's system prompt so Claude CLI actually receives
      // the materials, format rules, and style anchor
      systemInstruction: this.systemPrompt,
    }

    try {
      for await (const delta of streamAI(this.config, this.messages, options)) {
        accumulated += delta
        streamBroker.publish(this.sessionId, {
          type: 'content_delta',
          topicId: topicPlan.id,
          delta,
          accumulated,
        })
        onChunk?.(delta, accumulated)
      }
    } catch (err) {
      const msg = (err as Error).message
      debugLog(`Topic "${topicPlan.title}" streaming error: ${msg}`)
      streamBroker.publish(this.sessionId, {
        type: 'error',
        topicId: topicPlan.id,
        message: msg,
      })
      throw err
    }

    // For Claude CLI (--no-session-persistence), don't accumulate history
    // since the model never sees previous messages. Just keep system + current topic.
    if (this.isCLI) {
      this.messages = [this.messages[0]] // reset to system message only
    } else {
      this.messages.push({ role: 'assistant', content: accumulated })
    }
    debugLog(`Topic "${topicPlan.title}" complete: ${accumulated.length} chars, isCLI=${this.isCLI}`)

    return accumulated
  }

  async compactIfNeeded(): Promise<void> {
    // Estimate total token count (rough: 1 token ≈ 2 Chinese chars)
    const totalChars = this.messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : ''
      return sum + content.length
    }, 0)

    // If over 60k chars (~30k tokens), compress
    if (totalChars < 60000) return

    debugLog(`Compacting session: ${totalChars} chars total`)

    // Keep system message + summarize conversation
    const systemMsg = this.messages[0]
    const conversationMsgs = this.messages.slice(1)

    // Extract key info from assistant messages
    const topicSummaries = conversationMsgs
      .filter(m => m.role === 'assistant')
      .map((m, i) => `专题${i + 1}已生成，${(m.content as string).length}字`)
      .join('；')

    this.messages = [
      systemMsg,
      { role: 'user', content: `请记住：${topicSummaries}` },
      { role: 'assistant', content: '明白，我已记住之前生成的内容概要，继续撰写后续专题。' },
    ]
    debugLog(`Session compacted to ${this.messages.length} messages`)
  }

  getSystemPromptLength(): number {
    return this.systemPrompt.length
  }
}
