import { useState, useEffect, useRef } from 'react'
import { Modal, Input, Select, Button, message, Space, Tabs, Table, Switch, Popconfirm, Tag, Spin } from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, RobotOutlined, UserOutlined, SendOutlined,
  GithubOutlined, FolderOutlined, InfoCircleOutlined, BookOutlined, AppstoreOutlined,
  ScanOutlined,
} from '@ant-design/icons'
import SkillManager from '../Skills/SkillManager'
import OcrSettings from './OcrSettings'
import type { ColumnsType } from 'antd/es/table'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

interface SourceItem {
  id: string
  name: string
  type: string
  searchUrl: string
  enabled: boolean
  priority: number
}

const SOURCE_TYPES = [
  { value: 'courseware', label: '课件' },
  { value: 'qa', label: '问答' },
  { value: 'video', label: '视频' },
  { value: 'academic', label: '学术' },
  { value: 'ebook', label: '电子书' },
  { value: 'pan-search', label: '网盘' },
  { value: 'code', label: '代码' },
  { value: 'tech', label: '技术' },
]

const SOURCE_TYPE_MAP: Record<string, { color: string; text: string }> = {
  courseware: { color: 'blue', text: '课件' },
  qa: { color: 'orange', text: '问答' },
  video: { color: 'red', text: '视频' },
  academic: { color: 'green', text: '学术' },
  ebook: { color: 'purple', text: '电子书' },
  'pan-search': { color: 'cyan', text: '网盘' },
  code: { color: 'geekblue', text: '代码' },
  tech: { color: 'volcano', text: '技术' },
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  // Source management state
  const [sources, setSources] = useState<SourceItem[]>([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [editSource, setEditSource] = useState<SourceItem | null>(null)
  const [showSourceForm, setShowSourceForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('courseware')
  const [formUrl, setFormUrl] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)

  // AI chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // AI config state
  const [provider, setProvider] = useState<string>('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)

  // Wiki config state
  const [wikiSubjects, setWikiSubjects] = useState<Subject[]>([])
  const [wikiSubjectId, setWikiSubjectId] = useState<string>('')
  const [wikiDir, setWikiDir] = useState<string | null>(null)
  const [wikiLoading, setWikiLoading] = useState(false)

  useEffect(() => {
    if (open) {
      loadSources()
      loadAIConfig()
      loadWikiSubjects()
    }
  }, [open])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const loadSources = async () => {
    setSourceLoading(true)
    try {
      const data = await window.electron?.search.getAllSources()
      setSources((data as SourceItem[]) || [])
    } finally {
      setSourceLoading(false)
    }
  }

  const loadAIConfig = async () => {
    const config = await window.electron?.ai.getConfig()
    if (config) {
      setProvider(config.provider)
      setBaseUrl(config.baseUrl || '')
    }
  }

  const loadWikiSubjects = async () => {
    const data = await window.electron?.db.list('subjects')
    const list = (data as Subject[]) || []
    setWikiSubjects(list)
    if (list.length > 0 && !wikiSubjectId) {
      setWikiSubjectId(list[0].id)
    }
  }

  useEffect(() => {
    if (wikiSubjectId && open) {
      window.electron?.wiki.getDir(wikiSubjectId).then(dir => setWikiDir(dir))
    }
  }, [wikiSubjectId, open])

  const handleSelectWikiDir = async () => {
    if (!wikiSubjectId) return
    setWikiLoading(true)
    try {
      const result = await window.electron?.wiki.initDir(wikiSubjectId)
      if (result?.success) {
        setWikiDir(result.wikiDir || null)
        message.success('Wiki 目录已配置')
      }
    } catch {
      message.error('配置失败')
    } finally {
      setWikiLoading(false)
    }
  }

  const handleRebuildWiki = async () => {
    if (!wikiSubjectId) return
    setWikiLoading(true)
    try {
      const result = await window.electron?.wiki.buildWiki(wikiSubjectId)
      if (result?.success) {
        message.success('Wiki 重新构建完成')
      } else {
        message.error(result?.error || '构建失败')
      }
    } catch {
      message.error('构建失败')
    } finally {
      setWikiLoading(false)
    }
  }

  // Wiki lint
  const [lintResults, setLintResults] = useState<{ issues: WikiLintIssue[]; summary: string } | null>(null)
  const [lintLoading, setLintLoading] = useState(false)

  const handleLintWiki = async () => {
    if (!wikiSubjectId) return
    setLintLoading(true)
    try {
      const result = await window.electron?.wiki.lint(wikiSubjectId)
      setLintResults(result)
      if (result.issues.length === 0) {
        message.success('Wiki 健康检查通过，没有发现问题')
      }
    } catch {
      message.error('健康检查失败')
    } finally {
      setLintLoading(false)
    }
  }

  // Source CRUD
  const handleAddSource = () => {
    setEditSource(null)
    setFormName('')
    setFormType('courseware')
    setFormUrl('')
    setFormEnabled(true)
    setShowSourceForm(true)
  }

  const handleEditSource = (source: SourceItem) => {
    setEditSource(source)
    setFormName(source.name)
    setFormType(source.type)
    setFormUrl(source.searchUrl)
    setFormEnabled(source.enabled)
    setShowSourceForm(true)
  }

  const handleSaveSource = async () => {
    if (!formName.trim() || !formUrl.trim()) {
      message.warning('请填写名称和搜索URL')
      return
    }
    try {
      if (editSource) {
        await window.electron?.search.updateSource(editSource.id, {
          name: formName.trim(),
          type: formType,
          searchUrl: formUrl.trim(),
          enabled: formEnabled,
        })
        message.success('已更新')
      } else {
        const maxPriority = sources.reduce((max, s) => Math.max(max, s.priority), 0)
        await window.electron?.search.addSource({
          name: formName.trim(),
          type: formType,
          searchUrl: formUrl.trim(),
          enabled: formEnabled,
          priority: maxPriority + 1,
        })
        message.success('已添加')
      }
      setShowSourceForm(false)
      loadSources()
    } catch {
      message.error('操作失败')
    }
  }

  const handleDeleteSource = async (id: string) => {
    await window.electron?.search.deleteSource(id)
    message.success('已删除')
    loadSources()
  }

  const handleToggleSource = async (id: string) => {
    await window.electron?.search.toggleSource(id)
    loadSources()
  }

  // AI chat
  const handleChatSend = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const userMsg: ChatMsg = { id: `msg_${Date.now()}`, role: 'user', content: text }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const result = await window.electron?.ai.manageSources(text)
      if (!result) throw new Error('AI 请求失败')

      let reply = result.message
      if (result.action === 'add' && result.source) {
        reply = `已添加搜索源「${result.source.name}」\n${result.message}`
      } else if (result.action === 'delete') {
        reply = `已删除搜索源\n${result.message}`
      } else if (result.action === 'toggle') {
        reply = `已切换搜索源状态\n${result.message}`
      } else if (result.action === 'update') {
        reply = `已更新搜索源\n${result.message}`
      }

      const assistantMsg: ChatMsg = { id: `msg_${Date.now() + 1}`, role: 'assistant', content: reply }
      setChatMessages((prev) => [...prev, assistantMsg])
      loadSources()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '操作失败'
      const reply: ChatMsg = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: errMsg.includes('API Key') ? '请先在「AI 配置」标签页配置 API Key' : `出错了: ${errMsg}`,
      }
      setChatMessages((prev) => [...prev, reply])
    } finally {
      setChatLoading(false)
    }
  }

  // AI config
  const handleSaveConfig = async () => {
    if (provider !== 'claude-code' && !apiKey.trim()) {
      message.warning('请输入 API Key')
      return
    }
    setConfigLoading(true)
    try {
      await window.electron?.ai.setConfig({ provider, apiKey: apiKey.trim(), baseUrl: baseUrl.trim() })
      message.success('设置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setConfigLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (provider !== 'claude-code' && !apiKey.trim()) {
      message.warning('请先输入 API Key')
      return
    }
    setTestLoading(true)
    try {
      await window.electron?.ai.setConfig({ provider, apiKey: apiKey.trim(), baseUrl: baseUrl.trim() })
      const result = await window.electron?.ai.chat('请回复"连接成功"四个字')
      if (result && result.includes('连接成功')) {
        message.success('连接测试成功！')
      } else {
        message.success('连接成功（AI 回复了其他内容）')
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '连接失败'
      message.error(`连接失败: ${errMsg}`)
    } finally {
      setTestLoading(false)
    }
  }

  // Source table columns
  const sourceColumns: ColumnsType<SourceItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <span className="font-medium">{text}</span>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      filters: SOURCE_TYPES.map((t) => ({ text: t.label, value: t.value })),
      onFilter: (value, record) => record.type === value,
      render: (type: string) => {
        const t = SOURCE_TYPE_MAP[type] || { color: 'default', text: type }
        return <Tag color={t.color}>{t.text}</Tag>
      },
    },
    {
      title: '搜索 URL',
      dataIndex: 'searchUrl',
      key: 'searchUrl',
      ellipsis: true,
      render: (text: string) => <span className="text-xs text-gray-500">{text}</span>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record) => (
        <Switch size="small" checked={enabled} onChange={() => handleToggleSource(record.id)} />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditSource(record)} />
          <Popconfirm title="确认删除此搜索源？" onConfirm={() => handleDeleteSource(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // Tab items
  const tabItems = [
    {
      key: 'about',
      label: (
        <span className="flex items-center gap-1">
          <InfoCircleOutlined />
          关于
        </span>
      ),
      children: (
        <div className="py-4">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
              <span className="text-3xl text-white font-bold">F</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800">期末补完计划</h2>
            <p className="text-sm text-gray-500 mt-1">Final Exam Closure</p>
            <p className="text-xs text-gray-400 mt-1">v0.1.0</p>
          </div>

          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">项目信息</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">作者</span>
                  <span className="text-gray-800 font-medium">矢泽冷冷</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">版本</span>
                  <span className="text-gray-800">v0.1.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">框架</span>
                  <span className="text-gray-800">Electron + React + TypeScript</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">AI 模型</span>
                  <span className="text-gray-800">DeepSeek / MiMo / Claude</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <FolderOutlined />
                项目存储地址
              </h3>
              <p className="text-xs text-gray-600 bg-white rounded p-2 font-mono break-all border border-gray-200">
                {window.location.protocol === 'file:'
                  ? 'C:\\Users\\123\\Desktop\\Skills For Real Engineers\\期末补完计划\\final-exam-closure'
                  : import.meta.env.DEV
                  ? '开发模式运行中'
                  : '打包版本'}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <GithubOutlined />
                GitHub
              </h3>
              <a
                href="https://github.com/shizelengleng/final-exam-closure"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-600 bg-white rounded p-2 block border border-gray-200 hover:border-blue-300 transition-colors"
              >
                github.com/shizelengleng/final-exam-closure
              </a>
            </div>

            <div className="text-center text-xs text-gray-400 mt-4">
              <p>Made with ❤️ by 矢泽冷冷</p>
              <p className="mt-1">AI 驱动的期末复习助手</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'sources',
      label: '搜索源管理',
      children: (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">共 {sources.length} 个搜索源</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddSource}>
              添加搜索源
            </Button>
          </div>
          {/* Category summary */}
          <div className="flex flex-wrap gap-2 mb-2">
            {SOURCE_TYPES.map((t) => {
              const count = sources.filter((s) => s.type === t.value).length
              if (count === 0) return null
              const typeInfo = SOURCE_TYPE_MAP[t.value]
              return (
                <Tag key={t.value} color={typeInfo?.color || 'default'} className="!text-xs">
                  {typeInfo?.text || t.label}: {count}
                </Tag>
              )
            })}
          </div>
          <Table
            dataSource={sources}
            columns={sourceColumns}
            rowKey="id"
            size="small"
            loading={sourceLoading}
            pagination={false}
            scroll={{ y: 400 }}
            rowClassName={(record) => !record.enabled ? 'opacity-50' : ''}
          />
        </div>
      ),
    },
    {
      key: 'chat',
      label: 'AI 助手',
      children: (
        <div className="flex flex-col h-96">
          <div className="flex-1 overflow-auto p-3 space-y-3 bg-gray-50 rounded-lg">
            {chatMessages.length === 0 && (
              <div className="text-center py-12">
                <RobotOutlined className="text-3xl text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">告诉 AI 你想怎么管理搜索源</p>
                <p className="text-xs text-gray-400">例如：「帮我加一个搜电子书的网站」</p>
                <p className="text-xs text-gray-400">或：「把知乎禁用掉」</p>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <RobotOutlined className="text-white text-xs" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                    <UserOutlined className="text-white text-xs" />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <RobotOutlined className="text-white text-xs" />
                </div>
                <div className="bg-white rounded-xl px-3 py-2 text-sm text-gray-500 shadow-sm">
                  <Spin size="small" /> AI 正在处理...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-3 flex gap-2">
            <Input.TextArea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleChatSend()
                }
              }}
              placeholder="描述你想做的操作..."
              autoSize={{ minRows: 1, maxRows: 2 }}
              className="flex-1"
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleChatSend}
              loading={chatLoading}
              className="!h-auto"
            />
          </div>
        </div>
      ),
    },
    {
      key: 'config',
      label: 'AI 配置',
      children: (
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI 模型</label>
            <Select
              value={provider}
              onChange={setProvider}
              className="w-full"
              options={[
                { value: 'deepseek', label: 'DeepSeek (推荐，中文强，性价比高)' },
                { value: 'mimo', label: 'MiMo (小米，教育场景优化)' },
                { value: 'claude-code', label: 'Claude Code (本地，无需 API Key)' },
              ]}
            />
          </div>
          {provider !== 'claude-code' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <Input.Password
                placeholder="输入你的 API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                {provider === 'deepseek' ? '从 platform.deepseek.com 获取' : '从 api.xiaomi.com/mimo 获取'}
              </p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700 font-medium">使用本地 Claude Code</p>
              <p className="text-xs text-blue-600 mt-1">
                需要先安装 Claude Code CLI：<code className="bg-blue-100 px-1 rounded">npm install -g @anthropic-ai/claude-code</code>
              </p>
              <p className="text-xs text-blue-600 mt-1">
                无需填写 API Key，直接调用本地已登录的 Claude Code。
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">自定义 API 地址（可选）</label>
            <Input
              placeholder="留空使用默认地址"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">如使用代理或兼容 API，可填写自定义地址</p>
          </div>
          <div className="flex gap-2">
            <Button type="primary" loading={configLoading} onClick={handleSaveConfig}>
              保存设置
            </Button>
            <Button loading={testLoading} onClick={handleTestConnection}>
              测试连接
            </Button>
          </div>
        </Space>
      ),
    },
    {
      key: 'wiki',
      label: (
        <span className="flex items-center gap-1">
          <BookOutlined />
          Wiki 知识库
        </span>
      ),
      children: (
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">选择学科</label>
            <Select
              value={wikiSubjectId || undefined}
              onChange={setWikiSubjectId}
              className="w-full"
              placeholder="选择要配置 Wiki 的学科"
              options={wikiSubjects.map(s => ({ value: s.id, label: s.name }))}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Wiki 目录：{wikiDir || '未配置'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  上传资料后自动生成结构化 Wiki 页面，AI 工具基于 Wiki 内容工作
                </p>
              </div>
              <Button onClick={handleSelectWikiDir} loading={wikiLoading} disabled={!wikiSubjectId}>
                {wikiDir ? '重新选择' : '选择目录'}
              </Button>
            </div>
          </div>
          {wikiDir && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
                Wiki 已配置，上传资料后会自动生成结构化页面。
              </p>
              <p className="text-xs text-blue-600 mt-1">
                目录位置：{wikiDir}
              </p>
              <div className="flex gap-2 mt-2">
                <Button size="small" loading={wikiLoading} onClick={handleRebuildWiki}>
                  重新构建 Wiki
                </Button>
                <Button size="small" loading={lintLoading} onClick={handleLintWiki}>
                  健康检查 (Lint)
                </Button>
              </div>
            </div>
          )}
          {lintResults && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700 mb-2">{lintResults.summary}</p>
              {lintResults.issues.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-auto">
                  {lintResults.issues.map((issue, i) => (
                    <div key={i} className="text-xs flex items-start gap-2">
                      <Tag color={
                        issue.type === 'orphan' ? 'orange' :
                        issue.type === 'missing_page' ? 'red' :
                        issue.type === 'stale' ? 'blue' : 'default'
                      } className="!text-xs !mt-0 flex-shrink-0">
                        {issue.type === 'orphan' ? '孤立' :
                         issue.type === 'missing_page' ? '断链' :
                         issue.type === 'stale' ? '过时' : '缺引用'}
                      </Tag>
                      <span className="text-gray-600">{issue.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-green-600">所有页面健康，没有发现问题</p>
              )}
            </div>
          )}
        </Space>
      ),
    },
    {
      key: 'skills',
      label: (
        <span className="flex items-center gap-1">
          <AppstoreOutlined />
          Skill 插件
        </span>
      ),
      children: <SkillManager />,
    },
    {
      key: 'ocr',
      label: (
        <span className="flex items-center gap-1">
          <ScanOutlined />
          OCR 设置
        </span>
      ),
      children: <OcrSettings />,
    },
  ]

  return (
    <>
      <Modal title="设置" open={open} onCancel={onClose} footer={null} width={800} destroyOnClose>
        <Tabs items={tabItems} />
      </Modal>

      <Modal
        title={editSource ? '编辑搜索源' : '添加搜索源'}
        open={showSourceForm}
        onCancel={() => setShowSourceForm(false)}
        onOk={handleSaveSource}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <Input placeholder="如：百度文库" value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
            <Select value={formType} onChange={setFormType} className="w-full" options={SOURCE_TYPES} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">搜索 URL</label>
            <Input placeholder="搜索关键词拼接在 URL 末尾" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">关键词会自动编码后拼接到此 URL 后面</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={formEnabled} onChange={setFormEnabled} />
            <span className="text-sm text-gray-700">启用</span>
          </div>
        </Space>
      </Modal>
    </>
  )
}

export default SettingsModal
