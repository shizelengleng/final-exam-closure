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
    categorizeMaterial: (name: string, content: string, categories: string[]) =>
      ipcRenderer.invoke('ai:categorizeMaterial', name, content, categories),
    selectMaterialsForGraph: (message: string, materials: { id: string; name: string; content: string }[]) =>
      ipcRenderer.invoke('ai:selectMaterialsForGraph', message, materials),
    manageSources: (message: string) => ipcRenderer.invoke('ai:manageSources', message),
    generateDocument: (materials: { name: string; content: string }[], instruction: string, template: string) =>
      ipcRenderer.invoke('ai:generateDocument', materials, instruction, template),
    reviseDocument: (originalContent: string, userMessage: string) =>
      ipcRenderer.invoke('ai:reviseDocument', originalContent, userMessage),
  },
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
    readDocx: (buffer: number[]) => ipcRenderer.invoke('file:readDocx', buffer),
    saveFile: (content: string, defaultName: string) => ipcRenderer.invoke('file:saveFile', content, defaultName),
    getAsFile: (filePath: string) => ipcRenderer.invoke('file:getAsFile', filePath),
    saveUpload: (fileName: string, buffer: number[]) => ipcRenderer.invoke('file:saveUpload', fileName, buffer),
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
})
