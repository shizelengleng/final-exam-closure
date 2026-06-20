import { useState, useEffect } from 'react'
import { Card, Radio, Button, Space, Progress, Tag, Input, Select, message, Alert } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ExportOutlined } from '@ant-design/icons'
import MaterialPicker from '../Common/MaterialPicker'
import type { Material } from '../Common/MaterialPicker'

interface Question {
  id: string
  content: string
  options: { value: string; label: string }[]
  answer: string
  explanation: string
  type: string
}

interface QuizSessionProps {
  subjectId: string
}

const QuizSession = ({ subjectId }: QuizSessionProps) => {
  const [started, setStarted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 出题配置
  const [questionType, setQuestionType] = useState('single_choice')
  const [difficulty, setDifficulty] = useState('medium')
  const [questionCount, setQuestionCount] = useState(5)
  const [customContent, setCustomContent] = useState('')

  // 资料选择
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([])
  const [allMaterials, setAllMaterials] = useState<Material[]>([])

  useEffect(() => {
    loadData()
  }, [subjectId])

  const loadData = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    const subjectMaterials = all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId)
    setAllMaterials(subjectMaterials)
    // 默认全选当前学科的所有资料
    setSelectedMaterialIds(subjectMaterials.map((m) => m.id))
    setSelectedMaterials(subjectMaterials)
  }

  const currentQuestion = questions[currentIndex]
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0

  const handleGenerate = async () => {
    // 优先读取 Wiki 内容，降级读取原始资料
    let content = ''
    const wikiDir = await window.electron?.wiki.getDir(subjectId)
    if (wikiDir) {
      const synthesis = await window.electron?.wiki.getSynthesis(subjectId)
      const concepts = await window.electron?.wiki.readAllPages(subjectId, 'concept')
      content = synthesis + '\n\n---\n\n' + concepts
    }
    if (!content && selectedMaterials.length > 0) {
      content = selectedMaterials
        .map((m) => {
          const cleanName = m.name.replace(/\.(pdf|docx?|txt|md)$/i, '')
          return `【${cleanName}】\n${m.content.substring(0, 5000)}`
        })
        .join('\n\n---\n\n')
        .substring(0, 15000)
    }
    if (customContent.trim()) {
      content = content ? `${content}\n\n补充要求：${customContent}` : customContent
    }
    if (!content) content = '请根据通用知识出题'

    setLoading(true)
    setError('')
    try {
      const result = await window.electron?.ai.generateQuestions({
        content,
        type: questionType,
        difficulty,
        count: questionCount,
      })
      if (result && result.length > 0) {
        setQuestions(result)
        setStarted(true)
        setScore({ correct: 0, total: 0 })
        setCurrentIndex(0)
        setSelectedAnswer(null)
        setShowResult(false)
        setShowExplanation(false)
      } else {
        setError('AI 未返回有效题目，请重试')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败'
      if (msg.includes('API Key')) {
        setError('请先点击右上角设置图标，配置 API Key')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (questions.length === 0) {
      message.warning('暂无题目可导出')
      return
    }
    const TYPE_LABELS: Record<string, string> = {
      single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题',
      short_answer: '简答题', analysis: '资料分析题',
    }
    const lines: string[] = ['# AI 出题练习结果', '', `日期：${new Date().toLocaleDateString('zh-CN')}`, `题型：${TYPE_LABELS[questionType] || questionType} | 难度：${difficulty} | 得分：${score.correct}/${score.total}`, '', '---', '']
    questions.forEach((q, i) => {
      lines.push(`## 第 ${i + 1} 题`)
      lines.push('')
      lines.push(q.content)
      lines.push('')
      if (q.options.length > 0) {
        q.options.forEach((opt) => lines.push(opt.label))
        lines.push('')
      }
      lines.push(`**正确答案：${q.answer}**`)
      lines.push('')
      lines.push(`> 解析：${q.explanation}`)
      lines.push('')
      lines.push('---')
      lines.push('')
    })
    const md = lines.join('\n')
    const result = await window.electron?.file.saveFile(md, `AI出题_${new Date().toLocaleDateString('zh-CN')}.md`)
    if (result?.path) {
      message.success(`已导出到: ${result.path}`)
    }
  }

  const handleSubmit = async () => {
    if (!selectedAnswer || !currentQuestion) return
    setShowResult(true)
    const isCorrect = selectedAnswer === currentQuestion.answer
    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }))

    // 保存答题记录到 quizHistory
    const record = {
      questionId: currentQuestion.id,
      content: currentQuestion.content,
      options: currentQuestion.options,
      correctAnswer: currentQuestion.answer,
      userAnswer: selectedAnswer,
      isCorrect,
      explanation: currentQuestion.explanation,
      type: currentQuestion.type,
      difficulty,
      subjectId,
      answeredAt: new Date().toISOString(),
    }
    try {
      await window.electron?.db.add('quizHistory', record)

      // 答错的题目自动加入错题本
      if (!isCorrect) {
        await window.electron?.db.add('wrongBook', {
          ...record,
          addedAt: new Date().toISOString(),
        })
      }
    } catch {
      // 静默失败，不影响答题体验
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setShowExplanation(false)
    }
  }

  const handleRestart = () => {
    setStarted(false)
    setQuestions([])
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setShowExplanation(false)
    setScore({ correct: 0, total: 0 })
  }

  if (!started) {
    return (
      <div className="flex gap-6 p-6">
        {/* Left: Config */}
        <div className="flex-1 space-y-6">
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-bold text-gray-800 mb-1">AI 智能出题</h2>
            <p className="text-sm text-gray-500">基于你的资料，AI 自动生成高质量练习题</p>
          </div>

          {error && <Alert message={error} type="error" showIcon closable onClose={() => setError('')} />}

          <Card className="max-w-lg">
            <Space direction="vertical" className="w-full" size="middle">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">题目类型</p>
                <Select
                  value={questionType}
                  onChange={setQuestionType}
                  className="w-full"
                  options={[
                    { value: 'single_choice', label: '单选题' },
                    { value: 'multiple_choice', label: '多选题' },
                    { value: 'true_false', label: '判断题' },
                    { value: 'short_answer', label: '简答题' },
                    { value: 'analysis', label: '资料分析题' },
                  ]}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">题目数量</p>
                <Select
                  value={questionCount}
                  onChange={setQuestionCount}
                  className="w-full"
                  options={[
                    { value: 3, label: '3 题（快速测试）' },
                    { value: 5, label: '5 题' },
                    { value: 10, label: '10 题' },
                    { value: 20, label: '20 题' },
                  ]}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">题目难度</p>
                <Select
                  value={difficulty}
                  onChange={setDifficulty}
                  className="w-full"
                  options={[
                    { value: 'easy', label: '简单' },
                    { value: 'medium', label: '中等' },
                    { value: 'hard', label: '困难' },
                  ]}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">补充说明（可选）</p>
                <Input.TextArea
                  rows={3}
                  placeholder="补充出题要求，如：重点考察第3章的内容..."
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value)}
                />
              </div>
              <Button type="primary" size="large" block loading={loading} onClick={handleGenerate}>
                {loading ? 'AI 正在生成题目...' : '开始 AI 出题'}
              </Button>
            </Space>
          </Card>
        </div>

        {/* Right: Material Picker */}
        <div className="w-72 flex-shrink-0">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-700">选择参考资料</span>
              {selectedMaterialIds.length > 0 && (
                <Tag color="blue" className="!text-xs">{selectedMaterialIds.length} 份</Tag>
              )}
            </div>
            <div className="h-80 overflow-auto border border-gray-100 rounded-lg p-2">
              <MaterialPicker
                value={selectedMaterialIds}
                onChange={(ids, mats) => {
                  setSelectedMaterialIds(ids)
                  setSelectedMaterials(mats)
                }}
                materials={allMaterials}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {selectedMaterialIds.length > 0
                ? 'AI 将基于选中的资料出题'
                : '选择资料后 AI 会基于资料内容出题，不选则使用通用知识'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">答题中</h2>
        <div className="flex gap-2">
          <Tag color="blue">得分: {score.correct}/{score.total}</Tag>
          <Button size="small" onClick={handleRestart}>重新出题</Button>
        </div>
      </div>

      <Progress percent={progress} showInfo={false} />

      <Card title={`第 ${currentIndex + 1} / ${questions.length} 题`}>
        <p className="text-gray-800 mb-4 whitespace-pre-wrap">{currentQuestion.content}</p>

        {currentQuestion.options.length > 0 ? (
          <Radio.Group
            value={selectedAnswer}
            onChange={(e) => setSelectedAnswer(e.target.value)}
            className="w-full"
            disabled={showResult}
          >
            <Space direction="vertical" className="w-full">
              {currentQuestion.options.map((opt) => (
                <Radio key={opt.value} value={opt.value} className="w-full">
                  <span className={
                    showResult && opt.value === currentQuestion.answer
                      ? 'text-green-600 font-medium'
                      : showResult && opt.value === selectedAnswer && opt.value !== currentQuestion.answer
                      ? 'text-red-500'
                      : ''
                  }>
                    {opt.label}
                  </span>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        ) : (
          <Input.TextArea
            rows={3}
            placeholder="输入你的答案..."
            value={selectedAnswer || ''}
            onChange={(e) => setSelectedAnswer(e.target.value)}
            disabled={showResult}
          />
        )}

        {showResult && (
          <div className="mt-4 p-3 bg-gray-50 rounded">
            {selectedAnswer === currentQuestion.answer ? (
              <p className="text-green-600 flex items-center gap-1"><CheckCircleOutlined /> 回答正确！</p>
            ) : (
              <p className="text-red-500 flex items-center gap-1"><CloseCircleOutlined /> 回答错误，正确答案是：{currentQuestion.answer}</p>
            )}
          </div>
        )}

        {showExplanation && (
          <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-gray-700">
            <p className="font-medium text-blue-700 mb-1">解析：</p>
            <p className="whitespace-pre-wrap">{currentQuestion.explanation}</p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {!showResult ? (
            <Button type="primary" disabled={!selectedAnswer} onClick={handleSubmit}>
              提交答案
            </Button>
          ) : (
            <>
              {!showExplanation && (
                <Button onClick={() => setShowExplanation(true)}>查看解析</Button>
              )}
              {currentIndex < questions.length - 1 && (
                <Button type="primary" onClick={handleNext}>下一题</Button>
              )}
              {currentIndex === questions.length - 1 && (
                <div className="flex gap-2 items-center">
                  <Tag color={score.correct / score.total >= 0.6 ? 'green' : 'red'} className="text-base py-1">
                    最终得分: {score.correct}/{score.total} ({Math.round(score.correct / score.total * 100)}%)
                  </Tag>
                  <Button icon={<ExportOutlined />} onClick={handleExport}>导出文档</Button>
                  <Button type="primary" onClick={handleRestart}>再来一轮</Button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

export default QuizSession
