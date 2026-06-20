import * as fs from 'fs'
import * as path from 'path'

const LOG_PATH = path.join(process.cwd(), 'search-debug.log')
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(LOG_PATH, line)
}

const ENDPOINT = 'https://api.anysearch.com/mcp'

// Load API key from .env
function loadApiKey(): string | null {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'electron', '.env'),
  ]
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.replace(/#.*$/, '').trim()
        if (!trimmed || !trimmed.includes('=')) continue
        const idx = trimmed.indexOf('=')
        const key = trimmed.substring(0, idx).trim()
        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '')
        if (key === 'ANYSEARCH_API_KEY' && val) return val
      }
    }
  }
  return process.env.ANYSEARCH_API_KEY || null
}

interface AnySearchResult {
  title: string
  url: string
  snippet: string
}

// JSON-RPC 2.0 call to AnySearch API
async function callApi(toolName: string, args: Record<string, any>): Promise<string> {
  const apiKey = loadApiKey()
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  } as any)

  if (!res.ok) {
    throw new Error(`AnySearch HTTP ${res.status}`)
  }

  const json = await res.json() as any
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error))
  }

  const content = json.result?.content
  if (Array.isArray(content)) {
    const textItem = content.find((c: any) => c.type === 'text')
    if (textItem) return textItem.text
  }
  return JSON.stringify(json.result || json)
}

// Search via AnySearch API
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

const DOMAIN_MAP: Record<string, string> = {
  'anysearch-academic': 'academic',
  'anysearch-code': 'code',
  'anysearch-tech': 'tech',
  'anysearch-education': 'education',
}

export async function searchAnySearch(keyword: string, domain?: string): Promise<SearchResult[]> {
  try {
    log(`[AnySearch] Searching: "${keyword}" domain=${domain || 'auto'}`)

    const args: Record<string, any> = {
      query: keyword,
      max_results: 15,
      zone: 'cn',
    }
    if (domain) {
      args.domain = domain
    } else {
      // Auto-detect domain from keyword
      args.content_types = ['web', 'academic', 'code', 'doc']
    }

    const raw = await callApi('search', args)
    log(`[AnySearch] Raw response length: ${raw.length}`)

    // AnySearch returns Markdown format:
    // ## Search Results (N results, Xms)
    // ### 1. Title
    // - **URL**: https://...
    // - snippet...
    const items: AnySearchResult[] = []

    // Split by "### N." headings
    const sections = raw.split(/###\s+\d+\.\s+/)
    for (const section of sections.slice(1)) { // skip header
      const lines = section.trim().split('\n')
      const title = lines[0]?.trim() || ''

      // Extract URL from "- **URL**: ..." line
      let url = ''
      let snippet = ''
      for (const line of lines.slice(1)) {
        const urlMatch = line.match(/\*\*URL\*\*:\s*(https?:\/\/\S+)/)
        if (urlMatch) {
          url = urlMatch[1]
        } else if (line.startsWith('- ') && !line.startsWith('- **URL**')) {
          snippet = line.substring(2).trim()
        }
      }

      if (title && url) {
        items.push({ title, url, snippet })
      }
    }

    log(`[AnySearch] Parsed ${items.length} results`)

    return items.map((item, i) => ({
      id: `anysearch_${Date.now()}_${i}`,
      title: (item.title || '').substring(0, 120),
      source: 'AnySearch',
      sourceId: domain ? DOMAIN_MAP[domain] || 'anysearch' : 'anysearch',
      url: item.url || '',
      type: 'web',
      summary: (item.snippet || '').substring(0, 200),
      score: Math.round((0.85 - i * 0.03) * 100) / 100,
    })).filter(r => r.title.length > 3 && r.url)
  } catch (err) {
    log(`[AnySearch] Error: ${(err as Error).message}`)
    return []
  }
}

// Extract content from a URL via AnySearch API
export async function extractWithAnySearch(url: string): Promise<string> {
  try {
    log(`[AnySearch] Extracting: ${url}`)
    const raw = await callApi('extract', { url })
    log(`[AnySearch] Extract response length: ${raw.length}`)
    return raw
  } catch (err) {
    log(`[AnySearch] Extract error: ${(err as Error).message}`)
    throw err
  }
}

// List available domains
export async function listAnySearchDomains(): Promise<string> {
  return callApi('list_domains', {})
}
