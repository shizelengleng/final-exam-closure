import { Typography, Tag } from 'antd'
import { marked } from 'marked'

const { Text } = Typography

interface StyleAnchor {
  topicId: string
  content: string
  structuralElements: string[]
  wordCount: number
}

interface CheckpointStyleProps {
  anchor: StyleAnchor
}

const CheckpointStyle = ({ anchor }: CheckpointStyleProps) => {
  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Text strong className="text-base">首个专题预览</Text>
        <Tag color="blue">{anchor.wordCount} 字</Tag>
        <Tag>{anchor.structuralElements.length} 个子标题</Tag>
      </div>

      <div className="border rounded-lg p-4 bg-white max-h-[50vh] overflow-auto">
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{
            __html: marked.parse(anchor.content.substring(0, 5000)) as string,
          }}
        />
        {anchor.content.length > 5000 && (
          <div className="text-gray-400 text-xs mt-4 text-center">
            ... 仅展示前 5000 字 ...
          </div>
        )}
      </div>
    </div>
  )
}

export default CheckpointStyle
