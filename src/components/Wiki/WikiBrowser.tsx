import { useState, useEffect } from 'react'
import { Empty, Spin, Tag, Button, message, Collapse, Modal, Checkbox, Input } from 'antd'
import { BookOutlined, BulbOutlined, ApartmentOutlined, ReloadOutlined, CloudDownloadOutlined, FilePdfOutlined, FileWordOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { renderMarkdown } from '../../lib/markdown'
import WikiBuildChat from './WikiBuildChat'

interface WikiBrowserProps {
  subjectId: string
}

type PageType = 'concept' | 'source' | 'synthesis'

const PAGE_TYPE_CONFIG: Record<PageType, { label: string; color: string; icon: React.ReactNode }> = {
  concept: { label: '知识点', color: 'blue', icon: <BulbOutlined /> },
  source: { label: '来源', color: 'orange', icon: <BookOutlined /> },
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
  const [mode, setMode] = useState<'browse' | 'build'>('browse')
  const [buildMaterials, setBuildMaterials] = useState<{ id: string; name: string }[]>([])
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])

  const [buildModalOpen, setBuildModalOpen] = useState(false)
  const [availableMaterials, setAvailableMaterials] = useState<MaterialItem[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [customInstruction, setCustomInstruction] = useState('')

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

  const handleExportMd = async () => {
    if (!selectedPage || !pageContent) return
    const cleanContent = pageContent.replace(/^---[\s\S]*?---\n*/, '')
    await window.electron?.file.saveFile(cleanContent, `${selectedPage.name}.md`)
  }

  const handleExportPdf = async () => {
    if (!selectedPage || !pageContent) return
    const cleanContent = pageContent.replace(/^---[\s\S]*?---\n*/, '')
    const result = await window.electron?.file.exportPdf(cleanContent, `${selectedPage.name}.pdf`)
    if (result?.path) message.success(`已导出 PDF`)
    else if (result?.cancelled) message.info('已取消')
    else if (result?.error) message.error(`导出失败: ${result.error}`)
  }

  const handleBuildFromMaterials = async () => {
    if (!wikiDir) {
      message.warning('请先在设置中配置 Wiki 目录')
      return
    }
    const data = await window.electron?.db.list('materials')
    const allMaterials = (data as MaterialItem[]) || []
    const subjectMaterials = allMaterials.filter(m => m.subjectId === subjectId)

    if (subjectMaterials.length === 0) {
      message.info('当前学科没有资料，请先上传')
      return
    }

    setAvailableMaterials(subjectMaterials)
    setSelectedMaterialIds(subjectMaterials.map(m => m.id))
    setCustomInstruction('')
    setBuildModalOpen(true)
  }

  const handleConfirmBuild = async () => {
    if (selectedMaterialIds.length === 0) {
      message.warning('请至少选择一份资料')
      return
    }

    const selected = availableMaterials.filter(m => selectedMaterialIds.includes(m.id))
    const fullMaterials = selected.map(m => ({
      name: m.name,
      content: m.content || '',
    }))

    const result = await window.electron?.wiki.prepareBuildSession(subjectId, fullMaterials)
    if (!result?.success) {
      message.error(result?.error || '准备工作区失败')
      return
    }

    setBuildMaterials(selected.map(m => ({ id: m.id, name: m.name })))
    setBuildModalOpen(false)
    setMode('build')
  }

  if (!wikiDir) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Empty
          image={<BookOutlined className="text-6xl text-gray-300" />}
          description={
            <div className="text-center">
              <p className="text-gray-500 mb-2">Wiki 知识库尚未配置</p>
              <p className="text-xs text-gray-400">请在 设置 → Wiki 知识库 中选择存储目录</p>
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

  const renderPage = (content: string) => {
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '')
    return renderMarkdown(withoutFrontmatter)
  }

  return (
    <div className="flex h-full">
      {/* Left: Page List */}
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
              title="从现有资料构建"
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
              >
                从现有资料构建
              </Button>
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
        </div>
      </div>

      {/* Right: Page Content or Build Mode */}
      <div className="flex-1 flex min-h-0">
        {mode === 'build' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              <Button type="text" size="small" icon={<ArrowLeftOutlined />}
                onClick={() => {
                  setMode('browse')
                  window.electron?.wiki.cleanupBuildSession(subjectId)
                  loadPages()
                }} />
              <span className="text-sm font-medium text-gray-700">Claude 构建模式</span>
            </div>
            <div className="flex-1 min-h-0">
              <WikiBuildChat
                subjectId={subjectId}
                materials={buildMaterials}
                customInstruction={customInstruction}
                onComplete={() => {
                  setMode('browse')
                  window.electron?.wiki.cleanupBuildSession(subjectId)
                  loadPages()
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            {selectedPage ? (
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
                      <Button size="small" icon={<FileWordOutlined />} onClick={handleExportMd}>Markdown</Button>
                    </div>
                  )}
                </div>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={renderPage(pageContent)}
                />
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <BookOutlined className="text-4xl mb-3 opacity-30" />
              <p className="text-sm">选择左侧页面查看内容</p>
              <p className="text-xs text-gray-400 mt-1">或点击上方按钮从资料构建 Wiki</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Build Modal: Material selection + custom instruction */}
      <Modal
        title="构建 Wiki 知识库"
        open={buildModalOpen}
        onCancel={() => setBuildModalOpen(false)}
        onOk={handleConfirmBuild}
        okText={`开始构建 (${selectedMaterialIds.length}/${availableMaterials.length})`}
        cancelText="取消"
        width={520}
      >
        <div className="py-2 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">
                选择资料（已选 {selectedMaterialIds.length} / {availableMaterials.length}）
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
            <div className="max-h-60 overflow-auto space-y-1 border border-gray-100 rounded-lg p-2">
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
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">补充要求（可选）</label>
            <Input.TextArea
              value={customInstruction}
              onChange={e => setCustomInstruction(e.target.value)}
              placeholder="如：重点整理第3章内容、增加对比表格..."
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default WikiBrowser
