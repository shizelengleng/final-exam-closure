import { useState, useEffect, useRef, useCallback } from 'react'
import { Input, Button, Tag, Empty, Checkbox, message, Spin } from 'antd'
import {
  SearchOutlined,
  ExpandOutlined,
  NodeIndexOutlined,
  ApartmentOutlined as LayoutIcon,
  BookOutlined,
} from '@ant-design/icons'
import VisGraph, { type VisGraphRef } from './VisGraph'
import type { ConceptNode, KnowledgeGraphData } from './types'
import { CATEGORY_COLORS, CATEGORY_LABELS, RELATION_LABELS } from './types'
import MaterialPicker from '../Common/MaterialPicker'
import ConversationPanel from '../Common/ConversationPanel'
import type { Material } from '../Common/MaterialPicker'

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
  const [graphLoading, setGraphLoading] = useState(false)
  const graphRef = useRef<VisGraphRef>(null)

  useEffect(() => {
    loadMaterials()
    loadGraphHistory()
  }, [subjectId])

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

  const handleGenerateGraph = async () => {
    const selectedMats = allMaterials.filter((m) => selectedMaterialIds.includes(m.id))
    if (selectedMats.length === 0) {
      message.warning('请先选择至少一份资料')
      return
    }

    setGraphLoading(true)
    try {
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

      if (chunks.length === 0) {
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

      for (const chunk of chunks) {
        const result = await window.electron?.ai.generateGraphFromContent(chunk.content)
        if (!result) continue

        for (const node of result.nodes) {
          if (!seenNodeNames.has(node.name)) {
            seenNodeNames.add(node.name)
            allNodes.push(node)
          }
        }
        allEdges.push(...result.edges)
      }

      if (allNodes.length === 0) {
        message.warning('未能从资料中提取出有效的知识结构')
        return
      }

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
        title: `知识图谱 - ${selectedMats.map((m) => m.name).join(', ')}`,
        nodes: allNodes,
        edges: uniqueEdges,
        createdAt: new Date().toISOString(),
      }

      await window.electron?.db.add('knowledgeGraphs', newGraph)
      setGraphData(newGraph)
      setSelectedNode(null)
      setGraphHistory((prev) => [newGraph, ...prev])

      message.success(`生成了 ${allNodes.length} 个概念节点和 ${uniqueEdges.length} 条关系`)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '生成失败'
      if (errMsg.includes('API Key')) {
        message.error('请先在右上角设置中配置 API Key')
      } else {
        message.error(`出错了: ${errMsg}`)
      }
    } finally {
      setGraphLoading(false)
    }
  }

  const contextPrompt = `你是一个知识图谱助手。当前学科已生成知识图谱，包含 ${graphData?.nodes.length || 0} 个节点和 ${graphData?.edges.length || 0} 条关系。
你可以：
- 帮助分析图谱中的知识结构
- 解释某个概念的含义和关联
- 建议需要补充的知识点
- 回答与图谱相关的学习问题`

  const handleChatSend = async (text: string): Promise<string> => {
    const fullPrompt = contextPrompt + `\n\n用户：${text}`
    return await window.electron?.ai.chat(fullPrompt) || 'AI 未能生成回复'
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
    <div className="flex h-full">
      {/* Left Sidebar: Material Picker + ConversationPanel */}
      <div className="w-80 flex flex-col border-r border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <BookOutlined className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-700">选择资料</span>
            {selectedMaterialIds.length > 0 && (
              <Tag color="blue" className="!text-xs !ml-auto">{selectedMaterialIds.length} 份</Tag>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <MaterialPicker
              value={selectedMaterialIds}
              onChange={(ids) => setSelectedMaterialIds(ids)}
              materials={allMaterials}
            />
          </div>
          <Button
            type="primary"
            size="small"
            block
            className="mt-2 flex-shrink-0"
            loading={graphLoading}
            onClick={handleGenerateGraph}
            disabled={selectedMaterialIds.length === 0}
          >
            {graphLoading ? '生成中...' : '生成知识图谱'}
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <ConversationPanel
            subjectId={subjectId}
            feature="graph"
            contextPrompt={contextPrompt}
            onSend={handleChatSend}
            placeholder="询问图谱相关问题..."
            showSaveToWiki={false}
          />
        </div>
      </div>

      {/* Center: Graph Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {graphData && (
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between flex-shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                {graphData.title}
              </span>
              <Tag>{graphData.nodes.length} 节点</Tag>
              <Tag>{graphData.edges.length} 关系</Tag>
            </div>
            <div className="flex items-center gap-2">
              <Input.Search
                placeholder="搜索概念..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onSearch={handleSearch}
                size="small"
                style={{ width: 160 }}
              />
              <div className="flex flex-wrap gap-1">
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

        <div className="flex-1 bg-white overflow-hidden">
          {graphLoading && !graphData ? (
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
                    选择资料后点击「生成知识图谱」开始
                  </span>
                }
              />
            </div>
          )}
        </div>

        {graphHistory.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-2 overflow-auto">
              <span className="text-xs text-gray-500 flex-shrink-0">历史:</span>
              {graphHistory.slice(0, 8).map((g) => (
                <div
                  key={g.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-xs whitespace-nowrap ${
                    graphData?.id === g.id ? 'bg-blue-100 text-blue-600' : 'bg-white hover:bg-gray-100 text-gray-600'
                  }`}
                  onClick={() => { setGraphData(g); setSelectedNode(null) }}
                >
                  <span className="truncate max-w-[120px]">{g.title}</span>
                  <span className="text-gray-400">{g.nodes.length}节点</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Detail Panel */}
      {showDetail && selectedNode && (
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 p-4 overflow-auto">
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
