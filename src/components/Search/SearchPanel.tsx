import { useState, useEffect } from 'react'
import { Input, Button, Card, Tag, Empty, Checkbox, Spin, message, Collapse } from 'antd'
import { SearchOutlined, DownloadOutlined, StarOutlined, LinkOutlined, FileTextOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'
import { renderMarkdown } from '../../lib/markdown'

interface SearchPanelProps {
  subjectId: string
}

interface ResultGroup {
  sourceId: string
  sourceName: string
  type: string
  results: SearchResult[]
}

const SOURCE_COLORS: Record<string, string> = {
  'semantic-scholar': 'green',
  'arxiv': 'blue',
  'crossref': 'orange',
  'dblp': 'purple',
  'openalex': 'cyan',
  'bing': 'geekblue',
  'baidu': 'blue',
  'ddg': 'red',
  'baidu-wenku': 'blue',
  'zhihu': 'blue',
  'bilibili': 'pink',
  'baidu-xueshu': 'green',
  'csdn': 'red',
  'github': 'default',
}

const TYPE_LABELS: Record<string, { color: string; text: string }> = {
  courseware: { color: 'blue', text: '课件' },
  qa: { color: 'orange', text: '问答' },
  video: { color: 'red', text: '视频' },
  academic: { color: 'green', text: '学术' },
  ebook: { color: 'purple', text: '电子书' },
  'pan-search': { color: 'cyan', text: '网盘' },
  code: { color: 'geekblue', text: '代码' },
  tech: { color: 'volcano', text: '技术' },
  web: { color: 'default', text: '网页' },
}

function groupBySource(results: SearchResult[]): ResultGroup[] {
  const map = new Map<string, ResultGroup>()
  for (const r of results) {
    const key = r.sourceId
    if (!map.has(key)) {
      map.set(key, {
        sourceId: key,
        sourceName: r.source,
        type: r.type,
        results: [],
      })
    }
    map.get(key)!.results.push(r)
  }
  return Array.from(map.values()).sort((a, b) => b.results.length - a.results.length)
}

const SearchPanel = ({ subjectId }: SearchPanelProps) => {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [groups, setGroups] = useState<ResultGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<SearchSource[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedContent, setExpandedContent] = useState('')
  const [expandedLoading, setExpandedLoading] = useState(false)
  const [activeGroups, setActiveGroups] = useState<string[]>([])

  useEffect(() => {
    window.electron?.search.getSources().then((s) => {
      setSources(s)
      setSelectedSources(s.map((src) => src.id))
    })
  }, [])

  useEffect(() => {
    const g = groupBySource(results)
    setGroups(g)
    setActiveGroups(g.map(grp => grp.sourceId))
  }, [results])

  const handleSearch = async () => {
    if (!keyword.trim()) {
      message.warning('请输入搜索关键词')
      return
    }
    setLoading(true)
    setResults([])
    try {
      const searchResults = await window.electron?.search.query(keyword, selectedSources)
      setResults(searchResults || [])
    } catch (err) {
      message.error('搜索失败: ' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async (item: SearchResult) => {
    const material = {
      id: `mat_${Date.now()}`,
      name: item.title,
      type: 'search',
      size: '-',
      content: `${item.title}\n\n${item.summary}\n\n来源: ${item.source} (${item.url})`,
      subjectId,
      addedAt: new Date().toLocaleString('zh-CN'),
    }
    await window.electron?.db.add('materials', material)
    message.success(`已导入: ${item.title}`)
  }

  const handleSaveMarkdown = async (item: SearchResult) => {
    try {
      const markdown = await window.electron?.search.fetchAsMarkdown(item.url)
      if (!markdown) {
        message.error('获取页面内容失败')
        return
      }
      const material = {
        id: `mat_${Date.now()}`,
        name: `${item.title} (MD)`,
        type: 'search',
        size: '-',
        content: markdown,
        subjectId,
        addedAt: new Date().toLocaleString('zh-CN'),
      }
      await window.electron?.db.add('materials', material)
      message.success(`已保存为 Markdown: ${item.title}`)
    } catch {
      message.error('保存 Markdown 失败')
    }
  }

  const handleToggleExpand = async (item: SearchResult) => {
    if (expandedId === item.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.id)
    setExpandedContent('')
    setExpandedLoading(true)
    try {
      const markdown = await window.electron?.search.fetchAsMarkdown(item.url)
      setExpandedContent(markdown || '无法获取页面内容')
    } catch {
      setExpandedContent('获取页面内容失败')
    } finally {
      setExpandedLoading(false)
    }
  }

  const renderResultCard = (item: SearchResult) => (
    <div key={item.id}>
      <Card hoverable className="shadow-sm">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3
                className="font-medium text-gray-800 cursor-pointer hover:text-blue-500"
                onClick={() => window.electron?.shell.openExternal(item.url)}
              >
                {item.title}
              </h3>
              <LinkOutlined
                className="text-gray-300 cursor-pointer hover:text-blue-500"
                onClick={() => window.electron?.shell.openExternal(item.url)}
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">{item.summary}</p>
            <div className="flex gap-2 mt-2 flex-wrap items-center">
              <Tag color={TYPE_LABELS[item.type]?.color || 'default'}>
                {TYPE_LABELS[item.type]?.text || item.type}
              </Tag>
              {(item as any).year && (
                <Tag className="!text-xs">{(item as any).year}年</Tag>
              )}
              {(item as any).citationCount != null && (item as any).citationCount > 0 && (
                <Tag className="!text-xs">引用 {(item as any).citationCount}</Tag>
              )}
              {(item as any).authors && (
                <span className="text-xs text-gray-400 truncate max-w-[200px]">{(item as any).authors}</span>
              )}
              <span className="text-xs text-gray-400">
                相关度: {Math.round(item.score * 100)}%
              </span>
            </div>
          </div>
          <div className="flex gap-2 ml-4 flex-shrink-0">
            <Button
              icon={expandedId === item.id ? <UpOutlined /> : <DownOutlined />}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleToggleExpand(item) }}
            >
              {expandedId === item.id ? '收起' : '预览'}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleImport(item) }}
            >
              导入
            </Button>
            <Button
              icon={<FileTextOutlined />}
              size="small"
              onClick={(e) => { e.stopPropagation(); handleSaveMarkdown(item) }}
            >
              保存 MD
            </Button>
            <Button
              icon={<StarOutlined />}
              size="small"
              type="text"
              onClick={(e) => e.stopPropagation()}
            >
              收藏
            </Button>
          </div>
        </div>
      </Card>
      {expandedId === item.id && (
        <div className="border border-t-0 border-gray-200 rounded-b-lg bg-gray-50 p-4 -mt-3">
          {expandedLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spin size="small" />
              <span className="text-sm text-gray-500 ml-2">正在获取页面内容...</span>
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed max-h-96 overflow-auto"
              dangerouslySetInnerHTML={renderMarkdown(expandedContent)}
            />
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col items-center pt-4">
        <h2 className="text-xl font-bold text-gray-800 mb-2">AI 智能搜集资料</h2>
        <p className="text-sm text-gray-500 mb-4">输入学科或关键词，AI 帮你从多个平台搜索优质复习资料</p>

        <div className="flex gap-3 w-full max-w-2xl">
          <Input
            size="large"
            placeholder="输入学科或关键词，如：高等数学、数据结构..."
            prefix={<SearchOutlined className="text-gray-400" />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            className="flex-1"
          />
          <Button type="primary" size="large" loading={loading} onClick={handleSearch}>
            搜索
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap items-center justify-center mt-4">
          <span className="text-xs text-gray-400">搜索源：</span>
          {sources.map((source) => (
            <Checkbox
              key={source.id}
              checked={selectedSources.includes(source.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedSources((prev) => [...prev, source.id])
                } else {
                  setSelectedSources((prev) => prev.filter((id) => id !== source.id))
                }
              }}
              className="!text-xs"
            >
              <Tag color={SOURCE_COLORS[source.id] || TYPE_LABELS[source.type]?.color || 'default'} className="!text-xs !m-0">
                {source.name}
              </Tag>
            </Checkbox>
          ))}
        </div>
      </div>

      {results.length > 0 ? (
        <div>
          <p className="text-sm text-gray-500 mb-3">找到 {results.length} 个结果，来自 {groups.length} 个来源</p>
          <Collapse
            activeKey={activeGroups}
            onChange={(keys) => setActiveGroups(keys as string[])}
            items={groups.map((group) => ({
              key: group.sourceId,
              label: (
                <div className="flex items-center gap-2">
                  <Tag color={SOURCE_COLORS[group.sourceId] || 'default'} className="!m-0">
                    {group.sourceName}
                  </Tag>
                  <span className="text-xs text-gray-500">{group.results.length} 个结果</span>
                  <Tag color={TYPE_LABELS[group.type]?.color || 'default'} className="!text-xs !m-0">
                    {TYPE_LABELS[group.type]?.text || group.type}
                  </Tag>
                </div>
              ),
              children: (
                <div className="space-y-3">
                  {group.results.map(renderResultCard)}
                </div>
              ),
            }))}
          />
        </div>
      ) : (
        !loading && <Empty description="输入关键词开始搜索" className="mt-12" />
      )}
    </div>
  )
}

export default SearchPanel
