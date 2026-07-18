import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Spin, Tag, Tooltip, Modal, Switch, Checkbox, Empty, message } from 'antd'
import {
  SendOutlined, UserOutlined, RobotOutlined, DeleteOutlined, PauseOutlined,
  FileTextOutlined, ExperimentOutlined, ReadOutlined, FileSearchOutlined,
  GlobalOutlined, DownOutlined, BookOutlined, ThunderboltOutlined,
  FilePdfOutlined, FileWordOutlined, FileImageOutlined, SearchOutlined,
  CodeOutlined, EditOutlined, FolderOpenOutlined, EyeOutlined,
} from '@ant-design/icons'
import { marked } from 'marked'
import { useTheme } from '../../contexts/ThemeContext'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

interface ClaudeChatProps {
  subjectId: string
  subjectName?: string
}

interface Material {
  id: string
  name: string
  type: string
  size: string
  content: string
  tag?: string
  addedAt: string
}

interface TemplateOption {
  id: string
  label: string
  desc: string
  icon: React.ReactNode
  color: string
  prompt: string
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'review_doc',
    label: '复习文档',
    desc: '逐章生成知识点详解 + 速查手册 + 题集，覆盖全部考点',
    icon: <FileTextOutlined />,
    color: '#1677ff',
    prompt: '请根据我选择的学习资料，生成期末复习文档。要求：逐章整理知识点详解（每个知识点≥300字）、速查手册（必背概念、核心考点、易混淆对比）、每章练习题集（含选择题、填空题、简答题等，每章≥40题），所有内容忠实于原始资料。',
  },
  {
    id: 'quick_ref',
    label: '速查手册',
    desc: '精简的核心公式、关键概念，考前快速翻阅',
    icon: <FileSearchOutlined />,
    color: '#52c41a',
    prompt: '请根据我选择的资料，生成一份精简的速查手册。要求：只保留必背概念定义、核心公式定理、高频考点速记口诀、易混淆知识点对比表格，适合考前30分钟快速翻阅。',
  },
  {
    id: 'practice_set',
    label: '练习题集',
    desc: '9种题型全覆盖，含答案与详细解析',
    icon: <ExperimentOutlined />,
    color: '#faad14',
    prompt: '请根据我选择的资料生成一套练习题集。要求：包含单选题、多选题、判断题、填空题、名词解释、简答题、论述题、材料分析题、综合运用题共9种题型，每题附带答案和详细解析（解释为什么对/为什么错），选择题干扰项必须是常见错误理解。',
  },
  {
    id: 'beautiful_article',
    label: '知识文章',
    desc: '精美的单页 HTML 文章，可离线分享',
    icon: <ReadOutlined />,
    color: '#722ed1',
    prompt: '请把我的学习资料编辑成一篇精美的单文件 HTML 网页文章。要求：保留100%信息，响应式设计，知识点可折叠展开，支持暗色模式，视觉排版清晰美观，适合分享和离线阅读。',
  },
]

const TOOL_ICONS: Record<string, React.ReactNode> = {
  'Read': <EyeOutlined />,
  'Write': <EditOutlined />,
  'Edit': <EditOutlined />,
  'Bash': <CodeOutlined />,
  'Glob': <SearchOutlined />,
  'Grep': <SearchOutlined />,
  'WebFetch': <GlobalOutlined />,
  'WebSearch': <GlobalOutlined />,
}

const TOOL_LABELS: Record<string, string> = {
  'Read': '读取文件',
  'Write': '写入文件',
  'Edit': '编辑文件',
  'Bash': '执行命令',
  'Glob': '搜索文件',
  'Grep': '搜索内容',
  'WebFetch': '获取网页',
  'WebSearch': '网络搜索',
}

function getToolSummary(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
      return String(toolInput.file_path || toolInput.path || '')
    case 'Write':
      return String(toolInput.file_path || toolInput.path || '')
    case 'Edit':
      return String(toolInput.file_path || toolInput.path || '')
    case 'Bash':
      return String(toolInput.command || '').slice(0, 80)
    case 'Glob':
      return String(toolInput.pattern || '')
    case 'Grep':
      return String(toolInput.pattern || '')
    case 'WebFetch':
      return String(toolInput.url || '').slice(0, 60)
    case 'WebSearch':
      return String(toolInput.query || '')
    default:
      return JSON.stringify(toolInput).slice(0, 60)
  }
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'pdf': return <FilePdfOutlined className="text-red-500" />
    case 'docx': return <FileWordOutlined className="text-blue-500" />
    case 'image': return <FileImageOutlined className="text-green-500" />
    default: return <FileTextOutlined className="text-gray-500" />
  }
}

const ClaudeChat = ({ subjectId, subjectName }: ClaudeChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentTool, setCurrentTool] = useState<{ name: string; input: Record<string, unknown> } | null>(null)
  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string | null
    messageCount: number
    createdAt: string
  } | null>(null)

  // Creation card state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('review_doc')
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [enableWebSearch, setEnableWebSearch] = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')
  const [showMaterialPicker, setShowMaterialPicker] = useState(false)
  const [materialSearch, setMaterialSearch] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { theme } = useTheme()

  const isDark = theme.colors.bg === '#141414' || theme.colors.bg === '#1a1a1a' || theme.colors.bg === '#000000'

  useEffect(() => {
    loadSession()
    loadMaterials()
    return () => {
      window.electron?.claude.removeListeners()
    }
  }, [subjectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const loadSession = async () => {
    const session = await window.electron?.claude.getSession(subjectId)
    if (session) {
      setSessionInfo({
        sessionId: session.sessionId,
        messageCount: session.messageCount,
        createdAt: session.createdAt,
      })
    }
  }

  const loadMaterials = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    setMaterials(all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId))
  }

  const buildPrompt = useCallback(() => {
    const template = TEMPLATES.find(t => t.id === selectedTemplate)
    const selectedMats = materials.filter(m => selectedMaterialIds.includes(m.id))

    let prompt = ''

    if (template) {
      prompt += template.prompt + '\n\n'
    }

    if (selectedMats.length > 0) {
      prompt += '以下是选择的学习资料：\n\n'
      for (const mat of selectedMats) {
        prompt += `### ${mat.name}\n${mat.content}\n\n`
      }
    }

    if (enableWebSearch) {
      prompt += '如果资料内容不足以覆盖主题，请搜索补充相关的网络内容作为参考。\n\n'
    }

    if (customInstruction.trim()) {
      prompt += `用户的额外要求：${customInstruction.trim()}\n`
    }

    return prompt
  }, [selectedTemplate, materials, selectedMaterialIds, enableWebSearch, customInstruction])

  const handleSend = useCallback(async (text?: string) => {
    const prompt = text || buildPrompt()
    if (!prompt.trim() || loading) return

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text ? text : `[${TEMPLATES.find(t => t.id === selectedTemplate)?.label || '自定义'}] ${customInstruction.trim() || '按默认要求生成'}`,
      timestamp: new Date().toLocaleTimeString('zh-CN'),
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setLoading(true)
    setStreamingContent('')

    let fullText = ''

    window.electron?.claude.onDelta((data: { subjectId: string; delta: string }) => {
      if (data.subjectId !== subjectId) return
      fullText += data.delta
      setStreamingContent(fullText)
    })

    window.electron?.claude.onToolUse((data: { subjectId: string; toolName: string; toolInput: Record<string, unknown> }) => {
      if (data.subjectId !== subjectId) return
      setCurrentTool({ name: data.toolName, input: data.toolInput })
    })

    window.electron?.claude.onComplete((data: { subjectId: string; fullText: string; sessionId: string | null }) => {
      if (data.subjectId !== subjectId) return
      if (data.fullText) {
        const assistantMsg: ChatMessage = {
          id: `asst_${Date.now()}`,
          role: 'assistant',
          content: data.fullText,
          timestamp: new Date().toLocaleTimeString('zh-CN'),
        }
        setMessages(prev => [...prev, assistantMsg])
      }
      setStreamingContent('')
      setCurrentTool(null)
      setLoading(false)
      setSessionInfo(prev => ({
        sessionId: data.sessionId || prev?.sessionId || null,
        messageCount: (prev?.messageCount || 0) + 1,
        createdAt: prev?.createdAt || new Date().toISOString(),
      }))
      window.electron?.claude.removeListeners()
    })

    window.electron?.claude.onError((data: { subjectId: string; error: string }) => {
      if (data.subjectId !== subjectId) return
      message.error(data.error)
      setStreamingContent('')
      setCurrentTool(null)
      setLoading(false)
      window.electron?.claude.removeListeners()
    })

    await window.electron?.claude.sendMessage(subjectId, prompt)
  }, [buildPrompt, loading, subjectId, selectedTemplate, customInstruction])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (messages.length === 0) {
        handleSend()
      } else {
        handleSend(inputValue.trim() || undefined)
      }
    }
  }

  const handleChatSend = () => {
    if (messages.length === 0) {
      handleSend()
    } else {
      handleSend(inputValue.trim() || undefined)
    }
  }

  const handleClear = () => {
    Modal.confirm({
      title: '清空会话',
      content: '确定要清空当前学科的对话记录吗？',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electron?.claude.clearSession(subjectId)
        setMessages([])
        setSessionInfo(null)
        setStreamingContent('')
        message.success('会话已清空')
      },
    })
  }

  const handleStop = async () => {
    await window.electron?.claude.stopMessage(subjectId)
    if (streamingContent) {
      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: streamingContent + '\n\n*[已中断]*',
        timestamp: new Date().toLocaleTimeString('zh-CN'),
      }
      setMessages(prev => [...prev, assistantMsg])
    }
    setStreamingContent('')
    setCurrentTool(null)
    setLoading(false)
    window.electron?.claude.removeListeners()
  }

  const renderMarkdown = (content: string) => {
    try {
      return { __html: marked.parse(content, { breaks: true }) as string }
    } catch {
      return { __html: content }
    }
  }

  const selectedMats = materials.filter(m => selectedMaterialIds.includes(m.id))
  const filteredMaterials = materialSearch
    ? materials.filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : materials

  const tagGroups = new Map<string, Material[]>()
  for (const mat of filteredMaterials) {
    const tag = mat.tag || '未分类'
    if (!tagGroups.has(tag)) tagGroups.set(tag, [])
    tagGroups.get(tag)!.push(mat)
  }

  const template = TEMPLATES.find(t => t.id === selectedTemplate)

  // === Render a single message ===
  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === 'tool') {
      return (
        <div key={msg.id} className="flex gap-3 justify-start">
          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <span className="text-xs" style={{ color: theme.colors.textSecondary }}>
              {TOOL_ICONS[msg.toolName || ''] || <CodeOutlined />}
            </span>
          </div>
          <div className="rounded-lg px-3 py-2 flex items-center gap-2 text-xs"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${theme.colors.border}` }}>
            <Tag color="default" className="!text-[10px] !m-0 !leading-tight !px-1.5 !py-0">
              {TOOL_LABELS[msg.toolName || ''] || msg.toolName}
            </Tag>
            <span className="font-mono truncate max-w-[300px]" style={{ color: theme.colors.textSecondary }}>
              {getToolSummary(msg.toolName || '', msg.toolInput || {})}
            </span>
          </div>
        </div>
      )
    }

    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="flex gap-3 justify-end">
          <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
            <div className="text-xs mt-2 text-blue-200">{msg.timestamp}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-gray-300 flex items-center justify-center flex-shrink-0">
            <UserOutlined className="text-white text-sm" />
          </div>
        </div>
      )
    }

    // assistant
    return (
      <div key={msg.id} className="flex gap-3 justify-start">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <RobotOutlined className="text-white text-sm" />
        </div>
        <div className="max-w-[80%] rounded-2xl px-4 py-3"
          style={{ backgroundColor: theme.colors.bgCard, color: theme.colors.text, border: `1px solid ${theme.colors.border}` }}>
          <div className="prose prose-sm max-w-none prose-pre:bg-gray-800 prose-pre:text-gray-100"
            dangerouslySetInnerHTML={renderMarkdown(msg.content)} />
          <div className="text-xs mt-2" style={{ color: theme.colors.textSecondary }}>{msg.timestamp}</div>
        </div>
      </div>
    )
  }

  // === Creation Card (no messages yet) ===
  if (messages.length === 0 && !loading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: theme.colors.bg }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <RobotOutlined className="text-white text-base" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base" style={{ color: theme.colors.text }}>AI 创作</span>
                {subjectName && <Tag color="blue">{subjectName}</Tag>}
              </div>
              <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
                选择模板与资料，通过对话生成高质量内容
              </p>
            </div>
          </div>
          {sessionInfo && sessionInfo.messageCount > 0 && (
            <span className="text-xs" style={{ color: theme.colors.textSecondary }}>
              历史 {sessionInfo.messageCount} 条
            </span>
          )}
        </div>

        {/* Creation Card */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

            {/* Template Selection */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: theme.colors.text }}>
                <ThunderboltOutlined className="text-amber-500" />
                选择生成模板
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {TEMPLATES.map((t) => {
                  const isSelected = selectedTemplate === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className="relative p-4 rounded-xl text-left transition-all duration-200"
                      style={{
                        backgroundColor: isSelected ? `${t.color}08` : theme.colors.bgCard,
                        border: `2px solid ${isSelected ? t.color : theme.colors.border}`,
                        boxShadow: isSelected ? `0 0 0 1px ${t.color}20` : 'none',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                          style={{
                            backgroundColor: isSelected ? `${t.color}15` : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            color: isSelected ? t.color : theme.colors.textSecondary,
                          }}>
                          {t.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm" style={{ color: isSelected ? t.color : theme.colors.text }}>
                            {t.label}
                          </div>
                          <div className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                            {t.desc}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                          style={{ backgroundColor: t.color }}>✓</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Material Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.colors.text }}>
                  <BookOutlined className="text-blue-500" />
                  选择学习资料
                  {selectedMats.length > 0 && (
                    <Tag color="blue" className="!text-xs !ml-1">{selectedMats.length} 份已选</Tag>
                  )}
                </h3>
                <Button type="link" size="small"
                  onClick={() => setShowMaterialPicker(!showMaterialPicker)}
                  icon={<DownOutlined className={`text-xs transition-transform ${showMaterialPicker ? 'rotate-180' : ''}`} />}>
                  {showMaterialPicker ? '收起' : '展开'}
                </Button>
              </div>

              {selectedMats.length > 0 && !showMaterialPicker && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedMats.map(m => (
                    <Tag key={m.id} closable
                      onClose={() => setSelectedMaterialIds(prev => prev.filter(id => id !== m.id))}
                      className="!flex !items-center !gap-1">
                      {getTypeIcon(m.type)}
                      <span className="truncate max-w-[120px]">{m.name}</span>
                    </Tag>
                  ))}
                </div>
              )}

              {showMaterialPicker && (
                <div className="rounded-xl p-4 max-h-60 overflow-auto"
                  style={{ backgroundColor: theme.colors.bgCard, border: `1px solid ${theme.colors.border}` }}>
                  <Input prefix={<SearchOutlined className="text-gray-400" />}
                    placeholder="搜索资料..." value={materialSearch}
                    onChange={e => setMaterialSearch(e.target.value)}
                    size="small" allowClear className="!mb-3" />

                  {materials.length === 0 ? (
                    <Empty description="暂无资料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b"
                        style={{ borderColor: theme.colors.border }}>
                        <Checkbox
                          checked={selectedMaterialIds.length === materials.length}
                          indeterminate={selectedMaterialIds.length > 0 && selectedMaterialIds.length < materials.length}
                          onChange={e => setSelectedMaterialIds(e.target.checked ? materials.map(m => m.id) : [])}>
                          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>全选</span>
                        </Checkbox>
                        <span className="text-xs" style={{ color: theme.colors.textSecondary }}>
                          {selectedMaterialIds.length}/{materials.length}
                        </span>
                      </div>
                      {Array.from(tagGroups.entries()).map(([tag, mats]) => (
                        <div key={tag}>
                          <div className="text-xs font-medium mb-1.5" style={{ color: theme.colors.textSecondary }}>{tag}</div>
                          <div className="space-y-1">
                            {mats.map(mat => (
                              <div key={mat.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                                style={{
                                  backgroundColor: selectedMaterialIds.includes(mat.id)
                                    ? `${template?.color || '#1677ff'}10` : 'transparent',
                                }}
                                onClick={() => setSelectedMaterialIds(prev =>
                                  prev.includes(mat.id) ? prev.filter(id => id !== mat.id) : [...prev, mat.id]
                                )}>
                                <Checkbox checked={selectedMaterialIds.includes(mat.id)}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setSelectedMaterialIds(prev =>
                                    e.target.checked ? [...prev, mat.id] : prev.filter(id => id !== mat.id)
                                  )} />
                                {getTypeIcon(mat.type)}
                                <span className="text-sm flex-1 truncate" style={{ color: theme.colors.text }}>{mat.name}</span>
                                <span className="text-xs" style={{ color: theme.colors.textSecondary }}>{mat.size}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: enableWebSearch ? '#52c41a15' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }}>
                <GlobalOutlined style={{ color: enableWebSearch ? '#52c41a' : theme.colors.textSecondary }} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: theme.colors.text }}>网络补充</div>
                <div className="text-xs" style={{ color: theme.colors.textSecondary }}>资料不足时自动搜索补充</div>
              </div>
              <Switch size="small" checked={enableWebSearch} onChange={setEnableWebSearch} className="!ml-2" />
            </div>

            {/* Custom instruction + Generate */}
            <div className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: theme.colors.bgCard, border: `1px solid ${theme.colors.border}` }}>
              <Input.TextArea
                value={customInstruction}
                onChange={e => setCustomInstruction(e.target.value)}
                placeholder="输入个性化要求（可选），如：重点复习第3章、用表格形式展示、加入例题..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
              />
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: theme.colors.border }}>
                <div className="flex items-center gap-2">
                  {selectedMats.length > 0 && <Tag color="blue">{selectedMats.length} 份资料</Tag>}
                  {enableWebSearch && <Tag color="green">网络补充</Tag>}
                </div>
                <Button type="primary" size="large" icon={<SendOutlined />}
                  onClick={() => handleSend()} loading={loading}
                  className="!px-8 !h-10 !rounded-lg !font-medium"
                  style={{
                    background: `linear-gradient(135deg, ${template?.color || '#1677ff'}, ${template?.color || '#1677ff'}dd)`,
                    border: 'none',
                    boxShadow: `0 4px 12px ${template?.color || '#1677ff'}30`,
                  }}>
                  开始生成
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === Chat View (has messages) ===
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <RobotOutlined className="text-white text-sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: theme.colors.text }}>AI 创作</span>
              {subjectName && <Tag color="blue">{subjectName}</Tag>}
              {sessionInfo?.sessionId && <Tag color="green">会话已恢复</Tag>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionInfo && (
            <span className="text-xs" style={{ color: theme.colors.textSecondary }}>
              {sessionInfo.messageCount} 条消息
            </span>
          )}
          <Tooltip title="清空会话">
            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={handleClear} danger />
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.map(renderMessage)}

        {/* Current tool progress */}
        {loading && currentTool && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${theme.colors.border}` }}>
            <Spin size="small" />
            <Tag color="default" className="!text-[10px] !m-0 !leading-tight !px-1.5 !py-0">
              {TOOL_LABELS[currentTool.name] || currentTool.name}
            </Tag>
            <span className="font-mono truncate max-w-[400px]" style={{ color: theme.colors.textSecondary }}>
              {getToolSummary(currentTool.name, currentTool.input)}
            </span>
          </div>
        )}

        {/* Streaming content */}
        {loading && streamingContent && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <RobotOutlined className="text-white text-sm" />
            </div>
            <div className="max-w-[80%] rounded-2xl px-4 py-3"
              style={{ backgroundColor: theme.colors.bgCard, color: theme.colors.text, border: `1px solid ${theme.colors.border}` }}>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={renderMarkdown(streamingContent)} />
              <div className="flex items-center gap-2 mt-2">
                <Spin size="small" />
                <span className="text-xs" style={{ color: theme.colors.textSecondary }}>生成中...</span>
                <Button size="small" type="text" icon={<PauseOutlined />}
                  onClick={handleStop} className="!text-xs !ml-auto"
                  style={{ color: '#ff4d4f' }}>
                  停止
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Loading spinner */}
        {loading && !streamingContent && !currentTool && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <RobotOutlined className="text-white text-sm" />
            </div>
            <div className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ backgroundColor: theme.colors.bgCard, border: `1px solid ${theme.colors.border}` }}>
              <Spin size="small" />
              <span className="text-sm" style={{ color: theme.colors.textSecondary }}>Claude 思考中...</span>
              <Button size="small" type="text" icon={<PauseOutlined />}
                onClick={handleStop} className="!text-xs !ml-2"
                style={{ color: '#ff4d4f' }}>
                停止
              </Button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t flex-shrink-0"
        style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary }}>
        <div className="flex gap-2">
          <Input.TextArea ref={inputRef} value={inputValue}
            onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="继续对话，追问修改或输入新的要求..."
            autoSize={{ minRows: 1, maxRows: 4 }} disabled={loading} />
          {loading ? (
            <Button danger icon={<PauseOutlined />} onClick={handleStop}>
              停止
            </Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />}
              onClick={handleChatSend} disabled={!inputValue.trim() && messages.length > 0} />
          )}
        </div>
        <p className="text-xs mt-2" style={{ color: theme.colors.textSecondary }}>
          Enter 发送 · Shift+Enter 换行 · 对话历史跨会话保留
        </p>
      </div>
    </div>
  )
}

export default ClaudeChat
