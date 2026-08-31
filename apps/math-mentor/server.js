"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 4617;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
// 学习进度与插件同目录。全局安装则跟用户走，不按当前打开的项目拆库。
const DATA_DIR = path.join(ROOT, "data");
const ASSETS_DIR = path.join(ROOT, "assets");
const DB_PATH = path.join(DATA_DIR, "learning.db");
// 项目根目录（工作区）：优先环境变量，回退按目录结构推导（apps/<appId> → 项目根）
const PROJECT_ROOT = process.env.PAPR_WORKSPACE || process.env.CODEPAPR_WORKSPACE || path.resolve(__dirname, "../../..");
// 导出文件在项目内的落盘目录：用户在 CodePapr 文件树中可直接打开/下载，不依赖浏览器下载机制
const PROJECT_EXPORTS_DIR = path.join(PROJECT_ROOT, ".CodePapr", "exports");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, domain TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT DEFAULT '', difficulty REAL DEFAULT 0.5,
  prereqs TEXT DEFAULT '[]', sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mastery (
  skill_id TEXT PRIMARY KEY REFERENCES skills(id),
  mastery REAL DEFAULT 0.3, confidence REAL DEFAULT 0.5,
  attempts INTEGER DEFAULT 0, correct INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0, last_practiced TEXT DEFAULT '',
  next_review TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS diagnosis (
  domain TEXT PRIMARY KEY, profile TEXT DEFAULT '{}', summary TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL,
  skill_id TEXT NOT NULL, difficulty REAL DEFAULT 0.5,
  qtype TEXT DEFAULT 'calculation', content TEXT NOT NULL,
  answer TEXT DEFAULT '', explanation TEXT DEFAULT '',
  options TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL,
  user_answer TEXT DEFAULT '', correct INTEGER DEFAULT 0,
  hint_used INTEGER DEFAULT 0, error_type TEXT DEFAULT 'none',
  feedback TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT DEFAULT '',
  event_type TEXT NOT NULL, detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lessons (
  skill_id TEXT PRIMARY KEY, content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lesson_sections (
  skill_id TEXT NOT NULL, seq INTEGER NOT NULL,
  title TEXT DEFAULT '', content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (skill_id, seq)
);
CREATE TABLE IF NOT EXISTS intros (
  domain TEXT PRIMARY KEY, content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS custom_topics (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, emoji TEXT DEFAULT '🎨',
  tagline TEXT DEFAULT '', outline TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// 老库迁移：选择题选项列（新库已在 CREATE TABLE 中）
try { db.exec("ALTER TABLE questions ADD COLUMN options TEXT DEFAULT ''"); } catch (e) { /* 列已存在 */ }

// ---------- 知识图谱种子数据（经网络检索验证的课程结构） ----------
const SEED = [
  // 数学分析：实数系/极限 → 连续/微分 → 积分 → 级数（北大数学分析课程结构）
  { id: "real-numbers", domain: "analysis", name: "实数系与完备性", difficulty: 0.25, prereqs: [],
    description: "确界原理、单调有界定理、闭区间套定理、Cauchy 收敛准则、Bolzano-Weierstrass 定理" },
  { id: "sequence-limit", domain: "analysis", name: "数列极限", difficulty: 0.3, prereqs: ["real-numbers"],
    description: "ε-N 语言、收敛数列的性质、极限四则运算、夹逼准则、单调有界定理" },
  { id: "function-limit", domain: "analysis", name: "函数极限", difficulty: 0.35, prereqs: ["sequence-limit"],
    description: "ε-δ 语言、左右极限、函数极限与数列极限的关系（海涅定理）" },
  { id: "continuity", domain: "analysis", name: "连续函数", difficulty: 0.4, prereqs: ["function-limit"],
    description: "连续性定义、间断点分类、闭区间上连续函数的性质（零点定理、介值定理、最值定理）" },
  { id: "derivative", domain: "analysis", name: "导数与微分", difficulty: 0.42, prereqs: ["function-limit", "continuity"],
    description: "导数定义与几何意义、求导法则、链式法则、反函数求导、微分的概念" },
  { id: "mvt", domain: "analysis", name: "微分中值定理", difficulty: 0.55, prereqs: ["derivative", "continuity"],
    description: "Rolle 定理、Lagrange 中值定理、Cauchy 中值定理、L'Hôpital 法则、Taylor 展开" },
  { id: "riemann-integral", domain: "analysis", name: "黎曼积分", difficulty: 0.6, prereqs: ["continuity", "mvt"],
    description: "分割与 Riemann 和、可积性条件、积分中值定理、微积分基本定理、换元与分部积分" },
  { id: "series", domain: "analysis", name: "级数理论", difficulty: 0.68, prereqs: ["sequence-limit", "continuity"],
    description: "数项级数的收敛判别、绝对收敛与条件收敛、幂级数、一致收敛" },
  // 群论：群定义 → 子群/循环群 → 陪集/拉格朗日 → 同态 → 正规子群/商群
  { id: "binary-op", domain: "group-theory", name: "集合与二元运算", difficulty: 0.2, prereqs: [],
    description: "映射、单射/满射/双射、二元运算、结合律与交换律、单位元与逆元的初步概念" },
  { id: "group-def", domain: "group-theory", name: "群的定义与性质", difficulty: 0.3, prereqs: ["binary-op"],
    description: "群的四条公理、单位元与逆元的唯一性、消去律、群的例子（Z、R*、对称群 S3）" },
  { id: "subgroup", domain: "group-theory", name: "子群", difficulty: 0.38, prereqs: ["group-def"],
    description: "子群的定义、子群判定定理、子群的交、生成子群、元素的阶" },
  { id: "cyclic", domain: "group-theory", name: "循环群", difficulty: 0.45, prereqs: ["subgroup"],
    description: "循环群的定义、循环群的分类（Z 与 Z_n）、生成元、循环群的子群" },
  { id: "coset-lagrange", domain: "group-theory", name: "陪集与 Lagrange 定理", difficulty: 0.5, prereqs: ["subgroup"],
    description: "左陪集与右陪集、陪集的性质、指数 [G:H]、Lagrange 定理 |G| = |H|·[G:H] 及其推论" },
  { id: "homomorphism", domain: "group-theory", name: "群同态与同构", difficulty: 0.55, prereqs: ["group-def", "subgroup"],
    description: "同态的定义、核与像、同构、同态基本性质" },
  { id: "normal-quotient", domain: "group-theory", name: "正规子群与商群", difficulty: 0.65, prereqs: ["coset-lagrange", "homomorphism"],
    description: "正规子群的定义与判定、商群的构造、第一同构定理" },
  // 线性代数：方程组/矩阵 → 行列式/向量空间 → 线性无关/线性映射 → 特征值（同济线代课程结构）
  { id: "linear-systems", domain: "linear-algebra", name: "线性方程组与高斯消元", difficulty: 0.2, prereqs: [],
    description: "方程组的几何含义（直线/平面相交）、增广矩阵、高斯消元与行阶梯形、解的存在性与唯一性" },
  { id: "matrix-ops", domain: "linear-algebra", name: "矩阵及其运算", difficulty: 0.25, prereqs: ["linear-systems"],
    description: "矩阵的加减、数乘与乘法、转置、逆矩阵的初步概念、矩阵乘法为什么这样定义" },
  { id: "determinant", domain: "linear-algebra", name: "行列式", difficulty: 0.42, prereqs: ["matrix-ops"],
    description: "二三阶行列式的几何意义（面积/体积）、行列式性质、按行展开、Cramer 法则" },
  { id: "vector-space", domain: "linear-algebra", name: "向量空间", difficulty: 0.4, prereqs: ["matrix-ops"],
    description: "向量空间八条公理、子空间、常见例子（Rn、多项式、函数空间）" },
  { id: "linear-independence", domain: "linear-algebra", name: "线性相关与基", difficulty: 0.48, prereqs: ["vector-space"],
    description: "线性组合、线性相关与无关、基与维数、坐标表示" },
  { id: "linear-map", domain: "linear-algebra", name: "线性映射与矩阵表示", difficulty: 0.55, prereqs: ["linear-independence"],
    description: "线性映射的定义、核与像、维数公式、线性映射的矩阵表示" },
  { id: "eigen", domain: "linear-algebra", name: "特征值与特征向量", difficulty: 0.62, prereqs: ["linear-map", "determinant"],
    description: "特征值与特征向量的定义与求法、特征多项式、可对角化条件、应用（矩阵幂、动力学）" },
  // 概率论与数理统计：公理 → 条件概率 → 随机变量 → 期望 → 极限定理 / 估计 → 检验
  { id: "prob-space", domain: "probability-stats", name: "样本空间与概率公理", difficulty: 0.25, prereqs: [],
    description: "随机试验与样本空间、事件、概率的三条公理、古典概型与几何概型" },
  { id: "conditional", domain: "probability-stats", name: "条件概率与独立性", difficulty: 0.35, prereqs: ["prob-space"],
    description: "条件概率、乘法公式、全概率公式、贝叶斯定理、事件的独立性" },
  { id: "random-var", domain: "probability-stats", name: "随机变量与分布", difficulty: 0.4, prereqs: ["conditional"],
    description: "离散与连续随机变量、分布列与密度函数、常见分布（二项、泊松、均匀、正态）" },
  { id: "expectation", domain: "probability-stats", name: "期望与方差", difficulty: 0.45, prereqs: ["random-var"],
    description: "数学期望的直观含义、方差与标准差、期望的线性性质、常用分布的期望方差" },
  { id: "limit-theorems", domain: "probability-stats", name: "大数定律与中心极限定理", difficulty: 0.62, prereqs: ["expectation"],
    description: "切比雪夫不等式、大数定律的直观、中心极限定理及其应用" },
  { id: "estimation", domain: "probability-stats", name: "参数估计", difficulty: 0.55, prereqs: ["random-var"],
    description: "点估计（矩估计、极大似然估计）、估计量的评价、区间估计与置信区间" },
  { id: "hypothesis-test", domain: "probability-stats", name: "假设检验", difficulty: 0.65, prereqs: ["estimation", "limit-theorems"],
    description: "原假设与备择假设、显著性水平与两类错误、z 检验与 t 检验、p 值" },
  // 大学物理·力学：运动学 → 牛顿定律 → 功能/动量 → 刚体/振动
  { id: "kinematics", domain: "mechanics", name: "质点运动学", difficulty: 0.25, prereqs: [],
    description: "位置、位移、速度、加速度；直线与抛体运动；用微积分描述运动" },
  { id: "newtons-laws", domain: "mechanics", name: "牛顿运动定律", difficulty: 0.3, prereqs: ["kinematics"],
    description: "牛顿三定律、受力分析、常见的力（重力、弹力、摩擦力）、用牛顿定律解题" },
  { id: "work-energy", domain: "mechanics", name: "功与机械能", difficulty: 0.4, prereqs: ["newtons-laws"],
    description: "功的定义、动能定理、势能与机械能守恒、功率" },
  { id: "momentum", domain: "mechanics", name: "动量与角动量", difficulty: 0.45, prereqs: ["newtons-laws"],
    description: "动量与冲量、动量守恒、碰撞、角动量初步" },
  { id: "rigid-body", domain: "mechanics", name: "刚体定轴转动", difficulty: 0.6, prereqs: ["momentum"],
    description: "转动惯量、转动定律、角动量守恒、滚动" },
  { id: "oscillation", domain: "mechanics", name: "振动与波", difficulty: 0.55, prereqs: ["newtons-laws"],
    description: "简谐振动、单摆与弹簧振子、阻尼与受迫振动初步、机械波" },
  // 电磁学：静电场 → 电势/高斯 → 电路 → 磁场 → 安培定理 → 法拉第感应
  { id: "electrostatics", domain: "electromagnetism", name: "静电场与库仑定律", difficulty: 0.3, prereqs: [],
    description: "电荷与电荷守恒、库仑定律、电场强度、电场线" },
  { id: "electric-potential", domain: "electromagnetism", name: "电势", difficulty: 0.45, prereqs: ["electrostatics"],
    description: "电势能与电势、电势差与电场的关系、等势面" },
  { id: "gauss-law", domain: "electromagnetism", name: "高斯定理", difficulty: 0.48, prereqs: ["electrostatics"],
    description: "电通量、高斯定理、用高斯定理求对称带电体的电场" },
  { id: "circuits", domain: "electromagnetism", name: "电流与电路", difficulty: 0.42, prereqs: ["electric-potential"],
    description: "电流、电阻与欧姆定律、基尔霍夫定律、简单电路分析" },
  { id: "magnetic-field", domain: "electromagnetism", name: "磁场与洛伦兹力", difficulty: 0.5, prereqs: ["circuits"],
    description: "磁场、安培力、洛伦兹力、带电粒子在磁场中的运动" },
  { id: "ampere-law", domain: "electromagnetism", name: "安培环路定理", difficulty: 0.55, prereqs: ["magnetic-field"],
    description: "毕奥-萨伐尔定律、安培环路定理、常见载流导线的磁场" },
  { id: "faraday", domain: "electromagnetism", name: "法拉第电磁感应", difficulty: 0.6, prereqs: ["ampere-law"],
    description: "磁通量与法拉第定律、楞次定律、动生与感生电动势" },
  // 数据结构与算法：基础结构/复杂度 → 排序/树 → 堆哈希/图/DP
  { id: "linear-ds", domain: "ds-algorithms", name: "数组链表栈队列", difficulty: 0.2, prereqs: [],
    description: "数组与链表的差异、栈的后进先出、队列的先进先出、常见操作复杂度" },
  { id: "complexity", domain: "ds-algorithms", name: "复杂度分析", difficulty: 0.25, prereqs: [],
    description: "大 O 记号、最好/最坏/平均复杂度、常见复杂度量级比较" },
  { id: "sorting", domain: "ds-algorithms", name: "排序算法", difficulty: 0.4, prereqs: ["complexity"],
    description: "冒泡、插入、归并、快速排序的思想与复杂度、稳定性" },
  { id: "tree", domain: "ds-algorithms", name: "树与二叉树", difficulty: 0.42, prereqs: ["linear-ds"],
    description: "树的基本概念、二叉树的遍历、二叉搜索树、平衡树初步" },
  { id: "heap-hash", domain: "ds-algorithms", name: "堆与哈希表", difficulty: 0.48, prereqs: ["tree"],
    description: "堆与优先队列、哈希函数与冲突解决、哈希表复杂度" },
  { id: "graph-algo", domain: "ds-algorithms", name: "图与图算法", difficulty: 0.6, prereqs: ["tree", "sorting"],
    description: "图的表示、BFS/DFS、最短路径（Dijkstra）、拓扑排序" },
  { id: "dp", domain: "ds-algorithms", name: "动态规划与贪心", difficulty: 0.6, prereqs: ["complexity", "tree"],
    description: "最优子结构与重叠子问题、经典 DP 例子（背包、爬楼梯）、贪心适用条件" },
  // 微观经济学：供需 → 弹性 → 消费者/厂商 → 市场结构 → 博弈论
  { id: "supply-demand", domain: "microeconomics", name: "供给与需求", difficulty: 0.2, prereqs: [],
    description: "需求曲线与供给曲线、市场均衡、均衡的变动分析" },
  { id: "elasticity", domain: "microeconomics", name: "弹性", difficulty: 0.32, prereqs: ["supply-demand"],
    description: "需求价格弹性、弹性与总收益、收入弹性与交叉弹性" },
  { id: "consumer-theory", domain: "microeconomics", name: "消费者理论", difficulty: 0.42, prereqs: ["supply-demand"],
    description: "效用与边际效用、预算约束、无差异曲线与最优选择、收入效应与替代效应" },
  { id: "producer-theory", domain: "microeconomics", name: "厂商理论", difficulty: 0.45, prereqs: ["supply-demand"],
    description: "生产成本（固定/可变/边际）、利润最大化、短期与长期" },
  { id: "market-structure", domain: "microeconomics", name: "市场结构", difficulty: 0.52, prereqs: ["consumer-theory", "producer-theory"],
    description: "完全竞争、垄断、寡头与垄断竞争的特征与效率比较" },
  { id: "game-theory", domain: "microeconomics", name: "博弈论基础", difficulty: 0.58, prereqs: ["market-structure"],
    description: "博弈的表示、占优策略、纳什均衡、囚徒困境与重复博弈" },
  // 宏观经济学：GDP/通胀/货币 → AD-AS → 财政货币 → 增长
  { id: "gdp", domain: "macroeconomics", name: "国民经济核算与 GDP", difficulty: 0.2, prereqs: [],
    description: "GDP 的定义与三种核算方法、名义与实际 GDP、GDP 的局限" },
  { id: "inflation", domain: "macroeconomics", name: "通货膨胀与失业", difficulty: 0.3, prereqs: ["gdp"],
    description: "CPI 与通胀率、通货膨胀的类型、失业率、菲利普斯曲线初步" },
  { id: "money", domain: "macroeconomics", name: "货币与银行体系", difficulty: 0.35, prereqs: [],
    description: "货币的职能与层次（M0/M1/M2）、货币乘数、中央银行" },
  { id: "aggregate-model", domain: "macroeconomics", name: "总需求与总供给", difficulty: 0.45, prereqs: ["gdp", "inflation"],
    description: "AD-AS 模型、短期与长期均衡、总需求曲线的移动" },
  { id: "fiscal-policy", domain: "macroeconomics", name: "财政政策", difficulty: 0.5, prereqs: ["aggregate-model"],
    description: "政府支出与税收、乘数效应、挤出效应" },
  { id: "monetary-policy", domain: "macroeconomics", name: "货币政策", difficulty: 0.5, prereqs: ["money", "aggregate-model"],
    description: "利率与公开市场操作、货币政策传导、量化宽松" },
  { id: "growth", domain: "macroeconomics", name: "经济增长", difficulty: 0.55, prereqs: ["gdp"],
    description: "增长核算、索洛模型初步、技术进步的作用" },
  // 金融学基础：时间价值 → 利率债券 → 风险收益 → 组合 → CAPM → 有效市场
  { id: "time-value", domain: "finance", name: "货币时间价值", difficulty: 0.2, prereqs: [],
    description: "现值与终值、贴现、复利与年金" },
  { id: "interest-rate", domain: "finance", name: "利率与债券", difficulty: 0.32, prereqs: ["time-value"],
    description: "利率的决定、债券定价、收益率与久期初步" },
  { id: "risk-return", domain: "finance", name: "风险与收益", difficulty: 0.4, prereqs: ["time-value"],
    description: "收益率的度量、风险的度量（方差/标准差）、风险偏好" },
  { id: "portfolio", domain: "finance", name: "投资组合与分散化", difficulty: 0.48, prereqs: ["risk-return"],
    description: "组合的收益与风险、分散化原理、有效前沿初步" },
  { id: "capm", domain: "finance", name: "资本资产定价模型", difficulty: 0.55, prereqs: ["portfolio"],
    description: "市场组合与贝塔、CAPM 公式、证券市场线" },
  { id: "market-efficiency", domain: "finance", name: "有效市场假说", difficulty: 0.58, prereqs: ["capm"],
    description: "三种有效性、市场异象、行为金融初步" },
  // 操作系统：概述 → 进程/调度/同步 → 内存/文件/IO
  { id: "os-overview", domain: "operating-system", name: "操作系统概述", difficulty: 0.2, prereqs: [],
    description: "操作系统的职能、内核与用户态、系统调用" },
  { id: "process", domain: "operating-system", name: "进程与线程", difficulty: 0.3, prereqs: ["os-overview"],
    description: "进程状态与 PCB、线程与进程的区别、上下文切换" },
  { id: "cpu-scheduling", domain: "operating-system", name: "CPU 调度", difficulty: 0.4, prereqs: ["process"],
    description: "调度指标、FCFS/SJF/轮转/优先级调度" },
  { id: "synchronization", domain: "operating-system", name: "同步与死锁", difficulty: 0.5, prereqs: ["process"],
    description: "互斥与信号量、经典同步问题、死锁四条件与预防" },
  { id: "memory-mgmt", domain: "operating-system", name: "内存管理", difficulty: 0.48, prereqs: ["os-overview"],
    description: "虚拟内存、分页与分段、页表与缺页" },
  { id: "file-system", domain: "operating-system", name: "文件系统", difficulty: 0.5, prereqs: ["os-overview"],
    description: "文件与目录、inode 与 FAT、磁盘调度" },
  { id: "io-device", domain: "operating-system", name: "I/O 与设备管理", difficulty: 0.55, prereqs: ["memory-mgmt", "file-system"],
    description: "中断与 DMA、设备驱动程序、缓冲区" },
  // 哲学：基本问题 → 古希腊/近代 → 伦理/美学/中国哲学
  { id: "philo-basics", domain: "philosophy-intro", name: "哲学的基本问题", difficulty: 0.2, prereqs: [],
    description: "哲学是什么、本体论/认识论/价值论三大领域、哲学与科学宗教的关系" },
  { id: "greek-philosophy", domain: "philosophy-intro", name: "古希腊哲学", difficulty: 0.3, prereqs: ["philo-basics"],
    description: "苏格拉底、柏拉图理念论、亚里士多德、前苏格拉底学派" },
  { id: "modern-philosophy", domain: "philosophy-intro", name: "近代哲学", difficulty: 0.4, prereqs: ["philo-basics"],
    description: "笛卡尔我思、经验论与唯理论、康德批判哲学" },
  { id: "ethics", domain: "philosophy-intro", name: "伦理学导论", difficulty: 0.35, prereqs: ["philo-basics"],
    description: "功利主义、义务论、德性伦理、道德困境" },
  { id: "aesthetics", domain: "philosophy-intro", name: "美学导论", difficulty: 0.45, prereqs: ["philo-basics"],
    description: "美的本质、审美经验、艺术哲学的基本问题" },
  { id: "chinese-philosophy", domain: "philosophy-intro", name: "中国哲学史", difficulty: 0.4, prereqs: ["philo-basics"],
    description: "先秦诸子、魏晋玄学、宋明理学、近代转型" },
  { id: "prop-logic", domain: "logic", name: "命题逻辑", difficulty: 0.2, prereqs: [],
    description: "命题与联结词、真值表、重言式、基本推理规则" },
  { id: "pred-logic", domain: "logic", name: "谓词逻辑", difficulty: 0.35, prereqs: ["prop-logic"],
    description: "量词、谓词公式、解释与真值" },
  { id: "deduction", domain: "logic", name: "演绎推理", difficulty: 0.3, prereqs: ["prop-logic"],
    description: "三段论、直接推理、自然演绎系统" },
  { id: "induction-fallacy", domain: "logic", name: "归纳与谬误", difficulty: 0.4, prereqs: ["deduction"],
    description: "枚举归纳、类比推理、常见逻辑谬误" },
  { id: "argumentation", domain: "logic", name: "论证分析", difficulty: 0.45, prereqs: ["deduction"],
    description: "论证结构、论据与论题、批判性思维" },
  { id: "paradoxes", domain: "logic", name: "悖论", difficulty: 0.55, prereqs: ["pred-logic", "argumentation"],
    description: "说谎者悖论、集合论悖论、悖论的哲学意义" },
  // 经济学新增：国际经济学 + 计量经济学
  { id: "trade-theory", domain: "international-econ", name: "国际贸易理论", difficulty: 0.3, prereqs: [],
    description: "绝对优势、比较优势、要素禀赋理论" },
  { id: "trade-policy", domain: "international-econ", name: "关税与贸易政策", difficulty: 0.4, prereqs: ["trade-theory"],
    description: "关税的福利效应、配额、贸易保护争论" },
  { id: "exchange-rate", domain: "international-econ", name: "汇率", difficulty: 0.42, prereqs: [],
    description: "汇率制度、购买力平价、利率平价" },
  { id: "bop", domain: "international-econ", name: "国际收支", difficulty: 0.45, prereqs: ["exchange-rate"],
    description: "经常账户与资本账户、失衡与调整机制" },
  { id: "open-macro", domain: "international-econ", name: "开放经济宏观", difficulty: 0.55, prereqs: ["bop", "trade-theory"],
    description: "开放经济下的政策搭配、内外均衡" },
  { id: "ols", domain: "econometrics", name: "回归分析与 OLS", difficulty: 0.3, prereqs: [],
    description: "一元回归、OLS 估计、拟合优度" },
  { id: "inference", domain: "econometrics", name: "统计推断", difficulty: 0.4, prereqs: ["ols"],
    description: "t 检验、置信区间、F 检验" },
  { id: "violations", domain: "econometrics", name: "模型诊断", difficulty: 0.5, prereqs: ["inference"],
    description: "多重共线性、异方差、自相关" },
  { id: "model-spec", domain: "econometrics", name: "模型设定", difficulty: 0.5, prereqs: ["violations"],
    description: "遗漏变量、函数形式、虚拟变量" },
  { id: "time-series", domain: "econometrics", name: "时间序列初步", difficulty: 0.55, prereqs: ["inference"],
    description: "平稳性、自回归、协整初步" },
  { id: "panel", domain: "econometrics", name: "面板数据初步", difficulty: 0.6, prereqs: ["time-series", "violations"],
    description: "固定效应、随机效应" },
  // 法学：法理学/宪法/刑法/民法
  { id: "law-concept", domain: "jurisprudence", name: "法的概念", difficulty: 0.2, prereqs: [],
    description: "法的定义与特征、法律与道德、法的本质学说" },
  { id: "law-source", domain: "jurisprudence", name: "法的渊源与效力", difficulty: 0.3, prereqs: ["law-concept"],
    description: "制定法与判例法、法律位阶、法的效力" },
  { id: "legal-system", domain: "jurisprudence", name: "法律体系", difficulty: 0.35, prereqs: ["law-concept"],
    description: "法律部门、公法与私法、两大法系" },
  { id: "rights-duties", domain: "jurisprudence", name: "权利与义务", difficulty: 0.4, prereqs: ["law-concept"],
    description: "权利的分类、义务与责任、法律关系" },
  { id: "rule-of-law", domain: "jurisprudence", name: "法治", difficulty: 0.45, prereqs: ["legal-system"],
    description: "法治原则、法治与人治、程序正义" },
  { id: "constitution-basics", domain: "constitution", name: "宪法基本理论", difficulty: 0.25, prereqs: [],
    description: "宪法的概念与特征、制宪权、宪法修改" },
  { id: "state-nature", domain: "constitution", name: "国家性质与形式", difficulty: 0.35, prereqs: ["constitution-basics"],
    description: "国体与政体、国家结构形式" },
  { id: "fundamental-rights", domain: "constitution", name: "公民基本权利", difficulty: 0.4, prereqs: ["constitution-basics"],
    description: "平等权、自由权、社会经济文化权利" },
  { id: "state-organs", domain: "constitution", name: "国家机构", difficulty: 0.45, prereqs: ["state-nature"],
    description: "权力机关、行政机关、司法机关" },
  { id: "election", domain: "constitution", name: "选举制度", difficulty: 0.4, prereqs: ["constitution-basics"],
    description: "选举基本原则、选举程序" },
  { id: "constitution-review", domain: "constitution", name: "宪法实施与监督", difficulty: 0.55, prereqs: ["state-organs"],
    description: "合宪性审查、宪法解释" },
  { id: "criminal-basics", domain: "criminal-law", name: "刑法基本原则", difficulty: 0.2, prereqs: [],
    description: "罪刑法定、适用平等、罪责刑相适应" },
  { id: "crime-const", domain: "criminal-law", name: "犯罪构成", difficulty: 0.35, prereqs: ["criminal-basics"],
    description: "四要件理论、犯罪客体与主体、主观方面" },
  { id: "self-defense", domain: "criminal-law", name: "正当防卫与紧急避险", difficulty: 0.4, prereqs: ["crime-const"],
    description: "正当防卫条件、防卫过当、紧急避险" },
  { id: "attempted-crime", domain: "criminal-law", name: "故意犯罪停止形态", difficulty: 0.45, prereqs: ["crime-const"],
    description: "犯罪预备、犯罪未遂、犯罪中止" },
  { id: "joint-crime", domain: "criminal-law", name: "共同犯罪", difficulty: 0.45, prereqs: ["crime-const"],
    description: "共犯分类、主犯与从犯、教唆犯" },
  { id: "penalty", domain: "criminal-law", name: "刑罚体系", difficulty: 0.5, prereqs: ["joint-crime"],
    description: "主刑与附加刑、量刑情节、数罪并罚" },
  { id: "civil-basics", domain: "civil-law", name: "民法基本原则", difficulty: 0.2, prereqs: [],
    description: "平等自愿、诚实信用、公序良俗" },
  { id: "civil-subject", domain: "civil-law", name: "民事主体", difficulty: 0.3, prereqs: ["civil-basics"],
    description: "自然人、法人、民事行为能力" },
  { id: "juristic-act", domain: "civil-law", name: "民事法律行为", difficulty: 0.38, prereqs: ["civil-subject"],
    description: "意思表示、行为效力、代理" },
  { id: "property-law", domain: "civil-law", name: "物权", difficulty: 0.45, prereqs: ["juristic-act"],
    description: "所有权、用益物权、担保物权" },
  { id: "contract-law", domain: "civil-law", name: "合同法", difficulty: 0.45, prereqs: ["juristic-act"],
    description: "合同的订立、效力与履行、违约责任" },
  { id: "tort-law", domain: "civil-law", name: "侵权责任", difficulty: 0.5, prereqs: ["civil-subject"],
    description: "归责原则、构成要件、特殊侵权" },
  // 教育学：教育学原理 + 教育心理学
  { id: "edu-concept", domain: "education-principle", name: "教育的概念", difficulty: 0.2, prereqs: [],
    description: "广义与狭义教育、教育的要素、教育与社会发展" },
  { id: "edu-aim", domain: "education-principle", name: "教育目的", difficulty: 0.3, prereqs: ["edu-concept"],
    description: "教育目的理论、全面发展教育" },
  { id: "curriculum", domain: "education-principle", name: "课程理论", difficulty: 0.35, prereqs: ["edu-concept"],
    description: "课程类型、课程编制、课程标准" },
  { id: "teaching-theory", domain: "education-principle", name: "教学理论", difficulty: 0.4, prereqs: ["curriculum"],
    description: "教学过程、教学原则、教学方法" },
  { id: "moral-edu", domain: "education-principle", name: "德育", difficulty: 0.4, prereqs: ["edu-aim"],
    description: "德育过程、德育原则与方法" },
  { id: "edu-eval", domain: "education-principle", name: "教育评价", difficulty: 0.5, prereqs: ["teaching-theory"],
    description: "评价类型、测验质量指标" },
  { id: "learning-theory", domain: "edu-psychology", name: "学习理论", difficulty: 0.25, prereqs: [],
    description: "行为主义、认知主义、建构主义" },
  { id: "cognitive-dev", domain: "edu-psychology", name: "认知发展", difficulty: 0.32, prereqs: ["learning-theory"],
    description: "皮亚杰阶段论、维果茨基最近发展区" },
  { id: "motivation", domain: "edu-psychology", name: "学习动机", difficulty: 0.4, prereqs: ["cognitive-dev"],
    description: "动机理论、归因、激发策略" },
  { id: "knowledge-const", domain: "edu-psychology", name: "知识建构与迁移", difficulty: 0.42, prereqs: ["learning-theory"],
    description: "陈述性与程序性知识、学习迁移" },
  { id: "problem-solving", domain: "edu-psychology", name: "问题解决与创造", difficulty: 0.5, prereqs: ["knowledge-const"],
    description: "问题解决过程与策略、创造性思维" },
  { id: "individual-diff", domain: "edu-psychology", name: "个别差异", difficulty: 0.48, prereqs: ["cognitive-dev"],
    description: "智力差异、学习风格、特殊需要学生" },
  // 文学：中国文学史 + 外国文学史
  { id: "preqin-lit", domain: "chinese-lit-history", name: "先秦文学", difficulty: 0.2, prereqs: [],
    description: "诗经、楚辞、诸子散文" },
  { id: "han-wei-lit", domain: "chinese-lit-history", name: "汉魏六朝文学", difficulty: 0.3, prereqs: ["preqin-lit"],
    description: "汉赋、史记、建安文学、陶渊明" },
  { id: "tang-poetry", domain: "chinese-lit-history", name: "唐诗", difficulty: 0.35, prereqs: ["han-wei-lit"],
    description: "初盛唐、李白杜甫、中晚唐" },
  { id: "song-ci", domain: "chinese-lit-history", name: "宋词", difficulty: 0.38, prereqs: ["tang-poetry"],
    description: "婉约与豪放、柳永苏轼辛弃疾" },
  { id: "yuan-ming-lit", domain: "chinese-lit-history", name: "元曲与明清小说", difficulty: 0.42, prereqs: ["song-ci"],
    description: "元杂剧、四大名著" },
  { id: "modern-lit", domain: "chinese-lit-history", name: "现当代文学", difficulty: 0.45, prereqs: ["yuan-ming-lit"],
    description: "新文学运动、鲁迅、现代主义与当代文学" },
  { id: "classical-lit", domain: "world-lit-history", name: "古希腊罗马文学", difficulty: 0.2, prereqs: [],
    description: "荷马史诗、希腊悲剧、维吉尔" },
  { id: "medieval-renaissance", domain: "world-lit-history", name: "中世纪与文艺复兴", difficulty: 0.3, prereqs: ["classical-lit"],
    description: "但丁、塞万提斯、莎士比亚" },
  { id: "enlightenment-lit", domain: "world-lit-history", name: "启蒙文学", difficulty: 0.35, prereqs: ["medieval-renaissance"],
    description: "启蒙运动、歌德、卢梭" },
  { id: "romanticism", domain: "world-lit-history", name: "浪漫主义", difficulty: 0.4, prereqs: ["enlightenment-lit"],
    description: "拜伦、雨果、浪漫主义特征" },
  { id: "realism", domain: "world-lit-history", name: "现实主义", difficulty: 0.45, prereqs: ["romanticism"],
    description: "巴尔扎克、托尔斯泰、批判现实主义" },
  { id: "modernism", domain: "world-lit-history", name: "现代主义", difficulty: 0.5, prereqs: ["realism"],
    description: "卡夫卡、乔伊斯、荒诞派与后现代" },
  // 历史学：中国古代史（重构 16→29：总览轻 3-6节×900字 + 详章厚 10-18节×1500字，总览→子节点*→下一总览，短朝20-30页/唐100+页）
  // 总览：薄地图（47-49字，3-6节），详章：厚教材（70-103字，10-18节）；prereqs 星形：子节点直连总览，下一总览接上一块末尾
  { id: "preqin-history", domain: "ancient-china-history", name: "先秦总览", difficulty: 0.10, prereqs: [],
    description: "先秦总览：从旧石器到战国的时间框架与核心线索，青铜文明、分封宗法与百家争鸣的总体脉络与学习地图" },
  { id: "paleolithic-origins", domain: "ancient-china-history", name: "远古人类与旧石器", difficulty: 0.12, prereqs: ["preqin-history"],
    description: "远古人类与旧石器：元谋人、蓝田人、北京人等直立人与智人化石，打制石器、用火与狩猎采集的生业方式，古人类迁徙与环境适应，考古地层、年代框架与多地区起源的学界认识" },
  { id: "neolithic-revolution", domain: "ancient-china-history", name: "新石器与农业起源", difficulty: 0.14, prereqs: ["preqin-history"],
    description: "新石器与农业起源：裴李岗、磁山、上山、河姆渡、仰韶等文化，定居村落、陶器与磨制石器的技术革命，粟作与稻作的南北分野，家畜驯化、生业转型与人口增长的社会复杂化开端" },
  { id: "clan-state-formation", domain: "ancient-china-history", name: "氏族公社与国家起源", difficulty: 0.16, prereqs: ["preqin-history"],
    description: "氏族公社、私有制与国家起源：母系氏族（仰韶半坡、河姆渡干栏）到父系氏族（大汶口、龙山）的转变，家庭与婚姻形态演变，私有制、阶级分化与剩余产品，部落联盟、军事民主制与文明起源三阶段（牛河梁、良渚、陶寺、石峁）" },
  { id: "xia-dynasty", domain: "ancient-china-history", name: "夏朝：传说与二里头", difficulty: 0.18, prereqs: ["preqin-history"],
    description: "夏朝：传说与二里头：尧舜禹禅让与大禹治水传说，二里头文化与夏朝关系的学界争议，早期国家的都邑、宫殿、青铜礼器与社会分层，夏后氏与东夷的互动，夏桀与商汤鸣条之战的叙事辨析" },
  { id: "shang-dynasty", domain: "ancient-china-history", name: "商朝：甲骨文与青铜", difficulty: 0.20, prereqs: ["preqin-history"],
    description: "商朝：甲骨文与青铜文明：商汤灭夏、九世之乱与盘庚迁殷，殷墟甲骨文与成熟文字体系，青铜冶铸技术与后母戊鼎等礼器，王都、方国与祭祀军事结构，商代政治、经济与社会生活全貌" },
  { id: "western-zhou", domain: "ancient-china-history", name: "西周：分封宗法与礼乐", difficulty: 0.22, prereqs: ["preqin-history"],
    description: "西周：分封制、宗法与礼乐文明：武王伐纣与周初分封，宗法制度与嫡长子继承，礼乐制度与井田制的经济基础，周公制礼与成康之治，犬戎之祸与平王东迁的兴衰转折及历史影响" },
  { id: "spring-autumn", domain: "ancient-china-history", name: "春秋：霸主与礼崩乐坏", difficulty: 0.24, prereqs: ["preqin-history"],
    description: "春秋：霸主争雄与礼崩乐坏：周王室衰微与诸侯争霸（齐桓晋文、会盟体系），春秋五霸的兴替，井田瓦解与私田兴起，士阶层崛起与社会流动，礼崩乐坏的思想与制度变革背景" },
  { id: "warring-states", domain: "ancient-china-history", name: "战国：变法与百家争鸣", difficulty: 0.26, prereqs: ["preqin-history"],
    description: "战国：兼并战争、变法与百家争鸣：战国七雄兼并与战争形态演变，商鞅变法、胡服骑射等变法运动，郡县制萌芽与中央集权趋势，百家争鸣（儒墨道法）的思想大爆发，秦统一六国的前夜与历史合力" },
  { id: "qin-han-overview", domain: "ancient-china-history", name: "秦汉总览", difficulty: 0.28, prereqs: ["warring-states"],
    description: "秦汉总览：从秦统一到东汉衰亡的大一统框架，郡县制、汉承秦制与丝绸之路的总体脉络与制度演进地图" },
  { id: "qin-dynasty", domain: "ancient-china-history", name: "秦朝：大一统的建立", difficulty: 0.30, prereqs: ["qin-han-overview"],
    description: "秦朝：大一统的建立：秦始皇统一六国的战争与策略，皇帝制度、三公九卿与郡县制的创立，统一文字、度量衡、货币与法律，焚书坑儒与思想控制，秦末农民战争与秦朝速亡的历史教训" },
  { id: "western-han", domain: "ancient-china-history", name: "西汉：汉承秦制与盛世", difficulty: 0.32, prereqs: ["qin-han-overview"],
    description: "西汉：汉承秦制与盛世：楚汉相争与汉初休养生息，文景之治的政治经济，汉武帝强化中央集权（推恩令、察举制）、罢黜百家与丝绸之路开通，昭宣中兴与西汉的社会经济与文化成就" },
  { id: "eastern-han", domain: "ancient-china-history", name: "东汉：外戚宦官与衰亡", difficulty: 0.34, prereqs: ["qin-han-overview"],
    description: "东汉：外戚宦官与衰亡：光武中兴与制度重建，豪强地主与庄园经济，外戚与宦官交替专权的政治困局，党锢之祸与黄巾起义，东汉衰亡与三国鼎立的历史逻辑" },
  { id: "wei-jin-overview", domain: "ancient-china-history", name: "魏晋南北朝总览", difficulty: 0.36, prereqs: ["eastern-han"],
    description: "魏晋南北朝总览：从三国到隋统一的分裂框架，士族政治、民族融合与佛教传播的总体脉络与南北格局地图" },
  { id: "three-kingdoms-jin", domain: "ancient-china-history", name: "三国两晋：分裂与士族", difficulty: 0.38, prereqs: ["wei-jin-overview"],
    description: "三国两晋：分裂与士族政治：三国鼎立的格局与制度，西晋短暂统一与八王之乱，门阀士族政治的兴起与九品中正制，玄学清谈与士族文化，永嘉之乱与衣冠南渡的历史影响" },
  { id: "northern-southern", domain: "ancient-china-history", name: "南北朝：民族融合", difficulty: 0.40, prereqs: ["wei-jin-overview"],
    description: "南北朝：民族融合与制度创新：五胡十六国与北方族群政权更迭，东晋南朝与江南开发，北魏孝文帝改革与胡汉制度融合，均田制与府兵制的创立，佛教传播与南北文化交流的转型" },
  { id: "sui-tang-overview", domain: "ancient-china-history", name: "隋唐总览", difficulty: 0.42, prereqs: ["northern-southern"],
    description: "隋唐总览：从隋再统一到唐末藩镇的盛衰框架，科举、大运河与三省六部的总体脉络与开放包容的时代地图" },
  { id: "sui-dynasty", domain: "ancient-china-history", name: "隋朝：再统一与制度创制", difficulty: 0.44, prereqs: ["sui-tang-overview"],
    description: "隋朝：再统一与制度创制：隋文帝统一南北与政治整合，三省六部制与科举制的创立，大运河开凿与区域经济整合，律令体系与国家治理，隋炀帝的作为与隋末动乱的历史评价" },
  { id: "early-tang", domain: "ancient-china-history", name: "初唐：贞观之治", difficulty: 0.46, prereqs: ["sui-tang-overview"],
    description: "初唐：贞观之治与制度奠基：唐初统一战争与贞观之治的政治经济，三省六部与科举的运作，贞观律令与均田府兵制的完善，唐太宗的治国理念与初唐文化气象" },
  { id: "tang-dynasty", domain: "ancient-china-history", name: "盛唐：开元盛世", difficulty: 0.48, prereqs: ["sui-tang-overview"],
    description: "盛唐：开元盛世与社会经济：武周政治与开元盛世的鼎盛，盛唐的经济繁荣、城市商业与对外开放，唐诗的黄金时代与文化包容，科举与士族的消长，盛唐气象的历史成因与社会基础" },
  { id: "late-tang", domain: "ancient-china-history", name: "中晚唐：安史之乱与藩镇", difficulty: 0.50, prereqs: ["sui-tang-overview"],
    description: "中晚唐：安史之乱与藩镇割据：安史之乱的爆发与平定，藩镇割据、宦官专权与朋党之争的政治困局，两税法与经济转型，中晚唐的文化变奏与古文运动，五代十国前夜的历史转折" },
  { id: "song-yuan-overview", domain: "ancient-china-history", name: "宋元总览", difficulty: 0.52, prereqs: ["late-tang"],
    description: "宋元总览：从北宋到元末的文官与草原框架，经济重心南移、辽夏金并立与行省制的总体脉络与欧亚交流地图" },
  { id: "northern-song", domain: "ancient-china-history", name: "北宋：文官政治", difficulty: 0.54, prereqs: ["song-yuan-overview"],
    description: "北宋：文官政治与经济繁荣：陈桥兵变与重文轻武的国策，文官政治、科举鼎盛与士大夫文化，经济重心南移、城市经济、纸币与海外贸易，王安石变法与党争，北宋与辽夏的关系及靖康之变" },
  { id: "southern-song-liao-jin", domain: "ancient-china-history", name: "南宋与辽夏金", difficulty: 0.56, prereqs: ["song-yuan-overview"],
    description: "南宋与辽夏金：并立格局与江南开发：南宋偏安与江南经济的高度发展，辽、西夏、金的制度与文化，宋金和议与岳飞抗金，理学兴起与文化成就，蒙古崛起前夜的东亚格局" },
  { id: "yuan-dynasty", domain: "ancient-china-history", name: "元朝：草原帝国与行省", difficulty: 0.58, prereqs: ["song-yuan-overview"],
    description: "元朝：草原帝国与行省制度：蒙古崛起与忽必烈统一，行省制度与多民族治理，草原与中原的制度融合，元朝的经济、交通与欧亚交流，元末农民战争与明朝兴起的历史逻辑" },
  { id: "ming-qing-overview", domain: "ancient-china-history", name: "明清总览", difficulty: 0.60, prereqs: ["yuan-dynasty"],
    description: "明清总览：从明初到晚清的专制与近代前夜框架，内阁厂卫、资本萌芽与闭关锁国的总体脉络与多民族统一地图" },
  { id: "ming-dynasty", domain: "ancient-china-history", name: "明朝：专制强化与白银", difficulty: 0.62, prereqs: ["ming-qing-overview"],
    description: "明朝：专制强化与白银帝国：明太祖废丞相、设内阁与厂卫制度，郑和下西洋与朝贡体系，资本主义萌芽、白银流通与区域市场，张居正改革与万历怠政，明末农民战争与清军入关" },
  { id: "early-qing", domain: "ancient-china-history", name: "清前期：多民族统一", difficulty: 0.64, prereqs: ["ming-qing-overview"],
    description: "清前期：多民族统一国家的巩固：清初制度整合与康雍乾盛世，东北、蒙古、新疆、西藏的统一与治理，摊丁入亩与人口增长，闭关政策的形成与文化专制，盛世背后的危机积累" },
  { id: "late-qing", domain: "ancient-china-history", name: "晚清：近代冲击", difficulty: 0.66, prereqs: ["ming-qing-overview"],
    description: "晚清：近代冲击与帝制终结：鸦片战争与不平等条约体系，洋务运动、戊戌变法与清末新政的改革探索，太平天国与义和团运动，辛亥革命与帝制终结，近代转型的历史反思与遗产" },
  { id: "civ-origin", domain: "world-history", name: "文明起源", difficulty: 0.2, prereqs: [],
    description: "两河流域、古埃及、古印度、华夏文明" },
  { id: "classical-civ", domain: "world-history", name: "古典文明", difficulty: 0.3, prereqs: ["civ-origin"],
    description: "希腊城邦、罗马帝国、波斯帝国" },
  { id: "medieval-world", domain: "world-history", name: "中世纪世界", difficulty: 0.35, prereqs: ["classical-civ"],
    description: "封建制度、基督教会、伊斯兰世界" },
  { id: "age-of-exploration", domain: "world-history", name: "大航海时代", difficulty: 0.4, prereqs: ["medieval-world"],
    description: "地理大发现、殖民扩张、世界市场" },
  { id: "industrial-revolution", domain: "world-history", name: "工业革命", difficulty: 0.45, prereqs: ["age-of-exploration"],
    description: "英国工业革命、工业化扩散、社会变革" },
  { id: "world-wars", domain: "world-history", name: "两次世界大战", difficulty: 0.5, prereqs: ["industrial-revolution"],
    description: "一战、二战、冷战格局的形成" },
  { id: "contemporary-world", domain: "world-history", name: "当代世界", difficulty: 0.55, prereqs: ["world-wars"],
    description: "全球化、多极化、科技革命" },
  // 理学新增：无机化学/有机化学/生物学基础/天文学导论
  { id: "atomic-structure", domain: "inorganic-chemistry", name: "原子结构", difficulty: 0.25, prereqs: [],
    description: "原子模型、量子数、电子排布" },
  { id: "chemical-bonding", domain: "inorganic-chemistry", name: "化学键与分子结构", difficulty: 0.35, prereqs: ["atomic-structure"],
    description: "离子键与共价键、杂化轨道、分子间作用力" },
  { id: "chem-equilibrium", domain: "inorganic-chemistry", name: "化学平衡", difficulty: 0.4, prereqs: ["chemical-bonding"],
    description: "平衡常数、勒夏特列原理" },
  { id: "acid-base", domain: "inorganic-chemistry", name: "酸碱平衡", difficulty: 0.42, prereqs: ["chem-equilibrium"],
    description: "酸碱理论、pH 计算、缓冲溶液" },
  { id: "redox", domain: "inorganic-chemistry", name: "氧化还原反应", difficulty: 0.45, prereqs: ["acid-base"],
    description: "氧化数、电极电势、原电池" },
  { id: "coordination", domain: "inorganic-chemistry", name: "配位化学", difficulty: 0.5, prereqs: ["chemical-bonding"],
    description: "配合物的结构与命名、配位平衡" },
  { id: "organic-basics", domain: "organic-chemistry", name: "有机化学基础", difficulty: 0.25, prereqs: [],
    description: "有机化合物的特征、结构式、命名规则" },
  { id: "hydrocarbons", domain: "organic-chemistry", name: "烃", difficulty: 0.35, prereqs: ["organic-basics"],
    description: "烷烃烯烃炔烃、芳香烃" },
  { id: "functional-groups", domain: "organic-chemistry", name: "官能团化学", difficulty: 0.4, prereqs: ["hydrocarbons"],
    description: "醇酚醚、醛酮、羧酸与酯" },
  { id: "stereochemistry", domain: "organic-chemistry", name: "立体化学", difficulty: 0.45, prereqs: ["functional-groups"],
    description: "手性、构象分析、顺反异构" },
  { id: "reaction-mech", domain: "organic-chemistry", name: "反应机理初步", difficulty: 0.5, prereqs: ["functional-groups"],
    description: "亲核取代、亲电加成、消除反应" },
  { id: "biomolecules", domain: "organic-chemistry", name: "生物大分子", difficulty: 0.55, prereqs: ["organic-basics"],
    description: "糖类、脂类、蛋白质、核酸" },
  { id: "cell-structure", domain: "biology-basics", name: "细胞的结构", difficulty: 0.2, prereqs: [],
    description: "细胞膜、细胞器、细胞核" },
  { id: "genetics", domain: "biology-basics", name: "遗传与变异", difficulty: 0.35, prereqs: ["cell-structure"],
    description: "孟德尔定律、染色体、基因表达" },
  { id: "evolution", domain: "biology-basics", name: "进化论", difficulty: 0.38, prereqs: ["genetics"],
    description: "自然选择、物种形成、进化证据" },
  { id: "biochemistry", domain: "biology-basics", name: "生物化学基础", difficulty: 0.4, prereqs: ["cell-structure"],
    description: "酶、代谢途径、能量转换" },
  { id: "ecology", domain: "biology-basics", name: "生态学导论", difficulty: 0.45, prereqs: ["evolution"],
    description: "生态系统、种群动态、生物多样性" },
  { id: "molecular-bio", domain: "biology-basics", name: "分子生物学初步", difficulty: 0.5, prereqs: ["biochemistry", "genetics"],
    description: "DNA 复制、转录与翻译、基因工程" },
  { id: "celestial-sphere", domain: "astronomy-intro", name: "天球与坐标", difficulty: 0.25, prereqs: [],
    description: "天球、赤道坐标系、时间计量" },
  { id: "solar-system", domain: "astronomy-intro", name: "太阳系", difficulty: 0.32, prereqs: ["celestial-sphere"],
    description: "行星与卫星、开普勒定律、太阳" },
  { id: "stellar-evolution", domain: "astronomy-intro", name: "恒星演化", difficulty: 0.45, prereqs: ["solar-system"],
    description: "恒星光谱、主序星、白矮星中子星黑洞" },
  { id: "galaxies", domain: "astronomy-intro", name: "星系与宇宙", difficulty: 0.5, prereqs: ["stellar-evolution"],
    description: "银河系、河外星系、暗物质" },
  { id: "observation", domain: "astronomy-intro", name: "观测方法", difficulty: 0.4, prereqs: ["celestial-sphere"],
    description: "望远镜、光谱分析、空间探测" },
  { id: "cosmology", domain: "astronomy-intro", name: "宇宙学初步", difficulty: 0.55, prereqs: ["galaxies"],
    description: "大爆炸、宇宙膨胀、宇宙微波背景" },
  // 工学新增：计算机网络/数据库/组成原理/电路/自控/软件工程
  { id: "net-architecture", domain: "computer-network", name: "网络体系结构", difficulty: 0.25, prereqs: [],
    description: "OSI 七层、TCP/IP 四层、封装与解封装" },
  { id: "data-link", domain: "computer-network", name: "物理层与数据链路层", difficulty: 0.35, prereqs: ["net-architecture"],
    description: "信号与编码、MAC 地址、以太网" },
  { id: "network-layer", domain: "computer-network", name: "网络层与 IP", difficulty: 0.45, prereqs: ["data-link"],
    description: "IP 地址、子网划分、路由原理" },
  { id: "transport-layer", domain: "computer-network", name: "传输层", difficulty: 0.5, prereqs: ["network-layer"],
    description: "TCP 三次握手、流量控制、UDP" },
  { id: "application-layer", domain: "computer-network", name: "应用层", difficulty: 0.45, prereqs: ["transport-layer"],
    description: "HTTP、DNS、电子邮件协议" },
  { id: "net-security", domain: "computer-network", name: "网络安全", difficulty: 0.55, prereqs: ["transport-layer"],
    description: "加密与签名、防火墙、常见攻击与防御" },
  { id: "relational-model", domain: "database-system", name: "关系模型", difficulty: 0.25, prereqs: [],
    description: "关系、元组、键、完整性约束" },
  { id: "sql", domain: "database-system", name: "SQL 语言", difficulty: 0.35, prereqs: ["relational-model"],
    description: "增删改查、连接、聚合查询" },
  { id: "db-design", domain: "database-system", name: "数据库设计", difficulty: 0.45, prereqs: ["relational-model"],
    description: "ER 模型、范式理论、反范式" },
  { id: "transactions", domain: "database-system", name: "事务与并发", difficulty: 0.5, prereqs: ["sql"],
    description: "ACID、锁、隔离级别" },
  { id: "indexing", domain: "database-system", name: "索引与优化", difficulty: 0.5, prereqs: ["sql"],
    description: "B+ 树、执行计划、查询优化" },
  { id: "nosql", domain: "database-system", name: "NoSQL 初步", difficulty: 0.55, prereqs: ["relational-model"],
    description: "键值、文档、列族、图数据库" },
  { id: "number-system", domain: "computer-organization", name: "数制与编码", difficulty: 0.2, prereqs: [],
    description: "二进制、补码、定点与浮点表示" },
  { id: "alu", domain: "computer-organization", name: "运算器", difficulty: 0.35, prereqs: ["number-system"],
    description: "加减乘除实现、ALU 结构" },
  { id: "memory-hierarchy", domain: "computer-organization", name: "存储系统", difficulty: 0.4, prereqs: ["alu"],
    description: "Cache、主存、虚拟存储" },
  { id: "instruction-set", domain: "computer-organization", name: "指令系统", difficulty: 0.42, prereqs: ["alu"],
    description: "指令格式、寻址方式、RISC 与 CISC" },
  { id: "cpu-pipeline", domain: "computer-organization", name: "CPU 与流水线", difficulty: 0.5, prereqs: ["instruction-set"],
    description: "数据通路、流水线冒险" },
  { id: "io-system", domain: "computer-organization", name: "输入输出系统", difficulty: 0.48, prereqs: ["cpu-pipeline"],
    description: "中断、DMA、总线" },
  { id: "circuit-concepts", domain: "circuit-basics", name: "电路基本概念", difficulty: 0.2, prereqs: [],
    description: "电流电压功率、基尔霍夫定律" },
  { id: "resistive-analysis", domain: "circuit-basics", name: "电阻电路分析", difficulty: 0.35, prereqs: ["circuit-concepts"],
    description: "串并联、网孔节点法、戴维南定理" },
  { id: "dynamic-circuit", domain: "circuit-basics", name: "动态电路", difficulty: 0.45, prereqs: ["resistive-analysis"],
    description: "电容电感、一阶电路、RC 响应" },
  { id: "sinusoidal", domain: "circuit-basics", name: "正弦稳态", difficulty: 0.48, prereqs: ["dynamic-circuit"],
    description: "相量法、阻抗、功率因数" },
  { id: "frequency-response", domain: "circuit-basics", name: "频率响应", difficulty: 0.5, prereqs: ["sinusoidal"],
    description: "谐振、滤波器" },
  { id: "semiconductor", domain: "circuit-basics", name: "半导体器件初步", difficulty: 0.5, prereqs: ["circuit-concepts"],
    description: "二极管、三极管、放大原理" },
  { id: "control-concepts", domain: "automatic-control", name: "控制系统概念", difficulty: 0.25, prereqs: [],
    description: "开环与闭环、反馈、控制目标" },
  { id: "math-model", domain: "automatic-control", name: "数学模型", difficulty: 0.35, prereqs: ["control-concepts"],
    description: "传递函数、框图、信号流图" },
  { id: "time-domain", domain: "automatic-control", name: "时域分析", difficulty: 0.42, prereqs: ["math-model"],
    description: "阶跃响应、稳定性、稳态误差" },
  { id: "root-locus", domain: "automatic-control", name: "根轨迹法", difficulty: 0.5, prereqs: ["time-domain"],
    description: "根轨迹绘制、系统设计" },
  { id: "freq-domain", domain: "automatic-control", name: "频域分析", difficulty: 0.5, prereqs: ["math-model"],
    description: "伯德图、奈奎斯特判据" },
  { id: "pid", domain: "automatic-control", name: "PID 校正", difficulty: 0.55, prereqs: ["time-domain", "freq-domain"],
    description: "PID 参数整定、校正网络" },
  { id: "se-process", domain: "software-engineering", name: "软件过程", difficulty: 0.2, prereqs: [],
    description: "软件生命周期、瀑布与敏捷" },
  { id: "requirements", domain: "software-engineering", name: "需求分析", difficulty: 0.35, prereqs: ["se-process"],
    description: "需求获取、用例建模" },
  { id: "software-design", domain: "software-engineering", name: "软件设计", difficulty: 0.42, prereqs: ["requirements"],
    description: "架构设计、模块化、设计模式初步" },
  { id: "software-testing", domain: "software-engineering", name: "软件测试", difficulty: 0.45, prereqs: ["software-design"],
    description: "测试方法、测试用例、自动化测试" },
  { id: "se-management", domain: "software-engineering", name: "项目管理", difficulty: 0.45, prereqs: ["se-process"],
    description: "估算、进度、风险、团队" },
  { id: "se-maintenance", domain: "software-engineering", name: "软件维护与演化", difficulty: 0.5, prereqs: ["software-design"],
    description: "维护类型、重构、遗留系统" },
  // 农学：农学概论
  { id: "crop-growth", domain: "agronomy-intro", name: "作物生长发育", difficulty: 0.2, prereqs: [],
    description: "作物分类、生育时期、产量形成" },
  { id: "soil-fertilizer", domain: "agronomy-intro", name: "土壤与肥料", difficulty: 0.35, prereqs: ["crop-growth"],
    description: "土壤性质、养分循环、科学施肥" },
  { id: "crop-breeding", domain: "agronomy-intro", name: "作物育种", difficulty: 0.4, prereqs: ["crop-growth"],
    description: "遗传基础、杂交育种、分子育种" },
  { id: "plant-protection", domain: "agronomy-intro", name: "植物保护", difficulty: 0.42, prereqs: ["crop-growth"],
    description: "病虫害识别、综合防治、农药安全" },
  { id: "agro-ecology", domain: "agronomy-intro", name: "农业生态", difficulty: 0.45, prereqs: ["soil-fertilizer"],
    description: "农田生态系统、可持续农业" },
  { id: "modern-agriculture", domain: "agronomy-intro", name: "现代农业技术", difficulty: 0.5, prereqs: ["crop-breeding", "plant-protection"],
    description: "智慧农业、设施农业、农业生物技术" },
  // 医学：解剖/生理/病理
  { id: "locomotor-system", domain: "human-anatomy", name: "运动系统", difficulty: 0.2, prereqs: [],
    description: "骨、关节、骨骼肌" },
  { id: "circulatory-system", domain: "human-anatomy", name: "循环系统", difficulty: 0.35, prereqs: ["locomotor-system"],
    description: "心脏结构、血管、血液循环" },
  { id: "respiratory-system", domain: "human-anatomy", name: "呼吸系统", difficulty: 0.38, prereqs: ["locomotor-system"],
    description: "呼吸道、肺、气体交换" },
  { id: "digestive-system", domain: "human-anatomy", name: "消化系统", difficulty: 0.4, prereqs: ["locomotor-system"],
    description: "消化道、消化腺、营养吸收" },
  { id: "nervous-system", domain: "human-anatomy", name: "神经系统", difficulty: 0.5, prereqs: ["circulatory-system"],
    description: "中枢神经、周围神经、脑" },
  { id: "endocrine-system", domain: "human-anatomy", name: "内分泌系统", difficulty: 0.48, prereqs: ["nervous-system"],
    description: "激素、垂体、甲状腺" },
  { id: "cell-physiology", domain: "physiology", name: "细胞生理", difficulty: 0.25, prereqs: [],
    description: "跨膜转运、生物电、兴奋传导" },
  { id: "blood-physiology", domain: "physiology", name: "血液生理", difficulty: 0.35, prereqs: ["cell-physiology"],
    description: "血细胞、凝血、血型" },
  { id: "circulation-physiology", domain: "physiology", name: "循环生理", difficulty: 0.42, prereqs: ["blood-physiology"],
    description: "心脏泵血、血压调节" },
  { id: "respiration-physiology", domain: "physiology", name: "呼吸生理", difficulty: 0.42, prereqs: ["blood-physiology"],
    description: "肺通气、换气、呼吸调节" },
  { id: "digestion-absorption", domain: "physiology", name: "消化与吸收", difficulty: 0.4, prereqs: ["cell-physiology"],
    description: "胃肠运动、消化液、营养吸收" },
  { id: "nerve-physiology", domain: "physiology", name: "神经生理", difficulty: 0.5, prereqs: ["cell-physiology"],
    description: "突触传递、反射、感觉生理" },
  { id: "cell-injury", domain: "pathology-intro", name: "细胞损伤与适应", difficulty: 0.25, prereqs: [],
    description: "变性、坏死、凋亡" },
  { id: "inflammation", domain: "pathology-intro", name: "炎症", difficulty: 0.35, prereqs: ["cell-injury"],
    description: "炎症过程、类型、结局" },
  { id: "tumor", domain: "pathology-intro", name: "肿瘤", difficulty: 0.42, prereqs: ["cell-injury"],
    description: "良恶性肿瘤、命名、癌变机制初步" },
  { id: "circulation-disorder", domain: "pathology-intro", name: "循环障碍", difficulty: 0.38, prereqs: ["cell-injury"],
    description: "充血淤血、血栓、栓塞、梗死" },
  { id: "infectious-disease", domain: "pathology-intro", name: "感染性疾病", difficulty: 0.45, prereqs: ["inflammation"],
    description: "细菌病毒感染病理、结核病" },
  { id: "common-diseases", domain: "pathology-intro", name: "常见病病理", difficulty: 0.5, prereqs: ["tumor", "circulation-disorder"],
    description: "高血压、动脉粥样硬化、肺炎、常见肿瘤" },
  // 管理学：管理学原理/会计学基础/市场营销
  { id: "mgmt-thought", domain: "management-principle", name: "管理思想演进", difficulty: 0.2, prereqs: [],
    description: "科学管理、一般管理理论、行为科学" },
  { id: "planning", domain: "management-principle", name: "计划职能", difficulty: 0.32, prereqs: ["mgmt-thought"],
    description: "计划类型、目标管理、决策" },
  { id: "organizing", domain: "management-principle", name: "组织职能", difficulty: 0.38, prereqs: ["planning"],
    description: "组织结构、部门化、职权配置" },
  { id: "leading", domain: "management-principle", name: "领导职能", difficulty: 0.4, prereqs: ["mgmt-thought"],
    description: "领导理论、激励、沟通" },
  { id: "controlling", domain: "management-principle", name: "控制职能", difficulty: 0.42, prereqs: ["planning"],
    description: "控制过程、绩效管理" },
  { id: "mgmt-innovation", domain: "management-principle", name: "管理创新", difficulty: 0.5, prereqs: ["organizing", "leading"],
    description: "变革管理、学习型组织" },
  { id: "accounting-elements", domain: "accounting-basics", name: "会计要素与等式", difficulty: 0.2, prereqs: [],
    description: "会计恒等式、会计科目" },
  { id: "double-entry", domain: "accounting-basics", name: "复式记账", difficulty: 0.35, prereqs: ["accounting-elements"],
    description: "借贷记账法、会计分录" },
  { id: "vouchers-books", domain: "accounting-basics", name: "凭证与账簿", difficulty: 0.4, prereqs: ["double-entry"],
    description: "原始凭证、记账凭证、账簿" },
  { id: "financial-statements", domain: "accounting-basics", name: "财务报表", difficulty: 0.45, prereqs: ["vouchers-books"],
    description: "资产负债表、利润表、现金流量表" },
  { id: "cost-accounting", domain: "accounting-basics", name: "成本核算初步", difficulty: 0.5, prereqs: ["financial-statements"],
    description: "成本构成与分配、品种法" },
  { id: "financial-analysis", domain: "accounting-basics", name: "财务分析", difficulty: 0.5, prereqs: ["financial-statements"],
    description: "比率分析、杜邦分析" },
  { id: "marketing-concept", domain: "marketing", name: "营销观念", difficulty: 0.2, prereqs: [],
    description: "营销的定义、营销观念演变" },
  { id: "market-analysis", domain: "marketing", name: "市场分析", difficulty: 0.32, prereqs: ["marketing-concept"],
    description: "宏微观环境、市场调研" },
  { id: "consumer-behavior", domain: "marketing", name: "消费者行为", difficulty: 0.4, prereqs: ["market-analysis"],
    description: "购买决策过程、影响因素" },
  { id: "stp", domain: "marketing", name: "STP 战略", difficulty: 0.42, prereqs: ["market-analysis"],
    description: "市场细分、目标市场、定位" },
  { id: "four-p", domain: "marketing", name: "4P 策略", difficulty: 0.48, prereqs: ["stp"],
    description: "产品、定价、渠道、促销" },
  { id: "digital-marketing", domain: "marketing", name: "数字营销", difficulty: 0.5, prereqs: ["four-p"],
    description: "新媒体营销、内容营销、数据驱动" },
  // 艺术学：艺术概论/中外美术史/音乐基础理论
  { id: "art-essence", domain: "art-introduction", name: "艺术的本质", difficulty: 0.2, prereqs: [],
    description: "艺术的定义、艺术与生活" },
  { id: "art-origin", domain: "art-introduction", name: "艺术的起源", difficulty: 0.3, prereqs: ["art-essence"],
    description: "模仿说、游戏说、劳动说" },
  { id: "art-categories", domain: "art-introduction", name: "艺术门类", difficulty: 0.35, prereqs: ["art-essence"],
    description: "造型艺术、表演艺术、语言艺术、综合艺术" },
  { id: "art-creation", domain: "art-introduction", name: "艺术创作", difficulty: 0.42, prereqs: ["art-origin"],
    description: "创作过程、艺术思维、灵感" },
  { id: "artwork", domain: "art-introduction", name: "艺术作品", difficulty: 0.42, prereqs: ["art-categories"],
    description: "内容与形式、意境、风格" },
  { id: "art-appreciation", domain: "art-introduction", name: "艺术鉴赏", difficulty: 0.5, prereqs: ["artwork"],
    description: "鉴赏方法、审美标准、艺术批评" },
  { id: "prehistoric-ancient", domain: "art-history", name: "史前与古代美术", difficulty: 0.2, prereqs: [],
    description: "洞穴壁画、古埃及、古希腊罗马美术" },
  { id: "medieval-renaissance-art", domain: "art-history", name: "中世纪与文艺复兴美术", difficulty: 0.35, prereqs: ["prehistoric-ancient"],
    description: "教堂艺术、文艺复兴三杰" },
  { id: "baroque-impressionism", domain: "art-history", name: "巴洛克至印象派", difficulty: 0.42, prereqs: ["medieval-renaissance-art"],
    description: "巴洛克、洛可可、浪漫主义、印象派" },
  { id: "modern-art", domain: "art-history", name: "现代艺术", difficulty: 0.48, prereqs: ["baroque-impressionism"],
    description: "立体主义、抽象主义、达达与当代艺术" },
  { id: "chinese-painting", domain: "art-history", name: "中国绘画史", difficulty: 0.4, prereqs: ["prehistoric-ancient"],
    description: "文人画、山水画、人物画" },
  { id: "chinese-calligraphy", domain: "art-history", name: "中国书法史", difficulty: 0.42, prereqs: ["prehistoric-ancient"],
    description: "篆隶楷行草、历代名家" },
  { id: "notation", domain: "music-theory", name: "乐音与记谱", difficulty: 0.2, prereqs: [],
    description: "音高、音名、五线谱" },
  { id: "rhythm", domain: "music-theory", name: "节奏与节拍", difficulty: 0.3, prereqs: ["notation"],
    description: "拍号、节奏型、速度" },
  { id: "intervals", domain: "music-theory", name: "音程", difficulty: 0.38, prereqs: ["notation"],
    description: "音程的性质、协和度" },
  { id: "modes", domain: "music-theory", name: "调式与调性", difficulty: 0.45, prereqs: ["intervals"],
    description: "大小调、五声调式、调号" },
  { id: "chords", domain: "music-theory", name: "和弦", difficulty: 0.48, prereqs: ["intervals"],
    description: "三和弦、七和弦、和弦进行" },
  { id: "musical-form", domain: "music-theory", name: "曲式初步", difficulty: 0.55, prereqs: ["modes", "chords"],
    description: "乐句与乐段、二部三部曲式、奏鸣曲式初步" },
  // 经济学新增：财政学（财政学类）
  { id: "public-goods", domain: "fiscal-science", name: "公共品与外部性", difficulty: 0.2, prereqs: [],
    description: "公共品的特征、外部性与市场失灵、公共选择初步" },
  { id: "fiscal-expenditure", domain: "fiscal-science", name: "财政支出", difficulty: 0.3, prereqs: ["public-goods"],
    description: "支出分类、规模与结构、购买性与转移性支出" },
  { id: "taxation", domain: "fiscal-science", name: "税收理论与制度", difficulty: 0.4, prereqs: ["fiscal-expenditure"],
    description: "税收原则、税负转嫁、主要税种" },
  { id: "government-budget", domain: "fiscal-science", name: "政府预算", difficulty: 0.45, prereqs: ["fiscal-expenditure"],
    description: "预算原则、预算编制、国库与决算" },
  { id: "fiscal-decentralization", domain: "fiscal-science", name: "财政分权", difficulty: 0.5, prereqs: ["government-budget"],
    description: "中央与地方财政关系、转移支付" },
  { id: "public-debt", domain: "fiscal-science", name: "公债与财政政策", difficulty: 0.5, prereqs: ["taxation"],
    description: "公债原理、债务风险、财政政策工具" },
  // 法学新增：政治学类/社会学类/民族学类/马克思主义理论类
  { id: "politics-basics", domain: "political-science", name: "政治与政治学", difficulty: 0.2, prereqs: [],
    description: "政治的定义、权力与权威、政治学研究方法" },
  { id: "state-government", domain: "political-science", name: "国家与政府", difficulty: 0.3, prereqs: ["politics-basics"],
    description: "国家要素、政体分类、政府形式" },
  { id: "political-institutions", domain: "political-science", name: "政治制度比较", difficulty: 0.4, prereqs: ["state-government"],
    description: "议会制与总统制、立法司法行政关系" },
  { id: "parties-elections", domain: "political-science", name: "政党与选举", difficulty: 0.4, prereqs: ["state-government"],
    description: "政党制度、选举制度、利益集团" },
  { id: "political-culture", domain: "political-science", name: "政治文化与参与", difficulty: 0.45, prereqs: ["politics-basics"],
    description: "政治社会化、公民参与、政治心理" },
  { id: "international-politics", domain: "political-science", name: "国际政治初步", difficulty: 0.5, prereqs: ["politics-basics"],
    description: "主权国家体系、国际组织、全球治理" },
  { id: "sociology-view", domain: "sociology", name: "社会学视角", difficulty: 0.2, prereqs: [],
    description: "社会学的想象力、经典理论家、研究方法" },
  { id: "culture-socialization", domain: "sociology", name: "文化与社会化", difficulty: 0.3, prereqs: ["sociology-view"],
    description: "文化要素、社会化过程、越轨" },
  { id: "social-groups", domain: "sociology", name: "社会群体与组织", difficulty: 0.35, prereqs: ["sociology-view"],
    description: "初级与次级群体、科层制、社会组织" },
  { id: "social-stratification", domain: "sociology", name: "社会分层", difficulty: 0.45, prereqs: ["social-groups"],
    description: "阶级与阶层、社会流动、不平等" },
  { id: "social-change", domain: "sociology", name: "社会变迁", difficulty: 0.45, prereqs: ["sociology-view"],
    description: "现代化、城市化、集体行为" },
  { id: "social-problems", domain: "sociology", name: "社会问题", difficulty: 0.5, prereqs: ["social-stratification"],
    description: "贫困、犯罪、人口老龄化" },
  { id: "ethnology-basics", domain: "ethnology", name: "民族学基础", difficulty: 0.2, prereqs: [],
    description: "民族的定义、民族学理论流派" },
  { id: "field-research", domain: "ethnology", name: "田野调查方法", difficulty: 0.32, prereqs: ["ethnology-basics"],
    description: "参与观察、访谈法、民族志写作" },
  { id: "kinship-marriage", domain: "ethnology", name: "亲属制度与婚姻家庭", difficulty: 0.4, prereqs: ["ethnology-basics"],
    description: "亲属称谓、婚姻形式、家庭结构" },
  { id: "ethnic-economy", domain: "ethnology", name: "生计方式与经济", difficulty: 0.42, prereqs: ["ethnology-basics"],
    description: "采集狩猎、农耕与游牧、礼物交换" },
  { id: "religion-ritual", domain: "ethnology", name: "宗教与仪式", difficulty: 0.45, prereqs: ["ethnology-basics"],
    description: "信仰类型、仪式过程、象征体系" },
  { id: "ethnic-policy", domain: "ethnology", name: "民族理论与政策", difficulty: 0.5, prereqs: ["ethnology-basics"],
    description: "民族识别、区域自治、民族关系" },
  { id: "dialectical-materialism", domain: "marxism-theory", name: "辩证唯物主义", difficulty: 0.2, prereqs: [],
    description: "物质与意识、辩证法三大规律" },
  { id: "epistemology", domain: "marxism-theory", name: "认识论", difficulty: 0.32, prereqs: ["dialectical-materialism"],
    description: "实践与认识、真理及其检验标准" },
  { id: "historical-materialism", domain: "marxism-theory", name: "历史唯物主义", difficulty: 0.38, prereqs: ["dialectical-materialism"],
    description: "社会存在与社会意识、社会基本矛盾" },
  { id: "labor-value", domain: "marxism-theory", name: "劳动价值论", difficulty: 0.4, prereqs: ["historical-materialism"],
    description: "商品二因素、劳动二重性、价值规律" },
  { id: "surplus-value", domain: "marxism-theory", name: "剩余价值理论", difficulty: 0.45, prereqs: ["labor-value"],
    description: "剩余价值生产、资本积累、经济危机" },
  { id: "scientific-socialism", domain: "marxism-theory", name: "科学社会主义", difficulty: 0.5, prereqs: ["historical-materialism"],
    description: "社会主义理论、共产主义理想、当代实践" },
  // 教育学新增：体育学类
  { id: "sport-concept", domain: "sports-science", name: "体育的概念与功能", difficulty: 0.2, prereqs: [],
    description: "体育的本质、分类、社会功能" },
  { id: "exercise-physiology", domain: "sports-science", name: "运动生理基础", difficulty: 0.35, prereqs: ["sport-concept"],
    description: "能量系统、心肺功能、骨骼肌" },
  { id: "training-theory", domain: "sports-science", name: "运动训练学初步", difficulty: 0.4, prereqs: ["exercise-physiology"],
    description: "训练原则、负荷安排、训练周期" },
  { id: "school-sports", domain: "sports-science", name: "学校体育", difficulty: 0.4, prereqs: ["sport-concept"],
    description: "体育课程、课外体育活动、体质健康" },
  { id: "sport-psychology", domain: "sports-science", name: "运动心理", difficulty: 0.45, prereqs: ["exercise-physiology"],
    description: "运动动机、焦虑调控、心理训练" },
  { id: "sport-society", domain: "sports-science", name: "体育与社会", difficulty: 0.48, prereqs: ["sport-concept"],
    description: "奥林匹克运动、大众体育、体育产业" },
  // 文学新增：新闻传播学类
  { id: "news-concept", domain: "journalism-communication", name: "新闻的定义与价值", difficulty: 0.2, prereqs: [],
    description: "新闻要素、新闻价值、真实性原则" },
  { id: "news-history", domain: "journalism-communication", name: "新闻事业史", difficulty: 0.32, prereqs: ["news-concept"],
    description: "报刊史、通讯社、广电与网络媒体" },
  { id: "news-reporting", domain: "journalism-communication", name: "新闻采访与写作", difficulty: 0.4, prereqs: ["news-concept"],
    description: "采访方法、消息写作、深度报道" },
  { id: "news-editing", domain: "journalism-communication", name: "新闻编辑与评论", difficulty: 0.42, prereqs: ["news-reporting"],
    description: "编辑流程、标题制作、新闻评论" },
  { id: "media-ethics", domain: "journalism-communication", name: "新闻伦理与法规", difficulty: 0.45, prereqs: ["news-concept"],
    description: "职业道德、隐私与名誉、媒介法规" },
  { id: "new-media", domain: "journalism-communication", name: "新媒体与融合新闻", difficulty: 0.5, prereqs: ["news-editing"],
    description: "媒介融合、数据新闻、社交媒体传播" },
  // 理学新增：地理/大气/海洋/地球物理/地质/心理学类
  { id: "geo-basics", domain: "geography", name: "地理学基础", difficulty: 0.2, prereqs: [],
    description: "地理学的研究对象、区域思想、地图基础" },
  { id: "natural-geography", domain: "geography", name: "自然地理要素", difficulty: 0.32, prereqs: ["geo-basics"],
    description: "地貌、气候、水文、土壤与植被" },
  { id: "human-geography", domain: "geography", name: "人文地理", difficulty: 0.35, prereqs: ["geo-basics"],
    description: "人口、聚落、经济活动的空间分布" },
  { id: "gis", domain: "geography", name: "地图与 GIS", difficulty: 0.38, prereqs: ["geo-basics"],
    description: "地图投影、遥感、地理信息系统" },
  { id: "resources-environment", domain: "geography", name: "资源与环境", difficulty: 0.45, prereqs: ["natural-geography"],
    description: "自然资源、环境问题、人地关系" },
  { id: "regional-geography", domain: "geography", name: "区域地理", difficulty: 0.48, prereqs: ["human-geography"],
    description: "区域差异、区域规划、中国地理概况" },
  { id: "atmosphere-structure", domain: "atmospheric-science", name: "大气成分与结构", difficulty: 0.2, prereqs: [],
    description: "大气分层、气象要素观测" },
  { id: "atmospheric-heat", domain: "atmospheric-science", name: "大气热力学", difficulty: 0.35, prereqs: ["atmosphere-structure"],
    description: "辐射收支、温度变化、水汽凝结" },
  { id: "atmospheric-motion", domain: "atmospheric-science", name: "大气运动", difficulty: 0.4, prereqs: ["atmosphere-structure"],
    description: "气压场、风、大气环流" },
  { id: "weather-systems", domain: "atmospheric-science", name: "天气系统", difficulty: 0.45, prereqs: ["atmospheric-motion"],
    description: "气团与锋面、气旋、台风" },
  { id: "climate-system", domain: "atmospheric-science", name: "气候系统", difficulty: 0.5, prereqs: ["atmospheric-motion"],
    description: "气候带、季风、海气相互作用" },
  { id: "climate-change", domain: "atmospheric-science", name: "气候变化", difficulty: 0.55, prereqs: ["climate-system"],
    description: "温室效应、全球变暖、应对策略" },
  { id: "ocean-geography", domain: "marine-science", name: "海洋地理", difficulty: 0.2, prereqs: [],
    description: "海陆分布、海底地形、海洋调查" },
  { id: "seawater", domain: "marine-science", name: "海水的性质", difficulty: 0.32, prereqs: ["ocean-geography"],
    description: "盐度与温度、海冰、海水化学组成" },
  { id: "ocean-circulation", domain: "marine-science", name: "海洋环流", difficulty: 0.42, prereqs: ["seawater"],
    description: "风生环流、热盐环流、洋流系统" },
  { id: "waves-tides", domain: "marine-science", name: "海浪与潮汐", difficulty: 0.4, prereqs: ["seawater"],
    description: "波浪要素、潮汐成因、风暴潮" },
  { id: "marine-biology", domain: "marine-science", name: "海洋生物", difficulty: 0.45, prereqs: ["seawater"],
    description: "浮游生物、底栖生物、海洋生态系统" },
  { id: "marine-resources", domain: "marine-science", name: "海洋资源与环境", difficulty: 0.5, prereqs: ["ocean-circulation"],
    description: "海洋能源与矿产、海洋污染、蓝色经济" },
  { id: "earth-structure", domain: "geophysics", name: "地球内部结构", difficulty: 0.2, prereqs: [],
    description: "地壳地幔地核、地球分层证据" },
  { id: "seismology", domain: "geophysics", name: "地震学基础", difficulty: 0.4, prereqs: ["earth-structure"],
    description: "地震波、震级与烈度、地震监测" },
  { id: "gravity-geomagnetism", domain: "geophysics", name: "重力与地磁", difficulty: 0.42, prereqs: ["earth-structure"],
    description: "重力场、地磁场、磁异常" },
  { id: "geothermics", domain: "geophysics", name: "地热学", difficulty: 0.45, prereqs: ["earth-structure"],
    description: "地球温度场、大地热流、地热资源" },
  { id: "exploration-geophysics", domain: "geophysics", name: "勘探地球物理", difficulty: 0.5, prereqs: ["seismology", "gravity-geomagnetism"],
    description: "电法磁法地震勘探、测井" },
  { id: "geodynamics", domain: "geophysics", name: "地球动力学", difficulty: 0.55, prereqs: ["seismology"],
    description: "板块构造、地幔对流、造山带" },
  { id: "minerals-rocks", domain: "geology", name: "矿物与岩石", difficulty: 0.2, prereqs: [],
    description: "三大类岩石、矿物识别" },
  { id: "geologic-time", domain: "geology", name: "地质年代", difficulty: 0.32, prereqs: ["minerals-rocks"],
    description: "地层、化石、地质年代表" },
  { id: "tectonics", domain: "geology", name: "构造运动", difficulty: 0.4, prereqs: ["minerals-rocks"],
    description: "褶皱与断层、板块构造" },
  { id: "sediment-strata", domain: "geology", name: "沉积与地层", difficulty: 0.42, prereqs: ["minerals-rocks"],
    description: "沉积作用、沉积岩、层序地层" },
  { id: "mineral-resources", domain: "geology", name: "矿产资源", difficulty: 0.48, prereqs: ["minerals-rocks"],
    description: "矿床类型、矿产勘查" },
  { id: "geologic-hazards", domain: "geology", name: "地质灾害", difficulty: 0.5, prereqs: ["tectonics"],
    description: "地震、滑坡、泥石流、火山" },
  { id: "psych-methods", domain: "scientific-psychology", name: "心理学研究方法", difficulty: 0.2, prereqs: [],
    description: "实验法、观察法、心理测量" },
  { id: "sensation-perception", domain: "scientific-psychology", name: "感觉与知觉", difficulty: 0.32, prereqs: ["psych-methods"],
    description: "感觉阈限、知觉组织、错觉" },
  { id: "memory-learning", domain: "scientific-psychology", name: "记忆与学习", difficulty: 0.38, prereqs: ["sensation-perception"],
    description: "记忆过程、遗忘曲线、学习理论" },
  { id: "emotion-motivation", domain: "scientific-psychology", name: "情绪与动机", difficulty: 0.4, prereqs: ["memory-learning"],
    description: "情绪理论、动机层次、应激" },
  { id: "personality", domain: "scientific-psychology", name: "人格", difficulty: 0.42, prereqs: ["psych-methods"],
    description: "人格理论、气质与性格、人格测量" },
  { id: "social-psychology", domain: "scientific-psychology", name: "社会心理", difficulty: 0.48, prereqs: ["personality"],
    description: "态度、从众、群体行为" },
  // 工学新增 1：力学/机械/仪器/材料/能源/电子信息/土木/水利/测绘/化工/地质/矿业/纺织
  { id: "statics-basics", domain: "engineering-mechanics", name: "静力学基础", difficulty: 0.2, prereqs: [],
    description: "力与力系、受力分析、平衡方程" },
  { id: "mechanics-of-materials", domain: "engineering-mechanics", name: "材料力学", difficulty: 0.35, prereqs: ["statics-basics"],
    description: "应力与应变、轴力剪力弯矩" },
  { id: "bending-torsion", domain: "engineering-mechanics", name: "弯曲与扭转", difficulty: 0.42, prereqs: ["mechanics-of-materials"],
    description: "梁的弯曲、轴的扭转、变形计算" },
  { id: "strength-theory", domain: "engineering-mechanics", name: "强度理论", difficulty: 0.48, prereqs: ["bending-torsion"],
    description: "四大强度理论、强度校核" },
  { id: "structural-mechanics", domain: "engineering-mechanics", name: "结构力学初步", difficulty: 0.5, prereqs: ["bending-torsion"],
    description: "静定结构、影响线、超静定初步" },
  { id: "mech-eng-apps", domain: "engineering-mechanics", name: "工程力学应用", difficulty: 0.55, prereqs: ["strength-theory", "structural-mechanics"],
    description: "压杆稳定、疲劳、工程实例分析" },
  { id: "mech-principles", domain: "mechanical-engineering", name: "机械原理初步", difficulty: 0.2, prereqs: [],
    description: "机构与构件、自由度、运动简图" },
  { id: "common-mechanisms", domain: "mechanical-engineering", name: "常用机构", difficulty: 0.32, prereqs: ["mech-principles"],
    description: "连杆机构、凸轮机构、间歇运动机构" },
  { id: "gear-drive", domain: "mechanical-engineering", name: "齿轮传动", difficulty: 0.4, prereqs: ["common-mechanisms"],
    description: "齿轮啮合原理、传动比、轮系" },
  { id: "shaft-bearing", domain: "mechanical-engineering", name: "轴与轴承", difficulty: 0.45, prereqs: ["gear-drive"],
    description: "轴的结构设计、滚动轴承选型" },
  { id: "mech-drawing", domain: "mechanical-engineering", name: "机械制图", difficulty: 0.38, prereqs: ["mech-principles"],
    description: "三视图、剖视图、尺寸标注" },
  { id: "mech-design-process", domain: "mechanical-engineering", name: "机械设计流程", difficulty: 0.5, prereqs: ["shaft-bearing", "mech-drawing"],
    description: "设计任务书、方案选择、典型部件设计" },
  { id: "measurement-basics", domain: "instrumentation", name: "测量基础", difficulty: 0.2, prereqs: [],
    description: "测量单位与标准、测量系统组成" },
  { id: "error-theory", domain: "instrumentation", name: "误差理论", difficulty: 0.32, prereqs: ["measurement-basics"],
    description: "系统误差与随机误差、不确定度" },
  { id: "sensors", domain: "instrumentation", name: "传感器", difficulty: 0.4, prereqs: ["measurement-basics"],
    description: "电阻电容电感式、光电式、智能传感器" },
  { id: "signal-conditioning", domain: "instrumentation", name: "信号调理", difficulty: 0.42, prereqs: ["sensors"],
    description: "放大、滤波、模数转换" },
  { id: "typical-instruments", domain: "instrumentation", name: "典型仪器", difficulty: 0.48, prereqs: ["signal-conditioning"],
    description: "万用表、示波器、频谱分析仪" },
  { id: "smart-instruments", domain: "instrumentation", name: "智能仪器", difficulty: 0.55, prereqs: ["typical-instruments"],
    description: "虚拟仪器、嵌入式测量、物联网传感" },
  { id: "crystal-structure", domain: "materials-science", name: "晶体结构", difficulty: 0.2, prereqs: [],
    description: "晶格与晶胞、晶体缺陷" },
  { id: "phase-diagram", domain: "materials-science", name: "相图", difficulty: 0.35, prereqs: ["crystal-structure"],
    description: "二元相图、铁碳相图" },
  { id: "mech-properties", domain: "materials-science", name: "材料的力学性能", difficulty: 0.38, prereqs: ["crystal-structure"],
    description: "强度塑性韧性、硬度、疲劳" },
  { id: "metal-materials", domain: "materials-science", name: "金属材料", difficulty: 0.42, prereqs: ["phase-diagram"],
    description: "钢的热处理、合金钢、有色金属" },
  { id: "polymer-materials", domain: "materials-science", name: "高分子材料", difficulty: 0.45, prereqs: ["crystal-structure"],
    description: "高分子的结构、塑料橡胶纤维" },
  { id: "material-failure", domain: "materials-science", name: "材料失效", difficulty: 0.5, prereqs: ["mech-properties"],
    description: "断裂、腐蚀、磨损与防护" },
  { id: "energy-overview", domain: "energy-power", name: "能源概述", difficulty: 0.2, prereqs: [],
    description: "能源分类、一次与二次能源、能源结构" },
  { id: "thermodynamics-basics", domain: "energy-power", name: "热力学基础", difficulty: 0.35, prereqs: ["energy-overview"],
    description: "热力学定律、工质状态参数" },
  { id: "heat-transfer", domain: "energy-power", name: "传热学", difficulty: 0.42, prereqs: ["thermodynamics-basics"],
    description: "导热、对流、辐射换热" },
  { id: "power-cycles", domain: "energy-power", name: "动力循环", difficulty: 0.45, prereqs: ["thermodynamics-basics"],
    description: "蒸汽动力循环、燃气轮机、制冷循环" },
  { id: "boiler-turbine", domain: "energy-power", name: "锅炉与汽轮机", difficulty: 0.5, prereqs: ["power-cycles"],
    description: "锅炉原理、汽轮机结构与运行" },
  { id: "new-energy", domain: "energy-power", name: "新能源技术", difficulty: 0.5, prereqs: ["energy-overview"],
    description: "太阳能、风能、储能与氢能" },
  { id: "signals-systems", domain: "electronic-information", name: "信号与系统初步", difficulty: 0.25, prereqs: [],
    description: "信号分类、系统特性、频谱概念" },
  { id: "analog-circuits", domain: "electronic-information", name: "模拟电路", difficulty: 0.35, prereqs: ["signals-systems"],
    description: "二极管三极管、放大器、运放" },
  { id: "digital-circuits", domain: "electronic-information", name: "数字电路", difficulty: 0.38, prereqs: ["signals-systems"],
    description: "逻辑门、组合时序电路、触发器" },
  { id: "em-microwave", domain: "electronic-information", name: "电磁场与微波初步", difficulty: 0.45, prereqs: ["signals-systems"],
    description: "电磁波、传输线、天线基础" },
  { id: "communication-basics", domain: "electronic-information", name: "通信原理初步", difficulty: 0.48, prereqs: ["signals-systems"],
    description: "调制解调、信道容量、数字通信" },
  { id: "embedded-basics", domain: "electronic-information", name: "嵌入式基础", difficulty: 0.5, prereqs: ["digital-circuits"],
    description: "单片机、外设接口、嵌入式软件" },
  { id: "civil-overview", domain: "civil-engineering", name: "土木工程概述", difficulty: 0.2, prereqs: [],
    description: "土木工程的分支与成就、建设程序" },
  { id: "construction-materials", domain: "civil-engineering", name: "工程材料", difficulty: 0.3, prereqs: ["civil-overview"],
    description: "混凝土、钢材、砌体材料" },
  { id: "structural-load", domain: "civil-engineering", name: "结构荷载与设计", difficulty: 0.4, prereqs: ["construction-materials"],
    description: "荷载类型、极限状态设计法" },
  { id: "foundation-engineering", domain: "civil-engineering", name: "基础工程", difficulty: 0.45, prereqs: ["structural-load"],
    description: "地基土、浅基础、桩基础" },
  { id: "road-bridge", domain: "civil-engineering", name: "道路与桥梁", difficulty: 0.48, prereqs: ["structural-load"],
    description: "道路结构、桥梁类型、桥跨结构" },
  { id: "construction-tech", domain: "civil-engineering", name: "施工技术", difficulty: 0.5, prereqs: ["foundation-engineering"],
    description: "施工组织、混凝土施工、装配式建造" },
  { id: "hydrology-basics", domain: "hydraulic-engineering", name: "水文学基础", difficulty: 0.2, prereqs: [],
    description: "水循环、降水径流、水文计算" },
  { id: "hydraulics", domain: "hydraulic-engineering", name: "水力学", difficulty: 0.35, prereqs: ["hydrology-basics"],
    description: "静水压力、水流运动、管道明渠" },
  { id: "water-resources", domain: "hydraulic-engineering", name: "水资源", difficulty: 0.4, prereqs: ["hydrology-basics"],
    description: "水资源评价、供需平衡、节水" },
  { id: "dams-reservoirs", domain: "hydraulic-engineering", name: "水库与坝工", difficulty: 0.45, prereqs: ["hydraulics"],
    description: "坝型选择、土石坝混凝土坝、溢洪道" },
  { id: "irrigation-drainage", domain: "hydraulic-engineering", name: "灌溉与排水", difficulty: 0.45, prereqs: ["water-resources"],
    description: "灌溉制度、渠道系统、农田排水" },
  { id: "flood-control", domain: "hydraulic-engineering", name: "防洪工程", difficulty: 0.5, prereqs: ["dams-reservoirs"],
    description: "洪水特性、防洪体系、堤防与调度" },
  { id: "survey-basics", domain: "surveying", name: "测量基准", difficulty: 0.2, prereqs: [],
    description: "地球形状、坐标系、高程基准" },
  { id: "leveling", domain: "surveying", name: "水准测量", difficulty: 0.3, prereqs: ["survey-basics"],
    description: "水准仪、高程测量、误差改正" },
  { id: "angle-distance", domain: "surveying", name: "角度与距离测量", difficulty: 0.32, prereqs: ["survey-basics"],
    description: "经纬仪、全站仪、距离丈量" },
  { id: "control-survey", domain: "surveying", name: "控制测量", difficulty: 0.42, prereqs: ["angle-distance"],
    description: "导线测量、三角测量、控制网" },
  { id: "cartography", domain: "surveying", name: "地图制图", difficulty: 0.45, prereqs: ["control-survey"],
    description: "地形图测绘、专题地图、地图应用" },
  { id: "gnss-remote", domain: "surveying", name: "GNSS 与遥感", difficulty: 0.5, prereqs: ["control-survey"],
    description: "卫星定位、遥感影像、摄影测量" },
  { id: "chemeng-overview", domain: "chemical-engineering", name: "化工概述", difficulty: 0.2, prereqs: [],
    description: "化工过程、单元操作、工艺流程" },
  { id: "material-balance", domain: "chemical-engineering", name: "物料衡算", difficulty: 0.32, prereqs: ["chemeng-overview"],
    description: "质量守恒、物料衡算、能量衡算" },
  { id: "fluid-transport", domain: "chemical-engineering", name: "流体输送", difficulty: 0.4, prereqs: ["material-balance"],
    description: "流体流动、泵与风机、管路" },
  { id: "heat-mass-transfer", domain: "chemical-engineering", name: "传热与传质", difficulty: 0.45, prereqs: ["material-balance"],
    description: "换热器、吸收与精馏原理" },
  { id: "reactors", domain: "chemical-engineering", name: "反应器", difficulty: 0.48, prereqs: ["heat-mass-transfer"],
    description: "反应动力学、釜式管式反应器" },
  { id: "separation-processes", domain: "chemical-engineering", name: "分离过程", difficulty: 0.5, prereqs: ["heat-mass-transfer"],
    description: "精馏、吸收、萃取、干燥" },
  { id: "ore-deposits", domain: "mining-engineering", name: "矿床类型", difficulty: 0.2, prereqs: [],
    description: "矿床成因分类、矿体形态、储量" },
  { id: "mining-methods", domain: "mining-engineering", name: "矿山开采方法", difficulty: 0.35, prereqs: ["ore-deposits"],
    description: "露天开采、地下开采方法" },
  { id: "shaft-engineering", domain: "mining-engineering", name: "井巷工程", difficulty: 0.4, prereqs: ["mining-methods"],
    description: "井巷掘进、支护技术" },
  { id: "mine-ventilation", domain: "mining-engineering", name: "矿山通风", difficulty: 0.42, prereqs: ["shaft-engineering"],
    description: "通风系统、风量计算、瓦斯防治" },
  { id: "mine-safety", domain: "mining-engineering", name: "矿山安全", difficulty: 0.48, prereqs: ["mine-ventilation"],
    description: "冒顶、水害、火灾与粉尘防治" },
  { id: "mineral-processing", domain: "mining-engineering", name: "矿物加工", difficulty: 0.45, prereqs: ["ore-deposits"],
    description: "破碎磨矿、选矿方法、尾矿处理" },
  { id: "fiber-materials", domain: "textile-engineering", name: "纤维材料", difficulty: 0.2, prereqs: [],
    description: "天然纤维、化学纤维、纤维性能" },
  { id: "spinning", domain: "textile-engineering", name: "纺纱工艺", difficulty: 0.32, prereqs: ["fiber-materials"],
    description: "开清棉、梳理、并条粗纱细纱" },
  { id: "weaving", domain: "textile-engineering", name: "织造工艺", difficulty: 0.38, prereqs: ["spinning"],
    description: "整经浆纱、织机、织物组织" },
  { id: "knitting", domain: "textile-engineering", name: "针织", difficulty: 0.4, prereqs: ["fiber-materials"],
    description: "纬编经编、针织物结构" },
  { id: "dyeing-finishing", domain: "textile-engineering", name: "染整工艺", difficulty: 0.42, prereqs: ["weaving"],
    description: "前处理、染色、印花、后整理" },
  { id: "textile-new-materials", domain: "textile-engineering", name: "纺织新材料", difficulty: 0.5, prereqs: ["fiber-materials"],
    description: "功能性纤维、智能纺织品、产业用纺织品" },
  // 工学新增 2：轻工/交通运输/海洋工程/航空航天/核工程/农业工程/林业工程/环境/生物医学/食品/建筑/安全/生物工程
  { id: "light-industry-overview", domain: "light-industry", name: "轻工概述", difficulty: 0.2, prereqs: [],
    description: "轻工业的范围、产业链、发展趋势" },
  { id: "papermaking", domain: "light-industry", name: "造纸原理", difficulty: 0.35, prereqs: ["light-industry-overview"],
    description: "制浆、造纸工艺、纸张性能" },
  { id: "leather-tech", domain: "light-industry", name: "皮革工艺", difficulty: 0.4, prereqs: ["light-industry-overview"],
    description: "鞣制原理、皮革加工、皮革制品" },
  { id: "packaging-tech", domain: "light-industry", name: "包装工程", difficulty: 0.4, prereqs: ["light-industry-overview"],
    description: "包装材料、包装工艺、包装设计" },
  { id: "daily-chemicals", domain: "light-industry", name: "日用化学品", difficulty: 0.45, prereqs: ["light-industry-overview"],
    description: "洗涤剂、化妆品、香精香料" },
  { id: "light-industry-env", domain: "light-industry", name: "轻工环保", difficulty: 0.5, prereqs: ["papermaking", "leather-tech"],
    description: "轻工废水废气、清洁生产、循环经济" },
  { id: "transport-systems", domain: "transportation", name: "运输系统", difficulty: 0.2, prereqs: [],
    description: "五种运输方式、运输系统的组成与特性" },
  { id: "road-transport", domain: "transportation", name: "道路运输", difficulty: 0.32, prereqs: ["transport-systems"],
    description: "公路网、汽车运输组织、城市交通" },
  { id: "rail-transport", domain: "transportation", name: "铁路运输", difficulty: 0.38, prereqs: ["transport-systems"],
    description: "铁路线路、列车运行、高铁技术" },
  { id: "water-air-transport", domain: "transportation", name: "水运与航空", difficulty: 0.42, prereqs: ["transport-systems"],
    description: "港口与航道、船舶运输、航空运输" },
  { id: "transport-planning", domain: "transportation", name: "运输规划", difficulty: 0.48, prereqs: ["road-transport"],
    description: "交通需求预测、路网规划、运量分配" },
  { id: "transport-safety", domain: "transportation", name: "交通安全", difficulty: 0.5, prereqs: ["transport-planning"],
    description: "事故成因、安全管理、智能交通" },
  { id: "ship-basics", domain: "ocean-engineering", name: "船舶基础", difficulty: 0.2, prereqs: [],
    description: "船舶类型、船体结构、浮性稳性" },
  { id: "ship-resistance", domain: "ocean-engineering", name: "船舶阻力与推进", difficulty: 0.35, prereqs: ["ship-basics"],
    description: "阻力成分、螺旋桨原理、快速性" },
  { id: "ship-structure", domain: "ocean-engineering", name: "船体结构强度", difficulty: 0.42, prereqs: ["ship-basics"],
    description: "船体总纵强度、局部强度、结构设计" },
  { id: "offshore-platforms", domain: "ocean-engineering", name: "海洋平台", difficulty: 0.48, prereqs: ["ship-structure"],
    description: "固定式平台、浮式平台、系泊系统" },
  { id: "marine-resources-dev", domain: "ocean-engineering", name: "海洋资源开发", difficulty: 0.52, prereqs: ["offshore-platforms"],
    description: "海洋油气、深海采矿、海洋能" },
  { id: "ocean-robotics", domain: "ocean-engineering", name: "海洋智能装备", difficulty: 0.55, prereqs: ["offshore-platforms"],
    description: "水下机器人、无人船、海洋观测网" },
  { id: "aircraft-classification", domain: "aerospace", name: "航空器分类", difficulty: 0.2, prereqs: [],
    description: "飞机直升机分类、飞行环境、航空简史" },
  { id: "aerodynamics", domain: "aerospace", name: "空气动力学初步", difficulty: 0.35, prereqs: ["aircraft-classification"],
    description: "升力与阻力、翼型、飞行性能" },
  { id: "aircraft-structure", domain: "aerospace", name: "飞行器结构", difficulty: 0.42, prereqs: ["aerodynamics"],
    description: "机翼机身结构、材料与制造" },
  { id: "propulsion-systems", domain: "aerospace", name: "推进系统", difficulty: 0.45, prereqs: ["aerodynamics"],
    description: "喷气发动机原理、涡扇涡桨、火箭发动机" },
  { id: "spacecraft-orbit", domain: "aerospace", name: "航天器与轨道", difficulty: 0.5, prereqs: ["aerodynamics"],
    description: "轨道力学、卫星、载人航天" },
  { id: "aerospace-materials", domain: "aerospace", name: "航空航天材料", difficulty: 0.52, prereqs: ["aircraft-structure"],
    description: "铝合金、钛合金、复合材料" },
  { id: "nuclear-physics-basics", domain: "nuclear-engineering", name: "原子核物理基础", difficulty: 0.2, prereqs: [],
    description: "原子核结构、放射性、核衰变" },
  { id: "nuclear-reactions", domain: "nuclear-engineering", name: "核反应与中子物理", difficulty: 0.35, prereqs: ["nuclear-physics-basics"],
    description: "裂变聚变、中子慢化、链式反应" },
  { id: "nuclear-reactor", domain: "nuclear-engineering", name: "核反应堆", difficulty: 0.42, prereqs: ["nuclear-reactions"],
    description: "堆型、堆芯结构、反应性控制" },
  { id: "nuclear-power-plant", domain: "nuclear-engineering", name: "核电厂系统", difficulty: 0.48, prereqs: ["nuclear-reactor"],
    description: "一回路二回路、汽轮机、安全系统" },
  { id: "radiation-protection", domain: "nuclear-engineering", name: "辐射防护", difficulty: 0.45, prereqs: ["nuclear-physics-basics"],
    description: "剂量单位、防护原则、屏蔽设计" },
  { id: "nuclear-applications", domain: "nuclear-engineering", name: "核技术应用", difficulty: 0.5, prereqs: ["nuclear-reactions"],
    description: "同位素、辐照加工、核医学" },
  { id: "agri-eng-basics", domain: "agri-engineering", name: "农业工程基础", difficulty: 0.2, prereqs: [],
    description: "农业工程的范畴、农业现代化" },
  { id: "agri-mechanization", domain: "agri-engineering", name: "农业机械化", difficulty: 0.35, prereqs: ["agri-eng-basics"],
    description: "拖拉机、耕作机械、收获机械" },
  { id: "agri-electrification", domain: "agri-engineering", name: "农业电气化", difficulty: 0.4, prereqs: ["agri-eng-basics"],
    description: "农村电力、灌溉电气、温室环境控制" },
  { id: "agri-buildings", domain: "agri-engineering", name: "农业建筑与环境", difficulty: 0.42, prereqs: ["agri-eng-basics"],
    description: "畜禽舍、温室结构、环境调控" },
  { id: "agri-water", domain: "agri-engineering", name: "农业水利", difficulty: 0.45, prereqs: ["agri-electrification"],
    description: "农田水利、喷灌滴灌、水土保持" },
  { id: "smart-agri-equipment", domain: "agri-engineering", name: "农业智能装备", difficulty: 0.55, prereqs: ["agri-mechanization"],
    description: "精准农业、无人农机、农业机器人" },
  { id: "forest-eng-basics", domain: "forestry-engineering", name: "森林工程基础", difficulty: 0.2, prereqs: [],
    description: "森林工程范畴、林区道路、采运作业" },
  { id: "wood-science", domain: "forestry-engineering", name: "木材科学", difficulty: 0.35, prereqs: ["forest-eng-basics"],
    description: "木材构造、物理力学性质、干燥" },
  { id: "wood-processing", domain: "forestry-engineering", name: "木材加工", difficulty: 0.42, prereqs: ["wood-science"],
    description: "制材、人造板、胶合技术" },
  { id: "forest-chemicals", domain: "forestry-engineering", name: "林产化工", difficulty: 0.45, prereqs: ["forest-eng-basics"],
    description: "松香、活性炭、木浆造纸" },
  { id: "furniture-design", domain: "forestry-engineering", name: "家具设计与工程", difficulty: 0.5, prereqs: ["wood-processing"],
    description: "家具结构、材料、制造工艺" },
  { id: "wood-construction", domain: "forestry-engineering", name: "木结构建筑", difficulty: 0.55, prereqs: ["wood-processing"],
    description: "木结构体系、构件连接、现代木建筑" },
  { id: "env-problems", domain: "environmental-science", name: "环境问题", difficulty: 0.2, prereqs: [],
    description: "环境问题的由来、生态系统基础、环境伦理" },
  { id: "water-pollution", domain: "environmental-science", name: "水污染控制", difficulty: 0.35, prereqs: ["env-problems"],
    description: "水质指标、物理化学生物处理、再生水" },
  { id: "air-pollution", domain: "environmental-science", name: "大气污染控制", difficulty: 0.38, prereqs: ["env-problems"],
    description: "污染物来源、除尘脱硫脱硝" },
  { id: "solid-waste", domain: "environmental-science", name: "固体废物", difficulty: 0.4, prereqs: ["env-problems"],
    description: "垃圾分类、填埋焚烧、资源化" },
  { id: "env-monitoring", domain: "environmental-science", name: "环境监测", difficulty: 0.42, prereqs: ["water-pollution"],
    description: "采样与分析、在线监测、质量保证" },
  { id: "sustainable-dev", domain: "environmental-science", name: "可持续发展", difficulty: 0.5, prereqs: ["env-problems"],
    description: "清洁生产、碳达峰碳中和、循环经济" },
  { id: "biomechanics", domain: "biomedical-engineering", name: "生物力学", difficulty: 0.2, prereqs: [],
    description: "骨与关节力学、血流动力学、步态" },
  { id: "biomaterials", domain: "biomedical-engineering", name: "生物材料", difficulty: 0.35, prereqs: ["biomechanics"],
    description: "生物相容性、金属陶瓷高分子材料" },
  { id: "medical-imaging", domain: "biomedical-engineering", name: "医学影像", difficulty: 0.42, prereqs: ["biomechanics"],
    description: "X 光 CT、超声、磁共振成像原理" },
  { id: "biosignals", domain: "biomedical-engineering", name: "生物信号", difficulty: 0.45, prereqs: ["biomechanics"],
    description: "心电脑电、信号采集与处理" },
  { id: "artificial-organs", domain: "biomedical-engineering", name: "人工器官", difficulty: 0.5, prereqs: ["biomaterials"],
    description: "人工心脏、人工关节、透析" },
  { id: "medical-devices", domain: "biomedical-engineering", name: "医疗器械", difficulty: 0.52, prereqs: ["medical-imaging"],
    description: "器械分类、注册监管、创新设计" },
  { id: "food-components", domain: "food-science", name: "食品成分", difficulty: 0.2, prereqs: [],
    description: "水分蛋白质脂肪碳水化合物、维生素矿物质" },
  { id: "food-preservation", domain: "food-science", name: "食品保藏原理", difficulty: 0.35, prereqs: ["food-components"],
    description: "微生物与食品腐败、低温干燥保藏、防腐剂" },
  { id: "food-processing", domain: "food-science", name: "食品加工", difficulty: 0.42, prereqs: ["food-preservation"],
    description: "热加工、发酵、挤压、速冻" },
  { id: "food-safety", domain: "food-science", name: "食品安全", difficulty: 0.45, prereqs: ["food-preservation"],
    description: "食源性疾病、危害分析、质量体系" },
  { id: "food-nutrition", domain: "food-science", name: "食品营养", difficulty: 0.42, prereqs: ["food-components"],
    description: "营养需要、膳食指南、功能食品" },
  { id: "food-regulations", domain: "food-science", name: "食品法规", difficulty: 0.5, prereqs: ["food-safety"],
    description: "食品安全法、标准体系、标签管理" },
  { id: "arch-history", domain: "architecture", name: "建筑历史", difficulty: 0.2, prereqs: [],
    description: "中外建筑史、经典建筑、风格流派" },
  { id: "arch-space", domain: "architecture", name: "建筑空间与功能", difficulty: 0.35, prereqs: ["arch-history"],
    description: "空间构成、功能组织、流线设计" },
  { id: "arch-design", domain: "architecture", name: "建筑设计方法", difficulty: 0.42, prereqs: ["arch-space"],
    description: "设计过程、场地分析、方案表达" },
  { id: "arch-structure", domain: "architecture", name: "建筑结构", difficulty: 0.45, prereqs: ["arch-space"],
    description: "结构选型、框架剪力墙、大跨结构" },
  { id: "arch-materials", domain: "architecture", name: "建筑材料", difficulty: 0.4, prereqs: ["arch-history"],
    description: "混凝土、钢材、玻璃、新型材料" },
  { id: "city-architecture", domain: "architecture", name: "城市与建筑", difficulty: 0.5, prereqs: ["arch-design"],
    description: "城市规划初步、城市设计、遗产保护" },
  { id: "safety-science-basics", domain: "safety-engineering", name: "安全科学基础", difficulty: 0.2, prereqs: [],
    description: "事故致因理论、安全原理、法规体系" },
  { id: "risk-assessment", domain: "safety-engineering", name: "风险评估", difficulty: 0.35, prereqs: ["safety-science-basics"],
    description: "危险源辨识、风险评价方法、分级管控" },
  { id: "fire-safety", domain: "safety-engineering", name: "消防安全", difficulty: 0.4, prereqs: ["safety-science-basics"],
    description: "燃烧原理、防火设计、灭火系统" },
  { id: "industrial-safety", domain: "safety-engineering", name: "工业安全", difficulty: 0.45, prereqs: ["risk-assessment"],
    description: "机械电气安全、特种设备、职业健康" },
  { id: "emergency-mgmt", domain: "safety-engineering", name: "应急管理", difficulty: 0.5, prereqs: ["risk-assessment"],
    description: "应急预案、演练、应急响应" },
  { id: "safety-tech", domain: "safety-engineering", name: "安全技术前沿", difficulty: 0.55, prereqs: ["industrial-safety"],
    description: "智能监测、安全物联网、安全大数据" },
  { id: "bioeng-basics", domain: "bio-engineering", name: "工程生物学基础", difficulty: 0.2, prereqs: [],
    description: "微生物细胞基础、生物反应计量、无菌技术" },
  { id: "fermentation", domain: "bio-engineering", name: "发酵工程", difficulty: 0.35, prereqs: ["bioeng-basics"],
    description: "发酵过程、生物反应器、工艺控制" },
  { id: "enzyme-engineering", domain: "bio-engineering", name: "酶工程", difficulty: 0.4, prereqs: ["bioeng-basics"],
    description: "酶动力学、固定化、酶的应用" },
  { id: "gene-engineering", domain: "bio-engineering", name: "基因工程", difficulty: 0.45, prereqs: ["bioeng-basics"],
    description: "基因克隆、表达系统、转基因" },
  { id: "cell-engineering", domain: "bio-engineering", name: "细胞工程", difficulty: 0.45, prereqs: ["bioeng-basics"],
    description: "细胞培养、融合、单克隆抗体" },
  { id: "bioseparation", domain: "bio-engineering", name: "生物分离", difficulty: 0.5, prereqs: ["fermentation"],
    description: "过滤离心、层析、干燥成型" },
  // 农学新增：自然保护/动物生产/动物医学/林学/水产/草学
  { id: "eco-protection", domain: "nature-conservation", name: "生态系统与保护", difficulty: 0.2, prereqs: [],
    description: "生态系统服务、生物多样性、保护地体系" },
  { id: "wildlife-mgmt", domain: "nature-conservation", name: "野生动物管理", difficulty: 0.35, prereqs: ["eco-protection"],
    description: "种群监测、栖息地管理、珍稀物种保护" },
  { id: "wetland-ecology", domain: "nature-conservation", name: "湿地生态", difficulty: 0.4, prereqs: ["eco-protection"],
    description: "湿地类型与功能、湿地恢复" },
  { id: "grassland-desert", domain: "nature-conservation", name: "草地与荒漠生态", difficulty: 0.42, prereqs: ["eco-protection"],
    description: "草地退化、荒漠化防治、封育管理" },
  { id: "nature-reserve", domain: "nature-conservation", name: "自然保护地管理", difficulty: 0.48, prereqs: ["wildlife-mgmt"],
    description: "国家公园、保护区规划、社区共管" },
  { id: "eco-restoration", domain: "nature-conservation", name: "生态修复", difficulty: 0.5, prereqs: ["wetland-ecology", "grassland-desert"],
    description: "受损生态系统诊断、修复技术、成效评估" },
  { id: "livestock-physiology", domain: "animal-science", name: "家畜生理基础", difficulty: 0.2, prereqs: [],
    description: "消化生理、繁殖生理、泌乳" },
  { id: "feed-nutrition", domain: "animal-science", name: "饲料与营养", difficulty: 0.35, prereqs: ["livestock-physiology"],
    description: "饲料成分、营养需要、日粮配合" },
  { id: "animal-breeding", domain: "animal-science", name: "遗传育种", difficulty: 0.4, prereqs: ["livestock-physiology"],
    description: "遗传基础、选择方法、杂交利用" },
  { id: "reproduction-tech", domain: "animal-science", name: "繁殖技术", difficulty: 0.42, prereqs: ["livestock-physiology"],
    description: "发情鉴定、人工授精、胚胎移植" },
  { id: "feeding-management", domain: "animal-science", name: "饲养管理", difficulty: 0.45, prereqs: ["feed-nutrition"],
    description: "各畜种饲养、环境控制、福利养殖" },
  { id: "farm-management", domain: "animal-science", name: "牧场经营", difficulty: 0.5, prereqs: ["feeding-management"],
    description: "规模养殖、成本核算、智能化管理" },
  { id: "vet-anatomy", domain: "veterinary", name: "动物解剖生理", difficulty: 0.2, prereqs: [],
    description: "家畜解剖、生理机能" },
  { id: "vet-pathology", domain: "veterinary", name: "兽医病理基础", difficulty: 0.35, prereqs: ["vet-anatomy"],
    description: "病变过程、炎症、肿瘤" },
  { id: "vet-diagnostics", domain: "veterinary", name: "兽医诊断学", difficulty: 0.4, prereqs: ["vet-pathology"],
    description: "临床检查、实验室检验、影像诊断" },
  { id: "infectious-diseases", domain: "veterinary", name: "传染病防治", difficulty: 0.45, prereqs: ["vet-diagnostics"],
    description: "主要畜禽传染病、免疫接种、扑灭措施" },
  { id: "parasitic-diseases", domain: "veterinary", name: "寄生虫病", difficulty: 0.45, prereqs: ["vet-diagnostics"],
    description: "蠕虫、原虫、体外寄生虫" },
  { id: "vet-public-health", domain: "veterinary", name: "兽医公共卫生", difficulty: 0.5, prereqs: ["infectious-diseases"],
    description: "人畜共患病、检疫、动物源性食品安全" },
  { id: "forest-ecology", domain: "forestry", name: "森林生态", difficulty: 0.2, prereqs: [],
    description: "森林生态系统、群落演替、森林功能" },
  { id: "tree-breeding", domain: "forestry", name: "林木育种", difficulty: 0.35, prereqs: ["forest-ecology"],
    description: "种源选择、杂交育种、良种繁育" },
  { id: "silviculture", domain: "forestry", name: "造林学", difficulty: 0.4, prereqs: ["tree-breeding"],
    description: "种苗培育、造林技术、抚育管理" },
  { id: "forest-management", domain: "forestry", name: "森林经营", difficulty: 0.42, prereqs: ["forest-ecology"],
    description: "林分调查、经营规划、采伐更新" },
  { id: "forest-protection", domain: "forestry", name: "森林保护", difficulty: 0.45, prereqs: ["forest-ecology"],
    description: "森林病虫害、森林防火" },
  { id: "forestry-economics", domain: "forestry", name: "林业经济与可持续", difficulty: 0.5, prereqs: ["forest-management"],
    description: "林业经济、森林碳汇、可持续经营" },
  { id: "aquatic-biology", domain: "aquaculture", name: "水产生物学", difficulty: 0.2, prereqs: [],
    description: "鱼类生物学、繁殖习性、主要养殖品种" },
  { id: "water-quality", domain: "aquaculture", name: "水质管理", difficulty: 0.35, prereqs: ["aquatic-biology"],
    description: "溶解氧、氨氮、池塘生态调控" },
  { id: "fish-farming", domain: "aquaculture", name: "鱼类养殖", difficulty: 0.4, prereqs: ["water-quality"],
    description: "池塘养殖、网箱工厂化养殖、增殖放流" },
  { id: "aquatic-diseases", domain: "aquaculture", name: "病害防治", difficulty: 0.45, prereqs: ["fish-farming"],
    description: "常见鱼病、诊断、药物与免疫防治" },
  { id: "aquafeed", domain: "aquaculture", name: "饲料与营养", difficulty: 0.42, prereqs: ["aquatic-biology"],
    description: "水产饲料、营养需求、投喂管理" },
  { id: "facility-aquaculture", domain: "aquaculture", name: "设施渔业", difficulty: 0.5, prereqs: ["fish-farming"],
    description: "循环水养殖、智能投喂、智慧渔场" },
  { id: "grassland-science-basics", domain: "grassland-science", name: "草地资源与生态", difficulty: 0.2, prereqs: [],
    description: "草地类型、草地生态系统、牧草基础" },
  { id: "forage-cultivation", domain: "grassland-science", name: "牧草栽培", difficulty: 0.35, prereqs: ["grassland-science-basics"],
    description: "牧草品种、栽培技术、饲草加工" },
  { id: "grassland-mgmt", domain: "grassland-science", name: "草地管理", difficulty: 0.4, prereqs: ["grassland-science-basics"],
    description: "放牧制度、草地改良、合理利用" },
  { id: "turf-science", domain: "grassland-science", name: "草坪学", difficulty: 0.42, prereqs: ["forage-cultivation"],
    description: "草坪建植、养护管理、运动场草坪" },
  { id: "grassland-degradation", domain: "grassland-science", name: "草地退化与恢复", difficulty: 0.48, prereqs: ["grassland-mgmt"],
    description: "退化机制、封育补播、生态恢复" },
  { id: "grassland-livestock", domain: "grassland-science", name: "草畜平衡", difficulty: 0.5, prereqs: ["grassland-mgmt"],
    description: "载畜量、草畜平衡、草原生态奖补" },
  // 医学新增：临床/口腔/公卫/中医/中西医/药学/中药/医学技术/护理
  { id: "clinical-diagnosis", domain: "clinical-medicine", name: "疾病诊断基础", difficulty: 0.2, prereqs: [],
    description: "问诊、体格检查、辅助检查选择" },
  { id: "internal-diseases", domain: "clinical-medicine", name: "常见内科疾病", difficulty: 0.4, prereqs: ["clinical-diagnosis"],
    description: "呼吸循环消化系统常见病、诊治思路" },
  { id: "surgery-basics", domain: "clinical-medicine", name: "外科基础", difficulty: 0.42, prereqs: ["clinical-diagnosis"],
    description: "无菌术、创伤处理、围手术期管理" },
  { id: "obgyn-pediatrics", domain: "clinical-medicine", name: "妇产儿科基础", difficulty: 0.48, prereqs: ["clinical-diagnosis"],
    description: "正常分娩、孕期保健、儿科特点" },
  { id: "emergency-medicine", domain: "clinical-medicine", name: "急救医学", difficulty: 0.5, prereqs: ["internal-diseases"],
    description: "心肺复苏、休克、中毒处理" },
  { id: "clinical-thinking", domain: "clinical-medicine", name: "临床思维", difficulty: 0.55, prereqs: ["internal-diseases", "surgery-basics"],
    description: "诊断推理、鉴别诊断、循证医学" },
  { id: "oral-anatomy", domain: "stomatology", name: "口腔解剖生理", difficulty: 0.2, prereqs: [],
    description: "牙体解剖、口腔颌面部结构、咀嚼功能" },
  { id: "dental-caries", domain: "stomatology", name: "龋病与牙体牙髓病", difficulty: 0.35, prereqs: ["oral-anatomy"],
    description: "龋病病因、充填、根管治疗" },
  { id: "periodontal-disease", domain: "stomatology", name: "牙周病", difficulty: 0.4, prereqs: ["oral-anatomy"],
    description: "牙龈炎牙周炎、基础治疗、维护" },
  { id: "oral-surgery", domain: "stomatology", name: "口腔颌面外科基础", difficulty: 0.45, prereqs: ["oral-anatomy"],
    description: "拔牙、麻醉、颌面部感染与损伤" },
  { id: "prosthodontics", domain: "stomatology", name: "口腔修复", difficulty: 0.48, prereqs: ["dental-caries"],
    description: "义齿修复、种植牙初步" },
  { id: "orthodontics", domain: "stomatology", name: "口腔正畸", difficulty: 0.5, prereqs: ["oral-anatomy"],
    description: "错颌畸形、矫治器、正畸原理" },
  { id: "epidemiology-basics", domain: "public-health", name: "流行病学基础", difficulty: 0.2, prereqs: [],
    description: "疾病分布、病因推断、流行病学研究设计" },
  { id: "health-statistics", domain: "public-health", name: "卫生统计", difficulty: 0.35, prereqs: ["epidemiology-basics"],
    description: "统计描述、统计推断、生命统计" },
  { id: "environmental-health", domain: "public-health", name: "环境卫生", difficulty: 0.4, prereqs: ["epidemiology-basics"],
    description: "空气水土壤与健康、公共场所卫生" },
  { id: "occupational-health", domain: "public-health", name: "职业卫生", difficulty: 0.42, prereqs: ["environmental-health"],
    description: "职业危害因素、职业病、防护" },
  { id: "nutrition-food-hygiene", domain: "public-health", name: "营养与食品卫生", difficulty: 0.42, prereqs: ["epidemiology-basics"],
    description: "合理营养、食品安全、食源性疾病" },
  { id: "disease-control", domain: "public-health", name: "传染病防控", difficulty: 0.5, prereqs: ["epidemiology-basics"],
    description: "传染病流行三环节、免疫规划、突发公卫事件" },
  { id: "yinyang-wuxing", domain: "tcm", name: "阴阳五行", difficulty: 0.2, prereqs: [],
    description: "阴阳学说、五行学说、整体观念" },
  { id: "zangxiang", domain: "tcm", name: "藏象学说", difficulty: 0.35, prereqs: ["yinyang-wuxing"],
    description: "五脏六腑、气血津液" },
  { id: "meridians", domain: "tcm", name: "经络", difficulty: 0.4, prereqs: ["zangxiang"],
    description: "经络系统、腧穴、针刺原理" },
  { id: "bianzheng", domain: "tcm", name: "辨证论治", difficulty: 0.45, prereqs: ["zangxiang"],
    description: "八纲辨证、脏腑辨证、治法总则" },
  { id: "herbal-formula", domain: "tcm", name: "中药与方剂", difficulty: 0.45, prereqs: ["bianzheng"],
    description: "四气五味、常用方剂、配伍" },
  { id: "tcm-clinical", domain: "tcm", name: "中医临床入门", difficulty: 0.5, prereqs: ["bianzheng", "herbal-formula"],
    description: "常见病证的中医诊治思路" },
  { id: "integrative-basics", domain: "integrative-medicine", name: "中西医结合基础", difficulty: 0.25, prereqs: [],
    description: "中西医方法论比较、结合的历史与模式" },
  { id: "integrative-diagnosis", domain: "integrative-medicine", name: "中西医结合诊断", difficulty: 0.38, prereqs: ["integrative-basics"],
    description: "病证结合、微观辨证、影像与舌脉结合" },
  { id: "integrative-treatment", domain: "integrative-medicine", name: "中西医结合治疗", difficulty: 0.45, prereqs: ["integrative-diagnosis"],
    description: "中西药联用、结合治疗策略、优势病种" },
  { id: "integrative-research", domain: "integrative-medicine", name: "中西医结合研究", difficulty: 0.5, prereqs: ["integrative-basics"],
    description: "证候本质研究、中药现代化、循证评价" },
  { id: "integrative-education", domain: "integrative-medicine", name: "中西医结合教育与发展", difficulty: 0.55, prereqs: ["integrative-treatment"],
    description: "人才培养、学科发展、国际传播" },
  { id: "drug-action", domain: "pharmacy", name: "药物作用基础", difficulty: 0.2, prereqs: [],
    description: "药物与受体、量效关系、不良反应" },
  { id: "pharmacokinetics", domain: "pharmacy", name: "药代动力学", difficulty: 0.35, prereqs: ["drug-action"],
    description: "吸收分布代谢排泄、半衰期、生物利用度" },
  { id: "medicinal-chemistry", domain: "pharmacy", name: "药物化学", difficulty: 0.42, prereqs: ["drug-action"],
    description: "药物结构、构效关系、药物设计" },
  { id: "pharmaceutics", domain: "pharmacy", name: "药剂学", difficulty: 0.45, prereqs: ["pharmacokinetics"],
    description: "剂型设计、片剂胶囊注射剂、缓控释" },
  { id: "pharmacology", domain: "pharmacy", name: "药理学", difficulty: 0.45, prereqs: ["drug-action"],
    description: "药物分类、作用机制、临床用药" },
  { id: "rational-drug-use", domain: "pharmacy", name: "药品管理与合理用药", difficulty: 0.5, prereqs: ["pharmacology"],
    description: "处方审核、抗菌药管理、药事法规" },
  { id: "tcm-pharmacy-basics", domain: "tcm-pharmacy", name: "中药学基础", difficulty: 0.2, prereqs: [],
    description: "中药性能、道地药材、炮制目的" },
  { id: "tcm-identification", domain: "tcm-pharmacy", name: "中药鉴定", difficulty: 0.35, prereqs: ["tcm-pharmacy-basics"],
    description: "性状显微鉴定、理化鉴别、质量标准" },
  { id: "tcm-processing", domain: "tcm-pharmacy", name: "中药炮制", difficulty: 0.4, prereqs: ["tcm-pharmacy-basics"],
    description: "炮制方法、炮制对药性的影响" },
  { id: "tcm-preparations", domain: "tcm-pharmacy", name: "中药制剂", difficulty: 0.45, prereqs: ["tcm-processing"],
    description: "汤剂丸散膏丹、现代中药制剂" },
  { id: "tcm-analysis", domain: "tcm-pharmacy", name: "中药分析", difficulty: 0.48, prereqs: ["tcm-identification"],
    description: "有效成分、含量测定、指纹图谱" },
  { id: "tcm-resource", domain: "tcm-pharmacy", name: "中药资源", difficulty: 0.5, prereqs: ["tcm-identification"],
    description: "资源分布、保护、可持续利用" },
  { id: "medtech-basics", domain: "medical-technology", name: "医学检验基础", difficulty: 0.2, prereqs: [],
    description: "标本采集、检验项目、质量控制" },
  { id: "clinical-lab", domain: "medical-technology", name: "临床检验", difficulty: 0.35, prereqs: ["medtech-basics"],
    description: "血尿便常规、生化检验、结果解读" },
  { id: "immunoassay", domain: "medical-technology", name: "免疫检验", difficulty: 0.42, prereqs: ["clinical-lab"],
    description: "抗原抗体反应、免疫标记技术" },
  { id: "microbio-lab", domain: "medical-technology", name: "微生物检验", difficulty: 0.42, prereqs: ["medtech-basics"],
    description: "细菌培养鉴定、药敏试验、病原检测" },
  { id: "imaging-tech", domain: "medical-technology", name: "医学影像技术", difficulty: 0.45, prereqs: ["medtech-basics"],
    description: "X 光 CT 磁共振操作、辐射防护" },
  { id: "rehab-tech", domain: "medical-technology", name: "康复治疗技术", difficulty: 0.5, prereqs: ["medtech-basics"],
    description: "物理治疗、作业治疗、康复评定" },
  { id: "nursing-theory", domain: "nursing", name: "护理理论", difficulty: 0.2, prereqs: [],
    description: "护理概念、护理程序、护理模式" },
  { id: "basic-nursing", domain: "nursing", name: "基础护理技术", difficulty: 0.35, prereqs: ["nursing-theory"],
    description: "生命体征、给药、无菌技术、压疮护理" },
  { id: "medical-surgical-nursing", domain: "nursing", name: "内外科护理", difficulty: 0.45, prereqs: ["basic-nursing"],
    description: "围手术期护理、常见病护理" },
  { id: "emergency-nursing", domain: "nursing", name: "急救护理", difficulty: 0.48, prereqs: ["basic-nursing"],
    description: "急救流程、心肺复苏、创伤护理" },
  { id: "psychological-nursing", domain: "nursing", name: "心理护理", difficulty: 0.45, prereqs: ["nursing-theory"],
    description: "护患沟通、心理评估与干预" },
  { id: "nursing-ethics", domain: "nursing", name: "护理伦理", difficulty: 0.5, prereqs: ["nursing-theory"],
    description: "护理伦理原则、知情同意、职业法规" },
  // 管理学新增：管科/农经/公共/图书情报/物流/工业工程/电商/旅游
  { id: "or-linear-programming", domain: "management-science", name: "线性规划", difficulty: 0.25, prereqs: [],
    description: "建模、图解法、单纯形法" },
  { id: "or-duality", domain: "management-science", name: "对偶与灵敏度", difficulty: 0.4, prereqs: ["or-linear-programming"],
    description: "对偶问题、影子价格、灵敏度分析" },
  { id: "or-transportation", domain: "management-science", name: "运输与指派问题", difficulty: 0.42, prereqs: ["or-linear-programming"],
    description: "运输模型、指派问题、匈牙利法" },
  { id: "or-integer", domain: "management-science", name: "整数规划", difficulty: 0.48, prereqs: ["or-duality"],
    description: "整数规划建模、分支定界、0-1 规划" },
  { id: "or-network", domain: "management-science", name: "图与网络优化", difficulty: 0.5, prereqs: ["or-transportation"],
    description: "最短路、最大流、最小生成树、关键路径" },
  { id: "or-queueing", domain: "management-science", name: "排队论初步", difficulty: 0.55, prereqs: ["or-network"],
    description: "排队模型、性能指标、服务系统设计" },
  { id: "agri-econ-basics", domain: "agri-economics", name: "农业经济学基础", difficulty: 0.2, prereqs: [],
    description: "农业的特性、农产品供求、农业政策目标" },
  { id: "land-economics", domain: "agri-economics", name: "土地经济", difficulty: 0.35, prereqs: ["agri-econ-basics"],
    description: "土地制度、地租理论、土地流转" },
  { id: "agri-marketing", domain: "agri-economics", name: "农产品市场", difficulty: 0.42, prereqs: ["agri-econ-basics"],
    description: "农产品流通、价格波动、期货" },
  { id: "agri-policy", domain: "agri-economics", name: "农业政策", difficulty: 0.45, prereqs: ["agri-econ-basics"],
    description: "价格支持、补贴、粮食安全政策" },
  { id: "rural-development", domain: "agri-economics", name: "农村发展", difficulty: 0.5, prereqs: ["land-economics"],
    description: "农村劳动力、城乡融合、乡村振兴" },
  { id: "food-economics", domain: "agri-economics", name: "食物经济", difficulty: 0.52, prereqs: ["agri-marketing"],
    description: "食物消费、营养转型、食品产业链" },
  { id: "public-mgmt-basics", domain: "public-administration", name: "公共管理概念", difficulty: 0.2, prereqs: [],
    description: "公共管理与私人管理、公共管理理论演进" },
  { id: "government-functions", domain: "public-administration", name: "政府职能", difficulty: 0.35, prereqs: ["public-mgmt-basics"],
    description: "政府职能转变、公共服务、政府与市场" },
  { id: "public-policy", domain: "public-administration", name: "公共政策", difficulty: 0.42, prereqs: ["government-functions"],
    description: "政策过程、政策分析、政策评估" },
  { id: "public-hrm", domain: "public-administration", name: "公共部门人力资源管理", difficulty: 0.45, prereqs: ["public-mgmt-basics"],
    description: "公务员制度、绩效管理、薪酬" },
  { id: "public-finance", domain: "public-administration", name: "公共财政与预算", difficulty: 0.45, prereqs: ["government-functions"],
    description: "公共预算、政府采购、绩效预算" },
  { id: "governance", domain: "public-administration", name: "治理与绩效", difficulty: 0.52, prereqs: ["public-policy"],
    description: "治理理论、政府绩效评估、数字政府" },
  { id: "library-basics", domain: "library-science", name: "图书馆学基础", difficulty: 0.2, prereqs: [],
    description: "图书馆类型、职能、图书馆史" },
  { id: "information-organization", domain: "library-science", name: "信息组织", difficulty: 0.35, prereqs: ["library-basics"],
    description: "分类法、主题法、元数据编目" },
  { id: "information-retrieval", domain: "library-science", name: "信息检索", difficulty: 0.42, prereqs: ["information-organization"],
    description: "检索语言、数据库检索、网络信息检索" },
  { id: "digital-library", domain: "library-science", name: "数字图书馆", difficulty: 0.48, prereqs: ["information-organization"],
    description: "数字资源建设、知识服务、开放获取" },
  { id: "archive-mgmt", domain: "library-science", name: "档案管理", difficulty: 0.45, prereqs: ["library-basics"],
    description: "档案收集整理、保管、电子档案" },
  { id: "knowledge-services", domain: "library-science", name: "知识服务", difficulty: 0.55, prereqs: ["information-retrieval"],
    description: "参考咨询、学科服务、信息素养教育" },
  { id: "logistics-basics", domain: "logistics", name: "物流概念", difficulty: 0.2, prereqs: [],
    description: "物流定义、物流系统、物流发展" },
  { id: "transport-mgmt", domain: "logistics", name: "运输管理", difficulty: 0.35, prereqs: ["logistics-basics"],
    description: "运输方式选择、运输组织、运输成本" },
  { id: "warehouse-mgmt", domain: "logistics", name: "仓储管理", difficulty: 0.4, prereqs: ["logistics-basics"],
    description: "仓库规划、库存控制、仓储作业" },
  { id: "distribution-sc", domain: "logistics", name: "配送与供应链", difficulty: 0.45, prereqs: ["warehouse-mgmt"],
    description: "配送中心、供应链管理、牛鞭效应" },
  { id: "logistics-it", domain: "logistics", name: "物流信息技术", difficulty: 0.48, prereqs: ["transport-mgmt"],
    description: "条码 RFID、物流信息系统、智慧物流" },
  { id: "logistics-cost", domain: "logistics", name: "物流成本与服务", difficulty: 0.52, prereqs: ["distribution-sc"],
    description: "物流成本核算、服务水平、绿色物流" },
  { id: "ie-basics", domain: "industrial-engineering", name: "工业工程基础", difficulty: 0.2, prereqs: [],
    description: "工业工程范畴、效率思想、人因基础" },
  { id: "work-study", domain: "industrial-engineering", name: "工作研究", difficulty: 0.35, prereqs: ["ie-basics"],
    description: "方法研究、作业测定、标准时间" },
  { id: "facility-layout", domain: "industrial-engineering", name: "设施规划", difficulty: 0.42, prereqs: ["work-study"],
    description: "设施选址、布局设计、物料搬运" },
  { id: "production-planning", domain: "industrial-engineering", name: "生产计划与控制", difficulty: 0.45, prereqs: ["work-study"],
    description: "需求预测、主生产计划、排程" },
  { id: "quality-mgmt", domain: "industrial-engineering", name: "质量管理", difficulty: 0.45, prereqs: ["ie-basics"],
    description: "质量控制工具、六西格玛、质量管理体系" },
  { id: "lean-production", domain: "industrial-engineering", name: "精益生产", difficulty: 0.5, prereqs: ["production-planning", "quality-mgmt"],
    description: "丰田生产方式、价值流、持续改善" },
  { id: "ecommerce-models", domain: "e-commerce", name: "电子商务模式", difficulty: 0.2, prereqs: [],
    description: "B2B B2C C2C、平台经济、电商生态" },
  { id: "online-marketing", domain: "e-commerce", name: "网络营销", difficulty: 0.35, prereqs: ["ecommerce-models"],
    description: "搜索引擎营销、社交媒体、内容电商" },
  { id: "e-payment", domain: "e-commerce", name: "电子支付", difficulty: 0.4, prereqs: ["ecommerce-models"],
    description: "第三方支付、移动支付、支付安全" },
  { id: "e-supply-chain", domain: "e-commerce", name: "电商供应链与物流", difficulty: 0.45, prereqs: ["ecommerce-models"],
    description: "订单履约、仓储配送、跨境电商" },
  { id: "ecommerce-platform", domain: "e-commerce", name: "电商平台运营", difficulty: 0.48, prereqs: ["online-marketing"],
    description: "店铺运营、流量获取、数据分析" },
  { id: "ecommerce-law", domain: "e-commerce", name: "电商法规", difficulty: 0.5, prereqs: ["ecommerce-models"],
    description: "电子商务法、消费者保护、数据合规" },
  { id: "tourism-basics", domain: "tourism-management", name: "旅游概念", difficulty: 0.2, prereqs: [],
    description: "旅游的定义、旅游系统、旅游发展史" },
  { id: "tourism-resources", domain: "tourism-management", name: "旅游资源", difficulty: 0.35, prereqs: ["tourism-basics"],
    description: "资源分类与评价、世界遗产、保护利用" },
  { id: "tourism-planning", domain: "tourism-management", name: "旅游规划", difficulty: 0.42, prereqs: ["tourism-resources"],
    description: "旅游区规划、产品设计、容量管理" },
  { id: "hotel-mgmt", domain: "tourism-management", name: "酒店管理", difficulty: 0.45, prereqs: ["tourism-basics"],
    description: "前厅客房、餐饮管理、收益管理" },
  { id: "tourism-marketing", domain: "tourism-management", name: "旅游市场营销", difficulty: 0.45, prereqs: ["tourism-basics"],
    description: "旅游市场细分、目的地品牌、OTA" },
  { id: "sustainable-tourism", domain: "tourism-management", name: "可持续旅游", difficulty: 0.52, prereqs: ["tourism-planning"],
    description: "生态旅游、社区参与、负责任旅游" },
  // 艺术学新增：戏剧与影视学类/设计学类
  { id: "drama-basics", domain: "film-theater", name: "戏剧基本元素", difficulty: 0.2, prereqs: [],
    description: "戏剧的起源、剧本舞台表演、戏剧类型" },
  { id: "drama-history", domain: "film-theater", name: "戏剧史", difficulty: 0.35, prereqs: ["drama-basics"],
    description: "古希腊到现代、中国戏曲、话剧发展" },
  { id: "film-language", domain: "film-theater", name: "电影语言", difficulty: 0.4, prereqs: ["drama-basics"],
    description: "镜头、蒙太奇、场面调度、声音" },
  { id: "film-history", domain: "film-theater", name: "电影史", difficulty: 0.42, prereqs: ["film-language"],
    description: "电影诞生、经典时期、新浪潮与当代" },
  { id: "film-production", domain: "film-theater", name: "影视制作流程", difficulty: 0.48, prereqs: ["film-language"],
    description: "编剧、制片、拍摄、剪辑与发行" },
  { id: "film-criticism", domain: "film-theater", name: "影视批评", difficulty: 0.52, prereqs: ["film-history"],
    description: "批评方法、类型分析、影评写作" },
  { id: "design-concept", domain: "design", name: "设计概念", difficulty: 0.2, prereqs: [],
    description: "设计的定义、设计的功能与审美、设计伦理" },
  { id: "design-history", domain: "design", name: "设计史", difficulty: 0.35, prereqs: ["design-concept"],
    description: "工艺美术运动、包豪斯、现代主义与后现代" },
  { id: "visual-communication", domain: "design", name: "视觉传达", difficulty: 0.42, prereqs: ["design-history"],
    description: "字体版式、图形设计、品牌设计" },
  { id: "product-design", domain: "design", name: "产品设计", difficulty: 0.45, prereqs: ["design-concept"],
    description: "产品造型、人机工学、设计流程" },
  { id: "environmental-design", domain: "design", name: "环境设计", difficulty: 0.45, prereqs: ["design-concept"],
    description: "室内设计、景观设计、公共空间" },
  { id: "design-thinking", domain: "design", name: "设计思维与方法", difficulty: 0.5, prereqs: ["product-design"],
    description: "用户研究、原型迭代、设计管理" },
  // 工学补充：地质类（地质工程）
  { id: "engineering-geology", domain: "geological-engineering", name: "工程地质基础", difficulty: 0.2, prereqs: [],
    description: "岩土体的工程性质、地质构造与工程建设" },
  { id: "rock-soil-mechanics", domain: "geological-engineering", name: "岩土力学", difficulty: 0.35, prereqs: ["engineering-geology"],
    description: "土的力学性质、岩石强度、地基承载力" },
  { id: "geological-survey", domain: "geological-engineering", name: "地质勘查", difficulty: 0.4, prereqs: ["engineering-geology"],
    description: "钻探、物探、取样与试验" },
  { id: "slope-engineering", domain: "geological-engineering", name: "边坡工程", difficulty: 0.45, prereqs: ["rock-soil-mechanics"],
    description: "边坡稳定性分析、滑坡治理措施" },
  { id: "underground-engineering", domain: "geological-engineering", name: "地下工程", difficulty: 0.48, prereqs: ["rock-soil-mechanics"],
    description: "隧道与地下硐室、支护技术" },
  { id: "ground-improvement", domain: "geological-engineering", name: "地基处理", difficulty: 0.5, prereqs: ["rock-soil-mechanics"],
    description: "换填、强夯、桩基与复合地基" },
  // 计算机类扩充（CS 核心课程体系）：程序设计/离散数学/计算理论/编译原理/人工智能/信息安全/图形学/分布式/数据科学/面向对象
  { id: "prog-concepts", domain: "programming-basics", name: "程序与算法", difficulty: 0.2, prereqs: [],
    description: "程序是什么、算法与流程图、开发环境搭建" },
  { id: "variables-types", domain: "programming-basics", name: "变量与数据类型", difficulty: 0.3, prereqs: ["prog-concepts"],
    description: "变量与赋值、基本数据类型、类型转换与运算" },
  { id: "control-flow", domain: "programming-basics", name: "控制结构", difficulty: 0.32, prereqs: ["variables-types"],
    description: "顺序、分支、循环与嵌套控制" },
  { id: "functions", domain: "programming-basics", name: "函数", difficulty: 0.38, prereqs: ["control-flow"],
    description: "函数的定义与调用、参数与返回值、作用域" },
  { id: "arrays-strings", domain: "programming-basics", name: "数组与字符串", difficulty: 0.4, prereqs: ["functions"],
    description: "一维与多维数组、字符串操作、遍历技巧" },
  { id: "files-debug", domain: "programming-basics", name: "文件与调试", difficulty: 0.45, prereqs: ["functions"],
    description: "文件读写、异常处理、调试方法" },
  { id: "logic-proof", domain: "discrete-math", name: "命题与谓词逻辑", difficulty: 0.2, prereqs: [],
    description: "联结词、量词、推理规则与证明方法" },
  { id: "sets-relations", domain: "discrete-math", name: "集合与关系", difficulty: 0.3, prereqs: ["logic-proof"],
    description: "集合运算、关系的性质、等价与偏序" },
  { id: "functions-cardinality", domain: "discrete-math", name: "函数与基数", difficulty: 0.35, prereqs: ["sets-relations"],
    description: "函数的性质、可数与不可数集合" },
  { id: "graph-theory", domain: "discrete-math", name: "图论基础", difficulty: 0.4, prereqs: ["sets-relations"],
    description: "图的基本概念、树、欧拉与哈密顿路径" },
  { id: "combinatorics", domain: "discrete-math", name: "组合计数", difficulty: 0.38, prereqs: ["logic-proof"],
    description: "加法乘法原理、排列组合、容斥原理" },
  { id: "recurrence-induction", domain: "discrete-math", name: "递推与归纳", difficulty: 0.45, prereqs: ["combinatorics"],
    description: "数学归纳法、递推关系、生成函数初步" },
  { id: "automata", domain: "theory-of-computation", name: "自动机", difficulty: 0.35, prereqs: [],
    description: "有限自动机、DFA 与 NFA、等价性" },
  { id: "regular-languages", domain: "theory-of-computation", name: "正则语言", difficulty: 0.4, prereqs: ["automata"],
    description: "正则表达式、泵引理、非正则语言" },
  { id: "context-free", domain: "theory-of-computation", name: "上下文无关文法", difficulty: 0.45, prereqs: ["regular-languages"],
    description: "CFG、下推自动机、语法树" },
  { id: "turing-machine", domain: "theory-of-computation", name: "图灵机", difficulty: 0.5, prereqs: ["context-free"],
    description: "图灵机定义、丘奇-图灵论题、可判定性" },
  { id: "computability", domain: "theory-of-computation", name: "可计算性", difficulty: 0.55, prereqs: ["turing-machine"],
    description: "停机问题、可归约性、不可判定问题" },
  { id: "complexity-intro", domain: "theory-of-computation", name: "计算复杂性初步", difficulty: 0.55, prereqs: ["turing-machine"],
    description: "P 与 NP、NP 完全性" },
  { id: "lexical-analysis", domain: "compiler-principles", name: "词法分析", difficulty: 0.3, prereqs: [],
    description: "词法单元、正则与自动机、词法分析器生成" },
  { id: "syntax-analysis", domain: "compiler-principles", name: "语法分析", difficulty: 0.4, prereqs: ["lexical-analysis"],
    description: "上下文无关文法、LL 与 LR 分析" },
  { id: "semantic-analysis", domain: "compiler-principles", name: "语义分析", difficulty: 0.45, prereqs: ["syntax-analysis"],
    description: "类型检查、符号表、作用域规则" },
  { id: "intermediate-code", domain: "compiler-principles", name: "中间代码", difficulty: 0.48, prereqs: ["semantic-analysis"],
    description: "三地址码、中间表示" },
  { id: "code-optimization", domain: "compiler-principles", name: "代码优化", difficulty: 0.52, prereqs: ["intermediate-code"],
    description: "基本块、数据流分析、常见优化技术" },
  { id: "code-generation", domain: "compiler-principles", name: "代码生成", difficulty: 0.52, prereqs: ["intermediate-code"],
    description: "指令选择、寄存器分配、目标代码" },
  { id: "ai-overview", domain: "ai-intro", name: "人工智能概述", difficulty: 0.2, prereqs: [],
    description: "AI 的历史、研究领域、智能体概念" },
  { id: "search-algorithms", domain: "ai-intro", name: "搜索", difficulty: 0.35, prereqs: ["ai-overview"],
    description: "无信息搜索、启发式搜索、对抗搜索" },
  { id: "knowledge-representation", domain: "ai-intro", name: "知识表示", difficulty: 0.42, prereqs: ["ai-overview"],
    description: "逻辑表示、语义网、知识图谱" },
  { id: "machine-learning", domain: "ai-intro", name: "机器学习初步", difficulty: 0.45, prereqs: ["search-algorithms"],
    description: "监督与无监督学习、评估、过拟合" },
  { id: "neural-networks", domain: "ai-intro", name: "神经网络", difficulty: 0.52, prereqs: ["machine-learning"],
    description: "感知机、反向传播、深度学习初步" },
  { id: "ai-ethics", domain: "ai-intro", name: "人工智能伦理", difficulty: 0.5, prereqs: ["ai-overview"],
    description: "算法偏见、隐私保护、AI 治理" },
  { id: "crypto-basics", domain: "information-security", name: "密码学基础", difficulty: 0.3, prereqs: [],
    description: "对称加密、公钥密码、哈希函数" },
  { id: "authentication", domain: "information-security", name: "身份认证", difficulty: 0.38, prereqs: ["crypto-basics"],
    description: "口令、多因素认证、数字签名" },
  { id: "system-security", domain: "information-security", name: "系统安全", difficulty: 0.42, prereqs: ["crypto-basics"],
    description: "漏洞、恶意软件、访问控制" },
  { id: "network-security", domain: "information-security", name: "网络安全", difficulty: 0.45, prereqs: ["system-security"],
    description: "防火墙、入侵检测、VPN" },
  { id: "application-security", domain: "information-security", name: "应用安全", difficulty: 0.48, prereqs: ["network-security"],
    description: "Web 安全、代码安全、渗透测试" },
  { id: "security-governance", domain: "information-security", name: "安全治理", difficulty: 0.5, prereqs: ["crypto-basics"],
    description: "风险管理、安全标准、隐私法规" },
  { id: "graphics-systems", domain: "computer-graphics", name: "图形系统", difficulty: 0.3, prereqs: [],
    description: "图形管线、坐标系、显示设备" },
  { id: "transformations", domain: "computer-graphics", name: "几何变换", difficulty: 0.38, prereqs: ["graphics-systems"],
    description: "平移旋转缩放、齐次坐标、投影" },
  { id: "rasterization", domain: "computer-graphics", name: "光栅化", difficulty: 0.42, prereqs: ["transformations"],
    description: "直线与圆光栅化、裁剪、反走样" },
  { id: "lighting-shading", domain: "computer-graphics", name: "光照与着色", difficulty: 0.48, prereqs: ["rasterization"],
    description: "光照模型、着色方法、纹理映射" },
  { id: "curves-surfaces", domain: "computer-graphics", name: "曲线与曲面", difficulty: 0.5, prereqs: ["transformations"],
    description: "贝塞尔曲线、B 样条、曲面建模" },
  { id: "rendering-pipeline", domain: "computer-graphics", name: "渲染管线", difficulty: 0.55, prereqs: ["lighting-shading"],
    description: "实时渲染、光线追踪初步" },
  { id: "distributed-concepts", domain: "distributed-systems", name: "分布式概念", difficulty: 0.35, prereqs: [],
    description: "分布式系统特征、CAP 定理、时钟与序" },
  { id: "communication", domain: "distributed-systems", name: "分布式通信", difficulty: 0.42, prereqs: ["distributed-concepts"],
    description: "RPC、消息队列、序列化" },
  { id: "consistency", domain: "distributed-systems", name: "一致性", difficulty: 0.48, prereqs: ["communication"],
    description: "强一致与最终一致、共识算法初步" },
  { id: "replication", domain: "distributed-systems", name: "复制与容错", difficulty: 0.5, prereqs: ["consistency"],
    description: "主从复制、Paxos/Raft、故障恢复" },
  { id: "distributed-storage", domain: "distributed-systems", name: "分布式存储", difficulty: 0.52, prereqs: ["replication"],
    description: "分片、分布式文件系统、分布式 NoSQL" },
  { id: "cloud-microservices", domain: "distributed-systems", name: "微服务与云原生", difficulty: 0.55, prereqs: ["distributed-storage"],
    description: "微服务架构、容器编排、服务治理" },
  { id: "ds-process", domain: "data-science", name: "数据科学流程", difficulty: 0.2, prereqs: [],
    description: "数据科学生命周期、工具栈、问题定义" },
  { id: "data-collection", domain: "data-science", name: "数据采集与清洗", difficulty: 0.35, prereqs: ["ds-process"],
    description: "数据源、ETL、数据质量" },
  { id: "eda", domain: "data-science", name: "探索性数据分析", difficulty: 0.4, prereqs: ["data-collection"],
    description: "描述统计、数据可视化、相关分析" },
  { id: "statistical-modeling", domain: "data-science", name: "统计建模", difficulty: 0.45, prereqs: ["eda"],
    description: "回归与分类、评估指标、交叉验证" },
  { id: "ml-practice", domain: "data-science", name: "机器学习实战", difficulty: 0.52, prereqs: ["statistical-modeling"],
    description: "特征工程、模型选择、调参" },
  { id: "data-storytelling", domain: "data-science", name: "数据可视化与叙事", difficulty: 0.48, prereqs: ["eda"],
    description: "可视化原则、仪表盘、数据报告" },
  { id: "class-object", domain: "oop", name: "类与对象", difficulty: 0.25, prereqs: [],
    description: "封装、属性与方法、构造" },
  { id: "inheritance-polymorphism", domain: "oop", name: "继承与多态", difficulty: 0.35, prereqs: ["class-object"],
    description: "继承、方法重写、多态机制" },
  { id: "interface-abstraction", domain: "oop", name: "接口与抽象", difficulty: 0.4, prereqs: ["inheritance-polymorphism"],
    description: "抽象类、接口、组合优于继承" },
  { id: "exceptions", domain: "oop", name: "异常处理", difficulty: 0.42, prereqs: ["class-object"],
    description: "异常机制、自定义异常、资源管理" },
  { id: "collections", domain: "oop", name: "集合框架", difficulty: 0.45, prereqs: ["interface-abstraction"],
    description: "List/Map/Set、泛型、迭代器" },
  { id: "design-patterns", domain: "oop", name: "设计模式初步", difficulty: 0.5, prereqs: ["interface-abstraction"],
    description: "单例工厂观察者、模式思维" },
  // 理学扩充：数学/物理/化学/生物/统计/天文/心理/地理
  { id: "ode-basics", domain: "ode", name: "微分方程初步", difficulty: 0.35, prereqs: [],
    description: "微分方程的概念、分类与几何意义" },
  { id: "ode-first-order", domain: "ode", name: "一阶方程", difficulty: 0.42, prereqs: ["ode-basics"],
    description: "变量分离、线性方程与恰当方程" },
  { id: "ode-linear", domain: "ode", name: "线性微分方程", difficulty: 0.45, prereqs: ["ode-first-order"],
    description: "高阶线性方程与解的结构" },
  { id: "ode-laplace", domain: "ode", name: "拉普拉斯变换", difficulty: 0.5, prereqs: ["ode-linear"],
    description: "变换求解初值问题、传递函数" },
  { id: "ode-qualitative", domain: "ode", name: "定性理论", difficulty: 0.55, prereqs: ["ode-first-order"],
    description: "相平面、稳定性与极限环" },
  { id: "ode-numerical", domain: "ode", name: "数值解法", difficulty: 0.5, prereqs: ["ode-linear"],
    description: "欧拉法、龙格-库塔法" },
  { id: "ca-complex", domain: "complex-analysis", name: "复数与函数", difficulty: 0.35, prereqs: [],
    description: "复数运算、复函数与极限连续" },
  { id: "ca-analytic", domain: "complex-analysis", name: "解析函数", difficulty: 0.42, prereqs: ["ca-complex"],
    description: "柯西-黎曼方程、解析性与初等函数" },
  { id: "ca-integral", domain: "complex-analysis", name: "柯西积分", difficulty: 0.48, prereqs: ["ca-analytic"],
    description: "柯西积分定理、柯西积分公式" },
  { id: "ca-series", domain: "complex-analysis", name: "级数展开", difficulty: 0.5, prereqs: ["ca-integral"],
    description: "泰勒级数、洛朗展开与奇点" },
  { id: "ca-residue", domain: "complex-analysis", name: "留数定理", difficulty: 0.55, prereqs: ["ca-integral"],
    description: "留数计算、实积分与辐角原理" },
  { id: "ca-conformal", domain: "complex-analysis", name: "共形映射", difficulty: 0.55, prereqs: ["ca-analytic"],
    description: "分式线性变换、共形性与应用" },
  { id: "na-error", domain: "numerical-analysis", name: "误差与浮点", difficulty: 0.3, prereqs: [],
    description: "误差来源、浮点运算与稳定性" },
  { id: "na-interp", domain: "numerical-analysis", name: "插值与逼近", difficulty: 0.4, prereqs: ["na-error"],
    description: "拉格朗日插值、样条与最小二乘" },
  { id: "na-integration", domain: "numerical-analysis", name: "数值积分与微分", difficulty: 0.42, prereqs: ["na-interp"],
    description: "梯形公式、辛普森公式与高斯积分" },
  { id: "na-linear", domain: "numerical-analysis", name: "线性方程组求解", difficulty: 0.45, prereqs: ["na-error"],
    description: "高斯消元、LU 分解与迭代法" },
  { id: "na-eigen", domain: "numerical-analysis", name: "特征值计算", difficulty: 0.48, prereqs: ["na-linear"],
    description: "幂法、QR 算法" },
  { id: "na-ode", domain: "numerical-analysis", name: "微分方程数值解", difficulty: 0.5, prereqs: ["na-integration"],
    description: "初值问题与边值问题的数值方法" },
  { id: "th-temp", domain: "thermodynamics", name: "温度与热量", difficulty: 0.3, prereqs: [],
    description: "温度、热平衡与物态方程" },
  { id: "th-laws", domain: "thermodynamics", name: "热力学定律", difficulty: 0.4, prereqs: ["th-temp"],
    description: "热力学第一定律、热机与第二定律" },
  { id: "th-entropy", domain: "thermodynamics", name: "熵与自由能", difficulty: 0.45, prereqs: ["th-laws"],
    description: "熵的统计意义、自由能与平衡判据" },
  { id: "th-stat-basics", domain: "thermodynamics", name: "统计基础", difficulty: 0.48, prereqs: ["th-entropy"],
    description: "微观态、等概率原理与配分函数" },
  { id: "th-distribution", domain: "thermodynamics", name: "分布函数", difficulty: 0.52, prereqs: ["th-stat-basics"],
    description: "玻尔兹曼分布与统计系综" },
  { id: "th-quantum-stat", domain: "thermodynamics", name: "量子统计", difficulty: 0.55, prereqs: ["th-distribution"],
    description: "玻色统计、费米统计与低温现象" },
  { id: "qm-wavefunction", domain: "quantum-mechanics", name: "波函数与薛定谔方程", difficulty: 0.45, prereqs: [],
    description: "波粒二象性、波函数与薛定谔方程" },
  { id: "qm-operators", domain: "quantum-mechanics", name: "算符与力学量", difficulty: 0.5, prereqs: ["qm-wavefunction"],
    description: "算符、本征值与测量" },
  { id: "qm-1d", domain: "quantum-mechanics", name: "一维势问题", difficulty: 0.48, prereqs: ["qm-wavefunction"],
    description: "方势阱、势垒与谐振子" },
  { id: "qm-angular", domain: "quantum-mechanics", name: "角动量与自旋", difficulty: 0.55, prereqs: ["qm-operators"],
    description: "轨道角动量、自旋与耦合" },
  { id: "qm-hydrogen", domain: "quantum-mechanics", name: "氢原子", difficulty: 0.55, prereqs: ["qm-operators"],
    description: "氢原子能级、光谱与电子云" },
  { id: "qm-approximation", domain: "quantum-mechanics", name: "近似方法", difficulty: 0.58, prereqs: ["qm-hydrogen"],
    description: "微扰论、变分法与 WKB" },
  { id: "op-geometric", domain: "optics", name: "几何光学", difficulty: 0.35, prereqs: [],
    description: "反射折射、透镜成像与光学仪器" },
  { id: "op-wave", domain: "optics", name: "波动光学", difficulty: 0.42, prereqs: ["op-geometric"],
    description: "光的波动性、惠更斯原理" },
  { id: "op-interference", domain: "optics", name: "干涉", difficulty: 0.45, prereqs: ["op-wave"],
    description: "双缝干涉、薄膜干涉与干涉仪" },
  { id: "op-diffraction", domain: "optics", name: "衍射", difficulty: 0.48, prereqs: ["op-wave"],
    description: "单缝衍射、光栅与分辨率" },
  { id: "op-polarization", domain: "optics", name: "偏振", difficulty: 0.5, prereqs: ["op-interference"],
    description: "偏振光、双折射与旋光" },
  { id: "op-modern", domain: "optics", name: "现代光学", difficulty: 0.55, prereqs: ["op-diffraction"],
    description: "激光、全息与光纤" },
  { id: "pc-thermo", domain: "physical-chemistry", name: "化学热力学", difficulty: 0.35, prereqs: [],
    description: "焓、熵与吉布斯自由能" },
  { id: "pc-equilibrium", domain: "physical-chemistry", name: "化学平衡", difficulty: 0.42, prereqs: ["pc-thermo"],
    description: "平衡常数、勒夏特列原理与相平衡" },
  { id: "pc-kinetics", domain: "physical-chemistry", name: "化学动力学", difficulty: 0.45, prereqs: ["pc-thermo"],
    description: "反应速率、速率方程与反应机理" },
  { id: "pc-electro", domain: "physical-chemistry", name: "电化学", difficulty: 0.48, prereqs: ["pc-kinetics"],
    description: "电极电势、电池与电解" },
  { id: "pc-surface", domain: "physical-chemistry", name: "表面与胶体", difficulty: 0.5, prereqs: ["pc-thermo"],
    description: "表面张力、吸附与胶体化学" },
  { id: "pc-quantum", domain: "physical-chemistry", name: "量子化学初步", difficulty: 0.55, prereqs: ["pc-kinetics"],
    description: "原子结构、分子轨道与光谱" },
  { id: "ac-error", domain: "analytical-chemistry", name: "误差与数据处理", difficulty: 0.3, prereqs: [],
    description: "误差分类、有效数字与显著性检验" },
  { id: "ac-titration", domain: "analytical-chemistry", name: "滴定分析", difficulty: 0.38, prereqs: ["ac-error"],
    description: "酸碱、配位与氧化还原滴定" },
  { id: "ac-spectroscopy", domain: "analytical-chemistry", name: "光谱分析", difficulty: 0.45, prereqs: ["ac-titration"],
    description: "紫外可见、红外与原子光谱" },
  { id: "ac-chromatography", domain: "analytical-chemistry", name: "色谱分析", difficulty: 0.45, prereqs: ["ac-error"],
    description: "气相、液相色谱与分离原理" },
  { id: "ac-electroanalysis", domain: "analytical-chemistry", name: "电分析", difficulty: 0.48, prereqs: ["ac-titration"],
    description: "电位法、伏安法与离子选择性电极" },
  { id: "ac-sample", domain: "analytical-chemistry", name: "样品前处理", difficulty: 0.5, prereqs: ["ac-spectroscopy"],
    description: "采样、消解、萃取与富集" },
  { id: "ge-mendel", domain: "genetics", name: "孟德尔遗传", difficulty: 0.3, prereqs: [],
    description: "分离定律、自由组合与基因互作" },
  { id: "ge-chromosome", domain: "genetics", name: "染色体遗传", difficulty: 0.38, prereqs: ["ge-mendel"],
    description: "连锁互换、染色体变异与核型" },
  { id: "ge-molecular", domain: "genetics", name: "分子遗传", difficulty: 0.45, prereqs: ["ge-chromosome"],
    description: "基因的本质、突变与修复" },
  { id: "ge-expression", domain: "genetics", name: "基因表达调控", difficulty: 0.5, prereqs: ["ge-molecular"],
    description: "原核真核表达调控、表观遗传" },
  { id: "ge-disease", domain: "genetics", name: "遗传病与诊断", difficulty: 0.48, prereqs: ["ge-molecular"],
    description: "遗传病类型、系谱分析与基因诊断" },
  { id: "ge-population", domain: "genetics", name: "群体与进化遗传", difficulty: 0.52, prereqs: ["ge-chromosome"],
    description: "哈代-温伯格平衡、遗传漂变与进化" },
  { id: "mb-dna", domain: "molecular-biology", name: "DNA 复制与修复", difficulty: 0.4, prereqs: [],
    description: "半保留复制、聚合酶与修复机制" },
  { id: "mb-transcription", domain: "molecular-biology", name: "转录与加工", difficulty: 0.45, prereqs: ["mb-dna"],
    description: "转录起始延伸终止、RNA 加工" },
  { id: "mb-translation", domain: "molecular-biology", name: "翻译与调控", difficulty: 0.48, prereqs: ["mb-transcription"],
    description: "遗传密码、核糖体与蛋白质合成" },
  { id: "mb-regulation", domain: "molecular-biology", name: "基因表达调控", difficulty: 0.52, prereqs: ["mb-translation"],
    description: "转录因子、信号通路与表观调控" },
  { id: "mb-engineering", domain: "molecular-biology", name: "基因工程", difficulty: 0.5, prereqs: ["mb-translation"],
    description: "克隆、PCR、CRISPR 与载体" },
  { id: "mb-omics", domain: "molecular-biology", name: "基因组学与组学", difficulty: 0.55, prereqs: ["mb-engineering"],
    description: "测序技术、基因组学与多组学" },
  { id: "eco-population", domain: "ecology", name: "种群生态", difficulty: 0.35, prereqs: [],
    description: "种群增长、生活史与种间关系" },
  { id: "eco-community", domain: "ecology", name: "群落生态", difficulty: 0.4, prereqs: ["eco-population"],
    description: "群落结构、演替与多样性" },
  { id: "eco-ecosystem", domain: "ecology", name: "生态系统", difficulty: 0.45, prereqs: ["eco-community"],
    description: "生态系统的结构与功能" },
  { id: "eco-energy", domain: "ecology", name: "能量流动与物质循环", difficulty: 0.48, prereqs: ["eco-ecosystem"],
    description: "食物链网、生态效率与生物地球化学循环" },
  { id: "eco-biodiversity", domain: "ecology", name: "生物多样性", difficulty: 0.5, prereqs: ["eco-ecosystem"],
    description: "多样性的层次、价值与保护" },
  { id: "eco-global", domain: "ecology", name: "全球生态学", difficulty: 0.52, prereqs: ["eco-biodiversity"],
    description: "气候变化、碳循环与全球变化" },
  { id: "ms-sampling", domain: "mathematical-statistics", name: "抽样分布", difficulty: 0.4, prereqs: [],
    description: "统计量、三大抽样分布" },
  { id: "ms-estimation", domain: "mathematical-statistics", name: "点估计", difficulty: 0.45, prereqs: ["ms-sampling"],
    description: "矩估计、极大似然与优良性" },
  { id: "ms-interval", domain: "mathematical-statistics", name: "区间估计", difficulty: 0.48, prereqs: ["ms-estimation"],
    description: "置信区间、枢轴量与正态总体" },
  { id: "ms-testing", domain: "mathematical-statistics", name: "假设检验", difficulty: 0.5, prereqs: ["ms-interval"],
    description: "两类错误、功效与常见检验" },
  { id: "ms-anova", domain: "mathematical-statistics", name: "方差分析", difficulty: 0.52, prereqs: ["ms-testing"],
    description: "单因素、双因素与多重比较" },
  { id: "ms-regression", domain: "mathematical-statistics", name: "回归分析", difficulty: 0.55, prereqs: ["ms-testing"],
    description: "线性回归、诊断与模型选择" },
  { id: "ap-stellar-structure", domain: "astrophysics", name: "恒星结构", difficulty: 0.45, prereqs: [],
    description: "流体静力平衡、能量输运与恒星模型" },
  { id: "ap-stellar-evolution", domain: "astrophysics", name: "恒星演化", difficulty: 0.5, prereqs: ["ap-stellar-structure"],
    description: "主序、红巨星与核合成" },
  { id: "ap-compact", domain: "astrophysics", name: "致密天体", difficulty: 0.55, prereqs: ["ap-stellar-evolution"],
    description: "白矮星、中子星与黑洞" },
  { id: "ap-galaxies", domain: "astrophysics", name: "星系与宇宙大尺度结构", difficulty: 0.55, prereqs: ["ap-stellar-evolution"],
    description: "银河系、星系演化与暗物质" },
  { id: "ap-cosmology", domain: "astrophysics", name: "宇宙学", difficulty: 0.58, prereqs: ["ap-galaxies"],
    description: "大爆炸、宇宙膨胀与暗能量" },
  { id: "ap-observation", domain: "astrophysics", name: "观测手段", difficulty: 0.42, prereqs: ["ap-stellar-structure"],
    description: "望远镜、多波段观测与光谱分析" },
  { id: "cp-perception", domain: "cognitive-psychology", name: "知觉", difficulty: 0.35, prereqs: [],
    description: "感觉编码、模式识别与知觉组织" },
  { id: "cp-attention", domain: "cognitive-psychology", name: "注意", difficulty: 0.4, prereqs: ["cp-perception"],
    description: "选择性注意、注意资源与自动化" },
  { id: "cp-memory", domain: "cognitive-psychology", name: "记忆", difficulty: 0.42, prereqs: ["cp-attention"],
    description: "记忆系统、编码提取与遗忘" },
  { id: "cp-language", domain: "cognitive-psychology", name: "语言", difficulty: 0.45, prereqs: ["cp-memory"],
    description: "语言理解、产生与习得" },
  { id: "cp-thinking", domain: "cognitive-psychology", name: "思维与问题解决", difficulty: 0.48, prereqs: ["cp-memory"],
    description: "概念、推理与问题解决策略" },
  { id: "cp-decision", domain: "cognitive-psychology", name: "判断与决策", difficulty: 0.5, prereqs: ["cp-thinking"],
    description: "启发式、偏差与前景理论" },
  { id: "hg-population", domain: "human-geography", name: "人口地理", difficulty: 0.35, prereqs: [],
    description: "人口分布、迁移与增长" },
  { id: "hg-settlement", domain: "human-geography", name: "聚落地理", difficulty: 0.38, prereqs: ["hg-population"],
    description: "乡村聚落、城市化与城市体系" },
  { id: "hg-economic", domain: "human-geography", name: "经济地理", difficulty: 0.42, prereqs: ["hg-population"],
    description: "区位理论、产业布局与区域发展" },
  { id: "hg-culture", domain: "human-geography", name: "文化地理", difficulty: 0.45, prereqs: ["hg-settlement"],
    description: "文化区、扩散与景观" },
  { id: "hg-urban", domain: "human-geography", name: "城市地理", difficulty: 0.48, prereqs: ["hg-settlement"],
    description: "城市内部结构、城市功能与规划" },
  { id: "hg-global", domain: "human-geography", name: "全球化与区域发展", difficulty: 0.5, prereqs: ["hg-economic"],
    description: "全球化、区域差异与可持续发展" },
  // 经济金融/法学/文史哲扩充
  { id: "eh-mercantilism", domain: "economic-history", name: "重商主义与古典经济学", difficulty: 0.3, prereqs: [],
    description: "财富的来源、贸易差额与自由放任" },
  { id: "eh-classical", domain: "economic-history", name: "古典学派", difficulty: 0.38, prereqs: ["eh-mercantilism"],
    description: "斯密、李嘉图与劳动价值论" },
  { id: "eh-marginal", domain: "economic-history", name: "边际革命", difficulty: 0.45, prereqs: ["eh-classical"],
    description: "边际效用、一般均衡与新古典的诞生" },
  { id: "eh-keynes", domain: "economic-history", name: "凯恩斯革命", difficulty: 0.48, prereqs: ["eh-marginal"],
    description: "有效需求、乘数与宏观干预" },
  { id: "eh-neoclassical", domain: "economic-history", name: "新古典综合", difficulty: 0.5, prereqs: ["eh-keynes"],
    description: "萨缪尔森与主流经济学的融合" },
  { id: "eh-contemporary", domain: "economic-history", name: "当代经济学思潮", difficulty: 0.52, prereqs: ["eh-neoclassical"],
    description: "货币主义、新自由主义与行为经济学" },
  { id: "cf-goals", domain: "corporate-finance", name: "财务目标与价值", difficulty: 0.35, prereqs: [],
    description: "企业目标、资金时间价值与现值" },
  { id: "cf-valuation", domain: "corporate-finance", name: "估值基础", difficulty: 0.42, prereqs: ["cf-goals"],
    description: "债券股票估值、风险与收益" },
  { id: "cf-budgeting", domain: "corporate-finance", name: "资本预算", difficulty: 0.45, prereqs: ["cf-valuation"],
    description: "NPV、IRR 与项目决策" },
  { id: "cf-structure", domain: "corporate-finance", name: "资本结构", difficulty: 0.48, prereqs: ["cf-valuation"],
    description: "MM 定理、杠杆与融资决策" },
  { id: "cf-dividend", domain: "corporate-finance", name: "股利政策", difficulty: 0.5, prereqs: ["cf-structure"],
    description: "股利无关论、回购与信号" },
  { id: "cf-ma", domain: "corporate-finance", name: "并购与重组", difficulty: 0.52, prereqs: ["cf-structure"],
    description: "并购动机、估值与整合" },
  { id: "iv-assets", domain: "investment", name: "资产类别与市场", difficulty: 0.3, prereqs: [],
    description: "股票债券基金、市场结构与指数" },
  { id: "iv-portfolio", domain: "investment", name: "组合理论", difficulty: 0.42, prereqs: ["iv-assets"],
    description: "风险分散、有效前沿与最优组合" },
  { id: "iv-capm", domain: "investment", name: "CAPM 与定价", difficulty: 0.45, prereqs: ["iv-portfolio"],
    description: "资本资产定价模型、贝塔与套利" },
  { id: "iv-bonds", domain: "investment", name: "债券分析", difficulty: 0.48, prereqs: ["iv-capm"],
    description: "收益率曲线、久期与凸性" },
  { id: "iv-derivatives", domain: "investment", name: "衍生品", difficulty: 0.5, prereqs: ["iv-capm"],
    description: "期货期权、定价与对冲" },
  { id: "iv-behavioral", domain: "investment", name: "行为金融", difficulty: 0.5, prereqs: ["iv-portfolio"],
    description: "心理偏差、市场异象与噪声交易" },
  { id: "it-terms", domain: "international-trade", name: "贸易术语", difficulty: 0.35, prereqs: [],
    description: "Incoterms、价格构成与风险转移" },
  { id: "it-settlement", domain: "international-trade", name: "国际结算", difficulty: 0.4, prereqs: ["it-terms"],
    description: "信用证、托收与电汇" },
  { id: "it-contract", domain: "international-trade", name: "贸易合同", difficulty: 0.42, prereqs: ["it-terms"],
    description: "合同条款、检验与索赔" },
  { id: "it-logistics", domain: "international-trade", name: "运输与保险", difficulty: 0.45, prereqs: ["it-contract"],
    description: "海运空运、保险条款与提单" },
  { id: "it-tariff", domain: "international-trade", name: "关税与壁垒", difficulty: 0.45, prereqs: ["it-terms"],
    description: "关税制度、非关税壁垒与自贸协定" },
  { id: "it-ecommerce", domain: "international-trade", name: "跨境电商", difficulty: 0.5, prereqs: ["it-logistics"],
    description: "平台模式、合规与跨境物流" },
  { id: "al-subject", domain: "administrative-law", name: "行政主体", difficulty: 0.35, prereqs: [],
    description: "行政机关、授权组织与公务员" },
  { id: "al-act", domain: "administrative-law", name: "行政行为", difficulty: 0.4, prereqs: ["al-subject"],
    description: "抽象与具体行政行为、效力" },
  { id: "al-license", domain: "administrative-law", name: "行政许可与处罚", difficulty: 0.45, prereqs: ["al-act"],
    description: "许可制度、处罚原则与程序" },
  { id: "al-reconsideration", domain: "administrative-law", name: "行政复议", difficulty: 0.48, prereqs: ["al-license"],
    description: "复议范围、管辖与决定" },
  { id: "al-litigation", domain: "administrative-law", name: "行政诉讼", difficulty: 0.5, prereqs: ["al-reconsideration"],
    description: "受案范围、举证责任与判决" },
  { id: "al-compensation", domain: "administrative-law", name: "国家赔偿", difficulty: 0.5, prereqs: ["al-reconsideration"],
    description: "赔偿范围、标准与程序" },
  { id: "il-subjects", domain: "international-law", name: "国际法主体", difficulty: 0.4, prereqs: [],
    description: "国家、国际组织与个人" },
  { id: "il-treaties", domain: "international-law", name: "条约法", difficulty: 0.45, prereqs: ["il-subjects"],
    description: "条约的缔结、效力与解释" },
  { id: "il-sea", domain: "international-law", name: "海洋法", difficulty: 0.48, prereqs: ["il-treaties"],
    description: "领海、专属经济区与公海" },
  { id: "il-human-rights", domain: "international-law", name: "国际人权法", difficulty: 0.5, prereqs: ["il-treaties"],
    description: "人权宪章、条约机构与保护机制" },
  { id: "il-dispute", domain: "international-law", name: "争端解决", difficulty: 0.52, prereqs: ["il-subjects"],
    description: "国际法院、仲裁与外交方法" },
  { id: "il-criminal", domain: "international-law", name: "国际刑法", difficulty: 0.55, prereqs: ["il-dispute"],
    description: "战争罪、国际刑事法院与引渡" },
  { id: "cpl-subjects", domain: "civil-procedure", name: "诉讼主体与管辖", difficulty: 0.35, prereqs: [],
    description: "当事人、法院管辖与回避" },
  { id: "cpl-evidence", domain: "civil-procedure", name: "证据制度", difficulty: 0.42, prereqs: ["cpl-subjects"],
    description: "证据种类、证明责任与质证" },
  { id: "cpl-procedure", domain: "civil-procedure", name: "审判程序", difficulty: 0.45, prereqs: ["cpl-evidence"],
    description: "一审、二审与再审" },
  { id: "cpl-execution", domain: "civil-procedure", name: "执行程序", difficulty: 0.48, prereqs: ["cpl-procedure"],
    description: "执行依据、措施与执行异议" },
  { id: "cpl-special", domain: "civil-procedure", name: "特别程序", difficulty: 0.5, prereqs: ["cpl-procedure"],
    description: "督促程序、公示催告与简易程序" },
  { id: "cpl-adr", domain: "civil-procedure", name: "多元化纠纷解决", difficulty: 0.5, prereqs: ["cpl-procedure"],
    description: "调解、仲裁与诉讼的衔接" },
  { id: "anc-characters", domain: "ancient-chinese", name: "汉字与文字学", difficulty: 0.3, prereqs: [],
    description: "六书、字体演变与常用字" },
  { id: "anc-lexicon", domain: "ancient-chinese", name: "词汇与词义", difficulty: 0.38, prereqs: ["anc-characters"],
    description: "古今词义、通假字与本义引申" },
  { id: "anc-grammar", domain: "ancient-chinese", name: "语法与句读", difficulty: 0.42, prereqs: ["anc-lexicon"],
    description: "词类活用、特殊句式与断句" },
  { id: "anc-phonology", domain: "ancient-chinese", name: "音韵学", difficulty: 0.45, prereqs: ["anc-characters"],
    description: "中古音、平仄与反切" },
  { id: "anc-exegesis", domain: "ancient-chinese", name: "训诂学", difficulty: 0.48, prereqs: ["anc-lexicon"],
    description: "训诂方法、注释体例与辞书" },
  { id: "anc-readings", domain: "ancient-chinese", name: "文选精读", difficulty: 0.5, prereqs: ["anc-grammar"],
    description: "左传、史记与唐宋文选" },
  { id: "ling-phonetics", domain: "linguistics-intro", name: "语音学", difficulty: 0.3, prereqs: [],
    description: "音素、音节与国际音标" },
  { id: "ling-grammar", domain: "linguistics-intro", name: "语法学", difficulty: 0.38, prereqs: ["ling-phonetics"],
    description: "词法、句法与语法理论流派" },
  { id: "ling-semantics", domain: "linguistics-intro", name: "语义学", difficulty: 0.42, prereqs: ["ling-grammar"],
    description: "词义关系、语义场与逻辑语义" },
  { id: "ling-pragmatics", domain: "linguistics-intro", name: "语用学", difficulty: 0.45, prereqs: ["ling-semantics"],
    description: "语境、言语行为与会话含义" },
  { id: "ling-change", domain: "linguistics-intro", name: "语言演变", difficulty: 0.45, prereqs: ["ling-grammar"],
    description: "历时变化、语言接触与谱系" },
  { id: "ling-cognition", domain: "linguistics-intro", name: "语言与认知", difficulty: 0.5, prereqs: ["ling-pragmatics"],
    description: "语言习得、心理语言学与神经基础" },
  { id: "mch-late-qing", domain: "modern-china-history", name: "晚清变局", difficulty: 0.3, prereqs: [],
    description: "鸦片战争、洋务运动与变法" },
  { id: "mch-revolution", domain: "modern-china-history", name: "辛亥革命与民国建立", difficulty: 0.38, prereqs: ["mch-late-qing"],
    description: "革命酝酿、武昌起义与共和" },
  { id: "mch-republic", domain: "modern-china-history", name: "民国时期", difficulty: 0.42, prereqs: ["mch-revolution"],
    description: "军阀混战、新文化与国民革命" },
  { id: "mch-war", domain: "modern-china-history", name: "抗日战争", difficulty: 0.45, prereqs: ["mch-republic"],
    description: "从九一八到抗战胜利" },
  { id: "mch-liberation", domain: "modern-china-history", name: "解放战争与建国", difficulty: 0.45, prereqs: ["mch-war"],
    description: "战略决战与新中国成立" },
  { id: "mch-reform", domain: "modern-china-history", name: "改革开放", difficulty: 0.5, prereqs: ["mch-liberation"],
    description: "经济转型、特区与现代化进程" },
  { id: "wp-greek", domain: "western-philosophy", name: "古希腊哲学", difficulty: 0.3, prereqs: [],
    description: "米利都学派、苏格拉底、柏拉图与亚里士多德" },
  { id: "wp-medieval", domain: "western-philosophy", name: "中世纪哲学", difficulty: 0.38, prereqs: ["wp-greek"],
    description: "教父哲学、经院哲学与唯名唯实之争" },
  { id: "wp-modern", domain: "western-philosophy", name: "近代哲学", difficulty: 0.42, prereqs: ["wp-medieval"],
    description: "笛卡尔、经验论与启蒙" },
  { id: "wp-german", domain: "western-philosophy", name: "德国古典哲学", difficulty: 0.45, prereqs: ["wp-modern"],
    description: "康德、黑格尔与费尔巴哈" },
  { id: "wp-modern-philosophy", domain: "western-philosophy", name: "现代哲学", difficulty: 0.48, prereqs: ["wp-german"],
    description: "现象学、存在主义与分析哲学" },
  { id: "wp-contemporary", domain: "western-philosophy", name: "当代哲学", difficulty: 0.5, prereqs: ["wp-modern-philosophy"],
    description: "后现代、政治哲学与心灵哲学" },
  { id: "zhp-pre-qin", domain: "chinese-philosophy", name: "先秦诸子", difficulty: 0.3, prereqs: [],
    description: "儒墨道法与百家争鸣" },
  { id: "zhp-han", domain: "chinese-philosophy", name: "两汉经学", difficulty: 0.38, prereqs: ["zhp-pre-qin"],
    description: "今古文经学、董仲舒与谶纬" },
  { id: "zhp-weijin", domain: "chinese-philosophy", name: "魏晋玄学", difficulty: 0.42, prereqs: ["zhp-han"],
    description: "有无之辩、竹林七贤与名教自然" },
  { id: "zhp-songming", domain: "chinese-philosophy", name: "宋明理学", difficulty: 0.45, prereqs: ["zhp-weijin"],
    description: "程朱理学、陆王心学" },
  { id: "zhp-qing", domain: "chinese-philosophy", name: "清代朴学", difficulty: 0.48, prereqs: ["zhp-songming"],
    description: "考据学、义理与经世" },
  { id: "zhp-modern", domain: "chinese-philosophy", name: "近现代哲学", difficulty: 0.5, prereqs: ["zhp-qing"],
    description: "西学东渐、新儒家与马克思主义中国化" },
  // 工学扩充：机械/电气/电子信息/自动化/土木/能源/材料/航空航天/水利/环境/化工/交通
  { id: "md-basics", domain: "machine-design", name: "设计基础", difficulty: 0.35, prereqs: [],
    description: "载荷、失效形式与设计准则" },
  { id: "md-connections", domain: "machine-design", name: "连接设计", difficulty: 0.42, prereqs: ["md-basics"],
    description: "螺纹、键与销连接" },
  { id: "md-transmission", domain: "machine-design", name: "传动设计", difficulty: 0.45, prereqs: ["md-connections"],
    description: "带传动、齿轮与链传动" },
  { id: "md-shafts", domain: "machine-design", name: "轴系设计", difficulty: 0.48, prereqs: ["md-transmission"],
    description: "轴、联轴器与离合器" },
  { id: "md-bearings", domain: "machine-design", name: "轴承", difficulty: 0.5, prereqs: ["md-shafts"],
    description: "滑动轴承、滚动轴承与润滑" },
  { id: "md-modern", domain: "machine-design", name: "现代设计方法", difficulty: 0.52, prereqs: ["md-bearings"],
    description: "可靠性设计、优化与有限元" },
  { id: "mt-cutting", domain: "manufacturing-tech", name: "切削原理", difficulty: 0.35, prereqs: [],
    description: "切削运动、刀具与切屑形成" },
  { id: "mt-machine", domain: "manufacturing-tech", name: "机床与刀具", difficulty: 0.4, prereqs: ["mt-cutting"],
    description: "车铣刨磨与数控机床" },
  { id: "mt-process", domain: "manufacturing-tech", name: "工艺规程", difficulty: 0.45, prereqs: ["mt-machine"],
    description: "定位基准、工序与加工余量" },
  { id: "mt-fixture", domain: "manufacturing-tech", name: "夹具设计", difficulty: 0.48, prereqs: ["mt-process"],
    description: "定位夹紧与典型夹具" },
  { id: "mt-precision", domain: "manufacturing-tech", name: "加工精度与质量", difficulty: 0.5, prereqs: ["mt-process"],
    description: "误差分析、表面质量与统计控制" },
  { id: "mt-advanced", domain: "manufacturing-tech", name: "先进制造技术", difficulty: 0.52, prereqs: ["mt-precision"],
    description: "增材制造、精密加工与智能制造" },
  { id: "pe-devices", domain: "power-electronics", name: "电力电子器件", difficulty: 0.4, prereqs: [],
    description: "二极管、晶闸管与功率晶体管" },
  { id: "pe-rectifier", domain: "power-electronics", name: "整流电路", difficulty: 0.45, prereqs: ["pe-devices"],
    description: "单相三相整流与滤波" },
  { id: "pe-inverter", domain: "power-electronics", name: "逆变电路", difficulty: 0.5, prereqs: ["pe-rectifier"],
    description: "电压型电流型逆变" },
  { id: "pe-chopper", domain: "power-electronics", name: "斩波电路", difficulty: 0.48, prereqs: ["pe-rectifier"],
    description: "直流变换与开关电源" },
  { id: "pe-pwm", domain: "power-electronics", name: "PWM 控制", difficulty: 0.52, prereqs: ["pe-inverter"],
    description: "调制原理与谐波分析" },
  { id: "pe-applications", domain: "power-electronics", name: "应用实例", difficulty: 0.55, prereqs: ["pe-pwm"],
    description: "电机驱动、并网与电能质量" },
  { id: "dc-logic", domain: "digital-circuits", name: "逻辑代数", difficulty: 0.35, prereqs: [],
    description: "数制、逻辑运算与化简" },
  { id: "dc-combinational", domain: "digital-circuits", name: "组合逻辑电路", difficulty: 0.4, prereqs: ["dc-logic"],
    description: "编码器、译码器与运算电路" },
  { id: "dc-flipflop", domain: "digital-circuits", name: "触发器", difficulty: 0.45, prereqs: ["dc-combinational"],
    description: "RS、D 与 JK 触发器" },
  { id: "dc-sequential", domain: "digital-circuits", name: "时序逻辑电路", difficulty: 0.48, prereqs: ["dc-flipflop"],
    description: "计数器、寄存器与状态机" },
  { id: "dc-memory", domain: "digital-circuits", name: "存储器", difficulty: 0.5, prereqs: ["dc-sequential"],
    description: "RAM/ROM 与存储系统" },
  { id: "dc-programmable", domain: "digital-circuits", name: "可编程器件", difficulty: 0.52, prereqs: ["dc-sequential"],
    description: "PLD、FPGA 与硬件描述语言" },
  { id: "ss-signals", domain: "signals-systems", name: "信号与系统概述", difficulty: 0.35, prereqs: [],
    description: "信号分类、系统性质与 LTI" },
  { id: "ss-time", domain: "signals-systems", name: "时域分析", difficulty: 0.42, prereqs: ["ss-signals"],
    description: "卷积与冲激响应" },
  { id: "ss-fourier", domain: "signals-systems", name: "傅里叶分析", difficulty: 0.45, prereqs: ["ss-time"],
    description: "傅里叶级数与变换" },
  { id: "ss-laplace", domain: "signals-systems", name: "拉普拉斯变换", difficulty: 0.48, prereqs: ["ss-fourier"],
    description: "系统函数与稳定性" },
  { id: "ss-z", domain: "signals-systems", name: "Z 变换", difficulty: 0.5, prereqs: ["ss-laplace"],
    description: "离散系统分析" },
  { id: "ss-sampling", domain: "signals-systems", name: "采样与滤波", difficulty: 0.52, prereqs: ["ss-z"],
    description: "采样定理与滤波器设计" },
  { id: "mc-state-space", domain: "modern-control", name: "状态空间模型", difficulty: 0.45, prereqs: [],
    description: "状态方程与传递函数" },
  { id: "mc-controllability", domain: "modern-control", name: "能控性与能观性", difficulty: 0.5, prereqs: ["mc-state-space"],
    description: "判据与结构分解" },
  { id: "mc-pole", domain: "modern-control", name: "极点配置", difficulty: 0.52, prereqs: ["mc-controllability"],
    description: "状态反馈设计" },
  { id: "mc-observer", domain: "modern-control", name: "状态观测器", difficulty: 0.55, prereqs: ["mc-pole"],
    description: "全维与降维观测器" },
  { id: "mc-optimal", domain: "modern-control", name: "最优控制", difficulty: 0.55, prereqs: ["mc-pole"],
    description: "LQR 与变分法" },
  { id: "mc-robust", domain: "modern-control", name: "鲁棒控制", difficulty: 0.58, prereqs: ["mc-observer"],
    description: "不确定性与 H∞ 初步" },
  { id: "sm-composition", domain: "structural-mechanics", name: "几何组成分析", difficulty: 0.35, prereqs: [],
    description: "自由度与几何不变体系" },
  { id: "sm-determinate", domain: "structural-mechanics", name: "静定结构", difficulty: 0.42, prereqs: ["sm-composition"],
    description: "静定梁、刚架与桁架内力" },
  { id: "sm-displacement", domain: "structural-mechanics", name: "位移计算", difficulty: 0.45, prereqs: ["sm-determinate"],
    description: "虚功原理与图乘法" },
  { id: "sm-force-method", domain: "structural-mechanics", name: "力法", difficulty: 0.5, prereqs: ["sm-displacement"],
    description: "超静定结构求解" },
  { id: "sm-displacement-method", domain: "structural-mechanics", name: "位移法", difficulty: 0.52, prereqs: ["sm-force-method"],
    description: "位移法与力矩分配" },
  { id: "sm-matrix", domain: "structural-mechanics", name: "矩阵位移法", difficulty: 0.55, prereqs: ["sm-displacement-method"],
    description: "有限元基础" },
  { id: "be-types", domain: "bridge-engineering", name: "桥梁类型与荷载", difficulty: 0.4, prereqs: [],
    description: "桥型体系与设计荷载" },
  { id: "be-beam", domain: "bridge-engineering", name: "梁桥", difficulty: 0.45, prereqs: ["be-types"],
    description: "简支梁、连续梁与构造" },
  { id: "be-arch", domain: "bridge-engineering", name: "拱桥", difficulty: 0.48, prereqs: ["be-types"],
    description: "拱的受力、施工与造型" },
  { id: "be-cable", domain: "bridge-engineering", name: "斜拉与悬索桥", difficulty: 0.52, prereqs: ["be-arch"],
    description: "缆索体系与风振" },
  { id: "be-foundation", domain: "bridge-engineering", name: "桥梁基础", difficulty: 0.5, prereqs: ["be-beam"],
    description: "桩基础、沉井与墩台" },
  { id: "be-construction", domain: "bridge-engineering", name: "桥梁施工技术", difficulty: 0.55, prereqs: ["be-cable"],
    description: "架设方法与施工监测" },
  { id: "ht-conduction", domain: "heat-transfer", name: "导热", difficulty: 0.4, prereqs: [],
    description: "傅里叶定律与稳态导热" },
  { id: "ht-convection", domain: "heat-transfer", name: "对流换热", difficulty: 0.45, prereqs: ["ht-conduction"],
    description: "边界层与准则方程" },
  { id: "ht-radiation", domain: "heat-transfer", name: "辐射换热", difficulty: 0.48, prereqs: ["ht-conduction"],
    description: "黑体辐射与角系数" },
  { id: "ht-exchanger", domain: "heat-transfer", name: "换热器", difficulty: 0.5, prereqs: ["ht-convection"],
    description: "类型与热设计" },
  { id: "ht-phase", domain: "heat-transfer", name: "相变传热", difficulty: 0.52, prereqs: ["ht-convection"],
    description: "沸腾与凝结" },
  { id: "ht-numerical", domain: "heat-transfer", name: "数值传热", difficulty: 0.55, prereqs: ["ht-exchanger"],
    description: "离散化与数值方法" },
  { id: "mp-crystal", domain: "material-physics", name: "晶体结构", difficulty: 0.4, prereqs: [],
    description: "晶体学基础与结合键" },
  { id: "mp-defects", domain: "material-physics", name: "晶体缺陷", difficulty: 0.45, prereqs: ["mp-crystal"],
    description: "点、线与面缺陷" },
  { id: "mp-diffusion", domain: "material-physics", name: "扩散", difficulty: 0.48, prereqs: ["mp-defects"],
    description: "扩散机制与菲克定律" },
  { id: "mp-transformation", domain: "material-physics", name: "相变", difficulty: 0.5, prereqs: ["mp-diffusion"],
    description: "凝固与固态相变" },
  { id: "mp-properties", domain: "material-physics", name: "材料性能", difficulty: 0.5, prereqs: ["mp-crystal"],
    description: "力学、物理与化学性能" },
  { id: "mp-characterization", domain: "material-physics", name: "材料表征", difficulty: 0.52, prereqs: ["mp-transformation"],
    description: "显微分析与谱学" },
  { id: "ad-environment", domain: "aircraft-design", name: "飞行环境", difficulty: 0.4, prereqs: [],
    description: "大气、重力与飞行包线" },
  { id: "ad-aerodynamics", domain: "aircraft-design", name: "空气动力学", difficulty: 0.45, prereqs: ["ad-environment"],
    description: "升力阻力与气动布局" },
  { id: "ad-structure", domain: "aircraft-design", name: "结构设计", difficulty: 0.48, prereqs: ["ad-aerodynamics"],
    description: "材料、载荷与结构形式" },
  { id: "ad-propulsion", domain: "aircraft-design", name: "动力装置", difficulty: 0.5, prereqs: ["ad-aerodynamics"],
    description: "涡喷涡扇与火箭发动机" },
  { id: "ad-conceptual", domain: "aircraft-design", name: "总体设计", difficulty: 0.52, prereqs: ["ad-structure"],
    description: "方案权衡与参数选择" },
  { id: "ad-spacecraft", domain: "aircraft-design", name: "航天器设计", difficulty: 0.55, prereqs: ["ad-conceptual"],
    description: "轨道、姿态与空间环境" },
  { id: "hy-cycle", domain: "hydrology", name: "水文循环与径流", difficulty: 0.35, prereqs: [],
    description: "降水、蒸发与产汇流" },
  { id: "hy-precipitation", domain: "hydrology", name: "降水与蒸散发", difficulty: 0.4, prereqs: ["hy-cycle"],
    description: "观测与计算方法" },
  { id: "hy-flood", domain: "hydrology", name: "洪水与设计洪水", difficulty: 0.48, prereqs: ["hy-precipitation"],
    description: "洪水计算与频率分析" },
  { id: "hy-groundwater", domain: "hydrology", name: "地下水", difficulty: 0.45, prereqs: ["hy-cycle"],
    description: "含水层与地下水流" },
  { id: "hy-statistics", domain: "hydrology", name: "水文统计", difficulty: 0.5, prereqs: ["hy-flood"],
    description: "频率曲线与参数估计" },
  { id: "hy-resources", domain: "hydrology", name: "水资源评价", difficulty: 0.52, prereqs: ["hy-statistics"],
    description: "水资源量、供需与配置" },
  { id: "env-water-quality", domain: "environmental-eng", name: "水质与水环境", difficulty: 0.4, prereqs: [],
    description: "水质指标与污染源" },
  { id: "env-water-treatment", domain: "environmental-eng", name: "水处理技术", difficulty: 0.45, prereqs: ["env-water-quality"],
    description: "给水与污水处理" },
  { id: "env-air", domain: "environmental-eng", name: "大气污染控制", difficulty: 0.48, prereqs: ["env-water-quality"],
    description: "除尘、脱硫与脱硝" },
  { id: "env-solid", domain: "environmental-eng", name: "固废处理", difficulty: 0.5, prereqs: ["env-water-treatment"],
    description: "收运、焚烧与填埋" },
  { id: "env-noise", domain: "environmental-eng", name: "噪声控制", difficulty: 0.48, prereqs: ["env-water-quality"],
    description: "声学基础与降噪" },
  { id: "env-assessment", domain: "environmental-eng", name: "环境影响评价", difficulty: 0.52, prereqs: ["env-air"],
    description: "环评制度与方法" },
  { id: "cre-kinetics", domain: "chemical-reaction-eng", name: "反应动力学", difficulty: 0.4, prereqs: [],
    description: "速率方程与温度效应" },
  { id: "cre-ideal", domain: "chemical-reaction-eng", name: "理想反应器", difficulty: 0.45, prereqs: ["cre-kinetics"],
    description: "间歇、全混与平推流" },
  { id: "cre-nonideal", domain: "chemical-reaction-eng", name: "非理想流动", difficulty: 0.5, prereqs: ["cre-ideal"],
    description: "停留时间分布" },
  { id: "cre-multiphase", domain: "chemical-reaction-eng", name: "多相反应", difficulty: 0.52, prereqs: ["cre-nonideal"],
    description: "气液固催化反应" },
  { id: "cre-design", domain: "chemical-reaction-eng", name: "反应器设计", difficulty: 0.52, prereqs: ["cre-ideal"],
    description: "设计与优化" },
  { id: "cre-intensification", domain: "chemical-reaction-eng", name: "过程强化", difficulty: 0.55, prereqs: ["cre-multiphase"],
    description: "微反应器与强化技术" },
  { id: "te-flow", domain: "traffic-eng", name: "交通流理论", difficulty: 0.4, prereqs: [],
    description: "流量、密度与速度三参数" },
  { id: "te-capacity", domain: "traffic-eng", name: "道路通行能力", difficulty: 0.45, prereqs: ["te-flow"],
    description: "路段与交叉口通行能力" },
  { id: "te-signal", domain: "traffic-eng", name: "信号控制", difficulty: 0.48, prereqs: ["te-capacity"],
    description: "单点、协调与感应控制" },
  { id: "te-planning", domain: "traffic-eng", name: "交通规划", difficulty: 0.5, prereqs: ["te-capacity"],
    description: "四阶段法" },
  { id: "te-transit", domain: "traffic-eng", name: "公共交通", difficulty: 0.48, prereqs: ["te-flow"],
    description: "公交系统与运营" },
  { id: "te-its", domain: "traffic-eng", name: "智能交通", difficulty: 0.55, prereqs: ["te-signal"],
    description: "ITS、车联网与自动驾驶" },
  // 医学/管理/艺术/农学/教育扩充
  { id: "im-approach", domain: "internal-medicine", name: "诊断思维", difficulty: 0.4, prereqs: [],
    description: "病史采集与临床推理" },
  { id: "im-respiratory", domain: "internal-medicine", name: "呼吸系统疾病", difficulty: 0.45, prereqs: ["im-approach"],
    description: "肺炎、慢阻肺与哮喘" },
  { id: "im-cardiovascular", domain: "internal-medicine", name: "循环系统疾病", difficulty: 0.48, prereqs: ["im-approach"],
    description: "高血压、冠心病与心衰" },
  { id: "im-digestive", domain: "internal-medicine", name: "消化系统疾病", difficulty: 0.48, prereqs: ["im-approach"],
    description: "胃炎、溃疡与肝病" },
  { id: "im-endocrine", domain: "internal-medicine", name: "内分泌与代谢", difficulty: 0.5, prereqs: ["im-cardiovascular"],
    description: "糖尿病与甲状腺疾病" },
  { id: "im-hematology", domain: "internal-medicine", name: "血液系统疾病", difficulty: 0.52, prereqs: ["im-approach"],
    description: "贫血与白血病" },
  { id: "sg-asepsis", domain: "surgery", name: "无菌与消毒", difficulty: 0.4, prereqs: [],
    description: "无菌术与手术环境" },
  { id: "sg-anesthesia", domain: "surgery", name: "麻醉", difficulty: 0.45, prereqs: ["sg-asepsis"],
    description: "麻醉方法与术中监测" },
  { id: "sg-trauma", domain: "surgery", name: "创伤与烧伤", difficulty: 0.48, prereqs: ["sg-asepsis"],
    description: "创伤处理与休克" },
  { id: "sg-infection", domain: "surgery", name: "外科感染", difficulty: 0.48, prereqs: ["sg-asepsis"],
    description: "感染类型与抗生素使用" },
  { id: "sg-tumor", domain: "surgery", name: "肿瘤外科", difficulty: 0.5, prereqs: ["sg-trauma"],
    description: "肿瘤分期与手术原则" },
  { id: "sg-basics", domain: "surgery", name: "手术基本操作", difficulty: 0.52, prereqs: ["sg-anesthesia"],
    description: "切开缝合、止血与引流" },
  { id: "dx-history", domain: "diagnostics", name: "问诊", difficulty: 0.35, prereqs: [],
    description: "问诊内容与技巧" },
  { id: "dx-physical", domain: "diagnostics", name: "体格检查", difficulty: 0.42, prereqs: ["dx-history"],
    description: "视触叩听与系统查体" },
  { id: "dx-lab", domain: "diagnostics", name: "实验室检查", difficulty: 0.45, prereqs: ["dx-physical"],
    description: "血尿便与生化检查" },
  { id: "dx-imaging", domain: "diagnostics", name: "影像学检查", difficulty: 0.48, prereqs: ["dx-physical"],
    description: "X 线、CT 与超声" },
  { id: "dx-ecg", domain: "diagnostics", name: "心电图", difficulty: 0.5, prereqs: ["dx-lab"],
    description: "正常心电图与心律失常" },
  { id: "dx-thinking", domain: "diagnostics", name: "临床思维", difficulty: 0.52, prereqs: ["dx-imaging"],
    description: "诊断步骤与病历书写" },
  { id: "tcmd-four", domain: "tcm-diagnosis", name: "四诊", difficulty: 0.35, prereqs: [],
    description: "望闻问切" },
  { id: "tcmd-bagang", domain: "tcm-diagnosis", name: "八纲辨证", difficulty: 0.42, prereqs: ["tcmd-four"],
    description: "阴阳、表里、寒热、虚实" },
  { id: "tcmd-zangfu", domain: "tcm-diagnosis", name: "脏腑辨证", difficulty: 0.45, prereqs: ["tcmd-bagang"],
    description: "五脏六腑证候" },
  { id: "tcmd-qixue", domain: "tcm-diagnosis", name: "气血津液辨证", difficulty: 0.48, prereqs: ["tcmd-bagang"],
    description: "气血津液失常" },
  { id: "tcmd-liujing", domain: "tcm-diagnosis", name: "六经辨证", difficulty: 0.5, prereqs: ["tcmd-zangfu"],
    description: "伤寒六经传变" },
  { id: "tcmd-weiqi", domain: "tcm-diagnosis", name: "卫气营血辨证", difficulty: 0.52, prereqs: ["tcmd-liujing"],
    description: "温病辨证体系" },
  { id: "pha-pharmacokinetics", domain: "pharmacology", name: "药代动力学", difficulty: 0.4, prereqs: [],
    description: "吸收、分布、代谢与排泄" },
  { id: "pha-pharmacodynamics", domain: "pharmacology", name: "药效学", difficulty: 0.45, prereqs: ["pha-pharmacokinetics"],
    description: "受体、剂量与效应" },
  { id: "pha-cns", domain: "pharmacology", name: "神经系统药物", difficulty: 0.48, prereqs: ["pha-pharmacodynamics"],
    description: "镇静、抗癫痫与镇痛药" },
  { id: "pha-cardiovascular", domain: "pharmacology", name: "心血管药物", difficulty: 0.5, prereqs: ["pha-pharmacodynamics"],
    description: "降压、抗心衰与抗心律失常药" },
  { id: "pha-antimicrobial", domain: "pharmacology", name: "抗菌药物", difficulty: 0.5, prereqs: ["pha-pharmacodynamics"],
    description: "抗生素分类与耐药" },
  { id: "pha-toxicology", domain: "pharmacology", name: "毒理学", difficulty: 0.52, prereqs: ["pha-pharmacokinetics"],
    description: "毒物作用与中毒解救" },
  { id: "imm-system", domain: "immunology", name: "免疫系统", difficulty: 0.4, prereqs: [],
    description: "免疫器官、细胞与分子" },
  { id: "imm-antigen", domain: "immunology", name: "抗原与抗体", difficulty: 0.45, prereqs: ["imm-system"],
    description: "结构、功能与相互作用" },
  { id: "imm-cellular", domain: "immunology", name: "细胞免疫", difficulty: 0.48, prereqs: ["imm-antigen"],
    description: "T 细胞应答" },
  { id: "imm-response", domain: "immunology", name: "免疫应答与调节", difficulty: 0.5, prereqs: ["imm-cellular"],
    description: "应答类型与调节网络" },
  { id: "imm-pathology", domain: "immunology", name: "免疫病理", difficulty: 0.52, prereqs: ["imm-response"],
    description: "超敏、自身免疫与免疫缺陷" },
  { id: "imm-application", domain: "immunology", name: "免疫学应用", difficulty: 0.52, prereqs: ["imm-response"],
    description: "疫苗、单抗与移植免疫" },
  { id: "mis-basics", domain: "management-information-systems", name: "信息系统基础", difficulty: 0.35, prereqs: [],
    description: "信息系统与组织" },
  { id: "mis-erp", domain: "management-information-systems", name: "ERP 与企业应用", difficulty: 0.45, prereqs: ["mis-basics"],
    description: "ERP、CRM 与 SCM" },
  { id: "mis-dss", domain: "management-information-systems", name: "决策支持", difficulty: 0.48, prereqs: ["mis-basics"],
    description: "DSS、BI 与专家系统" },
  { id: "mis-ecommerce", domain: "management-information-systems", name: "电子商务系统", difficulty: 0.48, prereqs: ["mis-erp"],
    description: "电商平台与支付" },
  { id: "mis-governance", domain: "management-information-systems", name: "IT 治理", difficulty: 0.5, prereqs: ["mis-erp"],
    description: "IT 战略、安全与合规" },
  { id: "mis-analytics", domain: "management-information-systems", name: "数据分析与智能", difficulty: 0.55, prereqs: ["mis-dss"],
    description: "数据挖掘与人工智能应用" },
  { id: "pm-lifecycle", domain: "project-management", name: "项目与生命周期", difficulty: 0.35, prereqs: [],
    description: "项目特征与生命周期" },
  { id: "pm-scope", domain: "project-management", name: "范围管理", difficulty: 0.42, prereqs: ["pm-lifecycle"],
    description: "WBS 与需求" },
  { id: "pm-schedule", domain: "project-management", name: "进度管理", difficulty: 0.45, prereqs: ["pm-scope"],
    description: "CPM、PERT 与甘特图" },
  { id: "pm-cost", domain: "project-management", name: "成本管理", difficulty: 0.48, prereqs: ["pm-schedule"],
    description: "估算、预算与挣值分析" },
  { id: "pm-quality", domain: "project-management", name: "质量管理", difficulty: 0.5, prereqs: ["pm-cost"],
    description: "质量规划与保证" },
  { id: "pm-risk", domain: "project-management", name: "风险管理", difficulty: 0.52, prereqs: ["pm-schedule"],
    description: "识别、评估与应对" },
  { id: "pp-process", domain: "public-policy", name: "政策过程", difficulty: 0.35, prereqs: [],
    description: "政策系统与过程阶段" },
  { id: "pp-agenda", domain: "public-policy", name: "议程设置", difficulty: 0.4, prereqs: ["pp-process"],
    description: "问题流、政策流与政治流" },
  { id: "pp-decision", domain: "public-policy", name: "决策模型", difficulty: 0.45, prereqs: ["pp-agenda"],
    description: "理性、渐进与垃圾桶模型" },
  { id: "pp-implementation", domain: "public-policy", name: "政策执行", difficulty: 0.48, prereqs: ["pp-decision"],
    description: "执行工具与障碍" },
  { id: "pp-evaluation", domain: "public-policy", name: "政策评估", difficulty: 0.5, prereqs: ["pp-implementation"],
    description: "评估标准与方法" },
  { id: "pp-tools", domain: "public-policy", name: "政策工具", difficulty: 0.48, prereqs: ["pp-decision"],
    description: "管制、激励与信息工具" },
  { id: "hr-planning", domain: "hr-management", name: "人力资源规划", difficulty: 0.35, prereqs: [],
    description: "供需预测与职位分析" },
  { id: "hr-recruitment", domain: "hr-management", name: "招聘与选拔", difficulty: 0.42, prereqs: ["hr-planning"],
    description: "渠道、筛选与面试" },
  { id: "hr-training", domain: "hr-management", name: "培训与开发", difficulty: 0.45, prereqs: ["hr-recruitment"],
    description: "需求分析、方案与评估" },
  { id: "hr-performance", domain: "hr-management", name: "绩效管理", difficulty: 0.48, prereqs: ["hr-training"],
    description: "KPI、OKR 与考核" },
  { id: "hr-compensation", domain: "hr-management", name: "薪酬福利", difficulty: 0.5, prereqs: ["hr-performance"],
    description: "薪酬结构与激励" },
  { id: "hr-relations", domain: "hr-management", name: "劳动关系", difficulty: 0.5, prereqs: ["hr-performance"],
    description: "合同、争议与劳动法" },
  { id: "sk-perspective", domain: "sketch-basics", name: "透视", difficulty: 0.3, prereqs: [],
    description: "一点、两点与三点透视" },
  { id: "sk-composition", domain: "sketch-basics", name: "构图", difficulty: 0.38, prereqs: ["sk-perspective"],
    description: "构图原则与形式美" },
  { id: "sk-light", domain: "sketch-basics", name: "明暗", difficulty: 0.42, prereqs: ["sk-composition"],
    description: "三大面与五大调" },
  { id: "sk-texture", domain: "sketch-basics", name: "质感表现", difficulty: 0.45, prereqs: ["sk-light"],
    description: "不同材质的表现" },
  { id: "sk-human", domain: "sketch-basics", name: "人体素描", difficulty: 0.5, prereqs: ["sk-light"],
    description: "比例、动态与解剖" },
  { id: "sk-creation", domain: "sketch-basics", name: "素描创作", difficulty: 0.52, prereqs: ["sk-human"],
    description: "写生与创作实践" },
  { id: "mh-medieval", domain: "music-history", name: "中世纪与文艺复兴", difficulty: 0.35, prereqs: [],
    description: "格里高利圣咏到复调" },
  { id: "mh-baroque", domain: "music-history", name: "巴洛克时期", difficulty: 0.4, prereqs: ["mh-medieval"],
    description: "巴赫、亨德尔与维瓦尔第" },
  { id: "mh-classical", domain: "music-history", name: "古典主义", difficulty: 0.45, prereqs: ["mh-baroque"],
    description: "海顿、莫扎特与贝多芬" },
  { id: "mh-romantic", domain: "music-history", name: "浪漫主义", difficulty: 0.48, prereqs: ["mh-classical"],
    description: "舒伯特到瓦格纳" },
  { id: "mh-20th", domain: "music-history", name: "20 世纪音乐", difficulty: 0.5, prereqs: ["mh-romantic"],
    description: "印象主义与现代主义" },
  { id: "mh-contemporary", domain: "music-history", name: "当代音乐", difficulty: 0.52, prereqs: ["mh-20th"],
    description: "流行、爵士与先锋" },
  { id: "ct-systems", domain: "color-theory", name: "色彩体系", difficulty: 0.3, prereqs: [],
    description: "色相、明度、纯度与色立体" },
  { id: "ct-psychology", domain: "color-theory", name: "色彩心理", difficulty: 0.38, prereqs: ["ct-systems"],
    description: "色彩的情感与联想" },
  { id: "ct-harmony", domain: "color-theory", name: "色彩搭配", difficulty: 0.42, prereqs: ["ct-psychology"],
    description: "调和、对比与配色" },
  { id: "ct-application", domain: "color-theory", name: "色彩应用", difficulty: 0.45, prereqs: ["ct-harmony"],
    description: "产品、空间与界面" },
  { id: "ct-print", domain: "color-theory", name: "印刷色彩", difficulty: 0.48, prereqs: ["ct-application"],
    description: "CMYK 与专色" },
  { id: "ct-digital", domain: "color-theory", name: "数字色彩", difficulty: 0.5, prereqs: ["ct-application"],
    description: "RGB、屏幕与色彩管理" },
  { id: "fh-early", domain: "film-history", name: "电影诞生与早期", difficulty: 0.35, prereqs: [],
    description: "卢米埃尔、梅里爱与格里菲斯" },
  { id: "fh-silent", domain: "film-history", name: "默片时代", difficulty: 0.4, prereqs: ["fh-early"],
    description: "喜剧片与蒙太奇学派" },
  { id: "fh-golden", domain: "film-history", name: "黄金时代", difficulty: 0.45, prereqs: ["fh-silent"],
    description: "好莱坞类型片体系" },
  { id: "fh-new-wave", domain: "film-history", name: "新浪潮与现代电影", difficulty: 0.48, prereqs: ["fh-golden"],
    description: "意大利新现实与法国新浪潮" },
  { id: "fh-contemporary", domain: "film-history", name: "当代电影", difficulty: 0.5, prereqs: ["fh-new-wave"],
    description: "数字化与全球化" },
  { id: "fh-chinese", domain: "film-history", name: "华语电影", difficulty: 0.5, prereqs: ["fh-new-wave"],
    description: "两岸三地电影发展" },
  { id: "cs-growth", domain: "crop-science", name: "生长发育", difficulty: 0.35, prereqs: [],
    description: "作物生育期与器官建成" },
  { id: "cs-yield", domain: "crop-science", name: "产量形成", difficulty: 0.4, prereqs: ["cs-growth"],
    description: "产量构成与源库流" },
  { id: "cs-cultivation", domain: "crop-science", name: "栽培技术", difficulty: 0.45, prereqs: ["cs-yield"],
    description: "播种、密度与管理" },
  { id: "cs-water-fertilizer", domain: "crop-science", name: "水肥管理", difficulty: 0.48, prereqs: ["cs-cultivation"],
    description: "灌溉与施肥" },
  { id: "cs-stress", domain: "crop-science", name: "逆境生理", difficulty: 0.5, prereqs: ["cs-cultivation"],
    description: "旱涝、盐碱与温度胁迫" },
  { id: "cs-system", domain: "crop-science", name: "耕作制度", difficulty: 0.5, prereqs: ["cs-cultivation"],
    description: "轮作、复种与保护性耕作" },
  { id: "ss-formation", domain: "soil-science", name: "成土过程", difficulty: 0.35, prereqs: [],
    description: "成土因素与土壤剖面" },
  { id: "ss-physical", domain: "soil-science", name: "土壤物理", difficulty: 0.4, prereqs: ["ss-formation"],
    description: "质地、结构与水分" },
  { id: "ss-chemical", domain: "soil-science", name: "土壤化学", difficulty: 0.45, prereqs: ["ss-physical"],
    description: "离子交换与酸碱" },
  { id: "ss-fertility", domain: "soil-science", name: "土壤肥力", difficulty: 0.48, prereqs: ["ss-chemical"],
    description: "养分与有机质" },
  { id: "ss-classification", domain: "soil-science", name: "土壤分类", difficulty: 0.48, prereqs: ["ss-formation"],
    description: "分类体系与中国土壤" },
  { id: "ss-improvement", domain: "soil-science", name: "土壤改良", difficulty: 0.52, prereqs: ["ss-fertility"],
    description: "退化与改良" },
  { id: "an-principles", domain: "animal-nutrition", name: "营养原理", difficulty: 0.35, prereqs: [],
    description: "消化吸收与代谢" },
  { id: "an-feed", domain: "animal-nutrition", name: "饲料学", difficulty: 0.42, prereqs: ["an-principles"],
    description: "饲料分类与加工" },
  { id: "an-energy-protein", domain: "animal-nutrition", name: "能量与蛋白质", difficulty: 0.45, prereqs: ["an-feed"],
    description: "能值与氨基酸平衡" },
  { id: "an-mineral-vitamin", domain: "animal-nutrition", name: "矿物与维生素", difficulty: 0.48, prereqs: ["an-energy-protein"],
    description: "常量微量与维生素" },
  { id: "an-formulation", domain: "animal-nutrition", name: "饲料配方", difficulty: 0.5, prereqs: ["an-mineral-vitamin"],
    description: "配方设计与优化" },
  { id: "an-standards", domain: "animal-nutrition", name: "饲养标准", difficulty: 0.5, prereqs: ["an-formulation"],
    description: "标准体系与阶段饲养" },
  { id: "ctd-design", domain: "curriculum-teaching", name: "课程设计", difficulty: 0.35, prereqs: [],
    description: "课程目标与内容选择" },
  { id: "ctd-objectives", domain: "curriculum-teaching", name: "教学目标", difficulty: 0.4, prereqs: ["ctd-design"],
    description: "三维目标与核心素养" },
  { id: "ctd-methods", domain: "curriculum-teaching", name: "教学方法", difficulty: 0.45, prereqs: ["ctd-objectives"],
    description: "讲授、讨论与项目式学习" },
  { id: "ctd-evaluation", domain: "curriculum-teaching", name: "教学评价", difficulty: 0.48, prereqs: ["ctd-methods"],
    description: "形成性与终结性评价" },
  { id: "ctd-management", domain: "curriculum-teaching", name: "课堂管理", difficulty: 0.48, prereqs: ["ctd-methods"],
    description: "纪律、动机与氛围" },
  { id: "ctd-reflection", domain: "curriculum-teaching", name: "教师专业发展", difficulty: 0.5, prereqs: ["ctd-evaluation"],
    description: "反思与教研" },
  { id: "ep-metabolism", domain: "exercise-physiology", name: "能量代谢", difficulty: 0.35, prereqs: [],
    description: "ATP 与三大供能系统" },
  { id: "ep-muscle", domain: "exercise-physiology", name: "肌肉功能", difficulty: 0.42, prereqs: ["ep-metabolism"],
    description: "肌纤维类型与收缩" },
  { id: "ep-cardio", domain: "exercise-physiology", name: "心肺机能", difficulty: 0.45, prereqs: ["ep-muscle"],
    description: "心输出量与摄氧量" },
  { id: "ep-neural", domain: "exercise-physiology", name: "神经调控", difficulty: 0.48, prereqs: ["ep-muscle"],
    description: "神经肌肉控制" },
  { id: "ep-adaptation", domain: "exercise-physiology", name: "训练适应", difficulty: 0.5, prereqs: ["ep-cardio"],
    description: "超量恢复与专项适应" },
  { id: "ep-fatigue", domain: "exercise-physiology", name: "疲劳与恢复", difficulty: 0.52, prereqs: ["ep-adaptation"],
    description: "疲劳机制与恢复手段" },
  // 二轮：数理化深造
  { id: "ra-measure", domain: "real-analysis", name: "集合与测度", difficulty: 0.5, prereqs: [],
    description: "基数、可测集与勒贝格测度" },
  { id: "ra-measurable-func", domain: "real-analysis", name: "可测函数", difficulty: 0.52, prereqs: ["ra-measure"],
    description: "可测函数与收敛方式" },
  { id: "ra-lebesgue", domain: "real-analysis", name: "勒贝格积分", difficulty: 0.55, prereqs: ["ra-measurable-func"],
    description: "积分定义与基本性质" },
  { id: "ra-convergence", domain: "real-analysis", name: "积分理论", difficulty: 0.58, prereqs: ["ra-lebesgue"],
    description: "三大收敛定理与黎曼积分关系" },
  { id: "ra-lp", domain: "real-analysis", name: "Lp 空间", difficulty: 0.6, prereqs: ["ra-convergence"],
    description: "范数、完备性与稠密性" },
  { id: "ra-applications", domain: "real-analysis", name: "应用", difficulty: 0.6, prereqs: ["ra-lp"],
    description: "傅里叶分析初步与逼近" },
  { id: "fa-metric", domain: "functional-analysis", name: "度量空间", difficulty: 0.5, prereqs: [],
    description: "距离、完备性与紧性" },
  { id: "fa-normed", domain: "functional-analysis", name: "赋范空间", difficulty: 0.52, prereqs: ["fa-metric"],
    description: "线性空间与范数" },
  { id: "fa-hilbert", domain: "functional-analysis", name: "希尔伯特空间", difficulty: 0.55, prereqs: ["fa-normed"],
    description: "内积、正交与投影定理" },
  { id: "fa-operators", domain: "functional-analysis", name: "线性算子", difficulty: 0.58, prereqs: ["fa-hilbert"],
    description: "有界算子与对偶空间" },
  { id: "fa-spectrum", domain: "functional-analysis", name: "谱理论", difficulty: 0.6, prereqs: ["fa-operators"],
    description: "谱与紧算子" },
  { id: "fa-applications", domain: "functional-analysis", name: "应用", difficulty: 0.6, prereqs: ["fa-spectrum"],
    description: "不动点定理与逼近论" },
  { id: "dg-curves", domain: "differential-geometry", name: "曲线论", difficulty: 0.45, prereqs: [],
    description: "曲率、挠率与 Frenet 标架" },
  { id: "dg-surfaces", domain: "differential-geometry", name: "曲面论", difficulty: 0.5, prereqs: ["dg-curves"],
    description: "第一与第二基本形式" },
  { id: "dg-curvature", domain: "differential-geometry", name: "曲率", difficulty: 0.52, prereqs: ["dg-surfaces"],
    description: "高斯曲率与平均曲率" },
  { id: "dg-geodesics", domain: "differential-geometry", name: "测地线", difficulty: 0.55, prereqs: ["dg-curvature"],
    description: "测地线与最短路径" },
  { id: "dg-tensor", domain: "differential-geometry", name: "张量分析", difficulty: 0.55, prereqs: ["dg-curves"],
    description: "张量与协变导数" },
  { id: "dg-riemann", domain: "differential-geometry", name: "黎曼几何初步", difficulty: 0.6, prereqs: ["dg-tensor"],
    description: "黎曼度量与曲率张量" },
  { id: "tp-spaces", domain: "topology", name: "拓扑空间", difficulty: 0.45, prereqs: [],
    description: "开集、基与子空间" },
  { id: "tp-continuity", domain: "topology", name: "连续性与同胚", difficulty: 0.48, prereqs: ["tp-spaces"],
    description: "连续映射与空间构造" },
  { id: "tp-compactness", domain: "topology", name: "紧致与连通", difficulty: 0.5, prereqs: ["tp-continuity"],
    description: "紧致性、连通性与乘积空间" },
  { id: "tp-axioms", domain: "topology", name: "分离公理", difficulty: 0.52, prereqs: ["tp-spaces"],
    description: "T0 到 T4 与可数性公理" },
  { id: "tp-fundamental", domain: "topology", name: "基本群", difficulty: 0.55, prereqs: ["tp-compactness"],
    description: "同伦与基本群" },
  { id: "tp-covering", domain: "topology", name: "覆盖空间", difficulty: 0.58, prereqs: ["tp-fundamental"],
    description: "覆盖空间与提升定理" },
  { id: "tm-particle", domain: "theoretical-mechanics", name: "质点动力学", difficulty: 0.35, prereqs: [],
    description: "牛顿力学与守恒定律" },
  { id: "tm-lagrange", domain: "theoretical-mechanics", name: "拉格朗日力学", difficulty: 0.45, prereqs: ["tm-particle"],
    description: "广义坐标与拉氏方程" },
  { id: "tm-hamilton", domain: "theoretical-mechanics", name: "哈密顿力学", difficulty: 0.5, prereqs: ["tm-lagrange"],
    description: "哈密顿量与正则方程" },
  { id: "tm-rigid", domain: "theoretical-mechanics", name: "刚体力学", difficulty: 0.48, prereqs: ["tm-particle"],
    description: "转动惯量与定点转动" },
  { id: "tm-vibration", domain: "theoretical-mechanics", name: "振动与波", difficulty: 0.5, prereqs: ["tm-lagrange"],
    description: "简谐、耦合振动与连续介质" },
  { id: "tm-analytical", domain: "theoretical-mechanics", name: "分析力学专题", difficulty: 0.55, prereqs: ["tm-hamilton"],
    description: "变分原理与对称性" },
  { id: "ed-electrostatics", domain: "electrodynamics", name: "静电场", difficulty: 0.45, prereqs: [],
    description: "库仑定律、高斯定理与电势" },
  { id: "ed-magnetostatics", domain: "electrodynamics", name: "静磁场", difficulty: 0.48, prereqs: ["ed-electrostatics"],
    description: "安培定律与矢势" },
  { id: "ed-induction", domain: "electrodynamics", name: "电磁感应", difficulty: 0.5, prereqs: ["ed-magnetostatics"],
    description: "法拉第定律与麦克斯韦修正" },
  { id: "ed-maxwell", domain: "electrodynamics", name: "麦克斯韦方程组", difficulty: 0.55, prereqs: ["ed-induction"],
    description: "方程组的完备形式" },
  { id: "ed-waves", domain: "electrodynamics", name: "电磁波", difficulty: 0.55, prereqs: ["ed-maxwell"],
    description: "平面波、反射与辐射" },
  { id: "ed-relativity", domain: "electrodynamics", name: "相对论初步", difficulty: 0.58, prereqs: ["ed-maxwell"],
    description: "狭义相对论与电磁场变换" },
  { id: "atp-models", domain: "atomic-physics", name: "原子模型", difficulty: 0.4, prereqs: [],
    description: "卢瑟福、玻尔与量子模型" },
  { id: "atp-spectra", domain: "atomic-physics", name: "光谱", difficulty: 0.45, prereqs: ["atp-models"],
    description: "光谱规律与能级" },
  { id: "atp-spin", domain: "atomic-physics", name: "自旋与精细结构", difficulty: 0.5, prereqs: ["atp-spectra"],
    description: "电子自旋与精细结构" },
  { id: "atp-multielectron", domain: "atomic-physics", name: "多电子原子", difficulty: 0.52, prereqs: ["atp-spin"],
    description: "壳层结构与泡利原理" },
  { id: "atp-fields", domain: "atomic-physics", name: "外场效应", difficulty: 0.55, prereqs: ["atp-multielectron"],
    description: "塞曼与斯塔克效应" },
  { id: "atp-modern", domain: "atomic-physics", name: "现代原子物理", difficulty: 0.55, prereqs: ["atp-fields"],
    description: "激光与冷原子" },
  { id: "ssp-crystal", domain: "solid-state-physics", name: "晶体结构", difficulty: 0.45, prereqs: [],
    description: "晶格、倒格与衍射" },
  { id: "ssp-band", domain: "solid-state-physics", name: "能带理论", difficulty: 0.52, prereqs: ["ssp-crystal"],
    description: "布洛赫定理与能带结构" },
  { id: "ssp-phonon", domain: "solid-state-physics", name: "声子与热性质", difficulty: 0.5, prereqs: ["ssp-crystal"],
    description: "晶格振动与热容" },
  { id: "ssp-semiconductor", domain: "solid-state-physics", name: "半导体物理", difficulty: 0.55, prereqs: ["ssp-band"],
    description: "载流子与器件原理" },
  { id: "ssp-magnetism", domain: "solid-state-physics", name: "磁性", difficulty: 0.55, prereqs: ["ssp-band"],
    description: "顺磁、铁磁与反铁磁" },
  { id: "ssp-superconductivity", domain: "solid-state-physics", name: "超导", difficulty: 0.58, prereqs: ["ssp-magnetism"],
    description: "超导现象与理论" },
  { id: "pch-polymerization", domain: "polymer-chemistry", name: "聚合反应", difficulty: 0.4, prereqs: [],
    description: "逐步聚合与链式聚合" },
  { id: "pch-structure", domain: "polymer-chemistry", name: "高分子结构", difficulty: 0.45, prereqs: ["pch-polymerization"],
    description: "链结构、构象与聚集态" },
  { id: "pch-properties", domain: "polymer-chemistry", name: "高分子性能", difficulty: 0.48, prereqs: ["pch-structure"],
    description: "力学、热与流变性能" },
  { id: "pch-applications", domain: "polymer-chemistry", name: "高分子应用", difficulty: 0.5, prereqs: ["pch-properties"],
    description: "塑料、橡胶与纤维" },
  { id: "pch-modification", domain: "polymer-chemistry", name: "高分子改性", difficulty: 0.5, prereqs: ["pch-properties"],
    description: "共混、复合与改性技术" },
  { id: "pch-functional", domain: "polymer-chemistry", name: "功能高分子", difficulty: 0.55, prereqs: ["pch-modification"],
    description: "导电、医用与智能高分子" },
  { id: "sc-quantum", domain: "structural-chemistry", name: "量子化学基础", difficulty: 0.45, prereqs: [],
    description: "薛定谔方程与原子轨道" },
  { id: "sc-bonds", domain: "structural-chemistry", name: "化学键理论", difficulty: 0.48, prereqs: ["sc-quantum"],
    description: "价键理论与分子轨道理论" },
  { id: "sc-symmetry", domain: "structural-chemistry", name: "分子对称性", difficulty: 0.5, prereqs: ["sc-bonds"],
    description: "点群与群论应用" },
  { id: "sc-crystallography", domain: "structural-chemistry", name: "晶体学", difficulty: 0.5, prereqs: ["sc-bonds"],
    description: "晶体结构与 X 射线衍射" },
  { id: "sc-spectroscopy", domain: "structural-chemistry", name: "分子光谱", difficulty: 0.52, prereqs: ["sc-symmetry"],
    description: "转动、振动与电子光谱" },
  { id: "sc-modern", domain: "structural-chemistry", name: "现代结构化学", difficulty: 0.55, prereqs: ["sc-spectroscopy"],
    description: "计算化学初步" },
  { id: "bc-biomolecules", domain: "biochemistry", name: "生物分子", difficulty: 0.4, prereqs: [],
    description: "糖、脂、蛋白质与核酸" },
  { id: "bc-enzymes", domain: "biochemistry", name: "酶学", difficulty: 0.45, prereqs: ["bc-biomolecules"],
    description: "酶动力学与调节" },
  { id: "bc-metabolism", domain: "biochemistry", name: "代谢总论", difficulty: 0.48, prereqs: ["bc-enzymes"],
    description: "糖、脂与蛋白质代谢" },
  { id: "bc-oxidation", domain: "biochemistry", name: "生物氧化", difficulty: 0.5, prereqs: ["bc-metabolism"],
    description: "呼吸链与氧化磷酸化" },
  { id: "bc-genetic-info", domain: "biochemistry", name: "遗传信息", difficulty: 0.52, prereqs: ["bc-metabolism"],
    description: "复制、转录与翻译" },
  { id: "bc-regulation", domain: "biochemistry", name: "代谢调节", difficulty: 0.55, prereqs: ["bc-genetic-info"],
    description: "激素与细胞信号" },
  { id: "os-retrosynthesis", domain: "chemical-synthesis", name: "逆合成分析", difficulty: 0.45, prereqs: [],
    description: "切断策略与合成子" },
  { id: "os-functional", domain: "chemical-synthesis", name: "官能团转化", difficulty: 0.48, prereqs: ["os-retrosynthesis"],
    description: "氧化、还原与取代" },
  { id: "os-protecting", domain: "chemical-synthesis", name: "保护基", difficulty: 0.5, prereqs: ["os-functional"],
    description: "常用保护基与选择性" },
  { id: "os-strategies", domain: "chemical-synthesis", name: "合成策略", difficulty: 0.52, prereqs: ["os-protecting"],
    description: "线性与汇聚合成" },
  { id: "os-chirality", domain: "chemical-synthesis", name: "手性合成", difficulty: 0.55, prereqs: ["os-strategies"],
    description: "不对称催化" },
  { id: "os-total-synthesis", domain: "chemical-synthesis", name: "全合成案例", difficulty: 0.58, prereqs: ["os-chirality"],
    description: "经典全合成分析" },
  // 二轮：计算机前沿 + 经济
  { id: "ad2-divide", domain: "algorithm-design", name: "分治与递归", difficulty: 0.4, prereqs: [],
    description: "主定理与分治策略" },
  { id: "ad2-dp", domain: "algorithm-design", name: "动态规划", difficulty: 0.48, prereqs: ["ad2-divide"],
    description: "最优子结构与状态设计" },
  { id: "ad2-greedy", domain: "algorithm-design", name: "贪心算法", difficulty: 0.45, prereqs: ["ad2-divide"],
    description: "贪心选择性质" },
  { id: "ad2-graph", domain: "algorithm-design", name: "图算法", difficulty: 0.52, prereqs: ["ad2-dp"],
    description: "最短路、网络流与匹配" },
  { id: "ad2-np", domain: "algorithm-design", name: "NP 完全性", difficulty: 0.55, prereqs: ["ad2-graph"],
    description: "归约与 NPC 问题" },
  { id: "ad2-approximation", domain: "algorithm-design", name: "近似与随机算法", difficulty: 0.58, prereqs: ["ad2-np"],
    description: "近似比与随机化" },
  { id: "ca2-isa", domain: "computer-architecture", name: "指令集体系结构", difficulty: 0.45, prereqs: [],
    description: "ISA 设计与寻址" },
  { id: "ca2-pipeline", domain: "computer-architecture", name: "流水线", difficulty: 0.5, prereqs: ["ca2-isa"],
    description: "五级流水与冒险处理" },
  { id: "ca2-memory", domain: "computer-architecture", name: "存储层次", difficulty: 0.52, prereqs: ["ca2-pipeline"],
    description: "缓存与虚拟内存" },
  { id: "ca2-parallel", domain: "computer-architecture", name: "并行体系", difficulty: 0.55, prereqs: ["ca2-pipeline"],
    description: "超标量、SIMD 与 GPU" },
  { id: "ca2-multicore", domain: "computer-architecture", name: "多核与一致性", difficulty: 0.55, prereqs: ["ca2-memory"],
    description: "缓存一致性与同步" },
  { id: "ca2-performance", domain: "computer-architecture", name: "性能评估", difficulty: 0.5, prereqs: ["ca2-pipeline"],
    description: "Amdahl 定律与基准测试" },
  { id: "es-hardware", domain: "embedded-systems", name: "嵌入式硬件基础", difficulty: 0.35, prereqs: [],
    description: "MCU、外设与总线" },
  { id: "es-rtos", domain: "embedded-systems", name: "实时操作系统", difficulty: 0.48, prereqs: ["es-hardware"],
    description: "任务调度与实时性" },
  { id: "es-drivers", domain: "embedded-systems", name: "驱动开发", difficulty: 0.5, prereqs: ["es-rtos"],
    description: "中断、GPIO 与设备驱动" },
  { id: "es-communication", domain: "embedded-systems", name: "通信协议", difficulty: 0.5, prereqs: ["es-hardware"],
    description: "UART、SPI、I2C 与网络" },
  { id: "es-lowpower", domain: "embedded-systems", name: "低功耗设计", difficulty: 0.52, prereqs: ["es-rtos"],
    description: "功耗管理与优化" },
  { id: "es-practice", domain: "embedded-systems", name: "开发实践", difficulty: 0.55, prereqs: ["es-drivers"],
    description: "调试、测试与量产" },
  { id: "ml-supervised", domain: "machine-learning", name: "监督学习", difficulty: 0.45, prereqs: [],
    description: "回归分类与过拟合" },
  { id: "ml-evaluation", domain: "machine-learning", name: "模型评估", difficulty: 0.48, prereqs: ["ml-supervised"],
    description: "指标、验证与调参" },
  { id: "ml-ensemble", domain: "machine-learning", name: "集成学习", difficulty: 0.52, prereqs: ["ml-evaluation"],
    description: "Bagging 与 Boosting" },
  { id: "ml-unsupervised", domain: "machine-learning", name: "无监督学习", difficulty: 0.5, prereqs: ["ml-supervised"],
    description: "聚类与降维" },
  { id: "ml-deep", domain: "machine-learning", name: "深度学习", difficulty: 0.55, prereqs: ["ml-ensemble"],
    description: "网络结构、优化与正则" },
  { id: "ml-practice-ml", domain: "machine-learning", name: "工程实践", difficulty: 0.58, prereqs: ["ml-deep"],
    description: "特征、部署与 MLOps" },
  { id: "nlp-text", domain: "nlp-intro", name: "文本处理基础", difficulty: 0.4, prereqs: [],
    description: "分词、归一与表示" },
  { id: "nlp-vectors", domain: "nlp-intro", name: "词向量", difficulty: 0.45, prereqs: ["nlp-text"],
    description: "Word2Vec 与语义表示" },
  { id: "nlp-sequence", domain: "nlp-intro", name: "序列模型", difficulty: 0.52, prereqs: ["nlp-vectors"],
    description: "RNN、LSTM 与注意力" },
  { id: "nlp-transformer", domain: "nlp-intro", name: "Transformer", difficulty: 0.55, prereqs: ["nlp-sequence"],
    description: "自注意力与位置编码" },
  { id: "nlp-llm", domain: "nlp-intro", name: "大语言模型", difficulty: 0.58, prereqs: ["nlp-transformer"],
    description: "预训练、微调与提示工程" },
  { id: "nlp-apps", domain: "nlp-intro", name: "应用", difficulty: 0.55, prereqs: ["nlp-sequence"],
    description: "问答、翻译与对话系统" },
  { id: "cv-basics", domain: "computer-vision", name: "图像基础", difficulty: 0.4, prereqs: [],
    description: "成像、滤波与边缘检测" },
  { id: "cv-features", domain: "computer-vision", name: "特征与匹配", difficulty: 0.45, prereqs: ["cv-basics"],
    description: "SIFT 与几何变换" },
  { id: "cv-detection", domain: "computer-vision", name: "检测与分割", difficulty: 0.52, prereqs: ["cv-features"],
    description: "目标检测与语义分割" },
  { id: "cv-deep", domain: "computer-vision", name: "深度学习视觉", difficulty: 0.55, prereqs: ["cv-detection"],
    description: "CNN 架构与迁移学习" },
  { id: "cv-generative", domain: "computer-vision", name: "生成模型", difficulty: 0.58, prereqs: ["cv-deep"],
    description: "GAN、扩散与图像生成" },
  { id: "cv-apps", domain: "computer-vision", name: "应用", difficulty: 0.55, prereqs: ["cv-detection"],
    description: "人脸、OCR 与自动驾驶视觉" },
  { id: "bd-ecosystem", domain: "big-data", name: "大数据生态", difficulty: 0.35, prereqs: [],
    description: "Hadoop、Spark 与存储体系" },
  { id: "bd-storage", domain: "big-data", name: "分布式存储", difficulty: 0.42, prereqs: ["bd-ecosystem"],
    description: "HDFS 与对象存储" },
  { id: "bd-compute", domain: "big-data", name: "计算框架", difficulty: 0.48, prereqs: ["bd-storage"],
    description: "MapReduce 与 Spark" },
  { id: "bd-streaming", domain: "big-data", name: "流处理", difficulty: 0.52, prereqs: ["bd-compute"],
    description: "Kafka 与 Flink" },
  { id: "bd-warehouse", domain: "big-data", name: "数据仓库", difficulty: 0.5, prereqs: ["bd-compute"],
    description: "数仓建模与 OLAP" },
  { id: "bd-governance", domain: "big-data", name: "数据治理", difficulty: 0.52, prereqs: ["bd-warehouse"],
    description: "质量、安全与合规" },
  { id: "blk-crypto", domain: "blockchain", name: "密码学基础", difficulty: 0.4, prereqs: [],
    description: "哈希、签名与默克尔树" },
  { id: "blk-consensus", domain: "blockchain", name: "共识机制", difficulty: 0.48, prereqs: ["blk-crypto"],
    description: "PoW、PoS 与 BFT" },
  { id: "blk-contract", domain: "blockchain", name: "智能合约", difficulty: 0.52, prereqs: ["blk-consensus"],
    description: "Solidity 与 DApp" },
  { id: "blk-applications", domain: "blockchain", name: "应用场景", difficulty: 0.5, prereqs: ["blk-consensus"],
    description: "DeFi、NFT 与供应链" },
  { id: "blk-privacy", domain: "blockchain", name: "隐私与扩展", difficulty: 0.55, prereqs: ["blk-contract"],
    description: "零知识证明与 Layer2" },
  { id: "blk-ecosystem", domain: "blockchain", name: "生态与治理", difficulty: 0.55, prereqs: ["blk-applications"],
    description: "公链生态与链上治理" },
  { id: "mnb-money", domain: "money-banking", name: "货币与信用", difficulty: 0.35, prereqs: [],
    description: "货币职能与信用形式" },
  { id: "mnb-interest", domain: "money-banking", name: "利率", difficulty: 0.42, prereqs: ["mnb-money"],
    description: "利率理论与期限结构" },
  { id: "mnb-banks", domain: "money-banking", name: "银行体系", difficulty: 0.45, prereqs: ["mnb-interest"],
    description: "商业银行与中央银行" },
  { id: "mnb-creation", domain: "money-banking", name: "货币创造", difficulty: 0.48, prereqs: ["mnb-banks"],
    description: "存款创造与货币乘数" },
  { id: "mnb-policy", domain: "money-banking", name: "货币政策", difficulty: 0.52, prereqs: ["mnb-creation"],
    description: "目标、工具与传导机制" },
  { id: "mnb-regulation", domain: "money-banking", name: "金融监管", difficulty: 0.52, prereqs: ["mnb-banks"],
    description: "监管体系与巴塞尔协议" },
  { id: "ie-structure", domain: "industrial-economics", name: "产业结构", difficulty: 0.4, prereqs: [],
    description: "产业分类与结构演变" },
  { id: "ie-scp", domain: "industrial-economics", name: "SCP 范式", difficulty: 0.45, prereqs: ["ie-structure"],
    description: "结构、行为与绩效" },
  { id: "ie-game", domain: "industrial-economics", name: "博弈与竞争策略", difficulty: 0.5, prereqs: ["ie-scp"],
    description: "定价与进入壁垒" },
  { id: "ie-regulation", domain: "industrial-economics", name: "政府规制", difficulty: 0.52, prereqs: ["ie-game"],
    description: "反垄断与规制政策" },
  { id: "ie-policy", domain: "industrial-economics", name: "产业政策", difficulty: 0.52, prereqs: ["ie-structure"],
    description: "政策工具与效果" },
  { id: "ie-innovation", domain: "industrial-economics", name: "创新与产业演化", difficulty: 0.55, prereqs: ["ie-scp"],
    description: "创新理论与演化" },
  { id: "de-growth", domain: "development-economics", name: "增长理论", difficulty: 0.4, prereqs: [],
    description: "增长模型与收敛" },
  { id: "de-poverty", domain: "development-economics", name: "贫困与不平等", difficulty: 0.45, prereqs: ["de-growth"],
    description: "测度与减贫" },
  { id: "de-human-capital", domain: "development-economics", name: "人力资本", difficulty: 0.48, prereqs: ["de-poverty"],
    description: "教育健康与增长" },
  { id: "de-institutions", domain: "development-economics", name: "制度与发展", difficulty: 0.5, prereqs: ["de-human-capital"],
    description: "制度与治理" },
  { id: "de-trade", domain: "development-economics", name: "贸易与发展", difficulty: 0.5, prereqs: ["de-growth"],
    description: "贸易政策与工业化" },
  { id: "de-practice", domain: "development-economics", name: "发展实践", difficulty: 0.52, prereqs: ["de-institutions"],
    description: "援助、实验与评估" },
  { id: "le-supply", domain: "labor-economics", name: "劳动力供给与需求", difficulty: 0.4, prereqs: [],
    description: "劳动参与与劳动需求" },
  { id: "le-wage", domain: "labor-economics", name: "工资决定", difficulty: 0.45, prereqs: ["le-supply"],
    description: "工资理论与差异" },
  { id: "le-discrimination", domain: "labor-economics", name: "歧视", difficulty: 0.48, prereqs: ["le-wage"],
    description: "歧视测度与政策" },
  { id: "le-unemployment", domain: "labor-economics", name: "失业", difficulty: 0.48, prereqs: ["le-supply"],
    description: "失业类型与政策" },
  { id: "le-human-capital2", domain: "labor-economics", name: "人力资本投资", difficulty: 0.5, prereqs: ["le-wage"],
    description: "教育回报与培训" },
  { id: "le-institutions2", domain: "labor-economics", name: "劳动力市场制度", difficulty: 0.5, prereqs: ["le-unemployment"],
    description: "工会与最低工资" },
  // 二轮：医学/法学/文史
  { id: "pd-growth", domain: "pediatrics", name: "生长发育", difficulty: 0.35, prereqs: [],
    description: "生长规律与评价" },
  { id: "pd-newborn", domain: "pediatrics", name: "新生儿", difficulty: 0.42, prereqs: ["pd-growth"],
    description: "新生儿特点与疾病" },
  { id: "pd-nutrition", domain: "pediatrics", name: "营养性疾病", difficulty: 0.45, prereqs: ["pd-growth"],
    description: "营养不良与佝偻病" },
  { id: "pd-respiratory-digestive", domain: "pediatrics", name: "呼吸消化疾病", difficulty: 0.48, prereqs: ["pd-newborn"],
    description: "肺炎与腹泻" },
  { id: "pd-infectious", domain: "pediatrics", name: "传染病", difficulty: 0.5, prereqs: ["pd-respiratory-digestive"],
    description: "常见儿童传染病" },
  { id: "pd-emergency", domain: "pediatrics", name: "儿科急救", difficulty: 0.52, prereqs: ["pd-newborn"],
    description: "惊厥与心肺复苏" },
  { id: "og-reproductive", domain: "obstetrics-gynecology", name: "女性生殖系统", difficulty: 0.35, prereqs: [],
    description: "解剖与生理" },
  { id: "og-pregnancy", domain: "obstetrics-gynecology", name: "妊娠生理", difficulty: 0.42, prereqs: ["og-reproductive"],
    description: "受精、着床与胎盘" },
  { id: "og-prenatal", domain: "obstetrics-gynecology", name: "产前检查", difficulty: 0.45, prereqs: ["og-pregnancy"],
    description: "孕期监护" },
  { id: "og-delivery", domain: "obstetrics-gynecology", name: "分娩", difficulty: 0.48, prereqs: ["og-prenatal"],
    description: "产程与接生" },
  { id: "og-complications", domain: "obstetrics-gynecology", name: "妊娠并发症", difficulty: 0.5, prereqs: ["og-pregnancy"],
    description: "高血压、出血与早产" },
  { id: "og-gynecology", domain: "obstetrics-gynecology", name: "妇科疾病", difficulty: 0.5, prereqs: ["og-reproductive"],
    description: "炎症、肿瘤与内分泌" },
  { id: "nu-anatomy", domain: "neurology", name: "神经解剖与定位", difficulty: 0.4, prereqs: [],
    description: "传导通路与定位诊断" },
  { id: "nu-localization", domain: "neurology", name: "定位诊断", difficulty: 0.45, prereqs: ["nu-anatomy"],
    description: "症状与病灶" },
  { id: "nu-cerebrovascular", domain: "neurology", name: "脑血管病", difficulty: 0.5, prereqs: ["nu-localization"],
    description: "脑梗死与出血" },
  { id: "nu-epilepsy", domain: "neurology", name: "癫痫", difficulty: 0.48, prereqs: ["nu-localization"],
    description: "发作类型与治疗" },
  { id: "nu-neuromuscular", domain: "neurology", name: "神经肌肉疾病", difficulty: 0.52, prereqs: ["nu-localization"],
    description: "周围神经与肌病" },
  { id: "nu-auxiliary", domain: "neurology", name: "辅助检查", difficulty: 0.5, prereqs: ["nu-anatomy"],
    description: "影像、电生理与腰穿" },
  { id: "psy-symptoms", domain: "psychiatry", name: "精神症状学", difficulty: 0.4, prereqs: [],
    description: "感知、思维与情感障碍" },
  { id: "psy-schizophrenia", domain: "psychiatry", name: "精神分裂症", difficulty: 0.48, prereqs: ["psy-symptoms"],
    description: "诊断与治疗" },
  { id: "psy-mood", domain: "psychiatry", name: "心境障碍", difficulty: 0.48, prereqs: ["psy-symptoms"],
    description: "抑郁与双相" },
  { id: "psy-neurosis", domain: "psychiatry", name: "神经症与应激", difficulty: 0.5, prereqs: ["psy-symptoms"],
    description: "焦虑、强迫与创伤" },
  { id: "psy-organic", domain: "psychiatry", name: "器质性精神障碍", difficulty: 0.5, prereqs: ["psy-symptoms"],
    description: "谵妄与痴呆" },
  { id: "psy-treatment", domain: "psychiatry", name: "治疗与康复", difficulty: 0.52, prereqs: ["psy-mood"],
    description: "药物、心理与康复" },
  { id: "mm-bacteria", domain: "medical-microbiology", name: "细菌总论", difficulty: 0.4, prereqs: [],
    description: "形态、培养与遗传" },
  { id: "mm-pathogenesis", domain: "medical-microbiology", name: "致病机制", difficulty: 0.45, prereqs: ["mm-bacteria"],
    description: "毒力与感染" },
  { id: "mm-virus", domain: "medical-microbiology", name: "病毒总论", difficulty: 0.48, prereqs: ["mm-bacteria"],
    description: "病毒结构与复制" },
  { id: "mm-pathogens", domain: "medical-microbiology", name: "常见病原", difficulty: 0.5, prereqs: ["mm-pathogenesis"],
    description: "重要病原体" },
  { id: "mm-immune-evasion", domain: "medical-microbiology", name: "免疫逃逸", difficulty: 0.52, prereqs: ["mm-pathogens"],
    description: "病原与免疫互作" },
  { id: "mm-prevention", domain: "medical-microbiology", name: "感染防治", difficulty: 0.52, prereqs: ["mm-pathogens"],
    description: "消毒、疫苗与抗生素" },
  { id: "pf-disease", domain: "pathophysiology", name: "疾病概论", difficulty: 0.4, prereqs: [],
    description: "病因学与发病学" },
  { id: "pf-electrolyte", domain: "pathophysiology", name: "水电解质紊乱", difficulty: 0.45, prereqs: ["pf-disease"],
    description: "水钠钾代谢" },
  { id: "pf-acid-base", domain: "pathophysiology", name: "酸碱平衡", difficulty: 0.48, prereqs: ["pf-electrolyte"],
    description: "酸碱失衡类型" },
  { id: "pf-hypoxia", domain: "pathophysiology", name: "缺氧", difficulty: 0.5, prereqs: ["pf-acid-base"],
    description: "缺氧类型与机制" },
  { id: "pf-shock", domain: "pathophysiology", name: "休克", difficulty: 0.52, prereqs: ["pf-hypoxia"],
    description: "休克分期与机制" },
  { id: "pf-mof", domain: "pathophysiology", name: "多器官衰竭", difficulty: 0.55, prereqs: ["pf-shock"],
    description: "MODS 与 DIC" },
  { id: "ipl-copyright", domain: "intellectual-property-law", name: "著作权法", difficulty: 0.4, prereqs: [],
    description: "作品、权利与限制" },
  { id: "ipl-patent", domain: "intellectual-property-law", name: "专利法", difficulty: 0.45, prereqs: ["ipl-copyright"],
    description: "专利三性与申请" },
  { id: "ipl-trademark", domain: "intellectual-property-law", name: "商标法", difficulty: 0.45, prereqs: ["ipl-copyright"],
    description: "注册、侵权与驰名商标" },
  { id: "ipl-secret", domain: "intellectual-property-law", name: "商业秘密", difficulty: 0.48, prereqs: ["ipl-trademark"],
    description: "保护与竞业限制" },
  { id: "ipl-network", domain: "intellectual-property-law", name: "网络知识产权", difficulty: 0.5, prereqs: ["ipl-copyright"],
    description: "数字版权与平台责任" },
  { id: "ipl-international", domain: "intellectual-property-law", name: "国际保护", difficulty: 0.5, prereqs: ["ipl-patent"],
    description: "条约与国际协调" },
  { id: "cl-company", domain: "commercial-law", name: "公司法", difficulty: 0.4, prereqs: [],
    description: "公司设立与治理" },
  { id: "cl-securities", domain: "commercial-law", name: "证券法", difficulty: 0.45, prereqs: ["cl-company"],
    description: "发行、交易与信息披露" },
  { id: "cl-negotiable", domain: "commercial-law", name: "票据法", difficulty: 0.45, prereqs: ["cl-company"],
    description: "票据行为与权利" },
  { id: "cl-insurance", domain: "commercial-law", name: "保险法", difficulty: 0.48, prereqs: ["cl-negotiable"],
    description: "保险合同与理赔" },
  { id: "cl-bankruptcy", domain: "commercial-law", name: "破产法", difficulty: 0.5, prereqs: ["cl-company"],
    description: "破产程序与重整" },
  { id: "cl-organization", domain: "commercial-law", name: "商事组织", difficulty: 0.48, prereqs: ["cl-company"],
    description: "合伙与独资企业" },
  { id: "el-basics", domain: "economic-law", name: "经济法基础", difficulty: 0.4, prereqs: [],
    description: "经济法体系与原则" },
  { id: "el-competition", domain: "economic-law", name: "竞争法", difficulty: 0.45, prereqs: ["el-basics"],
    description: "反垄断与反不正当竞争" },
  { id: "el-consumer", domain: "economic-law", name: "消费者法", difficulty: 0.45, prereqs: ["el-basics"],
    description: "消费者权益保护" },
  { id: "el-tax", domain: "economic-law", name: "财税法", difficulty: 0.48, prereqs: ["el-consumer"],
    description: "税收与预算" },
  { id: "el-financial", domain: "economic-law", name: "金融法", difficulty: 0.5, prereqs: ["el-tax"],
    description: "银行、证券与监管" },
  { id: "el-market", domain: "economic-law", name: "市场监管", difficulty: 0.5, prereqs: ["el-competition"],
    description: "市场秩序与执法" },
  { id: "mc2-phonetics", domain: "modern-chinese", name: "语音", difficulty: 0.3, prereqs: [],
    description: "声韵调与音节" },
  { id: "mc2-characters", domain: "modern-chinese", name: "文字", difficulty: 0.35, prereqs: ["mc2-phonetics"],
    description: "汉字与规范化" },
  { id: "mc2-lexicon", domain: "modern-chinese", name: "词汇", difficulty: 0.4, prereqs: ["mc2-characters"],
    description: "构词与词义" },
  { id: "mc2-grammar", domain: "modern-chinese", name: "语法", difficulty: 0.45, prereqs: ["mc2-lexicon"],
    description: "词类、短语与句子" },
  { id: "mc2-rhetoric", domain: "modern-chinese", name: "修辞", difficulty: 0.48, prereqs: ["mc2-grammar"],
    description: "辞格与语体" },
  { id: "mc2-pragmatics", domain: "modern-chinese", name: "语用", difficulty: 0.5, prereqs: ["mc2-rhetoric"],
    description: "语境与话语分析" },
  { id: "ar-concepts", domain: "archaeology", name: "考古学概论", difficulty: 0.35, prereqs: [],
    description: "考古学方法与分支" },
  { id: "ar-stratigraphy", domain: "archaeology", name: "地层学与类型学", difficulty: 0.42, prereqs: ["ar-concepts"],
    description: "考古学两大方法论" },
  { id: "ar-stone-age", domain: "archaeology", name: "石器时代考古", difficulty: 0.45, prereqs: ["ar-stratigraphy"],
    description: "旧新石器文化" },
  { id: "ar-xia-shang-zhou", domain: "archaeology", name: "夏商周考古", difficulty: 0.48, prereqs: ["ar-stone-age"],
    description: "青铜时代文明" },
  { id: "ar-qin-han", domain: "archaeology", name: "秦汉考古", difficulty: 0.5, prereqs: ["ar-xia-shang-zhou"],
    description: "帝陵与城市" },
  { id: "ar-fieldwork", domain: "archaeology", name: "田野考古方法", difficulty: 0.5, prereqs: ["ar-stratigraphy"],
    description: "发掘、记录与保护" },
  // 二轮：教育/新闻/农学/艺术/管理
  { id: "et-theories", domain: "educational-technology", name: "学习理论", difficulty: 0.35, prereqs: [],
    description: "行为、认知与建构主义" },
  { id: "et-media", domain: "educational-technology", name: "教学媒体", difficulty: 0.4, prereqs: ["et-theories"],
    description: "媒体特性与选择" },
  { id: "et-design", domain: "educational-technology", name: "课件设计", difficulty: 0.45, prereqs: ["et-media"],
    description: "教学设计与课件开发" },
  { id: "et-online", domain: "educational-technology", name: "在线学习", difficulty: 0.48, prereqs: ["et-design"],
    description: "MOOC、SPOC 与混合式教学" },
  { id: "et-gamification", domain: "educational-technology", name: "游戏化学习", difficulty: 0.5, prereqs: ["et-online"],
    description: "游戏机制与学习动机" },
  { id: "et-intelligent", domain: "educational-technology", name: "智能教育", difficulty: 0.55, prereqs: ["et-online"],
    description: "AI 助教与自适应学习" },
  { id: "ce-methods", domain: "comparative-education", name: "比较方法论", difficulty: 0.35, prereqs: [],
    description: "比较教育学的方法" },
  { id: "ce-systems", domain: "comparative-education", name: "各国学制", difficulty: 0.42, prereqs: ["ce-methods"],
    description: "美英德日学制" },
  { id: "ce-curriculum", domain: "comparative-education", name: "课程比较", difficulty: 0.45, prereqs: ["ce-systems"],
    description: "课程改革比较" },
  { id: "ce-policy", domain: "comparative-education", name: "教育政策比较", difficulty: 0.48, prereqs: ["ce-curriculum"],
    description: "政策制定与执行" },
  { id: "ce-globalization", domain: "comparative-education", name: "全球化与教育", difficulty: 0.5, prereqs: ["ce-policy"],
    description: "留学、排名与人才流动" },
  { id: "ce-china", domain: "comparative-education", name: "中国借鉴", difficulty: 0.5, prereqs: ["ce-systems"],
    description: "经验与本土化" },
  { id: "cm-models", domain: "communication-theory", name: "传播模式", difficulty: 0.35, prereqs: [],
    description: "线性、互动与网络模式" },
  { id: "cm-effects", domain: "communication-theory", name: "效果研究", difficulty: 0.45, prereqs: ["cm-models"],
    description: "强大、有限与适中效果" },
  { id: "cm-audience", domain: "communication-theory", name: "受众研究", difficulty: 0.48, prereqs: ["cm-effects"],
    description: "使用与满足" },
  { id: "cm-media", domain: "communication-theory", name: "媒介与社会", difficulty: 0.5, prereqs: ["cm-models"],
    description: "媒介环境与功能" },
  { id: "cm-opinion", domain: "communication-theory", name: "舆论", difficulty: 0.52, prereqs: ["cm-audience"],
    description: "议程设置与沉默螺旋" },
  { id: "cm-new-media", domain: "communication-theory", name: "新媒体传播", difficulty: 0.55, prereqs: ["cm-opinion"],
    description: "算法与传播变革" },
  { id: "nm-convergence", domain: "new-media-studies", name: "媒介融合", difficulty: 0.4, prereqs: [],
    description: "融合的层次与路径" },
  { id: "nm-platforms", domain: "new-media-studies", name: "平台与生态", difficulty: 0.45, prereqs: ["nm-convergence"],
    description: "平台经济与内容生态" },
  { id: "nm-algorithms", domain: "new-media-studies", name: "算法与推荐", difficulty: 0.5, prereqs: ["nm-platforms"],
    description: "推荐系统与信息茧房" },
  { id: "nm-short-video", domain: "new-media-studies", name: "短视频与直播", difficulty: 0.48, prereqs: ["nm-platforms"],
    description: "形态与传播机制" },
  { id: "nm-culture", domain: "new-media-studies", name: "网络文化", difficulty: 0.52, prereqs: ["nm-algorithms"],
    description: "亚文化与网络表达" },
  { id: "nm-governance", domain: "new-media-studies", name: "数字治理", difficulty: 0.55, prereqs: ["nm-algorithms"],
    description: "内容治理与平台责任" },
  { id: "pp-disease", domain: "plant-protection", name: "植物病害", difficulty: 0.4, prereqs: [],
    description: "病原与病害循环" },
  { id: "pp-insect", domain: "plant-protection", name: "植物虫害", difficulty: 0.45, prereqs: ["pp-disease"],
    description: "害虫与天敌" },
  { id: "pp-weed", domain: "plant-protection", name: "杂草与鼠害", difficulty: 0.45, prereqs: ["pp-disease"],
    description: "杂草防除" },
  { id: "pp-pesticide", domain: "plant-protection", name: "农药学", difficulty: 0.48, prereqs: ["pp-insect"],
    description: "农药类型与使用" },
  { id: "pp-ipm", domain: "plant-protection", name: "综合防治", difficulty: 0.52, prereqs: ["pp-pesticide"],
    description: "IPM 策略" },
  { id: "pp-forecast", domain: "plant-protection", name: "预测预报", difficulty: 0.5, prereqs: ["pp-insect"],
    description: "监测与预警" },
  { id: "ho-fruit", domain: "horticulture", name: "果树栽培", difficulty: 0.35, prereqs: [],
    description: "果树生物学与修剪" },
  { id: "ho-vegetable", domain: "horticulture", name: "蔬菜栽培", difficulty: 0.4, prereqs: ["ho-fruit"],
    description: "蔬菜生产与茬口安排" },
  { id: "ho-flower", domain: "horticulture", name: "花卉栽培", difficulty: 0.42, prereqs: ["ho-fruit"],
    description: "花卉生产与园林应用" },
  { id: "ho-facility", domain: "horticulture", name: "设施园艺", difficulty: 0.48, prereqs: ["ho-vegetable"],
    description: "温室与环境调控" },
  { id: "ho-propagation", domain: "horticulture", name: "繁殖技术", difficulty: 0.45, prereqs: ["ho-vegetable"],
    description: "嫁接、扦插与组织培养" },
  { id: "ho-postharvest", domain: "horticulture", name: "采后处理", difficulty: 0.5, prereqs: ["ho-facility"],
    description: "保鲜与贮运" },
  { id: "sv-seed", domain: "silviculture", name: "林木种子", difficulty: 0.35, prereqs: [],
    description: "采种与贮藏" },
  { id: "sv-seedling", domain: "silviculture", name: "苗木培育", difficulty: 0.4, prereqs: ["sv-seed"],
    description: "播种与容器育苗" },
  { id: "sv-afforestation", domain: "silviculture", name: "造林技术", difficulty: 0.45, prereqs: ["sv-seedling"],
    description: "整地、栽植与混交" },
  { id: "sv-tending", domain: "silviculture", name: "森林抚育", difficulty: 0.48, prereqs: ["sv-afforestation"],
    description: "间伐与修枝" },
  { id: "sv-regeneration", domain: "silviculture", name: "森林更新", difficulty: 0.5, prereqs: ["sv-afforestation"],
    description: "天然与人工更新" },
  { id: "sv-oriented", domain: "silviculture", name: "定向培育", difficulty: 0.52, prereqs: ["sv-tending"],
    description: "用材林与经济林" },
  { id: "aq-species", domain: "aquaculture-tech", name: "养殖对象", difficulty: 0.35, prereqs: [],
    description: "鱼类与甲壳类生物学" },
  { id: "aq-reproduction", domain: "aquaculture-tech", name: "人工繁殖", difficulty: 0.42, prereqs: ["aq-species"],
    description: "亲本培育与催产" },
  { id: "aq-pond", domain: "aquaculture-tech", name: "池塘养殖", difficulty: 0.48, prereqs: ["aq-reproduction"],
    description: "水质调控与投喂" },
  { id: "aq-cage", domain: "aquaculture-tech", name: "网箱与工厂化", difficulty: 0.5, prereqs: ["aq-pond"],
    description: "集约化养殖模式" },
  { id: "aq-disease", domain: "aquaculture-tech", name: "水产病害", difficulty: 0.5, prereqs: ["aq-pond"],
    description: "疾病防治" },
  { id: "aq-industrial", domain: "aquaculture-tech", name: "工厂化与智慧养殖", difficulty: 0.55, prereqs: ["aq-cage"],
    description: "循环水与智能装备" },
  { id: "ae-essence", domain: "aesthetics", name: "美的本质", difficulty: 0.35, prereqs: [],
    description: "美的范畴与形态" },
  { id: "ae-experience", domain: "aesthetics", name: "审美经验", difficulty: 0.42, prereqs: ["ae-essence"],
    description: "审美心理与态度" },
  { id: "ae-art-philosophy", domain: "aesthetics", name: "艺术哲学", difficulty: 0.45, prereqs: ["ae-experience"],
    description: "艺术与真理" },
  { id: "ae-chinese", domain: "aesthetics", name: "中国美学", difficulty: 0.48, prereqs: ["ae-essence"],
    description: "意境与风骨" },
  { id: "ae-western", domain: "aesthetics", name: "西方美学", difficulty: 0.48, prereqs: ["ae-experience"],
    description: "从柏拉图到当代" },
  { id: "ae-contemporary", domain: "aesthetics", name: "当代美学", difficulty: 0.52, prereqs: ["ae-art-philosophy"],
    description: "日常生活审美化" },
  { id: "di-origin", domain: "dance-intro", name: "舞蹈起源与发展", difficulty: 0.35, prereqs: [],
    description: "舞蹈的起源与历史" },
  { id: "di-basics", domain: "dance-intro", name: "舞蹈基本功", difficulty: 0.4, prereqs: ["di-origin"],
    description: "软开度与身韵" },
  { id: "di-styles", domain: "dance-intro", name: "风格流派", difficulty: 0.45, prereqs: ["di-basics"],
    description: "芭蕾、民族与现当代" },
  { id: "di-choreography", domain: "dance-intro", name: "编舞基础", difficulty: 0.48, prereqs: ["di-styles"],
    description: "动作语言与编排" },
  { id: "di-appreciation", domain: "dance-intro", name: "舞蹈赏析", difficulty: 0.48, prereqs: ["di-styles"],
    description: "经典作品解读" },
  { id: "di-education", domain: "dance-intro", name: "舞蹈教育", difficulty: 0.5, prereqs: ["di-choreography"],
    description: "教学法与普及" },
  { id: "dh-crafts", domain: "design-history", name: "工艺美术运动", difficulty: 0.35, prereqs: [],
    description: "手工艺与装饰艺术" },
  { id: "dh-modernism", domain: "design-history", name: "现代主义设计", difficulty: 0.42, prereqs: ["dh-crafts"],
    description: "包豪斯与功能主义" },
  { id: "dh-postmodern", domain: "design-history", name: "后现代设计", difficulty: 0.45, prereqs: ["dh-modernism"],
    description: "反叛与多元" },
  { id: "dh-china", domain: "design-history", name: "中国设计", difficulty: 0.48, prereqs: ["dh-modernism"],
    description: "从传统到当代" },
  { id: "dh-digital", domain: "design-history", name: "数字化设计", difficulty: 0.5, prereqs: ["dh-postmodern"],
    description: "交互与界面设计" },
  { id: "dh-trends", domain: "design-history", name: "当代设计趋势", difficulty: 0.52, prereqs: ["dh-digital"],
    description: "可持续与智能设计" },
  { id: "stm-analysis", domain: "strategic-management", name: "战略分析", difficulty: 0.4, prereqs: [],
    description: "外部内部分析工具" },
  { id: "stm-competitive", domain: "strategic-management", name: "竞争战略", difficulty: 0.45, prereqs: ["stm-analysis"],
    description: "成本、差异化与聚焦" },
  { id: "stm-corporate", domain: "strategic-management", name: "公司战略", difficulty: 0.48, prereqs: ["stm-competitive"],
    description: "多元化与并购" },
  { id: "stm-execution", domain: "strategic-management", name: "战略执行", difficulty: 0.5, prereqs: ["stm-corporate"],
    description: "组织与资源配置" },
  { id: "stm-change", domain: "strategic-management", name: "战略变革", difficulty: 0.52, prereqs: ["stm-execution"],
    description: "变革管理" },
  { id: "stm-ethics", domain: "strategic-management", name: "商业伦理", difficulty: 0.48, prereqs: ["stm-analysis"],
    description: "ESG 与社会责任" },
  { id: "cb-motivation", domain: "consumer-behavior", name: "动机与需求", difficulty: 0.35, prereqs: [],
    description: "需求层次与卷入度" },
  { id: "cb-perception", domain: "consumer-behavior", name: "感知与学习", difficulty: 0.4, prereqs: ["cb-motivation"],
    description: "感知、记忆与学习" },
  { id: "cb-attitude", domain: "consumer-behavior", name: "态度", difficulty: 0.45, prereqs: ["cb-perception"],
    description: "态度形成与改变" },
  { id: "cb-decision", domain: "consumer-behavior", name: "决策过程", difficulty: 0.48, prereqs: ["cb-attitude"],
    description: "购买决策模型" },
  { id: "cb-group", domain: "consumer-behavior", name: "群体影响", difficulty: 0.5, prereqs: ["cb-decision"],
    description: "参照群体与口碑" },
  { id: "cb-culture", domain: "consumer-behavior", name: "文化与消费", difficulty: 0.52, prereqs: ["cb-group"],
    description: "文化与亚文化" }
];

// 全库薄描述兜底：对 <40 字的技能描述做确定性扩充（不依赖 AI，改一处全库生效）
// 风险修复：1394/1415 条描述 <40字，旧大纲 8节×700字 与新自适应 10-18节×1200字 并存；确定性扩充让 228 科立即可用，AI 精细化后续渐进
function enrichThinDescription(skill) {
  const raw = String(skill.description || "").trim();
  if (raw.length >= 40) return raw;
  if (!raw) return `系统讲解${skill.name}的核心概念、基本原理、关键方法、典型例子、常见误区与应用拓展`;
  const d = String(skill.domain || "");
  let dims = "核心概念、基本原理、关键方法、典型例子、常见误区与应用拓展";
  if (/(history|archaeology|world-history|modern-china|ancient-china)/.test(d)) dims = "时空背景、政治制度、经济形态、社会结构、文化成就与兴衰演变";
  else if (/(analysis|algebra|probability|statistics|real-analysis|functional|topology|geometry|mechanics|electro|atomic|solid|polymer|structural-chem|biochem|synthesis|theoretical-mechanics|geophysics|geology|geography|thermodynamics|optics|genetics|ecology|astrophysics|biochemistry|electrodynamics)/.test(d)) dims = "直觉理解、严格定义、核心定理、证明推导、典型例题与常见误区";
  else if (/(ds-algorithms|algorithm-design|operating-system|computer-network|database|machine-learning|ai-intro|compiler|computer-organization|computer-architecture|embedded|nlp|vision|big-data|blockchain|signals|digital-circuits|power-electronics|instrumentation|surveying|transportation|aerospace|architecture|hydrology|oop|blockchain)/.test(d)) dims = "基本概念、工作原理、实现方法、复杂度分析、应用场景与技术局限";
  else if (/(medicine|pathology|pharmacology|immunology|diagnostics|surgery|internal|pediatrics|obstetrics|neurology|psychiatry|microbiology|pathophysiology|physiology|veterinary|forestry|aquaculture|stomatology|tcm|pharmacy|nursing)/.test(d)) dims = "基本概念、发病机制、诊断评估、治疗干预、典型案例与前沿争议";
  else if (/(law|jurisprudence|constitution|criminal|civil|administrative|intellectual|commercial|economic-law|sociology|ethnology)/.test(d)) dims = "基本概念、法律渊源、制度结构、适用规则、典型案例与学术争议";
  else if (/(economics|management|accounting|marketing|finance|money-banking|industrial|development|labor|project-management|hr-management|strategic|investment|logistics|econometrics)/.test(d)) dims = "基本概念、核心理论、分析模型、实证方法、政策策略与前沿动态";
  else if (/(literature|chinese-lit|world-lit|linguistics|ancient-chinese|modern-chinese)/.test(d)) dims = "核心概念、文本细读、历史脉络、流派风格、典型作品与批评方法";
  else if (/(education|curriculum|teaching|edu-psychology|comparative-education|educational-technology)/.test(d)) dims = "基本概念、教育目的、课程教学、学习心理、评价方法与实践案例";
  else if (/(art|design|music|film|theater|dance|aesthetics|color-theory|sketch)/.test(d)) dims = "基本概念、创作技法、风格流派、经典作品、审美鉴赏与批评";
  else if (/(agriculture|agronomy|crop|soil|animal|horticulture|silviculture|aquaculture|plant-protection)/.test(d)) dims = "基本概念、生产原理、栽培技术、病虫防治、典型案例与前沿技术";
  else if (/(philosophy|logic|western-philosophy|chinese-philosophy|aesthetics)/.test(d)) dims = "核心概念、基本问题、主要流派、经典论证、现实意义与争议";
  return `${raw}；系统讲解${skill.name}的${dims}`;
}
const SEED_ENRICHED = SEED.map(s => ({ ...s, description: enrichThinDescription(s) }));

// 增量 seed：按 id 逐条检查，缺失才插入；已存在则按 SEED_ENRICHED 更新描述/难度/先修（支撑试点扩容与全库渐进迁移）
// 风险修复：描述/难度/先修变更时自动清理旧缓存（lesson_sections/lessons/outline/intro），避免旧大纲（8节×700字）与新自适应（10-18节×1200字）并存
{
  const ins = db.prepare("INSERT INTO skills (id, domain, name, description, difficulty, prereqs, sort_order) VALUES (?,?,?,?,?,?,?)");
  const upd = db.prepare("UPDATE skills SET name=?, description=?, difficulty=?, prereqs=?, sort_order=? WHERE id=?");
  const exists = db.prepare("SELECT name, description, difficulty, prereqs FROM skills WHERE id = ?");
  let added = 0, updated = 0;
  const updatedIds = [];
  SEED_ENRICHED.forEach((s, i) => {
    const row = exists.get(s.id);
    if (!row) {
      ins.run(s.id, s.domain, s.name, s.description, s.difficulty, JSON.stringify(s.prereqs), i);
      added++;
    } else {
      const needUpd = row.description !== s.description || row.name !== s.name || Number(row.difficulty) !== Number(s.difficulty) || row.prereqs !== JSON.stringify(s.prereqs);
      if (needUpd) {
        upd.run(s.name, s.description, s.difficulty, JSON.stringify(s.prereqs), i, s.id);
        updated++;
        updatedIds.push(s.id);
      }
    }
  });
  if (added || updated) console.log("[math-mentor] seeded", added, "new,", updated, "updated");
  if (updatedIds.length) {
    const delLS = db.prepare("DELETE FROM lesson_sections WHERE skill_id=?");
    const delL = db.prepare("DELETE FROM lessons WHERE skill_id=?");
    const delOutline = db.prepare("DELETE FROM settings WHERE key=?");
    let clearedSections = 0, clearedLessons = 0, clearedOutlines = 0;
    for (const sid of updatedIds) {
      try { clearedSections += delLS.run(sid).changes || 0; } catch (e) {}
      try { clearedLessons += delL.run(sid).changes || 0; } catch (e) {}
      try { clearedOutlines += delOutline.run("outline:" + sid).changes || 0; } catch (e) {}
    }
    const domains = [...new Set(updatedIds.map(id => { const s = SEED_ENRICHED.find(x => x.id === id); return s ? s.domain : null; }).filter(Boolean))];
    let clearedIntros = 0;
    for (const d of domains) {
      try { clearedIntros += db.prepare("DELETE FROM intros WHERE domain=?").run(d).changes || 0; } catch (e) {}
    }
    if (clearedSections || clearedLessons || clearedOutlines || clearedIntros) {
      console.log("[math-mentor] stale cache cleared for", updatedIds.length, "updated skills:", clearedSections, "sections,", clearedLessons, "lessons,", clearedOutlines, "outlines,", clearedIntros, "intros");
    }
  }
}


// ---------- 全库总览补齐迁移（幂等）：为无根总览的 218 学科各补 1 个轻总览 ----------
// 架构师确认：方案A（每域1总览作新根，不拆多块），保持原链，仅追加新根，事务内完成
const DOMAIN_OVERVIEW_META = {
  "accounting-basics": { label: "会计学基础", category: "management" },
  "administrative-law": { label: "行政法学", category: "law" },
  "aerospace": { label: "航空航天概论", category: "engineering" },
  "aesthetics": { label: "美学", category: "art" },
  "agri-economics": { label: "农业经济学", category: "management" },
  "agri-engineering": { label: "农业工程导论", category: "engineering" },
  "agronomy-intro": { label: "农学概论", category: "agriculture" },
  "ai-intro": { label: "人工智能导论", category: "engineering" },
  "aircraft-design": { label: "飞行器设计原理", category: "engineering" },
  "algorithm-design": { label: "算法设计与分析", category: "engineering" },
  "analysis": { label: "数学分析", category: "science" },
  "analytical-chemistry": { label: "分析化学", category: "science" },
  "ancient-china-history": { label: "中国古代史", category: "history" },
  "ancient-chinese": { label: "古代汉语", category: "literature" },
  "animal-nutrition": { label: "动物营养学", category: "agriculture" },
  "animal-science": { label: "动物生产学导论", category: "agriculture" },
  "aquaculture": { label: "水产养殖学导论", category: "agriculture" },
  "aquaculture-tech": { label: "水产增养殖技术", category: "agriculture" },
  "archaeology": { label: "考古学导论", category: "history" },
  "architecture": { label: "建筑学导论", category: "engineering" },
  "art-history": { label: "中外美术史", category: "art" },
  "art-introduction": { label: "艺术概论", category: "art" },
  "astronomy-intro": { label: "天文学导论", category: "science" },
  "astrophysics": { label: "天体物理学", category: "science" },
  "atmospheric-science": { label: "大气科学导论", category: "science" },
  "atomic-physics": { label: "原子物理学", category: "science" },
  "automatic-control": { label: "自动控制原理", category: "engineering" },
  "big-data": { label: "大数据技术", category: "engineering" },
  "bio-engineering": { label: "生物工程导论", category: "engineering" },
  "biochemistry": { label: "生物化学", category: "medicine" },
  "biology-basics": { label: "生物学基础", category: "science" },
  "biomedical-engineering": { label: "生物医学工程", category: "engineering" },
  "blockchain": { label: "区块链技术", category: "engineering" },
  "bridge-engineering": { label: "桥梁工程", category: "engineering" },
  "chemical-engineering": { label: "化学工程基础", category: "engineering" },
  "chemical-reaction-eng": { label: "化学反应工程", category: "engineering" },
  "chemical-synthesis": { label: "有机合成", category: "science" },
  "chinese-lit-history": { label: "中国文学史", category: "literature" },
  "chinese-philosophy": { label: "中国哲学史", category: "philosophy" },
  "circuit-basics": { label: "电路基础", category: "engineering" },
  "civil-engineering": { label: "土木工程概论", category: "engineering" },
  "civil-law": { label: "民法学", category: "law" },
  "civil-procedure": { label: "民事诉讼法学", category: "law" },
  "clinical-medicine": { label: "临床医学导论", category: "medicine" },
  "cognitive-psychology": { label: "认知心理学", category: "science" },
  "color-theory": { label: "色彩学", category: "art" },
  "commercial-law": { label: "商法学", category: "law" },
  "communication-theory": { label: "传播学理论", category: "literature" },
  "comparative-education": { label: "比较教育学", category: "education" },
  "compiler-principles": { label: "编译原理", category: "engineering" },
  "complex-analysis": { label: "复变函数", category: "science" },
  "computer-architecture": { label: "计算机体系结构", category: "engineering" },
  "computer-graphics": { label: "计算机图形学", category: "engineering" },
  "computer-network": { label: "计算机网络", category: "engineering" },
  "computer-organization": { label: "计算机组成原理", category: "engineering" },
  "computer-vision": { label: "计算机视觉", category: "engineering" },
  "constitution": { label: "宪法学", category: "law" },
  "consumer-behavior": { label: "消费者行为学", category: "management" },
  "corporate-finance": { label: "公司金融", category: "economics" },
  "criminal-law": { label: "刑法学", category: "law" },
  "crop-science": { label: "作物栽培学", category: "agriculture" },
  "curriculum-teaching": { label: "课程与教学论", category: "education" },
  "dance-intro": { label: "舞蹈学导论", category: "art" },
  "data-science": { label: "数据科学导论", category: "engineering" },
  "database-system": { label: "数据库系统", category: "engineering" },
  "design": { label: "设计学导论", category: "art" },
  "design-history": { label: "设计史", category: "art" },
  "development-economics": { label: "发展经济学", category: "economics" },
  "diagnostics": { label: "诊断学", category: "medicine" },
  "differential-geometry": { label: "微分几何", category: "science" },
  "digital-circuits": { label: "数字电路", category: "engineering" },
  "discrete-math": { label: "离散数学", category: "engineering" },
  "distributed-systems": { label: "分布式系统导论", category: "engineering" },
  "ds-algorithms": { label: "数据结构与算法", category: "engineering" },
  "e-commerce": { label: "电子商务概论", category: "management" },
  "ecology": { label: "生态学", category: "science" },
  "econometrics": { label: "计量经济学", category: "economics" },
  "economic-history": { label: "经济思想史", category: "economics" },
  "economic-law": { label: "经济法学", category: "law" },
  "edu-psychology": { label: "教育心理学", category: "education" },
  "education-principle": { label: "教育学原理", category: "education" },
  "educational-technology": { label: "教育技术学", category: "education" },
  "electrodynamics": { label: "电动力学", category: "science" },
  "electromagnetism": { label: "大学物理 · 电磁学", category: "science" },
  "electronic-information": { label: "电子信息基础", category: "engineering" },
  "embedded-systems": { label: "嵌入式系统", category: "engineering" },
  "energy-power": { label: "能源与动力工程", category: "engineering" },
  "engineering-mechanics": { label: "工程力学", category: "engineering" },
  "environmental-eng": { label: "环境工程原理", category: "engineering" },
  "environmental-science": { label: "环境科学与工程", category: "engineering" },
  "ethnology": { label: "民族学概论", category: "law" },
  "exercise-physiology": { label: "运动生理学", category: "education" },
  "film-history": { label: "电影史", category: "art" },
  "film-theater": { label: "戏剧影视学导论", category: "art" },
  "finance": { label: "金融学基础", category: "economics" },
  "fiscal-science": { label: "财政学", category: "economics" },
  "food-science": { label: "食品科学与工程", category: "engineering" },
  "forestry": { label: "林学概论", category: "agriculture" },
  "forestry-engineering": { label: "林业工程导论", category: "engineering" },
  "functional-analysis": { label: "泛函分析", category: "science" },
  "genetics": { label: "遗传学", category: "science" },
  "geography": { label: "地理科学导论", category: "science" },
  "geological-engineering": { label: "地质工程", category: "engineering" },
  "geology": { label: "地质学导论", category: "science" },
  "geophysics": { label: "地球物理学导论", category: "science" },
  "grassland-science": { label: "草学导论", category: "agriculture" },
  "group-theory": { label: "群论", category: "science" },
  "heat-transfer": { label: "传热学", category: "engineering" },
  "horticulture": { label: "园艺学", category: "agriculture" },
  "hr-management": { label: "人力资源管理", category: "management" },
  "human-anatomy": { label: "人体解剖学", category: "medicine" },
  "human-geography": { label: "人文地理学", category: "science" },
  "hydraulic-engineering": { label: "水利工程导论", category: "engineering" },
  "hydrology": { label: "水文学原理", category: "engineering" },
  "immunology": { label: "免疫学", category: "medicine" },
  "industrial-economics": { label: "产业经济学", category: "economics" },
  "industrial-engineering": { label: "工业工程导论", category: "management" },
  "information-security": { label: "信息安全导论", category: "engineering" },
  "inorganic-chemistry": { label: "无机化学", category: "science" },
  "instrumentation": { label: "仪器科学与技术", category: "engineering" },
  "integrative-medicine": { label: "中西医结合导论", category: "medicine" },
  "intellectual-property-law": { label: "知识产权法学", category: "law" },
  "internal-medicine": { label: "内科学", category: "medicine" },
  "international-econ": { label: "国际经济学", category: "economics" },
  "international-law": { label: "国际法学", category: "law" },
  "international-trade": { label: "国际贸易实务", category: "economics" },
  "investment": { label: "投资学", category: "economics" },
  "journalism-communication": { label: "新闻传播学概论", category: "literature" },
  "jurisprudence": { label: "法理学导论", category: "law" },
  "labor-economics": { label: "劳动经济学", category: "economics" },
  "library-science": { label: "图书情报与档案管理", category: "management" },
  "light-industry": { label: "轻工技术与工程", category: "engineering" },
  "linear-algebra": { label: "线性代数", category: "science" },
  "linguistics-intro": { label: "语言学概论", category: "literature" },
  "logic": { label: "逻辑学", category: "philosophy" },
  "logistics": { label: "物流管理导论", category: "management" },
  "machine-design": { label: "机械设计", category: "engineering" },
  "machine-learning": { label: "机器学习", category: "engineering" },
  "macroeconomics": { label: "宏观经济学", category: "economics" },
  "management-information-systems": { label: "管理信息系统", category: "management" },
  "management-principle": { label: "管理学原理", category: "management" },
  "management-science": { label: "管理科学（运筹学）", category: "management" },
  "manufacturing-tech": { label: "机械制造技术基础", category: "engineering" },
  "marine-science": { label: "海洋科学导论", category: "science" },
  "marketing": { label: "市场营销学", category: "management" },
  "marxism-theory": { label: "马克思主义基本原理", category: "law" },
  "material-physics": { label: "材料物理与化学", category: "engineering" },
  "materials-science": { label: "材料科学基础", category: "engineering" },
  "mathematical-statistics": { label: "数理统计", category: "science" },
  "mechanical-engineering": { label: "机械设计基础", category: "engineering" },
  "mechanics": { label: "大学物理 · 力学", category: "science" },
  "medical-microbiology": { label: "医学微生物学", category: "medicine" },
  "medical-technology": { label: "医学技术导论", category: "medicine" },
  "microeconomics": { label: "微观经济学", category: "economics" },
  "mining-engineering": { label: "采矿工程概论", category: "engineering" },
  "modern-china-history": { label: "中国近现代史", category: "history" },
  "modern-chinese": { label: "现代汉语", category: "literature" },
  "modern-control": { label: "现代控制理论", category: "engineering" },
  "molecular-biology": { label: "分子生物学", category: "science" },
  "money-banking": { label: "货币银行学", category: "economics" },
  "music-history": { label: "西方音乐史", category: "art" },
  "music-theory": { label: "音乐基础理论", category: "art" },
  "nature-conservation": { label: "自然保护与环境生态", category: "agriculture" },
  "neurology": { label: "神经病学", category: "medicine" },
  "new-media-studies": { label: "新媒体研究", category: "literature" },
  "nlp-intro": { label: "自然语言处理", category: "engineering" },
  "nuclear-engineering": { label: "核工程导论", category: "engineering" },
  "numerical-analysis": { label: "数值分析", category: "science" },
  "nursing": { label: "护理学导论", category: "medicine" },
  "obstetrics-gynecology": { label: "妇产科学", category: "medicine" },
  "ocean-engineering": { label: "船舶与海洋工程", category: "engineering" },
  "ode": { label: "常微分方程", category: "science" },
  "oop": { label: "面向对象程序设计", category: "engineering" },
  "operating-system": { label: "操作系统", category: "engineering" },
  "optics": { label: "光学", category: "science" },
  "organic-chemistry": { label: "有机化学", category: "science" },
  "pathology-intro": { label: "病理学导论", category: "medicine" },
  "pathophysiology": { label: "病理生理学", category: "medicine" },
  "pediatrics": { label: "儿科学", category: "medicine" },
  "pharmacology": { label: "药理学", category: "medicine" },
  "pharmacy": { label: "药学导论", category: "medicine" },
  "philosophy-intro": { label: "哲学导论", category: "philosophy" },
  "physical-chemistry": { label: "物理化学", category: "science" },
  "physiology": { label: "生理学", category: "medicine" },
  "plant-protection": { label: "植物保护学", category: "agriculture" },
  "political-science": { label: "政治学概论", category: "law" },
  "polymer-chemistry": { label: "高分子化学", category: "science" },
  "power-electronics": { label: "电力电子技术", category: "engineering" },
  "probability-stats": { label: "概率论与数理统计", category: "science" },
  "programming-basics": { label: "程序设计基础", category: "engineering" },
  "project-management": { label: "项目管理", category: "management" },
  "psychiatry": { label: "精神病学", category: "medicine" },
  "public-administration": { label: "公共管理学导论", category: "management" },
  "public-health": { label: "公共卫生与预防医学", category: "medicine" },
  "public-policy": { label: "公共政策分析", category: "management" },
  "quantum-mechanics": { label: "量子力学", category: "science" },
  "real-analysis": { label: "实变函数", category: "science" },
  "safety-engineering": { label: "安全工程导论", category: "engineering" },
  "scientific-psychology": { label: "普通心理学", category: "science" },
  "signals-systems": { label: "信号与系统", category: "engineering" },
  "silviculture": { label: "森林培育学", category: "agriculture" },
  "sketch-basics": { label: "素描基础", category: "art" },
  "sociology": { label: "社会学概论", category: "law" },
  "software-engineering": { label: "软件工程导论", category: "engineering" },
  "soil-science": { label: "土壤学", category: "agriculture" },
  "solid-state-physics": { label: "固体物理", category: "science" },
  "sports-science": { label: "体育学导论", category: "education" },
  "stomatology": { label: "口腔医学导论", category: "medicine" },
  "strategic-management": { label: "战略管理", category: "management" },
  "structural-chemistry": { label: "结构化学", category: "science" },
  "structural-mechanics": { label: "结构力学", category: "engineering" },
  "surgery": { label: "外科学", category: "medicine" },
  "surveying": { label: "测绘学导论", category: "engineering" },
  "tcm": { label: "中医学导论", category: "medicine" },
  "tcm-diagnosis": { label: "中医诊断学", category: "medicine" },
  "tcm-pharmacy": { label: "中药学导论", category: "medicine" },
  "textile-engineering": { label: "纺织工程概论", category: "engineering" },
  "theoretical-mechanics": { label: "理论力学", category: "science" },
  "theory-of-computation": { label: "计算理论导论", category: "engineering" },
  "thermodynamics": { label: "热力学与统计物理", category: "science" },
  "topology": { label: "拓扑学", category: "science" },
  "tourism-management": { label: "旅游管理学导论", category: "management" },
  "traffic-eng": { label: "交通工程学", category: "engineering" },
  "transportation": { label: "交通运输工程", category: "engineering" },
  "veterinary": { label: "兽医学导论", category: "agriculture" },
  "western-philosophy": { label: "西方哲学史", category: "philosophy" },
  "world-history": { label: "世界史", category: "history" },
  "world-lit-history": { label: "外国文学史", category: "literature" },
};
{
  const allSkills = db.prepare("SELECT id, domain, name, prereqs, sort_order FROM skills ORDER BY domain, sort_order").all();
  const byDomain = {};
  allSkills.forEach(s => {
    if (String(s.domain).startsWith("ct")) return;
    if (!byDomain[s.domain]) byDomain[s.domain] = [];
    byDomain[s.domain].push(s);
  });
  const toAdd = [];
  const toUpdate = [];
  for (const [domain, skills] of Object.entries(byDomain)) {
    const hasRootOverview = skills.some(s => {
      try { const pres = JSON.parse(s.prereqs || "[]"); return pres.length === 0 && /总览|概述|概论|导论/.test(s.name); } catch(e){ return false; }
    });
    if (hasRootOverview) continue;
    const meta = DOMAIN_OVERVIEW_META[domain];
    if (!meta) continue;
    const overviewId = domain + "-overview";
    if (db.prepare("SELECT 1 FROM skills WHERE id=?").get(overviewId)) continue;
    const label = meta.label;
    const cat = meta.category;
    let desc = "";
    if (cat === "history") desc = label + "总览：从起源到当代的时间框架与核心线索，政治经济与文化成就的总体脉络与学习地图";
    else if (cat === "science") desc = label + "总览：" + label + "的整体框架与核心脉络，直觉定义、定理证明与典型例题的总体结构与学习地图";
    else if (cat === "engineering") desc = label + "总览：" + label + "的整体框架与核心脉络，概念原理、实现方法与应用局限的总体结构与学习地图";
    else if (cat === "medicine") desc = label + "总览：" + label + "的整体框架与核心脉络，概念机制、诊断治疗与案例前沿的总体结构与学习地图";
    else if (cat === "law") desc = label + "总览：" + label + "的整体框架与核心脉络，概念渊源、制度结构与案例争议的总体结构与学习地图";
    else if (cat === "economics" || cat === "management") desc = label + "总览：" + label + "的整体框架与核心脉络，概念理论、模型方法与政策前沿的总体结构与学习地图";
    else if (cat === "literature") desc = label + "总览：" + label + "的整体框架与核心脉络，文本细读、历史脉络与批评方法的总体结构与学习地图";
    else if (cat === "education") desc = label + "总览：" + label + "的整体框架与核心脉络，概念目的、课程教学与评价方法的总体结构与学习地图";
    else if (cat === "art") desc = label + "总览：" + label + "的整体框架与核心脉络，概念技法、风格流派与经典鉴赏的总体结构与学习地图";
    else if (cat === "agriculture") desc = label + "总览：" + label + "的整体框架与核心脉络，生产原理、栽培技术与前沿应用的总体结构与学习地图";
    else if (cat === "philosophy") desc = label + "总览：" + label + "的整体框架与核心脉络，核心问题、主要流派与经典论证的总体结构与学习地图";
    else desc = label + "总览：" + label + "的整体框架与核心脉络，概念原理、关键方法与典型应用的总体结构与学习地图";
    const minSort = Math.min.apply(null, skills.map(s => Number(s.sort_order) || 0));
    toAdd.push({ id: overviewId, domain, name: label + "总览", description: desc, difficulty: 0.15, prereqs: [], sort_order: minSort - 1 });
    const roots = skills.filter(s => { try { return JSON.parse(s.prereqs || "[]").length === 0; } catch(e){ return false; } });
    for (const r of roots) toUpdate.push({ id: r.id, overviewId });
  }
  if (toAdd.length) {
    console.log("[math-mentor] overview migration: adding " + toAdd.length + " overviews, updating " + toUpdate.length + " roots");
    db.exec("BEGIN");
    try {
      const ins = db.prepare("INSERT INTO skills (id, domain, name, description, difficulty, prereqs, sort_order) VALUES (?,?,?,?,?,?,?)");
      for (const s of toAdd) ins.run(s.id, s.domain, s.name, s.description, s.difficulty, JSON.stringify(s.prereqs), s.sort_order);
      const upd = db.prepare("UPDATE skills SET prereqs=? WHERE id=?");
      for (const u of toUpdate) {
        const cur = db.prepare("SELECT prereqs FROM skills WHERE id=?").get(u.id);
        if (!cur) continue;
        let pres; try { pres = JSON.parse(cur.prereqs || "[]"); } catch(e){ pres = []; }
        if (pres.includes(u.overviewId)) continue;
        pres.push(u.overviewId);
        upd.run(JSON.stringify(pres), u.id);
      }
      db.exec("COMMIT");
      console.log("[math-mentor] overview migration done: " + toAdd.length + " added");
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch(e2){}
      console.error("[math-mentor] overview migration failed", e && e.message || e);
    }
  } else {
    console.log("[math-mentor] overview migration: no domains need overview");
  }
  // 二次修复：已存在总览但根未连接的域（幂等，覆盖 221 个历史遗留根）
  {
    const allSkills2 = db.prepare("SELECT id, domain, name, prereqs FROM skills ORDER BY domain, sort_order").all();
    const byDomain2 = {};
    allSkills2.forEach(s => { if (String(s.domain).startsWith("ct")) return; if (!byDomain2[s.domain]) byDomain2[s.domain] = []; byDomain2[s.domain].push(s); });
    let toFix2 = [];
    for (const [domain, skills] of Object.entries(byDomain2)) {
      const overviewCandidates = skills.filter(s => /总览|概述|概论|导论/.test(s.name) && (()=>{ try{ return JSON.parse(s.prereqs||"[]").length===0; }catch(e){return false;}})());
      if (!overviewCandidates.length) continue;
      const main = overviewCandidates.find(s => s.name.includes("总览")) || overviewCandidates[0];
      const nonOverviewRoots = skills.filter(s => { try{ return JSON.parse(s.prereqs||"[]").length===0 && s.id!==main.id && !/总览|概述|概论|导论/.test(s.name); }catch(e){return false;}});
      for (const r of nonOverviewRoots) toFix2.push({ id: r.id, overviewId: main.id });
    }
    if (toFix2.length) {
      console.log("[math-mentor] overview reconnect: fixing " + toFix2.length + " disconnected roots");
      db.exec("BEGIN");
      try {
        const upd2 = db.prepare("UPDATE skills SET prereqs=? WHERE id=?");
        let fixed2 = 0;
        for (const f of toFix2) {
          const cur = db.prepare("SELECT prereqs FROM skills WHERE id=?").get(f.id);
          if (!cur) continue;
          let pres; try{ pres=JSON.parse(cur.prereqs||"[]"); }catch(e){pres=[];}
          if (pres.includes(f.overviewId)) continue;
          pres.push(f.overviewId);
          upd2.run(JSON.stringify(pres), f.id);
          fixed2++;
        }
        db.exec("COMMIT");
        console.log("[math-mentor] overview reconnect done: " + fixed2 + " fixed");
      } catch(e){ try{db.exec("ROLLBACK");}catch(e2){} console.error("[math-mentor] overview reconnect failed", e && e.message || e); }
    } else {
      console.log("[math-mentor] overview reconnect: no disconnected roots");
    }
  }
  // ---------- 薄域扩容迁移：6→8、7→8（幂等，补齐至 8 章教材体量） ----------
  {
    const allSkills3 = db.prepare("SELECT domain, id, name, prereqs, sort_order FROM skills ORDER BY domain, sort_order").all();
    const byDomain3 = {};
    allSkills3.forEach(s => { if (String(s.domain).startsWith("ct")) return; if (s.domain === "ancient-china-history") return; if (!byDomain3[s.domain]) byDomain3[s.domain] = []; byDomain3[s.domain].push(s); });
    let toAdd3 = [];
    for (const [domain, skills] of Object.entries(byDomain3)) {
      const c = skills.length;
      if (c >= 8) continue;
      const meta = DOMAIN_OVERVIEW_META[domain];
      if (!meta) continue;
      const label = meta.label;
      const cat = meta.category;
      const maxSort = Math.max.apply(null, skills.map(s => Number(s.sort_order) || 0));
      const lastId = skills[skills.length - 1].id;
      function genName3(idx, total) {
        if (total === 1) {
          if (cat === "science") return label + "前沿与综合";
          if (cat === "engineering") return label + "前沿技术与综合设计";
          if (cat === "medicine") return label + "临床综合与前沿";
          if (cat === "law") return label + "前沿与综合案例";
          if (cat === "economics" || cat === "management") return label + "前沿与综合分析";
          if (cat === "literature") return label + "前沿与综合研读";
          if (cat === "education") return label + "前沿与综合实践";
          if (cat === "art") return label + "前沿与综合创作";
          if (cat === "agriculture") return label + "前沿与综合应用";
          if (cat === "philosophy") return label + "前沿与综合论题";
          if (cat === "history") return label + "前沿与综合研究";
          return label + "前沿与综合";
        } else {
          if (idx === 0) {
            if (cat === "science") return label + "前沿进展";
            if (cat === "engineering") return label + "前沿技术";
            if (cat === "medicine") return label + "临床综合";
            if (cat === "law") return label + "前沿专题";
            if (cat === "economics" || cat === "management") return label + "前沿专题";
            return label + "前沿专题";
          } else {
            if (cat === "science") return label + "综合应用与拓展";
            if (cat === "engineering") return label + "系统综合设计";
            if (cat === "medicine") return label + "前沿与案例综合";
            if (cat === "law") return label + "综合案例与实务";
            if (cat === "economics" || cat === "management") return label + "综合案例与策略";
            return label + "综合应用";
          }
        }
      }
      function genDesc3(name, cat) {
        let dims = "";
        if (cat === "history") dims = "时空背景、政治制度、经济形态、社会结构、文化成就与兴衰演变";
        else if (cat === "science") dims = "直觉理解、严格定义、核心定理、证明推导、典型例题与常见误区";
        else if (cat === "engineering") dims = "基本概念、工作原理、实现方法、复杂度分析、应用场景与技术局限";
        else if (cat === "medicine") dims = "基本概念、发病机制、诊断评估、治疗干预、典型案例与前沿争议";
        else if (cat === "law") dims = "基本概念、法律渊源、制度结构、适用规则、典型案例与学术争议";
        else if (cat === "economics" || cat === "management") dims = "基本概念、核心理论、分析模型、实证方法、政策策略与前沿动态";
        else if (cat === "literature") dims = "核心概念、文本细读、历史脉络、流派风格、典型作品与批评方法";
        else if (cat === "education") dims = "基本概念、教育目的、课程教学、学习心理、评价方法与实践案例";
        else if (cat === "art") dims = "基本概念、创作技法、风格流派、经典作品、审美鉴赏与批评";
        else if (cat === "agriculture") dims = "基本概念、生产原理、栽培技术、病虫防治、典型案例与前沿技术";
        else if (cat === "philosophy") dims = "核心概念、基本问题、主要流派、经典论证、现实意义与争议";
        else dims = "核心概念、基本原理、关键方法、典型例子、常见误区与应用拓展";
        return name + "：系统讲解" + name + "的" + dims + "，注重综合性与前沿性，帮助建立完整知识体系";
      }
      function genDiff3(cat, idx) { return cat === "history" ? 0.55 : 0.58 + idx * 0.04; }
      if (c === 6) {
        const name1 = genName3(0, 2);
        const name2 = genName3(1, 2);
        const id1 = domain + "-adv-1";
        const id2 = domain + "-adv-2";
        if (db.prepare("SELECT 1 FROM skills WHERE id=?").get(id1) || db.prepare("SELECT 1 FROM skills WHERE id=?").get(id2)) continue;
        toAdd3.push({ id: id1, domain, name: name1, description: genDesc3(name1, cat), difficulty: genDiff3(cat, 0), prereqs: [lastId], sort_order: maxSort + 1 });
        toAdd3.push({ id: id2, domain, name: name2, description: genDesc3(name2, cat), difficulty: genDiff3(cat, 1), prereqs: [id1], sort_order: maxSort + 2 });
      } else if (c === 7) {
        const name1 = genName3(0, 1);
        const id1 = domain + "-adv-1";
        if (db.prepare("SELECT 1 FROM skills WHERE id=?").get(id1)) continue;
        toAdd3.push({ id: id1, domain, name: name1, description: genDesc3(name1, cat), difficulty: genDiff3(cat, 0), prereqs: [lastId], sort_order: maxSort + 1 });
      }
    }
    if (toAdd3.length) {
      console.log("[math-mentor] thin domain expansion: adding " + toAdd3.length + " skills");
      db.exec("BEGIN");
      try {
        const ins3 = db.prepare("INSERT INTO skills (id, domain, name, description, difficulty, prereqs, sort_order) VALUES (?,?,?,?,?,?,?)");
        for (const s of toAdd3) ins3.run(s.id, s.domain, s.name, s.description, s.difficulty, JSON.stringify(s.prereqs), s.sort_order);
        db.exec("COMMIT");
        console.log("[math-mentor] thin domain expansion done: " + toAdd3.length + " added");
      } catch (e) { try { db.exec("ROLLBACK"); } catch (e2) {} console.error("[math-mentor] thin domain expansion failed", e && e.message || e); }
    } else {
      console.log("[math-mentor] thin domain expansion: no domains need expansion");
    }
  }
}

// ---------- helpers ----------
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 2e6) reject(new Error("body too large")); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
// 二进制请求体读取（PPT 导出上传用）
function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > (maxBytes || 32e6)) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
// 导出文件目录与清理（保留最近 24 小时）
function ensureExportDir() {
  const dir = path.join(DATA_DIR, "exports");
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try { if (Date.now() - fs.statSync(fp).mtimeMs > 864e5) fs.unlinkSync(fp); } catch (e) {}
    }
  } catch (e) {}
  return dir;
}
function logEvent(domain, type, detail) {
  try { db.prepare("INSERT INTO events (domain, event_type, detail) VALUES (?,?,?)").run(domain || "", type, typeof detail === "string" ? detail : JSON.stringify(detail)); } catch (e) {}
}
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function withTx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { try { db.exec("ROLLBACK"); } catch (e2) {} throw e; }
}

// mastery 更新：答对 +0.1 / 提示后答对 +0.04 / 答错 -0.08；遗忘曲线 1/3/7/14 天
function applyMastery(skillId, correct, hintUsed) {
  let row = db.prepare("SELECT * FROM mastery WHERE skill_id = ?").get(skillId);
  if (!row) {
    db.prepare("INSERT INTO mastery (skill_id, mastery) VALUES (?, 0.3)").run(skillId);
    row = db.prepare("SELECT * FROM mastery WHERE skill_id = ?").get(skillId);
  }
  const delta = correct ? (hintUsed ? 0.04 : 0.1) : -0.08;
  const mastery = clamp(Number(row.mastery) + delta, 0.05, 0.95);
  const streak = correct ? Number(row.streak || 0) + 1 : 0;
  const days = correct ? (streak <= 1 ? 1 : streak === 2 ? 3 : streak === 3 ? 7 : 14) : 1;
  const nextReview = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  db.prepare(`UPDATE mastery SET mastery=?, attempts=attempts+1, correct=correct+?,
    streak=?, last_practiced=?, next_review=? WHERE skill_id=?`)
    .run(mastery, correct ? 1 : 0, streak, now, nextReview, skillId);
  return { skill_id: skillId, mastery: Math.round(mastery * 100) / 100, delta: Math.round(delta * 100) / 100, next_review: nextReview, streak };
}

// ---------- static assets ----------
const MIME = { ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".html": "text/html; charset=utf-8", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  try {
    // ---- GET / 或 /index.html：直接访问调试用（应用面板由框架提供 HTML） -------
    if ((p === "/" || p === "/index.html") && req.method === "GET") {
      const fp = path.join(ROOT, "index.html");
      if (fs.existsSync(fp)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return fs.createReadStream(fp).pipe(res);
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "index.html not found" }));
    }

    // ---- static -------
    if (p.startsWith("/assets/")) {
      const rel = decodeURIComponent(p.slice(8));
      const filePath = path.normalize(path.join(ASSETS_DIR, rel));
      if (!filePath.startsWith(ASSETS_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404); return res.end("not found");
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
      return fs.createReadStream(filePath).pipe(res);
    }
    if (p.startsWith("/js/") || p.startsWith("/css/")) {
      const rel = decodeURIComponent(p.slice(1));
      const filePath = path.normalize(path.join(ROOT, rel));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "not found: " + p }));
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
      return fs.createReadStream(filePath).pipe(res);
    }

    // ---- GET /api/bootstrap -------
    if (p === "/api/bootstrap" && req.method === "GET") {
      const skills = db.prepare("SELECT * FROM skills ORDER BY domain, sort_order").all()
        .map((s) => ({ ...s, prereqs: JSON.parse(s.prereqs || "[]") }));
      const masteryRows = db.prepare("SELECT * FROM mastery").all();
      const mastery = {};
      masteryRows.forEach((m) => { mastery[m.skill_id] = m; });
      const diagRows = db.prepare("SELECT * FROM diagnosis").all();
      const diagnosis = {};
      diagRows.forEach((d) => { diagnosis[d.domain] = { profile: JSON.parse(d.profile || "{}"), summary: d.summary, created_at: d.created_at }; });
      const settings = {};
      db.prepare("SELECT * FROM settings").all().forEach((s) => { settings[s.key] = s.value; });
      const byDomain = {};
      const domains = db.prepare("SELECT DISTINCT domain FROM skills ORDER BY domain").all().map(r => r.domain);
      for (const d of domains) {
        const att = db.prepare("SELECT COUNT(*) c, SUM(correct) ok FROM attempts a JOIN questions q ON q.id=a.question_id WHERE q.domain=?").get(d);
        const due = db.prepare("SELECT COUNT(*) c FROM mastery m JOIN skills s ON s.id=m.skill_id WHERE s.domain=? AND m.next_review!='' AND m.next_review<=date('now','localtime')").get(d);
        const q = db.prepare("SELECT COUNT(*) c FROM questions WHERE domain=?").get(d);
        byDomain[d] = { attempts: att.c || 0, correct: att.ok || 0, due: due.c || 0, questions: q.c || 0 };
      }
      return json(res, 200, { skills, mastery, diagnosis, settings, stats: byDomain });
    }

    // ---- POST /api/domain -------
    if (p === "/api/domain" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.domain) return json(res, 400, { error: "domain required" });
      db.prepare("INSERT INTO settings (key,value) VALUES ('current_domain',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(b.domain);
      logEvent(b.domain, "domain", { domain: b.domain });
      return json(res, 200, { ok: true });
    }

    // ---- POST /api/goal -------
    if (p === "/api/goal" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.domain) return json(res, 400, { error: "domain required" });
      db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("goal:" + b.domain, String(b.goal || ""));
      db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("time:" + b.domain, String(b.time_budget || "30"));
      logEvent(b.domain, "goal", { goal: b.goal || "", time_budget: b.time_budget || "30" });
      return json(res, 200, { ok: true });
    }

    // ---- POST /api/settings -------
    if (p === "/api/settings" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.key) return json(res, 400, { error: "key required" });
      db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(b.key, String(b.value ?? ""));
      return json(res, 200, { ok: true });
    }

    // ---- POST /api/quiz-save（保存出好的题目，供错题本复用） -------
    if (p === "/api/quiz-save" && req.method === "POST") {
      const b = await readBody(req);
      if (!Array.isArray(b.questions)) return json(res, 400, { error: "questions array required" });
      const ins = db.prepare("INSERT INTO questions (domain, skill_id, difficulty, qtype, content, answer, explanation, options) VALUES (?,?,?,?,?,?,?,?)");
      const ids = [];
      for (const q of b.questions) {
        const opts = Array.isArray(q.options) ? q.options.map(o => String(o ?? "")).filter(o => o.trim()) : [];
        const r = ins.run(b.domain, q.skill_id, Number(q.difficulty) || 0.5, q.type || q.qtype || "calculation", String(q.content || ""), String(q.answer || ""), String(q.explanation || ""), JSON.stringify(opts));
        ids.push(Number(r.lastInsertRowid));
      }
      return json(res, 200, { ids });
    }

    // ---- POST /api/answer（批改结果回写：attempts + mastery + events） -------
    if (p === "/api/answer" && req.method === "POST") {
      const b = await readBody(req);
      const qid = Number(b.question_id);
      if (!qid) return json(res, 400, { error: "question_id required" });
      const q = db.prepare("SELECT * FROM questions WHERE id=?").get(qid);
      if (!q) return json(res, 404, { error: "question not found" });
      db.prepare("INSERT INTO attempts (question_id, user_answer, correct, hint_used, error_type, feedback) VALUES (?,?,?,?,?,?)")
        .run(qid, String(b.user_answer || ""), b.correct ? 1 : 0, b.hint_used ? 1 : 0, String(b.error_type || "none"), String(b.feedback || ""));
      const m = applyMastery(q.skill_id, !!b.correct, !!b.hint_used);
      logEvent(q.domain, "answer", { skill_id: q.skill_id, question_id: qid, correct: !!b.correct, mastery: m.mastery });
      return json(res, 200, { mastery: m });
    }

    // ---- POST /api/diagnosis-save -------
    if (p === "/api/diagnosis-save" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.domain || !b.profile) return json(res, 400, { error: "domain and profile required" });
      db.prepare("INSERT INTO diagnosis (domain, profile, summary, created_at) VALUES (?,?,?,datetime('now','localtime')) ON CONFLICT(domain) DO UPDATE SET profile=excluded.profile, summary=excluded.summary, created_at=datetime('now','localtime')")
        .run(b.domain, JSON.stringify(b.profile), String(b.summary || ""));
      const ups = db.prepare(`INSERT INTO mastery (skill_id, mastery, confidence) VALUES (?,?,0.7)
        ON CONFLICT(skill_id) DO UPDATE SET mastery=excluded.mastery, confidence=excluded.confidence`);
      for (const [sid, m] of Object.entries(b.profile)) {
        ups.run(sid, clamp(Number(m), 0.05, 0.95));
      }
      logEvent(b.domain, "diagnosis", { profile: b.profile });
      return json(res, 200, { ok: true });
    }

    // ---- GET /api/wrong -------
    if (p === "/api/wrong" && req.method === "GET") {
      const domain = url.searchParams.get("domain") || "";
      const rows = db.prepare(`SELECT q.id, q.domain, q.skill_id, q.content, q.answer, q.explanation, q.options, q.difficulty,
        a.user_answer, a.feedback, a.error_type, a.created_at AS answered_at
        FROM attempts a JOIN questions q ON q.id = a.question_id
        WHERE a.correct = 0 ${domain ? "AND q.domain = ?" : ""}
        ORDER BY a.id DESC LIMIT 100`).all(...(domain ? [domain] : []));
      rows.forEach(r => { try { r.options = JSON.parse(r.options || "[]"); } catch (e) { r.options = []; } });
      return json(res, 200, { wrong: rows });
    }

    // ---- GET /api/review-queue -------
    if (p === "/api/review-queue" && req.method === "GET") {
      const domain = url.searchParams.get("domain") || "";
      const rows = db.prepare(`SELECT s.id, s.domain, s.name, s.description, s.difficulty, m.mastery, m.next_review, m.streak
        FROM mastery m JOIN skills s ON s.id = m.skill_id
        WHERE m.next_review != '' AND m.next_review <= date('now','localtime')
        ${domain ? "AND s.domain = ?" : ""} ORDER BY m.next_review ASC LIMIT 30`).all(...(domain ? [domain] : []));
      return json(res, 200, { due: rows });
    }

    // ---- GET /api/events -------
    if (p === "/api/events" && req.method === "GET") {
      const domain = url.searchParams.get("domain") || "";
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
      const rows = db.prepare(`SELECT * FROM events ${domain ? "WHERE domain = ?" : ""} ORDER BY id DESC LIMIT ?`).all(...(domain ? [domain, limit] : [limit]));
      return json(res, 200, { events: rows });
    }

    // ================= 自定义专题 CRUD =================
    // 把大纲章节写入 skills 表（章间线性依赖、章内线性依赖），使学习闭环（导览/诊断/学习/复习）完全复用
    function topicToSkills(topicId, outline) {
      const rows = [];
      let order = 0;
      let prevAll = null; // 全专题前一个节点
      outline.forEach((ch, ci) => {
        let prevIn = null; // 本章内前一个节点
        ch.nodes.forEach((nd, ni) => {
          const id = "ct-" + topicId + "-" + ci + "-" + ni;
          const prereqs = [];
          if (prevIn) prereqs.push(prevIn);
          else if (prevAll) prereqs.push(prevAll);
          rows.push({
            id, domain: topicId, name: nd.name, description: nd.desc || "",
            difficulty: clamp(Number(nd.difficulty ?? ch.difficulty ?? 0.5), 0.05, 0.95),
            prereqs, sort_order: order++
          });
          prevIn = id; prevAll = id;
        });
      });
      return rows;
    }
    function deleteTopicData(topicId) {
      const skIds = db.prepare("SELECT id FROM skills WHERE domain=?").all(topicId).map(r => r.id);
      const qIds = db.prepare("SELECT id FROM questions WHERE domain=?").all(topicId).map(r => r.id);
      const delSk = db.prepare("DELETE FROM skills WHERE domain=?");
      const delQ = db.prepare("DELETE FROM questions WHERE domain=?");
      const delM = db.prepare("DELETE FROM mastery WHERE skill_id=?");
      const delL = db.prepare("DELETE FROM lessons WHERE skill_id=?");
      const delLS = db.prepare("DELETE FROM lesson_sections WHERE skill_id=?");
      const delA = db.prepare("DELETE FROM attempts WHERE question_id=?");
      // 注意：调用方已开启事务（PUT/DELETE 路由），此处不再嵌套 BEGIN
      qIds.forEach(q => delA.run(q));
      delQ.run(topicId);
      skIds.forEach(s => { delM.run(s); delL.run(s); delLS.run(s); });
      delSk.run(topicId);
      db.prepare("DELETE FROM intros WHERE domain=?").run(topicId);
      db.prepare("DELETE FROM diagnosis WHERE domain=?").run(topicId);
      db.prepare("DELETE FROM events WHERE domain=?").run(topicId);
    }
    function normalizeOutline(o) {
      if (!Array.isArray(o) || !o.length) throw new Error("大纲不能为空");
      const out = [];
      o.forEach((ch, ci) => {
        const name = String(ch.name || "").trim();
        if (!name) throw new Error("第 " + (ci + 1) + " 章缺少名称");
        const nodes = (Array.isArray(ch.nodes) ? ch.nodes : [])
          .map(nd => ({ name: String(nd.name || "").trim(), desc: String(nd.desc || "").trim(), difficulty: Number(nd.difficulty ?? ch.difficulty ?? 0.5) }))
          .filter(nd => nd.name);
        if (!nodes.length) throw new Error("第 " + (ci + 1) + " 章（" + name + "）没有节点");
        out.push({ name, difficulty: Number(ch.difficulty ?? 0.5), nodes });
      });
      return out;
    }

    // GET /api/custom：专题列表
    if (p === "/api/custom" && req.method === "GET") {
      const topics = db.prepare("SELECT * FROM custom_topics ORDER BY created_at DESC, id").all();
      const out = topics.map(t => {
        const sk = db.prepare("SELECT COUNT(*) c FROM skills WHERE domain=?").get(t.id);
        let outline;
        try { outline = JSON.parse(t.outline || "[]"); } catch (e) { outline = []; }
        return { id: t.id, title: t.title, emoji: t.emoji, tagline: t.tagline, outline,
          created_at: t.created_at, updated_at: t.updated_at, skill_count: sk.c };
      });
      return json(res, 200, { topics: out });
    }

    // POST /api/custom：创建专题
    if (p === "/api/custom" && req.method === "POST") {
      const b = await readBody(req);
      const title = String(b.title || "").trim();
      if (!title) return json(res, 400, { error: "专题名称不能为空" });
      let outline;
      try { outline = normalizeOutline(b.outline); } catch (e) { return json(res, 400, { error: e.message }); }
      const id = "ct" + Date.now().toString(36);
      withTx(() => {
        db.prepare("INSERT INTO custom_topics (id,title,emoji,tagline,outline) VALUES (?,?,?,?,?)")
          .run(id, title, String(b.emoji || "🎨").slice(0, 8), String(b.tagline || "").slice(0, 200), JSON.stringify(outline));
        const ins = db.prepare("INSERT INTO skills (id, domain, name, description, difficulty, prereqs, sort_order) VALUES (?,?,?,?,?,?,?)");
        topicToSkills(id, outline).forEach(s => ins.run(s.id, s.domain, s.name, s.description, s.difficulty, JSON.stringify(s.prereqs), s.sort_order));
      });
      logEvent(id, "custom_create", title);
      return json(res, 200, { id, outline });
    }

    // PUT /api/custom/:id：更新元信息或替换大纲（重建 skills）
    if (p.startsWith("/api/custom/") && (req.method === "PUT")) {
      const id = decodeURIComponent(p.slice("/api/custom/".length));
      const t = db.prepare("SELECT * FROM custom_topics WHERE id=?").get(id);
      if (!t) return json(res, 404, { error: "专题不存在" });
      const b = await readBody(req);
      const title = b.title !== undefined ? String(b.title).trim() : t.title;
      if (!title) return json(res, 400, { error: "专题名称不能为空" });
      let outline = null;
      if (b.outline !== undefined) {
        try { outline = normalizeOutline(b.outline); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      withTx(() => {
        if (outline) {
          deleteTopicData(id);
          const ins = db.prepare("INSERT INTO skills (id, domain, name, description, difficulty, prereqs, sort_order) VALUES (?,?,?,?,?,?,?)");
          topicToSkills(id, outline).forEach(s => ins.run(s.id, s.domain, s.name, s.description, s.difficulty, JSON.stringify(s.prereqs), s.sort_order));
          db.prepare("UPDATE custom_topics SET title=?, emoji=?, tagline=?, outline=?, updated_at=datetime('now','localtime') WHERE id=?")
            .run(title, String(b.emoji ?? t.emoji).slice(0, 8), String(b.tagline ?? t.tagline).slice(0, 200), JSON.stringify(outline), id);
        } else {
          db.prepare("UPDATE custom_topics SET title=?, emoji=?, tagline=?, updated_at=datetime('now','localtime') WHERE id=?")
            .run(title, String(b.emoji ?? t.emoji).slice(0, 8), String(b.tagline ?? t.tagline).slice(0, 200), id);
        }
      });
      logEvent(id, "custom_edit", title);
      return json(res, 200, { ok: true });
    }

    // DELETE /api/custom/:id：删除专题（级联清理学习数据）
    if (p.startsWith("/api/custom/") && req.method === "DELETE") {
      const id = decodeURIComponent(p.slice("/api/custom/".length));
      const t = db.prepare("SELECT * FROM custom_topics WHERE id=?").get(id);
      if (!t) return json(res, 404, { error: "专题不存在" });
      withTx(() => {
        deleteTopicData(id);
        db.prepare("DELETE FROM custom_topics WHERE id=?").run(id);
      });
      logEvent(id, "custom_delete", t.title);
      return json(res, 200, { ok: true });
    }

    // ---- POST /api/export：接收前端生成的 pptx 二进制，保存到 data/exports/ 并返回下载地址 -------
    if (p === "/api/export" && req.method === "POST") {
      const raw = await readRawBody(req, 32e6);
      if (!raw || !raw.length) return json(res, 400, { error: "empty body" });
      let reqName = "export";
      try {
        const b64 = String(req.headers["x-export-name"] || "");
        if (b64) reqName = Buffer.from(b64, "base64").toString("utf8");
      } catch (e) { reqName = "export"; }
      const safe = reqName.replace(/[^\w\u4e00-\u9fa5.-]/g, "_").slice(0, 60) || "export";
      const dir = ensureExportDir();
      const fname = Date.now() + "-" + safe + (safe.toLowerCase().endsWith(".pptx") ? "" : ".pptx");
      fs.writeFileSync(path.join(dir, fname), raw);
      // 同时落一份到项目 exports/ 目录：用户在项目文件树里直接拿文件（绕过浏览器下载限制）
      let projectPath = null, projectErr = null;
      try {
        fs.mkdirSync(PROJECT_EXPORTS_DIR, { recursive: true });
        const pp = path.join(PROJECT_EXPORTS_DIR, fname);
        fs.writeFileSync(pp, raw);
        projectPath = pp;
      } catch (e) { projectErr = String((e && e.message) || e); }
      return json(res, 200, {
        name: fname,
        url: "/api/export/" + encodeURIComponent(fname),
        projectPath,
        projectErr,
        projectDir: PROJECT_EXPORTS_DIR,
        projectRoot: PROJECT_ROOT,
        appDataPath: path.join(dir, fname)
      });
    }

    // ---- GET /api/export/:name：下载导出文件 -------
    if (p.startsWith("/api/export/") && req.method === "GET") {
      const dir = path.join(DATA_DIR, "exports");
      const name = decodeURIComponent(p.slice("/api/export/".length));
      const filePath = path.normalize(path.join(dir, name));
      if (!filePath.startsWith(dir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404); return res.end("not found");
      }
      res.writeHead(200, {
        "Content-Type": MIME[".pptx"],
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(name),
        "Cache-Control": "no-store"
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // ---- POST /api/diag：接收前端环境探测信息（写 data/diag.json，供诊断） -------
    if (p === "/api/diag" && req.method === "POST") {
      try {
        const raw = await readRawBody(req, 64e3);
        const info = JSON.parse(raw.toString("utf8") || "{}");
        fs.writeFileSync(path.join(DATA_DIR, "diag.json"), JSON.stringify(info, null, 2));
      } catch (e) { /* 忽略无效上报 */ }
      return json(res, 200, { ok: true });
    }

    // ---- POST /api/export-open：在系统默认浏览器中打开下载链接（绕过沙箱下载限制） -------
    if (p === "/api/export-open" && req.method === "POST") {
      const b = await readBody(req);
      let target = String((b && b.url) || "");
      // 安全校验：仅允许指向本服务的 /api/export/ 路径
      let ok = /^\/api\/export\//.test(target) || /^https?:\/\/[^/]+\/api\/export\//.test(target);
      if (ok) {
        const host = String(req.headers.host || ("localhost:" + PORT));
        if (target.startsWith("/")) target = "http://" + host + target;
        try {
          const u = new URL(target);
          ok = u.pathname.startsWith("/api/export/") && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.host === host);
        } catch (e) { ok = false; }
      }
      if (!ok) return json(res, 400, { error: "invalid url" });
      const platform = process.platform;
      const cmd = platform === "darwin" ? "open" : (platform === "win32" ? "cmd" : "xdg-open");
      const args = platform === "win32" ? ["/c", "start", "", target] : [target];
      try {
        const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
        child.unref();
        return json(res, 200, { ok: true, opened: true, platform });
      } catch (e) {
        return json(res, 500, { error: "open failed: " + (e.message || e) });
      }
    }

    // ---- GET /api/lesson?skill_id=xxx（读讲解缓存） -------
    if (p === "/api/lesson" && req.method === "GET") {
      const sid = url.searchParams.get("skill_id") || "";
      if (!sid) return json(res, 400, { error: "skill_id required" });
      const row = db.prepare("SELECT * FROM lessons WHERE skill_id = ?").get(sid);
      return json(res, 200, { lesson: row || null });
    }

    // ---- POST /api/lesson（保存/清除讲解缓存） -------
    if (p === "/api/lesson" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.skill_id) return json(res, 400, { error: "skill_id required" });
      const content = String(b.content || "").trim();
      if (!content) {
        db.prepare("DELETE FROM lessons WHERE skill_id = ?").run(b.skill_id);
        return json(res, 200, { ok: true, cached: false });
      }
      db.prepare("INSERT INTO lessons (skill_id, content) VALUES (?,?) ON CONFLICT(skill_id) DO UPDATE SET content=excluded.content, created_at=datetime('now','localtime')")
        .run(b.skill_id, content);
      return json(res, 200, { ok: true, cached: true });
    }

    // ---- GET /api/lesson-sections?skill_id=xxx（读分节讲解缓存） -------
    if (p === "/api/lesson-sections" && req.method === "GET") {
      const sid = url.searchParams.get("skill_id") || "";
      if (!sid) return json(res, 400, { error: "skill_id required" });
      const rows = db.prepare("SELECT seq, title, content FROM lesson_sections WHERE skill_id = ? ORDER BY seq").all(sid);
      return json(res, 200, { sections: rows || [] });
    }

    // ---- POST /api/lesson-sections（整体替换分节讲解；sections=[] 时清除） -------
    if (p === "/api/lesson-sections" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.skill_id) return json(res, 400, { error: "skill_id required" });
      const sections = Array.isArray(b.sections) ? b.sections : [];
      withTx(() => {
        db.prepare("DELETE FROM lesson_sections WHERE skill_id = ?").run(b.skill_id);
        sections.forEach((s, i) => {
          db.prepare("INSERT INTO lesson_sections (skill_id, seq, title, content) VALUES (?,?,?,?)")
            .run(b.skill_id, Number.isFinite(s.seq) ? s.seq : i, String(s.title || ""), String(s.content || ""));
        });
      });
      return json(res, 200, { ok: true, count: sections.length });
    }

    // ---- POST /api/lesson-section（逐节追加保存，流式生成时断点续存） -------
    if (p === "/api/lesson-section" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.skill_id) return json(res, 400, { error: "skill_id required" });
      const seq = Number.isFinite(Number(b.seq)) ? Number(b.seq) : -1;
      if (seq < 0) return json(res, 400, { error: "seq required" });
      const content = String(b.content || "").trim();
      if (!content) {
        db.prepare("DELETE FROM lesson_sections WHERE skill_id = ? AND seq = ?").run(b.skill_id, seq);
        return json(res, 200, { ok: true, removed: true });
      }
      db.prepare("INSERT INTO lesson_sections (skill_id, seq, title, content) VALUES (?,?,?,?) ON CONFLICT(skill_id, seq) DO UPDATE SET title=excluded.title, content=excluded.content, created_at=datetime('now','localtime')")
        .run(b.skill_id, seq, String(b.title || ""), content);
      return json(res, 200, { ok: true, saved: true });
    }

    // ---- GET /api/intro?domain=xxx（读领域导览缓存） -------
    if (p === "/api/intro" && req.method === "GET") {
      const domain = url.searchParams.get("domain") || "";
      if (!domain) return json(res, 400, { error: "domain required" });
      const row = db.prepare("SELECT * FROM intros WHERE domain = ?").get(domain);
      return json(res, 200, { intro: row || null });
    }

    // ---- POST /api/intro（保存/清除领域导览缓存） -------
    if (p === "/api/intro" && req.method === "POST") {
      const b = await readBody(req);
      if (!b.domain) return json(res, 400, { error: "domain required" });
      const content = String(b.content || "").trim();
      if (!content) {
        db.prepare("DELETE FROM intros WHERE domain = ?").run(b.domain);
        return json(res, 200, { ok: true, cached: false });
      }
      db.prepare("INSERT INTO intros (domain, content) VALUES (?,?) ON CONFLICT(domain) DO UPDATE SET content=excluded.content, created_at=datetime('now','localtime')")
        .run(b.domain, content);
      logEvent(b.domain, "intro", { domain: b.domain });
      return json(res, 200, { ok: true, cached: true });
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "not found: " + p }));
  } catch (e) {
    console.error("[math-mentor]", e);
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[math-mentor] listening on http://${HOST}:${PORT}, db=${DB_PATH}`);
});
