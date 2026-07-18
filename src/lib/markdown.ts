import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function renderMarkdown(content: string): { __html: string } {
  try {
    const raw = marked.parse(content, { breaks: true }) as string
    return { __html: DOMPurify.sanitize(raw) }
  } catch {
    return { __html: DOMPurify.sanitize(content) }
  }
}
