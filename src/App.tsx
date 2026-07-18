import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Common/Sidebar'
import Header from './components/Common/Header'
import TerminalPanel from './components/Common/Terminal'
import TabBar from './components/Common/TabBar'
import SubjectOverview from './components/Overview/SubjectOverview'
import MaterialList from './components/Materials/MaterialList'
import WrongBook from './components/Review/WrongBook'
import KnowledgeGraph from './components/KnowledgeGraph/KnowledgeGraph'
import ClaudeChat from './components/Skills/ClaudeChat'

import WeakAnalysis from './components/Analysis/WeakAnalysis'
import SearchPanel from './components/Search/SearchPanel'
import WikiBrowser from './components/Wiki/WikiBrowser'
import { useTheme } from './contexts/ThemeContext'
import { injectBuiltinKeywords } from './lib/classifier'

type SubjectTab = 'search' | 'materials' | 'content' | 'graph' | 'review' | 'analysis' | 'wiki'

const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'math', name: '数学', color: '#1677ff', keywords: ['数学', '微积分', '线性代数', '概率', '统计', '极限', '导数', '积分', '矩阵', '方程', '函数', '几何', '代数', '三角'] },
  { id: 'cs', name: '计算机', color: '#52c41a', keywords: ['计算机', '编程', '算法', '数据结构', '操作系统', '网络', '数据库', 'Python', 'Java', 'C++', '软件', '程序', '代码', '开发'] },
  { id: 'physics', name: '物理', color: '#722ed1', keywords: ['物理', '力学', '电磁', '热学', '光学', '量子', '牛顿', '能量', '速度', '加速度', '力', '运动', '电', '磁'] },
  { id: 'english', name: '英语', color: '#faad14', keywords: ['英语', 'English', '语法', '阅读', '写作', '翻译', '词汇', '听力', '四级', '六级', '作文', '完形', '阅读理解'] },
]

export const UNCATEGORIZED_ID = '__uncategorized__'

const App = () => {
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SubjectTab>('materials')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalWidth, setTerminalWidth] = useState(480)
  const [refreshKey, setRefreshKey] = useState(0)
  const isResizing = useRef(false)
  const { theme } = useTheme()

  useEffect(() => {
    loadSubjects()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        setShowTerminal((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Listen for terminal refresh events
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshKey(k => k + 1)
      loadSubjects()
    }
    window.addEventListener('terminal:refresh', handleRefresh)
    return () => window.removeEventListener('terminal:refresh', handleRefresh)
  }, [])

  const loadSubjects = async () => {
    const data = await window.electron?.db.list('subjects')
    const list = (data as Subject[]) || []
    if (list.length === 0) {
      await window.electron?.db.write('subjects', DEFAULT_SUBJECTS)
      setSubjects(DEFAULT_SUBJECTS)
    } else {
      // Auto-inject keywords for subjects created before the dictionary was added
      const enriched = list.map((s) => {
        if (!s.keywords || s.keywords.length === 0) {
          const injected = injectBuiltinKeywords({ name: s.name })
          if (injected.length > 0) return { ...s, keywords: injected }
        }
        return s
      })
      setSubjects(enriched)
    }
  }

  const handleSelectOverview = useCallback(() => {
    setCurrentSubjectId(null)
  }, [])

  const handleSelectSubject = useCallback((id: string) => {
    setCurrentSubjectId(id)
    setActiveTab('materials')
  }, [])

  const handleAddSubject = useCallback(async (name: string, color: string, year?: string, keywords?: string[]) => {
    const newSubject: Subject = { id: `sub_${Date.now()}`, name, color, year, keywords }
    const updated = [...subjects, newSubject]
    await window.electron?.db.write('subjects', updated)
    setSubjects(updated)
  }, [subjects])

  const handleDeleteSubject = useCallback(async (id: string) => {
    const updated = subjects.filter((s) => s.id !== id)
    await window.electron?.db.write('subjects', updated)
    setSubjects(updated)
    if (currentSubjectId === id) setCurrentSubjectId(null)
  }, [subjects, currentSubjectId])

  const handleUpdateSubject = useCallback(async (id: string, updates: Partial<Pick<Subject, 'name' | 'color' | 'year' | 'keywords'>>) => {
    const updated = subjects.map((s) => s.id === id ? { ...s, ...updates } : s)
    await window.electron?.db.write('subjects', updated)
    setSubjects(updated)
  }, [subjects])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = terminalWidth

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const delta = startX - e.clientX
      const newWidth = Math.max(320, Math.min(800, startWidth + delta))
      setTerminalWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const currentSubject = currentSubjectId === UNCATEGORIZED_ID
    ? { id: UNCATEGORIZED_ID, name: '未分类', color: '#8c8c8c' }
    : subjects.find((s) => s.id === currentSubjectId) || null

  const renderContent = () => {
    if (!currentSubjectId) {
      return (
        <SubjectOverview
          subjects={subjects}
          onSelectSubject={handleSelectSubject}
          onAddSubject={handleAddSubject}
          onDeleteSubject={handleDeleteSubject}
        />
      )
    }

    switch (activeTab) {
      case 'search':
        return <SearchPanel subjectId={currentSubjectId} key={refreshKey} />
      case 'materials':
        return <MaterialList subjectId={currentSubjectId} key={refreshKey} />
      case 'content':
        return <ClaudeChat subjectId={currentSubjectId} subjectName={currentSubject?.name} key={refreshKey} />
      case 'review':
        return <WrongBook subjectId={currentSubjectId} key={refreshKey} />
      case 'graph':
        return <KnowledgeGraph subjectId={currentSubjectId} key={refreshKey} />
      case 'analysis':
        return <WeakAnalysis subjectId={currentSubjectId} key={refreshKey} />
      case 'wiki':
        return <WikiBrowser subjectId={currentSubjectId} key={refreshKey} />
      default:
        return <MaterialList subjectId={currentSubjectId} key={refreshKey} />
    }
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: theme.colors.bg }}>
      <Sidebar
        currentSubjectId={currentSubjectId}
        subjects={subjects}
        activeTab={currentSubjectId ? activeTab : null}
        onSelectOverview={handleSelectOverview}
        onSelectSubject={handleSelectSubject}
        onSelectTab={setActiveTab}
        onAddSubject={handleAddSubject}
        onDeleteSubject={handleDeleteSubject}
        onUpdateSubject={handleUpdateSubject}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentSubject={currentSubject}
          showTerminal={showTerminal}
          onToggleTerminal={() => setShowTerminal((prev) => !prev)}
        />
        {currentSubjectId && currentSubjectId !== UNCATEGORIZED_ID && (
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        )}
        <div className="flex-1 flex min-h-0">
          <main className="flex-1 overflow-auto min-h-0 pl-6">
            {renderContent()}
          </main>

          {/* Terminal - Right Side Panel */}
          {showTerminal && (
            <>
              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeStart}
                className="w-1 flex-shrink-0 cursor-col-resize bg-gray-700/30 hover:bg-blue-500/50 transition-colors"
              />
              <div
                style={{ width: terminalWidth }}
                className="flex-shrink-0 flex flex-col bg-[#0d1117] shadow-2xl min-w-[320px] max-w-[800px]"
              >
                <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-700/50 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    </div>
                    <span className="text-xs text-gray-400 ml-2 font-medium">终端</span>
                    <span className="text-[10px] text-gray-500">{terminalWidth}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTerminal(false)}
                      className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded-md hover:bg-gray-700/50 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TerminalPanel />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
