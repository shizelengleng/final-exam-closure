import { Tag, Typography } from 'antd'

const { Text } = Typography

interface ReviewIssue {
  id: string
  severity: 'critical' | 'warning' | 'info'
  topicId: string | null
  description: string
  suggestedFix: string
}

interface CheckpointReviewProps {
  issues: ReviewIssue[]
}

const SEVERITY_CONFIG = {
  critical: { color: 'red', label: '严重' },
  warning: { color: 'orange', label: '警告' },
  info: { color: 'blue', label: '提示' },
}

const CheckpointReview = ({ issues }: CheckpointReviewProps) => {
  if (issues.length === 0) {
    return (
      <div className="text-center py-8">
        <Text className="text-green-600 text-lg">文档质量良好，无需修复</Text>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Text type="secondary" className="text-sm">
        发现 {issues.length} 个问题
      </Text>
      {issues.map((issue) => {
        const config = SEVERITY_CONFIG[issue.severity] || { color: 'default', label: issue.severity || '未知' }
        return (
          <div
            key={issue.id}
            className="border rounded-lg p-3 bg-gray-50/50"
          >
            <div className="flex items-center gap-2 mb-1">
              <Tag color={config.color} className="!text-xs">{config.label}</Tag>
              {issue.topicId && (
                <Tag className="!text-xs">{issue.topicId}</Tag>
              )}
            </div>
            <div className="text-sm text-gray-700 mb-1">{issue.description}</div>
            {issue.suggestedFix && (
              <div className="text-xs text-gray-500">
                建议：{issue.suggestedFix}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default CheckpointReview
