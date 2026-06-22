import { useEffect } from 'react'
import { Tag, Button, Typography } from 'antd'
import { StopOutlined } from '@ant-design/icons'
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
  const { snapshot, setSnapshot } = useOrchestrationStore()

  useEffect(() => {
    window.electron?.orchestrator.onProgress((s) => {
      setSnapshot(s as OrchestrationSnapshot)
    })
    return () => {
      window.electron?.orchestrator.removeProgressListener()
    }
  }, [setSnapshot])

  if (!snapshot) return null

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress Bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-1 mb-2">
          {PHASE_LABELS.map((label, i) => {
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

        {snapshot.status === 'failed' && snapshot.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            生成失败：{snapshot.error}
          </div>
        )}

        {snapshot.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
            文档生成完成，共 {snapshot.phasesCompleted?.length || 0} 个阶段，用时 {formatTime(snapshot.elapsedMs)}
          </div>
        )}
      </div>
    </div>
  )
}

export default OrchestrationProgress
