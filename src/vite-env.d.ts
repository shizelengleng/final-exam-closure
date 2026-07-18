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
  prepareBuildSession: (subjectId: string, materials: { name: string; content: string }[]) => Promise<{ success: boolean; wikiDir?: string; error?: string }>
  cleanupBuildSession: (subjectId: string) => Promise<void>
}

// === Orchestration types ===
interface OrchestrationSnapshot {
  id: string
  status: 'running' | 'paused_checkpoint' | 'completed' | 'failed'
  currentPhase: number
  currentPhaseName: string
  phaseProgress: { current: number; total: number; label: string } | null
  qualityCheckResult: { passed: boolean; issues: string[] } | null
  checkpointData: { checkpoint: number; [key: string]: unknown } | null
  elapsedMs: number
  error: string | null
  failedPhase: number | null
  intermediateResults: {
    knowledgePoints: unknown[] | null
    documentPlan: { title: string; overview: string; topics: { id: string; title: string; subtopics: string[]; exerciseStrategy: string; depthNotes: string }[]; formatPlan: string } | null
    styleAnchor: { topicId: string; content: string; structuralElements: string[]; wordCount: number } | null
    topicContents: { topicId: string; topicTitle: string; content: string; qualityPassed: boolean; qualityIssues: string[] }[]
    reviewIssues: { id: string; severity: string; topicId: string | null; description: string; suggestedFix: string }[]
  }
}

interface OrchestrationResult {
  title: string
  content: string
  orchestrationId: string
  phasesCompleted: number[]
  totalElapsedMs: number
}

interface StreamEvent {
  type: 'topic_start' | 'content_delta' | 'topic_complete' | 'error'
  topicId?: string
  topicTitle?: string
  delta?: string
  accumulated?: string
  content?: string
  qualityPassed?: boolean
  qualityIssues?: string[]
  message?: string
  index?: number
  total?: number
}

interface OrchestratorAPI {
  resume: (params: { orchestrationId: string; checkpoint: number; approved: boolean; userNotes?: string }) => Promise<void>
  cancel: (params: { orchestrationId: string }) => Promise<void>
  onProgress: (callback: (snapshot: OrchestrationSnapshot) => void) => void
  removeProgressListener: () => void
  onStreamEvent: (callback: (event: StreamEvent) => void) => void
  removeStreamListener: () => void
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
    generateDocument: (materials: { name: string; content: string }[], instruction: string, template: string, subjectName?: string) => Promise<{ title: string; content: string }>
    reviseDocument: (originalContent: string, userMessage: string, materials?: { name: string; content: string }[]) => Promise<string>
    orchestrateDocument: (materials: { name: string; content: string }[], instruction: string, template: string, subjectName?: string) => Promise<OrchestrationResult>
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
    ocrPdf: (filePath: string, engine?: 'tesseract' | 'baidu') => Promise<string | null>
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
  orchestrator: OrchestratorAPI
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
  context: {
    init: (subjectId: string) => Promise<void>
    read: (subjectId: string, filename: string) => Promise<string | null>
    write: (subjectId: string, filename: string, content: string) => Promise<void>
    list: (subjectId: string) => Promise<string[]>
    appendHistory: (subjectId: string, historyType: string, entry: { role: string; content: string; timestamp: string }) => Promise<void>
    readHistory: (subjectId: string, historyType: string, limit?: number) => Promise<{ role: string; content: string; timestamp: string }[]>
    clearHistory: (subjectId: string, historyType: string) => Promise<void>
  }
  claude: {
    getSession: (subjectId: string, sessionKey?: string) => Promise<{ subjectId: string; sessionId: string | null; createdAt: string; lastUsed: string; messageCount: number }>
    sendMessage: (subjectId: string, message: string, sessionKey?: string, timeout?: number) => Promise<void>
    clearSession: (subjectId: string, sessionKey?: string) => Promise<void>
    stopMessage: (subjectId: string, sessionKey?: string) => Promise<boolean>
    listSessions: () => Promise<{ subjectId: string; sessionId: string | null; createdAt: string; lastUsed: string; messageCount: number }[]>
    onDelta: (callback: (data: { subjectId: string; delta: string }) => void) => void
    onComplete: (callback: (data: { subjectId: string; fullText: string; sessionId: string | null }) => void) => void
    onError: (callback: (data: { subjectId: string; error: string }) => void) => void
    onToolUse: (callback: (data: { subjectId: string; toolName: string; toolInput: Record<string, unknown> }) => void) => void
    removeListeners: () => void
  }
  skill: {
    list: () => Promise<{ id: string; name: string; description: string; version: string; enabled: boolean; source: string }[]>
    toggle: (id: string, enabled: boolean) => Promise<void>
    add: (sourcePath: string) => Promise<{ id: string; name: string; description: string; version: string; enabled: boolean; source: string }>
    remove: (id: string) => Promise<void>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
  }
  ocr: {
    getConfig: () => Promise<{ apiKey: string; secretKey: string } | null>
    saveConfig: (config: { apiKey: string; secretKey: string }) => Promise<{ ok: boolean }>
    isConfigured: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
