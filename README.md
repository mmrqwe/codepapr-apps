# CodePapr Apps & Plugins Market

Official Registry and Repository for [CodePapr](https://github.com/mmrqwe/CodePapr) desktop apps and overlay plugins.

## 📦 Directory Structure

```text
codepapr-apps/
├── registry.json             # Central registry index for CodePapr desktop client
├── README.md                 # Market guide & contribution specs
└── apps/                     # Curated apps and plugins
    └── <app-id>/
        ├── manifest.json     # Papr standard manifest
        ├── index.html        # App/Plugin entry
        ├── css/
        └── js/
```

## 🚀 Available Apps & Plugins

| App / Plugin | Kind | Description | Author |
| :--- | :--- | :--- | :--- |
| **[▦ 看板 (cursor-canvas)](apps/cursor-canvas/)** | `plugin` | 极简可视化产物看板，支持指标卡片、数据表格、柱状/折线/面积/环形图表、拓扑架构图、代码 Diff、待办清单及历史回放与导出 | CodePapr |
| **[⛅ 天气小组件 (weather-hud)](apps/weather-hud/)** | `plugin` | 悬浮天气插件，支持搜索任意城市、收藏常用地区，实时显示温度/体感/风力/湿度与5日预报 | CodePapr |
| **[🎓 多学科学习导师 (math-mentor)](apps/math-mentor/)** | `app` | 普林斯顿读本式多学科学习导师：导览、诊断、讲解、练习与复习闭环，覆盖大学本科专业类课程 | CodePapr |

## 🛠️ Contribution & Publishing

To submit an App or Plugin to the CodePapr Market:

1. Create a subfolder under `apps/<your-app-id>/`.
2. Provide a valid `manifest.json` following `papr/0.1` specification.
3. Register your app metadata in `registry.json`.
4. Open a Pull Request!
