import { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, Empty, Button, Segmented, Spin } from 'antd'
import { FilePdfOutlined, FileWordOutlined, FileTextOutlined, FileImageOutlined, FileExcelOutlined, FilePptOutlined, ZoomInOutlined, ZoomOutOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer'
import PdfViewer from './PdfViewer'

interface Material {
  id: string
  name: string
  type: string
  size: string
  content: string
  addedAt: string
  filePath?: string
}

interface FileViewerProps {
  material: Material | null
  open: boolean
  onClose: () => void
  onRevertOcr?: (materialId: string) => void
}

const getFileExtension = (name: string): string => {
  return name.split('.').pop()?.toLowerCase() || ''
}

const getFileType = (material: Material): string => {
  const ext = getFileExtension(material.name)
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'pptx' || ext === 'ppt') return 'pptx'
  if (ext === 'csv') return 'csv'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'svg'].includes(ext)) return 'image'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'txt') return 'text'
  return material.type || 'text'
}

const FileViewer = ({ material, open, onClose, onRevertOcr }: FileViewerProps) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [docxHtml, setDocxHtml] = useState('')
  const [xlsxHtml, setXlsxHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [docViewerFile, setDocViewerFile] = useState<{ uri: string; fileName: string } | null>(null)

  // Image zoom/pan state
  const [imageScale, setImageScale] = useState(1)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // DOCX page navigation
  const [docxPage, setDocxPage] = useState(1)
  const docxContentRef = useRef<HTMLDivElement>(null)

  const imageContainerRef = useRef<HTMLDivElement>(null)

  const fileType = material ? getFileType(material) : 'text'

  useEffect(() => {
    if (open) {
      setViewMode('formatted')
      setImageScale(1)
      setImagePosition({ x: 0, y: 0 })
      setDocxHtml('')
      setXlsxHtml('')
      setPdfFile(null)
      setDocxPage(1)
      setImageDataUrl(null)
      setDocViewerFile(null)
      setLoading(true)

      // Load file data
      if (material?.filePath) {
        loadFileData(material)
      } else {
        setLoading(false)
      }
    }
  }, [open, material?.id])

  const loadFileData = async (mat: Material) => {
    if (!mat.filePath) return
    try {
      if (fileType === 'pdf') {
        const result = await window.electron?.ipcRenderer.invoke('file:getAsFile', mat.filePath)
        if (result) {
          const uint8 = new Uint8Array(result)
          const blob = new Blob([uint8], { type: 'application/pdf' })
          const file = new File([blob], mat.name, { type: 'application/pdf' })
          setPdfFile(file)
        }
      } else if (fileType === 'image') {
        const dataUrl = await window.electron?.file.readAsBase64(mat.filePath)
        if (dataUrl) {
          setImageDataUrl(dataUrl)
        }
      } else if (fileType === 'docx') {
        const buffer = await window.electron?.ipcRenderer.invoke('file:getAsFile', mat.filePath)
        if (buffer) {
          const html = await window.electron?.ipcRenderer.invoke('file:readDocxFormatted', Array.from(new Uint8Array(buffer)))
          setDocxHtml(html || '')
        }
      } else if (fileType === 'xlsx' || fileType === 'csv') {
        const buffer = await window.electron?.ipcRenderer.invoke('file:getAsFile', mat.filePath)
        if (buffer) {
          const XLSX = await import('xlsx')
          const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
          let html = ''
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName]
            const table = XLSX.utils.sheet_to_html(sheet, { editable: false })
            if (workbook.SheetNames.length > 1) {
              html += `<h3 class="text-sm font-bold text-gray-700 mb-2 mt-4">${sheetName}</h3>`
            }
            html += `<div class="overflow-auto mb-4">${table}</div>`
          }
          setXlsxHtml(html || '<div class="p-4 text-gray-500">文件为空</div>')
        }
      } else if (fileType === 'pptx') {
        const buffer = await window.electron?.ipcRenderer.invoke('file:getAsFile', mat.filePath)
        if (buffer) {
          const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
          const url = URL.createObjectURL(blob)
          setDocViewerFile({ uri: url, fileName: mat.name })
        }
      }
    } catch (err) {
      console.error('Failed to load file:', err)
    } finally {
      setLoading(false)
    }
  }

  // Image zoom/pan handlers
  const handleImageWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setImageScale(prev => Math.min(5, Math.max(0.1, prev + delta)))
  }, [])

  const handleImageMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y })
  }, [imagePosition])

  const handleImageMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setImagePosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  const handleImageMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleImageDoubleClick = useCallback(() => {
    setImageScale(1)
    setImagePosition({ x: 0, y: 0 })
  }, [])

  if (!material) return null

  const renderContent = () => {
    // Image rendering with zoom/pan
    if (fileType === 'image') {
      if (loading) {
        return <div className="flex justify-center items-center h-40"><Spin tip="加载图片..." /></div>
      }
      if (!imageDataUrl) {
        return <Empty description="无法加载图片" />
      }
      return (
        <div className="flex items-center justify-center p-6 bg-gray-50 relative" style={{ minHeight: '60vh' }}>
          <div
            ref={imageContainerRef}
            className={`overflow-hidden relative cursor-grab max-w-full max-h-[75vh] rounded-lg shadow-sm ${isDragging ? 'cursor-grabbing' : ''}`}
            onWheel={handleImageWheel}
            onMouseDown={handleImageMouseDown}
            onMouseMove={handleImageMouseMove}
            onMouseUp={handleImageMouseUp}
            onMouseLeave={handleImageMouseUp}
            onDoubleClick={handleImageDoubleClick}
          >
            <img
              src={imageDataUrl}
              alt={material.name}
              className="select-none"
              draggable={false}
              style={{
                transform: `scale(${imageScale}) translate(${imagePosition.x / imageScale}px, ${imagePosition.y / imageScale}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
            />
          </div>
          <div className="absolute bottom-8 right-8 flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-1">
            <Button type="text" size="small" icon={<ZoomInOutlined />} onClick={() => setImageScale(prev => Math.min(5, prev + 0.2))} title="放大" />
            <Button type="text" size="small" icon={<ZoomOutOutlined />} onClick={() => setImageScale(prev => Math.max(0.1, prev - 0.2))} title="缩小" />
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleImageDoubleClick} title="重置" />
            <span className="text-xs text-gray-500 self-center px-1 select-none">{Math.round(imageScale * 100)}%</span>
          </div>
        </div>
      )
    }

    // Markdown rendering
    if (fileType === 'markdown' && material.content) {
      try {
        const html = marked.parse(material.content) as string
        return (
          <div
            className="prose prose-sm max-w-none p-6 prose-headings:text-gray-800 prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-gray-600 prose-p:leading-relaxed prose-strong:text-gray-800 prose-ul:list-disc prose-ol:list-decimal prose-li:text-gray-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      } catch {
        return <pre className="p-4 text-sm whitespace-pre-wrap">{material.content}</pre>
      }
    }

    // Raw text mode
    if (viewMode === 'raw' && material.content) {
      return (
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed p-4">
          {material.content}
        </pre>
      )
    }

    // XLSX / CSV rendering
    if (fileType === 'xlsx' || fileType === 'csv') {
      if (loading) {
        return <div className="flex justify-center items-center h-40"><Spin tip="加载表格..." /></div>
      }
      if (xlsxHtml) {
        return (
          <div className="p-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
              <FileExcelOutlined className="text-green-500 text-lg" />
              <span className="text-sm text-green-700">{fileType === 'csv' ? 'CSV 文件' : 'Excel 文件'}</span>
            </div>
            <div className="overflow-auto max-h-[70vh]" dangerouslySetInnerHTML={{ __html: xlsxHtml }} />
          </div>
        )
      }
      return <div className="flex justify-center items-center h-40"><Spin /></div>
    }

    // PPTX rendering via react-doc-viewer
    if (fileType === 'pptx') {
      if (docViewerFile) {
        return (
          <div className="h-[75vh]">
            <DocViewer
              documents={[docViewerFile]}
              pluginRenderers={DocViewerRenderers}
              config={{ header: { disableHeader: true } }}
            />
          </div>
        )
      }
      if (loading) {
        return <div className="flex justify-center items-center h-40"><Spin tip="加载 PPT..." /></div>
      }
      return (
        <div className="p-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FilePptOutlined className="text-orange-500 text-xl" />
              <div>
                <p className="text-sm font-medium text-orange-700">PPT 文件</p>
                <p className="text-xs text-orange-500">正在加载预览...</p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // DOCX rendering (formatted HTML)
    if (fileType === 'docx') {
      if (loading) {
        return <div className="flex justify-center items-center h-40"><Spin tip="加载 Word 文档..." /></div>
      }
      if (docxHtml) {
        return (
          <div className="p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
              <FileWordOutlined className="text-blue-500 text-lg" />
              <span className="text-sm text-blue-700">Word 文档</span>
            </div>
            <div
              ref={docxContentRef}
              className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed max-h-[70vh] overflow-auto"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          </div>
        )
      }
      if (material.content) {
        return (
          <div className="p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
              <FileWordOutlined className="text-blue-500 text-lg" />
              <span className="text-sm text-blue-700">Word 文档 - 文本内容</span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-[70vh] overflow-auto">{material.content}</div>
          </div>
        )
      }
    }

    // PDF rendering - use PdfViewer component inline
    if (fileType === 'pdf') {
      if (pdfFile) {
        return (
          <div className="h-[75vh]">
            <PdfViewer file={pdfFile} open={true} />
          </div>
        )
      }
      return (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <FilePdfOutlined className="text-red-500 text-xl" />
              <div>
                <p className="text-sm font-medium text-red-700">PDF 文件</p>
                <p className="text-xs text-red-500">正在加载 PDF 预览...</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center py-8"><Spin /></div>
        </div>
      )
    }

    // Fallback: text content
    if (material.content) {
      return (
        <div className="p-6">
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-[70vh] overflow-auto">{material.content}</div>
        </div>
      )
    }

    return <Empty description="该文件无可读取的内容" />
  }

  const typeIcon: Record<string, React.ReactNode> = {
    pdf: <FilePdfOutlined className="text-red-500" />,
    docx: <FileWordOutlined className="text-blue-500" />,
    xlsx: <FileExcelOutlined className="text-green-500" />,
    pptx: <FilePptOutlined className="text-orange-500" />,
    markdown: <FileTextOutlined className="text-purple-500" />,
    image: <FileImageOutlined className="text-green-500" />,
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          {typeIcon[fileType] || <FileTextOutlined />}
          <span className="truncate max-w-lg">{material.name}</span>
          <span className="text-xs text-gray-400 font-normal">{material.size}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={1100}
      style={{ top: 20 }}
      footer={
        <div className="flex justify-between items-center">
          {fileType !== 'image' && fileType !== 'xlsx' && (
            <div className="flex items-center gap-2">
              <Segmented
                size="small"
                value={viewMode}
                onChange={(v) => setViewMode(v as 'formatted' | 'raw')}
                options={[
                  { label: '格式化', value: 'formatted' },
                  { label: '纯文本', value: 'raw' },
                ]}
              />
              {fileType === 'pdf' && material.content?.includes('[PDF') && material.content?.includes('OCR 识别结果') && onRevertOcr && (
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={() => {
                    onRevertOcr(material.id)
                    onClose()
                  }}
                >
                  退回OCR
                </Button>
              )}
            </div>
          )}
          {(fileType === 'image' || fileType === 'xlsx') && <div />}
          <div className="flex gap-2">
            <span className="text-xs text-gray-400 self-center">
              {material.content?.length?.toLocaleString() || 0} 字符
            </span>
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      }
    >
      <div className="max-h-[80vh] overflow-auto bg-white rounded-lg border border-gray-100">
        {renderContent()}
      </div>
    </Modal>
  )
}

export default FileViewer
