import fetch from 'node-fetch'
import * as fs from 'fs'
import * as path from 'path'

const LOG_PATH = path.join(process.cwd(), 'search-debug.log')
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(LOG_PATH, line)
}

export interface AcademicResult {
  id: string
  title: string
  authors: string
  source: string
  sourceId: string
  url: string
  type: string
  summary: string
  year: number | null
  citationCount: number | null
  score: number
}

// Semantic Scholar - 2亿+学术论文，免费100次/5分钟
async function searchSemanticScholar(keyword: string, limit = 10): Promise<AcademicResult[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(keyword)}&limit=${limit}&fields=title,authors,url,abstract,year,citationCount,externalIds`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FinalExamClosure/1.0' },
      signal: AbortSignal.timeout(10000),
    } as any)
    if (!res.ok) return []
    const data = await res.json() as any
    const papers = data.data || []
    return papers.map((p: any, i: number) => ({
      id: `s2_${Date.now()}_${i}`,
      title: p.title || '',
      authors: (p.authors || []).map((a: any) => a.name).join(', '),
      source: 'Semantic Scholar',
      sourceId: 'semantic-scholar',
      url: p.url || p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : '',
      type: 'academic',
      summary: (p.abstract || '').substring(0, 300),
      year: p.year || null,
      citationCount: p.citationCount || null,
      score: Math.round((0.95 - i * 0.03) * 100) / 100,
    }))
  } catch (err) {
    console.error('Semantic Scholar search failed:', err)
    return []
  }
}

// arXiv - 预印本论文，免费无限制
async function searchArxiv(keyword: string, limit = 10): Promise<AcademicResult[]> {
  try {
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keyword)}&start=0&max_results=${limit}&sortBy=relevance`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    } as any)
    if (!res.ok) return []
    const xml = await res.text()

    // Simple XML parsing for arxiv atom feed
    const entries = xml.split('<entry>').slice(1)
    return entries.slice(0, limit).map((entry, i) => {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim() || ''
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, ' ').trim() || ''
      const link = entry.match(/<link[^>]*href="([^"]*)"[^>]*title="pdf"/)?.[1]
        || entry.match(/<id>(.*?)<\/id>/)?.[1]
        || ''
      const authors = [...entry.matchAll(/<author>\s*<name>(.*?)<\/name>/g)].map(m => m[1]).join(', ')
      const published = entry.match(/<published>(.*?)<\/published>/)?.[1] || ''
      const year = published ? parseInt(published.substring(0, 4)) : null

      return {
        id: `arxiv_${Date.now()}_${i}`,
        title,
        authors,
        source: 'arXiv',
        sourceId: 'arxiv',
        url: link.replace('http://', 'https://'),
        type: 'academic',
        summary: summary.substring(0, 300),
        year,
        citationCount: null,
        score: Math.round((0.88 - i * 0.03) * 100) / 100,
      }
    }).filter((r: any) => r.title.length > 5)
  } catch (err) {
    console.error('arXiv search failed:', err)
    return []
  }
}

// CrossRef - 期刊元数据，免费无限制
async function searchCrossRef(keyword: string, limit = 10): Promise<AcademicResult[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(keyword)}&rows=${limit}&sort=relevance&mailto=finalexam@closure.app`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FinalExamClosure/1.0 (mailto:finalexam@closure.app)' },
      signal: AbortSignal.timeout(10000),
    } as any)
    if (!res.ok) return []
    const data = await res.json() as any
    const items = data.message?.items || []
    return items.map((item: any, i: number) => {
      const title = (item.title || []).join(' ')
      const authors = (item.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`).join(', ')
      const doi = item.DOI || ''
      const url = item.link?.[0]?.URL || (doi ? `https://doi.org/${doi}` : '')
      const year = item.published?.['date-parts']?.[0]?.[0] || null
      const summary = (item.abstract || '').replace(/<[^>]*>/g, '').substring(0, 300)

      return {
        id: `cr_${Date.now()}_${i}`,
        title,
        authors,
        source: 'CrossRef',
        sourceId: 'crossref',
        url,
        type: 'academic',
        summary,
        year,
        citationCount: item['is-referenced-by-count'] || null,
        score: Math.round((0.85 - i * 0.03) * 100) / 100,
      }
    }).filter((r: any) => r.title.length > 5)
  } catch (err) {
    console.error('CrossRef search failed:', err)
    return []
  }
}

// DBLP - 计算机科学文献，免费无限制
async function searchDBLP(keyword: string, limit = 10): Promise<AcademicResult[]> {
  try {
    const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(keyword)}&format=json&h=${limit}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    } as any)
    if (!res.ok) return []
    const data = await res.json() as any
    const hits = data.result?.hits?.hit || []
    return hits.map((hit: any, i: number) => {
      const info = hit.info || {}
      const title = (info.title || '').replace(/<\/?[^>]*>/g, '')
      const authors = info.authors?.author
        ? (Array.isArray(info.authors.author) ? info.authors.author : [info.authors.author])
            .map((a: any) => a.text || a).join(', ')
        : ''
      const year = info.year ? parseInt(info.year) : null
      const venue = info.venue || ''
      const url = info.ee || info.url || ''

      return {
        id: `dblp_${Date.now()}_${i}`,
        title,
        authors,
        source: 'DBLP',
        sourceId: 'dblp',
        url: Array.isArray(url) ? url[0] : url,
        type: 'academic',
        summary: venue ? `发表于: ${venue}` : '',
        year,
        citationCount: null,
        score: Math.round((0.82 - i * 0.03) * 100) / 100,
      }
    }).filter((r: any) => r.title.length > 5)
  } catch (err) {
    console.error('DBLP search failed:', err)
    return []
  }
}

// OpenAlex - 2.4亿学术作品，免费无限制
async function searchOpenAlex(keyword: string, limit = 10): Promise<AcademicResult[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(keyword)}&per_page=${limit}&mailto=finalexam@closure.app`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FinalExamClosure/1.0' },
      signal: AbortSignal.timeout(10000),
    } as any)
    if (!res.ok) return []
    const data = await res.json() as any
    const results = data.results || []
    return results.map((work: any, i: number) => {
      const title = work.title || ''
      const authors = (work.authorships || []).map((a: any) => a.author?.display_name || '').filter(Boolean).join(', ')
      const year = work.publication_year || null
      const doi = work.doi || ''
      const url = work.primary_location?.pdf_url || work.primary_location?.landing_page_url || doi || ''
      const summary = (work.abstract_inverted_index
        ? reconstructAbstract(work.abstract_inverted_index)
        : '').substring(0, 300)

      return {
        id: `oa_${Date.now()}_${i}`,
        title,
        authors,
        source: 'OpenAlex',
        sourceId: 'openalex',
        url,
        type: 'academic',
        summary,
        year,
        citationCount: work.cited_by_count || null,
        score: Math.round((0.87 - i * 0.03) * 100) / 100,
      }
    }).filter((r: any) => r.title.length > 5)
  } catch (err) {
    console.error('OpenAlex search failed:', err)
    return []
  }
}

// Reconstruct abstract from OpenAlex inverted index format
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  if (!invertedIndex || typeof invertedIndex !== 'object') return ''
  const words: { word: string; pos: number }[] = []
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push({ word, pos })
    }
  }
  words.sort((a, b) => a.pos - b.pos)
  return words.map(w => w.word).join(' ')
}

// Unified search across all academic APIs
export async function searchAcademic(keyword: string, sources?: string[]): Promise<AcademicResult[]> {
  const allResults: AcademicResult[] = []
  log(`[Academic] Searching: "${keyword}" sources: ${sources?.join(',') || 'all'}`)

  const searchFnMap: Record<string, (kw: string, limit: number) => Promise<AcademicResult[]>> = {
    'semantic-scholar': searchSemanticScholar,
    'arxiv': searchArxiv,
    'crossref': searchCrossRef,
    'dblp': searchDBLP,
    'openalex': searchOpenAlex,
  }

  const targetSources = sources
    ? Object.keys(searchFnMap).filter(s => sources.includes(s))
    : Object.keys(searchFnMap)

  // Run all searches in parallel
  const promises = targetSources.map(s => searchFnMap[s](keyword, 10).catch((e) => {
    log(`[Academic] ${s} failed: ${(e as Error).message}`)
    return [] as AcademicResult[]
  }))
  const results = await Promise.all(promises)
  for (let i = 0; i < results.length; i++) {
    log(`[Academic] ${targetSources[i]} returned ${results[i].length} results`)
    allResults.push(...results[i])
  }

  // Deduplicate by title similarity
  const seen = new Set<string>()
  const unique = allResults.filter(r => {
    const key = r.title.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '').substring(0, 50)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => b.score - a.score)
  log(`[Academic] Total: ${allResults.length} → ${unique.length} unique`)
  return unique
}
