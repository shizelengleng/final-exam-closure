import { useState, useEffect, useRef, useCallback } from 'react'
import { Input, Button, Tag, Spin, Empty, Checkbox, message } from 'antd'
import {
  SearchOutlined,
  ExpandOutlined,
  NodeIndexOutlined,
  ApartmentOutlined as LayoutIcon,
  SendOutlined,
  RobotOutlined,
  BookOutlined,
} from '@ant-design/icons'
import VisGraph, { type VisGraphRef } from './VisGraph'
import type { ConceptNode, KnowledgeGraphData } from './types'
import { CATEGORY_COLORS, CATEGORY_LABELS, RELATION_LABELS } from './types'
import MaterialPicker from '../Common/MaterialPicker'
import type { Material } from '../Common/MaterialPicker'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  materialRefs?: string[]
}

const DIFFICULTY_LABELS: Record<string, string> = {
  basic: '基础',
  intermediate: '中级',
  advanced: '高级',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  basic: 'green',
  intermediate: 'orange',
  advanced: 'red',
}

const CHUNK_SIZE = 8000

interface KnowledgeGraphProps {
  subjectId: string
}

const KnowledgeGraph = ({ subjectId }: KnowledgeGraphProps) => {
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null)
  const [graphHistory, setGraphHistory] = useState<KnowledgeGraphData[]>([])
  const [selectedNode, setSelectedNode] = useState<ConceptNode | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const [layout, setLayout] = useState<'force' | 'hierarchical'>('force')
  const [searchValue, setSearchValue] = useState('')
  const [activeCategories, setActiveCategories] = useState<string[]>(
    Object.keys(CATEGORY_COLORS)
  )
  const [showDetail, setShowDetail] = useState(true)
  const graphRef = useRef<VisGraphRef>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMaterials()
    loadGraphHistory()
  }, [subjectId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const loadMaterials = async () => {
    const data = await window.electron?.db.list('materials')
    const all = (data as Material[]) || []
    setAllMaterials(all.filter((m) => (m as Record<string, unknown>).subjectId === subjectId))
  }

  const loadGraphHistory = async () => {
    const data = await window.electron?.db.list('knowledgeGraphs')
    const all = ((data as KnowledgeGraphData[]) || [])
    const graphs = all
      .filter((g) => (g as Record<string, unknown>).subjectId === subjectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setGraphHistory(graphs)
    if (graphs.length > 0 && !graphData) setGraphData(graphs[0])
  }

  const handleChatSend = async () => {
    const text = chatInput.trim()
    if (!text || loading) return

    const userMsg: ChatMsg = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
    }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setLoading(true)

    try {
      // 优先读取 Wiki 内容
      const allNodes: ConceptNode[] = []
      const allEdges: { from: string; to: string; type: string; label: string }[] = []
      const seenNodeNames = new Set<string>()

      const chunks: { name: string; content: string }[] = []
      const wikiDir = await window.electron?.wiki.getDir(subjectId)

      if (wikiDir) {
        const wikiContent = await window.electron?.wiki.readAllPages(subjectId, 'concept')
        if (wikiContent) {
          for (let i = 0; i < wikiContent.length; i += CHUNK_SIZE) {
            chunks.push({ name: `Wiki 知识点 (第${Math.floor(i / CHUNK_SIZE) + 1}部分)`, content: wikiContent.substring(i, i + CHUNK_SIZE) })
          }
        }
      }

      // Wiki 不可用时，使用原始资料
      if (chunks.length === 0) {
        const selectedMats = allMaterials.filter((m) => selectedMaterialIds.includes(m.id))
        if (selectedMats.length === 0) {
          const reply: ChatMsg = {
            id: `msg_${Date.now() + 1}`,
            role: 'assistant',
            content: '请先在右侧面板选择要生成图谱的资料，然后告诉我你想要什么样的知识图谱。',
          }
          setChatMessages((prev) => [...prev, reply])
          return
        }
        for (const mat of selectedMats) {
          const content = mat.content
          if (content.length <= CHUNK_SIZE) {
            chunks.push({ name: mat.name, content })
          } else {
            for (let i = 0; i < content.length; i += CHUNK_SIZE) {
              chunks.push({ name: `${mat.name} (第${Math.floor(i / CHUNK_SIZE) + 1}部分)`, content: content.substring(i, i + CHUNK_SIZE) })
            }
          }
        }
      }

      const progressMsg: ChatMsg = {
        id: `msg_progress`,
        role: 'assistant',
        content: `正在分析 ${selectedMats.length} 份资料（${chunks.length} 个分块），生成知识图谱中...`,
      }
      setChatMessages((prev) => [...prev, progressMsg])

      for (const chunk of chunks) {
        const result = await window.electron?.ai.generateGraphFromContent(chunk.content)
        if (!result) continue

        // 去重合并节点
        for (const node of result.nodes) {
          if (!seenNodeNames.has(node.name)) {
            seenNodeNames.add(node.name)
            allNodes.push(node)
          }
        }
        // 合并边
        allEdges.push(...result.edges)
      }

      if (allNodes.length === 0) {
        setChatMessages((prev) => prev.filter((m) => m.id !== 'msg_progress'))
        const reply: ChatMsg = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: '未能从资料中提取出有效的知识结构，请确认资料内容包含可识别的知识点。',
        }
        setChatMessages((prev) => [...prev, reply])
        return
      }

      // 去重边
      const edgeSet = new Set<string>()
      const uniqueEdges = allEdges.filter((e) => {
        const key = `${e.from}->${e.to}:${e.type}`
        if (edgeSet.has(key)) return false
        edgeSet.add(key)
        return true
      })

      const newGraph: KnowledgeGraphData = {
        id: `kg_${Date.now()}`,
        subjectId,
        title: text,
        nodes: allNodes,
        edges: uniqueEdges,
        createdAt: new Date().toISOString(),
      }

      await window.electron?.db.add('knowledgeGraphs', newGraph)
      setGraphData(newGraph)
      setSelectedNode(null)
      setGraphHistory((prev) => [newGraph, ...prev])

      // 移除进度消息
      setChatMessages((prev) => prev.filter((m) => m.id !== 'msg_progress'))

      const matNames = selectedMats.map((m) => m.name).join('、')
      const reply: ChatMsg = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: `知识图谱生成完成！\n\n选取了 ${selectedMats.length} 份资料：${matNames}\n生成了 ${allNodes.length} 个概念节点和 ${uniqueEdges.length} 条关系。${chunks.length > 1 ? `\n（资料较大，分 ${chunks.length} 块处理后合并）` : ''}`,
        materialRefs: selectedMats.map((m) => m.name),
      }
      setChatMessages((prev) => [...prev, reply])
    } catch (err: unknown) {
      setChatMessages((prev) => prev.filter((m) => m.id !== 'msg_progress'))
      const errMsg = err instanceof Error ? err.message : '生成失败'
      const reply: ChatMsg = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: errMsg.includes('API Key')
          ? '请先在右上角设置中配置 API Key'
          : `出错了: ${errMsg}`,
      }
      setChatMessages((prev) => [...prev, reply])
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = useCallback((node: ConceptNode | null) => {
    setSelectedNode(node)
    if (node) setShowDetail(true)
  }, [])

  const handleSearch = (value: string) => {
    if (!graphData || !value.trim()) {
      setHighlightedNodeId(null)
      return
    }
    const found = graphData.nodes.find((n) =>
      n.name.toLowerCase().includes(value.toLowerCase())
    )
    if (found) {
      setHighlightedNodeId(found.id)
      setSelectedNode(found)
      setShowDetail(true)
    } else {
      message.info('未找到匹配的概念')
    }
  }

  const getConnectedNodes = (nodeId: string): ConceptNode[] => {
    if (!graphData) return []
    const connectedIds = new Set<string>()
    graphData.edges.forEach((e) => {
      if (e.from === nodeId) connectedIds.add(e.to)
      if (e.to === nodeId) connectedIds.add(e.from)
    })
    return graphData.nodes.filter((n) => connectedIds.has(n.id))
  }

  const filteredNodes =
    graphData?.nodes.filter((n) => activeCategories.includes(n.category)) || []
  const filteredEdges =
    graphData?.edges.filter(
      (e) =>
        filteredNodes.some((n) => n.id === e.from) &&
        filteredNodes.some((n) => n.id === e.to)
    ) || []

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      {/* Top Controls Bar */}
      <div className="flex gap-4 flex-shrink-0">
        {/* Material Picker - compact */}
        <div className="bg-white rounded-xl p-3 shadow-sm flex-shrink-0" style={{ width: 240 }}>
          <div className="flex items-center gap-2 mb-2">
            <BookOutlined className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-700">选择资料</span>
            {selectedMaterialIds.length > 0 && (
              <Tag color="blue" className="!text-xs !ml-auto">{selectedMaterialIds.length} 份</Tag>
            )}
          </div>
          <div className="h-32 overflow-auto">
            <MaterialPicker
              value={selectedMaterialIds}
              onChange={(ids) => setSelectedMaterialIds(ids)}
              materials={allMaterials}
            />
          </div>
        </div>

        {/* AI Chat - compact horizontal */}
        <div className="bg-white rounded-xl p-3 shadow-sm flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <RobotOutlined className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-700">AI 图谱助手</span>
            {chatMessages.length > 0 && (
              <Tag color="blue" className="!text-xs !ml-auto">{chatMessages.length} 条</Tag>
            )}
          </div>
          <div className="flex gap-2">
            <Input.TextArea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  handleChatSend()
                }
              }}
              placeholder="描述你想要的图谱，如「帮我整理数据结构的知识图谱」"
              autoSize={{ minRows: 1, maxRows: 2 }}
              className="flex-1"
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleChatSend}
              loading={loading}
              className="!h-auto"
            />
          </div>
          {chatMessages.length > 0 && (
            <div className="mt-2 max-h-20 overflow-auto">
              {chatMessages.slice(-3).map((msg) => (
                <div key={msg.id} className={`text-xs mb-1 ${msg.role === 'user' ? 'text-blue-600 text-right' : 'text-gray-600'}`}>
                  {msg.role === 'user' ? `你: ${msg.content.substring(0, 60)}` : `AI: ${msg.content.substring(0, 80)}...`}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters & History - compact */}
        {graphData && (
          <div className="bg-white rounded-xl p-3 shadow-sm flex-shrink-0" style={{ width: 220 }}>
            <div className="flex items-center gap-2 mb-2">
              <SearchOutlined className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-700">筛选与历史</span>
            </div>
            <Input.Search
              placeholder="搜索概念..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onSearch={handleSearch}
              size="small"
              className="mb-2"
            />
            <div className="flex flex-wrap gap-1 mb-2">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <Checkbox
                  key={key}
                  checked={activeCategories.includes(key)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setActiveCategories((prev) => [...prev, key])
                    } else {
                      setActiveCategories((prev) => prev.filter((c) => c !== key))
                    }
                  }}
                >
                  <span className="text-xs">{label}</span>
                </Checkbox>
              ))}
            </div>
            {graphHistory.length > 0 && (
              <div className="max-h-16 overflow-auto">
                {graphHistory.slice(0, 5).map((g) => (
                  <div
                    key={g.id}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer text-xs ${
                      graphData?.id === g.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-500'
                    }`}
                    onClick={() => { setGraphData(g); setSelectedNode(null) }}
                  >
                    <span className="flex-1 truncate">{g.title}</span>
                    <span className="text-gray-400">{g.nodes.length}节点</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Toolbar */}
        {graphData && (
          <div className="bg-white rounded-xl px-4 py-2 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                {graphData.title}
              </span>
              <Tag>{graphData.nodes.length} 节点</Tag>
              <Tag>{graphData.edges.length} 关系</Tag>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                type={layout === 'force' ? 'primary' : 'default'}
                icon={<NodeIndexOutlined />}
                onClick={() => setLayout('force')}
              >
                力导向
              </Button>
              <Button
                size="small"
                type={layout === 'hierarchical' ? 'primary' : 'default'}
                icon={<LayoutIcon />}
                onClick={() => setLayout('hierarchical')}
              >
                层级
              </Button>
              <Button
                size="small"
                icon={<ExpandOutlined />}
                onClick={() => graphRef.current?.fit()}
              >
                适配
              </Button>
            </div>
          </div>
        )}

        {/* Graph Canvas */}
        <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden">
          {loading && !graphData ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Spin size="large" />
                <p className="mt-4 text-gray-500">AI 正在分析资料，提取知识结构...</p>
              </div>
            </div>
          ) : graphData ? (
            <VisGraph
              ref={graphRef}
              nodes={filteredNodes}
              edges={filteredEdges}
              layout={layout}
              onNodeClick={handleNodeClick}
              highlightedNodeId={highlightedNodeId}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Empty
                description={
                  <span className="text-gray-400">
                    在左侧告诉 AI 你想要什么样的知识图谱
                  </span>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Detail Panel */}
      {showDetail && selectedNode && (
        <div className="w-72 flex-shrink-0 bg-white rounded-xl p-4 shadow-sm overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">概念详情</h3>
            <Button
              type="text"
              size="small"
              onClick={() => {
                setShowDetail(false)
                setSelectedNode(null)
              }}
            >
              关闭
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="text-base font-bold text-gray-800">{selectedNode.name}</h4>

            <div className="flex gap-2">
              <Tag color={CATEGORY_COLORS[selectedNode.category]}>
                {CATEGORY_LABELS[selectedNode.category] || selectedNode.category}
              </Tag>
              <Tag color={DIFFICULTY_COLORS[selectedNode.difficulty]}>
                {DIFFICULTY_LABELS[selectedNode.difficulty] || selectedNode.difficulty}
              </Tag>
            </div>

            <div className="text-sm text-gray-600 leading-relaxed">
              {selectedNode.description}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <h5 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                相关概念
              </h5>
              <div className="space-y-1.5">
                {getConnectedNodes(selectedNode.id).map((node) => {
                  const edge = graphData?.edges.find(
                    (e) =>
                      (e.from === selectedNode.id && e.to === node.id) ||
                      (e.to === selectedNode.id && e.from === node.id)
                  )
                  return (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedNode(node)
                        graphRef.current?.focusNode(node.id)
                        setHighlightedNodeId(node.id)
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[node.category] }}
                      />
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {node.name}
                      </span>
                      {edge && (
                        <span className="text-xs text-gray-400">
                          {RELATION_LABELS[edge.type] || edge.label}
                        </span>
                      )}
                    </div>
                  )
                })}
                {getConnectedNodes(selectedNode.id).length === 0 && (
                  <p className="text-xs text-gray-400">无关联概念</p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <h5 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                关系类型
              </h5>
              <div className="flex flex-wrap gap-1">
                {[
                  ...new Set(graphData?.edges.map((e) => e.type) || []),
                ].map((type) => (
                  <Tag key={type} className="text-xs">
                    {RELATION_LABELS[type] || type}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default KnowledgeGraph
