# 看板 (Cursor Canvas) Plugin for CodePapr

▦ **Cursor Canvas** 是一款专为 CodePapr 设计的极简可视化产物看板插件，深度仿造并对齐了 Cursor IDE 的 Canvas 概念与设计规范。

当编程 Agent 执行定量指标分析、架构设计审查、代码 Diff 评审、待办步骤规划或输出结构化数据时，可通过 `app_publish` 实时推送至该看板独立展示。

---

## ✨ 核心特性

- **丰富的数据可视化组件（Blocks）**：
  - 📊 **指标卡片 (`stats`)**：核心数值、趋势增减（`delta`、`up`/`down`）、迷你走势图（`spark`）。
  - 📋 **数据表格 (`table`)**：自动识别表头、斑马行排版、状态单元格自动徽章化（`✓`/`⚠`）。
  - 📈 **图表系统 (`chart`)**：纯 SVG 矢量渲染，支持柱状图（`bar`）、横向对比图（`barh`）、折线趋势图（`line`）、面积图（`area`）、环形占比图（`donut`/`pie`），自带零基线与等宽数字对齐。
  - 🕸️ **拓扑架构图 (`diagram`)**：内置 DAG 自动分层排版引擎、贝塞尔连线、箭头标识与节点点击高亮，支持横向平滑滚动。
  - 🔍 **代码变更 (`diff`)**：内置 Unified Diff 解析器，清晰展示增删行与行号前缀。
  - ✅ **待办清单 (`todo`)**：支持交互勾选、任务进度条、优先级标识。
  - 📝 **说明与提示 (`text` / `callout` / `box` / `columns`)**：支持富文本、信息卡片与 1~3 列响应式分栏。
- **纯原生零依赖运行时（Zero-Dependency Native Architecture）**：
  - 彻底去除外部 vendor 脚本依赖，体积缩减 98%（从 1.5MB 优化至 ~25KB），秒级冷启动，杜绝任何 vendor 加载丢失问题。
- **高健壮性与多级容错**：
  - **ErrorBoundary**：组件级错误边界拦截。
  - **Plain DOM 兜底**：若 UI 框架初始化异常，自动降级为原生 DOM 渲染。
  - **样式容错**：自动纠正 Agent 传入的 CSS 字符串格式。
- **完整持久化与历史回放**：
  - 自动将看板快照持久化至 SQLite（`board:history`），最多保留 60 条记录。
  - 提供历史抽屉，支持切换查看、单条删除、全局清空与“恢复最近一条”。
  - 支持一键导出离线自包含 HTML 文件（`downloadHtml`）。
- **深浅色主题无缝跟随**：
  - 自动检测并实时监听宿主 IDE 的深浅色主题切换。
- **安全与隐私保障**：
  - 权限声明为 `local: "none"` 与 `network: false`，不请求任何外部网络与项目私有文件，纯本地沙箱执行。

---

## 📡 Agent 推送协议

Agent 可在任意对话中使用 `app_publish` 工具向 `board` 频道推送数据：

### 1. 全量覆盖 / 新建 (`op: "replace"`)

```json
{
  "appId": "cursor-canvas",
  "channel": "board",
  "payload": {
    "op": "replace",
    "title": "PR 审查总结看板",
    "subtitle": "feat/auth-v2 · +342 -30",
    "blocks": [
      {
        "type": "stats",
        "items": [
          { "label": "新增代码", "value": "+342 行", "delta": "+15%", "trend": "up" },
          { "label": "单元测试覆盖率", "value": "89.4%", "delta": "+4.2%", "trend": "up" }
        ]
      },
      {
        "type": "table",
        "title": "关键变更模块",
        "columns": ["文件路径", "改动量", "安全评估"],
        "rows": [
          ["src/auth/jwt.ts", "+120", "✓ 通过"],
          ["src/db/user.ts", "+45", "✓ 通过"],
          ["src/middleware/rateLimit.ts", "-30", "⚠ 待审查"]
        ]
      },
      {
        "type": "chart",
        "chartType": "bar",
        "title": "鉴权接口耗时对比 (ms)",
        "unit": "ms",
        "data": [
          { "name": "优化前 (JWT V1)", "value": 48 },
          { "name": "优化后 (JWT V2)", "value": 16 }
        ]
      }
    ]
  }
}
```

### 2. 追加块 (`op: "append"`)

```json
{
  "appId": "cursor-canvas",
  "channel": "board",
  "payload": {
    "op": "append",
    "blocks": [
      {
        "type": "callout",
        "tone": "ok",
        "content": "所有自动化集成测试已通过，随时可合并。"
      }
    ]
  }
}
```

### 3. 局部更新 (`op: "patch"`)

支持通过指定 block 的 `id` 或索引位置更新已有组件：

```json
{
  "appId": "cursor-canvas",
  "channel": "board",
  "payload": {
    "op": "patch",
    "blocks": [
      {
        "id": "task_list",
        "type": "todo",
        "title": "部署准备",
        "items": [
          { "label": "代码合并", "done": true },
          { "label": "线上镜像构建", "done": true },
          { "label": "灰度发布验证", "done": false }
        ]
      }
    ]
  }
}
```

### 4. 清空看板 (`op: "clear"`)

```json
{
  "appId": "cursor-canvas",
  "channel": "board",
  "payload": {
    "op": "clear"
  }
}
```

---

## 🧩 支持的 Block 类型规范

| 类型 | 说明 | 主要字段 |
| :--- | :--- | :--- |
| `stats` | 指标卡片网格 | `items: [{ label, value, delta?, trend?, spark?, caption? }]` |
| `table` | 数据表格 | `title?, columns: string[], rows: any[][]` |
| `chart` | 统计图表 | `chartType: "bar"\|"barh"\|"line"\|"area"\|"donut", data: [{ name, value }], unit?` |
| `diagram` | 拓扑架构图 | `nodes: [{ id, label, sub?, color? }], edges: [{ from, to, label?, dashed? }]` |
| `diff` | 代码变更 | `file?, diff: string` 或 `lines: [{ op: "add"\|"del"\|"ctx", code }]` |
| `todo` | 待办清单 | `title?, items: [{ label, done: boolean, meta?, priority? }]` |
| `text` | 富文本/说明 | `title?, content?, items?: string[], code?, lang?, callout?` |
| `callout` | 提示条 | `tone: "info"\|"warn"\|"ok", title?, content` |
| `box` | 内容卡片 | `title?, content?, items?: string[], variant?` |
| `columns` | 多列栅格 | `cols: 1\|2\|3, blocks: Block[]` |

---

## 📂 目录结构

```text
cursor-canvas/
├── manifest.json       # Papr 插件规范清单 (定义权限、overlay尺寸与inbox频道契约)
├── index.html          # 极简宿主入口与防白闪主题同步机制
├── README.md           # 插件使用文档与协议说明
├── css/
│   └── theme.css       # 扁平极简设计样式表 (支持系统深浅色与CodePapr主题切换)
└── js/
    └── main.js         # 纯原生零依赖核心渲染器、状态管理与 SQLite 存储逻辑
```
