import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Spin, Tag, Tooltip, Modal, message } from 'antd'
import {
  SendOutlined, UserOutlined, RobotOutlined, DeleteOutlined, PauseOutlined,
  BookOutlined, CodeOutlined, EditOutlined, EyeOutlined,
  SearchOutlined, GlobalOutlined,
} from '@ant-design/icons'
import { renderMarkdown } from '../../lib/markdown'
import { useTheme } from '../../contexts/ThemeContext'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

interface WikiBuildChatProps {
  subjectId: string
  subjectName?: string
  materials: { id: string; name: string }[]
  customInstruction?: string
  onComplete?: () => void
}

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
    case 'Read': return String(toolInput.file_path || toolInput.path || '')
    case 'Write': return String(toolInput.file_path || toolInput.path || '')
    case 'Edit': return String(toolInput.file_path || toolInput.path || '')
    case 'Bash': return String(toolInput.command || '').slice(0, 80)
    case 'Glob': return String(toolInput.pattern || '')
    case 'Grep': return String(toolInput.pattern || '')
    default: return JSON.stringify(toolInput).slice(0, 60)
  }
}

const WikiBuildChat = ({ subjectId, subjectName, materials, customInstruction, onComplete }: WikiBuildChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentTool, setCurrentTool] = useState<{ name: string; input: Record<string, unknown> } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)
  const { theme } = useTheme()
  const isDark = theme.colors.bg === '#141414' || theme.colors.bg === '#1a1a1a' || theme.colors.bg === '#000000'

  useEffect(() => {
    return () => {
      window.electron?.claude.removeListeners()
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const buildFirstPrompt = useCallback(() => {
    const names = materials.map(m => m.name).join('、')

    let prompt = `请根据 materials/ 目录下的学习资料，在 wiki/ 目录中构建 Wiki 知识库。

学科：${subjectName || subjectId}
资料文件：${names}
Wiki 目标路径：wiki/${subjectName || subjectId}/

按照 wiki-builder skill 的规范执行：
1. 读取 materials/ 下的每个资料文件（使用 Read 工具）
2. 为每份资料生成 source 页面 → wiki/${subjectName || subjectId}/sources/
3. 从所有资料中提取核心概念，为每个概念创建 concept 页面 → wiki/${subjectName || subjectId}/concepts/
4. 生成综合复习页 → wiki/${subjectName || subjectId}/synthesis/
5. 更新 wiki/index.md
6. 追加日志到 wiki/log.md

重要：请逐个读取资料文件，深入分析后再创建页面，不要跳过任何资料。`

    if (customInstruction?.trim()) {
      prompt += `\n\n用户的额外要求：${customInstruction.trim()}`
    }

    return { prompt, selectedNames: names, selectedCount: materials.length }
  }, [materials, subjectId, subjectName, customInstruction])

  const handleStartBuild = useCallback(async () => {
    if (materials.length === 0) {
      message.warning('没有可构建的资料')
      return
    }

    const { prompt, selectedNames, selectedCount } = buildFirstPrompt()

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: `构建 Wiki（${selectedCount} 份资料：${selectedNames}）`,
      timestamp: new Date().toLocaleTimeString('zh-CN'),
    }

    setMessages([userMsg])
    setLoading(true)
    setStreamingContent('')

    let fullText = ''

    window.electron?.claude.removeListeners()

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
      window.electron?.claude.removeListeners()
      onComplete?.()
    })

    window.electron?.claude.onError((data: { subjectId: string; error: string }) => {
      if (data.subjectId !== subjectId) return
      message.error(data.error)
      setStreamingContent('')
      setCurrentTool(null)
      setLoading(false)
      window.electron?.claude.removeListeners()
    })

    await window.electron?.claude.sendMessage(subjectId, prompt, 'wiki', 1_800_000)
  }, [buildFirstPrompt, subjectId, onComplete, materials])

  // Auto-start build on mount
  useEffect(() => {
    if (!hasStarted.current && messages.length === 0 && !loading && materials.length > 0) {
      hasStarted.current = true
      handleStartBuild()
    }
  }, [handleStartBuild, messages.length, loading, materials.length])

  const handleContinueChat = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
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

    await window.electron?.claude.sendMessage(subjectId, text, 'wiki', 600_000)
  }, [loading, subjectId])

  const handleStop = async () => {
    await window.electron?.claude.stopMessage(subjectId, 'wiki')
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

  const handleClear = () => {
    Modal.confirm({
      title: '清空 Wiki 构建会话',
      content: '确定要清空当前 Wiki 构建的对话记录吗？',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.electron?.claude.clearSession(subjectId, 'wiki')
        setMessages([])
        setStreamingContent('')
        hasStarted.current = false
        message.success('会话已清空')
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleContinueChat(inputValue.trim())
    }
  }


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

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <BookOutlined className="text-white text-sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: theme.colors.text }}>Wiki 构建</span>
              {subjectName && <Tag color="blue">{subjectName}</Tag>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="small" onClick={() => onComplete?.()}>
            返回
          </Button>
          <Tooltip title="清空会话">
            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={handleClear} danger />
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.map(renderMessage)}

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
                <span className="text-xs" style={{ color: theme.colors.textSecondary }}>构建中...</span>
                <Button size="small" type="text" icon={<PauseOutlined />}
                  onClick={handleStop} className="!text-xs !ml-auto"
                  style={{ color: '#ff4d4f' }}>
                  停止
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading && !streamingContent && !currentTool && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <RobotOutlined className="text-white text-sm" />
            </div>
            <div className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ backgroundColor: theme.colors.bgCard, border: `1px solid ${theme.colors.border}` }}>
              <Spin size="small" />
              <span className="text-sm" style={{ color: theme.colors.textSecondary }}>Claude 分析中...</span>
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
          <Input.TextArea value={inputValue}
            onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="继续对话，如：补充第3章的知识点、修改综合页格式..."
            autoSize={{ minRows: 1, maxRows: 4 }} disabled={loading} />
          {loading ? (
            <Button danger icon={<PauseOutlined />} onClick={handleStop}>
              停止
            </Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />}
              onClick={() => handleContinueChat(inputValue.trim())}
              disabled={!inputValue.trim()} />
          )}
        </div>
        <p className="text-xs mt-2" style={{ color: theme.colors.textSecondary }}>
          Enter 发送 · Shift+Enter 换行 · Claude 会使用工具读取资料并写入 Wiki 页面
        </p>
      </div>
    </div>
  )
}

export default WikiBuildChat
