import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'

interface BaiduOcrConfig {
  apiKey: string
  secretKey: string
}

let cachedToken: string | null = null
let tokenExpiry = 0

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'baidu_ocr.json')
}

export function loadBaiduOcrConfig(): BaiduOcrConfig | null {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveBaiduOcrConfig(config: BaiduOcrConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function isBaiduOcrConfigured(): boolean {
  const config = loadBaiduOcrConfig()
  return !!(config?.apiKey && config?.secretKey)
}

async function getAccessToken(): Promise<string> {
  const config = loadBaiduOcrConfig()
  if (!config) throw new Error('百度 OCR 未配置，请在设置中填写 API Key')

  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const postData = `grant_type=client_credentials&client_id=${config.apiKey}&client_secret=${config.secretKey}`

  const result = await new Promise<any>((resolve, reject) => {
    const req = https.request('https://aip.baidubce.com/oauth/2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Token 请求失败: HTTP ${res.statusCode}`))
          return
        }
        try { resolve(JSON.parse(data)) } catch { reject(new Error('Failed to parse token response')) }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })

  if (!result.access_token) {
    throw new Error(`获取 Token 失败: ${result.error_description || '未知错误'}`)
  }

  cachedToken = result.access_token
  tokenExpiry = Date.now() + (result.expires_in - 60) * 1000
  return cachedToken!
}

export async function recognizeWithBaiduOcr(imageBuffer: Buffer): Promise<string> {
  const token = await getAccessToken()
  const base64 = imageBuffer.toString('base64')

  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`

  const postData = `image=${encodeURIComponent(base64)}`

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.error_code) {
            reject(new Error(`百度 OCR 错误 ${result.error_code}: ${result.error_msg}`))
            return
          }
          const lines = (result.words_result || []).map((item: any) => item.words)
          resolve(lines.join('\n'))
        } catch {
          reject(new Error('解析百度 OCR 结果失败'))
        }
      })
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}
