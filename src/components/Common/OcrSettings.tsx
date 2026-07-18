import { useState, useEffect } from 'react'
import { Input, Button, message, Tag } from 'antd'
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'

const OcrSettings = () => {
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    const config = await window.electron?.ocr.getConfig()
    if (config) {
      setApiKey(config.apiKey)
      setSecretKey(config.secretKey)
      setConfigured(true)
    }
  }

  const handleSave = async () => {
    if (!apiKey.trim() || !secretKey.trim()) {
      message.warning('请填写完整的 API Key 和 Secret Key')
      return
    }
    setLoading(true)
    try {
      await window.electron?.ocr.saveConfig({ apiKey: apiKey.trim(), secretKey: secretKey.trim() })
      setConfigured(true)
      message.success('OCR 配置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="py-4 space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
        <p className="font-medium mb-1">百度 OCR 文字识别</p>
        <p className="text-xs text-blue-600">
          用于扫描版 PDF 的文字识别。免费额度：通用文字识别 50,000 次/月。
        </p>
        <p className="text-xs text-blue-600 mt-1">
          获取 API Key：<a href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index" target="_blank" rel="noreferrer" className="underline">百度智能云控制台</a>
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="请输入百度 OCR API Key"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
          <Input.Password
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="请输入百度 OCR Secret Key"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="primary" onClick={handleSave} loading={loading}>
          保存配置
        </Button>
        {configured ? (
          <Tag icon={<CheckCircleOutlined />} color="success">已配置</Tag>
        ) : (
          <Tag icon={<ExclamationCircleOutlined />} color="warning">未配置</Tag>
        )}
      </div>
    </div>
  )
}

export default OcrSettings
