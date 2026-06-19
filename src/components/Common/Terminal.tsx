import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Spin } from 'antd'
import { RocketOutlined, CodeOutlined, SettingOutlined } from '@ant-design/icons'

interface CliOption {
  value: string
  label: string
  icon: string
  description: string
  command: string
}

const CLI_OPTIONS: CliOption[] = [
  { value: 'claude', label: 'Claude Code', icon: '🤖', description: 'Anthropic 的 AI 编程助手', command: 'claude' },
  { value: 'codex', label: 'Codex', icon: '💻', description: 'OpenAI 的代码生成模型', command: 'codex' },
  { value: 'gemini', label: 'Gemini', icon: '✨', description: 'Google 的多模态 AI', command: 'gemini' },
  { value: 'mimo', label: 'Mimo', icon: '🔮', description: '智能编程助手', command: 'mimo' },
  { value: 'reasonix', label: 'Reasonix', icon: '🧠', description: '推理增强 AI', command: 'reasonix' },
  { value: 'aider', label: 'Aider', icon: '🔗', description: 'AI 结对编程工具', command: 'aider' },
  { value: 'continue', label: 'Continue', icon: '▶️', description: 'IDE 中的 AI 编程助手', command: 'continue' },
]

const TerminalPanel = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [termStarted, setTermStarted] = useState(false)
  const [selectedCli, setSelectedCli] = useState<string>('claude')
  const [availableClis, setAvailableClis] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [termReady, setTermReady] = useState(false)
  const [contextLoaded, setContextLoaded] = useState(false)
  const termRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)

  useEffect(() => {
    detectAvailableClis()
    loadContext()
  }, [])

  const loadContext = async () => {
    try {
      const ctx = await window.electron?.terminal?.getContext()
      if (ctx) {
        console.log('Terminal context loaded:', ctx.appName)
        setContextLoaded(true)
      }
    } catch (err) {
      console.error('Failed to load terminal context:', err)
    }
  }

  useEffect(() => {
    if (!termStarted || !containerRef.current) return

    let disposed = false
    let cleanupFns: (() => void)[] = []

    const init = async () => {
      try {
        const { Terminal } = await import('@xterm/xterm')
        const { FitAddon } = await import('@xterm/addon-fit')

        if (disposed || !containerRef.current) return

        const term = new Terminal({
          fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
          fontSize: 13,
          lineHeight: 1.3,
          letterSpacing: 0,
          theme: {
            background: '#0d1117',
            foreground: '#c9d1d9',
            cursor: '#58a6ff',
            cursorAccent: '#0d1117',
            selectionBackground: '#264f78',
            selectionForeground: '#ffffff',
            black: '#484f58',
            red: '#ff7b72',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#bc8cff',
            cyan: '#39c5cf',
            white: '#c9d1d9',
            brightBlack: '#6e7681',
            brightRed: '#ffa198',
            brightGreen: '#56d364',
            brightYellow: '#e3b341',
            brightBlue: '#79c0ff',
            brightMagenta: '#d2a8ff',
            brightCyan: '#56d4dd',
            brightWhite: '#f0f6fc',
          },
          cursorBlink: true,
          convertEol: true,
          allowProposedApi: true,
          scrollback: 5000,
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        // Ensure container has dimensions before opening
        if (containerRef.current) {
          containerRef.current.style.width = '100%'
          containerRef.current.style.height = '100%'
          containerRef.current.style.overflow = 'hidden'
        }

        term.open(containerRef.current)
        termRef.current = term
        fitAddonRef.current = fitAddon

        // Show welcome message with context
        term.writeln('\x1b[1;36m╔══════════════════════════════════════════════════════════╗\x1b[0m')
        term.writeln('\x1b[1;36m║                                                          ║\x1b[0m')
        term.writeln('\x1b[1;36m║              期末补完计划 - 终端                         ║\x1b[0m')
        term.writeln('\x1b[1;36m║                                                          ║\x1b[0m')
        term.writeln('\x1b[1;36m╚══════════════════════════════════════════════════════════╝\x1b[0m')
        term.writeln('')

        if (contextLoaded) {
          term.writeln('\x1b[90m> 上下文已加载 ✓\x1b[0m')
        }

        term.writeln('\x1b[90m> 工作目录: 材料文件夹\x1b[0m')
        term.writeln(`\x1b[90m> 正在启动 ${selectedCli}...\x1b[0m`)
        term.writeln('')
        term.writeln('\x1b[90m提示: 输入 /help 查看可用命令\x1b[0m')
        term.writeln('')

        // Create terminal with selected CLI
        window.electron?.terminal?.create({ cli: selectedCli })

        // Input -> shell (with command interception)
        term.onData((data: string) => {
          // Check for built-in commands
          if (data === '/help\r' || data === '/help\n') {
            term.writeln('')
            term.writeln('\x1b[1;33m═══ 期末补完计划 - 可用命令 ═══\x1b[0m')
            term.writeln('')
            term.writeln('\x1b[36m/subjects\x1b[0m      - 列出所有学科')
            term.writeln('\x1b[36m/materials [id]\x1b[0m - 列出资料 (可选学科ID)')
            term.writeln('\x1b[36m/read [id]\x1b[0m      - 读取资料内容')
            term.writeln('\x1b[36m/files\x1b[0m          - 列出当前目录文件')
            term.writeln('\x1b[36m/cat [file]\x1b[0m      - 读取文件内容')
            term.writeln('\x1b[36m/search [query]\x1b[0m - 搜索资料')
            term.writeln('\x1b[36m/wrong [id]\x1b[0m     - 列出错题 (可选学科ID)')
            term.writeln('\x1b[36m/history [id]\x1b[0m   - 列出练习记录 (可选学科ID)')
            term.writeln('\x1b[36m/export [type]\x1b[0m  - 导出数据 (subjects/materials/wrong/history/all)')
            term.writeln('\x1b[36m/context\x1b[0m        - 显示应用上下文')
            term.writeln('\x1b[36m/conversations\x1b[0m  - 同步对话记录')
            term.writeln('\x1b[36m/help\x1b[0m           - 显示此帮助')
            term.writeln('')
            term.writeln('\x1b[90m提示: 你可以直接使用 CLI 工具的原生命令\x1b[0m')
            term.writeln('')
            return
          }

          if (data === '/context\r' || data === '/context\n') {
            term.writeln('')
            term.writeln('\x1b[1;33m═══ 应用上下文 ═══\x1b[0m')
            window.electron?.terminal?.getContext().then(ctx => {
              if (ctx) {
                term.writeln(`\x1b[36m应用名称:\x1b[0m ${ctx.appName}`)
                term.writeln(`\x1b[36m版本:\x1b[0m ${ctx.version}`)
                term.writeln(`\x1b[36m用户数据:\x1b[0m ${ctx.userDataPath}`)
                term.writeln(`\x1b[36m材料目录:\x1b[0m ${ctx.uploadsPath}`)
                term.writeln('')
                term.writeln('\x1b[36m可用 Skills:\x1b[0m')
                ctx.skills.forEach(s => term.writeln(`  - ${s}`))
                term.writeln('')
                term.writeln('\x1b[36m数据源:\x1b[0m')
                ctx.dataSources.forEach(s => term.writeln(`  - ${s}`))
                term.writeln('')
              }
              term.writeln('\x1b[1;33m══════════════════════\x1b[0m')
              term.writeln('')
            })
            return
          }

          if (data === '/files\r' || data === '/files\n') {
            term.writeln('')
            term.writeln('\x1b[1;33m═══ 当前目录文件 ═══\x1b[0m')
            window.electron?.terminal?.getContext().then(ctx => {
              if (ctx) {
                term.writeln(`\x1b[36m目录:\x1b[0m ${ctx.uploadsPath}`)
                term.writeln('')
                // List files using the global API
                window.electron?.terminal?.listMaterials().then(materials => {
                  if (materials && materials.length > 0) {
                    materials.slice(0, 30).forEach((m: any) => {
                      const size = m.content ? `${Math.round(m.content.length / 1024)}KB` : '0KB'
                      term.writeln(`\x1b[36m${m.id}\x1b[0m - ${m.name} (${size})`)
                    })
                    if (materials.length > 30) {
                      term.writeln(`\x1b[90m... 还有 ${materials.length - 30} 个文件\x1b[0m`)
                    }
                  } else {
                    term.writeln('\x1b[90m目录为空\x1b[0m')
                  }
                  term.writeln('\x1b[1;33m══════════════════════\x1b[0m')
                  term.writeln('')
                })
              }
            })
            return
          }

          if (data.startsWith('/cat')) {
            const parts = data.trim().split(/\s+/)
            const fileId = parts[1]
            if (!fileId) {
              term.writeln('\x1b[31m用法: /cat [文件ID]\x1b[0m')
            } else {
              term.writeln('')
              term.writeln('\x1b[1;33m═══ 文件内容 ═══\x1b[0m')
              window.electron?.terminal?.readMaterial(fileId).then(material => {
                if (material) {
                  term.writeln(`\x1b[36m文件名:\x1b[0m ${material.name}`)
                  term.writeln(`\x1b[36mID:\x1b[0m ${material.id}`)
                  term.writeln('')
                  term.writeln('\x1b[36m内容:\x1b[0m')
                  term.writeln(material.content.substring(0, 3000))
                  if (material.content.length > 3000) {
                    term.writeln('\x1b[90m... 内容已截断 (显示前3000字符)\x1b[0m')
                  }
                } else {
                  term.writeln('\x1b[90m未找到文件\x1b[0m')
                }
                term.writeln('\x1b[1;33m══════════════════════\x1b[0m')
                term.writeln('')
              })
            }
            return
          }

          if (data === '/subjects\r' || data === '/subjects\n') {
            term.writeln('')
            window.electron?.terminal?.listSubjects().then(subjects => {
              term.writeln('\x1b[1;33m═══ 学科列表 ═══\x1b[0m')
              if (subjects && subjects.length > 0) {
                subjects.forEach((s: any) => {
                  term.writeln(`\x1b[36m${s.id}\x1b[0m - ${s.name} (${s.year || '未设置学年'})`)
                })
              } else {
                term.writeln('\x1b[90m暂无学科\x1b[0m')
              }
              term.writeln('\x1b[1;33m════════════════════\x1b[0m')
              term.writeln('')
            })
            return
          }

          if (data.startsWith('/materials')) {
            const parts = data.trim().split(/\s+/)
            const subjectId = parts[1]
            term.writeln('')
            window.electron?.terminal?.listMaterials(subjectId).then(materials => {
              term.writeln('\x1b[1;33m═══ 资料列表 ═══\x1b[0m')
              if (materials && materials.length > 0) {
                materials.slice(0, 20).forEach((m: any) => {
                  term.writeln(`\x1b[36m${m.id}\x1b[0m - ${m.name}`)
                })
                if (materials.length > 20) {
                  term.writeln(`\x1b[90m... 还有 ${materials.length - 20} 份资料\x1b[0m`)
                }
              } else {
                term.writeln('\x1b[90m暂无资料\x1b[0m')
              }
              term.writeln('\x1b[1;33m════════════════════\x1b[0m')
              term.writeln('')
            })
            return
          }

          if (data.startsWith('/read')) {
            const parts = data.trim().split(/\s+/)
            const materialId = parts[1]
            if (!materialId) {
              term.writeln('\x1b[31m用法: /read [资料ID]\x1b[0m')
            } else {
              term.writeln('')
              window.electron?.terminal?.readMaterial(materialId).then(material => {
                term.writeln('\x1b[1;33m═══ 资料内容 ═══\x1b[0m')
                if (material) {
                  term.writeln(`\x1b[36m名称:\x1b[0m ${material.name}`)
                  term.writeln(`\x1b[36m内容:\x1b[0m`)
                  term.writeln(material.content.substring(0, 2000))
                  if (material.content.length > 2000) {
                    term.writeln('\x1b[90m... 内容已截断\x1b[0m')
                  }
                } else {
                  term.writeln('\x1b[90m未找到资料\x1b[0m')
                }
                term.writeln('\x1b[1;33m════════════════════\x1b[0m')
                term.writeln('')
              })
            }
            return
          }

          if (data.startsWith('/search')) {
            const parts = data.trim().split(/\s+/)
            const query = parts.slice(1).join(' ')
            if (!query) {
              term.writeln('\x1b[31m用法: /search [搜索词]\x1b[0m')
            } else {
              term.writeln('')
              window.electron?.terminal?.search(query).then(results => {
                term.writeln('\x1b[1;33m═══ 搜索结果 ═══\x1b[0m')
                if (results && results.length > 0) {
                  results.forEach((r: any) => {
                    term.writeln(`\x1b[36m${r.source}\x1b[0m - ${r.query}`)
                    term.writeln(`  \x1b[90m${r.url}\x1b[0m`)
                  })
                } else {
                  term.writeln('\x1b[90m未找到结果\x1b[0m')
                }
                term.writeln('\x1b[1;33m════════════════════\x1b[0m')
                term.writeln('')
              })
            }
            return
          }

          if (data.startsWith('/wrong')) {
            const parts = data.trim().split(/\s+/)
            const subjectId = parts[1]
            term.writeln('')
            window.electron?.terminal?.getWrongQuestions(subjectId).then(wrong => {
              term.writeln('\x1b[1;33m═══ 错题本 ═══\x1b[0m')
              if (wrong && wrong.length > 0) {
                wrong.slice(0, 20).forEach((w: any) => {
                  term.writeln(`\x1b[36m${w.id}\x1b[0m - ${w.question?.substring(0, 50)}...`)
                })
                if (wrong.length > 20) {
                  term.writeln(`\x1b[90m... 还有 ${wrong.length - 20} 道错题\x1b[0m`)
                }
              } else {
                term.writeln('\x1b[90m暂无错题\x1b[0m')
              }
              term.writeln('\x1b[1;33m════════════════════\x1b[0m')
              term.writeln('')
            })
            return
          }

          if (data.startsWith('/history')) {
            const parts = data.trim().split(/\s+/)
            const subjectId = parts[1]
            term.writeln('')
            window.electron?.terminal?.getQuizHistory(subjectId).then(history => {
              term.writeln('\x1b[1;33m═══ 练习记录 ═══\x1b[0m')
              if (history && history.length > 0) {
                history.slice(0, 20).forEach((h: any) => {
                  const accuracy = h.total > 0 ? Math.round((h.correct / h.total) * 100) : 0
                  term.writeln(`\x1b[36m${h.id}\x1b[0m - ${h.total}题 正确率${accuracy}%`)
                })
                if (history.length > 20) {
                  term.writeln(`\x1b[90m... 还有 ${history.length - 20} 条记录\x1b[0m`)
                }
              } else {
                term.writeln('\x1b[90m暂无练习记录\x1b[0m')
              }
              term.writeln('\x1b[1;33m════════════════════\x1b[0m')
              term.writeln('')
            })
            return
          }

          if (data.startsWith('/export')) {
            const parts = data.trim().split(/\s+/)
            const type = parts[1] || 'all'
            term.writeln('')
            window.electron?.terminal?.exportData(type).then(data => {
              term.writeln('\x1b[1;33m═══ 导出数据 ═══\x1b[0m')
              term.writeln(JSON.stringify(data, null, 2).substring(0, 2000))
              if (JSON.stringify(data).length > 2000) {
                term.writeln('\x1b[90m... 数据已截断\x1b[0m')
              }
              term.writeln('\x1b[1;33m════════════════════\x1b[0m')
              term.writeln('')
            })
            return
          }

          if (data === '/conversations\r' || data === '/conversations\n') {
            handleSyncConversations()
            return
          }

          // Pass to shell
          window.electron?.terminal?.write(data)
        })

        // Shell -> display
        const handleData = (data: string) => {
          term.write(data)
        }
        window.electron?.terminal?.onData(handleData)

        const handleExit = () => {
          term.writeln('')
          term.writeln('\x1b[33m╔══════════════════════════════════════════════════════════╗\x1b[0m')
          term.writeln('\x1b[33m║                    进程已退出                           ║\x1b[0m')
          term.writeln('\x1b[33m╚══════════════════════════════════════════════════════════╝\x1b[0m')
        }
        window.electron?.terminal?.onExit(handleExit)

        // Initial fit with proper dimensions
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.style.width = '100%'
            containerRef.current.style.height = '100%'
          }
          fitAddon.fit()
          const dimensions = fitAddon.proposeDimensions()
          if (dimensions) {
            window.electron?.terminal?.resize(dimensions.cols, dimensions.rows)
          }
          term.focus()
          setTermReady(true)
        }, 100)

        // Resize handler with debounce
        let resizeTimeout: ReturnType<typeof setTimeout>
        const ro = new ResizeObserver(() => {
          clearTimeout(resizeTimeout)
          resizeTimeout = setTimeout(() => {
            if (containerRef.current) {
              // Force container dimensions
              containerRef.current.style.width = '100%'
              containerRef.current.style.height = '100%'
            }
            fitAddon.fit()
            const dimensions = fitAddon.proposeDimensions()
            if (dimensions) {
              window.electron?.terminal?.resize(dimensions.cols, dimensions.rows)
            }
          }, 100)
        })
        ro.observe(containerRef.current)

        cleanupFns.push(() => {
          ro.disconnect()
          window.electron?.terminal?.removeListener('terminal:data')
          window.electron?.terminal?.removeListener('terminal:exit')
          window.electron?.terminal?.destroy()
          term.dispose()
        })
      } catch (err: any) {
        setErrorMsg(`初始化失败: ${err?.message || err}`)
      }
    }

    init()

    return () => {
      disposed = true
      cleanupFns.forEach((fn) => fn())
    }
  }, [termStarted, selectedCli, contextLoaded])

  const detectAvailableClis = async () => {
    try {
      const clis = await window.electron?.terminal?.detectCli()
      setAvailableClis(clis || [])
      // Default to claude if available, otherwise first available
      if (clis && clis.length > 0) {
        setSelectedCli(clis.includes('claude') ? 'claude' : clis[0])
      }
    } catch (err) {
      console.error('Failed to detect CLI tools:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLaunch = () => {
    setTermStarted(true)
  }

  const handleReset = () => {
    setTermStarted(false)
    setTermReady(false)
    detectAvailableClis()
  }

  const handleSyncConversations = useCallback(async () => {
    if (!termRef.current) return

    try {
      const conversations = await window.electron?.terminal?.getConversations()
      if (conversations && conversations.length > 0) {
        termRef.current.writeln('')
        termRef.current.writeln('\x1b[1;33m═══ 对话记录同步 ═══\x1b[0m')
        conversations.slice(-5).forEach((conv: any) => {
          if (conv.role === 'user') {
            termRef.current.writeln(`\x1b[36m[用户]\x1b[0m ${conv.content}`)
          } else if (conv.role === 'assistant') {
            termRef.current.writeln(`\x1b[32m[AI]\x1b[0m ${conv.content}`)
          }
        })
        termRef.current.writeln('\x1b[1;33m════════════════════\x1b[0m')
        termRef.current.writeln('')
      }
    } catch (err) {
      console.error('Failed to sync conversations:', err)
    }
  }, [])

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d1117] p-6">
        <div className="text-center">
          <div className="text-red-400 text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-200 mb-2">启动失败</h3>
          <p className="text-sm text-gray-400 mb-4">{errorMsg}</p>
          <Button onClick={handleReset} size="small">
            重试
          </Button>
        </div>
      </div>
    )
  }

  if (!termStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d1117] p-6">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 mb-4">
              <CodeOutlined className="text-3xl text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-100 mb-1">启动终端</h2>
            <p className="text-sm text-gray-400">选择一个 AI 编程工具开始</p>
            {contextLoaded && (
              <p className="text-xs text-green-400 mt-2">✓ 上下文已加载</p>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-8">
              <Spin size="large" />
              <p className="text-sm text-gray-400 mt-4">检测可用工具中...</p>
            </div>
          ) : (
            <>
              {/* CLI Selection */}
              <div className="space-y-2 mb-6">
                {CLI_OPTIONS.filter(opt => availableClis.includes(opt.value)).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedCli(option.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      selectedCli === option.value
                        ? 'bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10'
                        : 'bg-[#161b22] border-gray-700/50 hover:border-gray-600'
                    }`}
                  >
                    <span className="text-2xl">{option.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-gray-200">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </div>
                    {selectedCli === option.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                    )}
                  </button>
                ))}
              </div>

              {availableClis.length === 0 && (
                <div className="text-center py-6 bg-[#161b22] rounded-xl border border-gray-700/50 mb-6">
                  <SettingOutlined className="text-2xl text-gray-500 mb-2" />
                  <p className="text-sm text-gray-400">未检测到可用工具</p>
                  <p className="text-xs text-gray-500 mt-1">请确保 CLI 工具已安装并在 PATH 中</p>
                </div>
              )}

              {/* Launch Button */}
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={handleLaunch}
                disabled={!selectedCli || availableClis.length === 0}
                className="w-full"
                size="large"
                style={{
                  height: 48,
                  borderRadius: 12,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  border: 'none',
                }}
              >
                启动终端
              </Button>

              {/* Footer Info */}
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500">
                  工作目录: <span className="text-gray-400">材料文件夹</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  按 <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">Ctrl+`</kbd> 切换终端
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Terminal Content - Header is in App.tsx */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ backgroundColor: '#0d1117' }}
      />
    </div>
  )
}

export default TerminalPanel
