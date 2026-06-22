import { Tag, Typography, Alert, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography

interface TopicPlan {
  id: string
  title: string
  subtopics: string[]
  exerciseStrategy: string
  depthNotes: string
  materialRefs: string[]
}

interface DocumentPlan {
  title: string
  overview: string
  topics: TopicPlan[]
  formatPlan: string
  totalEstimatedTopics: number
}

interface CheckpointOutlineProps {
  plan: DocumentPlan
  qualityCheck?: {
    passed: boolean
    issues: string[]
  } | null
  onReworkAll?: () => void
}

const CheckpointOutline = ({ plan, qualityCheck, onReworkAll }: CheckpointOutlineProps) => {
  const hasIssues = qualityCheck && !qualityCheck.passed && qualityCheck.issues.length > 0

  return (
    <div>
      {/* Quality Check Result */}
      {qualityCheck && (
        <Alert
          type={qualityCheck.passed ? 'success' : 'warning'}
          showIcon
          className="mb-4"
          message={
            <div className="flex items-center justify-between">
              <span>{qualityCheck.passed ? '质量检查通过' : `质量检查有 ${qualityCheck.issues.length} 个警告`}</span>
              {hasIssues && onReworkAll && (
                <Button
                  size="small"
                  type="primary"
                  danger
                  icon={<ReloadOutlined />}
                  onClick={onReworkAll}
                >
                  一键返工
                </Button>
              )}
            </div>
          }
          description={
            qualityCheck.issues.length > 0 ? (
              <ul className="list-disc pl-4 mt-1 text-xs">
                {qualityCheck.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            ) : undefined
          }
        />
      )}

      <Paragraph className="text-sm mb-2">
        <Text strong className="text-base">{plan.title}</Text>
      </Paragraph>
      <Paragraph type="secondary" className="text-xs mb-4">
        {plan.overview}
      </Paragraph>

      <div className="grid grid-cols-2 gap-3">
        {plan.topics.map((topic, i) => (
          <div
            key={topic.id}
            className="bg-blue-50/50 border border-blue-100 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Tag color="blue" className="!text-xs !m-0">{i + 1}</Tag>
              <Text strong className="text-sm">{topic.title}</Text>
            </div>
            <div className="text-xs text-gray-500 mb-1">
              {topic.subtopics.join(' · ')}
            </div>
            <div className="text-xs text-gray-400">
              {topic.exerciseStrategy}
            </div>
          </div>
        ))}
      </div>

      {plan.formatPlan && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <Text className="text-xs text-gray-500">格式要求：{plan.formatPlan}</Text>
        </div>
      )}
    </div>
  )
}

export default CheckpointOutline
