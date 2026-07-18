import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface SkillInfo {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  source: 'builtin' | 'user'
}

const BUILTIN_SKILLS: Record<string, { src: string; name: string; description: string }> = {
  'exam-review': {
    src: path.join(app.getPath('home'), '.claude', 'skills', 'exam-review'),
    name: '期末复习',
    description: '基于学习资料生成期末复习文档、速查手册和题集',
  },
  'beautiful-article': {
    src: path.join(app.getPath('home'), '.claude', 'skills', 'beautiful-article'),
    name: '漂亮文章',
    description: '生成美观的 HTML 文章页面',
  },
  'wiki-builder': {
    src: path.join(app.getPath('home'), '.claude', 'skills', 'wiki-builder'),
    name: 'Wiki 构建',
    description: '从学习资料构建 Wiki 知识库，生成知识点、来源摘要和综合复习页',
  },
}

let skillsDir: string | null = null
let claudeDir: string | null = null

function getClaudeDir(): string {
  if (!claudeDir) {
    claudeDir = path.join(app.getPath('userData'), '.claude')
  }
  return claudeDir
}

function getSkillsDir(): string {
  if (!skillsDir) {
    skillsDir = path.join(getClaudeDir(), 'skills')
  }
  return skillsDir
}

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

async function readManifest(skillPath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.promises.readFile(path.join(skillPath, 'manifest.json'), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// 初始化：确保目录存在，复制内置 skill
export async function initSkillManager(): Promise<void> {
  const dir = getSkillsDir()
  await ensureDir(dir)

  // 安装内置 skill（如果源目录存在且目标不存在）
  for (const [id, config] of Object.entries(BUILTIN_SKILLS)) {
    const target = path.join(dir, id)
    if (await pathExists(target)) continue
    if (!(await pathExists(config.src))) continue

    try {
      await fs.promises.cp(config.src, target, { recursive: true })
      console.log(`[SkillManager] Installed builtin skill: ${id}`)
    } catch (err) {
      console.warn(`[SkillManager] Failed to install ${id}:`, err)
    }
  }

  // 确保 settings.json 存在
  const settingsPath = path.join(getClaudeDir(), 'settings.json')
  if (!(await pathExists(settingsPath))) {
    await fs.promises.writeFile(settingsPath, JSON.stringify({
      permissions: {
        allow: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        deny: [],
      },
    }, null, 2), 'utf-8')
  }
}

// 列出所有 skill
export async function listSkills(): Promise<SkillInfo[]> {
  const dir = getSkillsDir()
  if (!(await pathExists(dir))) return []

  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  const skills: SkillInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(dir, entry.name)
    const manifest = await readManifest(skillPath)
    const isBuiltin = Object.keys(BUILTIN_SKILLS).includes(entry.name)

    skills.push({
      id: entry.name,
      name: manifest.name || entry.name,
      description: manifest.description || '',
      version: manifest.version || '0.0.0',
      source: isBuiltin ? 'builtin' : 'user',
      enabled: true,
    })
  }

  return skills
}

// 启用/禁用 skill（重命名目录）
export async function toggleSkill(id: string, enabled: boolean): Promise<void> {
  const dir = getSkillsDir()
  const skillPath = path.join(dir, id)
  const disabledPath = path.join(dir, `${id}.disabled`)

  if (enabled) {
    if (await pathExists(disabledPath)) {
      await fs.promises.rename(disabledPath, skillPath)
    }
  } else {
    if (await pathExists(skillPath)) {
      await fs.promises.rename(skillPath, disabledPath)
    }
  }
}

// 添加用户自定义 skill
export async function addSkill(sourcePath: string): Promise<SkillInfo> {
  const dir = getSkillsDir()
  await ensureDir(dir)

  // 读取源目录的 manifest 获取 id
  const manifest = await readManifest(sourcePath)
  const id = manifest.name || path.basename(sourcePath)
  const target = path.join(dir, id)

  if (await pathExists(target)) {
    throw new Error(`Skill "${id}" 已存在`)
  }

  await fs.promises.cp(sourcePath, target, { recursive: true })

  return {
    id,
    name: manifest.name || id,
    description: manifest.description || '',
    version: manifest.version || '0.0.0',
    source: 'user',
    enabled: true,
  }
}

// 删除 skill
export async function removeSkill(id: string): Promise<void> {
  const dir = getSkillsDir()
  const skillPath = path.join(dir, id)
  const disabledPath = path.join(dir, `${id}.disabled`)

  if (await pathExists(skillPath)) {
    await fs.promises.rm(skillPath, { recursive: true })
  }
  if (await pathExists(disabledPath)) {
    await fs.promises.rm(disabledPath, { recursive: true })
  }
}
