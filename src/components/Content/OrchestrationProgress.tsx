import { useEffect, useRef } from 'react'
import { Tag, Button, Typography, Collapse } from 'antd'
import { StopOutlined, CheckCircleOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons'
import { renderMarkdown } from '../../lib/markdown'
import { useOrchestrationStore } from '../../stores/orchestrationStore'

const { Text } = Typography

const PHASE_LABELS = ['素材分析', '大纲规划', '风格锚定', '并行生成', '终审检查', '修复输出']
const PHASE_ICONS = ['📚', '📋', '🎨', '⚡', '🔍', '🔧']

interface OrchestrationProgressProps {
  orchestrationId: string
  onCancel: () => void
}

const OrchestrationProgress = ({
  onCancel,
}: OrchestrationProgressProps) => {
  const {
    snapshot, setSnapshot,
    liveContent, currentTopicTitle, completedTopics,
    handleStreamEvent,
  } = useOrchestrationStore()
  const contentEndRef = useRef<HTMLDivElement>(null)

  // Subscribe to progress snapshots
  useEffect(() => {
    window.electron?.orchestrator.onProgress((s) => {
      setSnapshot(s as OrchestrationSnapshot)
    })
    return () => {
      window.electron?.orchestrator.removeProgressListener()
    }
  }, [setSnapshot])

  // Subscribe to stream events
  useEffect(() => {
    window.electron?.orchestrator.onStreamEvent((event: StreamEvent) => {
      handleStreamEvent(event)
    })
    return () => {
      window.electron?.orchestrator.removeStreamListener()
    }
  }, [handleStreamEvent])

  // Auto-scroll to bottom of live content
  useEffect(() => {
    if (liveContent) {
      contentEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [liveContent])

  if (!snapshot) return null

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const hasLiveContent = currentTopicTitle || liveContent

  return (
    <div className="flex flex-col h-full">
      {/* Progress Bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-1 mb-2">
          {PHASE_LABELS.map((_label, i) => {
            const isDone = i < snapshot.currentPhase
            const isCurrent = i === snapshot.currentPhase
            return (
              <div key={i} className="flex-1 flex items-center gap-1">
                <div
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    isDone ? 'bg-green-500' : isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'
                  }`}
                />
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{PHASE_ICONS[snapshot.currentPhase]}</span>
            <Text strong className="text-sm">{PHASE_LABELS[snapshot.currentPhase]}</Text>
            {snapshot.status === 'running' && (
              <Tag color="blue" className="!text-xs">进行中</Tag>
            )}
            {snapshot.status === 'paused_checkpoint' && (
              <Tag color="orange" className="!text-xs">等待确认</Tag>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Text type="secondary" className="text-xs">{formatTime(snapshot.elapsedMs)}</Text>
            {snapshot.status !== 'completed' && snapshot.status !== 'failed' && (
              <Button size="small" icon={<StopOutlined />} onClick={onCancel} danger>
                取消
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Phase Detail Area */}
      <div className="flex-1 overflow-auto p-4">
        {/* Live Content View — shown for any phase with active streaming */}
        {hasLiveContent && (
          <div className="mb-4">
            {/* Completed Topics (Phase 3) */}
            {completedTopics.length > 0 && (
              <div className="mb-3">
                <Text type="secondary" className="text-xs block mb-2">
                  已完成 {completedTopics.length} 个专题
                </Text>
                <Collapse
                  size="small"
                  items={completedTopics.map((t) => ({
                    key: t.id,
                    label: (
                      <div className="flex items-center gap-2">
                        {t.qualityPassed ? (
                          <CheckCircleOutlined className="text-green-500" />
                        ) : (
                          <WarningOutlined className="text-yellow-500" />
                        )}
                        <span className="text-sm">{t.title}</span>
                        <Tag className="!text-xs !ml-auto" color={t.qualityPassed ? 'green' : 'yellow'}>
                          {t.preview.length} 字
                        </Tag>
                      </div>
                    ),
                    children: (
                      <div
                        className="prose prose-xs max-w-none text-gray-600"
                        dangerouslySetInnerHTML={renderMarkdown(t.preview + '...')}
                      />
                    ),
                  }))}
                />
              </div>
            )}

            {/* Currently Generating */}
            {currentTopicTitle && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <LoadingOutlined className="text-blue-500" />
                  <Text strong className="text-sm text-blue-700">正在生成：{currentTopicTitle}</Text>
                  <Tag color="blue" className="!text-xs !ml-auto">{liveContent.length} 字</Tag>
                </div>

                {liveContent ? (
                  <div className="bg-white rounded-lg p-4 max-h-[400px] overflow-auto border border-blue-100">
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={renderMarkdown(liveContent)}
                    />
                    <div ref={contentEndRef} />
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    等待 AI 响应...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Standard progress view — shown when no live content */}
        {!hasLiveContent && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${snapshot.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
              <Text strong>{PHASE_LABELS[snapshot.currentPhase]}</Text>
              <Text type="secondary" className="text-xs ml-auto">
                {snapshot.phaseProgress
                  ? `${snapshot.phaseProgress.current}/${snapshot.phaseProgress.total}`
                  : snapshot.currentPhaseName}
              </Text>
            </div>

            {snapshot.phaseProgress && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{snapshot.phaseProgress.label}</span>
                  <span>{Math.round((snapshot.phaseProgress.current / snapshot.phaseProgress.total) * 100)}%</span>
                </div>
                <div className="bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(snapshot.phaseProgress.current / snapshot.phaseProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {snapshot.qualityCheckResult && (
              <div className={`p-3 rounded-lg text-sm ${snapshot.qualityCheckResult.passed ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                {snapshot.qualityCheckResult.passed ? '✓ 质量检查通过' : '⚠ 质量检查有警告'}
                {snapshot.qualityCheckResult.issues.length > 0 && (
                  <ul className="mt-1 text-xs list-disc pl-4">
                    {snapshot.qualityCheckResult.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {snapshot.status === 'failed' && snapshot.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            生成失败：{snapshot.error}
          </div>
        )}

        {snapshot.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
            文档生成完成，用时 {formatTime(snapshot.elapsedMs)}
          </div>
        )}
      </div>
    </div>
  )
}

export default OrchestrationProgress
