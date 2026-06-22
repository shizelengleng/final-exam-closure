import { useState } from 'react'
import { Modal, Button, Input, Space } from 'antd'

interface CheckpointModalProps {
  visible: boolean
  checkpoint: number
  title: string
  icon: string
  onApprove: () => void
  onReject: (notes?: string) => void
  onSkip?: () => void
  children: React.ReactNode
}

const CheckpointModal = ({
  visible,
  title,
  icon,
  onApprove,
  onReject,
  onSkip,
  children,
}: CheckpointModalProps) => {
  const [showModifyInput, setShowModifyInput] = useState(false)
  const [modifyNotes, setModifyNotes] = useState('')

  const handleReject = () => {
    setShowModifyInput(true)
  }

  const handleSubmitModify = () => {
    onReject(modifyNotes || undefined)
    setShowModifyInput(false)
    setModifyNotes('')
  }

  const handleCancelModify = () => {
    setShowModifyInput(false)
    setModifyNotes('')
  }

  return (
    <Modal
      open={visible}
      title={
        <span className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-semibold">{title}</span>
        </span>
      }
      width="85%"
      style={{ top: '5vh', maxHeight: '85vh' }}
      styles={{ body: { maxHeight: 'calc(85vh - 120px)', overflow: 'auto', minHeight: 300 } }}
      footer={
        showModifyInput ? (
          <div className="w-full">
            <Input.TextArea
              value={modifyNotes}
              onChange={(e) => setModifyNotes(e.target.value)}
              placeholder="请输入修改意见（可选）..."
              rows={3}
              className="mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button onClick={handleCancelModify}>取消</Button>
              <Button type="primary" onClick={handleSubmitModify}>
                重新生成
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between w-full">
            <div>
              {onSkip && (
                <Button danger size="small" onClick={onSkip}>
                  跳过
                </Button>
              )}
            </div>
            <Space>
              <Button onClick={handleReject}>返回修改</Button>
              <Button type="primary" onClick={onApprove}>
                确认
              </Button>
            </Space>
          </div>
        )
      }
      closable={false}
      maskClosable={false}
    >
      {children}
    </Modal>
  )
}

export default CheckpointModal
