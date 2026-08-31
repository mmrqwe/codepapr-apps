// 权威教材注册表 — 按 domain 对齐，生成时注入 prompt，超范围提示
// 每个 domain 2-3 本中外权威教材，含 scope 用于对齐校验
export const TEXTBOOKS = {
  // 数学类
  "analysis": [
    { id: "rudin-principles", title: "Principles of Mathematical Analysis", authors: "Walter Rudin", publisher: "McGraw-Hill", year: "1976", edition: "3rd", lang: "en", scope: "Ch.1-4 实数系/拓扑/数列与函数极限/连续，Ch.5-6 微分/积分，Ch.7-8 级数/一致收敛", note: "数学分析标准教材，国内常称「Rudin」" },
    { id: "zhuo-li", title: "数学分析", authors: "卓里奇 (В.А. Зорич)", publisher: "高等教育出版社", year: "2006", edition: "中译第4版", lang: "zh", scope: "第1-4章 集合/实数/极限/连续，第5-8章 微分/积分/级数", note: "俄罗斯经典，国内数学系常用" },
    { id: "zhang-zhusheng", title: "数学分析新讲", authors: "张筑生", publisher: "北京大学出版社", year: "1990", lang: "zh", scope: "全三册覆盖实数/极限/微分/积分/级数", note: "北大教材" }
  ],
  "linear-algebra": [
    { id: "strang", title: "Introduction to Linear Algebra", authors: "Gilbert Strang", publisher: "Wellesley-Cambridge", year: "2016", edition: "5th", lang: "en", scope: "Ch.1-6 方程组/向量空间/正交/行列式/特征值/SVD", note: "MIT 公开课教材" },
    { id: "tongji", title: "线性代数", authors: "同济大学数学系", publisher: "高等教育出版社", year: "2014", edition: "6th", lang: "zh", scope: "第1-6章 行列式/矩阵/向量组/方程组/特征值/二次型", note: "国内工科通用" },
    { id: "axler", title: "Linear Algebra Done Right", authors: "Sheldon Axler", publisher: "Springer", year: "2015", edition: "3rd", lang: "en", scope: "向量空间/线性映射/特征值/内积", note: "抽象视角" }
  ],
  "group-theory": [
    { id: "dummit-foote", title: "Abstract Algebra", authors: "Dummit & Foote", publisher: "Wiley", year: "2004", edition: "3rd", lang: "en", scope: "Ch.1-4 群论：群/子群/商群/同态", note: "抽象代数标准教材" },
    { id: "huang-hua", title: "抽象代数基础", authors: "丘维声", publisher: "高等教育出版社", year: "2015", lang: "zh", scope: "第1-3章 群/环/域，群论部分", note: "国内常用" }
  ],
  "probability-stats": [
    { id: "ross", title: "A First Course in Probability", authors: "Sheldon Ross", publisher: "Pearson", year: "2019", edition: "10th", lang: "en", scope: "Ch.1-8 组合/随机变量/分布/极限定理", note: "概率入门经典" },
    { id: "chen-xiru", title: "概率论与数理统计", authors: "陈希孺", publisher: "中国科学技术大学出版社", year: "2009", lang: "zh", scope: "概率/统计推断/回归", note: "国内经典" },
    { id: "hogg", title: "Introduction to Mathematical Statistics", authors: "Hogg et al.", publisher: "Pearson", year: "2018", edition: "8th", lang: "en", scope: "统计推断部分", note: "数理统计" }
  ],
  // 物理类
  "mechanics": [
    { id: "halliday", title: "Fundamentals of Physics", authors: "Halliday/Resnick/Walker", publisher: "Wiley", year: "2018", edition: "11th", lang: "en", scope: "Ch.1-15 力学/振动/波", note: "大学物理通用" },
    { id: "zhao-kaihua", title: "新概念物理教程·力学", authors: "赵凯华/罗蔚茵", publisher: "高等教育出版社", year: "2004", lang: "zh", scope: "质点/刚体/振动/相对论", note: "国内物理系常用" }
  ],
  "electromagnetism": [
    { id: "griffiths-em", title: "Introduction to Electrodynamics", authors: "David Griffiths", publisher: "Cambridge", year: "2017", edition: "4th", lang: "en", scope: "静电/静磁/麦克斯韦方程", note: "电磁学经典" },
    { id: "zhao-kaihua-em", title: "新概念物理教程·电磁学", authors: "赵凯华/陈熙谋", publisher: "高等教育出版社", year: "2006", lang: "zh", scope: "电磁学全册", note: "国内教材" }
  ],
  // 化学类
  "inorganic-chemistry": [
    { id: "huheey", title: "Inorganic Chemistry", authors: "Huheey et al.", publisher: "HarperCollins", year: "1993", edition: "4th", lang: "en", scope: "原子结构/键/配位/固体", note: "无机经典" },
    { id: "wuji", title: "无机化学", authors: "武汉大学等", publisher: "高等教育出版社", year: "2018", edition: "4th", lang: "zh", scope: "全册", note: "国内通用" }
  ],
  "organic-chemistry": [
    { id: "clayden", title: "Organic Chemistry", authors: "Clayden et al.", publisher: "Oxford", year: "2012", edition: "2nd", lang: "en", scope: "结构/机理/合成", note: "有机经典" },
    { id: "xing-qiyi", title: "基础有机化学", authors: "邢其毅等", publisher: "高等教育出版社", year: "2016", edition: "4th", lang: "zh", scope: "全册", note: "国内教材" }
  ],
  // 计算机类
  "ds-algorithms": [
    { id: "clrs", title: "Introduction to Algorithms", authors: "Cormen et al.", publisher: "MIT Press", year: "2022", edition: "4th", lang: "en", scope: "全册：排序/数据结构/图/动态规划", note: "算法圣经" },
    { id: "deng-junhui", title: "数据结构", authors: "邓俊辉", publisher: "清华大学出版社", year: "2013", lang: "zh", scope: "向量/列表/树/图", note: "清华教材" }
  ],
  "operating-system": [
    { id: "ostep", title: "Operating Systems: Three Easy Pieces", authors: "Arpaci-Dusseau", publisher: "Arpaci-Dusseau", year: "2018", lang: "en", scope: "虚拟化/并发/持久化", note: "OSTEP" },
    { id: "silberschatz", title: "Operating System Concepts", authors: "Silberschatz et al.", publisher: "Wiley", year: "2018", edition: "10th", lang: "en", scope: "全册", note: "恐龙书" },
    { id: "tang-xiaodan", title: "计算机操作系统", authors: "汤小丹等", publisher: "西安电子科技大学出版社", year: "2014", edition: "4th", lang: "zh", scope: "全册", note: "国内常用" }
  ],
  "computer-network": [
    { id: "kurose", title: "Computer Networking: A Top-Down Approach", authors: "Kurose & Ross", publisher: "Pearson", year: "2021", edition: "7th", lang: "en", scope: "应用/传输/网络/链路", note: "自顶向下" },
    { id: "xie-xiren", title: "计算机网络", authors: "谢希仁", publisher: "电子工业出版社", year: "2021", edition: "8th", lang: "zh", scope: "全册", note: "国内通用" }
  ],
  "database-system": [
    { id: "cow-book", title: "Database System Concepts", authors: "Silberschatz et al.", publisher: "McGraw-Hill", year: "2019", edition: "7th", lang: "en", scope: "关系模型/SQL/事务", note: "奶牛书" },
    { id: "wang-shan", title: "数据库系统概论", authors: "王珊/萨师煊", publisher: "高等教育出版社", year: "2014", edition: "5th", lang: "zh", scope: "全册", note: "国内教材" }
  ],
  "computer-organization": [
    { id: "patterson", title: "Computer Organization and Design", authors: "Patterson & Hennessy", publisher: "Morgan Kaufmann", year: "2020", edition: "5th", lang: "en", scope: "MIPS/RISC-V 体系", note: "计组经典" },
    { id: "tang-nianguang", title: "计算机组成原理", authors: "唐朔飞", publisher: "高等教育出版社", year: "2019", edition: "3rd", lang: "zh", scope: "全册", note: "国内教材" }
  ],
  "discrete-math": [
    { id: "rosen", title: "Discrete Mathematics and Its Applications", authors: "Kenneth Rosen", publisher: "McGraw-Hill", year: "2019", edition: "8th", lang: "en", scope: "逻辑/集合/图/组合", note: "离散经典" },
    { id: "qu-wanling", title: "离散数学", authors: "屈婉玲等", publisher: "高等教育出版社", year: "2015", lang: "zh", scope: "全册", note: "北大教材" }
  ],
  "ai-intro": [
    { id: "russell-norvig", title: "Artificial Intelligence: A Modern Approach", authors: "Russell & Norvig", publisher: "Pearson", year: "2020", edition: "4th", lang: "en", scope: "搜索/逻辑/学习/感知", note: "AI 圣经" },
    { id: "zhou-zhihua", title: "机器学习", authors: "周志华", publisher: "清华大学出版社", year: "2016", lang: "zh", scope: "全册", note: "西瓜书" }
  ],
  // 经济学
  "microeconomics": [
    { id: "mankiw-micro", title: "Principles of Microeconomics", authors: "N. Gregory Mankiw", publisher: "Cengage", year: "2021", edition: "9th", lang: "en", scope: "供需/消费者/厂商/市场失灵", note: "曼昆" },
    { id: "samuelson", title: "Economics", authors: "Samuelson & Nordhaus", publisher: "McGraw-Hill", year: "2010", edition: "19th", lang: "en", scope: "微观部分", note: "萨缪尔森" },
    { id: "gao-hongye", title: "西方经济学（微观部分）", authors: "高鸿业", publisher: "中国人民大学出版社", year: "2021", edition: "8th", lang: "zh", scope: "全册", note: "国内通用" }
  ],
  "macroeconomics": [
    { id: "mankiw-macro", title: "Macroeconomics", authors: "N. Gregory Mankiw", publisher: "Worth", year: "2019", edition: "10th", lang: "en", scope: "GDP/通胀/增长/政策", note: "曼昆宏观" },
    { id: "blanchard", title: "Macroeconomics", authors: "Olivier Blanchard", publisher: "Pearson", year: "2020", edition: "8th", lang: "en", scope: "全册", note: "布兰查德" }
  ],
  "finance": [
    { id: "bodie", title: "Investments", authors: "Bodie/Kane/Marcus", publisher: "McGraw-Hill", year: "2021", edition: "12th", lang: "en", scope: "资产定价/组合", note: "投资学" },
    { id: "mishkin", title: "Money, Banking and Financial Markets", authors: "Frederic Mishkin", publisher: "Pearson", year: "2018", lang: "en", scope: "货币/银行", note: "米什金" }
  ],
  // 历史
  "ancient-china-history": [
    { id: "qian-mu", title: "国史大纲", authors: "钱穆", publisher: "商务印书馆", year: "1996", lang: "zh", scope: "上古至近代", note: "史学经典" },
    { id: "zhang-yinlin", title: "中国史纲", authors: "张荫麟", publisher: "中华书局", year: "2008", lang: "zh", scope: "先秦至明清", note: "通史" },
    { id: "fairbank", title: "China: A New History", authors: "John Fairbank", publisher: "Harvard", year: "2006", edition: "2nd", lang: "en", scope: "全册", note: "费正清" }
  ],
  "world-history": [
    { id: "stavrianos", title: "A Global History", authors: "L.S. Stavrianos", publisher: "Prentice Hall", year: "1999", edition: "7th", lang: "en", scope: "1500年前/后", note: "斯塔夫里阿诺斯" },
    { id: "wu-yuqi", title: "世界史", authors: "吴于廑/齐世荣", publisher: "高等教育出版社", year: "2011", edition: "6th", lang: "zh", scope: "古代/近代/现代", note: "国内教材" }
  ],
  // 法学
  "jurisprudence": [
    { id: "zhang-wenxian", title: "法理学", authors: "张文显", publisher: "高等教育出版社", year: "2018", edition: "5th", lang: "zh", scope: "法的概念/体系/法治", note: "国内法理学通用" },
    { id: "hart", title: "The Concept of Law", authors: "H.L.A. Hart", publisher: "Oxford", year: "2012", edition: "3rd", lang: "en", scope: "法律概念", note: "哈特" }
  ],
  // 哲学
  "philosophy-intro": [
    { id: "russell-history", title: "A History of Western Philosophy", authors: "Bertrand Russell", publisher: "Simon & Schuster", year: "1945", lang: "en", scope: "古希腊至现代", note: "罗素" },
    { id: "feng-youlan", title: "中国哲学史", authors: "冯友兰", publisher: "中华书局", year: "2011", lang: "zh", scope: "先秦至近代", note: "冯友兰" }
  ],
  // 通用兜底：未单独列出的 domain 使用分类级教材
  "__fallback": {
    "philosophy": [{ title: "哲学导论", authors: "冯友兰/罗素", publisher: "商务印书馆/Oxford", note: "按具体 domain 补充" }],
    "economics": [{ title: "经济学原理", authors: "曼昆/高鸿业", publisher: "Cengage/人大", note: "通用" }],
    "law": [{ title: "法学概论", authors: "张文显", publisher: "高教", note: "通用" }],
    "history": [{ title: "史学概论", authors: "钱穆/斯塔夫里阿诺斯", publisher: "商务/Prentice Hall", note: "通用" }],
    "science": [{ title: "理科基础教材", authors: "见具体学科", note: "通用" }],
    "engineering": [{ title: "工学基础", authors: "见具体学科", note: "通用" }]
  }
};

export function getTextbooks(domain) {
  if (TEXTBOOKS[domain]) return TEXTBOOKS[domain];
  return [];
}
export function getTextbooksWithFallback(domain, category) {
  if (TEXTBOOKS[domain]) return TEXTBOOKS[domain];
  if (category && TEXTBOOKS.__fallback[category]) return TEXTBOOKS.__fallback[category];
  return [];
}

export function formatTextbookPrompt(domain, category) {
  const books = category ? getTextbooksWithFallback(domain, category) : getTextbooks(domain);
  if (!books.length) return "";
  const lines = books.map((b, i) => `${i + 1}. 《${b.title}》${b.authors ? " — " + b.authors : ""}${b.publisher ? "（" + b.publisher + (b.year ? " " + b.year : "") + "）" : ""}${b.scope ? " 覆盖：" + b.scope : ""}`).join("\n");
  return `【权威教材对齐】本学科权威教材：\n${lines}\n要求：讲解必须与上述教材的体系/术语/范围对齐；超出教材范围的内容必须在末尾标注「⚠️ 超出教材范围：…」并说明依据；优先采用教材的定义与符号。`;
}

export function getTextbookScopeNote(domain) {
  const books = getTextbooks(domain);
  if (!books.length) return "";
  return books.map(b => `《${b.title}》${b.scope || ""}`).join("；");
}
