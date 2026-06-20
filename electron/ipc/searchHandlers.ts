import { ipcMain } from 'electron'
import { SearchEngine, SearchSource } from '../services/searchEngine'
import { readCollection, writeCollection, appendItem, updateItem, deleteItem } from '../db/store'
import sourcesConfig from '../../config/searchSources.json'

let engine: SearchEngine | null = null

async function initSearchEngine() {
  let sources = await readCollection<SearchSource>('searchSources')
  if (sources.length === 0) {
    sources = sourcesConfig.sources as SearchSource[]
    await writeCollection('searchSources', sources)
  }
  engine = new SearchEngine(sources)
}

export async function reloadSearchEngine() {
  const sources = await readCollection<SearchSource>('searchSources')
  if (engine) {
    engine.reload(sources)
  } else {
    engine = new SearchEngine(sources)
  }
}

function getEngine(): SearchEngine {
  if (!engine) throw new Error('搜索引擎未初始化')
  return engine
}

export async function registerSearchHandlers() {
  await initSearchEngine()

  ipcMain.handle('search:query', async (_event, keyword: string, sourceIds?: string[]) => {
    return getEngine().search(keyword, sourceIds)
  })

  ipcMain.handle('search:getSources', () => {
    return getEngine().getSources()
  })

  ipcMain.handle('search:getAllSources', async () => {
    return readCollection<SearchSource>('searchSources')
  })

  ipcMain.handle('search:addSource', async (_event, source: Omit<SearchSource, 'id'>) => {
    const newSource: SearchSource = {
      ...source,
      id: `src_${Date.now()}`,
    }
    await appendItem('searchSources', newSource)
    await reloadSearchEngine()
    return newSource
  })

  ipcMain.handle('search:updateSource', async (_event, id: string, updates: Partial<SearchSource>) => {
    const updated = await updateItem<SearchSource>('searchSources', id, updates)
    await reloadSearchEngine()
    return updated
  })

  ipcMain.handle('search:deleteSource', async (_event, id: string) => {
    await deleteItem('searchSources', id)
    await reloadSearchEngine()
    return { success: true }
  })

  ipcMain.handle('search:toggleSource', async (_event, id: string) => {
    const sources = await readCollection<SearchSource>('searchSources')
    const source = sources.find((s) => s.id === id)
    if (source) {
      await updateItem<SearchSource>('searchSources', id, { enabled: !source.enabled } as Partial<SearchSource>)
      await reloadSearchEngine()
      return { ...source, enabled: !source.enabled }
    }
    return null
  })

  ipcMain.handle('search:fetchAsMarkdown', async (_event, url: string) => {
    return getEngine().fetchPageAsMarkdown(url)
  })
}
