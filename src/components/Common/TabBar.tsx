import { useState, useRef, useEffect } from 'react'
import { DownOutlined } from '@ant-design/icons'
import { useTheme } from '../../contexts/ThemeContext'

type SubjectTab = 'search' | 'materials' | 'chat' | 'quiz' | 'review' | 'graph' | 'analysis' | 'video' | 'article' | 'wiki'

interface TabGroup {
  id: string
  label: string
  color: string
  tabs: { key: SubjectTab; label: string }[]
}

const TAB_GROUPS: TabGroup[] = [
  {
    id: 'materials',
    label: '资料管理',
    color: '#1677ff',
    tabs: [
      { key: 'materials', label: '我的资料' },
      { key: 'search', label: '搜集资料' },
    ],
  },
  {
    id: 'ai',
    label: 'AI 工具',
    color: '#722ed1',
    tabs: [
      { key: 'chat', label: 'AI 答疑' },
      { key: 'quiz', label: 'AI 出题' },
      { key: 'video', label: '视频制作' },
      { key: 'article', label: '漂亮文章' },
    ],
  },
  {
    id: 'analysis',
    label: '分析工具',
    color: '#52c41a',
    tabs: [
      { key: 'review', label: '错题本' },
      { key: 'graph', label: '知识图谱' },
      { key: 'analysis', label: '薄弱分析' },
    ],
  },
  {
    id: 'wiki',
    label: 'Wiki',
    color: '#eb2f96',
    tabs: [
      { key: 'wiki', label: '知识库浏览' },
    ],
  },
]

interface TabBarProps {
  activeTab: SubjectTab
  onTabChange: (tab: SubjectTab) => void
}

const TabBar = ({ activeTab, onTabChange }: TabBarProps) => {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroup(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentGroup = TAB_GROUPS.find(g => g.tabs.some(t => t.key === activeTab))

  return (
    <div ref={containerRef} className="relative border-b px-6 flex-shrink-0"
      style={{ backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.border }}>
      <div className="flex items-center gap-1">
        {TAB_GROUPS.map((group) => {
          const isActive = currentGroup?.id === group.id
          const isOpen = openGroup === group.id
          const activeTabItem = group.tabs.find(t => t.key === activeTab)

          return (
            <div key={group.id} className="relative">
              <button
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
                style={{
                  color: isActive ? group.color : theme.colors.textSecondary,
                  borderColor: isActive ? group.color : 'transparent',
                }}
              >
                {isActive && activeTabItem ? activeTabItem.label : group.label}
                <DownOutlined className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown overlay */}
              {isOpen && (
                <div className="absolute top-full left-0 z-[100] rounded-lg shadow-xl py-1 min-w-[140px]"
                  style={{ backgroundColor: theme.colors.bgCard, border: `1px solid ${theme.colors.border}` }}>
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => { onTabChange(tab.key); setOpenGroup(null) }}
                      className="w-full text-left px-4 py-2 text-sm"
                      style={{
                        backgroundColor: activeTab === tab.key ? `${group.color}15` : undefined,
                        color: activeTab === tab.key ? group.color : theme.colors.text,
                        fontWeight: activeTab === tab.key ? 500 : 400,
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TabBar
