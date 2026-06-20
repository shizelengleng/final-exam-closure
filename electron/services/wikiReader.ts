import fs from 'fs'
import path from 'path'
import { readCollection } from '../db/store'

interface SubjectRecord {
  id: string
  name: string
  wikiDir?: string
}

async function getSubjectWikiDir(subjectId: string): Promise<string | null> {
  const subjects = await readCollection<SubjectRecord>('subjects')
  const subject = subjects.find(s => s.id === subjectId)
  return subject?.wikiDir || null
}

async function getSubjectName(subjectId: string): Promise<string> {
  const subjects = await readCollection<SubjectRecord>('subjects')
  const subject = subjects.find(s => s.id === subjectId)
  return subject?.name || subjectId
}

function getSubjectDirs(wikiDir: string, subjectName: string) {
  const subjectDir = path.join(wikiDir, subjectName)
  return {
    subjectDir,
    conceptsDir: path.join(subjectDir, 'concepts'),
    sourcesDir: path.join(subjectDir, 'sources'),
    synthesisDir: path.join(subjectDir, 'synthesis'),
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

async function readMdFile(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export async function listPages(subjectId: string, type?: string): Promise<WikiPage[]> {
  const wikiDir = await getSubjectWikiDir(subjectId)
  if (!wikiDir) return []

  const subjectName = await getSubjectName(subjectId)
  const { conceptsDir, sourcesDir, synthesisDir } = getSubjectDirs(wikiDir, subjectName)
  const pages: WikiPage[] = []

  const dirs: Array<{ dir: string; type: 'concept' | 'source' | 'synthesis' }> = [
    { dir: conceptsDir, type: 'concept' },
    { dir: sourcesDir, type: 'source' },
    { dir: synthesisDir, type: 'synthesis' },
  ]

  for (const { dir, type: pageType } of dirs) {
    if (type && type !== pageType) continue
    const files = await listMdFiles(dir)
    for (const name of files) {
      const filePath = path.join(dir, `${name}.md`)
      const stat = await fs.promises.stat(filePath)
      pages.push({
        name,
        type: pageType,
        path: filePath,
        subjectId,
        created: stat.birthtime.toISOString(),
        updated: stat.mtime.toISOString(),
      })
    }
  }

  return pages
}

export async function readPage(subjectId: string, pageName: string): Promise<string> {
  const wikiDir = await getSubjectWikiDir(subjectId)
  if (!wikiDir) return ''

  const subjectName = await getSubjectName(subjectId)
  const { conceptsDir, sourcesDir, synthesisDir } = getSubjectDirs(wikiDir, subjectName)

  for (const dir of [conceptsDir, sourcesDir, synthesisDir]) {
    const filePath = path.join(dir, `${pageName}.md`)
    try {
      await fs.promises.access(filePath)
      return await readMdFile(filePath)
    } catch {
      continue
    }
  }
  return ''
}

export async function readAllPages(subjectId: string, type?: string): Promise<string> {
  const pages = await listPages(subjectId, type)
  const contents = await Promise.all(pages.map(p => readMdFile(p.path)))
  return contents.filter(Boolean).join('\n\n---\n\n')
}

export async function getSynthesis(subjectId: string): Promise<string> {
  return readAllPages(subjectId, 'synthesis')
}

export async function getWikiDir(subjectId: string): Promise<string | null> {
  return getSubjectWikiDir(subjectId)
}
