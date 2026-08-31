/* ============ 全局状态 ============ */
const CATEGORIES = [
  { id: "philosophy", label: "哲学", emoji: "🧠", desc: "爱智慧之学——追问世界的根本问题" },
  { id: "economics", label: "经济学", emoji: "📈", desc: "稀缺资源的配置——市场、政策与金融" },
  { id: "law", label: "法学", emoji: "⚖️", desc: "规则与正义——权利、义务与责任" },
  { id: "education", label: "教育学", emoji: "🎓", desc: "教与学的科学——课程、教学与心理" },
  { id: "literature", label: "文学", emoji: "📖", desc: "语言的艺术——中外文学的经典长廊" },
  { id: "history", label: "历史学", emoji: "🏛️", desc: "过去的真相——文明的兴衰与演变" },
  { id: "science", label: "理学", emoji: "🔬", desc: "自然的基础科学——数学、物理、化学、生物" },
  { id: "engineering", label: "工学", emoji: "⚙️", desc: "技术之道——计算机、电路与控制" },
  { id: "agriculture", label: "农学", emoji: "🌾", desc: "从土地到餐桌——作物、土壤与农业科技" },
  { id: "medicine", label: "医学", emoji: "🩺", desc: "人体的结构与功能——解剖、生理与病理" },
  { id: "management", label: "管理学", emoji: "📋", desc: "组织的科学与艺术——管理、会计与营销" },
  { id: "art", label: "艺术学", emoji: "🎨", desc: "美的创造与鉴赏——美术、音乐与艺术理论" }
];
const DOMAIN_META = {
  "philosophy-intro": { label: "哲学导论", emoji: "🧠", category: "philosophy", group: "哲学类", tagline: "从古希腊到当代——追问世界、自我与价值" },
  logic: { label: "逻辑学", emoji: "🔍", category: "philosophy", group: "哲学类", tagline: "论证与推理的规则——让思考更严密" },
  microeconomics: { label: "微观经济学", emoji: "📊", category: "economics", group: "经济学类", tagline: "个体如何决策——供需、市场与博弈" },
  macroeconomics: { label: "宏观经济学", emoji: "🏛️", category: "economics", group: "经济学类", tagline: "GDP、通胀与政策——看懂经济新闻" },
  econometrics: { label: "计量经济学", emoji: "📏", category: "economics", group: "经济学类", tagline: "用数据检验经济理论——回归与推断" },
  finance: { label: "金融学基础", emoji: "💰", category: "economics", group: "金融学类", tagline: "钱的时间价值——债券、组合与定价" },
  "international-econ": { label: "国际经济学", emoji: "🌍", category: "economics", group: "经济与贸易类", tagline: "贸易、汇率与国际收支——全球化的经济学" },
  jurisprudence: { label: "法理学导论", emoji: "⚖️", category: "law", group: "法学类", tagline: "法是什么——法的概念、体系与法治" },
  constitution: { label: "宪法学", emoji: "🏛️", category: "law", group: "法学类", tagline: "根本大法——国家权力与公民权利" },
  "criminal-law": { label: "刑法学", emoji: "🔒", category: "law", group: "法学类", tagline: "犯罪与刑罚——罪刑法定与犯罪构成" },
  "civil-law": { label: "民法学", emoji: "🤝", category: "law", group: "法学类", tagline: "权利与契约——物权、合同与侵权" },
  "education-principle": { label: "教育学原理", emoji: "🎓", category: "education", group: "教育学类", tagline: "教育是什么——目的、课程与教学" },
  "edu-psychology": { label: "教育心理学", emoji: "🧩", category: "education", group: "心理学类", tagline: "学习如何发生——动机、发展与建构" },
  "chinese-lit-history": { label: "中国文学史", emoji: "📖", category: "literature", group: "中国语言文学类", tagline: "从诗经到现代——三千年的文学经典" },
  "world-lit-history": { label: "外国文学史", emoji: "🌍", category: "literature", group: "外国语言文学类", tagline: "荷马到卡夫卡——世界文学的名著长廊" },
  "ancient-china-history": { label: "中国古代史", emoji: "🏮", category: "history", group: "历史学类", tagline: "先秦到明清——中华文明的演进" },
  "world-history": { label: "世界史", emoji: "🌐", category: "history", group: "历史学类", tagline: "文明起源到当代——全球视角的过去" },
  analysis: { label: "数学分析", emoji: "📈", category: "science", group: "数学类", tagline: "极限、连续、微分与积分——分析的基石" },
  "linear-algebra": { label: "线性代数", emoji: "📐", category: "science", group: "数学类", tagline: "向量、矩阵与线性空间——理工科的通用语言" },
  "group-theory": { label: "群论", emoji: "🔷", category: "science", group: "数学类", tagline: "对称性的数学——从抽象结构看世界" },
  "probability-stats": { label: "概率论与数理统计", emoji: "🎲", category: "science", group: "统计学类", tagline: "不确定性中的规律——从随机到推断" },
  mechanics: { label: "大学物理 · 力学", emoji: "🍎", category: "science", group: "物理学类", tagline: "从牛顿三定律到刚体振动——运动的世界" },
  electromagnetism: { label: "大学物理 · 电磁学", emoji: "🧲", category: "science", group: "物理学类", tagline: "电场与磁场——麦克斯韦方程组的来源" },
  "inorganic-chemistry": { label: "无机化学", emoji: "⚗️", category: "science", group: "化学类", tagline: "原子、键与平衡——化学的骨架" },
  "organic-chemistry": { label: "有机化学", emoji: "🧪", category: "science", group: "化学类", tagline: "碳的世界——官能团、机理与生物分子" },
  "biology-basics": { label: "生物学基础", emoji: "🧬", category: "science", group: "生物科学类", tagline: "细胞、遗传与进化——生命的原理" },
  "astronomy-intro": { label: "天文学导论", emoji: "🔭", category: "science", group: "天文学类", tagline: "太阳系、恒星与宇宙——仰望星空" },
  "ds-algorithms": { label: "数据结构与算法", emoji: "💻", category: "engineering", group: "计算机类", tagline: "程序的骨架与灵魂——面试与工程的根基" },
  "operating-system": { label: "操作系统", emoji: "🖥️", category: "engineering", group: "计算机类", tagline: "进程、内存与文件——计算机资源的管家" },
  "computer-network": { label: "计算机网络", emoji: "🌐", category: "engineering", group: "计算机类", tagline: "从七层模型到 TCP/IP——互联网的底层逻辑" },
  "database-system": { label: "数据库系统", emoji: "🗄️", category: "engineering", group: "计算机类", tagline: "关系模型与 SQL——数据的组织之道" },
  "computer-organization": { label: "计算机组成原理", emoji: "🔩", category: "engineering", group: "计算机类", tagline: "数制、存储与 CPU——计算机的硬件心脏" },
  "software-engineering": { label: "软件工程导论", emoji: "🧱", category: "engineering", group: "计算机类", tagline: "需求、设计与测试——工程化地做软件" },
  "programming-basics": { label: "程序设计基础", emoji: "🐍", category: "engineering", group: "计算机类", tagline: "从零写代码——变量、控制与函数" },
  "discrete-math": { label: "离散数学", emoji: "🧮", category: "engineering", group: "计算机类", tagline: "逻辑、集合与图——计算机的数学根基" },
  "theory-of-computation": { label: "计算理论导论", emoji: "🤖", category: "engineering", group: "计算机类", tagline: "自动机、图灵机与 P/NP——计算的边界" },
  "compiler-principles": { label: "编译原理", emoji: "🔨", category: "engineering", group: "计算机类", tagline: "从源码到机器码——编译器如何工作" },
  "ai-intro": { label: "人工智能导论", emoji: "🧠", category: "engineering", group: "计算机类", tagline: "搜索、机器学习与神经网络——AI 的门" },
  "information-security": { label: "信息安全导论", emoji: "🔐", category: "engineering", group: "计算机类", tagline: "密码、认证与攻防——安全的基石" },
  "computer-graphics": { label: "计算机图形学", emoji: "🖼️", category: "engineering", group: "计算机类", tagline: "变换、光栅化与渲染——画出来的世界" },
  "distributed-systems": { label: "分布式系统导论", emoji: "☁️", category: "engineering", group: "计算机类", tagline: "一致性、复制与微服务——云端的地基" },
  "data-science": { label: "数据科学导论", emoji: "📊", category: "engineering", group: "计算机类", tagline: "采集、建模与叙事——从数据到洞见" },
  oop: { label: "面向对象程序设计", emoji: "🏗️", category: "engineering", group: "计算机类", tagline: "类、继承与设计模式——工程化的编程" },
  "circuit-basics": { label: "电路基础", emoji: "⚡", category: "engineering", group: "电气类", tagline: "基尔霍夫到正弦稳态——电路分析入门" },
  "automatic-control": { label: "自动控制原理", emoji: "🎛️", category: "engineering", group: "自动化类", tagline: "反馈的艺术——时域、频域与 PID" },
  "agronomy-intro": { label: "农学概论", emoji: "🌾", category: "agriculture", group: "植物生产类", tagline: "作物、土壤与育种——现代农业的根基" },
  "human-anatomy": { label: "人体解剖学", emoji: "🦴", category: "medicine", group: "基础医学类", tagline: "人体的结构——系统与器官的位置关系" },
  physiology: { label: "生理学", emoji: "🫀", category: "medicine", group: "基础医学类", tagline: "人体如何运转——细胞、循环与神经" },
  "pathology-intro": { label: "病理学导论", emoji: "🩺", category: "medicine", group: "基础医学类", tagline: "疾病如何发生——损伤、炎症与肿瘤" },
  "management-principle": { label: "管理学原理", emoji: "📋", category: "management", group: "工商管理类", tagline: "计划组织领导控制——管理的四大职能" },
  "accounting-basics": { label: "会计学基础", emoji: "🧾", category: "management", group: "工商管理类", tagline: "从记账到报表——读懂企业的语言" },
  marketing: { label: "市场营销学", emoji: "📣", category: "management", group: "工商管理类", tagline: "STP 与 4P——把价值传递给顾客" },
  "art-introduction": { label: "艺术概论", emoji: "🎨", category: "art", group: "艺术学理论类", tagline: "什么是艺术——本质、创作与鉴赏" },
  "art-history": { label: "中外美术史", emoji: "🖼️", category: "art", group: "美术学类", tagline: "从洞穴壁画到当代——美术的演化" },
  "music-theory": { label: "音乐基础理论", emoji: "🎼", category: "art", group: "音乐与舞蹈学类", tagline: "音符、音程与和弦——音乐的语言" },
  "fiscal-science": { label: "财政学", emoji: "🧾", category: "economics", group: "财政学类", tagline: "公共品、税收与政府预算——国家的钱袋子" },
  "political-science": { label: "政治学概论", emoji: "🏛️", category: "law", group: "政治学类", tagline: "国家、政府与制度——政治如何运转" },
  sociology: { label: "社会学概论", emoji: "👥", category: "law", group: "社会学类", tagline: "群体、分层与变迁——社会如何组织" },
  ethnology: { label: "民族学概论", emoji: "🗺️", category: "law", group: "民族学类", tagline: "田野、亲属与仪式——理解多元文化" },
  "marxism-theory": { label: "马克思主义基本原理", emoji: "📕", category: "law", group: "马克思主义理论类", tagline: "辩证唯物主义到科学社会主义" },
  "sports-science": { label: "体育学导论", emoji: "🏀", category: "education", group: "体育学类", tagline: "运动生理、训练与学校体育" },
  "journalism-communication": { label: "新闻传播学概论", emoji: "📰", category: "literature", group: "新闻传播学类", tagline: "新闻、媒介与传播——信息如何到达你" },
  geography: { label: "地理科学导论", emoji: "🗺️", category: "science", group: "地理科学类", tagline: "自然、人文与 GIS——认识地表空间" },
  "atmospheric-science": { label: "大气科学导论", emoji: "🌤️", category: "science", group: "大气科学类", tagline: "天气、气候与变化——看懂天空" },
  "marine-science": { label: "海洋科学导论", emoji: "🌊", category: "science", group: "海洋科学类", tagline: "海水、环流与海洋生态——认识蓝色星球" },
  geophysics: { label: "地球物理学导论", emoji: "🌋", category: "science", group: "地球物理学类", tagline: "地震、重力与地磁——透视地球内部" },
  geology: { label: "地质学导论", emoji: "🪨", category: "science", group: "地质学类", tagline: "岩石、构造与矿产——读懂地球历史" },
  "scientific-psychology": { label: "普通心理学", emoji: "🧠", category: "science", group: "心理学类", tagline: "感觉、记忆与人格——心理的科学" },
  "engineering-mechanics": { label: "工程力学", emoji: "⚖️", category: "engineering", group: "力学类", tagline: "静力、材料与结构——工程的力学根基" },
  "mechanical-engineering": { label: "机械设计基础", emoji: "⚙️", category: "engineering", group: "机械类", tagline: "机构、齿轮与轴——机器的骨架" },
  instrumentation: { label: "仪器科学与技术", emoji: "🎛️", category: "engineering", group: "仪器类", tagline: "测量、传感器与误差——量得准才能做得好" },
  "materials-science": { label: "材料科学基础", emoji: "🔬", category: "engineering", group: "材料类", tagline: "晶体、相图与性能——万物皆材料" },
  "energy-power": { label: "能源与动力工程", emoji: "🔥", category: "engineering", group: "能源动力类", tagline: "热力、循环与新能源——动力从哪里来" },
  "electronic-information": { label: "电子信息基础", emoji: "📡", category: "engineering", group: "电子信息类", tagline: "电路、信号与通信——电子世界的语言" },
  "civil-engineering": { label: "土木工程概论", emoji: "🏗️", category: "engineering", group: "土木类", tagline: "结构、基础与施工——建起世界" },
  "hydraulic-engineering": { label: "水利工程导论", emoji: "💧", category: "engineering", group: "水利类", tagline: "水文、坝工与防洪——治水之道" },
  surveying: { label: "测绘学导论", emoji: "📏", category: "engineering", group: "测绘类", tagline: "测量、制图与 GNSS——定位这个世界" },
  "chemical-engineering": { label: "化学工程基础", emoji: "🏭", category: "engineering", group: "化工与制药类", tagline: "衡算、传质与反应器——把反应变成工业" },
  "geological-engineering": { label: "地质工程", emoji: "⛏️", category: "engineering", group: "地质类", tagline: "岩土、边坡与地下工程——与大地打交道" },
  "mining-engineering": { label: "采矿工程概论", emoji: "⛏️", category: "engineering", group: "矿业类", tagline: "矿床、井巷与通风——从矿山到矿石" },
  "textile-engineering": { label: "纺织工程概论", emoji: "🧵", category: "engineering", group: "纺织类", tagline: "纤维、纺纱与织造——织物的诞生" },
  "light-industry": { label: "轻工技术与工程", emoji: "🧴", category: "engineering", group: "轻工类", tagline: "造纸、皮革与日用化学品" },
  transportation: { label: "交通运输工程", emoji: "🚄", category: "engineering", group: "交通运输类", tagline: "公路、铁路与航空——物流世界的动脉" },
  "ocean-engineering": { label: "船舶与海洋工程", emoji: "🚢", category: "engineering", group: "海洋工程类", tagline: "船舶、平台与深海——向海图强" },
  aerospace: { label: "航空航天概论", emoji: "🚀", category: "engineering", group: "航空航天类", tagline: "气动、推进与轨道——飞向蓝天星辰" },
  "nuclear-engineering": { label: "核工程导论", emoji: "⚛️", category: "engineering", group: "核工程类", tagline: "裂变、反应堆与防护——核能的世界" },
  "agri-engineering": { label: "农业工程导论", emoji: "🚜", category: "engineering", group: "农业工程类", tagline: "机械、电气与设施——为农业插上翅膀" },
  "forestry-engineering": { label: "林业工程导论", emoji: "🪵", category: "engineering", group: "林业工程类", tagline: "木材、林化与家具——森林的馈赠" },
  "environmental-science": { label: "环境科学与工程", emoji: "🌱", category: "engineering", group: "环境科学与工程类", tagline: "水气固废与监测——守护碧水蓝天" },
  "biomedical-engineering": { label: "生物医学工程", emoji: "🦾", category: "engineering", group: "生物医学工程类", tagline: "影像、材料与器械——工程走进医疗" },
  "food-science": { label: "食品科学与工程", emoji: "🥖", category: "engineering", group: "食品科学与工程类", tagline: "加工、安全与营养——从农田到餐桌" },
  architecture: { label: "建筑学导论", emoji: "🏛️", category: "engineering", group: "建筑类", tagline: "空间、设计与城市——建筑的艺术与科学" },
  "safety-engineering": { label: "安全工程导论", emoji: "🛡️", category: "engineering", group: "安全科学与工程类", tagline: "风险、消防与应急——防患于未然" },
  "bio-engineering": { label: "生物工程导论", emoji: "🧫", category: "engineering", group: "生物工程类", tagline: "发酵、酶与基因——改造生命的工程" },
  "nature-conservation": { label: "自然保护与环境生态", emoji: "🦌", category: "agriculture", group: "自然保护与环境生态类", tagline: "生态、野生动植物与保护地" },
  "animal-science": { label: "动物生产学导论", emoji: "🐄", category: "agriculture", group: "动物生产类", tagline: "饲料、育种与饲养——畜牧业的科学" },
  veterinary: { label: "兽医学导论", emoji: "🐾", category: "agriculture", group: "动物医学类", tagline: "诊断、防疫与公共卫生——动物健康" },
  forestry: { label: "林学概论", emoji: "🌲", category: "agriculture", group: "林学类", tagline: "育种、造林与经营——森林的科学" },
  aquaculture: { label: "水产养殖学导论", emoji: "🐟", category: "agriculture", group: "水产类", tagline: "水质、养殖与病害——耕海牧渔" },
  "grassland-science": { label: "草学导论", emoji: "🌿", category: "agriculture", group: "草学类", tagline: "草地、牧草与草坪——绿色资源的学问" },
  "clinical-medicine": { label: "临床医学导论", emoji: "🏥", category: "medicine", group: "临床医学类", tagline: "诊断、内外科与急救——临床思维入门" },
  stomatology: { label: "口腔医学导论", emoji: "🦷", category: "medicine", group: "口腔医学类", tagline: "龋病、牙周与修复——口腔健康" },
  "public-health": { label: "公共卫生与预防医学", emoji: "🩺", category: "medicine", group: "公共卫生与预防医学类", tagline: "流行病、卫生与防控——守护人群健康" },
  tcm: { label: "中医学导论", emoji: "🌿", category: "medicine", group: "中医学类", tagline: "阴阳、藏象与辨证——中医的智慧" },
  "integrative-medicine": { label: "中西医结合导论", emoji: "🫶", category: "medicine", group: "中西医结合类", tagline: "病证结合、中西互补" },
  pharmacy: { label: "药学导论", emoji: "💊", category: "medicine", group: "药学类", tagline: "药效、制剂与合理用药——药物的科学" },
  "tcm-pharmacy": { label: "中药学导论", emoji: "🌿", category: "medicine", group: "中药学类", tagline: "鉴定、炮制与制剂——中药的学问" },
  "medical-technology": { label: "医学技术导论", emoji: "🧪", category: "medicine", group: "医学技术类", tagline: "检验、影像与康复——医疗的技术支撑" },
  nursing: { label: "护理学导论", emoji: "💉", category: "medicine", group: "护理学类", tagline: "基础护理、急救与伦理——照护的艺术" },
  "management-science": { label: "管理科学（运筹学）", emoji: "📈", category: "management", group: "管理科学与工程类", tagline: "优化、决策与排队——用数学管好资源" },
  "agri-economics": { label: "农业经济学", emoji: "🌾", category: "management", group: "农业经济管理类", tagline: "土地、市场与政策——三农的经济学" },
  "public-administration": { label: "公共管理学导论", emoji: "🏢", category: "management", group: "公共管理类", tagline: "政府、政策与治理——公共事务之道" },
  "library-science": { label: "图书情报与档案管理", emoji: "📚", category: "management", group: "图书情报与档案管理类", tagline: "组织、检索与知识服务——信息的管家" },
  logistics: { label: "物流管理导论", emoji: "📦", category: "management", group: "物流管理与工程类", tagline: "运输、仓储与供应链——物的流动" },
  "industrial-engineering": { label: "工业工程导论", emoji: "🏭", category: "management", group: "工业工程类", tagline: "效率、质量与精益——优化生产系统" },
  "e-commerce": { label: "电子商务概论", emoji: "🛒", category: "management", group: "电子商务类", tagline: "模式、支付与运营——数字商业" },
  "tourism-management": { label: "旅游管理学导论", emoji: "✈️", category: "management", group: "旅游管理类", tagline: "资源、规划与服务——旅游产业" },
  "film-theater": { label: "戏剧影视学导论", emoji: "🎬", category: "art", group: "戏剧与影视学类", tagline: "戏剧、电影语言与批评" },
  design: { label: "设计学导论", emoji: "✏️", category: "art", group: "设计学类", tagline: "视觉、产品与环境——设计的思维" },
  ode: { label: "常微分方程", emoji: "📈", category: "science", group: "数学类", tagline: "变化率的方程——从振动到混沌" },
  "complex-analysis": { label: "复变函数", emoji: "🌀", category: "science", group: "数学类", tagline: "复平面上的微积分——解析的魔法" },
  "numerical-analysis": { label: "数值分析", emoji: "🖩", category: "science", group: "数学类", tagline: "让计算机算数学——算法与误差" },
  thermodynamics: { label: "热力学与统计物理", emoji: "🔥", category: "science", group: "物理学类", tagline: "热、熵与微观世界——从蒸汽机到量子统计" },
  "quantum-mechanics": { label: "量子力学", emoji: "⚛️", category: "science", group: "物理学类", tagline: "微观世界的规则——波函数与算符" },
  optics: { label: "光学", emoji: "🔦", category: "science", group: "物理学类", tagline: "光的传播与本性——从几何光学到激光" },
  "physical-chemistry": { label: "物理化学", emoji: "🧪", category: "science", group: "化学类", tagline: "用物理理解化学——热力学、动力学与电化学" },
  "analytical-chemistry": { label: "分析化学", emoji: "🔬", category: "science", group: "化学类", tagline: "测定物质的成分——滴定、光谱与色谱" },
  genetics: { label: "遗传学", emoji: "🧬", category: "science", group: "生物科学类", tagline: "遗传的规律——从孟德尔到基因组" },
  "molecular-biology": { label: "分子生物学", emoji: "🧫", category: "science", group: "生物科学类", tagline: "生命的分子机器——复制、转录与翻译" },
  ecology: { label: "生态学", emoji: "🌿", category: "science", group: "生物科学类", tagline: "生物与环境的相互作用——种群、群落与生态系统" },
  "mathematical-statistics": { label: "数理统计", emoji: "📊", category: "science", group: "统计学类", tagline: "从样本推断总体——估计、检验与回归" },
  astrophysics: { label: "天体物理学", emoji: "🌌", category: "science", group: "天文学类", tagline: "恒星的生老病死与宇宙的演化" },
  "cognitive-psychology": { label: "认知心理学", emoji: "🧠", category: "science", group: "心理学类", tagline: "知觉、记忆与思维——心智如何工作" },
  "human-geography": { label: "人文地理学", emoji: "🏙️", category: "science", group: "地理科学类", tagline: "人口、聚落与城市——人类如何塑造地表" },
  "economic-history": { label: "经济思想史", emoji: "📜", category: "economics", group: "经济学类", tagline: "从斯密到凯恩斯——经济学的思想长征" },
  "corporate-finance": { label: "公司金融", emoji: "🏢", category: "economics", group: "金融学类", tagline: "融资、投资与分配——企业的金融决策" },
  investment: { label: "投资学", emoji: "📈", category: "economics", group: "金融学类", tagline: "组合、定价与衍生品——让钱生钱" },
  "international-trade": { label: "国际贸易实务", emoji: "🚢", category: "economics", group: "经济与贸易类", tagline: "术语、结算与合同——把生意做到全球" },
  "administrative-law": { label: "行政法学", emoji: "🏢", category: "law", group: "法学类", tagline: "规范行政权力——许可、处罚与诉讼" },
  "international-law": { label: "国际法学", emoji: "🌐", category: "law", group: "法学类", tagline: "国家之间的法律——条约、海洋与人权" },
  "civil-procedure": { label: "民事诉讼法学", emoji: "🏛️", category: "law", group: "法学类", tagline: "打官司的程序——管辖、证据与执行" },
  "ancient-chinese": { label: "古代汉语", emoji: "📜", category: "literature", group: "中国语言文学类", tagline: "文字、音韵与训诂——读懂古人的语言" },
  "linguistics-intro": { label: "语言学概论", emoji: "🗣️", category: "literature", group: "外国语言文学类", tagline: "语言的科学——语音、语法与语义" },
  "modern-china-history": { label: "中国近现代史", emoji: "🏯", category: "history", group: "历史学类", tagline: "晚清到改革开放——百年中国的巨变" },
  "western-philosophy": { label: "西方哲学史", emoji: "🏛️", category: "philosophy", group: "哲学类", tagline: "从古希腊到当代——西方思想的源流" },
  "chinese-philosophy": { label: "中国哲学史", emoji: "🎋", category: "philosophy", group: "哲学类", tagline: "诸子百家到宋明理学——东方智慧" },
  "machine-design": { label: "机械设计", emoji: "🔩", category: "engineering", group: "机械类", tagline: "连接、传动与轴承——机器的骨架设计" },
  "manufacturing-tech": { label: "机械制造技术基础", emoji: "🏭", category: "engineering", group: "机械类", tagline: "从图纸到零件——切削、工艺与质量" },
  "power-electronics": { label: "电力电子技术", emoji: "🔌", category: "engineering", group: "电气类", tagline: "变流与调制——电能的转换艺术" },
  "digital-circuits": { label: "数字电路", emoji: "🔢", category: "engineering", group: "电子信息类", tagline: "逻辑门到状态机——数字世界的电路" },
  "signals-systems": { label: "信号与系统", emoji: "📶", category: "engineering", group: "电子信息类", tagline: "变换与滤波——信号的分析工具" },
  "modern-control": { label: "现代控制理论", emoji: "🎛️", category: "engineering", group: "自动化类", tagline: "状态空间与最优控制——从经典到现代" },
  "structural-mechanics": { label: "结构力学", emoji: "🏗️", category: "engineering", group: "土木类", tagline: "内力与位移——结构分析的力法位移法" },
  "bridge-engineering": { label: "桥梁工程", emoji: "🌉", category: "engineering", group: "土木类", tagline: "梁桥拱桥到斜拉悬索——跨越的艺术" },
  "heat-transfer": { label: "传热学", emoji: "🔥", category: "engineering", group: "能源动力类", tagline: "导热对流辐射——热量的三种旅行方式" },
  "material-physics": { label: "材料物理与化学", emoji: "🧪", category: "engineering", group: "材料类", tagline: "晶体、缺陷与相变——材料的微观世界" },
  "aircraft-design": { label: "飞行器设计原理", emoji: "🚀", category: "engineering", group: "航空航天类", tagline: "气动、结构与动力——造一架飞机" },
  hydrology: { label: "水文学原理", emoji: "💧", category: "engineering", group: "水利类", tagline: "降水、洪水与地下水——水的循环" },
  "environmental-eng": { label: "环境工程原理", emoji: "♻️", category: "engineering", group: "环境科学与工程类", tagline: "水、气、固废——污染治理的技术" },
  "chemical-reaction-eng": { label: "化学反应工程", emoji: "⚗️", category: "engineering", group: "化工与制药类", tagline: "反应器中的化学——动力学与设计" },
  "traffic-eng": { label: "交通工程学", emoji: "🚦", category: "engineering", group: "交通运输类", tagline: "交通流与信号——让道路更通畅" },
  "internal-medicine": { label: "内科学", emoji: "🫀", category: "medicine", group: "临床医学类", tagline: "呼吸、循环与消化——内科疾病诊治" },
  surgery: { label: "外科学", emoji: "🔪", category: "medicine", group: "临床医学类", tagline: "无菌、麻醉与手术——外科的基本功" },
  diagnostics: { label: "诊断学", emoji: "🩻", category: "medicine", group: "临床医学类", tagline: "问诊、查体与影像——诊断的艺术" },
  "tcm-diagnosis": { label: "中医诊断学", emoji: "🎋", category: "medicine", group: "中医学类", tagline: "四诊与辨证——中医的临床入口" },
  pharmacology: { label: "药理学", emoji: "💊", category: "medicine", group: "药学类", tagline: "药物如何作用于人体——药代与药效" },
  immunology: { label: "免疫学", emoji: "🛡️", category: "medicine", group: "基础医学类", tagline: "免疫系统如何保卫身体——抗原、应答与疫苗" },
  "management-information-systems": { label: "管理信息系统", emoji: "🖥️", category: "management", group: "管理科学与工程类", tagline: "ERP、BI 与 IT 治理——信息时代的组织" },
  "project-management": { label: "项目管理", emoji: "📋", category: "management", group: "管理科学与工程类", tagline: "范围、进度与成本——项目的三角约束" },
  "public-policy": { label: "公共政策分析", emoji: "🏛️", category: "management", group: "公共管理类", tagline: "议程、决策与评估——政策如何诞生" },
  "hr-management": { label: "人力资源管理", emoji: "👥", category: "management", group: "工商管理类", tagline: "选育用留——管好组织最贵的资产" },
  "sketch-basics": { label: "素描基础", emoji: "✏️", category: "art", group: "美术学类", tagline: "透视、明暗与质感——造型的基础" },
  "music-history": { label: "西方音乐史", emoji: "🎻", category: "art", group: "音乐与舞蹈学类", tagline: "从格里高利圣咏到当代——音乐的千年之旅" },
  "color-theory": { label: "色彩学", emoji: "🌈", category: "art", group: "设计学类", tagline: "色彩体系、心理与搭配——设计的语言" },
  "film-history": { label: "电影史", emoji: "🎬", category: "art", group: "戏剧与影视学类", tagline: "从卢米埃尔到当代——电影的一百多年" },
  "crop-science": { label: "作物栽培学", emoji: "🌾", category: "agriculture", group: "植物生产类", tagline: "生长发育与水肥管理——种好庄稼的科学" },
  "soil-science": { label: "土壤学", emoji: "🟤", category: "agriculture", group: "自然保护与环境生态类", tagline: "成土、肥力与改良——大地的皮肤" },
  "animal-nutrition": { label: "动物营养学", emoji: "🐄", category: "agriculture", group: "动物生产类", tagline: "能量、蛋白与配方——喂好动物的学问" },
  "curriculum-teaching": { label: "课程与教学论", emoji: "📚", category: "education", group: "教育学类", tagline: "目标、方法与评价——教学的科学" },
  "exercise-physiology": { label: "运动生理学", emoji: "🏃", category: "education", group: "体育学类", tagline: "供能、肌肉与适应——身体如何响应运动" },
  "real-analysis": { label: "实变函数", emoji: "📐", category: "science", group: "数学类", tagline: "测度与勒贝格积分——分析的现代语言" },
  "functional-analysis": { label: "泛函分析", emoji: "♾️", category: "science", group: "数学类", tagline: "无穷维空间上的分析——现代数学的框架" },
  "differential-geometry": { label: "微分几何", emoji: "🕸️", category: "science", group: "数学类", tagline: "曲线、曲面与曲率——形状的数学" },
  topology: { label: "拓扑学", emoji: "🔗", category: "science", group: "数学类", tagline: "连续变形下的不变性质——橡皮膜几何" },
  "theoretical-mechanics": { label: "理论力学", emoji: "🎡", category: "science", group: "物理学类", tagline: "拉格朗日与哈密顿——力学的优雅形式" },
  electrodynamics: { label: "电动力学", emoji: "🌩️", category: "science", group: "物理学类", tagline: "麦克斯韦方程组与电磁波——电的完整理论" },
  "atomic-physics": { label: "原子物理学", emoji: "⚛️", category: "science", group: "物理学类", tagline: "原子结构与光谱——微观世界的灯塔" },
  "solid-state-physics": { label: "固体物理", emoji: "💎", category: "science", group: "物理学类", tagline: "能带、声子与超导——固体的物理" },
  "polymer-chemistry": { label: "高分子化学", emoji: "🧬", category: "science", group: "化学类", tagline: "聚合、结构与性能——大分子的世界" },
  "structural-chemistry": { label: "结构化学", emoji: "🔬", category: "science", group: "化学类", tagline: "化学键与分子结构——从量子到晶体" },
  biochemistry: { label: "生物化学", emoji: "🧪", category: "medicine", group: "基础医学类", tagline: "酶、代谢与遗传信息——生命的化学" },
  "chemical-synthesis": { label: "有机合成", emoji: "🧫", category: "science", group: "化学类", tagline: "逆合成与手性——分子的搭建艺术" },
  "algorithm-design": { label: "算法设计与分析", emoji: "🧮", category: "engineering", group: "计算机类", tagline: "分治、动态规划与图算法——算法的内功" },
  "computer-architecture": { label: "计算机体系结构", emoji: "🖥️", category: "engineering", group: "计算机类", tagline: "流水线、缓存与并行——硬件的顶层设计" },
  "embedded-systems": { label: "嵌入式系统", emoji: "🔌", category: "engineering", group: "计算机类", tagline: "RTOS、驱动与低功耗——软硬结合的艺术" },
  "machine-learning": { label: "机器学习", emoji: "🤖", category: "engineering", group: "计算机类", tagline: "监督、集成与深度学习——让机器从数据学习" },
  "nlp-intro": { label: "自然语言处理", emoji: "💬", category: "engineering", group: "计算机类", tagline: "从词向量到大语言模型——让机器懂语言" },
  "computer-vision": { label: "计算机视觉", emoji: "👁️", category: "engineering", group: "计算机类", tagline: "检测、分割与生成——让机器看见世界" },
  "big-data": { label: "大数据技术", emoji: "📊", category: "engineering", group: "计算机类", tagline: "Spark、流处理与数仓——数据时代的基建" },
  blockchain: { label: "区块链技术", emoji: "⛓️", category: "engineering", group: "计算机类", tagline: "共识、智能合约与 DeFi——信任的机器" },
  "money-banking": { label: "货币银行学", emoji: "🏦", category: "economics", group: "金融学类", tagline: "货币创造与货币政策——金融体系的枢纽" },
  "industrial-economics": { label: "产业经济学", emoji: "🏭", category: "economics", group: "经济学类", tagline: "结构、行为与绩效——产业如何组织" },
  "development-economics": { label: "发展经济学", emoji: "🌍", category: "economics", group: "经济学类", tagline: "增长、贫困与制度——穷国如何变富" },
  "labor-economics": { label: "劳动经济学", emoji: "👷", category: "economics", group: "经济学类", tagline: "工资、失业与歧视——劳动力市场" },
  pediatrics: { label: "儿科学", emoji: "👶", category: "medicine", group: "临床医学类", tagline: "从新生儿到青春期——孩子的健康" },
  "obstetrics-gynecology": { label: "妇产科学", emoji: "🤰", category: "medicine", group: "临床医学类", tagline: "妊娠、分娩与妇科——女性健康" },
  neurology: { label: "神经病学", emoji: "🧠", category: "medicine", group: "临床医学类", tagline: "脑血管与癫痫——神经系统的疾病" },
  psychiatry: { label: "精神病学", emoji: "🧩", category: "medicine", group: "临床医学类", tagline: "精神症状与心境——心理的疾病" },
  "medical-microbiology": { label: "医学微生物学", emoji: "🦠", category: "medicine", group: "基础医学类", tagline: "细菌、病毒与感染——致病的微生物" },
  pathophysiology: { label: "病理生理学", emoji: "🩸", category: "medicine", group: "基础医学类", tagline: "缺氧、休克与酸碱——疾病如何发生" },
  "intellectual-property-law": { label: "知识产权法学", emoji: "💡", category: "law", group: "法学类", tagline: "著作权、专利与商标——智慧的财产" },
  "commercial-law": { label: "商法学", emoji: "📊", category: "law", group: "法学类", tagline: "公司、证券与破产——商事规则" },
  "economic-law": { label: "经济法学", emoji: "🏦", category: "law", group: "法学类", tagline: "竞争、财税与金融——国家调控的法" },
  "modern-chinese": { label: "现代汉语", emoji: "🗣️", category: "literature", group: "中国语言文学类", tagline: "语音、词汇与语法——汉语的科学" },
  archaeology: { label: "考古学导论", emoji: "🏺", category: "history", group: "历史学类", tagline: "地层、器物与文明——从土里读历史" },
  "educational-technology": { label: "教育技术学", emoji: "💻", category: "education", group: "教育学类", tagline: "课件、在线学习与智能教育——技术赋能教学" },
  "comparative-education": { label: "比较教育学", emoji: "🌍", category: "education", group: "教育学类", tagline: "各国学制与课程——他山之石" },
  "communication-theory": { label: "传播学理论", emoji: "📡", category: "literature", group: "新闻传播学类", tagline: "模式、效果与舆论——传播的规律" },
  "new-media-studies": { label: "新媒体研究", emoji: "📱", category: "literature", group: "新闻传播学类", tagline: "平台、算法与短视频——数字时代的媒介" },
  "plant-protection": { label: "植物保护学", emoji: "🐛", category: "agriculture", group: "植物生产类", tagline: "病、虫、草害与农药——庄稼的医生" },
  horticulture: { label: "园艺学", emoji: "🍎", category: "agriculture", group: "植物生产类", tagline: "果树、蔬菜与花卉——园艺的艺术" },
  silviculture: { label: "森林培育学", emoji: "🌲", category: "agriculture", group: "林学类", tagline: "从种子到森林——培育的技术" },
  "aquaculture-tech": { label: "水产增养殖技术", emoji: "🐟", category: "agriculture", group: "水产类", tagline: "繁殖、池塘与工厂化——向海要粮" },
  aesthetics: { label: "美学", emoji: "🎭", category: "art", group: "艺术学理论类", tagline: "美的本质与审美经验——感受的艺术哲学" },
  "dance-intro": { label: "舞蹈学导论", emoji: "💃", category: "art", group: "音乐与舞蹈学类", tagline: "基本功、流派与编舞——身体的语言" },
  "design-history": { label: "设计史", emoji: "🪑", category: "art", group: "设计学类", tagline: "从工艺美术到数字设计——设计的百年" },
  "strategic-management": { label: "战略管理", emoji: "♟️", category: "management", group: "工商管理类", tagline: "竞争战略与执行——企业往哪去" },
  "consumer-behavior": { label: "消费者行为学", emoji: "🛒", category: "management", group: "工商管理类", tagline: "动机、态度与决策——顾客为什么买" }
};
// 学习路线图（TRACKS）：按专业类（group）定义目标导向的学科顺序。
// 有路线的专业类在门类视图中展示「路线图卡片 + 折叠全部学科」；学科页显示所在路线位置。
const TRACKS = {
  "计算机类": [
    { id: "cs-zero", title: "零基础编程", emoji: "🌱", audience: "从没写过代码", desc: "从第一行代码到独立完成小项目", domains: ["programming-basics", "oop", "ds-algorithms", "software-engineering"] },    { id: "cs-system", title: "系统底层", emoji: "🔧", audience: "想搞懂计算机如何运转", desc: "从离散数学根基到机器如何执行程序", domains: ["discrete-math", "computer-organization", "operating-system", "compiler-principles"] },
    { id: "cs-theory", title: "计算理论", emoji: "🤖", audience: "想理解计算的边界", desc: "自动机、图灵机与 NP 完全性", domains: ["discrete-math", "ds-algorithms", "theory-of-computation"] },
    { id: "cs-network", title: "网络与云端", emoji: "☁️", audience: "后端 / 运维 / 云开发", desc: "从数据到服务，打通互联网全栈", domains: ["discrete-math", "ds-algorithms", "operating-system", "computer-network", "database-system", "distributed-systems"] },
    { id: "cs-ai", title: "人工智能", emoji: "🧠", audience: "想做 AI / 机器学习", desc: "从写代码到训练第一个模型", domains: ["programming-basics", "discrete-math", "ds-algorithms", "ai-intro", "data-science"] },
    { id: "cs-security", title: "网络安全", emoji: "🛡️", audience: "安全攻防方向", desc: "从编程到密码学再到攻防", domains: ["programming-basics", "computer-network", "operating-system", "information-security"] },
    { id: "cs-visual", title: "图形与游戏", emoji: "🎮", audience: "游戏开发 / 图形渲染", desc: "从图形管线到实时渲染", domains: ["programming-basics", "ds-algorithms", "computer-graphics"] },
    { id: "cs-ai-adv", title: "AI 进阶", emoji: "🧠", audience: "想做 AI 工程师", desc: "机器学习到 NLP 与视觉", domains: ["ai-intro", "algorithm-design", "machine-learning", "nlp-intro", "computer-vision"] },
    { id: "cs-arch", title: "系统架构进阶", emoji: "🖥️", audience: "后端 / 架构方向", desc: "体系结构到分布式系统", domains: ["ds-algorithms", "computer-architecture", "operating-system", "distributed-systems"] },
    { id: "cs-bigdata", title: "大数据工程", emoji: "📊", audience: "数据工程方向", desc: "大数据平台与治理", domains: ["database-system", "big-data", "distributed-systems"] }
  ],
  "数学类": [
    { id: "math-core", title: "数学基础主线", emoji: "📐", audience: "所有理科的根基", desc: "分析、代数、统计三大支柱", domains: ["analysis", "linear-algebra", "probability-stats"] },
    { id: "math-abstract", title: "抽象结构方向", emoji: "🔷", audience: "想深入数学之美", desc: "从具体计算走向抽象代数", domains: ["analysis", "linear-algebra", "group-theory"] },
    { id: "math-advance", title: "分析进阶", emoji: "📈", audience: "想走数学/理论物理", desc: "从分析走向微分方程与数值计算", domains: ["analysis", "ode", "complex-analysis", "numerical-analysis"] },
    { id: "math-modern", title: "现代数学方向", emoji: "♾️", audience: "数学专业深造", desc: "从拓扑到泛函的现代框架", domains: ["analysis", "topology", "real-analysis", "functional-analysis"] }
  ],
  "物理学类": [
    { id: "phys-core", title: "经典物理主线", emoji: "⚛️", audience: "物理入门", desc: "从牛顿力学到量子世界", domains: ["mechanics", "electromagnetism", "thermodynamics", "quantum-mechanics"] },
    { id: "phys-advanced", title: "四大力学进阶", emoji: "🌩️", audience: "物理专业深造", desc: "理论力学到电动力学", domains: ["theoretical-mechanics", "electrodynamics", "quantum-mechanics", "solid-state-physics"] }
  ],
  "经济学类": [
    { id: "econ-core", title: "经济学主线", emoji: "🏛️", audience: "看懂经济世界", desc: "微观、宏观到数据检验", domains: ["microeconomics", "macroeconomics", "econometrics"] },
    { id: "econ-thought", title: "思想史脉络", emoji: "📜", audience: "想理解经济学的来龙去脉", desc: "从古典到当代思潮", domains: ["microeconomics", "economic-history"] },
    { id: "econ-applied", title: "应用经济方向", emoji: "🏭", audience: "产业与政策研究", desc: "产业、发展与劳动经济", domains: ["microeconomics", "industrial-economics", "development-economics", "labor-economics"] }
  ],
  "法学类": [
    { id: "law-core", title: "法学主线", emoji: "⚖️", audience: "法学入门", desc: "从法理到部门法", domains: ["jurisprudence", "constitution", "criminal-law", "civil-law", "administrative-law"] },
    { id: "law-procedure", title: "程序法方向", emoji: "🏛️", audience: "想了解诉讼程序", desc: "实体到程序的完整视角", domains: ["jurisprudence", "civil-law", "civil-procedure"] },
    { id: "law-intl", title: "国际法方向", emoji: "🌐", audience: "涉外法律", desc: "国际公法与争端解决", domains: ["jurisprudence", "international-law"] },
    { id: "law-business", title: "商事法方向", emoji: "📊", audience: "商法/知识产权", desc: "商法经济法与知产", domains: ["civil-law", "commercial-law", "economic-law", "intellectual-property-law"] }
  ],
  "化学类": [
    { id: "chem-core", title: "化学主线", emoji: "⚗️", audience: "化学入门", desc: "无机、有机到物化分析", domains: ["inorganic-chemistry", "organic-chemistry", "physical-chemistry", "analytical-chemistry"] },
    { id: "chem-advanced", title: "现代化学方向", emoji: "🧬", audience: "化学专业深造", desc: "结构、合成与高分子", domains: ["organic-chemistry", "chemical-synthesis", "structural-chemistry", "polymer-chemistry"] }
  ],
  "基础医学类": [
    { id: "med-core", title: "医学基础主线", emoji: "🩺", audience: "医学入门", desc: "结构、功能到病理免疫", domains: ["human-anatomy", "physiology", "biochemistry", "pathology-intro", "immunology"] },
    { id: "med-advanced", title: "基础医学进阶", emoji: "🩸", audience: "医学科研方向", desc: "病理生理与微生物", domains: ["physiology", "pathophysiology", "medical-microbiology"] }
  ],
  "工商管理类": [
    { id: "mgmt-core", title: "商科主线", emoji: "📋", audience: "管理入门", desc: "原理、会计到营销", domains: ["management-principle", "accounting-basics", "marketing", "hr-management"] },
    { id: "mgmt-advanced", title: "管理进阶", emoji: "♟️", audience: "管理者/创业者", desc: "战略与消费者行为", domains: ["management-principle", "strategic-management", "consumer-behavior"] }
  ],
  "生物科学类": [
    { id: "bio-core", title: "生命科学主线", emoji: "🧬", audience: "生物学入门", desc: "从生物基础到分子与生态", domains: ["biology-basics", "genetics", "molecular-biology", "ecology"] }
  ],
  "统计学类": [
    { id: "stat-core", title: "统计学主线", emoji: "🎲", audience: "统计与数据方向", desc: "概率、数理统计到应用", domains: ["probability-stats", "mathematical-statistics"] }
  ],
  "天文学类": [
    { id: "astro-core", title: "天文学主线", emoji: "🔭", audience: "天文爱好者", desc: "从天文导论到天体物理", domains: ["astronomy-intro", "astrophysics"] }
  ],
  "心理学类": [
    { id: "psy-core", title: "心理学主线", emoji: "🧠", audience: "想了解人的心理", desc: "基础、认知到教育应用", domains: ["scientific-psychology", "cognitive-psychology", "edu-psychology"] }
  ],
  "哲学类": [
    { id: "phil-core", title: "哲学主线", emoji: "🧠", audience: "哲学入门", desc: "中西哲学史与逻辑", domains: ["philosophy-intro", "western-philosophy", "chinese-philosophy", "logic"] }
  ],
  "中国语言文学类": [
    { id: "cl-core", title: "中国语言文学主线", emoji: "📖", audience: "中文方向", desc: "文学史与汉语并进", domains: ["chinese-lit-history", "modern-chinese", "ancient-chinese"] }
  ],
  "外国语言文学类": [
    { id: "fl-core", title: "外国语言文学主线", emoji: "🌍", audience: "外语方向", desc: "文学与语言学", domains: ["world-lit-history", "linguistics-intro"] }
  ],
  "历史学类": [
    { id: "hist-core", title: "历史学主线", emoji: "🏮", audience: "历史方向", desc: "古代、近现代与世界史", domains: ["ancient-china-history", "archaeology", "modern-china-history", "world-history"] }
  ],
  "金融学类": [
    { id: "fin-core", title: "金融主线", emoji: "💰", audience: "金融方向", desc: "从基础到公司金融与投资", domains: ["finance", "money-banking", "corporate-finance", "investment"] }
  ],
  "经济与贸易类": [
    { id: "trade-core", title: "国际贸易主线", emoji: "🌍", audience: "外贸方向", desc: "从理论到实务", domains: ["international-econ", "international-trade"] }
  ],
  "地理科学类": [
    { id: "geo-core", title: "地理科学主线", emoji: "🗺️", audience: "地理方向", desc: "自然与人文两大视角", domains: ["geography", "human-geography"] }
  ],
  "机械类": [
    { id: "mech-core", title: "机械工程主线", emoji: "⚙️", audience: "机械方向", desc: "从设计到制造", domains: ["mechanical-engineering", "machine-design", "manufacturing-tech"] }
  ],
  "电气类": [
    { id: "elec-core", title: "电气工程主线", emoji: "⚡", audience: "电气方向", desc: "从电路到电力电子", domains: ["circuit-basics", "power-electronics"] }
  ],
  "电子信息类": [
    { id: "ee-core", title: "电子信息主线", emoji: "📡", audience: "电子方向", desc: "从基础到数字与信号", domains: ["electronic-information", "digital-circuits", "signals-systems"] }
  ],
  "自动化类": [
    { id: "auto-core", title: "自动化主线", emoji: "🎛️", audience: "控制方向", desc: "经典到现代控制", domains: ["automatic-control", "modern-control"] }
  ],
  "土木类": [
    { id: "civil-core", title: "土木工程主线", emoji: "🏗️", audience: "土木方向", desc: "结构分析与桥梁", domains: ["civil-engineering", "structural-mechanics", "bridge-engineering"] }
  ],
  "能源动力类": [
    { id: "energy-core", title: "能源动力主线", emoji: "🔥", audience: "能源方向", desc: "从工程基础到传热", domains: ["energy-power", "heat-transfer"] }
  ],
  "材料类": [
    { id: "mat-core", title: "材料科学主线", emoji: "🧪", audience: "材料方向", desc: "从基础到微观物理", domains: ["materials-science", "material-physics"] }
  ],
  "航空航天类": [
    { id: "aero-core", title: "航空航天主线", emoji: "🚀", audience: "航空方向", desc: "从概论到飞行器设计", domains: ["aerospace", "aircraft-design"] }
  ],
  "水利类": [
    { id: "hydro-core", title: "水利工程主线", emoji: "💧", audience: "水利方向", desc: "从导论到水文学", domains: ["hydraulic-engineering", "hydrology"] }
  ],
  "环境科学与工程类": [
    { id: "env-core", title: "环境工程主线", emoji: "♻️", audience: "环境方向", desc: "从概论到治理技术", domains: ["environmental-science", "environmental-eng"] }
  ],
  "化工与制药类": [
    { id: "chemeng-core", title: "化工主线", emoji: "⚗️", audience: "化工方向", desc: "从基础到反应工程", domains: ["chemical-engineering", "chemical-reaction-eng"] }
  ],
  "交通运输类": [
    { id: "transport-core", title: "交通运输主线", emoji: "🚦", audience: "交通方向", desc: "从工程到交通流", domains: ["transportation", "traffic-eng"] }
  ],
  "临床医学类": [
    { id: "clin-core", title: "临床医学主线", emoji: "🩺", audience: "临床方向", desc: "从诊断到内外妇儿", domains: ["clinical-medicine", "diagnostics", "internal-medicine", "surgery", "pediatrics"] }
  ],
  "中医学类": [
    { id: "tcm-core", title: "中医主线", emoji: "🎋", audience: "中医方向", desc: "从导论到辨证", domains: ["tcm", "tcm-diagnosis"] }
  ],
  "药学类": [
    { id: "pharm-core", title: "药学主线", emoji: "💊", audience: "药学方向", desc: "从导论到药理", domains: ["pharmacy", "pharmacology"] }
  ],
  "管理科学与工程类": [
    { id: "mse-core", title: "管理科学主线", emoji: "🧮", audience: "管理工程方向", desc: "运筹、信息与项目", domains: ["management-science", "management-information-systems", "project-management"] }
  ],
  "公共管理类": [
    { id: "pa-core", title: "公共管理主线", emoji: "🏛️", audience: "公共部门方向", desc: "从导论到政策分析", domains: ["public-administration", "public-policy"] }
  ],
  "美术学类": [
    { id: "art-core", title: "美术主线", emoji: "🎨", audience: "美术方向", desc: "从史论到造型基础", domains: ["art-history", "sketch-basics"] }
  ],
  "音乐与舞蹈学类": [
    { id: "music-core", title: "音乐舞蹈主线", emoji: "🎼", audience: "音乐舞蹈方向", desc: "乐理、音乐史与舞蹈", domains: ["music-theory", "music-history", "dance-intro"] }
  ],
  "设计学类": [
    { id: "design-core", title: "设计主线", emoji: "✏️", audience: "设计方向", desc: "设计导论、色彩与设计史", domains: ["design", "color-theory", "design-history"] }
  ],
  "戏剧与影视学类": [
    { id: "film-core", title: "影视主线", emoji: "🎬", audience: "影视方向", desc: "从导论到电影史", domains: ["film-theater", "film-history"] }
  ],
  "植物生产类": [
    { id: "crop-core", title: "农学主线", emoji: "🌾", audience: "农学方向", desc: "从概论到栽培学", domains: ["agronomy-intro", "crop-science"] }
  ],
  "自然保护与环境生态类": [
    { id: "soil-core", title: "生态保护主线", emoji: "🟤", audience: "生态方向", desc: "从保护到土壤学", domains: ["nature-conservation", "soil-science"] }
  ],
  "动物生产类": [
    { id: "animal-core", title: "动物科学主线", emoji: "🐄", audience: "畜牧方向", desc: "从生产到营养学", domains: ["animal-science", "animal-nutrition"] }
  ],
  "教育学类": [
    { id: "edu-core", title: "教育学主线", emoji: "🎓", audience: "教育方向", desc: "从原理到课程教学", domains: ["education-principle", "curriculum-teaching", "educational-technology"] }
  ],
  "体育学类": [
    { id: "sport-core", title: "体育科学主线", emoji: "🏃", audience: "体育方向", desc: "从导论到运动生理", domains: ["sports-science", "exercise-physiology"] }
  ],
  "新闻传播学类": [
    { id: "comm-core", title: "新闻传播主线", emoji: "📰", audience: "传媒方向", desc: "从概论到传播理论", domains: ["journalism-communication", "communication-theory", "new-media-studies"] }
  ],
  "林学类": [
    { id: "forest-core", title: "林学主线", emoji: "🌲", audience: "林业方向", desc: "从概论到森林培育", domains: ["forestry", "silviculture"] }
  ],
  "水产类": [
    { id: "aqua-core", title: "水产养殖主线", emoji: "🐟", audience: "水产方向", desc: "从导论到增养殖技术", domains: ["aquaculture", "aquaculture-tech"] }
  ],
  "艺术学理论类": [
    { id: "art-theory-core", title: "艺术理论主线", emoji: "🎭", audience: "艺术理论方向", desc: "从概论到美学", domains: ["art-introduction", "aesthetics"] }
  ]
};

// ===== 自适应题量引擎 =====
export { CATEGORIES, DOMAIN_META, TRACKS };
