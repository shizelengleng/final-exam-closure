import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Select, Input, Switch, message, Empty, Tag, Space, Dropdown } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import { FileTextOutlined, AudioOutlined, VideoCameraOutlined, SaveOutlined, ExportOutlined, DownloadOutlined, CheckOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import ConversationPanel from '../Common/ConversationPanel'
import MaterialPicker from '../Common/MaterialPicker'
import OrchestrationProgress from './OrchestrationProgress'
import PhaseContextPanel from './PhaseContextPanel'
import CheckpointModal from './CheckpointModal'
import CheckpointOutline from './CheckpointOutline'
import CheckpointStyle from './CheckpointStyle'
import CheckpointReview from './CheckpointReview'
import ErrorBoundary from '../Common/ErrorBoundary'
import { useOrchestrationStore } from '../../stores/orchestrationStore'
import type { Material } from '../Common/MaterialPicker'

interface ContentGeneratorProps {
  subjectId: string
  subjectName?: string
  defaultMode?: 'document' | 'article' | 'video'
}

type ContentMode = 'document' | 'article' | 'video'

const MODE_CONFIG: Record<ContentMode, { label: string; icon: React.ReactNode; desc: string; color: string }> = {
  document: { label: '复习文档', icon: <FileTextOutlined />, desc: '系统化的期末复习资料', color: '#1677ff' },
  article: { label: '知识文章', icon: <AudioOutlined />, desc: '深度知识讲解文章', color: '#52c41a' },
  video: { label: '视频脚本', icon: <VideoCameraOutlined />, desc: '教学视频脚本', color: '#722ed1' },
}

const TEMPLATES: Record<ContentMode, { value: string; label: string }[]> = {
  document: [
    { value: 'general', label: '通用复习文档' },
    { value: 'quick_ref', label: '速查手册' },
    { value: 'recite', label: '背诵手册' },
    { value: 'analysis', label: '材料分析题' },
  ],
  article: [
    { value: 'general', label: '通用文章' },
    { value: 'deep_dive', label: '深度讲解' },
    { value: 'tutorial', label: '教程指南' },
  ],
  video: [
    { value: 'general', label: '通用脚本' },
    { value: 'lecture', label: '课堂讲解' },
    { value: 'explainer', label: '知识科普' },
  ],
}

interface DocVersion {
  id: string
  label: string
  content: string
  createdAt: string
}

const ContentGenerator = ({ subjectId, subjectName, defaultMode = 'document' }: ContentGeneratorProps) => {
  const [mode, setMode] = useState<ContentMode>(defaultMode)
  const [template, setTemplate] = useState('general')
  const [instruction, setInstruction] = useState('')
  const [instructionHistory, setInstructionHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('instructionHistory') || '[]') } catch { return [] }
  })
  const [generatedTitle, setGeneratedTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([])

  const [versions, setVersions] = useState<DocVersion[]>([])
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0)
  const [contextPrompt, setContextPrompt] = useState('')
  const [skillMode, setSkillMode] = useState(false)
  const [orchestrationId, setOrchestrationId] = useState<string | null>(null)
  const orchestratingRef = useRef(false)
  const { isActive: isOrchestrating, snapshot: orchSnapshot, setSnapshot, isCollapsed, setCollapsed, clear: clearOrchestration } = useOrchestrationStore()

  const generatedContent = versions[currentVersionIndex]?.content || ''

  useEffect(() => {
    loadMaterials()
  }, [subjectId])

  useEffect(() => {
    if (isOrchestrating) {
      setCollapsed(true)
    } else {
      setCollapsed(false)
    }
  }, [isOrchestrating, setCollapsed])

  const loadMaterials = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    setAllMaterials(all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId))
  }

  const addVersion = (content: string, label: string) => {
    const newVersion: DocVersion = {
      id: `v_${Date.now()}`,
      label,
      content,
      createdAt: new Date().toLocaleString('zh-CN'),
    }
    setVersions((prev) => {
      const next = [...prev, newVersion]
      setCurrentVersionIndex(next.length - 1)
      return next
    })
  }

  const saveInstructionToHistory = useCallback((text: string) => {
    if (!text.trim()) return
    setInstructionHistory((prev) => {
      const next = [text, ...prev.filter((h) => h !== text)].slice(0, 10)
      localStorage.setItem('instructionHistory', JSON.stringify(next))
      return next
    })
  }, [])

  const handleGenerate = async () => {
    if (selectedMaterials.length === 0) {
      message.warning('请先选择资料')
      return
    }
    saveInstructionToHistory(instruction)

    if (skillMode) {
      await handleOrchestrateGenerate()
      return
    }

    setLoading(true)
    try {
      const mats = selectedMaterials.map((m) => ({ name: m.name, content: m.content }))
      const result = await window.electron?.ai.generateDocument(mats, instruction, template, subjectName)
      if (!result || !result.content) {
        message.error('AI 返回内容为空，请重试')
        return
      }
      setGeneratedTitle(result.title || '复习文档')
      setVersions([])
      addVersion(result.content, '初始版本')
      setContextPrompt(`你正在帮助用户修改一份${MODE_CONFIG[mode].label}。以下是当前文档内容：\n\n${result.content.substring(0, 8000)}\n\n用户可以要求你修改文档。请根据用户要求修改并返回完整的修改后文档。`)
      message.success(`${MODE_CONFIG[mode].label}生成成功`)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '生成失败'
      message.error(errMsg.includes('API Key') ? '请先在设置中配置 API Key' : errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleOrchestrateGenerate = async () => {
    if (orchestratingRef.current || isOrchestrating) {
      message.warning('已有生成任务在运行中')
      return
    }
    orchestratingRef.current = true
    setLoading(true)
    // Set orchestrating state immediately so OrchestrationProgress mounts and registers listeners
    setSnapshot({
      id: `temp_${Date.now()}`,
      status: 'running',
      currentPhase: 0,
      currentPhaseName: 'source_processing',
      phaseProgress: null,
      qualityCheckResult: null,
      checkpointData: null,
      elapsedMs: 0,
      error: null,
      failedPhase: null,
      intermediateResults: {
        knowledgePoints: null,
        documentPlan: null,
        styleAnchor: null,
        topicContents: [],
        reviewIssues: [],
      },
    })
    try {
      const mats = selectedMaterials.map((m) => ({ name: m.name, content: m.content }))
      const result = await window.electron?.ai.orchestrateDocument(mats, instruction, template, subjectName)
      if (!result || !result.content) {
        message.error('AI 返回内容为空，请重试')
        return
      }
      setGeneratedTitle(result.title || '复习文档')
      setVersions([])
      addVersion(result.content, '智能生成')
      setOrchestrationId(result.orchestrationId)
      setContextPrompt(`你正在帮助用户修改一份${MODE_CONFIG[mode].label}。以下是当前文档内容：\n\n${result.content.substring(0, 8000)}\n\n用户可以要求你修改文档。请根据用户要求修改并返回完整的修改后文档。`)
      message.success(`智能生成完成，共 ${result.phasesCompleted.length} 个阶段`)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '生成失败'
      if (errMsg === 'cancelled') {
        message.info('已取消生成')
      } else {
        message.error(errMsg.includes('API Key') ? '请先在设置中配置 API Key' : errMsg)
      }
    } finally {
      setLoading(false)
      orchestratingRef.current = false
      clearOrchestration()
    }
  }

  const handleConversationSend = async (userMessage: string): Promise<string> => {
    const mats = selectedMaterials.map((m) => ({ name: m.name, content: m.content }))
    const revised = await window.electron?.ai.reviseDocument(generatedContent, userMessage, mats.length > 0 ? mats : undefined)
    if (revised) {
      addVersion(revised, `修改 v${versions.length}`)
      setContextPrompt(`你正在帮助用户修改一份${MODE_CONFIG[mode].label}。以下是当前文档内容：\n\n${revised.substring(0, 8000)}\n\n用户可以要求你修改文档。请根据用户要求修改并返回完整的修改后文档。`)
      return `文档已修改（第 ${versions.length + 1} 版），请查看中间预览区。`
    }
    throw new Error('修改失败')
  }

  const handleSave = async () => {
    if (!generatedContent) { message.warning('请先生成内容'); return }
    const result = await window.electron?.wiki.saveQueryResult(subjectId, generatedTitle || '复习文档', generatedContent)
    if (result?.success) message.success('已保存到 Wiki')
    else message.error(result?.error || '保存失败')
  }

  const handleExportMd = async () => {
    if (!generatedContent) return
    await window.electron?.file.saveFile(generatedContent, `${generatedTitle || '复习文档'}.md`)
  }

  const handleExportPdf = async () => {
    if (!generatedContent) return
    const result = await window.electron?.file.exportPdf(generatedContent, `${generatedTitle || '复习文档'}.pdf`)
    if (result?.path) message.success('已导出 PDF')
    else if (result?.error) message.error(`导出失败: ${result.error}`)
  }

  return (
    <div className="flex h-full gap-4 p-4">
      {/* Left: Config */}
      <div
        className={`flex-shrink-0 flex flex-col gap-3 transition-all duration-200 ease-in-out ${
          isCollapsed ? 'w-12' : 'w-72'
        }`}
      >
        {isCollapsed ? (
          <div className="bg-white rounded-xl p-2 shadow-sm flex flex-col items-center gap-3 pt-3">
            <button
              onClick={() => setCollapsed(false)}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm transition-colors"
              title="展开配置"
            >
              ⚙️
            </button>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-sm">
              ⚡
            </div>
          </div>
        ) : (
          <>
            {/* Collapse button during orchestration */}
            {isOrchestrating && (
              <button
                onClick={() => setCollapsed(true)}
                className="bg-white rounded-xl p-2 shadow-sm flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                title="收起面板"
              >
                <span>◀</span>
                <span>收起</span>
              </button>
            )}
            {/* Mode Cards - Scrollable */}
            <div className="bg-white rounded-xl p-3 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
                {(Object.entries(MODE_CONFIG) as [ContentMode, typeof MODE_CONFIG[ContentMode]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => { setMode(key); setTemplate('general') }}
                    className={`flex-shrink-0 w-44 p-3 rounded-lg border-2 transition-all text-left ${
                      mode === key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                    }`}
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ color: config.color }}>{config.icon}</span>
                      <span className="text-sm font-medium text-gray-800">{config.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">{config.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Template + Instruction + Generate */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">模板</p>
                  <Select value={template} onChange={setTemplate} className="w-full" size="small"
                    options={TEMPLATES[mode]} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-600">补充说明</p>
                    {instructionHistory.length > 0 && (
                      <Dropdown
                        menu={{
                          items: instructionHistory.map((h, i) => ({ key: String(i), label: h.substring(0, 50) + (h.length > 50 ? '...' : '') })),
                          onClick: ({ key }) => setInstruction(instructionHistory[Number(key)]),
                        }}
                        trigger={['click']}
                      >
                        <Button type="text" size="small" icon={<HistoryOutlined />} className="!text-xs !p-0 !h-4" />
                      </Dropdown>
                    )}
                  </div>
                  <Input.TextArea rows={2} size="small" placeholder="如：重点复习第3章..."
                    value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ThunderboltOutlined className="text-xs text-amber-500" />
                    <span className="text-xs font-medium text-gray-600">智能模式</span>
                  </div>
                  <Switch
                    size="small"
                    checked={skillMode}
                    onChange={setSkillMode}
                    disabled={loading}
                  />
                </div>
                {skillMode && (
                  <p className="text-[10px] text-gray-400 -mt-1">
                    多阶段生成，质量更高，支持中途确认
                  </p>
                )}
                <Button type="primary" block loading={loading} onClick={handleGenerate}
                  disabled={selectedMaterialIds.length === 0}>
                  {loading ? '生成中...' : skillMode ? `智能生成${MODE_CONFIG[mode].label}` : `生成${MODE_CONFIG[mode].label}`}
                </Button>
              </div>
            </div>

            {/* Materials - Expanded */}
            <div className="bg-white rounded-xl p-4 shadow-sm flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-700">选择资料</span>
                {selectedMaterialIds.length > 0 && (
                  <Tag color="blue" className="!text-xs !ml-auto">{selectedMaterialIds.length} 份</Tag>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <MaterialPicker value={selectedMaterialIds} onChange={(ids, mats) => {
                  setSelectedMaterialIds(ids)
                  setSelectedMaterials(mats || allMaterials.filter(m => ids.includes(m.id)))
                }} materials={allMaterials} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Center: Preview + Versions */}
      <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm flex flex-col">
        {/* Orchestration Progress View */}
        {skillMode && isOrchestrating && orchSnapshot ? (
          <ErrorBoundary>
          <OrchestrationProgress
            orchestrationId={orchSnapshot.id}
            onCancel={() => {
              setLoading(false)
              clearOrchestration()
            }}
          />
          </ErrorBoundary>
        ) : generatedContent ? (
          <>
            {/* Title Bar - Sticky */}
            <div className="sticky top-0 z-10 px-4 py-2 border-b border-gray-200 flex items-center justify-between flex-shrink-0 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <Tag color="blue">{MODE_CONFIG[mode].label}</Tag>
                <span className="text-sm font-medium text-gray-700 truncate">{generatedTitle}</span>
                <Tag className="!text-xs">v{currentVersionIndex + 1}/{versions.length}</Tag>
              </div>
              <Space className="flex-shrink-0">
                <Button size="small" icon={<SaveOutlined />} onClick={handleSave}>保存到 Wiki</Button>
                <Button size="small" icon={<ExportOutlined />} onClick={handleExportMd}>Markdown</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportPdf}>PDF</Button>
              </Space>
            </div>

            {/* Version Tabs */}
            {versions.length > 1 && (
              <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0 bg-gray-50">
                <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
                  {versions.map((v, i) => (
                    <button
                      key={v.id}
                      onClick={() => setCurrentVersionIndex(i)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                        i === currentVersionIndex
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {i === currentVersionIndex && <CheckOutlined className="text-xs" />}
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: marked.parse(generatedContent) as string }} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Empty description={<span className="text-gray-400">选择资料后点击生成</span>} />
          </div>
        )}
      </div>

      {/* Right: Context Panel */}
      <div className="w-72 flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col">
        {skillMode && isOrchestrating && orchSnapshot ? (
          <ErrorBoundary>
          <PhaseContextPanel snapshot={orchSnapshot} />
          </ErrorBoundary>
        ) : generatedContent ? (
          <ConversationPanel
            subjectId={subjectId}
            feature={`content-${mode}`}
            contextPrompt={contextPrompt}
            onSend={handleConversationSend}
            placeholder="描述修改需求..."
            showSaveToWiki={false}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <Empty description={<span className="text-xs text-gray-400">生成后可在此对话修改</span>} />
          </div>
        )}
      </div>

      {/* Checkpoint Modals - rendered at top level for proper z-index */}
      <ErrorBoundary>
      {skillMode && isOrchestrating && orchSnapshot?.status === 'paused_checkpoint' && orchSnapshot?.checkpointData && (
        <>
          {orchSnapshot.checkpointData.checkpoint === 1 && orchSnapshot.checkpointData.plan && (
            <CheckpointModal
              visible={true}
              checkpoint={1}
              title="确认文档大纲"
              icon="📋"
              onApprove={() => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 1,
                  approved: true,
                })
              }}
              onReject={(notes) => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 1,
                  approved: false,
                  userNotes: notes,
                })
              }}
              onSkip={() => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 1,
                  approved: false,
                })
              }}
            >
              <CheckpointOutline
                plan={orchSnapshot.checkpointData.plan as any}
                qualityCheck={orchSnapshot.qualityCheckResult}
                onReworkAll={() => {
                  const issues = orchSnapshot.qualityCheckResult?.issues || []
                  window.electron?.orchestrator.resume({
                    orchestrationId: orchSnapshot.id,
                    checkpoint: 1,
                    approved: false,
                    userNotes: `请修复以下质检问题：\n${issues.join('\n')}`,
                  })
                }}
              />
            </CheckpointModal>
          )}

          {orchSnapshot.checkpointData.checkpoint === 2 && orchSnapshot.checkpointData.anchor && (
            <CheckpointModal
              visible={true}
              checkpoint={2}
              title="确认内容风格"
              icon="🎨"
              onApprove={() => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 2,
                  approved: true,
                })
              }}
              onReject={(notes) => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 2,
                  approved: false,
                  userNotes: notes,
                })
              }}
              onSkip={() => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 2,
                  approved: false,
                })
              }}
            >
              <CheckpointStyle anchor={orchSnapshot.checkpointData.anchor as any} />
            </CheckpointModal>
          )}

          {orchSnapshot.checkpointData.checkpoint === 3 && (
            <CheckpointModal
              visible={true}
              checkpoint={3}
              title="确认修复方案"
              icon="🔍"
              onApprove={() => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 3,
                  approved: true,
                })
              }}
              onReject={(notes) => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 3,
                  approved: false,
                  userNotes: notes,
                })
              }}
              onSkip={() => {
                window.electron?.orchestrator.resume({
                  orchestrationId: orchSnapshot.id,
                  checkpoint: 3,
                  approved: false,
                })
              }}
            >
              <CheckpointReview issues={Array.isArray(orchSnapshot.checkpointData.issues) ? orchSnapshot.checkpointData.issues : []} />
            </CheckpointModal>
          )}
        </>
      )}
      </ErrorBoundary>
    </div>
  )
}

export default ContentGenerator
