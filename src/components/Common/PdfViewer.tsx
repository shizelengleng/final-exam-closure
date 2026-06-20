import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Spin, Input, message } from 'antd'
import {
  ZoomInOutlined, ZoomOutOutlined, LeftOutlined, RightOutlined,
  RotateLeftOutlined, RotateRightOutlined,
} from '@ant-design/icons'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PdfViewerProps {
  file: File | null
  open: boolean
}

const PdfViewer = ({ file, open }: PdfViewerProps) => {
  const [pdf, setPdf] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5) // Start at 1.5 for better initial quality
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file || !open) {
      setPdf(null)
      setCurrentPage(1)
      setTotalPages(0)
      return
    }
    loadPdf(file)
  }, [file, open])

  useEffect(() => {
    if (pdf) renderPage(currentPage)
  }, [pdf, currentPage, scale, rotation])

  const loadPdf = async (f: File) => {
    setLoading(true)
    try {
      const arrayBuffer = await f.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdfDoc = await loadingTask.promise
      setPdf(pdfDoc)
      setTotalPages(pdfDoc.numPages)
      setCurrentPage(1)
    } catch (err) {
      message.error('PDF 加载失败')
    } finally {
      setLoading(false)
    }
  }

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdf || !canvasRef.current) return

    const page = await pdf.getPage(pageNum)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    // Use higher render resolution at lower zoom levels to keep text sharp
    const renderMultiplier = scale <= 1.0 ? 2.5 : scale <= 1.5 ? 2.0 : 1.5
    const renderScale = scale * renderMultiplier * dpr
    const viewport = page.getViewport({ scale: renderScale, rotation })

    canvas.height = viewport.height
    canvas.width = viewport.width

    // CSS size shows the page at the user-requested scale
    const displayWidth = page.getViewport({ scale, rotation }).width
    const displayHeight = page.getViewport({ scale, rotation }).height
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    await page.render({ canvasContext: ctx, viewport }).promise
  }, [pdf, scale, rotation])

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.2, 4))
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.2, 0.4))
  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1))
  const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1))
  const handleRotateLeft = () => setRotation((r) => (r - 90) % 360)
  const handleRotateRight = () => setRotation((r) => (r + 90) % 360)

  if (!open || !file) return null

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Button size="small" icon={<ZoomOutOutlined />} onClick={handleZoomOut} disabled={scale <= 0.4} />
          <span className="text-xs text-gray-600 min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
          <Button size="small" icon={<ZoomInOutlined />} onClick={handleZoomIn} disabled={scale >= 4} />
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <Button size="small" icon={<RotateLeftOutlined />} onClick={handleRotateLeft} />
          <Button size="small" icon={<RotateRightOutlined />} onClick={handleRotateRight} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="small" icon={<LeftOutlined />} onClick={handlePrevPage} disabled={currentPage <= 1} />
          <span className="text-xs text-gray-600">
            <Input
              size="small"
              value={currentPage}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (v >= 1 && v <= totalPages) setCurrentPage(v)
              }}
              className="!w-12 text-center"
              onPressEnter={(e) => e.currentTarget.blur()}
            />
            <span className="mx-1">/</span>
            <span>{totalPages}</span>
          </span>
          <Button size="small" icon={<RightOutlined />} onClick={handleNextPage} disabled={currentPage >= totalPages} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 truncate max-w-[200px]">{file.name}</span>
        </div>
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-start justify-center p-4"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin tip="加载 PDF 中..." />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="shadow-lg"
          />
        )}
      </div>
    </div>
  )
}

export default PdfViewer
