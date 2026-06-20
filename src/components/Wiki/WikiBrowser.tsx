import { useState, useEffect } from 'react'
import { Empty, Spin, Tag, Button, message, Progress, Collapse, Select, Input, Modal, Checkbox } from 'antd'
import { BookOutlined, FileTextOutlined, BulbOutlined, ApartmentOutlined, ReloadOutlined, CloudDownloadOutlined, ExportOutlined, FilePdfOutlined, FileWordOutlined, EditOutlined, SendOutlined, RobotOutlined, DeleteOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import WikiChatPanel from './WikiChatPanel'

interface WikiBrowserProps {
  subjectId: string
}

type PageType = 'concept' | 'source' | 'synthesis'

const PAGE_TYPE_CONFIG: Record<PageType, { label: string; color: string; icon: React.ReactNode }> = {
  concept: { label: '知识点', color: 'blue', icon: <BulbOutlined /> },
  source: { label: '来源', color: 'orange', icon: <FileTextOutlined /> },
  synthesis: { label: '综合', color: 'purple', icon: <ApartmentOutlined /> },
}

interface MaterialItem {
  id: string
  name: string
  content: string
  subjectId: string
}

const WikiBrowser = ({ subjectId }: WikiBrowserProps) => {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null)
  const [pageContent, setPageContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [contentLoading, setContentLoading] = useState(false)
  const [wikiDir, setWikiDir] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])

  // Material selection for Wiki build
  const [materialSelectOpen, setMaterialSelectOpen] = useState(false)
  const [availableMaterials, setAvailableMaterials] = useState<MaterialItem[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])

  // Material selection for document generation
  const [docMaterialSelectOpen, setDocMaterialSelectOpen] = useState(false)
  const [docAvailableMaterials, setDocAvailableMaterials] = useState<MaterialItem[]>([])
  const [docSelectedMaterialIds, setDocSelectedMaterialIds] = useState<string[]>([])

  const allGroupKeys: PageType[] = ['synthesis', 'concept', 'source']

  const loadPages = async () => {
    setLoading(true)
    try {
      const dir = await window.electron?.wiki.getDir(subjectId)
      setWikiDir(dir)
      if (dir) {
        const list = await window.electron?.wiki.listPages(subjectId)
        setPages(list)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPages()
  }, [subjectId])

  const handleSelectPage = async (page: WikiPage) => {
    setSelectedPage(page)
    setContentLoading(true)
    try {
      const content = await window.electron?.wiki.readPage(subjectId, page.name)
      setPageContent(content)
    } finally {
      setContentLoading(false)
    }
  }

  const handleRefresh = () => {
    loadPages()
    message.success('已刷新')
  }

  const handleDeletePage = async (page: WikiPage) => {
    Modal.confirm({
      title: `删除页面「${page.name}」？`,
      content: '此操作不可恢复',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const result = await window.electron?.wiki.deletePage(subjectId, page.name, page.type)
        if (result?.success) {
          message.success('已删除')
          if (selectedPage?.name === page.name) {
            setSelectedPage(null)
            setPageContent('')
          }
          loadPages()
        } else {
          message.error(result?.error || '删除失败')
        }
      },
    })
  }

  // === 导出功能 ===
  const handleExportMd = async () => {
    if (!selectedPage || !pageContent) return
    const cleanContent = pageContent.replace(/^---[\s\S]*?---\n*/, '')
    await window.electron?.file.saveFile(cleanContent, `${selectedPage.name}.md`)
  }

  const handleExportDocx = async () => {
    if (!selectedPage || !pageContent) return
    const cleanContent = pageContent.replace(/^---[\s\S]*?---\n*/, '')
    await window.electron?.file.saveFile(cleanContent, `${selectedPage.name}.docx`)
  }

  const handleExportPdf = async () => {
    if (!selectedPage || !pageContent) return
    const cleanContent = pageContent.replace(/^---[\s\S]*?---\n*/, '')
    const result = await window.electron?.file.exportPdf(cleanContent, `${selectedPage.name}.pdf`)
    if (result?.path) message.success(`已导出 PDF`)
    else if (result?.cancelled) message.info('已取消')
    else if (result?.error) message.error(`导出失败: ${result.error}`)
  }

  // === AI 对话面板 ===
  const [chatPanelOpen, setChatPanelOpen] = useState(false)

  // === 文档生成功能 ===
  const [docMode, setDocMode] = useState(false)
  const [docTemplate, setDocTemplate] = useState('general')
  const [docInstruction, setDocInstruction] = useState('')
  const [docContent, setDocContent] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [docMaterialsUsed, setDocMaterialsUsed] = useState<{ name: string; content: string }[]>([])

  const DOC_TEMPLATES = [
    { value: 'general', label: '通用复习文档' },
    { value: 'quick_ref', label: '知识速查手册' },
    { value: 'recite', label: '背诵手册' },
    { value: 'analysis', label: '材料分析题手册' },
    { value: 'custom', label: '自定义' },
  ]

  const handleGenerateDoc = async () => {
    // Load materials and show selection modal
    const data = await window.electron?.db.list('materials')
    const allMaterials = (data as MaterialItem[]) || []
    const subjectMaterials = allMaterials.filter(m => m.subjectId === subjectId)

    if (subjectMaterials.length === 0) {
      message.info('当前学科没有资料，请先上传')
      return
    }

    setDocAvailableMaterials(subjectMaterials)
    // Default: select all materials + Wiki if available
    setDocSelectedMaterialIds(subjectMaterials.map(m => m.id))
    setDocMaterialSelectOpen(true)
  }

  const handleGenerateDocWithSelected = async () => {
    setDocMaterialSelectOpen(false)
    setDocLoading(true)
    try {
      const matList: { name: string; content: string }[] = []

      // Add selected original materials
      const selectedMats = docAvailableMaterials.filter(m => docSelectedMaterialIds.includes(m.id))
      for (const mat of selectedMats) {
        if (mat.content) {
          matList.push({ name: mat.name, content: mat.content })
        }
      }

      // Also add Wiki content if available
      const wikiContent = await window.electron?.wiki.readAllPages(subjectId)
      if (wikiContent) {
        matList.push({ name: 'Wiki 知识库（综合）', content: wikiContent })
      }

      if (matList.length === 0) {
        message.info('没有可用的内容，请先上传资料或构建 Wiki')
        setDocLoading(false)
        return
      }

      // Store materials for revision
      setDocMaterialsUsed(matList)

      const fullInstruction = docInstruction || '帮我整理成系统的复习文档'
      const result = await window.electron?.ai.generateDocument(matList, fullInstruction, docTemplate)
      setDocContent(result.content)
      setDocTitle(result.title)
      setChatMessages([])
      message.success('文档生成完成')
    } catch (err) {
      message.error('文档生成失败')
    } finally {
      setDocLoading(false)
    }
  }

  const handleReviseChat = async () => {
    if (!chatInput.trim() || !docContent) return
    const userMsg = chatInput.trim()
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatInput('')
    setChatLoading(true)
    try {
      const revised = await window.electron?.ai.reviseDocument(docContent, userMsg, docMaterialsUsed.length > 0 ? docMaterialsUsed : undefined)
      setDocContent(revised)
      setChatMessages(prev => [...prev, { role: 'assistant', content: '文档已根据您的要求更新' }])
    } catch {
      message.error('修订失败')
    } finally {
      setChatLoading(false)
    }
  }

  const handleSaveDocToWiki = async () => {
    if (!docContent || !docTitle) return
    await window.electron?.wiki.saveQueryResult(subjectId, docTitle, docContent)
    message.success('已保存到 Wiki')
    loadPages()
  }

  const handleBuildFromMaterials = async () => {
    if (!wikiDir) {
      message.warning('请先在设置中配置 Wiki 目录')
      return
    }
    // Load materials and show selection modal
    const data = await window.electron?.db.list('materials')
    const allMaterials = (data as MaterialItem[]) || []
    const subjectMaterials = allMaterials.filter(m => m.subjectId === subjectId)

    if (subjectMaterials.length === 0) {
      message.info('当前学科没有资料，请先上传')
      return
    }

    setAvailableMaterials(subjectMaterials)
    setSelectedMaterialIds(subjectMaterials.map(m => m.id))
    setMaterialSelectOpen(true)
  }

  const handleBuildWithSelected = async () => {
    if (selectedMaterialIds.length === 0) {
      message.warning('请至少选择一份资料')
      return
    }
    setMaterialSelectOpen(false)
    setBuilding(true)
    setBuildProgress('正在读取资料...')
    try {
      const selectedMats = availableMaterials.filter(m => selectedMaterialIds.includes(m.id))

      // 逐个构建 source 页面
      for (let i = 0; i < selectedMats.length; i++) {
        const mat = selectedMats[i]
        setBuildProgress(`正在处理资料 (${i + 1}/${selectedMats.length})：${mat.name}`)
        const content = mat.content || mat.name
        await window.electron?.wiki.buildSource(subjectId, mat.name, content)
      }

      // 构建 concepts + synthesis
      setBuildProgress('正在提取知识点和生成综合页...')
      await window.electron?.wiki.buildWiki(subjectId)

      message.success(`Wiki 构建完成，处理了 ${selectedMats.length} 份资料`)
      loadPages()
    } catch (err) {
      message.error('构建失败')
    } finally {
      setBuilding(false)
      setBuildProgress('')
    }
  }

  if (!wikiDir) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Empty
          image={<BookOutlined className="text-6xl text-gray-300" />}
          description={
            <div className="text-center">
              <p className="text-gray-500 mb-2">Wiki 知识库尚未配置</p>
              <p className="text-xs text-gray-400">
                请在 设置 → Wiki 知识库 中选择存储目录
              </p>
            </div>
          }
        />
      </div>
    )
  }

  const grouped = {
    synthesis: pages.filter(p => p.type === 'synthesis'),
    concept: pages.filter(p => p.type === 'concept'),
    source: pages.filter(p => p.type === 'source'),
  }

  const renderMarkdown = (content: string) => {
    // 去掉 frontmatter
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '')
    return { __html: marked(withoutFrontmatter) as string }
  }

  return (
    <div className="flex h-full">
      {/* 左侧：页面列表 */}
      <div className="w-64 border-r border-gray-200 flex flex-col bg-gray-50 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            <BookOutlined className="mr-1" />
            Wiki ({pages.length})
          </span>
          <div className="flex gap-1">
            <Button
              type="text"
              size="small"
              icon={<CloudDownloadOutlined />}
              onClick={handleBuildFromMaterials}
              loading={building}
              title="从现有资料构建"
            />
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => { setDocMode(true); setChatPanelOpen(false) }}
              title="生成文档"
            />
            <Button
              type="text"
              size="small"
              icon={<RobotOutlined />}
              onClick={() => { setChatPanelOpen(true); setDocMode(false) }}
              title="AI 对话"
            />
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleRefresh} />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Spin /></div>
          ) : pages.length === 0 ? (
            <div className="text-center py-4 space-y-3">
              <p className="text-xs text-gray-400">暂无 Wiki 页面</p>
              <Button
                type="primary"
                size="small"
                icon={<CloudDownloadOutlined />}
                onClick={handleBuildFromMaterials}
                loading={building}
              >
                从现有资料构建
              </Button>
              {buildProgress && (
                <p className="text-xs text-blue-500 px-2">{buildProgress}</p>
              )}
            </div>
          ) : (
            <Collapse
              ghost
              size="small"
              activeKey={allGroupKeys.filter(k => !collapsedGroups.includes(k))}
              onChange={(keys) => {
                const active = Array.isArray(keys) ? keys : [keys]
                setCollapsedGroups(allGroupKeys.filter(k => !active.includes(k)))
              }}
              items={allGroupKeys
                .filter(type => grouped[type].length > 0)
                .map(type => ({
                  key: type,
                  label: (
                    <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                      {PAGE_TYPE_CONFIG[type].icon}
                      {PAGE_TYPE_CONFIG[type].label} ({grouped[type].length})
                    </span>
                  ),
                  children: (
                    <div className="space-y-0.5">
                      {grouped[type].map(page => (
                        <div key={page.name} className="group flex items-center">
                          <button
                            onClick={() => handleSelectPage(page)}
                            className={`flex-1 text-left px-3 py-1.5 text-sm rounded transition-colors ${
                              selectedPage?.name === page.name
                                ? 'bg-blue-100 text-blue-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {page.name}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePage(page) }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                            title="删除"
                          >
                            <DeleteOutlined className="text-xs" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ),
                }))}
            />
          )}
          {building && buildProgress && (
            <div className="px-2 py-2 border-t border-gray-200 mt-2">
              <div className="flex items-center gap-2">
                <Spin size="small" />
                <span className="text-xs text-blue-500">{buildProgress}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：页面内容 */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-auto">
          {docMode ? (
            /* 文档生成模式 */
            <div className="p-6 max-w-3xl">
              {docContent ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">{docTitle}</h2>
                    <div className="flex gap-1">
                      <Button size="small" icon={<FilePdfOutlined />} onClick={handleExportPdf}>PDF</Button>
                      <Button size="small" icon={<FileWordOutlined />} onClick={handleExportDocx}>Word</Button>
                      <Button size="small" onClick={handleSaveDocToWiki}>保存到 Wiki</Button>
                      <Button size="small" onClick={() => { setDocContent(''); setDocTitle(''); setDocMode(false) }}>返回</Button>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={renderMarkdown(docContent)} />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <EditOutlined className="text-4xl mb-3 opacity-30" />
                  <p className="text-sm">配置文档生成参数后点击生成</p>
                </div>
              )}
            </div>
          ) : selectedPage ? (
            contentLoading ? (
              <div className="flex justify-center items-center h-full"><Spin /></div>
            ) : (
              <div className="p-6 max-w-3xl">
                <div className="mb-4 flex items-center gap-2">
                  <Tag color={PAGE_TYPE_CONFIG[selectedPage.type].color}>
                    {PAGE_TYPE_CONFIG[selectedPage.type].label}
                  </Tag>
                  <span className="text-xs text-gray-400">
                    更新于 {new Date(selectedPage.updated).toLocaleDateString('zh-CN')}
                  </span>
                  {selectedPage.type === 'synthesis' && (
                    <div className="ml-auto flex gap-1">
                      <Button size="small" icon={<FilePdfOutlined />} onClick={handleExportPdf}>PDF</Button>
                      <Button size="small" icon={<FileWordOutlined />} onClick={handleExportDocx}>Word</Button>
                    </div>
                  )}
                </div>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={renderMarkdown(pageContent)}
                />
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <BookOutlined className="text-4xl mb-3 opacity-30" />
              <p className="text-sm">选择左侧页面查看内容</p>
            </div>
          )}
        </div>

        {/* 文档生成右侧栏 */}
        {docMode && (
          <div className="w-72 border-l border-gray-200 flex flex-col bg-gray-50 flex-shrink-0">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">文档生成</span>
              <Button type="text" size="small" onClick={() => setDocMode(false)}>关闭</Button>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">模板</label>
                <Select
                  value={docTemplate}
                  onChange={setDocTemplate}
                  options={DOC_TEMPLATES}
                  className="w-full"
                  size="small"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">补充指令</label>
                <Input.TextArea
                  value={docInstruction}
                  onChange={e => setDocInstruction(e.target.value)}
                  placeholder="如：重点整理第三章内容..."
                  rows={3}
                  size="small"
                />
              </div>
              <Button
                type="primary"
                block
                loading={docLoading}
                onClick={handleGenerateDoc}
              >
                生成文档
              </Button>

              {docContent && (
                <>
                  <div className="border-t border-gray-200 pt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">AI 修订</label>
                    <div className="space-y-2 max-h-48 overflow-auto mb-2">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`text-xs p-2 rounded ${msg.role === 'user' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                          {msg.content}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="修改意见..."
                        size="small"
                        onPressEnter={handleReviseChat}
                      />
                      <Button size="small" icon={<SendOutlined />} onClick={handleReviseChat} loading={chatLoading} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI 对话右侧栏 */}
        {chatPanelOpen && (
          <div className="w-80 border-l border-gray-200 flex flex-col bg-gray-50 flex-shrink-0">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                <RobotOutlined className="mr-1" />
                AI 复习助手
              </span>
              <Button type="text" size="small" onClick={() => setChatPanelOpen(false)}>关闭</Button>
            </div>
            <WikiChatPanel subjectId={subjectId} onClose={() => setChatPanelOpen(false)} onSaved={loadPages} />
          </div>
        )}
      </div>

      {/* Material selection modal */}
      <Modal
        title="选择要构建 Wiki 的资料"
        open={materialSelectOpen}
        onCancel={() => setMaterialSelectOpen(false)}
        onOk={handleBuildWithSelected}
        okText={`开始构建 (${selectedMaterialIds.length}/${availableMaterials.length})`}
        cancelText="取消"
        width={500}
      >
        <div className="py-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500">
              已选 {selectedMaterialIds.length} / {availableMaterials.length} 份资料
            </span>
            <div className="flex gap-2">
              <Button size="small" type="link" onClick={() => setSelectedMaterialIds(availableMaterials.map(m => m.id))}>
                全选
              </Button>
              <Button size="small" type="link" onClick={() => setSelectedMaterialIds([])}>
                全不选
              </Button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto space-y-1 border border-gray-100 rounded-lg p-2">
            {availableMaterials.map(mat => (
              <label
                key={mat.id}
                className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedMaterialIds.includes(mat.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedMaterialIds(prev => [...prev, mat.id])
                    } else {
                      setSelectedMaterialIds(prev => prev.filter(id => id !== mat.id))
                    }
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 truncate">{mat.name}</div>
                  <div className="text-xs text-gray-400 truncate">{mat.content?.slice(0, 80) || '无内容预览'}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {/* Document generation material selection modal */}
      <Modal
        title="选择生成文档的资料来源"
        open={docMaterialSelectOpen}
        onCancel={() => setDocMaterialSelectOpen(false)}
        onOk={handleGenerateDocWithSelected}
        okText={`开始生成 (${docSelectedMaterialIds.length}/${docAvailableMaterials.length} 份资料)`}
        cancelText="取消"
        width={500}
      >
        <div className="py-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500">
              已选 {docSelectedMaterialIds.length} / {docAvailableMaterials.length} 份资料
            </span>
            <div className="flex gap-2">
              <Button size="small" type="link" onClick={() => setDocSelectedMaterialIds(docAvailableMaterials.map(m => m.id))}>
                全选
              </Button>
              <Button size="small" type="link" onClick={() => setDocSelectedMaterialIds([])}>
                全不选
              </Button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto space-y-1 border border-gray-100 rounded-lg p-2">
            {docAvailableMaterials.map(mat => (
              <label
                key={mat.id}
                className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={docSelectedMaterialIds.includes(mat.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDocSelectedMaterialIds(prev => [...prev, mat.id])
                    } else {
                      setDocSelectedMaterialIds(prev => prev.filter(id => id !== mat.id))
                    }
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 truncate">{mat.name}</div>
                  <div className="text-xs text-gray-400 truncate">{mat.content?.slice(0, 80) || '无内容预览'}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Wiki 知识库内容将自动包含在内</p>
        </div>
      </Modal>
    </div>
  )
}

export default WikiBrowser
