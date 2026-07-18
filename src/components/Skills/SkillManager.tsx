import { useState, useEffect } from 'react'
import { Table, Switch, Button, Tag, Popconfirm, message, Empty, Tooltip } from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined, AppstoreOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

interface SkillItem {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  source: 'builtin' | 'user'
}

const SkillManager = () => {
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadSkills()
  }, [])

  const loadSkills = async () => {
    setLoading(true)
    try {
      const list = await window.electron?.skill.list()
      if (list) setSkills(list)
    } catch (err) {
      message.error('加载 Skill 列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await window.electron?.skill.toggle(id, enabled)
      setSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled } : s))
      )
      message.success(enabled ? '已启用' : '已禁用')
    } catch {
      message.error('操作失败')
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await window.electron?.skill.remove(id)
      setSkills((prev) => prev.filter((s) => s.id !== id))
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }

  const handleAdd = async () => {
    try {
      const dirPath = await window.electron?.dialog.selectDirectory()
      if (dirPath) {
        const skill = await window.electron?.skill.add(dirPath)
        if (skill) {
          setSkills((prev) => [...prev, skill])
          message.success(`已添加: ${skill.name}`)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '添加失败'
      message.error(errMsg)
    }
  }

  const columns: ColumnsType<SkillItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SkillItem) => (
        <div>
          <span className="font-medium">{name}</span>
          {record.source === 'builtin' && (
            <Tag color="blue" className="ml-2">内置</Tag>
          )}
        </div>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => (
        <Tooltip title={desc}>
          <span className="text-gray-500">{desc || '无描述'}</span>
        </Tooltip>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '状态',
      key: 'enabled',
      width: 80,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.enabled}
          onChange={(checked) => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="确定删除此 Skill？"
          description="删除后不可恢复"
          onConfirm={() => handleRemove(record.id)}
          okText="删除"
          okType="danger"
          cancelText="取消"
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AppstoreOutlined className="text-lg text-gray-600" />
          <span className="text-base font-medium">Skill 插件管理</span>
          <Tag>{skills.length} 个</Tag>
        </div>
        <div className="flex gap-2">
          <Button size="small" icon={<ReloadOutlined />} onClick={loadSkills}>
            刷新
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加 Skill
          </Button>
        </div>
      </div>

      {skills.length === 0 && !loading ? (
        <Empty description="暂无已安装的 Skill" />
      ) : (
        <Table
          dataSource={skills}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
        />
      )}
    </div>
  )
}

export default SkillManager
