import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerAIHandlers } from './ipc/aiHandlers'
import { registerSearchHandlers } from './ipc/searchHandlers'
import { registerDBHandlers } from './ipc/dbHandlers'
import { migrateIfNeeded } from './db/store'
import { registerTerminalGlobalApi } from './terminal/globalApi'
import { writeContextFile } from './terminal/context'

// node-pty lazy loading
let pty: typeof import('node-pty') | null = null
async function loadPty() {
  if (!pty) {
    try {
      pty = await import('node-pty')
    } catch (err) {
      console.error('Failed to load node-pty:', err)
      return null
    }
  }
  return pty
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '期末补完计划',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    titleBarStyle: 'hiddenInset',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  migrateIfNeeded()
  registerAIHandlers()
  registerSearchHandlers()
  registerDBHandlers()
  registerTerminalGlobalApi()
  writeContextFile()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 窗口控制
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())

// 文件内容读取
ipcMain.handle('file:readPdf', async (_event, buffer: number[]) => {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(Buffer.from(buffer))
    return result.text
  } catch (err) {
    console.error('PDF parse error:', err)
    return ''
  }
})

ipcMain.handle('file:readDocx', async (_event, buffer: number[]) => {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return result.value
  } catch (err) {
    console.error('DOCX parse error:', err)
    return ''
  }
})

ipcMain.handle('file:getAsFile', async (_event, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath)
    }
    return null
  } catch (err) {
    console.error('File read error:', err)
    return null
  }
})

ipcMain.handle('file:saveUpload', async (_event, fileName: string, buffer: number[]) => {
  try {
    const dataDir = path.join(app.getPath('userData'), 'uploads')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    const filePath = path.join(dataDir, `${Date.now()}_${fileName}`)
    fs.writeFileSync(filePath, Buffer.from(buffer))
    return { path: filePath }
  } catch (err) {
    console.error('Save upload error:', err)
    return null
  }
})

ipcMain.handle('file:saveFile', async (_event, content: string, defaultName: string) => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win!, {
    defaultPath: defaultName,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return { cancelled: true }

  const ext = path.extname(result.filePath).toLowerCase()
  if (ext === '.docx') {
    try {
      const { convertMdToDocx } = await import('./services/docxConverter')
      const buffer = await convertMdToDocx(content)
      fs.writeFileSync(result.filePath, buffer)
    } catch (err) {
      console.error('DOCX conversion error:', err)
      fs.writeFileSync(result.filePath, content, 'utf-8')
    }
  } else {
    fs.writeFileSync(result.filePath, content, 'utf-8')
  }
  return { path: result.filePath }
})

// Terminal with node-pty
let terminalProcess: import('node-pty').IPty | null = null

// Scan PATH for CLI tools
async function detectCliTools(): Promise<string[]> {
  const pathDirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')
  const cliTools = ['claude', 'codex', 'gemini', 'mimo', 'reasonix', 'aider', 'continue']
  const found: string[] = []

  for (const tool of cliTools) {
    for (const dir of pathDirs) {
      // Check multiple extensions on Windows
      const extensions = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
      for (const ext of extensions) {
        const fullPath = path.join(dir, `${tool}${ext}`)
        if (fs.existsSync(fullPath)) {
          found.push(tool)
          break
        }
      }
      if (found.includes(tool)) break
    }
  }

  return found
}

// Get the materials directory path
function getMaterialsDir(): string {
  const userData = app.getPath('userData')
  const uploadsDir = path.join(userData, 'uploads')
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }
  return uploadsDir
}

ipcMain.handle('terminal:detectCli', async () => {
  return await detectCliTools()
})

ipcMain.on('terminal:create', async (_event, options?: { cli?: string }) => {
  if (terminalProcess) return

  const Pty = await loadPty()
  if (!Pty) {
    mainWindow?.webContents.send('terminal:data', '\x1b[31mFailed to load terminal engine\x1b[0m\r\n')
    return
  }

  const cwd = getMaterialsDir()
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
  const shellArgs = process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : []

  const cli = options?.cli

  console.log('Creating terminal with shell:', shell, 'cwd:', cwd, 'cli:', cli)

  try {
    terminalProcess = Pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    })

    console.log('Terminal process created successfully')

    terminalProcess.onData((data: string) => {
      mainWindow?.webContents.send('terminal:data', data)
    })

    terminalProcess.onExit(() => {
      mainWindow?.webContents.send('terminal:exit')
      terminalProcess = null
    })

    if (cli) {
      setTimeout(() => {
        terminalProcess?.write(`${cli}\r`)
      }, 500)
    }
  } catch (err: any) {
    console.error('Terminal spawn error:', err)
    mainWindow?.webContents.send('terminal:data', `\x1b[31m启动失败: ${err.message}\x1b[0m\r\n`)
  }
})

ipcMain.on('terminal:write', (_event, data: string) => {
  terminalProcess?.write(data)
})

ipcMain.on('terminal:resize', (_event, cols: number, rows: number) => {
  if (terminalProcess) {
    terminalProcess.resize(cols, rows)
  }
})

ipcMain.on('terminal:destroy', () => {
  if (terminalProcess) {
    terminalProcess.kill()
    terminalProcess = null
  }
})
