import { ipcMain, BrowserWindow, dialog } from 'electron'
import { generateQuestions, chat, generateGraph, generateGraphFromContent, categorizeMaterial, selectMaterialsForGraph, manageSources, generateDocument, reviseDocument, AIProvider, GenerateQuestionParams } from '../services/aiClient'
import { startOrchestration, resumeCheckpoint, cancelOrchestration, type OrchestrationInput } from '../services/documentOrchestrator'
import * as claudeSession from '../services/claudeSessionManager'
import * as skillMgr from '../services/skillManager'
import { SearchSource } from '../services/searchEngine'
import { readCollection, writeCollection, appendItem, updateItem, deleteItem } from '../db/store'
import { reloadSearchEngine } from './searchHandlers'

interface AIConfig {
  provider: AIProvider
  apiKey: string
  baseUrl: string
}

interface AIConfigRecord {
  id: string
  provider: AIProvider
  apiKey: string
  baseUrl: string
}

let currentConfig: AIConfig = { provider: 'deepseek', apiKey: '', baseUrl: '' }

async function loadConfig() {
  const records = await readCollection<AIConfigRecord>('config')
  const saved = records.find((r) => r.id === 'aiConfig')
  if (saved) {
    currentConfig = {
      provider: saved.provider,
      apiKey: saved.apiKey,
      baseUrl: saved.baseUrl || '',
    }
  }
}

async function saveConfig() {
  const records = await readCollection<AIConfigRecord>('config')
  const idx = records.findIndex((r) => r.id === 'aiConfig')
  const entry: AIConfigRecord = { id: 'aiConfig', ...currentConfig }
  if (idx >= 0) {
    records[idx] = entry
    await writeCollection('config', records)
  } else {
    await appendItem('config', entry)
  }
}

export async function registerAIHandlers() {
  await loadConfig()

  ipcMain.handle('ai:setConfig', (_event, config: { provider: string; apiKey: string; baseUrl?: string }) => {
    currentConfig = {
      provider: config.provider as AIProvider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || '',
    }
    saveConfig()
    return { success: true }
  })

  ipcMain.handle('ai:getConfig', () => {
    return {
      provider: currentConfig.provider,
      hasApiKey: !!currentConfig.apiKey,
      baseUrl: currentConfig.baseUrl,
    }
  })

  ipcMain.handle('ai:generateQuestions', async (_event, params: GenerateQuestionParams) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return generateQuestions(currentConfig, params)
  })

  ipcMain.handle('ai:chat', async (_event, message: string) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    console.log('[AI] chat called, provider:', currentConfig.provider, 'message length:', message.length)
    try {
      const result = await chat(currentConfig, message)
      console.log('[AI] chat result length:', result.length)
      return result
    } catch (err) {
      console.error('[AI] chat error:', err)
      throw err
    }
  })

  ipcMain.handle('ai:generateGraph', async (_event, subject: string) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return generateGraph(currentConfig, subject)
  })

  ipcMain.handle('ai:generateGraphFromContent', async (_event, content: string) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return generateGraphFromContent(currentConfig, content)
  })

  ipcMain.handle('ai:categorizeMaterial', async (_event, name: string, content: string, categories: string[], imageBase64?: string) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return categorizeMaterial(currentConfig, name, content, categories, imageBase64)
  })

  ipcMain.handle('ai:selectMaterialsForGraph', async (_event, message: string, materials: { id: string; name: string; content: string }[]) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return selectMaterialsForGraph(currentConfig, message, materials)
  })

  ipcMain.handle('ai:manageSources', async (_event, message: string) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')

    const currentSources = await readCollection<SearchSource>('searchSources')
    const result = await manageSources(currentConfig, message, currentSources)

    if (result.action === 'add' && result.source) {
      const maxPriority = currentSources.reduce((max, s) => Math.max(max, s.priority), 0)
      const newSource: SearchSource = {
        ...result.source,
        id: `src_${Date.now()}`,
        priority: result.source.priority || maxPriority + 1,
      }
      await appendItem('searchSources', newSource)
      await reloadSearchEngine()
    } else if (result.action === 'update' && result.sourceId && result.source) {
      await updateItem<SearchSource>('searchSources', result.sourceId, result.source)
      await reloadSearchEngine()
    } else if (result.action === 'delete' && result.sourceId) {
      await deleteItem('searchSources', result.sourceId)
      await reloadSearchEngine()
    } else if (result.action === 'toggle' && result.sourceId) {
      const sources = await readCollection<SearchSource>('searchSources')
      const source = sources.find((s) => s.id === result.sourceId)
      if (source) {
        await updateItem<SearchSource>('searchSources', result.sourceId, { enabled: !source.enabled } as Partial<SearchSource>)
        await reloadSearchEngine()
      }
    }

    return result
  })

  ipcMain.handle('ai:generateDocument', async (_event, materials: { name: string; content: string }[], instruction: string, template: string, subjectName?: string) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return generateDocument(currentConfig, materials, instruction, template, subjectName)
  })

  ipcMain.handle('ai:reviseDocument', async (_event, originalContent: string, userMessage: string, materials?: { name: string; content: string }[]) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return reviseDocument(currentConfig, originalContent, userMessage, materials)
  })

  // === Orchestration handlers ===
  ipcMain.handle('ai:orchestrateDocument', async (event, input: OrchestrationInput) => {
    if (currentConfig.provider !== 'claude-code' && !currentConfig.apiKey) throw new Error('请先在设置中配置 API Key')
    return startOrchestration(event.sender, input, currentConfig)
  })

  ipcMain.handle('orchestrator:resume', async (_event, params: { orchestrationId: string; checkpoint: number; approved: boolean; userNotes?: string }) => {
    return resumeCheckpoint(params.orchestrationId, params.checkpoint, params.approved, params.userNotes)
  })

  ipcMain.handle('orchestrator:cancel', async (_event, params: { orchestrationId: string }) => {
    return cancelOrchestration(params.orchestrationId)
  })

  // === Claude 持久会话 handlers ===
  ipcMain.handle('claude:getSession', async (_event, { subjectId, sessionKey }: { subjectId: string; sessionKey?: string }) => {
    return claudeSession.getOrCreateSession(subjectId, sessionKey)
  })

  ipcMain.handle('claude:sendMessage', async (event, { subjectId, message, sessionKey, timeout }: { subjectId: string; message: string; sessionKey?: string; timeout?: number }) => {
    return claudeSession.sendMessage(
      subjectId,
      message,
      (delta) => event.sender.send('claude:stream-delta', { subjectId, delta }),
      (fullText, sessionId) => event.sender.send('claude:stream-complete', { subjectId, fullText, sessionId }),
      (error) => event.sender.send('claude:stream-error', { subjectId, error }),
      (toolName, toolInput) => event.sender.send('claude:stream-tool', { subjectId, toolName, toolInput }),
      sessionKey,
      timeout,
    )
  })

  ipcMain.handle('claude:clearSession', async (_event, { subjectId, sessionKey }: { subjectId: string; sessionKey?: string }) => {
    return claudeSession.clearSession(subjectId, sessionKey)
  })

  ipcMain.handle('claude:stopMessage', async (_event, { subjectId, sessionKey }: { subjectId: string; sessionKey?: string }) => {
    return claudeSession.stopMessage(subjectId, sessionKey)
  })

  ipcMain.handle('claude:listSessions', async () => {
    return claudeSession.listSessions()
  })

  // === Skill 管理 handlers ===
  ipcMain.handle('skill:list', async () => {
    return skillMgr.listSkills()
  })

  ipcMain.handle('skill:toggle', async (_event, { id, enabled }: { id: string; enabled: boolean }) => {
    return skillMgr.toggleSkill(id, enabled)
  })

  ipcMain.handle('skill:add', async (_event, sourcePath: string) => {
    return skillMgr.addSkill(sourcePath)
  })

  ipcMain.handle('skill:remove', async (_event, id: string) => {
    return skillMgr.removeSkill(id)
  })

  // === Dialog handler ===
  ipcMain.handle('dialog:selectDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择 Skill 目录',
      properties: ['openDirectory'],
    })
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })
}
