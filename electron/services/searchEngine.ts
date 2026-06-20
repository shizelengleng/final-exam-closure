import * as cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'
import { search as ddgSearch, SafeSearchType } from 'duck-duck-scrape'
import { searchBingWithBrowser, searchBaiduWithBrowser, fetchPageWithBrowser } from './browserSearch'
import { searchAcademic } from './academicSearch'
import { searchAnySearch, extractWithAnySearch } from './anysearch'

const LOG_PATH = path.join(process.cwd(), 'search-debug.log')
function searchLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(LOG_PATH, line)
  console.log(msg)
}

// URL normalization: strip tracking params, normalize domain for dedup
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Remove common tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'ref', 'source', 'from', 'share_source', 'share_medium', 'fbclid', 'gclid']
    for (const p of trackingParams) u.searchParams.delete(p)
    // Normalize host
    u.hostname = u.hostname.replace(/^www\./, '')
    // Remove trailing slash and fragment
    let normalized = u.pathname.replace(/\/$/, '') + u.search
    if (normalized === '/') normalized = ''
    return `${u.hostname}${normalized}`.toLowerCase()
  } catch {
    return url.replace(/\/$/, '').replace(/[#?].*$/, '').toLowerCase()
  }
}

// Source authority weights for scoring (higher = more authoritative)
const SOURCE_AUTHORITY: Record<string, number> = {
  'semantic-scholar': 0.95,
  'arxiv': 0.9,
  'crossref': 0.88,
  'dblp': 0.87,
  'openalex': 0.86,
  'anysearch': 0.82,
  'anysearch-academic': 0.84,
  'anysearch-code': 0.78,
  'anysearch-tech': 0.76,
  'anysearch-education': 0.8,
  'bing': 0.8,
  'baidu': 0.78,
  'ddg': 0.75,
  'baidu-xueshu': 0.7,
  'zhihu': 0.6,
  'csdn': 0.5,
  'bilibili': 0.5,
  'github': 0.65,
  'baidu-wenku': 0.5,
  'doc88': 0.45,
  'douding': 0.45,
  'z-library': 0.7,
  'sci-hub': 0.7,
  'xmsoushu': 0.4,
  'pansou': 0.35,
  'qiaomi': 0.35,
  'xuetutu': 0.4,
  'chaoxing': 0.5,
  'nicefread': 0.4,
  'qiushu': 0.4,
  'mooc': 0.55,
}

export interface SearchSource {
  id: string
  name: string
  type: string
  searchUrl: string
  enabled: boolean
  priority: number
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

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  courseware: '课件',
  qa: '问答',
  video: '视频',
  academic: '学术',
  ebook: '电子书',
  'pan-search': '网盘',
  code: '代码',
  tech: '技术',
}

// DuckDuckGo search as fallback — API first, HTML scraping as backup
async function searchDDG(keyword: string, limit = 10): Promise<SearchResult[]> {
  // Try the duck-duck-scrape library first
  try {
    searchLog(`[DDG] Searching: "${keyword}"`)
    const searchResults = await ddgSearch(keyword, {
      safeSearch: SafeSearchType.OFF,
    })

    const results: SearchResult[] = []
    const items = (searchResults as any).results || searchResults || []
    searchLog(`[DDG] API results: ${items.length}`)

    for (const item of items.slice(0, limit)) {
      if (item.url && item.title) {
        results.push({
          id: `ddg_${Date.now()}_${results.length}`,
          title: item.title || '',
          source: 'DuckDuckGo',
          sourceId: 'ddg',
          url: item.url,
          type: 'web',
          summary: item.description || '',
          score: Math.round((0.8 - results.length * 0.03) * 100) / 100,
        })
      }
    }

    if (results.length > 0) {
      searchLog(`[DDG] Found ${results.length} results`)
      return results
    }
  } catch (err) {
    searchLog(`[DDG] API failed: ${(err as Error).message}, trying HTML fallback`)
  }

  // Fallback: scrape DuckDuckGo HTML directly
  try {
    let win: any = null
    try {
      const { BrowserWindow } = require('electron') as typeof import('electron')
      win = new BrowserWindow({
        show: false, width: 1280, height: 800,
        webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true, webSecurity: false },
      })
      win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
      win.webContents.on('certificate-error', (event: any) => { event.preventDefault() })

      const url = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}&ia=web`
      try {
        await Promise.race([
          win.loadURL(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
        ])
      } catch {
        searchLog(`[DDG HTML] Load failed`)
        return []
      }
      await new Promise(resolve => setTimeout(resolve, 3000))

      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
      const $ = cheerio.load(html)
      const results: SearchResult[] = []

      // DuckDuckGo HTML result selectors
      $('[data-testid="result"],.result,.results_links,.web-result').each((_, el) => {
        if (results.length >= limit) return false
        const $el = $(el)
        const titleEl = $el.find('a[data-testid="result-title-a"], h2 a, .result__a, .result__title a').first()
        const title = titleEl.text().trim()
        const href = titleEl.attr('href') || ''
        const summary = $el.find('[data-result="snippet"],.result__snippet,.result__body').first().text().trim()

        if (title && href && href.startsWith('http')) {
          results.push({
            id: `ddg_${Date.now()}_${results.length}`,
            title: title.substring(0, 120),
            source: 'DuckDuckGo',
            sourceId: 'ddg',
            url: href,
            type: 'web',
            summary: summary || '',
            score: Math.round((0.75 - results.length * 0.03) * 100) / 100,
          })
        }
      })

      searchLog(`[DDG HTML] Found ${results.length} results`)
      return results
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
    }
  } catch (err) {
    searchLog(`[DDG HTML] Error: ${(err as Error).message}`)
    return []
  }
}

// Search a specific source site using BrowserWindow
async function searchSourceSite(source: SearchSource, keyword: string): Promise<SearchResult[]> {
  let win: any = null
  try {
    const { BrowserWindow } = require('electron') as typeof import('electron')
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        offscreen: true,
        nodeIntegration: false,
        contextIsolation: true,
        // Ignore SSL errors for sites with invalid certs
        webSecurity: false,
      },
    })

    // Ignore certificate errors for this window
    win.webContents.on('certificate-error', (event: any) => {
      event.preventDefault()
    })

    // Spoof User-Agent to bypass anti-bot detection
    win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

    const searchUrl = `${source.searchUrl}${encodeURIComponent(keyword)}`
    searchLog(`[${source.name}] Loading: ${searchUrl}`)

    // Load with timeout handling
    let loadFailed = false
    try {
      await Promise.race([
        win.loadURL(searchUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('load timeout')), 12000)),
      ])
    } catch (e) {
      searchLog(`[${source.name}] Load failed: ${(e as Error).message}`)
      loadFailed = true
    }

    // Wait for JS rendering (longer for SPA sites)
    const waitTime = ['xmsoushu', 'imooc', 'chaoxing'].includes(source.id) ? 7000 : 4000
    await new Promise(resolve => setTimeout(resolve, loadFailed ? 0 : waitTime))

    if (loadFailed) return []

    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
    searchLog(`[${source.name}] HTML length: ${html.length}`)
    const $ = cheerio.load(html)
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 300)
    searchLog(`[${source.name}] Body preview: ${bodyText}`)
    const results: SearchResult[] = []

    // Check for anti-bot pages, 404, or "no results" pages
    const pageTitle = $('title').text().toLowerCase()
    const bodyLower = bodyText.toLowerCase()
    if (pageTitle.includes('安全验证') || pageTitle.includes('captcha') || pageTitle.includes('verify')
      || bodyLower.includes('404 not found') || bodyLower.includes('page not found')
      || bodyLower.includes('页面不存在') || bodyLower.includes('页面找不到')
      || bodyLower.includes('未搜索到') || bodyLower.includes('没有找到')
      || bodyLower.includes('访问的页面') || bodyLower.includes('网络不给力')) {
      searchLog(`[${source.name}] Skipping: anti-bot/404/no-results page`)
      return []
    }

    // Site-specific selectors for better extraction
    const siteSelectors: Record<string, string[]> = {
      'baidu-wenku': ['.search-result-list .search-result-item', '.doc-list .doc-item', '.result-item', '.card-item'],
      'zhihu': ['.SearchResult-Card', '.List-item .ContentItem', '.css-1g0fqss', '[data-za-extra-module]'],
      'bilibili': ['.video-list-item', '.bili-video-card', '.search-result-card', '.video.i_wrapper'],
      'baidu-xueshu': ['.sc_default_result', '.sc_info', '.c-table-list-item', '.result-item'],
      'doc88': ['.doc-item', '.search-result-item', '.list-item'],
      'douding': ['.search_list_item', '.doc-item', '.result-item'],
      'csdn': ['.search-list-con .blog-list-box', '.article-item-box', '.content-article'],
      'github': ['.Box-row', '.repo-list-item', '.code-list-item'],
      'z-library': ['.bookRow', '.result-item', '.n-book-item', 'a[href*="/book/"]'],
      'sci-hub': ['.result', '.paper', '.article', 'iframe'],
      'xmsoushu': ['a[href*="book"]', 'a[href*="detail"]', 'a[href*="read"]'],
    }

    const selectors = siteSelectors[source.id] || [
      '[class*="result"] a', '[class*="search"] a', '[class*="list"] a',
      '.result-item', '.search-item', '.list-item', '.item',
    ]

    // First try site-specific selectors
    for (const selector of (siteSelectors[source.id] || selectors)) {
      const matchCount = $(selector).length
      if (matchCount > 0) searchLog(`[${source.name}] Selector "${selector}" matched ${matchCount}`)
      $(selector).each((_, el) => {
        if (results.length >= 10) return false

        const $el = $(el)
        const titleEl = $el.find('a').first().length ? $el.find('a').first() : $el.closest('a').length ? $el.closest('a') : $el
        let title = titleEl.text().trim().replace(/\s+/g, ' ')
        let href = titleEl.attr('href') || $el.find('a').first().attr('href') || ''

        if (!href) {
          const parent = $el.parent()
          href = parent.find('a').first().attr('href') || ''
          if (!title) title = parent.find('a').first().text().trim()
        }

        const summary = $el.find('.desc, .summary, .info, p, .content, .abstract, [class*="desc"], [class*="summary"]').first().text().trim()

        if (title.length > 3 && title.length < 300 && href) {
          let fullUrl = href
          try {
            if (!href.startsWith('http')) {
              fullUrl = new URL(href, searchUrl).toString()
            }
          } catch {
            fullUrl = href
          }
          results.push({
            id: `${source.id}_${Date.now()}_${results.length}`,
            title: title.substring(0, 120),
            source: source.name,
            sourceId: source.id,
            url: fullUrl,
            type: source.type,
            summary: summary.substring(0, 200) || `${source.name} 上关于「${keyword}」的资料`,
            score: Math.round((0.75 - results.length * 0.04) * 100) / 100,
          })
        }
      })
      if (results.length > 0) break
    }

    // Fallback: grab links that look like content pages
    if (results.length === 0) {
      searchLog(`[${source.name}] No selector results, trying link fallback`)
      const skipPatterns = ['login', 'signup', 'register', 'about', 'contact', 'privacy', 'terms', 'faq', 'help', 'javascript:', '#', 'feedback', 'error']
      const skipTexts = ['登录', '注册', '首页', '关于我们', '联系方式', '隐私', '条款', '更多', '下载', '扫码', '反馈', '举报']
      $('a[href]').each((_, el) => {
        if (results.length >= 8) return false
        const $a = $(el)
        const href = $a.attr('href') || ''
        const text = $a.text().trim().replace(/\s+/g, ' ')
        // Text must be substantive (not just a few chars) and URL must be a content page
        if (text.length > 8 && text.length < 200 && href.startsWith('http')
          && !href.includes('javascript:')
          && !skipPatterns.some(p => href.toLowerCase().includes(p))
          && !skipTexts.some(t => text === t || text.startsWith(t))) {
          results.push({
            id: `${source.id}_${Date.now()}_${results.length}`,
            title: text.substring(0, 120),
            source: source.name,
            sourceId: source.id,
            url: href,
            type: source.type,
            summary: `${source.name} 上关于「${keyword}」的资料`,
            score: Math.round((0.6 - results.length * 0.05) * 100) / 100,
          })
        }
      })
    }

    searchLog(`[${source.name}] Found ${results.length} results`)
    return results
  } catch (err) {
    console.error(`[Search:${source.name}] Failed:`, err)
    return []
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
  }
}

// Academic API source IDs — these use API calls, not BrowserWindow scraping
const ACADEMIC_API_IDS = new Set(['semantic-scholar', 'arxiv', 'crossref', 'dblp', 'openalex'])

// AnySearch domain-specific source IDs
const ANYSEARCH_DOMAIN_IDS: Record<string, string> = {
  'anysearch-academic': 'academic',
  'anysearch-code': 'code',
  'anysearch-education': 'education',
  'anysearch-tech': 'tech',
}

export interface SearchResultGroup {
  sourceId: string
  sourceName: string
  type: string
  results: SearchResult[]
}

export class SearchEngine {
  private sources: SearchSource[] = []
  private allSources: SearchSource[] = []

  constructor(sources: SearchSource[]) {
    this.allSources = sources
    this.sources = sources.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority)
  }

  reload(sources: SearchSource[]) {
    this.allSources = sources
    this.sources = sources.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority)
  }

  getAllSources(): SearchSource[] {
    return this.allSources
  }

  async search(keyword: string, sourceIds?: string[]): Promise<SearchResult[]> {
    const allResults: SearchResult[] = []
    searchLog(`=== Search started: "${keyword}" ===`)
    const searchStartTime = Date.now()
    const SEARCH_DEADLINE_MS = 45000 // Overall 45s deadline

    const targetSources = sourceIds
      ? this.sources.filter((s) => sourceIds.includes(s.id))
      : this.sources

    // Separate API sources from site-scrape sources
    const apiSources = targetSources.filter(s => ACADEMIC_API_IDS.has(s.id))
    const anysearchDomainSources = targetSources.filter(s => s.id in ANYSEARCH_DOMAIN_IDS)
    const scrapeSources = targetSources.filter(s =>
      !ACADEMIC_API_IDS.has(s.id) && !(s.id in ANYSEARCH_DOMAIN_IDS) && s.searchUrl
    )

    searchLog(`API sources: ${apiSources.map(s => s.id).join(', ') || 'none'}`)
    searchLog(`AnySearch domains: ${anysearchDomainSources.map(s => s.id).join(', ') || 'none'}`)
    searchLog(`Scrape sources: ${scrapeSources.map(s => s.id).join(', ')}`)

    // Run ALL searches in parallel with Promise.allSettled for graceful degradation
    const labeled: { label: string; sourceId: string; promise: Promise<SearchResult[]> }[] = []

    // Academic API sources — only search the ones the user selected
    if (apiSources.length > 0) {
      const academicIds = apiSources.map(s => s.id)
      labeled.push({ label: 'academic', sourceId: 'academic', promise: searchAcademic(keyword, academicIds) })
    }

    // Built-in browser searches
    labeled.push({ label: 'bing', sourceId: 'bing', promise: searchBingWithBrowser(keyword) })
    labeled.push({ label: 'baidu', sourceId: 'baidu', promise: searchBaiduWithBrowser(keyword) })
    labeled.push({ label: 'ddg', sourceId: 'ddg', promise: searchDDG(keyword) })

    // AnySearch API — structured search with vertical domains (academic/code/tech/education)
    labeled.push({ label: 'anysearch', sourceId: 'anysearch', promise: searchAnySearch(keyword) })

    // AnySearch domain-specific searches
    for (const source of anysearchDomainSources) {
      const domain = ANYSEARCH_DOMAIN_IDS[source.id]
      labeled.push({
        label: source.id,
        sourceId: source.id,
        promise: searchAnySearch(keyword, domain).catch(() => []),
      })
    }

    // Every enabled site source — BrowserWindow scraping, all in parallel
    for (const source of scrapeSources) {
      labeled.push({ label: source.id, sourceId: source.id, promise: searchSourceSite(source, keyword).catch(() => []) })
    }

    searchLog(`Total searches: ${labeled.length}`)

    // Use Promise.allSettled — partial results are better than total failure
    const settled = await Promise.allSettled(labeled.map(l =>
      Promise.race([
        l.promise,
        new Promise<SearchResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('deadline')), SEARCH_DEADLINE_MS)
        ),
      ])
    ))

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]
      if (result.status === 'fulfilled') {
        searchLog(`[${labeled[i].label}] returned ${result.value.length} results`)
        allResults.push(...result.value)
      } else {
        searchLog(`[${labeled[i].label}] FAILED: ${result.reason?.message || 'unknown'}`)
      }
    }

    // Phase 1: URL-normalized dedup + track cross-source occurrences
    const urlToResult = new Map<string, SearchResult>()
    const urlSources = new Map<string, Set<string>>() // normalizedUrl → set of sourceIds

    for (const r of allResults) {
      const normalizedUrl = normalizeUrl(r.url || '')
      if (!normalizedUrl) continue

      if (!urlSources.has(normalizedUrl)) {
        urlSources.set(normalizedUrl, new Set())
      }
      urlSources.get(normalizedUrl)!.add(r.sourceId)

      // Keep the result with the longest summary (most info)
      const existing = urlToResult.get(normalizedUrl)
      if (!existing || (r.summary || '').length > (existing.summary || '').length) {
        urlToResult.set(normalizedUrl, r)
      }
    }

    // Phase 2: Title-based dedup
    const seenTitles = new Set<string>()
    const deduped: SearchResult[] = []
    for (const [, result] of urlToResult) {
      const titleKey = result.title.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '').substring(0, 40)
      if (titleKey.length > 10 && seenTitles.has(titleKey)) continue
      if (titleKey.length > 10) seenTitles.add(titleKey)
      deduped.push(result)
    }

    // Phase 3: Multi-signal scoring
    const scored = deduped.map(r => {
      const normalizedUrl = normalizeUrl(r.url || '')
      const crossSourceCount = urlSources.get(normalizedUrl)?.size || 1
      const authority = SOURCE_AUTHORITY[r.sourceId] || 0.5

      // Cross-source boost: results found by multiple engines are more trustworthy
      const crossBoost = Math.min(crossSourceCount * 0.08, 0.25)

      // Combine: base score × authority + cross-source boost
      const finalScore = r.score * authority + crossBoost
      return { ...r, score: Math.round(finalScore * 100) / 100 }
    })

    // Phase 4: Per-source limit to prevent one source dominating
    const perSourceLimit = 12
    const sourceCounts = new Map<string, number>()
    const limited = scored.filter(r => {
      const count = sourceCounts.get(r.sourceId) || 0
      if (count >= perSourceLimit) return false
      sourceCounts.set(r.sourceId, count + 1)
      return true
    })

    const elapsed = ((Date.now() - searchStartTime) / 1000).toFixed(1)
    searchLog(`=== Search done in ${elapsed}s: ${allResults.length} total → ${deduped.length} deduped → ${limited.length} final ===`)
    return limited.sort((a, b) => b.score - a.score)
  }

  // Group results by source for display
  groupBySource(results: SearchResult[]): SearchResultGroup[] {
    const groupMap = new Map<string, SearchResultGroup>()
    const sourceNameMap = new Map<string, string>()

    // Build name lookup from all sources
    for (const s of this.allSources) {
      sourceNameMap.set(s.id, s.name)
    }
    // Also add built-in sources
    sourceNameMap.set('semantic-scholar', 'Semantic Scholar')
    sourceNameMap.set('arxiv', 'arXiv')
    sourceNameMap.set('crossref', 'CrossRef')
    sourceNameMap.set('dblp', 'DBLP')
    sourceNameMap.set('openalex', 'OpenAlex')
    sourceNameMap.set('bing', 'Bing')
    sourceNameMap.set('baidu', '百度')
    sourceNameMap.set('ddg', 'DuckDuckGo')
    sourceNameMap.set('anysearch', 'AnySearch')
    sourceNameMap.set('anysearch-academic', 'AnySearch 学术')
    sourceNameMap.set('anysearch-code', 'AnySearch 代码')
    sourceNameMap.set('anysearch-tech', 'AnySearch 技术')
    sourceNameMap.set('anysearch-education', 'AnySearch 教育')

    for (const r of results) {
      const key = r.sourceId
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          sourceId: key,
          sourceName: sourceNameMap.get(key) || r.source,
          type: r.type,
          results: [],
        })
      }
      groupMap.get(key)!.results.push(r)
    }

    return Array.from(groupMap.values()).sort((a, b) => b.results.length - a.results.length)
  }

  getSources(): SearchSource[] {
    return this.sources
  }

  async fetchPageAsMarkdown(url: string): Promise<string> {
    // Try AnySearch extraction first (structured, reliable)
    try {
      const content = await extractWithAnySearch(url)
      if (content && content.length > 100) return content
    } catch {
      // Fall through to browser scraping
    }
    // Fallback: BrowserWindow scraping
    return fetchPageWithBrowser(url)
  }
}
