import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerAIHandlers } from './ipc/aiHandlers'
import { registerSearchHandlers } from './ipc/searchHandlers'
import { registerDBHandlers } from './ipc/dbHandlers'
import { registerWikiHandlers } from './ipc/wikiHandlers'
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
    icon: path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../public' : '../dist', 'icon.png'),
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

app.whenReady().then(async () => {
  await migrateIfNeeded()
  await registerAIHandlers()
  registerSearchHandlers()
  await registerDBHandlers()
  registerWikiHandlers()
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
    await fs.promises.access(filePath)
    return await fs.promises.readFile(filePath)
  } catch {
    return null
  }
})

// Read file as base64 data URL (for images in Electron)
ipcMain.handle('file:readAsBase64', async (_event, filePath: string) => {
  try {
    await fs.promises.access(filePath)
    const buffer = await fs.promises.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const base64 = buffer.toString('base64')
    return `data:${mime};base64,${base64}`
  } catch {
    return null
  }
})

ipcMain.handle('file:saveUpload', async (_event, fileName: string, buffer: number[]) => {
  try {
    const dataDir = path.join(app.getPath('userData'), 'uploads')
    await fs.promises.mkdir(dataDir, { recursive: true })
    const filePath = path.join(dataDir, `${Date.now()}_${fileName}`)
    await fs.promises.writeFile(filePath, Buffer.from(buffer))
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
      await fs.promises.writeFile(result.filePath, buffer)
    } catch (err) {
      console.error('DOCX conversion error:', err)
      await fs.promises.writeFile(result.filePath, content, 'utf-8')
    }
  } else {
    await fs.promises.writeFile(result.filePath, content, 'utf-8')
  }
  return { path: result.filePath }
})

// Shell: 打开外部链接
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url)
})

// DOCX 格式化预览
ipcMain.handle('file:readDocxFormatted', async (_event, buffer: number[]) => {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) })
    return result.value
  } catch (err) {
    console.error('DOCX formatted parse error:', err)
    return ''
  }
})

// 导出 PDF
ipcMain.handle('file:exportPdf', async (_event, content: string, defaultName: string) => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win!, {
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) return { cancelled: true }

  try {
    const { marked } = await import('marked')
    const html = marked.parse(content) as string

    const pdfWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 1100,
      webPreferences: { offscreen: true },
    })

    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.8; color: #333; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 24px; }
  h3 { font-size: 16px; }
  code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
</style></head><body>${html}</body></html>`

    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.6,
        bottom: 0.6,
        left: 0.6,
        right: 0.6,
      },
    })
    await fs.promises.writeFile(result.filePath, pdfBuffer)
    pdfWin.close()
    return { path: result.filePath }
  } catch (err) {
    console.error('PDF export error:', err)
    return { error: String(err) }
  }
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
