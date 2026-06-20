import { useState, useEffect, useRef } from 'react'
import { Input, Button, Spin, message } from 'antd'
import { SendOutlined, SaveOutlined, RobotOutlined, UserOutlined, FilePdfOutlined } from '@ant-design/icons'
import { marked } from 'marked'

interface WikiChatPanelProps {
  subjectId: string
  onClose: () => void
  onSaved?: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const WikiChatPanel = ({ subjectId, onClose, onSaved }: WikiChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [wikiContext, setWikiContext] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadWiki = async () => {
      const content = await window.electron?.wiki.readAllPages(subjectId)
      setWikiContext(content || '')
    }
    loadWiki()
  }, [subjectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const contextPrompt = wikiContext
        ? `你是一位资深的期末考试复习辅导专家。你的任务是帮助学生整理高质量的复习资料。

以下是该学科的 Wiki 知识库内容，请基于这些内容帮助用户整理复习资料：

${wikiContext.slice(0, 12000)}

---

【重要输出规则】
1. 你必须输出 Markdown 格式的复习材料，不要输出 JSON、不要输出代码块包裹的内容
2. 使用清晰的 Markdown 标题层级（# ## ###）
3. 重要内容用 **加粗**，高频考点用 🔥 标记，必背考点用 ⭐ 标记
4. 概念对比用表格，流程用箭头链（→）
5. 每个专题配 1-2 道模拟练习题和答案解析
6. 文档末尾加「考前自检清单」
7. 如果用户要求特定格式（如背诵手册、速查表等），按用户要求调整结构

请直接输出 Markdown 内容，不要包含任何其他说明文字。`
        : `你是一位资深的期末考试复习辅导专家。请根据用户的需求生成高质量的 Markdown 格式复习材料。

【输出规则】
1. 输出 Markdown 格式，不要输出 JSON
2. 使用标题层级、表格、加粗、🔥⭐ 标记
3. 内容要结构清晰、重点突出、实用性强
4. 末尾加「考前自检清单」`

      const fullPrompt = `${contextPrompt}\n\n用户需求：${userMsg}`
      const response = await window.electron?.ai.chat(fullPrompt)
      setMessages(prev => [...prev, { role: 'assistant', content: response || '抱歉，无法生成回复' }])
    } catch {
      message.error('AI 回复失败')
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，AI 回复出错了，请稍后重试。' }])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveToWiki = async (msg: ChatMessage) => {
    if (!msg.content) return
    const title = `AI复习-${new Date().toLocaleDateString('zh-CN')}`
    await window.electron?.wiki.saveQueryResult(subjectId, title, msg.content)
    message.success('已保存到 Wiki')
    onSaved?.()
  }

  const handleExportPdf = async (msg: ChatMessage) => {
    if (!msg.content) return
    const title = `AI复习-${new Date().toLocaleDateString('zh-CN')}`
    const result = await window.electron?.file.exportPdf(msg.content, `${title}.pdf`)
    if (result?.path) message.success(`已导出 PDF`)
    else if (result?.cancelled) message.info('已取消')
    else if (result?.error) message.error(`导出失败: ${result.error}`)
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <RobotOutlined className="text-3xl text-gray-300" />
            <p className="text-xs text-gray-400">告诉 AI 你需要什么样的复习资料</p>
            <p className="text-xs text-gray-300">例如：按考试重点整理第三章</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] ${msg.role === 'user' ? 'order-2' : ''}`}>
              <div className={`flex items-start gap-1.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                  msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                </div>
                <div className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-700'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }} />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
              {msg.role === 'assistant' && (
                <div className="flex justify-end mt-1 gap-1">
                  <Button
                    type="text"
                    size="small"
                    icon={<FilePdfOutlined />}
                    onClick={() => handleExportPdf(msg)}
                    className="!text-xs"
                  >
                    PDF
                  </Button>
                  <Button
                    type="text"
                    size="small"
                    icon={<SaveOutlined />}
                    onClick={() => handleSaveToWiki(msg)}
                    className="!text-xs"
                  >
                    保存到 Wiki
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400">
            <Spin size="small" />
            <span className="text-xs">AI 正在思考...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-gray-200">
        <div className="flex gap-2">
          <Input.TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="描述你需要的复习资料..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend() } }}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={loading}
            className="flex-shrink-0"
          />
        </div>
      </div>
    </>
  )
}

export default WikiChatPanel
