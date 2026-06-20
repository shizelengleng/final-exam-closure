import { useState, useEffect, useRef } from 'react'
import { Input, Button, Spin, Empty, Tag, Collapse, message, Modal } from 'antd'
import { SendOutlined, RobotOutlined, UserOutlined, FileTextOutlined, BookOutlined, SaveOutlined } from '@ant-design/icons'
import MaterialPicker from '../Common/MaterialPicker'
import type { Material } from '../Common/MaterialPicker'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  materialRefs?: { id: string; name: string }[]
  timestamp: string
}

interface ChatPanelProps {
  subjectId: string
}

const ChatPanel = ({ subjectId }: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [useAutoSelect, setUseAutoSelect] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMaterials()
  }, [subjectId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMaterials = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    setAllMaterials(all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId))
  }

  const findRelevantMaterials = (query: string): Material[] => {
    // 如果用户手动选择了资料，只在已选资料中搜索
    const pool = useAutoSelect
      ? allMaterials
      : allMaterials.filter((m) => selectedMaterialIds.includes(m.id))

    if (pool.length === 0) return []

    const queryLower = query.toLowerCase()
    const keywords = queryLower
      .replace(/[，。！？、；：""''（）\[\]【】]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)

    if (keywords.length === 0) return pool.slice(0, 3)

    const scored = pool
      .filter((m) => m.content && m.content.length > 10)
      .map((m) => {
        const nameLower = m.name.toLowerCase()
        const contentLower = m.content.toLowerCase()
        let score = 0
        for (const kw of keywords) {
          if (nameLower.includes(kw)) score += 3
          const contentMatches = contentLower.split(kw).length - 1
          score += Math.min(contentMatches, 5)
        }
        return { material: m, score }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, 5).map((s) => s.material)
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
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setLoading(true)

    // Sync user message to terminal
    try {
      await window.electron?.terminal?.addConversation({
        subjectId,
        role: 'user',
        content: text,
        timestamp: userMsg.timestamp,
      })
    } catch (err) {
      console.error('Failed to sync user message to terminal:', err)
    }

    try {
      let systemContext = ''

      // 优先读取 Wiki 内容
      const wikiDir = await window.electron?.wiki.getDir(subjectId)
      if (wikiDir) {
        const wikiContent = await window.electron?.wiki.readAllPages(subjectId)
        if (wikiContent) {
          systemContext = '以下是该学科的 Wiki 知识库内容，请基于这些内容回答：\n\n' + wikiContent.substring(0, 12000)
        }
      }

      // Wiki 不可用时，使用原始资料
      if (!systemContext) {
        const relevant = findRelevantMaterials(text)
        if (relevant.length > 0) {
          systemContext = '以下是与用户问题相关的学习资料，请优先基于这些资料回答：\n\n'
          for (const mat of relevant) {
            const snippet = mat.content.substring(0, 3000)
            systemContext += `【${mat.name}】\n${snippet}\n\n---\n\n`
          }
        }
      }

      const fullPrompt = systemContext
        ? `${systemContext}\n用户问题：${text}\n\n请基于以上资料回答用户的问题。如果资料中没有相关信息，请坦诚说明并给出你的分析。`
        : text

      const reply = await window.electron?.ai.chat(fullPrompt)

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: reply || '抱歉，AI 未能生成回复。',
        materialRefs: relevant.map((m) => ({ id: m.id, name: m.name })),
        timestamp: new Date().toLocaleString('zh-CN'),
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Sync assistant message to terminal
      try {
        await window.electron?.terminal?.addConversation({
          subjectId,
          role: 'assistant',
          content: reply || '抱歉，AI 未能生成回复。',
          timestamp: assistantMsg.timestamp,
        })
      } catch (err) {
        console.error('Failed to sync assistant message to terminal:', err)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '未知错误'
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: errMsg.includes('API Key')
          ? '请先在右上角设置中配置 API Key'
          : `出错了: ${errMsg}`,
        timestamp: new Date().toLocaleString('zh-CN'),
      }
      setMessages((prev) => [...prev, errorMsg])

      // Sync error message to terminal
      try {
        await window.electron?.terminal?.addConversation({
          subjectId,
          role: 'assistant',
          content: errorMsg.content,
          timestamp: errorMsg.timestamp,
        })
      } catch (err) {
        console.error('Failed to sync error message to terminal:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSaveToWiki = async (msg: ChatMessage) => {
    if (!msg.content || msg.role !== 'assistant') return

    let title = ''
    Modal.confirm({
      title: '保存到 Wiki',
      content: (
        <div>
          <p className="mb-2 text-sm text-gray-600">将此回答保存为 Wiki 综合页：</p>
          <Input
            placeholder="页面标题，如：AI答疑-如何理解微积分"
            defaultValue={msg.content.substring(0, 30).replace(/[\\/:*?"<>|]/g, '')}
            onChange={(e) => { title = e.target.value }}
            id="wiki-save-title"
          />
        </div>
      ),
      onOk: async () => {
        const input = document.getElementById('wiki-save-title') as HTMLInputElement
        const finalTitle = input?.value?.trim() || msg.content.substring(0, 30).replace(/[\\/:*?"<>|]/g, '')
        if (!finalTitle) {
          message.warning('请输入标题')
          return
        }
        const result = await window.electron?.wiki.saveQueryResult(subjectId, finalTitle, msg.content)
        if (result?.success) {
          message.success('已保存到 Wiki')
        } else {
          message.error(result?.error || '保存失败，可能未配置 Wiki 目录')
        }
      },
    })
  }

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-4 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-1">AI 答疑</h2>
          <p className="text-sm text-gray-500">
            基于你的资料库回答问题
            {allMaterials.length > 0 && (
              <span className="ml-2 text-blue-500">({allMaterials.length} 份资料可用)</span>
            )}
          </p>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Empty
                description={
                  <span className="text-gray-400">
                    向 AI 提问，它会自动参考你的资料库回答
                  </span>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <RobotOutlined className="text-white text-sm" />
                    </div>
                  )}

                  <div
                    className={`max-w-[70%] rounded-xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>

                    {msg.materialRefs && msg.materialRefs.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 border-opacity-30">
                        <div className="flex items-center gap-1 flex-wrap">
                          <FileTextOutlined className="text-xs opacity-60" />
                          <span className="text-xs opacity-60">参考：</span>
                          {msg.materialRefs.map((ref) => (
                            <Tag key={ref.id} className="text-xs !m-0" color={msg.role === 'user' ? 'default' : 'blue'}>
                              {ref.name}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs opacity-40 mt-1">{msg.timestamp}</div>

                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleSaveToWiki(msg)}
                        className="text-xs text-blue-400 hover:text-blue-600 mt-1 flex items-center gap-1 transition-colors"
                      >
                        <SaveOutlined /> 保存到 Wiki
                      </button>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                      <UserOutlined className="text-white text-sm" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <RobotOutlined className="text-white text-sm" />
                  </div>
                  <div className="bg-gray-100 rounded-xl px-4 py-3">
                    <Spin size="small" />
                    <span className="text-sm text-gray-500 ml-2">AI 正在思考...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-xl shadow-sm p-4 mt-4">
          <div className="flex gap-3">
            <Input.TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="输入问题... (Shift+Enter 换行)"
              autoSize={{ minRows: 1, maxRows: 4 }}
              className="flex-1"
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              className="!h-auto"
            >
              发送
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Material Picker Panel */}
      <div className="w-72 flex-shrink-0">
        <Collapse
          defaultActiveKey={['materials']}
          ghost
          items={[{
            key: 'materials',
            label: (
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <BookOutlined />
                参考资料
                {selectedMaterialIds.length > 0 && (
                  <Tag color="blue" className="!text-xs !ml-1">{selectedMaterialIds.length}</Tag>
                )}
              </span>
            ),
            children: (
              <div className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">
                    {useAutoSelect ? 'AI 自动选取相关资料' : `已指定 ${selectedMaterialIds.length} 份资料`}
                  </span>
                  <Button
                    type="link"
                    size="small"
                    className="!text-xs !p-0"
                    onClick={() => setUseAutoSelect(!useAutoSelect)}
                  >
                    {useAutoSelect ? '手动选择' : '恢复自动'}
                  </Button>
                </div>
                {!useAutoSelect && (
                  <div className="h-80 overflow-auto">
                    <MaterialPicker
                      value={selectedMaterialIds}
                      onChange={(ids) => setSelectedMaterialIds(ids)}
                      materials={allMaterials}
                    />
                  </div>
                )}
              </div>
            ),
          }]}
        />
      </div>
    </div>
  )
}

export default ChatPanel
