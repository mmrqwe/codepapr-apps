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
| **[⛅ 天气小组件 (weather-hud)](apps/weather-hud/)** | `plugin` | 悬浮天气插件，支持搜索任意城市、收藏常用地区，实时显示温度/体感/风力/湿度与5日预报 | CodePapr |

## 🛠️ Contribution & Publishing

To submit an App or Plugin to the CodePapr Market:

1. Create a subfolder under `apps/<your-app-id>/`.
2. Provide a valid `manifest.json` following `papr/0.1` specification.
3. Register your app metadata in `registry.json`.
4. Open a Pull Request!
