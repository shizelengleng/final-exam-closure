import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { readCollection } from '../db/store'

export interface SessionInfo {
  subjectId: string
  sessionId: string | null
  createdAt: string
  lastUsed: string
  messageCount: number
}

interface SessionData {
  sessionId: string | null
  createdAt: string
  lastUsed: string
  messageCount: number
}

const STREAM_TIMEOUT = 300_000   // 5 min hard timeout
const STALL_TIMEOUT = 120_000    // 2 min no-data stall

let sessionsDir: string | null = null
let appSkillsDir: string | null = null
const activeProcesses = new Map<string, ChildProcess>()

function getSessionsDir(): string {
  if (!sessionsDir) {
    sessionsDir = path.join(app.getPath('userData'), 'sessions')
  }
  return sessionsDir
}

function getAppSkillsDir(): string {
  if (!appSkillsDir) {
    appSkillsDir = path.join(app.getPath('userData'), '.claude', 'skills')
  }
  return appSkillsDir
}

function getSessionDir(subjectId: string, sessionKey?: string): string {
  const dirName = sessionKey ? `${subjectId}_${sessionKey}` : subjectId
  return path.join(getSessionsDir(), dirName)
}

function getSessionDataPath(subjectId: string, sessionKey?: string): string {
  return path.join(getSessionDir(subjectId, sessionKey), 'session.json')
}

function getWorkspace(subjectId: string): string {
  return path.join(app.getPath('userData'), 'data', 'subjects', subjectId)
}

function getProcessKey(subjectId: string, sessionKey?: string): string {
  return sessionKey ? `${subjectId}:${sessionKey}` : subjectId
}

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })
}

async function readSessionData(subjectId: string, sessionKey?: string): Promise<SessionData | null> {
  try {
    const raw = await fs.promises.readFile(getSessionDataPath(subjectId, sessionKey), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeSessionData(subjectId: string, data: SessionData, sessionKey?: string): Promise<void> {
  await ensureDir(getSessionDir(subjectId, sessionKey))
  await fs.promises.writeFile(getSessionDataPath(subjectId, sessionKey), JSON.stringify(data, null, 2), 'utf-8')
}

// 确保学科工作目录有 .claude/skills/ 符号链接到应用 skills 目录
async function ensureWorkspace(subjectId: string): Promise<string> {
  const workspace = getWorkspace(subjectId)
  await ensureDir(workspace)

  const claudeDir = path.join(workspace, '.claude')
  await ensureDir(claudeDir)

  const skillsLink = path.join(claudeDir, 'skills')
  const appSkills = getAppSkillsDir()

  try {
    const stat = await fs.promises.lstat(skillsLink)
    if (stat.isSymbolicLink()) {
      const target = await fs.promises.readlink(skillsLink)
      if (target === appSkills) return workspace
      await fs.promises.unlink(skillsLink)
    } else if (stat.isDirectory()) {
      // 如果是目录则跳过（用户可能手动创建了）
      return workspace
    }
  } catch {
    // 链接不存在，需要创建
  }

  try {
    await fs.promises.symlink(appSkills, skillsLink, 'junction')
  } catch (err) {
    console.warn('[ClaudeSession] Failed to create skills symlink:', err)
  }

  return workspace
}

// 解析 stream-json 事件行
function parseStreamLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

// 获取或创建学科会话
export async function getOrCreateSession(subjectId: string, sessionKey?: string): Promise<SessionInfo> {
  const existing = await readSessionData(subjectId, sessionKey)
  if (existing) {
    return {
      subjectId,
      sessionId: existing.sessionId,
      createdAt: existing.createdAt,
      lastUsed: existing.lastUsed,
      messageCount: existing.messageCount,
    }
  }

  const now = new Date().toISOString()
  const data: SessionData = {
    sessionId: null,
    createdAt: now,
    lastUsed: now,
    messageCount: 0,
  }
  await writeSessionData(subjectId, data, sessionKey)
  await ensureWorkspace(subjectId)

  return {
    subjectId,
    sessionId: null,
    createdAt: now,
    lastUsed: now,
    messageCount: 0,
  }
}

// 发送消息（流式）
export async function sendMessage(
  subjectId: string,
  message: string,
  onChunk: (delta: string) => void,
  onComplete: (fullText: string, sessionId: string | null) => void,
  onError: (error: string) => void,
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void,
  sessionKey?: string,
  timeout?: number,
): Promise<void> {
  const workspace = await ensureWorkspace(subjectId)
  const sessionData = await readSessionData(subjectId, sessionKey)
  const sessionId = sessionData?.sessionId || null
  const processKey = getProcessKey(subjectId, sessionKey)

  const args = ['-p', '-', '--output-format', 'stream-json', '--bare', '--verbose']
  if (sessionId) {
    args.push('--resume', sessionId)
  }

  let child: ChildProcess | null = null
  let fullText = ''
  let capturedSessionId: string | null = null
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let hardTimer: ReturnType<typeof setTimeout> | null = null

  return new Promise<void>((resolve) => {
    child = spawn('claude', args, {
      cwd: workspace,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    activeProcesses.set(processKey, child)

    let stderr = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      // Reset stall timer on any data
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        child?.kill('SIGTERM')
        onError('响应超时（无数据）')
        resolve()
      }, STALL_TIMEOUT)

      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        const event = parseStreamLine(line)
        if (!event) continue

        const type = event.type as string

        if (type === 'assistant') {
          const msg = event.message as {
            content?: Array<{
              type: string
              text?: string
              id?: string
              name?: string
              input?: Record<string, unknown>
            }>
          } | undefined
          const content = msg?.content
          if (content) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text
                onChunk(block.text)
              } else if (block.type === 'tool_use' && block.name && onToolUse) {
                onToolUse(block.name, block.input || {})
              }
            }
          }
        } else if (type === 'content_block_delta') {
          const delta = (event as Record<string, unknown>).delta as { text?: string } | undefined
          if (delta?.text) {
            fullText += delta.text
            onChunk(delta.text)
          }
        } else if (type === 'result') {
          capturedSessionId = ((event as Record<string, unknown>).session_id || (event as Record<string, unknown>).sessionId) as string | null
        }
      }
    })

    // Hard timeout
    hardTimer = setTimeout(() => {
      child?.kill('SIGTERM')
      onError(`响应超时（${Math.round((timeout || STREAM_TIMEOUT) / 60000)}分钟）`)
      resolve()
    }, timeout || STREAM_TIMEOUT)

    child.on('close', async () => {
      if (stallTimer) clearTimeout(stallTimer)
      if (hardTimer) clearTimeout(hardTimer)
      activeProcesses.delete(processKey)

      if (fullText) {
        // Save session data
        const now = new Date().toISOString()
        const updated: SessionData = {
          sessionId: capturedSessionId || sessionData?.sessionId || null,
          createdAt: sessionData?.createdAt || now,
          lastUsed: now,
          messageCount: (sessionData?.messageCount || 0) + 1,
        }
        await writeSessionData(subjectId, updated, sessionKey)
        onComplete(fullText, updated.sessionId)
      } else if (stderr) {
        onError(stderr.trim())
      } else {
        onError('Claude CLI 返回为空')
      }
      resolve()
    })

    child.on('error', (err) => {
      if (stallTimer) clearTimeout(stallTimer)
      if (hardTimer) clearTimeout(hardTimer)
      activeProcesses.delete(processKey)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        onError('Claude CLI 未安装。请先安装：npm install -g @anthropic-ai/claude-code')
      } else {
        onError(err.message)
      }
      resolve()
    })

    // Send message via stdin (prepend Chinese instruction)
    const fullMessage = `[系统指令：你必须始终使用中文回复，包括所有解释、分析、标题、注释等，不要使用英文。代码和技术术语可以保留原文。]\n\n${message}`
    child.stdin?.write(fullMessage)
    child.stdin?.end()
  })
}

// 停止正在进行的对话
export function stopMessage(subjectId: string, sessionKey?: string): boolean {
  const processKey = getProcessKey(subjectId, sessionKey)
  const child = activeProcesses.get(processKey)
  if (child) {
    child.kill('SIGTERM')
    activeProcesses.delete(processKey)
    return true
  }
  return false
}

// 清空会话
export async function clearSession(subjectId: string, sessionKey?: string): Promise<void> {
  const sessionDir = getSessionDir(subjectId, sessionKey)
  try {
    await fs.promises.rm(sessionDir, { recursive: true, force: true })
  } catch {
    // Ignore if doesn't exist
  }
}

// 列出所有会话
export async function listSessions(): Promise<SessionInfo[]> {
  const dir = getSessionsDir()
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const sessions: SessionInfo[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const data = await readSessionData(entry.name)
      if (data) {
        sessions.push({
          subjectId: entry.name,
          sessionId: data.sessionId,
          createdAt: data.createdAt,
          lastUsed: data.lastUsed,
          messageCount: data.messageCount,
        })
      }
    }

    return sessions
  } catch {
    return []
  }
}

// === Wiki 构建工作区 ===

interface SubjectRecord {
  id: string
  name: string
  wikiDir?: string
}

async function getWikiDirForSubject(subjectId: string): Promise<string | null> {
  const subjects = await readCollection<SubjectRecord>('subjects')
  const subject = subjects.find(s => s.id === subjectId)
  return subject?.wikiDir || null
}

// 准备 Wiki 构建工作区：写入材料 + 创建 wiki symlink
export async function prepareWikiWorkspace(
  subjectId: string,
  materials: { name: string; content: string }[],
): Promise<{ success: boolean; wikiDir?: string; error?: string }> {
  try {
    const workspace = await ensureWorkspace(subjectId)
    const wikiDir = await getWikiDirForSubject(subjectId)
    if (!wikiDir) {
      return { success: false, error: 'Wiki 目录未配置，请先在设置中配置' }
    }

    // 写入材料到 workspace/materials/
    const materialsDir = path.join(workspace, 'materials')
    await fs.promises.mkdir(materialsDir, { recursive: true })

    // 清理旧材料
    const oldFiles = await fs.promises.readdir(materialsDir).catch(() => [])
    for (const f of oldFiles) {
      await fs.promises.unlink(path.join(materialsDir, f)).catch(() => {})
    }

    for (const mat of materials) {
      const cleanName = mat.name.replace(/\.(pdf|docx?|txt|md)$/i, '')
      await fs.promises.writeFile(path.join(materialsDir, `${cleanName}.md`), mat.content, 'utf-8')
    }

    // 创建 wiki/ junction symlink
    const wikiLink = path.join(workspace, 'wiki')
    try {
      const stat = await fs.promises.lstat(wikiLink)
      if (stat.isSymbolicLink()) {
        const target = await fs.promises.readlink(wikiLink)
        if (target !== wikiDir) {
          await fs.promises.unlink(wikiLink)
          await fs.promises.symlink(wikiDir, wikiLink, 'junction')
        }
      } else if (stat.isDirectory()) {
        // 是真实目录，不替换
      }
    } catch {
      await fs.promises.symlink(wikiDir, wikiLink, 'junction')
    }

    console.log('[ClaudeSession] Wiki workspace prepared:', { materialsDir, wikiLink, wikiDir })
    return { success: true, wikiDir }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// 清理 Wiki 构建工作区
export async function cleanupWikiWorkspace(subjectId: string): Promise<void> {
  try {
    const workspace = getWorkspace(subjectId)

    // 删除 wiki symlink
    const wikiLink = path.join(workspace, 'wiki')
    try {
      const stat = await fs.promises.lstat(wikiLink)
      if (stat.isSymbolicLink()) {
        await fs.promises.unlink(wikiLink)
      }
    } catch {}

    // 删除 materials 目录
    const materialsDir = path.join(workspace, 'materials')
    try {
      await fs.promises.rm(materialsDir, { recursive: true, force: true })
    } catch {}
  } catch {}
}
