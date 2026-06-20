interface ClassifyResult {
  subjectId: string
  subjectName: string
  score: number
}

// 内置学科关键词字典：学科名 → 关键词列表
const BUILTIN_SUBJECT_KEYWORDS: Record<string, string[]> = {
  // 历史类
  '中国近代史': ['近代史', '鸦片战争', '太平天国', '洋务运动', '戊戌变法', '辛亥革命', '五四运动', '新民主主义', '半殖民地', '半封建', '中共一大', '遵义会议', '长征', '抗日战争', '解放战争', '国共合作', '马克思主义', '毛泽东', '中国共产党'],
  '中国近代史纲要': ['近代史', '纲要', '鸦片战争', '太平天国', '洋务运动', '戊戌变法', '辛亥革命', '五四运动', '半殖民地', '半封建', '中共一大', '遵义会议', '长征', '抗日战争', '解放战争', '国共合作', '南昌起义', '井冈山', '不平等条约', '南京条约', '资产阶级革命', '孙中山', '蒋介石'],
  '中国近现代史纲要': ['近代史', '现代史', '纲要', '鸦片战争', '太平天国', '洋务运动', '戊戌变法', '辛亥革命', '五四运动', '半殖民地', '半封建', '中共一大', '遵义会议', '长征', '抗日战争', '解放战争', '国共合作', '南昌起义', '井冈山', '不平等条约', '南京条约', '资产阶级革命', '辛亥', '孙中山', '蒋介石'],
  '中国现代史': ['现代史', '新中国', '社会主义', '改革开放', '文化大革命', '大跃进', '人民公社', '四个现代化', '一国两制', '邓小平'],
  '世界史': ['世界史', '古希腊', '古罗马', '文艺复兴', '启蒙运动', '工业革命', '法国大革命', '美国独立', '两次世界大战', '冷战'],
  '中国古代史': ['古代史', '夏商周', '秦汉', '唐宋元明清', '科举', '封建', '中央集权', '丝绸之路', '四大发明'],
  '中国通史': ['通史', '上下五千年', '朝代', '二十四史', '资治通鉴'],
  '史纲': ['近代史', '纲要', '鸦片战争', '辛亥革命', '五四运动', '抗日战争', '解放战争', '南昌起义', '井冈山', '不平等条约', '孙中山'],

  // 马克思主义/思政类
  '马克思主义基本原理': ['唯物辩证', '历史唯物', '剩余价值', '资本论', '辩证法', '认识论', '生产力', '生产关系', '阶级斗争', '物质', '意识', '矛盾', '否定之否定', '实践'],
  '马原': ['唯物辩证', '历史唯物', '剩余价值', '资本论', '辩证法', '认识论', '生产力', '生产关系', '阶级斗争', '矛盾', '否定之否定'],
  '毛泽东思想和中国特色社会主义理论体系概论': ['毛泽东思想', '实事求是', '群众路线', '独立自主', '农村包围城市', '新民主主义论', '矛盾论', '实践论', '邓小平理论', '三个代表', '科学发展观', '中国特色社会主义', '实事求是'],
  '毛泽东思想': ['毛泽东思想', '实事求是', '群众路线', '独立自主', '农村包围城市', '新民主主义论', '矛盾论', '实践论', '论十大关系', '正确处理人民内部矛盾'],
  '思想道德与法治': ['思想道德', '人生观', '价值观', '世界观', '社会主义核心价值观', '道德修养', '理想信念', '爱国主义', '法治', '权利', '义务'],
  '思想道德修养': ['思想道德', '人生观', '价值观', '世界观', '社会主义核心价值观', '道德修养', '理想信念', '爱国主义', '法治'],
  '思修': ['思想道德', '人生观', '价值观', '道德修养', '理想信念', '法治'],
  '形势与政策': ['形势', '政策', '时事', '国内外', '两会', 'GDP', '十四五', '二十大'],
  '思想政治理论': ['政治理论', '马克思主义', '毛泽东思想', '中国特色社会主义'],
  '政治理论': ['政治理论', '马克思主义', '毛泽东思想', '中国特色社会主义'],
  '邓小平理论': ['邓小平', '改革开放', '社会主义市场经济', '一国两制', '中国特色社会主义', '南方谈话'],
  '中国特色社会主义': ['中国特色社会主义', '改革开放', '社会主义初级阶段', '基本路线', '四个全面', '五位一体'],
  '习近平新时代中国特色社会主义思想概论': ['习近平', '新时代', '中国梦', '新发展理念', '人类命运共同体', '一带一路', '精准扶贫', '绿水青山', '不忘初心', '牢记使命', '中国式现代化', '共同富裕', '八个明确', '十四个坚持'],
  '习近平': ['习近平', '新时代', '中国梦', '新发展理念', '人类命运共同体', '一带一路', '精准扶贫', '绿水青山', '不忘初心', '牢记使命', '中国式现代化', '共同富裕'],
  '习概': ['习近平', '新时代', '中国梦', '新发展理念', '人类命运共同体', '一带一路', '精准扶贫', '绿水青山', '不忘初心', '牢记使命', '中国式现代化', '共同富裕'],

  // 数学类
  '高等数学': ['微积分', '极限', '导数', '积分', '级数', '微分方程', '泰勒', '洛必达', '不定积分', '定积分', '偏导', '多元函数'],
  '线性代数': ['线性代数', '矩阵', '行列式', '向量', '线性方程组', '特征值', '特征向量', '秩', '线性相关', '逆矩阵'],
  '概率论': ['概率', '概率论', '随机变量', '分布', '期望', '方差', '正态分布', '二项分布', '泊松分布', '大数定律', '中心极限'],
  '概率论与数理统计': ['概率', '数理统计', '随机变量', '分布', '期望', '方差', '假设检验', '回归分析', '置信区间'],
  '数学分析': ['数学分析', '极限', '连续', '微分', '积分', '级数', '一致收敛', '黎曼积分'],
  '离散数学': ['离散数学', '图论', '组合', '逻辑', '集合', '关系', '函数', '二叉树', '布尔代数'],
  '复变函数': ['复变函数', '复数', '解析函数', '柯西', '留数', '傅里叶', '拉普拉斯'],
  '常微分方程': ['微分方程', '常微分', '通解', '特解', '齐次', '非齐次', '特征方程'],
  '数值分析': ['数值分析', '数值逼近', '插值', '数值积分', '迭代法', '牛顿法'],
  '运筹学': ['运筹学', '线性规划', '最优化', '单纯形法', '动态规划', '排队论'],

  // 物理类
  '大学物理': ['力学', '电磁', '热学', '光学', '量子', '牛顿', '能量', '速度', '加速度', '库仑', '安培', '麦克斯韦', '波尔', '薛定谔'],
  '普通物理': ['力学', '电磁', '热学', '光学', '量子', '牛顿', '能量', '速度', '加速度'],
  '电磁学': ['电磁学', '库仑', '电场', '磁场', '安培', '法拉第', '麦克斯韦', '电磁感应', '高斯'],
  '热力学': ['热力学', '热机', '熵', '内能', '等温', '绝热', '卡诺', '热容', '分子运动'],
  '光学': ['光学', '折射', '反射', '干涉', '衍射', '偏振', '透镜', '棱镜', '波动光学'],
  '量子力学': ['量子力学', '波函数', '薛定谔', '不确定性', '能级', '跃迁', '自旋', '泡利', '算符', '本征值'],
  '理论力学': ['理论力学', '拉格朗日', '哈密顿', '虚功原理', '达朗贝尔', '刚体', '转动惯量'],
  '电动力学': ['电动力学', '麦克斯韦方程', '电磁波', '辐射'],
  '固体物理': ['固体物理', '晶格', '能带', '费米面', '声子', '半导体', '超导'],
  '大学物理实验': ['物理实验', '实验报告', '误差分析', '有效数字', '示波器', '分光计'],

  // 化学类
  '无机化学': ['无机化学', '元素周期', '化学键', '氧化还原', '酸碱', '配位', '晶体场'],
  '有机化学': ['有机化学', '官能团', '反应机理', '取代反应', '加成反应', '消除反应', '立体化学', '手性'],
  '分析化学': ['分析化学', '滴定', '色谱', '光谱', '定量分析', '定性分析', '重量分析'],
  '物理化学': ['物理化学', '热力学', '动力学', '平衡', '电化学', '表面化学', '催化', '吉布斯'],
  '生物化学': ['生物化学', '蛋白质', '酶', 'DNA', 'RNA', '代谢', '糖类', '脂质', '氨基酸'],

  // 计算机类
  '数据结构': ['数据结构', '链表', '栈', '队列', '树', '图', '排序', '查找', '二叉树', '哈希表', '堆'],
  '操作系统': ['操作系统', '进程', '线程', '内存管理', '文件系统', '死锁', '调度', '虚拟内存', '分页'],
  '计算机网络': ['计算机网络', 'TCP', 'UDP', 'HTTP', 'IP', 'DNS', '路由', '交换机', 'OSI', '网络安全'],
  '数据库': ['数据库', 'SQL', '关系型', 'MySQL', '索引', '事务', '范式', 'ER图', 'NoSQL'],
  '编译原理': ['编译原理', '词法分析', '语法分析', '语义分析', '中间代码', '代码优化', '有限自动机'],
  '算法': ['算法', '时间复杂度', '空间复杂度', '递归', '分治', '动态规划', '贪心', '回溯', '图算法'],
  '计算机组成原理': ['计算机组成', 'CPU', '指令集', '存储器', '总线', '输入输出', '流水线', 'Cache'],
  '人工智能': ['人工智能', '机器学习', '深度学习', '神经网络', '自然语言处理', '计算机视觉', '强化学习', 'Transformer'],
  '软件工程': ['软件工程', '需求分析', '设计模式', 'UML', '测试', '版本控制', '敏捷开发'],
  'Java': ['Java', '面向对象', '继承', '多态', '接口', '抽象类', 'JVM', '集合框架', '多线程'],
  'Python': ['Python', '列表', '字典', '函数', '模块', '面向对象', '爬虫', '数据分析', 'NumPy', 'Pandas'],
  'C语言': ['C语言', '指针', '数组', '结构体', '文件操作', '内存管理', '链表', '递归'],
  'C++': ['C++', '类', '继承', '多态', '模板', 'STL', '虚函数', '智能指针', '引用'],
  'Web开发': ['Web开发', 'HTML', 'CSS', 'JavaScript', '前端', '后端', 'React', 'Vue', 'Node.js'],
  '网络安全': ['网络安全', '渗透测试', '防火墙', '加密', '漏洞', 'SQL注入', 'XSS'],

  // 英语类
  '大学英语': ['英语', '阅读理解', '完形填空', '写作', '翻译', '听力', '词汇', '四级', '六级'],
  '大学英语四级': ['四级', 'CET4', '阅读理解', '完形填空', '写作', '翻译', '听力', '词汇'],
  '大学英语六级': ['六级', 'CET6', '阅读理解', '完形填空', '写作', '翻译', '听力', '词汇'],
  '英语': ['英语', 'English', '语法', '阅读', '写作', '翻译', '词汇', '听力'],
  '商务英语': ['商务英语', 'Business English', '贸易', '合同', '报价', '函电'],
  '英语写作': ['英语写作', 'essay', '作文', '论点', '论据', '段落'],
  '英语翻译': ['翻译', 'translation', '英译中', '中译英', '直译', '意译'],
  '英美文学': ['英美文学', '莎士比亚', '海明威', '马克吐温', '狄更斯', '奥斯丁'],

  // 经济管理类
  '微观经济学': ['微观经济学', '供给', '需求', '弹性', '市场', '消费者', '生产者', '博弈论', '边际'],
  '宏观经济学': ['宏观经济学', 'GDP', '通胀', '失业', '货币政策', '财政政策', '经济增长', '国际贸易'],
  '管理学': ['管理学', '计划', '组织', '领导', '控制', '决策', '激励', '战略', 'SWOT'],
  '会计学': ['会计学', '资产', '负债', '所有者权益', '收入', '费用', '利润', '借贷', '分录'],
  '财务管理': ['财务管理', '资金', '投资', '融资', '成本', '预算', '现金流', '财务报表'],
  '市场营销': ['市场营销', '4P', '品牌', '消费者行为', '市场调研', '渠道', '促销', '定价'],
  '金融学': ['金融学', '货币', '银行', '利率', '汇率', '证券', '保险', '投资', '风险管理'],

  // 法学类
  '法学': ['法学', '法律', '宪法', '民法', '刑法', '行政法', '诉讼法', '法理学'],
  '民法': ['民法', '合同', '物权', '债权', '侵权', '婚姻家庭', '继承', '民事责任'],
  '刑法': ['刑法', '犯罪', '刑罚', '故意', '过失', '正当防卫', '紧急避险', '共同犯罪'],
  '宪法': ['宪法', '公民权利', '国家机构', '基本权利', '宪法修正'],

  // 文学/中文类
  '中国古代文学': ['古代文学', '诗经', '楚辞', '唐诗', '宋词', '元曲', '明清小说', '四大名著', '李白', '杜甫', '苏轼'],
  '中国现当代文学': ['现当代文学', '鲁迅', '茅盾', '巴金', '老舍', '曹禺', '沈从文', '莫言'],
  '外国文学': ['外国文学', '托尔斯泰', '莎士比亚', '雨果', '巴尔扎克', '卡夫卡', '海明威'],
  '文学概论': ['文学概论', '文学理论', '叙事', '抒情', '意象', '典型', '风格', '流派'],
  '古代汉语': ['古代汉语', '文言文', '实词', '虚词', '句式', '训诂', '音韵'],
  '现代汉语': ['现代汉语', '语音', '词汇', '语法', '修辞', '汉字'],

  // 教育/心理
  '教育学': ['教育学', '教育心理学', '课程', '教学法', '德育', '班级管理', '教育改革'],
  '心理学': ['心理学', '认知', '情绪', '动机', '人格', '社会心理', '发展心理', '实验心理'],

  // 艺术
  '艺术概论': ['艺术概论', '艺术本质', '艺术创作', '艺术鉴赏', '美学', '审美'],
  '设计基础': ['设计基础', '构成', '色彩', '平面构成', '立体构成', '色彩构成'],

  // 医学
  '人体解剖学': ['解剖学', '骨骼', '肌肉', '器官', '系统', '组织', '细胞'],
  '生理学': ['生理学', '细胞生理', '神经', '循环', '呼吸', '消化', '泌尿', '内分泌'],

  // 通用
  '体育': ['体育', '篮球', '足球', '排球', '跑步', '体能', '运动', '训练'],
  '军事理论': ['军事', '国防', '军事思想', '战略', '战术', '信息化战争'],
}

// 查找学科在内置字典中的关键词
function lookupBuiltinKeywords(subjectName: string): string[] | null {
  // 1. 精确匹配
  if (BUILTIN_SUBJECT_KEYWORDS[subjectName]) {
    return BUILTIN_SUBJECT_KEYWORDS[subjectName]
  }

  // 2. 按字典 key 长度降序匹配（优先匹配更长/更具体的 key）
  const entries = Object.entries(BUILTIN_SUBJECT_KEYWORDS).sort((a, b) => b[0].length - a[0].length)

  for (const [dictName, dictKeywords] of entries) {
    // 精确包含：学科名包含字典 key，且字典 key 至少占学科名 40% 长度
    if (subjectName.includes(dictName) && dictName.length >= subjectName.length * 0.4) {
      return dictKeywords
    }
    // 字典 key 包含学科名
    if (dictName.includes(subjectName)) {
      return dictKeywords
    }
    // 前缀匹配：学科名以字典 key 开头（处理"习近平..."匹配"习近平"的情况）
    if (subjectName.startsWith(dictName) && dictName.length >= 2) {
      return dictKeywords
    }
  }

  return null
}

// 获取学科的有效关键词：合并用户自定义 + 内置字典 + 学科名本身
function getEffectiveKeywords(subject: { name: string; keywords?: string[] }): string[] {
  const builtin = lookupBuiltinKeywords(subject.name)
  const userKw = subject.keywords || []

  // 合并：用户关键词 + 字典关键词 + 学科名本身（去重）
  const merged = new Set<string>([subject.name, ...userKw])
  if (builtin) {
    for (const kw of builtin) merged.add(kw)
  }
  return Array.from(merged)
}

// 获取学科的所有可能名称（包括字典中的缩写 key），用于文件名匹配
function getSubjectAliases(subjectName: string): string[] {
  const aliases: string[] = [subjectName]
  // 查找所有与该学科名匹配的字典 key（可能是缩写）
  for (const dictName of Object.keys(BUILTIN_SUBJECT_KEYWORDS)) {
    // 字典 key 是学科名的子串，或学科名是字典 key 的子串
    if (subjectName.includes(dictName) || dictName.includes(subjectName)) {
      aliases.push(dictName)
    }
  }
  return aliases
}

// 模糊检查文本是否包含关键词
function fuzzyContains(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true
  const textNoSpace = text.replace(/\s+/g, '')
  if (textNoSpace.includes(keyword)) return true
  if (keyword.length >= 2) {
    const chars = keyword.split('')
    const found = chars.filter((c) => text.includes(c)).length
    if (found / chars.length >= 0.7) return true
  }
  return false
}

// 计算所有学科共享的关键词（用于降低共享关键词的权重）
function buildSharedKeywordMap(subjects: { id: string; name: string; keywords?: string[] }[]): Map<string, number> {
  const keywordCount = new Map<string, Set<string>>()
  for (const subject of subjects) {
    const keywords = getEffectiveKeywords(subject)
    for (const kw of keywords) {
      const lower = kw.toLowerCase()
      if (!keywordCount.has(lower)) keywordCount.set(lower, new Set())
      keywordCount.get(lower)!.add(subject.id)
    }
  }
  const shared = new Map<string, number>()
  for (const [kw, ids] of keywordCount) {
    if (ids.size > 1) shared.set(kw, ids.size)
  }
  return shared
}

export function classifyMaterial(
  materialName: string,
  materialContent: string,
  subjects: { id: string; name: string; keywords?: string[] }[]
): ClassifyResult | null {
  if (subjects.length === 0) return null

  const nameLower = materialName.toLowerCase()
  const contentLower = materialContent.toLowerCase()
  const sharedMap = buildSharedKeywordMap(subjects)

  // 记录所有学科的分数
  const scores: { subject: typeof subjects[0]; score: number; exclusiveHits: number }[] = []

  for (const subject of subjects) {
    const keywords = getEffectiveKeywords(subject)
    let score = 0
    let exclusiveHits = 0

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      const isShared = sharedMap.has(kwLower)
      // 共享关键词权重降低（除以共享学科数）
      const weight = isShared ? (1 / sharedMap.get(kwLower)!) : 1

      if (fuzzyContains(nameLower, kwLower)) {
        score += 2 * weight
        if (!isShared) exclusiveHits++
      }
      if (fuzzyContains(contentLower, kwLower)) {
        score += 1 * weight
        if (!isShared) exclusiveHits++
      }
    }

    // 学科名直接匹配文件名：最高优先级
    if (fuzzyContains(nameLower, subject.name.toLowerCase())) {
      score += 10
      exclusiveHits += 5
    }

    // 学科缩写/简称匹配文件名（如"习概"匹配"习近平..."）
    const aliases = getSubjectAliases(subject.name)
    for (const alias of aliases) {
      if (alias !== subject.name && fuzzyContains(nameLower, alias.toLowerCase())) {
        score += 8
        exclusiveHits += 4
        break
      }
    }

    // 学科名的每个字都出现在内容中（兜底）
    if (contentLower.length > 0) {
      const subjectChars = subject.name.split('')
      const matched = subjectChars.filter((c) => contentLower.includes(c)).length
      if (matched >= Math.floor(subjectChars.length * 0.5)) {
        score += 1
      }
    }

    if (score > 0) {
      scores.push({ subject, score, exclusiveHits })
    }
  }

  if (scores.length === 0) return null

  // 按分数排序
  scores.sort((a, b) => {
    // 先按总分排
    if (b.score !== a.score) return b.score - a.score
    // 同分时，排他性匹配多的优先
    return b.exclusiveHits - a.exclusiveHits
  })

  const best = scores[0]
  // 如果第二名和第一名差距太小（<30%），说明学科重叠严重，不分类
  if (scores.length > 1) {
    const second = scores[1]
    if (best.score > 0 && second.score > 0) {
      const gap = (best.score - second.score) / best.score
      if (gap < 0.3) {
        // 差距太小，置信度不足，返回 null 不分类
        return null
      }
    }
  }

  return { subjectId: best.subject.id, subjectName: best.subject.name, score: best.score }
}

export function batchClassify(
  materials: { id: string; name: string; content: string }[],
  subjects: { id: string; name: string; keywords?: string[] }[]
): { materialId: string; subjectId: string; subjectName: string; score: number }[] {
  return materials
    .map((mat) => {
      const result = classifyMaterial(mat.name, mat.content, subjects)
      return result ? { materialId: mat.id, ...result } : null
    })
    .filter(Boolean) as { materialId: string; subjectId: string; subjectName: string; score: number }[]
}

// 返回 top 2 候选学科，用于 AI 辅助决策
function getTopCandidates(
  materialName: string,
  materialContent: string,
  subjects: { id: string; name: string; keywords?: string[] }[]
): { first: { subjectId: string; subjectName: string; score: number }; second: { subjectId: string; subjectName: string; score: number } | null } | null {
  if (subjects.length === 0) return null

  const nameLower = materialName.toLowerCase()
  const contentLower = materialContent.toLowerCase()
  const sharedMap = buildSharedKeywordMap(subjects)

  const scores: { subjectId: string; subjectName: string; score: number; exclusiveHits: number }[] = []

  for (const subject of subjects) {
    const keywords = getEffectiveKeywords(subject)
    let score = 0
    let exclusiveHits = 0

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      const isShared = sharedMap.has(kwLower)
      const weight = isShared ? (1 / sharedMap.get(kwLower)!) : 1

      if (fuzzyContains(nameLower, kwLower)) {
        score += 2 * weight
        if (!isShared) exclusiveHits++
      }
      if (fuzzyContains(contentLower, kwLower)) {
        score += 1 * weight
        if (!isShared) exclusiveHits++
      }
    }

    if (fuzzyContains(nameLower, subject.name.toLowerCase())) {
      score += 10
      exclusiveHits += 5
    }

    const aliases = getSubjectAliases(subject.name)
    for (const alias of aliases) {
      if (alias !== subject.name && fuzzyContains(nameLower, alias.toLowerCase())) {
        score += 8
        exclusiveHits += 4
        break
      }
    }

    if (contentLower.length > 0) {
      const subjectChars = subject.name.split('')
      const matched = subjectChars.filter((c) => contentLower.includes(c)).length
      if (matched >= Math.floor(subjectChars.length * 0.5)) {
        score += 1
      }
    }

    if (score > 0) {
      scores.push({ subjectId: subject.id, subjectName: subject.name, score, exclusiveHits })
    }
  }

  if (scores.length === 0) return null

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.exclusiveHits - a.exclusiveHits
  })

  return {
    first: { subjectId: scores[0].subjectId, subjectName: scores[0].subjectName, score: scores[0].score },
    second: scores.length > 1 ? { subjectId: scores[1].subjectId, subjectName: scores[1].subjectName, score: scores[1].score } : null,
  }
}

// AI 辅助分类：当规则分类置信度不足时，调用 AI 决策
async function classifyWithAI(
  materialName: string,
  materialContent: string,
  subjects: { id: string; name: string; keywords?: string[] }[]
): Promise<{ subjectId: string; subjectName: string; score: number } | null> {
  const result = classifyMaterial(materialName, materialContent, subjects)
  if (result) return result

  // 规则分类失败（gap < 30% 或无匹配），尝试 AI
  const candidates = getTopCandidates(materialName, materialContent, subjects)
  if (!candidates || !candidates.second) {
    // 无候选或只有一个候选，直接返回
    if (candidates?.first && candidates.first.score > 0) {
      return candidates.first
    }
    return null
  }

  try {
    const config = await window.electron?.ai.getConfig()
    if (!config?.hasApiKey) {
      // 无 API key，fallback 返回得分最高的
      return candidates.first
    }

    const contentExcerpt = materialContent.slice(0, 500)
    const prompt = `你是一个学科分类助手。请判断以下资料应该归入哪个学科。

资料名称：${materialName}
资料内容（前500字）：${contentExcerpt}

候选学科：
A. ${candidates.first.subjectName}（关键词匹配得分 ${candidates.first.score}）
B. ${candidates.second.subjectName}（关键词匹配得分 ${candidates.second.score}）

请只回答 A 或 B，不要解释。`

    const response = await window.electron.ai.chat(prompt)
    const choice = response.trim().toUpperCase()

    if (choice === 'A' || choice.includes(candidates.first.subjectName)) {
      return candidates.first
    } else if (choice === 'B' || choice.includes(candidates.second.subjectName)) {
      return candidates.second
    }
    // 无法解析，返回得分最高的
    return candidates.first
  } catch {
    return candidates.first
  }
}

export async function batchClassifyWithAI(
  materials: { id: string; name: string; content: string }[],
  subjects: { id: string; name: string; keywords?: string[] }[]
): Promise<{ materialId: string; subjectId: string; subjectName: string; score: number }[]> {
  const results: { materialId: string; subjectId: string; subjectName: string; score: number }[] = []

  for (const mat of materials) {
    const result = await classifyWithAI(mat.name, mat.content, subjects)
    if (result) {
      results.push({ materialId: mat.id, ...result })
    }
  }

  return results
}

// 为学科自动注入内置关键词
export function injectBuiltinKeywords(subject: { name: string; keywords?: string[] }): string[] {
  if (subject.keywords && subject.keywords.length > 0) {
    return subject.keywords
  }
  return lookupBuiltinKeywords(subject.name) || []
}
