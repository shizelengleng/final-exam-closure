import { ipcMain, dialog, BrowserWindow } from 'electron'
import { listPages, readPage, readAllPages, getSynthesis, getWikiDir } from '../services/wikiReader'
import { buildSourcePage, buildConceptsAndSynthesis, initWikiDir, lintWiki, saveQueryResult, deleteWikiPage } from '../services/wikiBuilder'
import { readCollection, writeCollection } from '../db/store'
import { prepareWikiWorkspace, cleanupWikiWorkspace } from '../services/claudeSessionManager'
import type { AIConfig } from '../services/aiClient'

interface AIConfigRecord {
  id: string
  provider: string
  apiKey: string
  baseUrl: string
}

interface SubjectRecord {
  id: string
  name: string
  wikiDir?: string
}

async function getAIConfig(): Promise<AIConfig> {
  const records = await readCollection<AIConfigRecord>('config')
  const saved = records.find(r => r.id === 'aiConfig')
  return saved
    ? { provider: saved.provider as AIConfig['provider'], apiKey: saved.apiKey, baseUrl: saved.baseUrl || '' }
    : { provider: 'deepseek', apiKey: '', baseUrl: '' }
}

async function updateSubjectWikiDir(subjectId: string, wikiDir: string): Promise<void> {
  const subjects = await readCollection<SubjectRecord>('subjects')
  const idx = subjects.findIndex(s => s.id === subjectId)
  if (idx >= 0) {
    subjects[idx].wikiDir = wikiDir
    await writeCollection('subjects', subjects)
  }
}

export function registerWikiHandlers() {
  ipcMain.handle('wiki:initDir', async (_event, subjectId: string, dirPath?: string) => {
    try {
      let wikiDir = dirPath
      if (!wikiDir) {
        const win = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(win!, {
          title: '选择 Wiki 存储目录',
          properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || !result.filePaths[0]) return { success: false, error: '用户取消选择' }
        wikiDir = result.filePaths[0]
      }

      const subjects = await readCollection<SubjectRecord>('subjects')
      const subject = subjects.find(s => s.id === subjectId)
      const subjectName = subject?.name || subjectId

      await initWikiDir(wikiDir!, subjectName)
      await updateSubjectWikiDir(subjectId, wikiDir!)

      return { success: true, wikiDir }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('wiki:getDir', async (_event, subjectId: string) => {
    return getWikiDir(subjectId)
  })

  ipcMain.handle('wiki:buildSource', async (_event, subjectId: string, materialName: string, materialContent: string) => {
    const wikiDir = await getWikiDir(subjectId)
    if (!wikiDir) return { success: false, error: 'Wiki 目录未配置' }

    const config = await getAIConfig()
    return buildSourcePage(config, subjectId, materialName, materialContent, wikiDir)
  })

  ipcMain.handle('wiki:buildWiki', async (_event, subjectId: string) => {
    const wikiDir = await getWikiDir(subjectId)
    if (!wikiDir) return { success: false, error: 'Wiki 目录未配置' }

    const config = await getAIConfig()
    return buildConceptsAndSynthesis(config, subjectId, wikiDir)
  })

  ipcMain.handle('wiki:listPages', async (_event, subjectId: string, type?: string) => {
    return listPages(subjectId, type)
  })

  ipcMain.handle('wiki:readPage', async (_event, subjectId: string, pageName: string) => {
    return readPage(subjectId, pageName)
  })

  ipcMain.handle('wiki:readAllPages', async (_event, subjectId: string, type?: string) => {
    return readAllPages(subjectId, type)
  })

  ipcMain.handle('wiki:getSynthesis', async (_event, subjectId: string) => {
    return getSynthesis(subjectId)
  })

  ipcMain.handle('wiki:lint', async (_event, subjectId: string) => {
    const wikiDir = await getWikiDir(subjectId)
    if (!wikiDir) return { issues: [], summary: 'Wiki 目录未配置' }
    return lintWiki(subjectId, wikiDir)
  })

  ipcMain.handle('wiki:saveQueryResult', async (_event, subjectId: string, title: string, content: string, sources?: string[]) => {
    const wikiDir = await getWikiDir(subjectId)
    if (!wikiDir) return { success: false, error: 'Wiki 目录未配置' }
    return saveQueryResult(subjectId, wikiDir, title, content, sources)
  })

  ipcMain.handle('wiki:deletePage', async (_event, subjectId: string, pageName: string, pageType: string) => {
    const wikiDir = await getWikiDir(subjectId)
    if (!wikiDir) return { success: false, error: 'Wiki 目录未配置' }
    return deleteWikiPage(subjectId, wikiDir, pageName, pageType)
  })

  // Claude 对话式 Wiki 构建
  ipcMain.handle('wiki:prepareBuildSession', async (_event, subjectId: string, materials: { name: string; content: string }[]) => {
    return prepareWikiWorkspace(subjectId, materials)
  })

  ipcMain.handle('wiki:cleanupBuildSession', async (_event, subjectId: string) => {
    return cleanupWikiWorkspace(subjectId)
  })
}
