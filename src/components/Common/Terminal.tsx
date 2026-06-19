import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Spin } from 'antd'
import { RocketOutlined, CodeOutlined, SettingOutlined, SendOutlined } from '@ant-design/icons'

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
  const termContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [termStarted, setTermStarted] = useState(false)
  const [selectedCli, setSelectedCli] = useState<string>('claude')
  const [availableClis, setAvailableClis] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [termReady, setTermReady] = useState(false)
  const [contextLoaded, setContextLoaded] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const termRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const refreshCallbackRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    detectAvailableClis()
    loadContext()
  }, [])

  const loadContext = async () => {
    try {
      const ctx = await window.electron?.terminal?.getContext()
      if (ctx) {
        setContextLoaded(true)
      }
    } catch (err) {
      console.error('Failed to load terminal context:', err)
    }
  }

  // Register refresh callback from parent
  useEffect(() => {
    ;(window as any).__terminalRefresh = () => {
      // Dispatch a custom event that app components can listen to
      window.dispatchEvent(new CustomEvent('terminal:refresh'))
    }
    return () => {
      delete (window as any).__terminalRefresh
    }
  }, [])

  const triggerAppRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('terminal:refresh'))
  }, [])

  useEffect(() => {
    if (!termStarted || !termContainerRef.current) return

    let disposed = false
    let cleanupFns: (() => void)[] = []

    const init = async () => {
      try {
        const { Terminal } = await import('@xterm/xterm')
        const { FitAddon } = await import('@xterm/addon-fit')

        if (disposed || !termContainerRef.current) return

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
          cursorBlink: false,
          cursorStyle: 'bar',
          convertEol: true,
          allowProposedApi: true,
          scrollback: 10000,
          disableStdin: true,
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        if (termContainerRef.current) {
          termContainerRef.current.style.width = '100%'
          termContainerRef.current.style.height = '100%'
          termContainerRef.current.style.overflow = 'hidden'
        }

        term.open(termContainerRef.current)
        termRef.current = term
        fitAddonRef.current = fitAddon

        // Enable text selection and copy
        term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'c' && term.hasSelection()) {
            if (event.type === 'keydown') {
              const selection = term.getSelection()
              if (selection) {
                navigator.clipboard.writeText(selection).catch(() => {
                  window.electron?.clipboard?.writeText(selection)
                })
              }
            }
            return false
          }
          if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            term.selectAll()
            return false
          }
          return true
        })

        // Welcome message
        term.writeln('\x1b[1;36m  期末补完计划 - 终端\x1b[0m')
        term.writeln('')
        if (contextLoaded) {
          term.writeln('\x1b[90m  上下文已加载 ✓\x1b[0m')
        }
        term.writeln('\x1b[90m  正在启动 ' + selectedCli + '...\x1b[0m')
        term.writeln('')
        term.writeln('\x1b[90m  输入 /help 查看可用命令\x1b[0m')
        term.writeln('')

        window.electron?.terminal?.create({ cli: selectedCli })

        // Shell -> display
        const handleData = (data: string) => {
          term.write(data)
        }
        window.electron?.terminal?.onData(handleData)

        const handleExit = () => {
          term.writeln('')
          term.writeln('\x1b[33m  进程已退出\x1b[0m')
        }
        window.electron?.terminal?.onExit(handleExit)

        setTimeout(() => {
          if (termContainerRef.current) {
            termContainerRef.current.style.width = '100%'
            termContainerRef.current.style.height = '100%'
          }
          fitAddon.fit()
          const dimensions = fitAddon.proposeDimensions()
          if (dimensions) {
            window.electron?.terminal?.resize(dimensions.cols, dimensions.rows)
          }
          setTermReady(true)
          inputRef.current?.focus()
        }, 100)

        let resizeTimeout: ReturnType<typeof setTimeout>
        const ro = new ResizeObserver(() => {
          clearTimeout(resizeTimeout)
          resizeTimeout = setTimeout(() => {
            if (termContainerRef.current) {
              termContainerRef.current.style.width = '100%'
              termContainerRef.current.style.height = '100%'
            }
            fitAddon.fit()
            const dimensions = fitAddon.proposeDimensions()
            if (dimensions) {
              window.electron?.terminal?.resize(dimensions.cols, dimensions.rows)
            }
          }, 100)
        })
        ro.observe(termContainerRef.current)

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

  const executeCommand = useCallback(async (cmd: string) => {
    const term = termRef.current
    if (!term) return

    const trimmed = cmd.trim()
    if (!trimmed) return

    // Add to history
    setCmdHistory(prev => [...prev, trimmed])
    setHistoryIdx(-1)

    // Show the command in terminal
    term.writeln('\x1b[36m> \x1b[0m' + trimmed)

    // Handle built-in commands
    const shouldRefresh = await handleBuiltinCommand(term, trimmed)

    if (shouldRefresh) {
      triggerAppRefresh()
    }
  }, [triggerAppRefresh])

  const handleBuiltinCommand = async (term: any, cmd: string): Promise<boolean> => {
    let shouldRefresh = false

    if (cmd === '/help') {
      term.writeln('')
      term.writeln('\x1b[1;33m  可用命令\x1b[0m')
      term.writeln('')
      term.writeln('  \x1b[36m/subjects\x1b[0m      列出所有学科')
      term.writeln('  \x1b[36m/materials [id]\x1b[0m 列出资料')
      term.writeln('  \x1b[36m/read [id]\x1b[0m      读取资料')
      term.writeln('  \x1b[36m/search [query]\x1b[0m 搜索资料')
      term.writeln('  \x1b[36m/wrong [id]\x1b[0m     列出错题')
      term.writeln('  \x1b[36m/history [id]\x1b[0m   练习记录')
      term.writeln('  \x1b[36m/export [type]\x1b[0m  导出数据')
      term.writeln('  \x1b[36m/context\x1b[0m        应用上下文')
      term.writeln('  \x1b[36m/clear\x1b[0m         清屏')
      term.writeln('  \x1b[36m/help\x1b[0m          此帮助')
      term.writeln('')
    } else if (cmd === '/clear') {
      term.clear()
    } else if (cmd === '/context') {
      const ctx = await window.electron?.terminal?.getContext()
      if (ctx) {
        term.writeln('')
        term.writeln('\x1b[1;33m  应用上下文\x1b[0m')
        term.writeln('  \x1b[36m应用:\x1b[0m ' + ctx.appName)
        term.writeln('  \x1b[36m版本:\x1b[0m ' + ctx.version)
        term.writeln('  \x1b[36m材料:\x1b[0m ' + ctx.uploadsPath)
        term.writeln('')
      }
    } else if (cmd === '/subjects') {
      const subjects = await window.electron?.terminal?.listSubjects()
      term.writeln('')
      term.writeln('\x1b[1;33m  学科列表\x1b[0m')
      if (subjects && subjects.length > 0) {
        subjects.forEach((s: any) => {
          term.writeln('  \x1b[36m' + s.id + '\x1b[0m - ' + s.name + ' (' + (s.year || '未设置') + ')')
        })
      } else {
        term.writeln('  \x1b[90m暂无学科\x1b[0m')
      }
      term.writeln('')
    } else if (cmd.startsWith('/materials')) {
      const parts = cmd.split(/\s+/)
      const subjectId = parts[1]
      const materials = await window.electron?.terminal?.listMaterials(subjectId)
      term.writeln('')
      term.writeln('\x1b[1;33m  资料列表\x1b[0m')
      if (materials && materials.length > 0) {
        materials.slice(0, 20).forEach((m: any) => {
          term.writeln('  \x1b[36m' + m.id + '\x1b[0m - ' + m.name)
        })
        if (materials.length > 20) term.writeln('  \x1b[90m... 还有 ' + (materials.length - 20) + ' 份\x1b[0m')
      } else {
        term.writeln('  \x1b[90m暂无资料\x1b[0m')
      }
      term.writeln('')
    } else if (cmd.startsWith('/read ') || cmd.startsWith('/cat ')) {
      const id = cmd.split(/\s+/)[1]
      if (id) {
        const material = await window.electron?.terminal?.readMaterial(id)
        term.writeln('')
        term.writeln('\x1b[1;33m  资料内容\x1b[0m')
        if (material) {
          term.writeln('  \x1b[36m' + material.name + '\x1b[0m')
          term.writeln('')
          const lines = material.content.substring(0, 3000).split('\n')
          lines.forEach((line: string) => term.writeln('  ' + line))
          if (material.content.length > 3000) term.writeln('  \x1b[90m... 已截断\x1b[0m')
        } else {
          term.writeln('  \x1b[90m未找到\x1b[0m')
        }
        term.writeln('')
      }
    } else if (cmd.startsWith('/search ')) {
      const query = cmd.substring(8)
      const results = await window.electron?.terminal?.search(query)
      term.writeln('')
      term.writeln('\x1b[1;33m  搜索结果\x1b[0m')
      if (results && results.length > 0) {
        results.forEach((r: any) => {
          term.writeln('  \x1b[36m' + r.source + '\x1b[0m - ' + (r.title || r.query))
          if (r.url) term.writeln('    \x1b[90m' + r.url + '\x1b[0m')
        })
      } else {
        term.writeln('  \x1b[90m未找到\x1b[0m')
      }
      term.writeln('')
    } else if (cmd.startsWith('/wrong')) {
      const parts = cmd.split(/\s+/)
      const wrong = await window.electron?.terminal?.getWrongQuestions(parts[1])
      term.writeln('')
      term.writeln('\x1b[1;33m  错题本\x1b[0m')
      if (wrong && wrong.length > 0) {
        wrong.slice(0, 20).forEach((w: any) => {
          term.writeln('  \x1b[36m' + w.id + '\x1b[0m - ' + (w.question || '').substring(0, 50))
        })
      } else {
        term.writeln('  \x1b[90m暂无错题\x1b[0m')
      }
      term.writeln('')
    } else if (cmd.startsWith('/history')) {
      const parts = cmd.split(/\s+/)
      const history = await window.electron?.terminal?.getQuizHistory(parts[1])
      term.writeln('')
      term.writeln('\x1b[1;33m  练习记录\x1b[0m')
      if (history && history.length > 0) {
        history.slice(0, 20).forEach((h: any) => {
          const acc = h.total > 0 ? Math.round((h.correct / h.total) * 100) : 0
          term.writeln('  \x1b[36m' + h.id + '\x1b[0m - ' + h.total + '题 正确率' + acc + '%')
        })
      } else {
        term.writeln('  \x1b[90m暂无记录\x1b[0m')
      }
      term.writeln('')
    } else if (cmd.startsWith('/export')) {
      const parts = cmd.split(/\s+/)
      const type = parts[1] || 'all'
      const data = await window.electron?.terminal?.exportData(type)
      term.writeln('')
      term.writeln('\x1b[1;33m  导出数据\x1b[0m')
      term.writeln('  ' + JSON.stringify(data, null, 2).substring(0, 2000))
      term.writeln('')
    } else {
      // Pass to shell
      window.electron?.terminal?.write(cmd + '\r')
      return false
    }

    return true
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand(inputValue)
      setInputValue('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (cmdHistory.length > 0) {
        const newIdx = historyIdx < cmdHistory.length - 1 ? historyIdx + 1 : historyIdx
        setHistoryIdx(newIdx)
        setInputValue(cmdHistory[cmdHistory.length - 1 - newIdx] || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1
        setHistoryIdx(newIdx)
        setInputValue(cmdHistory[cmdHistory.length - 1 - newIdx] || '')
      } else {
        setHistoryIdx(-1)
        setInputValue('')
      }
    }
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d1117] p-6">
        <div className="text-center">
          <div className="text-red-400 text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-200 mb-2">启动失败</h3>
          <p className="text-sm text-gray-400 mb-4">{errorMsg}</p>
          <Button onClick={handleReset} size="small">重试</Button>
        </div>
      </div>
    )
  }

  if (!termStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d1117] p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 mb-4">
              <CodeOutlined className="text-3xl text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-100 mb-1">启动终端</h2>
            <p className="text-sm text-gray-400">选择一个 AI 编程工具开始</p>
            {contextLoaded && <p className="text-xs text-green-400 mt-2">✓ 上下文已加载</p>}
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-8">
              <Spin size="large" />
              <p className="text-sm text-gray-400 mt-4">检测可用工具中...</p>
            </div>
          ) : (
            <>
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
                    {selectedCli === option.value && <div className="w-2 h-2 rounded-full bg-blue-400" />}
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
      {/* Terminal display area */}
      <div
        ref={termContainerRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{ backgroundColor: '#0d1117' }}
      />

      {/* Input area */}
      <div
        className="flex-shrink-0 border-t"
        style={{
          backgroundColor: '#161b22',
          borderColor: '#30363d',
        }}
      >
        <div className="flex items-end gap-2 p-2">
          <span className="text-blue-400 text-sm font-mono pb-2 select-none">&gt;</span>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令... (Enter 发送, Shift+Enter 换行)"
            rows={3}
            className="flex-1 bg-transparent text-gray-200 text-sm font-mono resize-none outline-none placeholder-gray-600"
            style={{
              minHeight: '60px',
              maxHeight: '120px',
              lineHeight: '1.5',
              caretColor: '#58a6ff',
            }}
            autoFocus
          />
          <button
            onClick={() => { executeCommand(inputValue); setInputValue('') }}
            disabled={!inputValue.trim()}
            className="p-2 rounded-lg transition-colors mb-0.5"
            style={{
              color: inputValue.trim() ? '#58a6ff' : '#484f58',
            }}
          >
            <SendOutlined />
          </button>
        </div>
        <div className="px-3 pb-1.5 flex items-center gap-4 text-[10px] text-gray-600">
          <span>Enter 发送</span>
          <span>Shift+Enter 换行</span>
          <span>/help 帮助</span>
          <span>/clear 清屏</span>
        </div>
      </div>
    </div>
  )
}

export default TerminalPanel
