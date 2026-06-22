import { useState, useEffect } from 'react'
import { Card, Radio, Button, Space, Progress, Tag, Input, Select, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ExportOutlined, BookOutlined } from '@ant-design/icons'
import MaterialPicker from '../Common/MaterialPicker'
import ConversationPanel from '../Common/ConversationPanel'
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

type QuizPhase = 'configure' | 'quiz'

const QUESTION_TYPES = [
  { value: 'single_choice', label: '单选题' },
  { value: 'multiple_choice', label: '多选题' },
  { value: 'true_false', label: '判断题' },
  { value: 'short_answer', label: '简答题' },
  { value: 'analysis', label: '资料分析题' },
]

const DIFFICULTIES = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

const COUNT_OPTIONS = [3, 5, 10, 20]

const QuizSession = ({ subjectId }: QuizSessionProps) => {
  const [phase, setPhase] = useState<QuizPhase>('configure')

  const [questionType, setQuestionType] = useState('single_choice')
  const [difficulty, setDifficulty] = useState('medium')
  const [questionCount, setQuestionCount] = useState(5)
  const [customContent, setCustomContent] = useState('')

  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [allMaterials, setAllMaterials] = useState<Material[]>([])

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  useEffect(() => {
    loadData()
  }, [subjectId])

  const loadData = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    const subjectMaterials = all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId)
    setAllMaterials(subjectMaterials)
    setSelectedMaterialIds(subjectMaterials.map((m) => m.id))
  }

  const buildContentForQuiz = async () => {
    let content = ''
    const wikiDir = await window.electron?.wiki.getDir(subjectId)
    if (wikiDir) {
      const synthesis = await window.electron?.wiki.getSynthesis(subjectId)
      const concepts = await window.electron?.wiki.readAllPages(subjectId, 'concept')
      content = synthesis + '\n\n---\n\n' + concepts
    }
    if (!content) {
      const selectedMats = allMaterials.filter((m) => selectedMaterialIds.includes(m.id))
      if (selectedMats.length > 0) {
        content = selectedMats
          .map((m) => {
            const cleanName = m.name.replace(/\.(pdf|docx?|txt|md)$/i, '')
            return `【${cleanName}】\n${m.content.substring(0, 5000)}`
          })
          .join('\n\n---\n\n')
          .substring(0, 15000)
      }
    }
    if (customContent.trim()) {
      content = content ? `${content}\n\n补充要求：${customContent}` : customContent
    }
    if (!content) content = '请根据通用知识出题'
    return content
  }

  const handleAction = async (actionKey: string) => {
    const content = await buildContentForQuiz()
    const TYPE_LABELS: Record<string, string> = {
      single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题',
      short_answer: '简答题', analysis: '资料分析题',
    }

    let count = questionCount
    let type = questionType
    let diff = difficulty

    if (actionKey === 'start') {
      // Use current config
    } else if (actionKey === 'quick_single') {
      type = 'single_choice'; count = 5; diff = 'medium'
    } else if (actionKey === 'quick_multi') {
      type = 'multiple_choice'; count = 5; diff = 'medium'
    } else if (actionKey === 'quick_tf') {
      type = 'true_false'; count = 10; diff = 'easy'
    }

    setQuestionType(type); setQuestionCount(count); setDifficulty(diff)

    try {
      const result = await window.electron?.ai.generateQuestions({
        content,
        type,
        difficulty: diff,
        count,
      })
      if (result && result.length > 0) {
        setQuestions(result)
        setPhase('quiz')
        setScore({ correct: 0, total: 0 })
        setCurrentIndex(0)
        setSelectedAnswer(null)
        setShowResult(false)
        setShowExplanation(false)
        message.success(`已生成 ${result.length} 道${TYPE_LABELS[type] || ''}`)
      } else {
        message.error('AI 未返回有效题目，请重试')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败'
      if (msg.includes('API Key')) {
        message.error('请先点击右上角设置图标，配置 API Key')
      } else {
        message.error(msg)
      }
    }
  }

  const handleSend = async (text: string): Promise<string> => {
    const content = await buildContentForQuiz()
    const fullContext = `你是出题助手。当前配置：题型=${questionType}，难度=${difficulty}，数量=${questionCount}。\n资料内容：${content.substring(0, 8000)}\n\n用户：${text}`
    return await window.electron?.ai.chat(fullContext) || 'AI 未能生成回复'
  }

  const handleExport = async () => {
    if (questions.length === 0) { message.warning('暂无题目可导出'); return }
    const TYPE_LABELS: Record<string, string> = {
      single_choice: '单选题', multiple_choice: '多选题', true_false: '判断题',
      short_answer: '简答题', analysis: '资料分析题',
    }
    const lines: string[] = ['# AI 出题练习结果', '', `日期：${new Date().toLocaleDateString('zh-CN')}`, `题型：${TYPE_LABELS[questionType] || questionType} | 难度：${difficulty} | 得分：${score.correct}/${score.total}`, '', '---', '']
    questions.forEach((q, i) => {
      lines.push(`## 第 ${i + 1} 题`)
      lines.push(''); lines.push(q.content); lines.push('')
      if (q.options.length > 0) { q.options.forEach((opt) => lines.push(opt.label)); lines.push('') }
      lines.push(`**正确答案：${q.answer}**`, '', `> 解析：${q.explanation}`, '', '---', '')
    })
    const md = lines.join('\n')
    const result = await window.electron?.file.saveFile(md, `AI出题_${new Date().toLocaleDateString('zh-CN')}.md`)
    if (result?.path) message.success(`已导出到: ${result.path}`)
  }

  const handleSubmit = async () => {
    if (!selectedAnswer || !currentQuestion) return
    setShowResult(true)
    const isCorrect = selectedAnswer === currentQuestion.answer
    setScore((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }))

    const record = {
      questionId: currentQuestion.id, content: currentQuestion.content, options: currentQuestion.options,
      correctAnswer: currentQuestion.answer, userAnswer: selectedAnswer, isCorrect,
      explanation: currentQuestion.explanation, type: currentQuestion.type, difficulty, subjectId,
      answeredAt: new Date().toISOString(),
    }
    try {
      await window.electron?.db.add('quizHistory', record)
      if (!isCorrect) {
        await window.electron?.db.add('wrongBook', { ...record, addedAt: new Date().toISOString() })
      }
    } catch { /* silent */ }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      setSelectedAnswer(null); setShowResult(false); setShowExplanation(false)
    }
  }

  const handleRestart = () => { setPhase('configure'); setQuestions([]); setCurrentIndex(0); setSelectedAnswer(null); setShowResult(false); setShowExplanation(false); setScore({ correct: 0, total: 0 }) }

  const currentQuestion = questions[currentIndex]
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0

  if (phase === 'configure') {
    return (
      <div className="flex h-full">
        <div className="w-72 flex flex-col border-r border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">出题配置</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">题目类型</p>
                <Select value={questionType} onChange={setQuestionType} className="w-full" size="small"
                  options={QUESTION_TYPES} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">题目数量</p>
                <Select value={questionCount} onChange={setQuestionCount} className="w-full" size="small"
                  options={COUNT_OPTIONS.map(n => ({ value: n, label: `${n} 题` }))} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">难度</p>
                <Select value={difficulty} onChange={setDifficulty} className="w-full" size="small"
                  options={DIFFICULTIES} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">补充说明</p>
                <Input.TextArea rows={2} size="small" placeholder="如：重点考察第3章"
                  value={customContent} onChange={(e) => setCustomContent(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-gray-200 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <BookOutlined className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-700">参考资料</span>
              {selectedMaterialIds.length > 0 && (
                <Tag color="blue" className="!text-xs !ml-auto">{selectedMaterialIds.length} 份</Tag>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <MaterialPicker
                value={selectedMaterialIds}
                onChange={setSelectedMaterialIds}
                materials={allMaterials}
              />
            </div>
          </div>

          <div className="p-4">
            <p className="text-xs text-gray-500 mb-2">快速出题</p>
            <div className="space-y-2">
              <Button block size="small" onClick={() => handleAction('quick_single')}>5 道单选题</Button>
              <Button block size="small" onClick={() => handleAction('quick_multi')}>5 道多选题</Button>
              <Button block size="small" onClick={() => handleAction('quick_tf')}>10 道判断题</Button>
              <Button type="primary" block size="small" onClick={() => handleAction('start')}>
                按当前配置出题
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ConversationPanel
            subjectId={subjectId}
            feature="quiz"
            contextPrompt={`你是出题助手。当前配置：题型=${questionType}，难度=${difficulty}，数量=${questionCount}。`}
            onSend={handleSend}
            placeholder="告诉 AI 你想出什么样的题，如「重点出关于极限的题」..."
            showSaveToWiki={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">答题中</h2>
        <div className="flex gap-2">
          <Tag color="blue">得分: {score.correct}/{score.total}</Tag>
          <Button size="small" onClick={handleRestart}>重新出题</Button>
          {questions.length > 0 && (
            <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
          )}
        </div>
      </div>

      <Progress percent={progress} showInfo={false} />

      <Card title={`第 ${currentIndex + 1} / ${questions.length} 题`}>
        <p className="text-gray-800 mb-4 whitespace-pre-wrap">{currentQuestion.content}</p>

        {currentQuestion.options.length > 0 ? (
          <Radio.Group value={selectedAnswer} onChange={(e) => setSelectedAnswer(e.target.value)} className="w-full" disabled={showResult}>
            <Space direction="vertical" className="w-full">
              {currentQuestion.options.map((opt) => (
                <Radio key={opt.value} value={opt.value} className="w-full">
                  <span className={
                    showResult && opt.value === currentQuestion.answer
                      ? 'text-green-600 font-medium'
                      : showResult && opt.value === selectedAnswer && opt.value !== currentQuestion.answer
                      ? 'text-red-500' : ''
                  }>{opt.label}</span>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        ) : (
          <Input.TextArea rows={3} placeholder="输入你的答案..." value={selectedAnswer || ''}
            onChange={(e) => setSelectedAnswer(e.target.value)} disabled={showResult} />
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
            <Button type="primary" disabled={!selectedAnswer} onClick={handleSubmit}>提交答案</Button>
          ) : (
            <>
              {!showExplanation && <Button onClick={() => setShowExplanation(true)}>查看解析</Button>}
              {currentIndex < questions.length - 1 && <Button type="primary" onClick={handleNext}>下一题</Button>}
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
