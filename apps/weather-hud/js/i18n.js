let lang = (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'zh';

const STRINGS = {
  zh: {
    docTitle: '天气小组件',
    brandTitle: '天气',
    refresh: '刷新',
    toggleUnit: '切换 °C/°F',
    settings: '设置',
    loading: '正在获取天气…',
    loadFail: '加载失败',
    retry: '重试',
    feels: '体感',
    humidity: '湿度',
    wind: '风速',
    precip: '降水',
    hourly: '24 小时',
    forecast: '5 日预报',
    footer: '数据 Open-Meteo · 无需 Key',
    setRegion: '设置地区',
    dragHeight: '拖动调整高度（双击重置）',
    dragLabel: '拖动调整高度',
    settingsTitle: '设置',
    settingsSub: '搜索城市、收藏常用地区、切换单位',
    addRegion: '添加地区',
    searchPh: '搜索城市，如 北京 / shanghai / Tokyo',
    search: '搜索',
    searchHint: '支持中文/拼音/英文，回车或点搜索',
    favorites: '已收藏',
    emptyFav: '暂无收藏，搜索后点“添加”',
    displayStorage: '显示与存储',
    tempUnit: '温度单位',
    tempUnitHint: '在主界面与预报中生效，已自动保存',
    currentRegion: '当前地区',
    detecting: '○ 检测中',
    selfTest: '存储自检',
    runTest: '运行测试',
    notTested: '尚未测试',
    selfTestHint: '写入回读测试会验证 papr.db → localStorage → memory 三级回退是否可用',
    winHeight: '窗口高度',
    winHeightHint: '拖动底部手柄可调整，已自动保存',
    reset560: '重置 560',
    settingsFoot: '主界面已精简，地区在设置中管理',
    done: '完成',
    add: '添加',
    switch: '切换',
    remove: '移除',
    current: '当前',
    now: '现在',
    today: '今天',
    hourUnit: '时',
    hours: '小时',
    preview: '预览',
    sunrise: '日出',
    sunset: '日落',
    windDir: '风向',
    unknown: '未知',
    noHourly: '暂无逐小时数据',
    noCity: '暂无城市，请打开设置添加',
    searching: '搜索中…',
    notFound: (q) => `未找到“${q}”，试试英文或拼音`,
    foundN: (n) => `找到 ${n} 个结果，点击可预览天气，点“添加”收藏`,
    searchFail: (m) => `搜索失败：${m}`,
    previewCity: (name, meta) => `预览：${name}${meta ? ' · ' + meta : ''}（未收藏）`,
    addedSaved: (name, backend) => `已添加 ${name} 并保存（${backend}）`,
    addedFail: (name, err) => `已添加 ${name}（保存失败：${err}）`,
    addedSwitched: (name) => `已添加 ${name}，主界面已切换`,
    addedNotPersisted: (name) => `已添加 ${name} 但未持久化，请点“运行测试”查看详情`,
    previewing: (name) => `预览 ${name} …`,
    updating: (name) => `正在更新 ${name} …`,
    previewUpdated: (name, when) => `预览 ${name} · ${when} 更新`,
    updated: (name, when) => `${name} · ${when} 更新`,
    updateFail: '更新失败',
    weatherFailManifest: (raw) => `获取天气失败：宿主初始化中（manifest not loaded），已自动用备用通道重试仍失败。请点重试或 2 秒后点 ↻。\n详情：${raw}`,
    weatherFail: (raw) => `获取天气失败：${raw}\n请检查网络后重试`,
    locPreview: (name) => `${name} · 预览`,
    countCities: (n) => `${n} 个`,
    savedSqlite: '● 已保存 · sqlite',
    restoredSqlite: (n, name) => `已恢复 ${n} 个地区 · 当前 ${name} · sqlite (papr.db)`,
    savedLsTemp: (err) => `● 已保存 · localStorage（临时，${err || '等待迁回 sqlite'}）`,
    restoredLs: (n, name, backend) => `已恢复 ${n} 个地区 · 当前 ${name} · ${backend} — 将自动迁回 sqlite`,
    usingBackend: (backend) => `当前使用 ${backend}，将在 papr.db 就绪后自动迁回 sqlite`,
    savedBackend: (backend) => `● 已保存 (${backend})`,
    restoredBackend: (n, name, backend) => `已恢复 ${n} 个地区 · 当前 ${name} · ${backend}`,
    readFail: (m) => `○ 读取失败：${m}`,
    connecting: '○ 正在连接存储…',
    testing: '测试中…',
    testPass: '✅ 通过',
    testFail: '❌ 失败',
    testResult: (ok) => `结果：${ok}`,
    writeBackend: (b) => `写入后端：${b}`,
    readBackend: (b) => `读取后端：${b}`,
    warn: (w) => `警告：${w}`,
    failBadge: (backend) => `○ 失败 (${backend})`,
    keepOne: '至少保留 1 个城市',
    unitSaveFail: (err) => `单位已切换，但保存失败：${err}`,
    switchSaveFail: (err, backend) => `切换已生效，但保存失败：${err}\n已回退到 ${backend}`,
    removeSaveFail: (err) => `已移除，但保存失败：${err}`,
    dirs: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
    wmo: {
      0: '晴', 1: '大致晴', 2: '多云', 3: '阴',
      45: '雾', 48: '雾凇',
      51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
      56: '冻毛毛雨', 57: '冻毛毛雨',
      61: '小雨', 63: '中雨', 65: '大雨',
      66: '冻雨', 67: '冻雨',
      71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
      80: '阵雨', 81: '阵雨', 82: '强阵雨',
      85: '阵雪', 86: '强阵雪',
      95: '雷雨', 96: '雷雨伴冰雹', 99: '强雷雨冰雹',
    },
  },
  en: {
    docTitle: 'Weather HUD',
    brandTitle: 'Weather',
    refresh: 'Refresh',
    toggleUnit: 'Toggle °C/°F',
    settings: 'Settings',
    loading: 'Fetching weather…',
    loadFail: 'Failed to load',
    retry: 'Retry',
    feels: 'Feels like',
    humidity: 'Humidity',
    wind: 'Wind',
    precip: 'Precip',
    hourly: '24 hours',
    forecast: '5-day forecast',
    footer: 'Data by Open-Meteo · no API key',
    setRegion: 'Choose location',
    dragHeight: 'Drag to resize (double-click to reset)',
    dragLabel: 'Drag to resize',
    settingsTitle: 'Settings',
    settingsSub: 'Search cities, pin favorites, switch units',
    addRegion: 'Add location',
    searchPh: 'Search a city, e.g. Beijing / shanghai / Tokyo',
    search: 'Search',
    searchHint: 'Chinese, pinyin, or English — press Enter or Search',
    favorites: 'Favorites',
    emptyFav: 'No favorites yet. Search, then tap Add.',
    displayStorage: 'Display & storage',
    tempUnit: 'Temperature unit',
    tempUnitHint: 'Applies to the main view and forecast. Saved automatically.',
    currentRegion: 'Current location',
    detecting: '○ Checking',
    selfTest: 'Storage self-test',
    runTest: 'Run test',
    notTested: 'Not tested yet',
    selfTestHint: 'Write/read checks papr.db → localStorage → memory fallbacks',
    winHeight: 'Window height',
    winHeightHint: 'Drag the bottom handle to resize. Saved automatically.',
    reset560: 'Reset 560',
    settingsFoot: 'The main view is compact — manage locations here',
    done: 'Done',
    add: 'Add',
    switch: 'Switch',
    remove: 'Remove',
    current: 'Current',
    now: 'Now',
    today: 'Today',
    hourUnit: ':00',
    hours: 'hours',
    preview: 'Preview',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    windDir: 'Wind',
    unknown: 'Unknown',
    noHourly: 'No hourly data',
    noCity: 'No city yet — open Settings to add one',
    searching: 'Searching…',
    notFound: (q) => `No results for “${q}”. Try English or pinyin.`,
    foundN: (n) => `${n} result(s). Tap to preview, or Add to save.`,
    searchFail: (m) => `Search failed: ${m}`,
    previewCity: (name, meta) => `Preview: ${name}${meta ? ' · ' + meta : ''} (not saved)`,
    addedSaved: (name, backend) => `Added ${name} and saved (${backend})`,
    addedFail: (name, err) => `Added ${name} (save failed: ${err})`,
    addedSwitched: (name) => `Added ${name}; main view switched`,
    addedNotPersisted: (name) => `Added ${name} but not persisted. Run the test for details.`,
    previewing: (name) => `Preview ${name} …`,
    updating: (name) => `Updating ${name} …`,
    previewUpdated: (name, when) => `Preview ${name} · updated ${when}`,
    updated: (name, when) => `${name} · updated ${when}`,
    updateFail: 'Update failed',
    weatherFailManifest: (raw) => `Weather fetch failed: host still initializing (manifest not loaded). Retry, or tap ↻ in 2s.\nDetail: ${raw}`,
    weatherFail: (raw) => `Weather fetch failed: ${raw}\nCheck the network and retry`,
    locPreview: (name) => `${name} · preview`,
    countCities: (n) => `${n}`,
    savedSqlite: '● Saved · sqlite',
    restoredSqlite: (n, name) => `Restored ${n} location(s) · current ${name} · sqlite (papr.db)`,
    savedLsTemp: (err) => `● Saved · localStorage (temporary, ${err || 'waiting to migrate to sqlite'})`,
    restoredLs: (n, name, backend) => `Restored ${n} location(s) · current ${name} · ${backend} — will migrate to sqlite`,
    usingBackend: (backend) => `Using ${backend}; will migrate to papr.db when ready`,
    savedBackend: (backend) => `● Saved (${backend})`,
    restoredBackend: (n, name, backend) => `Restored ${n} location(s) · current ${name} · ${backend}`,
    readFail: (m) => `○ Read failed: ${m}`,
    connecting: '○ Connecting storage…',
    testing: 'Testing…',
    testPass: '✅ Pass',
    testFail: '❌ Fail',
    testResult: (ok) => `Result: ${ok}`,
    writeBackend: (b) => `Write backend: ${b}`,
    readBackend: (b) => `Read backend: ${b}`,
    warn: (w) => `Warning: ${w}`,
    failBadge: (backend) => `○ Failed (${backend})`,
    keepOne: 'Keep at least 1 city',
    unitSaveFail: (err) => `Unit switched, but save failed: ${err}`,
    switchSaveFail: (err, backend) => `Switched, but save failed: ${err}\nFell back to ${backend}`,
    removeSaveFail: (err) => `Removed, but save failed: ${err}`,
    dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    wmo: {
      0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime fog',
      51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      56: 'Freezing drizzle', 57: 'Freezing drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
      66: 'Freezing rain', 67: 'Freezing rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
      85: 'Snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
    },
  },
};

export function getLang() { return lang; }
export function isEn() { return lang === 'en'; }
export function localeTag() { return lang === 'en' ? 'en' : 'zh-CN'; }
export function geocodeLang() { return lang === 'en' ? 'en' : 'zh'; }

export function t(key, ...args) {
  const pack = STRINGS[lang] || STRINGS.zh;
  const v = pack[key];
  if (typeof v === 'function') return v(...args);
  if (v == null) return key;
  return v;
}

export function wmoDesc(code) {
  const pack = STRINGS[lang] || STRINGS.zh;
  return pack.wmo[code] || pack.unknown;
}

export function windDirs() {
  return (STRINGS[lang] || STRINGS.zh).dirs;
}

export function applyDomI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.title = t('docTitle');
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
}

export async function initI18n() {
  try {
    const info = await window.papr?.app?.info?.();
    const raw = String(info?.lang || '').toLowerCase();
    if (raw.startsWith('en')) lang = 'en';
    else if (raw) lang = 'zh';
  } catch { /* keep navigator fallback */ }
  applyDomI18n();
  return lang;
}
