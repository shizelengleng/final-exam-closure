import { Tag, Typography, Progress } from 'antd'
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons'

const { Text } = Typography

interface PhaseContextPanelProps {
  snapshot: OrchestrationSnapshot
}

const PhaseContextPanel = ({ snapshot }: PhaseContextPanelProps) => {
  const { currentPhase, intermediateResults, phaseProgress } = snapshot

  if (currentPhase === 0) {
    const points = intermediateResults.knowledgePoints
    return (
      <div className="p-3">
        <Text strong className="text-sm block mb-3">知识点提取</Text>
        {points ? (
          <div className="space-y-2">
            {points.slice(0, 8).map((kp: any, i: number) => (
              <div key={kp.id || i} className="bg-blue-50/50 border border-blue-100 rounded px-2 py-1.5 text-xs">
                {kp.topic}
              </div>
            ))}
            {points.length > 8 && (
              <div className="text-xs text-gray-400">+{points.length - 8} 更多</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400">
            {phaseProgress ? `${phaseProgress.current}/${phaseProgress.total}` : '提取中...'}
          </div>
        )}
      </div>
    )
  }

  if (currentPhase === 1) {
    const points = intermediateResults.knowledgePoints || []
    return (
      <div className="p-3">
        <Text strong className="text-sm block mb-3">已提取知识点</Text>
        <div className="space-y-2">
          {points.map((kp: any, i: number) => (
            <div key={kp.id || i} className="bg-green-50/50 border border-green-100 rounded px-2 py-1.5 text-xs">
              <CheckCircleOutlined className="text-green-500 mr-1" />
              {kp.topic}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (currentPhase === 2) {
    const plan = intermediateResults.documentPlan
    return (
      <div className="p-3">
        <Text strong className="text-sm block mb-3">大纲预览</Text>
        {plan ? (
          <div className="space-y-2">
            {plan.topics.map((t: any, i: number) => (
              <div key={t.id} className="bg-blue-50/50 border border-blue-100 rounded px-2 py-1.5 text-xs">
                <Tag color="blue" className="!text-xs !m-0 mr-1">{i + 1}</Tag>
                {t.title}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400">规划中...</div>
        )}
      </div>
    )
  }

  if (currentPhase === 3) {
    const topics = intermediateResults.topicContents || []
    const plan = intermediateResults.documentPlan
    const total = plan?.topics?.length || 0
    return (
      <div className="p-3">
        <Text strong className="text-sm block mb-3">专题生成进度</Text>
        <div className="space-y-2">
          {plan?.topics?.map((t: any) => {
            const done = topics.some((tc: any) => tc.topicId === t.id)
            return (
              <div key={t.id} className={`border rounded px-2 py-1.5 text-xs ${done ? 'bg-green-50/50 border-green-100' : 'bg-gray-50 border-gray-200'}`}>
                {done ? <CheckCircleOutlined className="text-green-500 mr-1" /> : <LoadingOutlined className="text-blue-500 mr-1" />}
                {t.title}
              </div>
            )
          })}
        </div>
        <div className="mt-3">
          <Progress
            percent={total > 0 ? Math.round((topics.length / total) * 100) : 0}
            size="small"
            format={() => `${topics.length}/${total}`}
          />
        </div>
      </div>
    )
  }

  if (currentPhase >= 4) {
    const issues = intermediateResults.reviewIssues || []
    return (
      <div className="p-3">
        <Text strong className="text-sm block mb-3">审阅结果</Text>
        {snapshot.qualityCheckResult ? (
          <div>
            <Tag color={snapshot.qualityCheckResult.passed ? 'green' : 'orange'}>
              {snapshot.qualityCheckResult.passed ? '通过' : '有问题'}
            </Tag>
            <div className="mt-2 text-xs text-gray-500">
              {issues.length} 个问题
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400">审阅中...</div>
        )}
      </div>
    )
  }

  return null
}

export default PhaseContextPanel
