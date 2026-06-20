import { BrowserWindow } from 'electron'
import * as cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'

const LOG_PATH = path.join(process.cwd(), 'search-debug.log')
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(LOG_PATH, line)
}

export interface SearchResult {
  id: string
  title: string
  source: string
  sourceId: string
  url: string
  type: string
  summary: string
  score: number
}

function waitForLoad(win: BrowserWindow, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer)
      // Extra wait for JS-rendered content
      setTimeout(resolve, 1500)
    })
    win.webContents.once('did-fail-load', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function createHiddenWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  })
  // Spoof User-Agent
  win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
  // Ignore SSL errors
  win.webContents.on('certificate-error', (event: any) => {
    event.preventDefault()
  })
  return win
}

export async function searchBingWithBrowser(keyword: string, limit = 15): Promise<SearchResult[]> {
  let win: BrowserWindow | null = null
  try {
    win = await createHiddenWindow()
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(keyword)}&cc=cn&setlang=zh-Hans`
    log(`[Bing] Loading: ${url}`)

    try {
      await Promise.race([
        win.loadURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ])
    } catch (e) {
      log(`[Bing] Load failed: ${(e as Error).message}`)
      return []
    }
    await waitForLoad(win)

    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
    log(`[Bing] HTML length: ${html.length}`)
    const $ = cheerio.load(html)

    // Anti-bot / verification page detection
    const pageTitle = $('title').text().toLowerCase()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 500).toLowerCase()
    if (pageTitle.includes('captcha') || pageTitle.includes('verify') || pageTitle.includes('验证')
      || bodyText.includes('人机验证') || bodyText.includes('请验证') || bodyText.includes('robot')) {
      log(`[Bing] Skipping: verification/captcha page detected`)
      return []
    }

    const results: SearchResult[] = []
    const matchCount = $('li.b_algo').length
    log(`[Bing] li.b_algo matches: ${matchCount}`)

    $('li.b_algo').each((_, el) => {
      if (results.length >= limit) return false

      const $el = $(el)
      const titleEl = $el.find('h2 a')
      const title = titleEl.text().trim()
      const href = titleEl.attr('href') || ''
      const summary = $el.find('.b_caption p, .b_algoSlug, .b_lineclamp2').first().text().trim()

      if (title && href && href.startsWith('http')) {
        results.push({
          id: `bing_${Date.now()}_${results.length}`,
          title: title.substring(0, 100),
          source: 'Bing',
          sourceId: 'bing',
          url: href,
          type: 'web',
          summary: summary || '',
          score: Math.round((0.9 - results.length * 0.03) * 100) / 100,
        })
      }
    })

    log(`[Bing] Found ${results.length} results`)
    return results
  } catch (err) {
    log(`[Bing] Error: ${(err as Error).message}`)
    return []
  } finally {
    if (win) win.destroy()
  }
}

export async function searchBaiduWithBrowser(keyword: string, limit = 15): Promise<SearchResult[]> {
  let win: BrowserWindow | null = null
  try {
    win = await createHiddenWindow()
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`
    log(`[Baidu] Loading: ${url}`)

    try {
      await Promise.race([
        win.loadURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ])
    } catch (e) {
      log(`[Baidu] Load failed: ${(e as Error).message}`)
      return []
    }
    await waitForLoad(win)

    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
    log(`[Baidu] HTML length: ${html.length}`)
    const $ = cheerio.load(html)

    // Anti-bot / verification page detection
    const pageTitle = $('title').text().toLowerCase()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 500).toLowerCase()
    if (pageTitle.includes('安全验证') || pageTitle.includes('captcha') || bodyText.includes('网络不给力')
      || bodyText.includes('人机验证') || bodyText.includes('访问过于频繁')) {
      log(`[Baidu] Skipping: verification/bot-detect page`)
      return []
    }

    const results: SearchResult[] = []

    // Baidu uses multiple selector patterns
    const matchCount = $('[class*="result"], .c-container, .result-op').length
    log(`[Baidu] Result containers: ${matchCount}`)
    $('[class*="result"], .c-container, .result-op').each((_, el) => {
      if (results.length >= limit) return false

      const $el = $(el)
      const titleEl = $el.find('h3 a').first()
      const title = titleEl.text().trim()
      const href = titleEl.attr('href') || ''
      const summary = $el.find('.c-abstract, .content-right_8Zs40, [class*="abstract"]').first().text().trim()

      // Skip ads
      if ($el.hasClass('EC_ppim_97050_c') || $el.find('[class*="ec_tuiguang"]').length) return

      if (title && title.length > 4 && href) {
        results.push({
          id: `baidu_${Date.now()}_${results.length}`,
          title: title.substring(0, 100),
          source: '百度',
          sourceId: 'baidu',
          url: href,
          type: 'web',
          summary: summary || '',
          score: Math.round((0.88 - results.length * 0.03) * 100) / 100,
        })
      }
    })
    log(`[Baidu] Found ${results.length} results`)

    return results
  } catch (err) {
    console.error('Browser Baidu search failed:', err)
    return []
  } finally {
    if (win) win.destroy()
  }
}

export async function fetchPageWithBrowser(url: string): Promise<string> {
  let win: BrowserWindow | null = null
  try {
    win = await createHiddenWindow()
    try {
      await Promise.race([
        win.loadURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ])
    } catch {
      throw new Error('Page load timeout')
    }
    await waitForLoad(win)

    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
    const $ = cheerio.load(html)

    $('script, style, nav, footer, header, aside, iframe, noscript, .ad, .advertisement, .sidebar').remove()

    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled'

    const mainContent = $('article, main, .content, .article, .post, .entry-content, [class*="content"]').first()
    let body = ''

    if (mainContent.length) {
      mainContent.children().each((_, el) => {
        const $el = $(el)
        const tag = el.tagName?.toLowerCase()
        const text = $el.text().replace(/\s+/g, ' ').trim()

        if (!text) return

        if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
          const level = tag[1]
          body += `\n${'#'.repeat(Number(level))} ${text}\n\n`
        } else if (tag === 'p' || tag === 'div' || tag === 'span') {
          body += `${text}\n\n`
        } else if (tag === 'ul' || tag === 'ol') {
          $el.find('li').each((_, li) => {
            body += `- ${$(li).text().trim()}\n`
          })
          body += '\n'
        }
      })
    }

    if (!body.trim()) {
      body = $('body').text().replace(/\s+/g, ' ').trim()
    }

    return `# ${title}\n\n来源: ${url}\n\n${body.slice(0, 50000)}`
  } catch (err) {
    throw new Error(`Failed to fetch page: ${err}`)
  } finally {
    if (win) win.destroy()
  }
}
