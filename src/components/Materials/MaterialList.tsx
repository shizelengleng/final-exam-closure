import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Card, Button, Empty, Tag, message, Input, Popover, Modal, Dropdown } from 'antd'
import {
  InboxOutlined, FilePdfOutlined, FileWordOutlined, FileImageOutlined,
  DeleteOutlined, FileTextOutlined, FolderOutlined, PlusOutlined, CloseOutlined,
  EyeOutlined, StarOutlined, StarFilled, ThunderboltOutlined, SwapOutlined,
  ScanOutlined, LoadingOutlined, CheckCircleOutlined, UploadOutlined,
} from '@ant-design/icons'
import { createWorker } from 'tesseract.js'
import FileViewer from '../Common/FileViewer'
import { UNCATEGORIZED_ID } from '../../App'
import { batchClassify, batchClassifyWithAI, injectBuiltinKeywords } from '../../lib/classifier'

const { Dragger } = Upload

interface MaterialItem {
  id: string
  name: string
  type: string
  size: string
  content: string
  subjectId: string
  tag?: string
  favorite?: boolean
  addedAt: string
  filePath?: string
}

interface TagItem {
  id: string
  name: string
  color: string
}

const DEFAULT_TAGS: TagItem[] = [
  { id: 'default', name: '未分类', color: '#8c8c8c' },
]

interface MaterialListProps {
  subjectId: string
}

const MaterialList = ({ subjectId }: MaterialListProps) => {
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [tags, setTags] = useState<TagItem[]>(DEFAULT_TAGS)
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [showTagModal, setShowTagModal] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#1677ff')
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
  const [viewingMaterial, setViewingMaterial] = useState<MaterialItem | null>(null)
  const [allSubjects, setAllSubjects] = useState<Subject[]>([])
  const isUncategorized = subjectId === UNCATEGORIZED_ID

  // PDF OCR queue
  const [ocrState, setOcrState] = useState<Record<string, 'idle' | 'processing' | 'done' | 'error'>>({})
  const [ocrProgress, setOcrProgress] = useState<{ current: string; remaining: number } | null>(null)
  const ocrQueueRef = useRef<string[]>([])
  const ocrProcessingRef = useRef(false)
  const ocrCancelledRef = useRef(false)
  const ocrEngineRef = useRef<Record<string, 'tesseract' | 'baidu'>>({})

  // Cancel OCR queue on unmount
  useEffect(() => {
    return () => { ocrCancelledRef.current = true }
  }, [])

  const processOcrQueue = useCallback(async () => {
    if (ocrProcessingRef.current) return
    ocrProcessingRef.current = true
    ocrCancelledRef.current = false

    while (ocrQueueRef.current.length > 0 && !ocrCancelledRef.current) {
      const materialId = ocrQueueRef.current.shift()!
      console.log('[OCR Queue] Processing:', materialId)
      // Read from db to avoid stale closure
      const material = await window.electron?.db.get('materials', materialId) as MaterialItem | null
      console.log('[OCR Queue] Material from DB:', material ? { id: material.id, name: material.name, filePath: material.filePath, type: material.type } : 'null')
      if (!material || !material.filePath) {
        console.warn('[OCR Queue] Skipping — no material or no filePath')
        setOcrState(prev => ({ ...prev, [materialId]: 'error' }))
        continue
      }

      setOcrState(prev => ({ ...prev, [materialId]: 'processing' }))
      setOcrProgress({ current: material.name, remaining: ocrQueueRef.current.length })
      try {
        const engine = ocrEngineRef.current[materialId] || 'tesseract'
        const result = await window.electron?.file.ocrPdf(material.filePath, engine)
        console.log('[OCR Queue] Result length:', result?.length || 0)
        if (result) {
          await window.electron?.db.update('materials', materialId, { content: result })
          setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, content: result } : m))
          setOcrState(prev => ({ ...prev, [materialId]: 'done' }))
          // Trigger Wiki build for OCR'd content
          const dir = await window.electron?.wiki.getDir(material.subjectId)
          if (dir) {
            window.electron?.wiki.buildSource(material.subjectId, material.name, result)
              .then(() => window.electron?.wiki.buildWiki(material.subjectId))
              .catch(() => {})
          }
        } else {
          console.warn('[OCR Queue] OCR returned empty/null')
          setOcrState(prev => ({ ...prev, [materialId]: 'error' }))
        }
      } catch (err) {
        console.error('[OCR Queue] Error:', err)
        setOcrState(prev => ({ ...prev, [materialId]: 'error' }))
      }
    }

    setOcrProgress(null)
    ocrProcessingRef.current = false
  }, [])

  const handleOcrPdf = useCallback((materialId: string, engine?: 'tesseract' | 'baidu') => {
    if (ocrQueueRef.current.includes(materialId)) return
    // Store engine choice for this material
    ocrEngineRef.current[materialId] = engine || 'tesseract'
    ocrQueueRef.current.push(materialId)
    setOcrState(prev => ({ ...prev, [materialId]: 'idle' }))
    processOcrQueue()
  }, [processOcrQueue])

  const handleRevertOcr = useCallback(async (materialId: string) => {
    const material = await window.electron?.db.get('materials', materialId) as MaterialItem | null
    if (!material) return
    const placeholder = `[PDF] ${material.name}`
    await window.electron?.db.update('materials', materialId, { content: placeholder })
    setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, content: placeholder } : m))
    setOcrState(prev => ({ ...prev, [materialId]: 'idle' }))
    message.success(`已退回「${material.name}」的 OCR 结果，可重新识别`)
  }, [])

  useEffect(() => {
    loadData()
    loadSubjects()
  }, [subjectId])

  const loadData = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as MaterialItem[]) || []
    setMaterials(all.filter((m) => m.subjectId === subjectId))
  }

  const loadSubjects = async () => {
    const data = await window.electron?.db.list('subjects')
    const list = (data as Subject[]) || []
    // Auto-inject keywords for subjects that don't have them
    const enriched = list.map((s) => {
      if (!s.keywords || s.keywords.length === 0) {
        const injected = injectBuiltinKeywords({ name: s.name })
        if (injected.length > 0) return { ...s, keywords: injected }
      }
      return s
    })
    setAllSubjects(enriched)
  }

  const handleAddTag = () => {
    if (!newTagName.trim()) {
      message.warning('请输入标签名称')
      return
    }
    const newTag: TagItem = {
      id: `tag_${Date.now()}`,
      name: newTagName.trim(),
      color: newTagColor,
    }
    setTags((prev) => [...prev, newTag])
    setNewTagName('')
    message.success('已添加标签')
  }

  const handleDeleteTag = (id: string) => {
    if (id === 'default') return
    setTags((prev) => prev.filter((t) => t.id !== id))
    setMaterials((prev) =>
      prev.map((m) => (m.tag === id ? { ...m, tag: 'default' } : m))
    )
    message.success('已删除标签')
  }

  const handleAssignTag = async (materialId: string, tagId: string) => {
    await window.electron?.db.update('materials', materialId, { tag: tagId })
    setMaterials((prev) =>
      prev.map((m) => (m.id === materialId ? { ...m, tag: tagId } : m))
    )
    setEditingMaterialId(null)
  }

  const readFileContent = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (ext === 'md' || ext === 'txt') {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(file)
      })
    }
    if (ext === 'pdf') {
      return `[PDF] ${file.name}`
    }
    if (ext === 'docx' || ext === 'doc') {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const result = await window.electron?.ipcRenderer.invoke('file:readDocx', Array.from(new Uint8Array(arrayBuffer)))
        return (result as string) || `[DOCX] ${file.name}`
      } catch {
        return `[DOCX] ${file.name}`
      }
    }
    return `[${ext.toUpperCase()}] ${file.name}`
  }

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop() || ''
    const typeMap: Record<string, string> = {
      pdf: 'pdf', docx: 'docx', doc: 'docx',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
      md: 'markdown', txt: 'text',
    }

    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)

    message.loading({ content: isImage ? '正在识别图片文字...' : '正在读取文件内容...', key: 'upload', duration: 0 })
    let content = isImage ? '' : await readFileContent(file)

    // OCR for image files
    if (isImage) {
      try {
        const worker = await createWorker('chi_sim+eng')
        const { data } = await worker.recognize(file)
        content = data.text || `[图片] ${file.name}`
        await worker.terminate()
      } catch {
        content = `[图片] ${file.name}`
      }
    }

    let filePath = ''
    try {
      const arrayBuffer = await file.arrayBuffer()
      const saveResult = await window.electron?.file.saveUpload(file.name, Array.from(new Uint8Array(arrayBuffer)))
      if (saveResult?.path) filePath = saveResult.path
    } catch {
      // Non-critical
    }

    message.destroy('upload')

    let assignedTag = selectedTag !== 'all' ? selectedTag : 'default'

    const newMaterial: MaterialItem = {
      id: `mat_${Date.now()}`,
      name: file.name,
      type: typeMap[ext] || ext,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      content,
      subjectId,
      tag: assignedTag,
      addedAt: new Date().toLocaleString('zh-CN'),
      filePath,
    }

    await window.electron?.db.add('materials', newMaterial)
    setMaterials((prev) => [newMaterial, ...prev])

    const tagName = tags.find((t) => t.id === assignedTag)?.name || '未分类'
    message.success(`已上传: ${file.name} (标签: ${tagName})`)

    // 触发 Wiki 构建（后台静默执行，跳过 PDF 占位内容）
    if (ext !== 'pdf') {
      window.electron?.wiki.getDir(subjectId).then(dir => {
        if (dir && content) {
          window.electron?.wiki.buildSource(subjectId, file.name, content)
            .then(() => window.electron?.wiki.buildWiki(subjectId))
            .catch(() => {})
        }
      })
    }
    return false
  }

  const handleDelete = async (id: string) => {
    await window.electron?.db.delete('materials', id)
    setMaterials((prev) => prev.filter((m) => m.id !== id))
    message.success('已删除')
  }

  const handleToggleFavorite = async (id: string) => {
    const material = materials.find((m) => m.id === id)
    if (!material) return
    const newFavorite = !material.favorite
    await window.electron?.db.update('materials', id, { favorite: newFavorite })
    setMaterials((prev) =>
      prev.map((m) => (m.id === id ? { ...m, favorite: newFavorite } : m))
    )
    message.success(newFavorite ? '已收藏' : '已取消收藏')
  }

  const handleReclassify = async () => {
    if (materials.length === 0) {
      message.info('没有资料需要重新分类')
      return
    }
    if (allSubjects.length <= 1) {
      message.info('需要至少两个学科才能重新分类')
      return
    }

    const results = await batchClassifyWithAI(
      materials.map((m) => ({ id: m.id, name: m.name, content: m.content || m.name })),
      allSubjects
    )

    // Only move materials that belong to a DIFFERENT subject
    let moved = 0
    const summary: Record<string, number> = {}
    for (const r of results) {
      if (r.subjectId !== subjectId) {
        await window.electron?.db.update('materials', r.materialId, { subjectId: r.subjectId })
        summary[r.subjectName] = (summary[r.subjectName] || 0) + 1
        moved++
      }
    }

    if (moved === 0) {
      message.info('所有资料已正确分类，无需调整')
    } else {
      const summaryText = Object.entries(summary).map(([name, count]) => `${name} ${count} 份`).join('，')
      message.success(`已将 ${moved} 份资料重新分类到：${summaryText}`)
      loadData()
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FilePdfOutlined className="text-red-500 text-lg" />
      case 'docx': return <FileWordOutlined className="text-blue-500 text-lg" />
      case 'image': return <FileImageOutlined className="text-green-500 text-lg" />
      case 'markdown': return <FileTextOutlined className="text-purple-500 text-lg" />
      default: return <FileTextOutlined className="text-gray-500 text-lg" />
    }
  }

  const getTagColor = (tagId: string) =>
    tags.find((t) => t.id === tagId)?.color || '#8c8c8c'
  const getTagName = (tagId: string) =>
    tags.find((t) => t.id === tagId)?.name || '未分类'

  const filtered = selectedTag === 'all'
    ? materials
    : selectedTag === 'favorite'
    ? materials.filter((m) => m.favorite)
    : selectedTag === 'image'
    ? materials.filter((m) => m.type === 'image')
    : selectedTag === 'non-image'
    ? materials.filter((m) => m.type !== 'image')
    : materials.filter((m) => m.tag === selectedTag)

  const sorted = [...filtered].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1
    if (!a.favorite && b.favorite) return 1
    return 0
  })

  // Check if a PDF needs OCR (content is placeholder)
  const needsOcr = (item: MaterialItem) =>
    item.type === 'pdf' && (!item.content || item.content.startsWith('[PDF]'))

  // Re-upload file for materials missing filePath
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [reuploadTarget, setReuploadTarget] = useState<string | null>(null)

  const handleReupload = useCallback(async (materialId: string, file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const saveResult = await window.electron?.file.saveUpload(file.name, Array.from(new Uint8Array(arrayBuffer)))
      if (saveResult?.path) {
        await window.electron?.db.update('materials', materialId, { filePath: saveResult.path })
        setMaterials(prev => prev.map(m => m.id === materialId ? { ...m, filePath: saveResult.path } : m))
        message.success('文件已重新上传')
        // Auto-trigger OCR
        handleOcrPdf(materialId)
      }
    } catch {
      message.error('重新上传失败')
    }
    setReuploadTarget(null)
  }, [handleOcrPdf])

  const ocrMenuItems = (materialId: string) => [
    { key: 'tesseract', label: '本地识别 (Tesseract)', onClick: () => handleOcrPdf(materialId, 'tesseract') },
    { key: 'baidu', label: '云端识别 (百度 OCR)', onClick: () => handleOcrPdf(materialId, 'baidu') },
  ]

  const renderOcrButton = (item: MaterialItem) => {
    if (!needsOcr(item)) return null
    const state = ocrState[item.id] || 'idle'
    const hasFile = !!item.filePath

    if (state === 'done') {
      return <Button type="text" size="small" icon={<CheckCircleOutlined className="text-green-500" />} disabled />
    }
    if (state === 'processing') {
      return <Button type="text" size="small" icon={<LoadingOutlined className="text-blue-500" />} disabled />
    }
    if (!hasFile) {
      return (
        <Button
          type="text"
          size="small"
          icon={<UploadOutlined className="text-gray-400" />}
          onClick={() => { setReuploadTarget(item.id); fileInputRef.current?.click() }}
          title="文件缺失，点击重新上传"
        />
      )
    }
    if (state === 'error') {
      return (
        <Dropdown menu={{ items: ocrMenuItems(item.id) }} trigger={['click']}>
          <Button
            type="text"
            size="small"
            danger
            icon={<ScanOutlined />}
            title="OCR 失败，点击选择引擎重试"
          />
        </Dropdown>
      )
    }
    return (
      <Dropdown menu={{ items: ocrMenuItems(item.id) }} trigger={['click']}>
        <Button
          type="text"
          size="small"
          icon={<ScanOutlined className="text-orange-500" />}
          title="选择 OCR 引擎进行识别"
        />
      </Dropdown>
    )
  }

  // Uncategorized mode: simple layout with local classify to subjects
  if (isUncategorized) {
    const handleLocalClassify = async () => {
      if (materials.length === 0) {
        message.info('没有待分类的资料')
        return
      }
      if (allSubjects.length === 0) {
        message.warning('请先创建至少一个学科')
        return
      }

      const results = await batchClassifyWithAI(
        materials.map((m) => ({ id: m.id, name: m.name, content: m.content || m.name })),
        allSubjects
      )

      if (results.length === 0) {
        message.info('未能匹配到任何学科，可为学科添加更多关键词')
        return
      }

      for (const r of results) {
        await window.electron?.db.update('materials', r.materialId, { subjectId: r.subjectId })
      }

      // Build summary
      const summary: Record<string, number> = {}
      for (const r of results) {
        summary[r.subjectName] = (summary[r.subjectName] || 0) + 1
      }
      const summaryText = Object.entries(summary).map(([name, count]) => `${name} ${count} 份`).join('，')
      message.success(`已分类 ${results.length} 份：${summaryText}`)
      loadData()
    }

    return (
      <div className="flex flex-col gap-4 p-6 max-w-4xl mx-auto">
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">未分类资料</h2>
          <p className="text-sm text-gray-500">上传文件后，点击一键分类自动分配到各学科（基于关键词匹配）</p>
        </div>

        <Dragger
          multiple
          showUploadList={false}
          beforeUpload={(file) => { handleUpload(file as unknown as File); return false }}
          className="bg-white rounded-lg"
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持 PDF、Word、图片等，图片会自动识别文字</p>
        </Dragger>

        {materials.length > 0 && (
          <div className="flex items-center gap-3">
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleLocalClassify}
              disabled={allSubjects.length === 0}
              size="large"
            >
              一键分类到学科
            </Button>
            {allSubjects.length === 0 && (
              <span className="text-sm text-gray-400">请先创建学科</span>
            )}
            <span className="text-sm text-gray-400 ml-auto">
              共 {materials.length} 份待分类
              {allSubjects.length > 0 && ` · ${allSubjects.length} 个学科`}
            </span>
          </div>
        )}

        {materials.length > 0 ? (
          <div className="space-y-3">
            {materials.map((item) => (
              <Card key={item.id} size="small" hoverable className="shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.type === 'image' && item.filePath ? (
                      <img
                        src={`file://${item.filePath}`}
                        alt={item.name}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      getTypeIcon(item.type)
                    )}
                    <div>
                      <p
                        className="font-medium text-gray-800 hover:text-blue-500 cursor-pointer flex items-center gap-1"
                        onClick={() => setViewingMaterial(item)}
                      >
                        {item.name}
                        <EyeOutlined className="text-xs text-gray-400" />
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.size} · {item.addedAt}
                        {item.content && !item.content.startsWith('[PDF]') && <span className="ml-2 text-green-500">已读取</span>}
                        {needsOcr(item) && (
                          <span className="ml-2 text-orange-500">
                            {!item.filePath ? '文件缺失' : ocrState[item.id] === 'processing' ? '识别中...' : ocrState[item.id] === 'done' ? '已识别' : ocrState[item.id] === 'error' ? '识别失败' : '待识别'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderOcrButton(item)}
                    <Tag color="blue">{item.type}</Tag>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description="还没有资料，上传一份开始吧" className="mt-12" />
        )}

        <FileViewer material={viewingMaterial} open={!!viewingMaterial} onClose={() => setViewingMaterial(null)} onRevertOcr={handleRevertOcr} />

        {/* OCR 浮窗进度 */}
        {ocrProgress && (
          <div className="fixed bottom-6 left-6 z-50 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 flex items-center gap-3 max-w-sm">
            <LoadingOutlined className="text-blue-500 text-lg" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">正在 OCR 识别</p>
              <p className="text-xs text-gray-500 truncate">{ocrProgress.current}</p>
              {ocrProgress.remaining > 0 && (
                <p className="text-xs text-gray-400">队列中还有 {ocrProgress.remaining} 个文件</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4 p-6">
      {/* Single hidden file input for re-upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && reuploadTarget) handleReupload(reuploadTarget, file)
          e.target.value = ''
        }}
      />
      {/* Left: Tag Sidebar */}
      <div className="w-52 flex-shrink-0 bg-white rounded-xl p-4 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">标签</h3>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setShowTagModal(true)}
          />
        </div>

        <div className="space-y-1 flex-1 overflow-auto">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTag === 'all' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'
            }`}
            onClick={() => setSelectedTag('all')}
          >
            <FolderOutlined />
            <span className="text-sm">全部资料</span>
            <span className="text-xs text-gray-400 ml-auto">{materials.length}</span>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTag === 'favorite' ? 'bg-yellow-50 text-yellow-600' : 'hover:bg-gray-50'
            }`}
            onClick={() => setSelectedTag('favorite')}
          >
            <StarFilled className="text-yellow-500" />
            <span className="text-sm">收藏</span>
            <span className="text-xs text-gray-400 ml-auto">{materials.filter((m) => m.favorite).length}</span>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTag === 'image' ? 'bg-green-50 text-green-600' : 'hover:bg-gray-50'
            }`}
            onClick={() => setSelectedTag('image')}
          >
            <FileImageOutlined />
            <span className="text-sm">图片</span>
            <span className="text-xs text-gray-400 ml-auto">{materials.filter((m) => m.type === 'image').length}</span>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTag === 'non-image' ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-50'
            }`}
            onClick={() => setSelectedTag('non-image')}
          >
            <FileTextOutlined />
            <span className="text-sm">非图片</span>
            <span className="text-xs text-gray-400 ml-auto">{materials.filter((m) => m.type !== 'image').length}</span>
          </div>

          {tags.map((tag) => {
            const count = materials.filter((m) => m.tag === tag.id).length
            return (
              <div
                key={tag.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
                  selectedTag === tag.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'
                }`}
                onClick={() => setSelectedTag(tag.id)}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="text-sm flex-1 truncate">{tag.name}</span>
                <span className="text-xs text-gray-400">{count}</span>
                {tag.id !== 'default' && (
                  <Button
                    type="text"
                    size="small"
                    className="opacity-0 group-hover:opacity-100 !p-0"
                    icon={<CloseOutlined className="text-xs" />}
                    onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id) }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: Material List */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">我的资料</h2>
          <p className="text-sm text-gray-500">上传 PDF、Word、Markdown 等复习资料</p>
        </div>

        {materials.length > 0 && (
          <div className="flex gap-2">
            <Button
              icon={<SwapOutlined />}
              onClick={handleReclassify}
              disabled={allSubjects.length <= 1}
              size="small"
            >
              重新分类
            </Button>
            {materials.some(m => needsOcr(m)) && (
              <Dropdown menu={{ items: [
                { key: 'tesseract', label: '全部本地识别 (Tesseract)', onClick: () => {
                  const pdfIds = materials.filter(m => needsOcr(m) && !ocrQueueRef.current.includes(m.id) && ocrState[m.id] !== 'processing' && ocrState[m.id] !== 'done').map(m => m.id)
                  pdfIds.forEach(id => { ocrEngineRef.current[id] = 'tesseract' })
                  ocrQueueRef.current.push(...pdfIds)
                  setOcrState(prev => { const next = { ...prev }; pdfIds.forEach(id => { next[id] = 'idle' }); return next })
                  processOcrQueue()
                }},
                { key: 'baidu', label: '全部云端识别 (百度 OCR)', onClick: () => {
                  const pdfIds = materials.filter(m => needsOcr(m) && !ocrQueueRef.current.includes(m.id) && ocrState[m.id] !== 'processing' && ocrState[m.id] !== 'done').map(m => m.id)
                  pdfIds.forEach(id => { ocrEngineRef.current[id] = 'baidu' })
                  ocrQueueRef.current.push(...pdfIds)
                  setOcrState(prev => { const next = { ...prev }; pdfIds.forEach(id => { next[id] = 'idle' }); return next })
                  processOcrQueue()
                }},
              ] }} trigger={['click']}>
                <Button
                  icon={<ScanOutlined />}
                  size="small"
                  type="default"
                >
                  一键 OCR 所有 PDF
                </Button>
              </Dropdown>
            )}
          </div>
        )}

        <Dragger
          multiple
          showUploadList={false}
          beforeUpload={(file) => { handleUpload(file as unknown as File); return false }}
          className="bg-white rounded-lg"
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持 PDF、DOCX、Markdown、图片格式，当前标签：
            {selectedTag === 'all' ? '全部' : getTagName(selectedTag)}
          </p>
        </Dragger>

        {sorted.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              共 {sorted.length} 份资料
              {selectedTag === 'favorite' && ' (收藏)'}
              {selectedTag === 'image' && ' (图片)'}
              {selectedTag === 'non-image' && ' (非图片)'}
              {selectedTag !== 'all' && selectedTag !== 'favorite' && selectedTag !== 'image' && selectedTag !== 'non-image' && ` (标签: ${getTagName(selectedTag)})`}
            </p>
            {sorted.map((item) => (
              <Card key={item.id} size="small" hoverable className="shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.type === 'image' && item.filePath ? (
                      <img
                        src={`file://${item.filePath}`}
                        alt={item.name}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      getTypeIcon(item.type)
                    )}
                    <div>
                      <p
                        className="font-medium text-gray-800 hover:text-blue-500 cursor-pointer flex items-center gap-1"
                        onClick={() => setViewingMaterial(item)}
                      >
                        {item.name}
                        <EyeOutlined className="text-xs text-gray-400" />
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.size} · {item.addedAt}
                        {item.content && !item.content.startsWith('[PDF]') && <span className="ml-2 text-green-500">已读取</span>}
                        {needsOcr(item) && (
                          <span className="ml-2 text-orange-500">
                            {!item.filePath ? '文件缺失' : ocrState[item.id] === 'processing' ? '识别中...' : ocrState[item.id] === 'done' ? '已识别' : ocrState[item.id] === 'error' ? '识别失败' : '待识别'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="text"
                      icon={item.favorite ? <StarFilled className="text-yellow-500" /> : <StarOutlined className="text-gray-400" />}
                      onClick={() => handleToggleFavorite(item.id)}
                    />
                    <Popover
                      trigger="click"
                      open={editingMaterialId === item.id}
                      onOpenChange={(open) => setEditingMaterialId(open ? item.id : null)}
                      content={
                        <div className="w-48">
                          <p className="text-xs text-gray-500 mb-2">分配到标签：</p>
                          {tags.map((tag) => (
                            <div
                              key={tag.id}
                              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 text-sm ${
                                item.tag === tag.id ? 'bg-blue-50 text-blue-600' : ''
                              }`}
                              onClick={() => handleAssignTag(item.id, tag.id)}
                            >
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                            </div>
                          ))}
                        </div>
                      }
                    >
                      <Tag
                        color={getTagColor(item.tag || 'default')}
                        className="cursor-pointer"
                        style={{ borderColor: getTagColor(item.tag || 'default') }}
                      >
                        {getTagName(item.tag || 'default')}
                      </Tag>
                    </Popover>
                    {renderOcrButton(item)}
                    <Tag color="blue">{item.type}</Tag>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description="还没有资料，上传一份开始吧" className="mt-12" />
        )}
      </div>

      {/* Tag Management Modal */}
      <Modal
        title="管理标签"
        open={showTagModal}
        onCancel={() => setShowTagModal(false)}
        footer={null}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="新标签名称" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} onPressEnter={handleAddTag} />
            <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0" />
            <Button type="primary" onClick={handleAddTag}>添加</Button>
          </div>
          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm">{tag.name}</span>
                  <span className="text-xs text-gray-400">({materials.filter((m) => m.tag === tag.id).length} 份)</span>
                </div>
                {tag.id !== 'default' && (
                  <Button type="text" danger size="small" onClick={() => handleDeleteTag(tag.id)}>删除</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <FileViewer material={viewingMaterial} open={!!viewingMaterial} onClose={() => setViewingMaterial(null)} onRevertOcr={handleRevertOcr} />

      {/* OCR 浮窗进度 */}
      {ocrProgress && (
        <div className="fixed bottom-6 left-6 z-50 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 flex items-center gap-3 max-w-sm">
          <LoadingOutlined className="text-blue-500 text-lg" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">正在 OCR 识别</p>
            <p className="text-xs text-gray-500 truncate">{ocrProgress.current}</p>
            {ocrProgress.remaining > 0 && (
              <p className="text-xs text-gray-400">队列中还有 {ocrProgress.remaining} 个文件</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MaterialList
