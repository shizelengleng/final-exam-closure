# Smart Generation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the ContentGenerator smart mode UI with adaptive three-panel layout, modal checkpoints, phase-aware right panel, and inline return-to-modify flow.

**Architecture:** ContentGenerator conditionally renders OrchestrationProgress (progress view + modal) during generation. Left panel collapses via CSS transition. Right panel switches content based on orchestrator phase. CheckpointModal handles all three checkpoint types with inline modification input.

**Tech Stack:** React 18, Ant Design 5, Tailwind CSS 3, Zustand, TypeScript

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/Content/ContentGenerator.tsx` | Layout shell, left panel collapse, state routing |
| `src/components/Content/OrchestrationProgress.tsx` | Progress bar, phase cards, quality results (rewritten) |
| `src/components/Content/CheckpointModal.tsx` | Modal shell for all 3 checkpoint types |
| `src/components/Content/CheckpointOutline.tsx` | Checkpoint 1: outline grid with topic cards |
| `src/components/Content/CheckpointStyle.tsx` | Checkpoint 2: style anchor preview |
| `src/components/Content/CheckpointReview.tsx` | Checkpoint 3: review issues list |
| `src/components/Content/PhaseContextPanel.tsx` | Right panel content per phase |
| `src/stores/orchestrationStore.ts` | Add `isCollapsed`, `returnNotes` fields |
| `electron/services/documentOrchestrator.ts` | Return-to-modify: re-run phase with user notes |

---

### Task 1: OrchestrationStore — Add Collapse and Return-Modify State

**Files:**
- Modify: `src/stores/orchestrationStore.ts`

- [ ] **Step 1: Update store interface and implementation**

```typescript
// src/stores/orchestrationStore.ts
import { create } from 'zustand'

interface OrchestrationState {
  snapshot: OrchestrationSnapshot | null
  isActive: boolean
  isCollapsed: boolean
  returnNotes: string
  setSnapshot: (snapshot: OrchestrationSnapshot) => void
  setCollapsed: (collapsed: boolean) => void
  setReturnNotes: (notes: string) => void
  clear: () => void
}

export const useOrchestrationStore = create<OrchestrationState>((set) => ({
  snapshot: null,
  isActive: false,
  isCollapsed: false,
  returnNotes: '',
  setSnapshot: (snapshot) => set({ snapshot, isActive: true }),
  setCollapsed: (isCollapsed) => set({ isCollapsed }),
  setReturnNotes: (returnNotes) => set({ returnNotes }),
  clear: () => set({ snapshot: null, isActive: false, isCollapsed: false, returnNotes: '' }),
}))
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors, build succeeds

---

### Task 2: Left Panel Collapse in ContentGenerator

**Files:**
- Modify: `src/components/Content/ContentGenerator.tsx`

- [ ] **Step 1: Add collapse logic and conditional rendering**

In `ContentGenerator.tsx`, replace the left panel `<div className="w-72 flex-shrink-0 ...">` with:

```tsx
const { isActive: isOrchestrating, snapshot: orchSnapshot, setSnapshot, isCollapsed, setCollapsed, clear: clearOrchestration } = useOrchestrationStore()

// Add effect to collapse when orchestration starts
useEffect(() => {
  if (isOrchestrating) {
    setCollapsed(true)
  } else {
    setCollapsed(false)
  }
}, [isOrchestrating, setCollapsed])
```

Replace the left panel div with:

```tsx
{/* Left: Config */}
<div
  className={`flex-shrink-0 flex flex-col gap-3 transition-all duration-200 ease-in-out ${
    isCollapsed ? 'w-12' : 'w-72'
  }`}
>
  {isCollapsed ? (
    /* Collapsed icon bar */
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
    /* Full config panel — keep existing content */
    <>
      {/* Mode Cards */}
      <div className="bg-white rounded-xl p-3 shadow-sm">
        {/* ... existing mode cards ... */}
      </div>

      {/* Template + Instruction + Generate */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        {/* ... existing template/instruction/generate ... */}
      </div>

      {/* Materials */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex-1 min-h-0 flex flex-col">
        {/* ... existing materials ... */}
      </div>
    </>
  )}
</div>
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 3: CheckpointModal Component

**Files:**
- Create: `src/components/Content/CheckpointModal.tsx`

- [ ] **Step 1: Create CheckpointModal shell**

```tsx
// src/components/Content/CheckpointModal.tsx
import { useState } from 'react'
import { Modal, Button, Input, Space } from 'antd'
import { useOrchestrationStore } from '../../stores/orchestrationStore'

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
  checkpoint,
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
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 4: Checkpoint Outline Panel (Checkpoint 1)

**Files:**
- Create: `src/components/Content/CheckpointOutline.tsx`

- [ ] **Step 1: Create outline checkpoint panel**

```tsx
// src/components/Content/CheckpointOutline.tsx
import { Tag } from 'antd'
import { Typography } from 'antd'

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
}

const CheckpointOutline = ({ plan }: CheckpointOutlineProps) => {
  return (
    <div>
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
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 5: Checkpoint Style Panel (Checkpoint 2)

**Files:**
- Create: `src/components/Content/CheckpointStyle.tsx`

- [ ] **Step 1: Create style checkpoint panel**

```tsx
// src/components/Content/CheckpointStyle.tsx
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
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 6: Checkpoint Review Panel (Checkpoint 3)

**Files:**
- Create: `src/components/Content/CheckpointReview.tsx`

- [ ] **Step 1: Create review checkpoint panel**

```tsx
// src/components/Content/CheckpointReview.tsx
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
        const config = SEVERITY_CONFIG[issue.severity]
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
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 7: PhaseContextPanel (Right Panel Content)

**Files:**
- Create: `src/components/Content/PhaseContextPanel.tsx`

- [ ] **Step 1: Create phase-aware right panel**

```tsx
// src/components/Content/PhaseContextPanel.tsx
import { Tag, Typography, Progress } from 'antd'
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons'

const { Text } = Typography

interface PhaseContextPanelProps {
  snapshot: OrchestrationSnapshot
}

const PhaseContextPanel = ({ snapshot }: PhaseContextPanelProps) => {
  const { currentPhase, intermediateResults, phaseProgress } = snapshot

  // Phase 0: Knowledge points extraction
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

  // Phase 1: Show knowledge points list
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

  // Phase 2: Show outline preview
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

  // Phase 3: Show topic generation status
  if (currentPhase === 3) {
    const topics = intermediateResults.topicContents || []
    const plan = intermediateResults.documentPlan
    const total = plan?.topics?.length || 0
    return (
      <div className="p-3">
        <Text strong className="text-sm block mb-3">专题生成进度</Text>
        <div className="space-y-2">
          {plan?.topics?.map((t: any, i: number) => {
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

  // Phase 4-5: Show quality results
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
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 8: Rewrite OrchestrationProgress with Progress View + Modal

**Files:**
- Rewrite: `src/components/Content/OrchestrationProgress.tsx`

- [ ] **Step 1: Rewrite OrchestrationProgress**

```tsx
// src/components/Content/OrchestrationProgress.tsx
import { useEffect } from 'react'
import { Tag, Button, Typography } from 'antd'
import { StopOutlined } from '@ant-design/icons'
import { useOrchestrationStore } from '../../stores/orchestrationStore'
import CheckpointModal from './CheckpointModal'
import CheckpointOutline from './CheckpointOutline'
import CheckpointStyle from './CheckpointStyle'
import CheckpointReview from './CheckpointReview'

const { Text } = Typography

const PHASE_LABELS = ['素材分析', '大纲规划', '风格锚定', '并行生成', '终审检查', '修复输出']
const PHASE_ICONS = ['📚', '📋', '🎨', '⚡', '🔍', '🔧']

interface OrchestrationProgressProps {
  orchestrationId: string
  onCancel: () => void
  onCheckpointApprove: (checkpoint: number) => void
  onCheckpointReject: (checkpoint: number, notes?: string) => void
  onCheckpointSkip: (checkpoint: number) => void
}

const OrchestrationProgress = ({
  orchestrationId,
  onCancel,
  onCheckpointApprove,
  onCheckpointReject,
  onCheckpointSkip,
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

  const isCheckpoint = snapshot.status === 'paused_checkpoint' && snapshot.checkpointData
  const checkpointData = snapshot.checkpointData

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
        {/* Current Phase Card */}
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

        {/* Error */}
        {snapshot.status === 'failed' && snapshot.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            生成失败：{snapshot.error}
          </div>
        )}

        {/* Completion */}
        {snapshot.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
            文档生成完成，共 {snapshot.phasesCompleted?.length || 0} 个阶段，用时 {formatTime(snapshot.elapsedMs)}
          </div>
        )}
      </div>

      {/* Checkpoint Modal */}
      {isCheckpoint && checkpointData && (
        <>
          {checkpointData.checkpoint === 1 && checkpointData.plan && (
            <CheckpointModal
              visible={true}
              checkpoint={1}
              title="确认文档大纲"
              icon="📋"
              onApprove={() => onCheckpointApprove(1)}
              onReject={(notes) => onCheckpointReject(1, notes)}
              onSkip={() => onCheckpointSkip(1)}
            >
              <CheckpointOutline plan={checkpointData.plan as any} />
            </CheckpointModal>
          )}

          {checkpointData.checkpoint === 2 && checkpointData.anchor && (
            <CheckpointModal
              visible={true}
              checkpoint={2}
              title="确认内容风格"
              icon="🎨"
              onApprove={() => onCheckpointApprove(2)}
              onReject={(notes) => onCheckpointReject(2, notes)}
              onSkip={() => onCheckpointSkip(2)}
            >
              <CheckpointStyle anchor={checkpointData.anchor as any} />
            </CheckpointModal>
          )}

          {checkpointData.checkpoint === 3 && (
            <CheckpointModal
              visible={true}
              checkpoint={3}
              title="确认修复方案"
              icon="🔍"
              onApprove={() => onCheckpointApprove(3)}
              onReject={(notes) => onCheckpointReject(3, notes)}
              onSkip={() => onCheckpointSkip(3)}
            >
              <CheckpointReview issues={(checkpointData.issues as any) || []} />
            </CheckpointModal>
          )}
        </>
      )}
    </div>
  )
}

export default OrchestrationProgress
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 9: ContentGenerator Integration

**Files:**
- Modify: `src/components/Content/ContentGenerator.tsx`

- [ ] **Step 1: Update ContentGenerator center and right panels**

Replace the center panel conditional rendering:

```tsx
{/* Center: Preview + Versions */}
<div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm flex flex-col">
  {skillMode && isOrchestrating && orchSnapshot ? (
    <OrchestrationProgress
      orchestrationId={orchSnapshot.id}
      onCancel={() => {
        setLoading(false)
        clearOrchestration()
      }}
      onCheckpointApprove={(checkpoint) => {
        window.electron?.orchestrator.resume({
          orchestrationId: orchSnapshot.id,
          checkpoint,
          approved: true,
        })
      }}
      onCheckpointReject={(checkpoint, notes) => {
        window.electron?.orchestrator.resume({
          orchestrationId: orchSnapshot.id,
          checkpoint,
          approved: false,
          userNotes: notes,
        })
      }}
      onCheckpointSkip={(checkpoint) => {
        window.electron?.orchestrator.resume({
          orchestrationId: orchSnapshot.id,
          checkpoint,
          approved: false,
        })
      }}
    />
  ) : generatedContent ? (
    <>
      {/* existing title bar + version tabs + content preview */}
    </>
  ) : (
    <div className="flex-1 flex items-center justify-center">
      <Empty description={<span className="text-gray-400">选择资料后点击生成</span>} />
    </div>
  )}
</div>
```

Replace the right panel:

```tsx
{/* Right: Context Panel */}
<div className="w-72 flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col">
  {skillMode && isOrchestrating && orchSnapshot ? (
    <PhaseContextPanel snapshot={orchSnapshot} />
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
```

- [ ] **Step 2: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 10: Orchestrator Return-to-Modify Support

**Files:**
- Modify: `electron/services/documentOrchestrator.ts`

- [ ] **Step 1: Update resumeCheckpoint to pass user notes to phase re-run**

In `resumeCheckpoint`, when `approved` is false, instead of cancelling, re-run the current phase with user notes:

```typescript
export async function resumeCheckpoint(
  orchestrationId: string,
  checkpoint: number,
  approved: boolean,
  userNotes?: string
): Promise<void> {
  const state = activeOrchestrations.get(orchestrationId)
  if (!state) return
  const resolver = state.checkpointResolvers.get(checkpoint)
  if (resolver) {
    // Store user notes in state for the phase to use
    if (userNotes) {
      state.input.instruction = (state.input.instruction || '') + '\n\n用户修改意见：' + userNotes
    }
    resolver.userNotes = userNotes
    resolver.resolve(approved)
    state.checkpointResolvers.delete(checkpoint)
    state.snapshot.status = 'running'
    state.snapshot.checkpointData = null
    sendProgress(state)
  }
}
```

- [ ] **Step 2: Update startOrchestration to handle reject-with-retry**

Replace the checkpoint handling in `startOrchestration` to re-run phases on reject:

```typescript
// Checkpoint 1: User confirms outline
let approved1 = false
while (!approved1) {
  debugLog('Checkpoint 1: waiting for user confirmation')
  approved1 = await awaitCheckpoint(state, 1, { checkpoint: 1, plan })
  if (state.cancelled) throw new Error('cancelled')
  if (!approved1) {
    // Re-run Phase 1 with updated instruction
    debugLog('Checkpoint 1: rejected, re-running Phase 1')
    plan = await phase1Planning(state, config, knowledgePoints)
    state.snapshot.intermediateResults.documentPlan = plan
  }
}
```

Apply the same pattern for Checkpoint 2 and Checkpoint 3.

- [ ] **Step 3: Verify build**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build 2>&1 | grep "ERROR\|built"`
Expected: No errors

---

### Task 11: Final Integration Test

- [ ] **Step 1: Build and launch**

Run: `cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx vite build`
Expected: No errors

- [ ] **Step 2: Launch app and verify**

Run: `taskkill /f /im electron.exe 2>/dev/null; sleep 2; cd "C:/Users/123/Desktop/Skills For Real Engineers/期末补完计划/final-exam-closure" && npx electron . &`

Test:
1. Open smart mode toggle
2. Select materials
3. Click "智能生成"
4. Verify left panel collapses to icon bar
5. Verify progress view shows phase cards
6. Verify checkpoint modal appears with outline
7. Click "确认" to proceed
8. Verify style checkpoint modal appears
9. Click "返回修改", enter notes, click "重新生成"
10. Verify phase re-runs
11. Complete all phases
12. Verify result transitions to document preview
13. Verify left panel restores to full width
14. Verify right panel shows conversation panel

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Left panel collapse | Task 2 |
| Progress bar + phase cards | Task 8 |
| Checkpoint Modal | Task 3 |
| Outline checkpoint | Task 4 |
| Style checkpoint | Task 5 |
| Review checkpoint | Task 6 |
| Right panel phase switching | Task 7 |
| Return-to-modify inline | Task 3 (Modal) + Task 10 (orchestrator) |
| Result transition to preview | Task 9 |
| Performance (CSS transition) | Task 2 |
| Min interaction area (300px, 44px) | Task 3 (Modal styles) |
| Store updates | Task 1 |
