import { useState, useMemo } from 'react'
import { Modal, Input, Select, message } from 'antd'
import { HomeOutlined, PlusOutlined, DeleteOutlined, EditOutlined, InboxOutlined } from '@ant-design/icons'
import { useTheme } from '../../contexts/ThemeContext'
import { UNCATEGORIZED_ID } from '../../App'
import { injectBuiltinKeywords } from '../../lib/classifier'

type SubjectTab = 'search' | 'materials' | 'chat' | 'quiz' | 'review' | 'graph' | 'analysis' | 'video' | 'article' | 'wiki'

interface SidebarProps {
  currentSubjectId: string | null
  subjects: Subject[]
  activeTab: SubjectTab | null
  onSelectOverview: () => void
  onSelectSubject: (id: string) => void
  onSelectTab: (tab: SubjectTab) => void
  onAddSubject: (name: string, color: string, year?: string, keywords?: string[]) => void
  onDeleteSubject: (id: string) => void
  onUpdateSubject?: (id: string, updates: Partial<Pick<Subject, 'name' | 'color' | 'year' | 'keywords'>>) => void
}

const PRESET_COLORS = ['#1677ff', '#52c41a', '#722ed1', '#faad14', '#f5222d', '#13c2c2', '#eb2f96', '#fa8c16']

const YEAR_OPTIONS = [
  { value: '大一', label: '大一' },
  { value: '大二', label: '大二' },
  { value: '大三', label: '大三' },
  { value: '大四', label: '大四' },
  { value: '研究生', label: '研究生' },
]

const Sidebar = ({
  currentSubjectId,
  subjects,
  onSelectOverview,
  onSelectSubject,
  onDeleteSubject,
  onAddSubject,
  onUpdateSubject,
}: SidebarProps) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newYear, setNewYear] = useState<string | undefined>(undefined)
  const [editSubject, setEditSubject] = useState<Subject | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PRESET_COLORS[0])
  const [editYear, setEditYear] = useState<string | undefined>(undefined)
  const [editKeywords, setEditKeywords] = useState<string[]>([])
  const [newKeywords, setNewKeywords] = useState<string[]>([])
  const [generatingKeywords, setGeneratingKeywords] = useState(false)
  const { theme } = useTheme()

  const generateKeywordsWithAI = async (subjectName: string): Promise<string[]> => {
    try {
      const config = await window.electron?.ai.getConfig()
      if (!config?.hasApiKey) {
        return injectBuiltinKeywords({ name: subjectName })
      }

      setGeneratingKeywords(true)
      const prompt = `你是一个学科分类助手。请为大学学科「${subjectName}」生成用于文件自动分类的关键词列表。

要求：
1. 生成 10-20 个该学科最核心的关键词
2. 包括：学科名称本身、常见缩写、核心概念、重要人物、关键事件
3. 关键词应该是文件名或文档内容中可能出现的词
4. 只返回关键词，用逗号分隔，不要任何解释

例如：
- 高等数学 → 高等数学,微积分,极限,导数,积分,级数,微分方程,泰勒,洛必达,矩阵,线性代数,概率论
- 中国近代史纲要 → 近代史,纲要,鸦片战争,辛亥革命,五四运动,抗日战争,解放战争,南昌起义,井冈山,不平等条约,孙中山`

      const response = await window.electron.ai.chat(prompt)
      // Parse keywords from response
      const keywords = response
        .split(/[,，、\n]/)
        .map((k: string) => k.trim().replace(/^["'""]|["'""]$/g, ''))
        .filter((k: string) => k.length > 0 && k.length < 20)

      if (keywords.length > 0) return keywords
      return injectBuiltinKeywords({ name: subjectName })
    } catch {
      return injectBuiltinKeywords({ name: subjectName })
    } finally {
      setGeneratingKeywords(false)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim()) {
      message.warning('请输入学科名称')
      return
    }
    let finalKeywords: string[]
    if (newKeywords.length > 0) {
      finalKeywords = newKeywords
    } else {
      finalKeywords = await generateKeywordsWithAI(newName.trim())
    }
    onAddSubject(newName.trim(), newColor, newYear, finalKeywords)
    setNewName('')
    setNewColor(PRESET_COLORS[0])
    setNewYear(undefined)
    setNewKeywords([])
    setShowAddModal(false)
  }

  const handleEdit = (subject: Subject) => {
    setEditSubject(subject)
    setEditName(subject.name)
    setEditColor(subject.color)
    setEditYear(subject.year)
    setEditKeywords(subject.keywords || [])
  }

  const handleEditSave = async () => {
    if (!editSubject || !editName.trim()) {
      message.warning('请输入学科名称')
      return
    }
    let finalKeywords: string[]
    if (editKeywords.length > 0) {
      finalKeywords = editKeywords
    } else {
      finalKeywords = await generateKeywordsWithAI(editName.trim())
    }
    onUpdateSubject?.(editSubject.id, {
      name: editName.trim(),
      color: editColor,
      year: editYear,
      keywords: finalKeywords,
    })
    setEditSubject(null)
  }

  const groupedSubjects = useMemo(() => {
    const groups: Record<string, Subject[]> = {}
    const ungrouped: Subject[] = []
    for (const s of subjects) {
      if (s.year) {
        if (!groups[s.year]) groups[s.year] = []
        groups[s.year].push(s)
      } else {
        ungrouped.push(s)
      }
    }
    const result: { label: string; items: Subject[] }[] = []
    const yearOrder = ['大一', '大二', '大三', '大四', '研究生']
    for (const y of yearOrder) {
      if (groups[y]) result.push({ label: y, items: groups[y] })
    }
    for (const [key, items] of Object.entries(groups)) {
      if (!yearOrder.includes(key)) result.push({ label: key, items })
    }
    if (ungrouped.length > 0) result.push({ label: '', items: ungrouped })
    return result
  }, [subjects])

  const isActive = (id: string | null) => currentSubjectId === id
  const activeBg = theme.id === 'dark' ? 'bg-gray-700' : 'bg-opacity-10'
  const activeText = `text-[${theme.colors.primary}]`

  return (
    <>
      <aside className="w-56 border-r flex flex-col flex-shrink-0" style={{ backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.border }}>
        <div className="p-4 border-b" style={{ borderColor: theme.colors.border }}>
          <h1 className="text-lg font-bold" style={{ color: theme.colors.primary }}>期末补完计划</h1>
          <p className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>AI 驱动的复习助手</p>
        </div>

        <nav className="flex-1 overflow-auto p-2">
          <button
            onClick={onSelectOverview}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: isActive(null) ? `${theme.colors.primary}15` : 'transparent',
              color: isActive(null) ? theme.colors.primary : theme.colors.text,
              fontWeight: isActive(null) ? 500 : 400,
            }}
          >
            <HomeOutlined className="text-lg" />
            总览
          </button>

          <div className="my-2 border-t" style={{ borderColor: theme.colors.border }} />

          <button
            onClick={() => onSelectSubject(UNCATEGORIZED_ID)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: isActive(UNCATEGORIZED_ID) ? `${theme.colors.primary}15` : 'transparent',
              color: isActive(UNCATEGORIZED_ID) ? theme.colors.primary : theme.colors.text,
              fontWeight: isActive(UNCATEGORIZED_ID) ? 500 : 400,
            }}
          >
            <InboxOutlined className="text-lg" />
            <span className="flex-1 text-left">未分类</span>
          </button>

          {groupedSubjects.map((group) => (
            <div key={group.label || '_ungrouped'}>
              {group.label && (
                <div className="text-xs px-4 py-1.5 uppercase tracking-wide font-medium" style={{ color: theme.colors.textSecondary }}>
                  {group.label}
                </div>
              )}
              {group.items.map((subject) => (
                <div key={subject.id} className="group relative">
                  <button
                    onClick={() => onSelectSubject(subject.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors"
                    style={{
                      backgroundColor: isActive(subject.id) ? `${theme.colors.primary}15` : 'transparent',
                      color: isActive(subject.id) ? theme.colors.primary : theme.colors.text,
                      fontWeight: isActive(subject.id) ? 500 : 400,
                    }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: subject.color }}
                    />
                    <span className="flex-1 text-left truncate">{subject.name}</span>
                  </button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-all">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(subject)
                      }}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 transition-all"
                    >
                      <EditOutlined className="text-xs" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        Modal.confirm({
                          title: `删除学科「${subject.name}」？`,
                          content: '该学科下的资料和记录将被保留，但不再归属任何学科。',
                          okText: '删除',
                          okButtonProps: { danger: true },
                          onOk: () => onDeleteSubject(subject.id),
                        })
                      }}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500 transition-all"
                    >
                      <DeleteOutlined className="text-xs" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors mt-1"
            style={{ color: theme.colors.textSecondary }}
          >
            <PlusOutlined className="text-lg" />
            添加学科
          </button>
        </nav>

        <div className="p-4 border-t" style={{ borderColor: theme.colors.border }}>
          <p className="text-xs" style={{ color: theme.colors.textSecondary }}>v0.1.0</p>
        </div>
      </aside>

      <Modal
        title="新建学科"
        open={showAddModal}
        onCancel={() => setShowAddModal(false)}
        onOk={handleAdd}
        okText={generatingKeywords ? 'AI 生成关键词中...' : '创建'}
        confirmLoading={generatingKeywords}
        cancelText="取消"
        destroyOnClose
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">学科名称</label>
            <Input
              placeholder="如：高等数学"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleAdd}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">学年（可选）</label>
            <Select
              placeholder="选择学年"
              value={newYear}
              onChange={setNewYear}
              allowClear
              className="w-full"
              options={YEAR_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    newColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关键词（用于自动分类）</label>
            <Select
              mode="tags"
              placeholder="输入关键词后回车，如：高等数学"
              value={newKeywords}
              onChange={setNewKeywords}
              className="w-full"
              tokenSeparators={[',', '，']}
            />
            <p className="text-xs text-gray-400 mt-1">文件名或内容包含这些关键词时会自动归类到此学科</p>
          </div>
        </div>
      </Modal>

      <Modal
        title="编辑学科"
        open={!!editSubject}
        onCancel={() => setEditSubject(null)}
        onOk={handleEditSave}
        okText={generatingKeywords ? 'AI 生成关键词中...' : '保存'}
        confirmLoading={generatingKeywords}
        cancelText="取消"
        destroyOnClose
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">学科名称</label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onPressEnter={handleEditSave}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">学年</label>
            <Select
              placeholder="选择学年"
              value={editYear}
              onChange={setEditYear}
              allowClear
              className="w-full"
              options={YEAR_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEditColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    editColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关键词（用于自动分类）</label>
            <Select
              mode="tags"
              placeholder="输入关键词后回车"
              value={editKeywords}
              onChange={setEditKeywords}
              className="w-full"
              tokenSeparators={[',', '，']}
            />
            <p className="text-xs text-gray-400 mt-1">文件名或内容包含这些关键词时会自动归类到此学科</p>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default Sidebar
