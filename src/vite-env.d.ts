/// <reference types="vite/client" />

interface Subject {
  id: string
  name: string
  color: string
  year?: string
  keywords?: string[]
  wikiDir?: string
}

interface SearchResult {
  id: string
  title: string
  source: string
  sourceId: string
  url: string
  type: string
  summary: string
  score: number
}

interface SearchSource {
  id: string
  name: string
  type: string
  searchUrl: string
  enabled: boolean
  priority: number
}

interface SubjectDocument {
  id: string
  subjectId: string
  title: string
  content: string
  template: string
  createdAt: string
}

interface WikiPage {
  name: string
  type: 'concept' | 'source' | 'synthesis'
  path: string
  subjectId: string
  created: string
  updated: string
}

interface WikiBuildStatus {
  subjectId: string
  phase: 'idle' | 'sources' | 'concepts' | 'synthesis' | 'done'
  progress: number
  message: string
}

interface WikiLintIssue {
  type: 'orphan' | 'missing_ref' | 'stale' | 'missing_page'
  page: string
  message: string
}

interface WikiAPI {
  initDir: (subjectId: string, dirPath?: string) => Promise<{ success: boolean; error?: string; wikiDir?: string }>
  getDir: (subjectId: string) => Promise<string | null>
  buildSource: (subjectId: string, materialName: string, materialContent: string) => Promise<{ success: boolean; error?: string }>
  buildWiki: (subjectId: string) => Promise<{ success: boolean; error?: string }>
  listPages: (subjectId: string, type?: string) => Promise<WikiPage[]>
  readPage: (subjectId: string, pageName: string) => Promise<string>
  readAllPages: (subjectId: string, type?: string) => Promise<string>
  getSynthesis: (subjectId: string) => Promise<string>
  lint: (subjectId: string) => Promise<{ issues: WikiLintIssue[]; summary: string }>
  saveQueryResult: (subjectId: string, title: string, content: string, sources?: string[]) => Promise<{ success: boolean; error?: string; path?: string }>
  deletePage: (subjectId: string, pageName: string, pageType: string) => Promise<{ success: boolean; error?: string }>
}

interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, callback: (...args: unknown[]) => void) => void
  }
  windowControls: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  ai: {
    setConfig: (config: { provider: string; apiKey: string; baseUrl?: string }) => Promise<{ success: boolean }>
    getConfig: () => Promise<{ provider: string; hasApiKey: boolean; baseUrl: string }>
    generateQuestions: (params: {
      content: string
      type: string
      difficulty: string
      count: number
    }) => Promise<{
      id: string
      content: string
      options: { value: string; label: string }[]
      answer: string
      explanation: string
      type: string
    }[]>
    chat: (message: string) => Promise<string>
    generateGraph: (subject: string) => Promise<{
      nodes: { id: string; name: string; description: string; category: string; difficulty: string }[]
      edges: { from: string; to: string; type: string; label: string }[]
    }>
    generateGraphFromContent: (content: string) => Promise<{
      nodes: { id: string; name: string; description: string; category: string; difficulty: string }[]
      edges: { from: string; to: string; type: string; label: string }[]
    }>
    categorizeMaterial: (name: string, content: string, categories: string[], imageBase64?: string) => Promise<string>
    selectMaterialsForGraph: (message: string, materials: { id: string; name: string; content: string }[]) => Promise<{
      materialIds: string[]
      instruction: string
    }>
    manageSources: (message: string) => Promise<{ action: string; source?: SearchSource; sourceId?: string; message: string }>
    generateDocument: (materials: { name: string; content: string }[], instruction: string, template: string) => Promise<{ title: string; content: string }>
    reviseDocument: (originalContent: string, userMessage: string, materials?: { name: string; content: string }[]) => Promise<string>
  }
  search: {
    query: (keyword: string, sourceIds?: string[]) => Promise<SearchResult[]>
    getSources: () => Promise<SearchSource[]>
    getAllSources: () => Promise<SearchSource[]>
    addSource: (source: { name: string; type: string; searchUrl: string; enabled: boolean; priority: number }) => Promise<SearchSource>
    updateSource: (id: string, updates: Partial<SearchSource>) => Promise<SearchSource | null>
    deleteSource: (id: string) => Promise<{ success: boolean }>
    toggleSource: (id: string) => Promise<SearchSource | null>
    fetchAsMarkdown: (url: string) => Promise<string>
  }
  db: {
    list: (collection: string) => Promise<unknown[]>
    get: (collection: string, id: string) => Promise<unknown>
    add: (collection: string, item: unknown) => Promise<unknown>
    update: (collection: string, id: string, updates: unknown) => Promise<unknown>
    delete: (collection: string, id: string) => Promise<boolean>
    write: (collection: string, data: unknown[]) => Promise<{ success: boolean }>
  }
  file: {
    readPdf: (buffer: number[]) => Promise<string>
    readDocx: (buffer: number[]) => Promise<string>
    saveFile: (content: string, defaultName: string) => Promise<{ path?: string; cancelled?: boolean }>
    saveUpload: (fileName: string, buffer: number[]) => Promise<{ path?: string }>
    readAsBase64: (filePath: string) => Promise<string | null>
    readDocxFormatted: (buffer: number[]) => Promise<string>
    exportPdf: (content: string, defaultName: string) => Promise<{ path?: string; cancelled?: boolean; error?: string }>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  wiki: WikiAPI
  terminal: {
    create: (options?: { cli?: string }) => void
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    destroy: () => void
    detectCli: () => Promise<string[]>
    onData: (callback: (data: string) => void) => void
    onExit: (callback: () => void) => void
    removeListener: (channel: string) => void
    // Global API
    getContext: () => Promise<{
      appName: string
      version: string
      userDataPath: string
      uploadsPath: string
      subjectsPath: string
      materialsPath: string
      skills: string[]
      dataSources: string[]
      capabilities: string[]
    }>
    listSubjects: () => Promise<Subject[]>
    listMaterials: (subjectId?: string) => Promise<Material[]>
    readMaterial: (id: string) => Promise<Material | null>
    aiChat: (message: string) => Promise<string>
    generateQuestions: (params: {
      content: string
      type: string
      difficulty: string
      count: number
    }) => Promise<any[]>
    search: (query: string) => Promise<any[]>
    getWrongQuestions: (subjectId?: string) => Promise<any[]>
    getQuizHistory: (subjectId?: string) => Promise<any[]>
    exportData: (type: string) => Promise<any>
    addConversation: (message: any) => Promise<{ success: boolean }>
    getConversations: (subjectId?: string) => Promise<any[]>
  }
  clipboard: {
    readText: () => string
    writeText: (text: string) => void
  }
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
