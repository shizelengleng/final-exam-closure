import { useState, useEffect, useRef } from 'react'
import { Button, Input, Spin, Empty, message, Select, Tag, Collapse } from 'antd'
import { DownloadOutlined, RobotOutlined, SendOutlined, UserOutlined, EditOutlined, SaveOutlined, FilePdfOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import MaterialPicker from '../Common/MaterialPicker'
import type { Material } from '../Common/MaterialPicker'

const DOC_TEMPLATES = [
  { value: 'general', label: '通用复习文档', desc: '按知识点主题组织，含目录、要点总结' },
  { value: 'quick_ref', label: '知识速查手册', desc: '按考点编号，表格化核心概念，附必背考点速记' },
  { value: 'recite', label: '背诵手册', desc: '5段式架构：脉络速览→分章速查→对比表→公式速记→自检清单' },
  { value: 'analysis', label: '材料分析题手册', desc: '资料整理 + 配套真题/分析题 + 答题模板' },
  { value: 'custom', label: '自定义', desc: '自由描述你的需求' },
]

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface DocumentGeneratorProps {
  subjectId: string
}

const DocumentGenerator = ({ subjectId }: DocumentGeneratorProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([])
  const [instruction, setInstruction] = useState('')
  const [template, setTemplate] = useState('general')
  const [loading, setLoading] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
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
    setLoading(true)
    try {
      // 优先读取 Wiki 内容
      let matList: { name: string; content: string }[] = []
      const wikiDir = await window.electron?.wiki.getDir(subjectId)
      if (wikiDir) {
        const synthesis = await window.electron?.wiki.getSynthesis(subjectId)
        if (synthesis) {
          matList = [{ name: 'Wiki 综合页', content: synthesis }]
        }
      }

      // Wiki 不可用时，使用原始资料
      if (matList.length === 0) {
        if (selectedIds.length === 0) {
          message.warning('请至少选择一份资料')
          return
        }
        matList = selectedMaterials.map((m) => ({ name: m.name, content: m.content }))
      }

      const templateInfo = DOC_TEMPLATES.find((t) => t.value === template)
      const fullInstruction = template === 'custom'
        ? instruction || '帮我整理成系统的复习文档'
        : `${templateInfo?.desc || ''}。${instruction ? `补充要求：${instruction}` : ''}`

      const result = await window.electron?.ai.generateDocument(matList, fullInstruction, template)
      if (!result) throw new Error('生成失败')

      setDocTitle(result.title)
      setDocContent(result.content)
      setChatMessages([])
      message.success('文档生成成功')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '生成失败'
      message.error(errMsg.includes('API Key') ? '请先在设置中配置 API Key' : errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDocument = async () => {
    if (!docContent) {
      message.warning('请先生成文档')
      return
    }
    try {
      await window.electron?.db.add('documents', {
        id: `doc_${Date.now()}`,
        subjectId,
        title: docTitle || '复习文档',
        content: docContent,
        template,
        createdAt: new Date().toISOString(),
      })
      message.success('文档已保存到本学科')
    } catch {
      message.error('保存失败')
    }
  }

  const handleSaveToWiki = async () => {
    if (!docContent) {
      message.warning('请先生成文档')
      return
    }
    const title = docTitle || '复习文档'
    const result = await window.electron?.wiki.saveQueryResult(subjectId, title, docContent)
    if (result?.success) {
      message.success('已保存到 Wiki 综合页')
    } else {
      message.error(result?.error || '保存失败，可能未配置 Wiki 目录')
    }
  }

  const handleExportMd = async () => {
    if (!docContent) {
      message.warning('请先生成文档')
      return
    }
    const defaultName = `${docTitle || '复习文档'}.md`
    const result = await window.electron?.file.saveFile(docContent, defaultName)
    if (result?.path) {
      message.success(`已保存到: ${result.path}`)
    }
  }

  const handleExportDocx = async () => {
    if (!docContent) {
      message.warning('请先生成文档')
      return
    }
    const defaultName = `${docTitle || '复习文档'}.docx`
    const result = await window.electron?.file.saveFile(docContent, defaultName)
    if (result?.path) {
      message.success(`已保存到: ${result.path}`)
    }
  }

  const handleExportPdf = async () => {
    if (!docContent) {
      message.warning('请先生成文档')
      return
    }
    const defaultName = `${docTitle || '复习文档'}.pdf`
    const result = await window.electron?.file.exportPdf(docContent, defaultName)
    if (result?.path) message.success(`已导出 PDF: ${result.path}`)
    else if (result?.cancelled) message.info('已取消')
    else if (result?.error) message.error(`导出失败: ${result.error}`)
  }

  const handleReviseChat = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading || !docContent) return

    const userMsg: ChatMsg = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
    }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const reply = await window.electron?.ai.reviseDocument(docContent, text)
      if (!reply) throw new Error('AI 未返回内容')

      const assistantMsg: ChatMsg = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: '文档已修改，点击下方按钮应用更改。',
      }
      setChatMessages((prev) => [...prev, assistantMsg])

      // Store the revised content for potential application
      setDocContent(reply)
      setDocTitle((prev) => prev || '复习文档')
      message.success('文档已根据修改意见更新')
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

  const htmlContent = docContent ? marked.parse(docContent) as string : ''

  return (
    <div className="flex h-full gap-4">
      {/* Left: Material Selection + Config */}
      <div className="w-80 flex-shrink-0 bg-white rounded-xl p-4 shadow-sm flex flex-col">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">选择资料</h3>
          <div className="h-56 overflow-auto border border-gray-100 rounded-lg p-2">
            <MaterialPicker
              value={selectedIds}
              onChange={(ids, mats) => {
                setSelectedIds(ids)
                setSelectedMaterials(mats)
              }}
              materials={allMaterials}
            />
          </div>
        </div>

        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">文档模板</p>
          <Select
            value={template}
            onChange={setTemplate}
            className="w-full"
            options={DOC_TEMPLATES.map((t) => ({
              value: t.value,
              label: (
                <div>
                  <div className="text-sm">{t.label}</div>
                  <div className="text-xs text-gray-400">{t.desc}</div>
                </div>
              ),
            }))}
          />
        </div>

        <div className="flex-1 flex flex-col">
          <Input.TextArea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={template === 'custom' ? '描述你需要的文档，如：帮我整理高数期末复习资料，重点是微积分和线性代数' : '补充说明（可选），如：重点整理第3章'}
            autoSize={{ minRows: 2, maxRows: 4 }}
            className="mb-3"
          />
          <div className="mt-auto">
            <p className="text-xs text-gray-400 mb-2">已选 {selectedIds.length} 份资料</p>
            <Button
              type="primary"
              block
              icon={<RobotOutlined />}
              onClick={handleGenerate}
              loading={loading}
            >
              AI 生成复习文档
            </Button>
          </div>
        </div>
      </div>

      {/* Center: Document Preview + Export */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl shadow-sm">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Spin size="large" />
              <p className="mt-4 text-gray-500">AI 正在整合资料，生成高质量复习文档...</p>
              <p className="text-xs text-gray-400 mt-1">表格化排版 · 高频考点标记 · 必背速记</p>
            </div>
          </div>
        ) : docContent ? (
          <>
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 truncate">{docTitle}</h3>
              <div className="flex gap-2">
                <Button onClick={handleSaveDocument} size="small">
                  保存到学科
                </Button>
                <Button icon={<SaveOutlined />} onClick={handleSaveToWiki} size="small">
                  保存到 Wiki
                </Button>
                <Button icon={<FilePdfOutlined />} onClick={handleExportPdf} size="small">
                  导出 PDF
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportDocx} size="small">
                  导出 Word
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div
                className="prose prose-sm max-w-none
                  prose-headings:text-gray-800 prose-headings:font-bold
                  prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                  prose-p:text-gray-600 prose-p:leading-relaxed
                  prose-strong:text-gray-800
                  prose-table:border-collapse prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-th:text-sm prose-th:font-semibold
                  prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-td:border prose-td:border-gray-200
                  prose-blockquote:border-l-4 prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50 prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:text-gray-600
                  prose-ul:list-disc prose-ol:list-decimal
                  prose-li:text-gray-600
                  prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Empty description="选择资料后点击「AI 生成复习文档」" />
          </div>
        )}
      </div>

      {/* Right: AI Revision Chat */}
      {docContent && (
        <div className="w-72 flex-shrink-0">
          <Collapse
            defaultActiveKey={['revise']}
            ghost
            items={[{
              key: 'revise',
              label: (
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <EditOutlined className="text-blue-500" />
                  AI 修改文档
                  {chatMessages.length > 0 && (
                    <Tag color="blue" className="!text-xs !ml-1">{chatMessages.length}</Tag>
                  )}
                </span>
              ),
              children: (
                <div className="bg-white rounded-lg shadow-sm flex flex-col overflow-hidden" style={{ height: '500px' }}>
                  <div className="flex-1 overflow-auto p-3 space-y-3">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-8">
                        <EditOutlined className="text-3xl text-gray-300 mb-2" />
                        <p className="text-xs text-gray-400">
                          告诉 AI 你想如何修改文档
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          例如：「把第2章的内容展开」「增加对比表格」
                        </p>
                      </div>
                    )}

                    {chatMessages.map((msg) => (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                            <RobotOutlined className="text-white text-xs" />
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                            <UserOutlined className="text-white text-xs" />
                          </div>
                        )}
                      </div>
                    ))}

                    {chatLoading && (
                      <div className="flex gap-2 justify-start">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                          <RobotOutlined className="text-white text-xs" />
                        </div>
                        <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500">
                          <Spin size="small" /> AI 正在修改...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="p-3 border-t border-gray-100">
                    <div className="flex gap-2">
                      <Input.TextArea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onPressEnter={(e) => {
                          if (!e.shiftKey) {
                            e.preventDefault()
                            handleReviseChat()
                          }
                        }}
                        placeholder="描述修改需求..."
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        className="flex-1"
                      />
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleReviseChat}
                        loading={chatLoading}
                        className="!h-auto"
                      />
                    </div>
                  </div>
                </div>
              ),
            }]}
          />
        </div>
      )}
    </div>
  )
}

export default DocumentGenerator
