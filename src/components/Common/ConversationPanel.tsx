import { useState, useEffect, useRef } from 'react'
import { Input, Button, Spin, Empty, Tag, Tooltip, message, Modal } from 'antd'
import { SendOutlined, RobotOutlined, UserOutlined, SaveOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import { useTheme } from '../../contexts/ThemeContext'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface ActionButton {
  key: string
  label: string
  icon?: React.ReactNode
  color?: string
}

interface ConversationPanelProps {
  subjectId: string
  feature: string
  contextPrompt: string
  actions?: ActionButton[]
  onAction?: (action: string) => Promise<void>
  onSend?: (message: string) => Promise<string>
  placeholder?: string
  showSaveToWiki?: boolean
}

const ConversationPanel = ({
  subjectId,
  feature,
  contextPrompt,
  actions,
  onAction,
  onSend,
  placeholder = '输入消息... (Enter 发送, Shift+Enter 换行)',
  showSaveToWiki = true,
}: ConversationPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  const historyKey = `${feature}`

  useEffect(() => {
    loadHistory()
  }, [subjectId, feature])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = async () => {
    try {
      const history = await window.electron?.context.readHistory(subjectId, historyKey, 50)
      if (history && history.length > 0) {
        setMessages(history.map((h, i) => ({
          id: `hist_${i}_${h.timestamp}`,
          role: h.role,
          content: h.content,
          timestamp: h.timestamp,
        })))
      }
    } catch { /* ignore */ }
  }

  const saveMessage = async (msg: ChatMessage) => {
    try {
      await window.electron?.context.appendHistory(subjectId, historyKey, {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      })
    } catch { /* ignore */ }
  }

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleString('zh-CN'),
    }
    setMessages(prev => [...prev, userMsg])
    saveMessage(userMsg)
    setInputValue('')
    setLoading(true)

    try {
      const fullPrompt = contextPrompt
        ? `${contextPrompt}\n\n用户：${text}`
        : text

      let reply: string
      if (onSend) {
        reply = await onSend(text)
      } else {
        reply = await window.electron?.ai.chat(fullPrompt) || 'AI 未能生成回复'
      }

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleString('zh-CN'),
      }
      setMessages(prev => [...prev, assistantMsg])
      saveMessage(assistantMsg)
    } catch (err) {
      console.error('[ConversationPanel] AI error:', err)
      const errMsg = err instanceof Error ? err.message : '未知错误'
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: errMsg.includes('API Key') ? '请先在右上角设置中配置 API Key' : `出错了: ${errMsg}`,
        timestamp: new Date().toLocaleString('zh-CN'),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (actionKey: string) => {
    if (!onAction || loading) return
    setLoading(true)
    try {
      await onAction(actionKey)
    } finally {
      setLoading(false)
    }
  }

  const handleClearHistory = async () => {
    Modal.confirm({
      title: '清空对话历史',
      content: '确定要清空当前对话历史吗？此操作不可恢复。',
      onOk: async () => {
        await window.electron?.context.clearHistory(subjectId, historyKey)
        setMessages([])
        message.success('已清空')
      },
    })
  }

  const handleSaveToWiki = async (msg: ChatMessage) => {
    if (!msg.content || msg.role !== 'assistant') return

    let title = ''
    Modal.confirm({
      title: '保存到 Wiki',
      content: (
        <div>
          <p className="mb-2 text-sm text-gray-600">将此回答保存为 Wiki 综合页：</p>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="页面标题"
            defaultValue={msg.content.substring(0, 30).replace(/[\\/:*?"<>|]/g, '')}
            onChange={(e) => { title = e.target.value }}
            id="conv-save-title"
          />
        </div>
      ),
      onOk: async () => {
        const input = document.getElementById('conv-save-title') as HTMLInputElement
        const finalTitle = input?.value?.trim() || msg.content.substring(0, 30).replace(/[\\/:*?"<>|]/g, '')
        if (!finalTitle) { message.warning('请输入标题'); return }
        const result = await window.electron?.wiki.saveQueryResult(subjectId, finalTitle, msg.content)
        if (result?.success) { message.success('已保存到 Wiki') }
        else { message.error(result?.error || '保存失败') }
      },
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Action Buttons */}
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary }}>
          {actions.map(action => (
            <Tooltip key={action.key} title={action.label}>
              <Button
                size="small"
                icon={action.icon}
                onClick={() => handleAction(action.key)}
                loading={loading}
                style={{ color: action.color, borderColor: action.color }}
              >
                {action.label}
              </Button>
            </Tooltip>
          ))}
          <div className="flex-1" />
          {messages.length > 0 && (
            <Tooltip title="清空对话">
              <Button size="small" type="text" icon={<ClearOutlined />} onClick={handleClearHistory} />
            </Tooltip>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4" style={{ backgroundColor: theme.colors.bg }}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Empty description={<span style={{ color: theme.colors.textSecondary }}>开始对话，AI 会基于上下文为你服务</span>} />
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: theme.colors.primary }}>
                    <RobotOutlined className="text-white text-sm" />
                  </div>
                )}

                <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                  msg.role === 'user' ? 'text-white' : ''
                }`} style={{
                  backgroundColor: msg.role === 'user' ? theme.colors.primary : theme.colors.bgCard,
                  color: msg.role === 'user' ? 'white' : theme.colors.text,
                }}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }} />
                  ) : (
                    <span className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                  )}

                  <div className="text-xs mt-1 opacity-40">{msg.timestamp}</div>

                  {msg.role === 'assistant' && showSaveToWiki && (
                    <button
                      onClick={() => handleSaveToWiki(msg)}
                      className="text-xs mt-1 flex items-center gap-1 transition-colors"
                      style={{ color: theme.colors.primary }}
                    >
                      <SaveOutlined /> 保存到 Wiki
                    </button>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: theme.colors.border }}>
                    <UserOutlined className="text-sm" style={{ color: theme.colors.textSecondary }} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: theme.colors.primary }}>
                  <RobotOutlined className="text-white text-sm" />
                </div>
                <div className="rounded-xl px-4 py-3" style={{ backgroundColor: theme.colors.bgCard }}>
                  <Spin size="small" />
                  <span className="text-sm ml-2" style={{ color: theme.colors.textSecondary }}>AI 正在思考...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSecondary }}>
        <div className="flex gap-3 max-w-4xl mx-auto">
          <Input.TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={placeholder}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="flex-1"
          />
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} className="!h-auto">
            发送
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConversationPanel
