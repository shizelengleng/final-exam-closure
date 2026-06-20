import { useState, useEffect, useRef } from 'react'
import { Button, Input, Spin, Empty, message, Select, Tag, Collapse } from 'antd'
import { DownloadOutlined, RobotOutlined, SendOutlined, UserOutlined, FileTextOutlined, FilePdfOutlined, SaveOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import MaterialPicker from '../Common/MaterialPicker'
import type { Material } from '../Common/MaterialPicker'

const ARTICLE_TEMPLATES = [
  { value: 'tutorial', label: '教程文章', desc: '结构清晰的教程，含引言、步骤、总结' },
  { value: 'analysis', label: '深度分析', desc: '深入分析知识点，含背景、原理、应用' },
  { value: 'review', label: '学习心得', desc: '学习心得分享，含感悟、收获、建议' },
  { value: 'summary', label: '知识总结', desc: '系统化知识总结，含框架、要点、拓展' },
  { value: 'custom', label: '自定义', desc: '自由描述你的文章需求' },
]

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface BeautifulArticleProps {
  subjectId: string
}

const BeautifulArticle = ({ subjectId }: BeautifulArticleProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([])
  const [instruction, setInstruction] = useState('')
  const [template, setTemplate] = useState('tutorial')
  const [loading, setLoading] = useState(false)
  const [articleTitle, setArticleTitle] = useState('')
  const [articleContent, setArticleContent] = useState('')
  const [allMaterials, setAllMaterials] = useState<Material[]>([])

  // AI Revision Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMaterials()
  }, [subjectId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const loadMaterials = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    setAllMaterials(all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId))
  }

  const handleGenerate = async () => {
    if (selectedIds.length === 0) {
      message.warning('请至少选择一份资料')
      return
    }
    setLoading(true)
    try {
      const matList = selectedMaterials.map((m) => ({ name: m.name, content: m.content }))

      const templateInfo = ARTICLE_TEMPLATES.find((t) => t.value === template)
      const fullInstruction = template === 'custom'
        ? instruction || '帮我写一篇漂亮的文章'
        : `${templateInfo?.desc || ''}。${instruction ? `补充要求：${instruction}` : ''}`

      const result = await window.electron?.ai.generateDocument(matList, fullInstruction, 'article')
      if (!result) throw new Error('生成失败')

      setArticleTitle(result.title)
      setArticleContent(result.content)
      setChatMessages([])
      message.success('文章生成成功')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '生成失败'
      message.error(errMsg.includes('API Key') ? '请先在设置中配置 API Key' : errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveArticle = async () => {
    if (!articleContent) {
      message.warning('请先生成文章')
      return
    }
    try {
      await window.electron?.db.add('documents', {
        id: `article_${Date.now()}`,
        subjectId,
        title: articleTitle || '漂亮文章',
        content: articleContent,
        template: 'article',
        createdAt: new Date().toISOString(),
      })
      message.success('文章已保存到本学科')
    } catch {
      message.error('保存失败')
    }
  }

  const handleRevise = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const userMsg: ChatMsg = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
    }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      // Pass selected materials as context for revision
      const mats = selectedMaterials.map((m) => ({ name: m.name, content: m.content }))
      const revised = await window.electron?.ai.reviseDocument(articleContent, text, mats.length > 0 ? mats : undefined)
      if (revised) {
        setArticleContent(revised)
        const assistantMsg: ChatMsg = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: '已根据你的要求修改文章',
        }
        setChatMessages((prev) => [...prev, assistantMsg])
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '修改失败'
      const errorMsg: ChatMsg = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: errMsg.includes('API Key') ? '请先在设置中配置 API Key' : `出错了: ${errMsg}`,
      }
      setChatMessages((prev) => [...prev, errorMsg])
    } finally {
      setChatLoading(false)
    }
  }

  const handleExportPdf = async () => {
    if (!articleContent) {
      message.warning('请先生成文章')
      return
    }
    const defaultName = `${articleTitle || '漂亮文章'}.pdf`
    const result = await window.electron?.file.exportPdf(articleContent, defaultName)
    if (result?.path) message.success(`已导出 PDF: ${result.path}`)
    else if (result?.cancelled) message.info('已取消')
    else if (result?.error) message.error(`导出失败: ${result.error}`)
  }

  const handleSaveToWiki = async () => {
    if (!articleContent) {
      message.warning('请先生成文章')
      return
    }
    const title = articleTitle || '漂亮文章'
    const result = await window.electron?.wiki.saveQueryResult(subjectId, title, articleContent)
    if (result?.success) {
      message.success('已保存到 Wiki')
    } else {
      message.error(result?.error || '保存失败，可能未配置 Wiki 目录')
    }
  }

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-6 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
            <FileTextOutlined className="text-pink-500" />
            漂亮文章
          </h2>
          <p className="text-sm text-gray-500">
            将学习资料转化为精美文章
            {allMaterials.length > 0 && (
              <span className="ml-2 text-blue-500">({allMaterials.length} 份资料可用)</span>
            )}
          </p>
        </div>

        {/* Material Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">选择资料</label>
          <div className="bg-white rounded-xl border border-gray-200 p-4 max-h-64 overflow-auto">
            <MaterialPicker
              materials={allMaterials}
              value={selectedIds}
              onChange={(ids) => {
                setSelectedIds(ids)
                setSelectedMaterials(allMaterials.filter((m) => ids.includes(m.id)))
              }}
            />
          </div>
        </div>

        {/* Template Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">文章类型</label>
          <Select
            value={template}
            onChange={setTemplate}
            className="w-full"
            options={ARTICLE_TEMPLATES}
          />
        </div>

        {/* Custom Instruction */}
        {template === 'custom' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">自定义要求</label>
            <Input.TextArea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="描述你想要的文章..."
              rows={3}
            />
          </div>
        )}

        {/* Generate Button */}
        <Button
          type="primary"
          icon={<RobotOutlined />}
          onClick={handleGenerate}
          loading={loading}
          disabled={selectedIds.length === 0}
          className="mb-6"
          size="large"
          style={{
            background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
            border: 'none',
          }}
        >
          生成漂亮文章
        </Button>

        {/* Generated Article */}
        {articleContent && (
          <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{articleTitle}</h3>
              <div className="flex gap-2">
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleSaveArticle}
                >
                  保存到学科
                </Button>
                <Button
                  icon={<SaveOutlined />}
                  onClick={handleSaveToWiki}
                >
                  保存到 Wiki
                </Button>
                <Button
                  icon={<FilePdfOutlined />}
                  onClick={handleExportPdf}
                  type="primary"
                  style={{
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    border: 'none',
                  }}
                >
                  导出 PDF
                </Button>
              </div>
            </div>
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: marked(articleContent) }}
            />
          </div>
        )}

        {!articleContent && !loading && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <Empty description="选择资料并生成漂亮文章" />
          </div>
        )}
      </div>

      {/* AI Chat Sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-gray-50 rounded-xl">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-medium text-gray-700">AI 修改</h3>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {chatMessages.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-8">
              生成后可在此处与 AI 对话修改文章
            </p>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0">
                  <RobotOutlined className="text-white text-xs" />
                </div>
              )}
              <div
                className={`max-w-[85%] p-3 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-pink-500 text-white'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                  <UserOutlined className="text-white text-xs" />
                </div>
              )}
            </div>
          ))}
          {chatLoading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0">
                <RobotOutlined className="text-white text-xs" />
              </div>
              <div className="bg-white border border-gray-200 p-3 rounded-lg">
                <Spin size="small" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onPressEnter={handleRevise}
              placeholder="修改建议..."
              disabled={chatLoading || !articleContent}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleRevise}
              loading={chatLoading}
              disabled={!articleContent}
              style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                border: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default BeautifulArticle
