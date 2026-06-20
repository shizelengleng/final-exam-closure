import { useState, useEffect, useRef } from 'react'
import { Button, Input, Spin, Empty, message, Select, Tag, Collapse } from 'antd'
import { DownloadOutlined, RobotOutlined, SendOutlined, UserOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import MaterialPicker from '../Common/MaterialPicker'
import type { Material } from '../Common/MaterialPicker'

const VIDEO_TEMPLATES = [
  { value: 'lecture', label: '知识点讲解', desc: '将资料转化为讲解视频脚本，含开场、知识点、总结' },
  { value: 'summary', label: '复习总结', desc: '生成复习总结视频脚本，重点突出、节奏紧凑' },
  { value: 'quiz', label: '互动问答', desc: '生成互动问答视频脚本，含问题、答案、解析' },
  { value: 'story', label: '故事化讲解', desc: '用故事化方式讲解知识点，生动有趣' },
  { value: 'custom', label: '自定义', desc: '自由描述你的视频需求' },
]

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface VideoProductionProps {
  subjectId: string
}

const VideoProduction = ({ subjectId }: VideoProductionProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([])
  const [instruction, setInstruction] = useState('')
  const [template, setTemplate] = useState('lecture')
  const [loading, setLoading] = useState(false)
  const [videoTitle, setVideoTitle] = useState('')
  const [videoScript, setVideoScript] = useState('')
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

      const templateInfo = VIDEO_TEMPLATES.find((t) => t.value === template)
      const fullInstruction = template === 'custom'
        ? instruction || '帮我制作视频脚本'
        : `${templateInfo?.desc || ''}。${instruction ? `补充要求：${instruction}` : ''}`

      const result = await window.electron?.ai.generateDocument(matList, fullInstruction, 'video')
      if (!result) throw new Error('生成失败')

      setVideoTitle(result.title)
      setVideoScript(result.content)
      setChatMessages([])
      message.success('视频脚本生成成功')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '生成失败'
      message.error(errMsg.includes('API Key') ? '请先在设置中配置 API Key' : errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveVideo = async () => {
    if (!videoScript) {
      message.warning('请先生成视频脚本')
      return
    }
    try {
      await window.electron?.db.add('documents', {
        id: `video_${Date.now()}`,
        subjectId,
        title: videoTitle || '视频脚本',
        content: videoScript,
        template: 'video',
        createdAt: new Date().toISOString(),
      })
      message.success('视频脚本已保存到本学科')
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
      const revised = await window.electron?.ai.reviseDocument(videoScript, text)
      if (revised) {
        setVideoScript(revised)
        const assistantMsg: ChatMsg = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: '已根据你的要求修改视频脚本',
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

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-6 flex flex-col items-center">
          <h2 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
            <PlayCircleOutlined className="text-purple-500" />
            视频制作
          </h2>
          <p className="text-sm text-gray-500">
            将学习资料转化为视频脚本
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
          <label className="block text-sm font-medium text-gray-700 mb-3">视频类型</label>
          <Select
            value={template}
            onChange={setTemplate}
            className="w-full"
            options={VIDEO_TEMPLATES}
          />
        </div>

        {/* Custom Instruction */}
        {template === 'custom' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">自定义要求</label>
            <Input.TextArea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="描述你想要的视频脚本..."
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
        >
          生成视频脚本
        </Button>

        {/* Generated Script */}
        {videoScript && (
          <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{videoTitle}</h3>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleSaveVideo}
                type="primary"
              >
                保存到学科
              </Button>
            </div>
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: marked(videoScript) }}
            />
          </div>
        )}

        {!videoScript && !loading && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <Empty description="选择资料并生成视频脚本" />
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
              生成后可在此处与 AI 对话修改脚本
            </p>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <RobotOutlined className="text-white text-xs" />
                </div>
              )}
              <div
                className={`max-w-[85%] p-3 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
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
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
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
              disabled={chatLoading || !videoScript}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleRevise}
              loading={chatLoading}
              disabled={!videoScript}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoProduction
