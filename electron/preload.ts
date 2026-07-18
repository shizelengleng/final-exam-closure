import { contextBridge, ipcRenderer, clipboard } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    },
  },
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  ai: {
    setConfig: (config: { provider: string; apiKey: string; baseUrl?: string }) =>
      ipcRenderer.invoke('ai:setConfig', config),
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    generateQuestions: (params: unknown) =>
      ipcRenderer.invoke('ai:generateQuestions', params),
    chat: (message: string) => ipcRenderer.invoke('ai:chat', message),
    generateGraph: (subject: string) => ipcRenderer.invoke('ai:generateGraph', subject),
    generateGraphFromContent: (content: string) => ipcRenderer.invoke('ai:generateGraphFromContent', content),
    categorizeMaterial: (name: string, content: string, categories: string[], imageBase64?: string) =>
      ipcRenderer.invoke('ai:categorizeMaterial', name, content, categories, imageBase64),
    selectMaterialsForGraph: (message: string, materials: { id: string; name: string; content: string }[]) =>
      ipcRenderer.invoke('ai:selectMaterialsForGraph', message, materials),
    manageSources: (message: string) => ipcRenderer.invoke('ai:manageSources', message),
    generateDocument: (materials: { name: string; content: string }[], instruction: string, template: string, subjectName?: string) =>
      ipcRenderer.invoke('ai:generateDocument', materials, instruction, template, subjectName),
    reviseDocument: (originalContent: string, userMessage: string, materials?: { name: string; content: string }[]) =>
      ipcRenderer.invoke('ai:reviseDocument', originalContent, userMessage, materials),
    orchestrateDocument: (materials: { name: string; content: string }[], instruction: string, template: string, subjectName?: string) =>
      ipcRenderer.invoke('ai:orchestrateDocument', { materials, instruction, template, subjectName }),
  },
  orchestrator: (() => {
    const tracked = new Map<string, (...args: unknown[]) => void>()
    function track(channel: string, callback: (...args: unknown[]) => void) {
      const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      tracked.set(channel, wrapper)
      ipcRenderer.on(channel, wrapper)
    }
    return {
      resume: (params: { orchestrationId: string; checkpoint: number; approved: boolean; userNotes?: string }) =>
        ipcRenderer.invoke('orchestrator:resume', params),
      cancel: (params: { orchestrationId: string }) =>
        ipcRenderer.invoke('orchestrator:cancel', params),
      onProgress: (callback: (snapshot: unknown) => void) => {
        track('orchestrator:progress', callback as (...args: unknown[]) => void)
      },
      removeProgressListener: () => {
        const wrapper = tracked.get('orchestrator:progress')
        if (wrapper) {
          ipcRenderer.removeListener('orchestrator:progress', wrapper)
          tracked.delete('orchestrator:progress')
        }
      },
      onStreamEvent: (callback: (event: unknown) => void) => {
        track('orchestrator:stream-event', callback as (...args: unknown[]) => void)
      },
      removeStreamListener: () => {
        const wrapper = tracked.get('orchestrator:stream-event')
        if (wrapper) {
          ipcRenderer.removeListener('orchestrator:stream-event', wrapper)
          tracked.delete('orchestrator:stream-event')
        }
      },
    }
  })(),
  search: {
    query: (keyword: string, sourceIds?: string[]) =>
      ipcRenderer.invoke('search:query', keyword, sourceIds),
    getSources: () => ipcRenderer.invoke('search:getSources'),
    getAllSources: () => ipcRenderer.invoke('search:getAllSources'),
    addSource: (source: { name: string; type: string; searchUrl: string; enabled: boolean; priority: number }) =>
      ipcRenderer.invoke('search:addSource', source),
    updateSource: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('search:updateSource', id, updates),
    deleteSource: (id: string) => ipcRenderer.invoke('search:deleteSource', id),
    toggleSource: (id: string) => ipcRenderer.invoke('search:toggleSource', id),
    fetchAsMarkdown: (url: string) => ipcRenderer.invoke('search:fetchAsMarkdown', url),
  },
  db: {
    list: (collection: string) => ipcRenderer.invoke('db:list', collection),
    get: (collection: string, id: string) => ipcRenderer.invoke('db:get', collection, id),
    add: (collection: string, item: unknown) => ipcRenderer.invoke('db:add', collection, item),
    update: (collection: string, id: string, updates: unknown) =>
      ipcRenderer.invoke('db:update', collection, id, updates),
    delete: (collection: string, id: string) => ipcRenderer.invoke('db:delete', collection, id),
    write: (collection: string, data: unknown[]) => ipcRenderer.invoke('db:write', collection, data),
  },
  file: {
    readPdf: (buffer: number[]) => ipcRenderer.invoke('file:readPdf', buffer),
    ocrPdf: (filePath: string, engine?: 'tesseract' | 'baidu') => ipcRenderer.invoke('file:ocrPdf', filePath, engine),
    readDocx: (buffer: number[]) => ipcRenderer.invoke('file:readDocx', buffer),
    saveFile: (content: string, defaultName: string) => ipcRenderer.invoke('file:saveFile', content, defaultName),
    getAsFile: (filePath: string) => ipcRenderer.invoke('file:getAsFile', filePath),
    readAsBase64: (filePath: string) => ipcRenderer.invoke('file:readAsBase64', filePath),
    saveUpload: (fileName: string, buffer: number[]) => ipcRenderer.invoke('file:saveUpload', fileName, buffer),
    readDocxFormatted: (buffer: number[]) => ipcRenderer.invoke('file:readDocxFormatted', buffer),
    exportPdf: (content: string, defaultName: string) => ipcRenderer.invoke('file:exportPdf', content, defaultName),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  wiki: {
    initDir: (subjectId: string, dirPath?: string) => ipcRenderer.invoke('wiki:initDir', subjectId, dirPath),
    getDir: (subjectId: string) => ipcRenderer.invoke('wiki:getDir', subjectId),
    buildSource: (subjectId: string, materialName: string, materialContent: string) => ipcRenderer.invoke('wiki:buildSource', subjectId, materialName, materialContent),
    buildWiki: (subjectId: string) => ipcRenderer.invoke('wiki:buildWiki', subjectId),
    listPages: (subjectId: string, type?: string) => ipcRenderer.invoke('wiki:listPages', subjectId, type),
    readPage: (subjectId: string, pageName: string) => ipcRenderer.invoke('wiki:readPage', subjectId, pageName),
    readAllPages: (subjectId: string, type?: string) => ipcRenderer.invoke('wiki:readAllPages', subjectId, type),
    getSynthesis: (subjectId: string) => ipcRenderer.invoke('wiki:getSynthesis', subjectId),
    lint: (subjectId: string) => ipcRenderer.invoke('wiki:lint', subjectId),
    saveQueryResult: (subjectId: string, title: string, content: string, sources?: string[]) => ipcRenderer.invoke('wiki:saveQueryResult', subjectId, title, content, sources),
    deletePage: (subjectId: string, pageName: string, pageType: string) => ipcRenderer.invoke('wiki:deletePage', subjectId, pageName, pageType),
    prepareBuildSession: (subjectId: string, materials: { name: string; content: string }[]) =>
      ipcRenderer.invoke('wiki:prepareBuildSession', subjectId, materials),
    cleanupBuildSession: (subjectId: string) =>
      ipcRenderer.invoke('wiki:cleanupBuildSession', subjectId),
  },
  terminal: {
    create: (options?: { cli?: string }) => ipcRenderer.send('terminal:create', options),
    write: (data: string) => ipcRenderer.send('terminal:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
    destroy: () => ipcRenderer.send('terminal:destroy'),
    detectCli: () => ipcRenderer.invoke('terminal:detectCli'),
    onData: (callback: (data: string) => void) => {
      ipcRenderer.on('terminal:data', (_event, data) => callback(data))
    },
    onExit: (callback: () => void) => {
      ipcRenderer.on('terminal:exit', () => callback())
    },
    removeListener: (channel: string) => {
      ipcRenderer.removeAllListeners(channel)
    },
    // Global API
    getContext: () => ipcRenderer.invoke('terminal:getContext'),
    listSubjects: () => ipcRenderer.invoke('terminal:listSubjects'),
    listMaterials: (subjectId?: string) => ipcRenderer.invoke('terminal:listMaterials', subjectId),
    readMaterial: (id: string) => ipcRenderer.invoke('terminal:readMaterial', id),
    aiChat: (message: string) => ipcRenderer.invoke('terminal:aiChat', message),
    generateQuestions: (params: unknown) => ipcRenderer.invoke('terminal:generateQuestions', params),
    search: (query: string) => ipcRenderer.invoke('terminal:search', query),
    getWrongQuestions: (subjectId?: string) => ipcRenderer.invoke('terminal:getWrongQuestions', subjectId),
    getQuizHistory: (subjectId?: string) => ipcRenderer.invoke('terminal:getQuizHistory', subjectId),
    exportData: (type: string) => ipcRenderer.invoke('terminal:exportData', type),
    addConversation: (message: unknown) => ipcRenderer.invoke('terminal:addConversation', message),
    getConversations: (subjectId?: string) => ipcRenderer.invoke('terminal:getConversations', subjectId),
  },
  clipboard: {
    readText: () => clipboard.readText(),
    writeText: (text: string) => clipboard.writeText(text),
  },
  context: {
    init: (subjectId: string) => ipcRenderer.invoke('context:init', subjectId),
    read: (subjectId: string, filename: string) => ipcRenderer.invoke('context:read', subjectId, filename),
    write: (subjectId: string, filename: string, content: string) => ipcRenderer.invoke('context:write', subjectId, filename, content),
    list: (subjectId: string) => ipcRenderer.invoke('context:list', subjectId),
    appendHistory: (subjectId: string, historyType: string, entry: { role: string; content: string; timestamp: string }) =>
      ipcRenderer.invoke('context:appendHistory', subjectId, historyType, entry),
    readHistory: (subjectId: string, historyType: string, limit?: number) =>
      ipcRenderer.invoke('context:readHistory', subjectId, historyType, limit),
    clearHistory: (subjectId: string, historyType: string) =>
      ipcRenderer.invoke('context:clearHistory', subjectId, historyType),
  },
  claude: (() => {
    const tracked = new Map<string, (...args: unknown[]) => void>()
    function track(channel: string, callback: (...args: unknown[]) => void) {
      const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      tracked.set(channel, wrapper)
      ipcRenderer.on(channel, wrapper)
    }
    return {
      getSession: (subjectId: string, sessionKey?: string) => ipcRenderer.invoke('claude:getSession', { subjectId, sessionKey }),
      sendMessage: (subjectId: string, message: string, sessionKey?: string, timeout?: number) => ipcRenderer.invoke('claude:sendMessage', { subjectId, message, sessionKey, timeout }),
      clearSession: (subjectId: string, sessionKey?: string) => ipcRenderer.invoke('claude:clearSession', { subjectId, sessionKey }),
      stopMessage: (subjectId: string, sessionKey?: string) => ipcRenderer.invoke('claude:stopMessage', { subjectId, sessionKey }),
      listSessions: () => ipcRenderer.invoke('claude:listSessions'),
      onDelta: (callback: (data: { subjectId: string; delta: string }) => void) => {
        track('claude:stream-delta', callback as (...args: unknown[]) => void)
      },
      onComplete: (callback: (data: { subjectId: string; fullText: string; sessionId: string | null }) => void) => {
        track('claude:stream-complete', callback as (...args: unknown[]) => void)
      },
      onError: (callback: (data: { subjectId: string; error: string }) => void) => {
        track('claude:stream-error', callback as (...args: unknown[]) => void)
      },
      onToolUse: (callback: (data: { subjectId: string; toolName: string; toolInput: Record<string, unknown> }) => void) => {
        track('claude:stream-tool', callback as (...args: unknown[]) => void)
      },
      removeListeners: () => {
        for (const [channel, wrapper] of tracked) {
          ipcRenderer.removeListener(channel, wrapper)
        }
        tracked.clear()
      },
    }
  })(),
  skill: {
    list: () => ipcRenderer.invoke('skill:list'),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('skill:toggle', { id, enabled }),
    add: (sourcePath: string) => ipcRenderer.invoke('skill:add', sourcePath),
    remove: (id: string) => ipcRenderer.invoke('skill:remove', id),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  ocr: {
    getConfig: () => ipcRenderer.invoke('ocr:getConfig'),
    saveConfig: (config: { apiKey: string; secretKey: string }) => ipcRenderer.invoke('ocr:saveConfig', config),
    isConfigured: () => ipcRenderer.invoke('ocr:isConfigured'),
  },
})
