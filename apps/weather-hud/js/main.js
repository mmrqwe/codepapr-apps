import { dbGet, dbSet, waitForPapr, getBackend, getLastError, selfTest } from "./db.js";

function getHTTP(){ return window.papr?.http || null; }

const $ = (s)=> document.querySelector(s);
const els = {
  appRoot: $("#appRoot"),
  scrollArea: $("#scrollArea"),
  lastUpdate: $("#lastUpdate"),
  loading: $("#loading"),
  loadingSub: $("#loadingSub"),
  errorBox: $("#errorBox"),
  errorText: $("#errorText"),
  btnRetry: $("#btnRetry"),
  weatherContent: $("#weatherContent"),
  locName: $("#locName"),
  locMeta: $("#locMeta"),
  weatherDesc: $("#weatherDesc"),
  weatherIcon: $("#weatherIcon"),
  tempNow: $("#tempNow"),
  tempRange: $("#tempRange"),
  mFeels: $("#mFeels"),
  mHum: $("#mHum"),
  mWind: $("#mWind"),
  mPrec: $("#mPrec"),
  sunrise: $("#sunrise"),
  sunset: $("#sunset"),
  windDir: $("#windDir"),
  hourly: $("#hourly"),
  hourlyInfo: $("#hourlyInfo"),
  forecast: $("#forecast"),
  btnRefresh: $("#btnRefresh"),
  btnUnit: $("#btnUnit"),
  btnSettings: $("#btnSettings"),
  btnOpenSettings2: $("#btnOpenSettings2"),
  settingsModal: $("#settingsModal"),
  btnCloseSettings: $("#btnCloseSettings"),
  btnCloseSettings2: $("#btnCloseSettings2"),
  settingsSearchInput: $("#settingsSearchInput"),
  settingsClearBtn: $("#settingsClearBtn"),
  settingsSearchBtn: $("#settingsSearchBtn"),
  settingsResults: $("#settingsResults"),
  settingsHint: $("#settingsHint"),
  settingsPreview: $("#settingsPreview"),
  settingsCityList: $("#settingsCityList"),
  emptyFav: $("#emptyFav"),
  favCount: $("#favCount"),
  settingsUnitBtn: $("#settingsUnitBtn"),
  settingsCurrent: $("#settingsCurrent"),
  settingsDbStatus: $("#settingsDbStatus"),
  settingsSub: $("#settingsSub"),
  resizeHandle: $("#resizeHandle"),
  heightLabel: $("#heightLabel"),
  btnSelfTest: $("#btnSelfTest"),
  selfTestResult: $("#selfTestResult"),
  settingsHeightVal: $("#settingsHeightVal"),
  btnResetHeight: $("#btnResetHeight"),
};

const WMO = {
  0:{icon:"☀️",desc:"晴"},1:{icon:"🌤️",desc:"大致晴"},2:{icon:"⛅",desc:"多云"},3:{icon:"☁️",desc:"阴"},
  45:{icon:"🌫️",desc:"雾"},48:{icon:"🌫️",desc:"雾凇"},
  51:{icon:"🌦️",desc:"小毛毛雨"},53:{icon:"🌦️",desc:"毛毛雨"},55:{icon:"🌧️",desc:"大毛毛雨"},
  56:{icon:"🌧️",desc:"冻毛毛雨"},57:{icon:"🌧️",desc:"冻毛毛雨"},
  61:{icon:"🌧️",desc:"小雨"},63:{icon:"🌧️",desc:"中雨"},65:{icon:"🌧️",desc:"大雨"},
  66:{icon:"🌧️",desc:"冻雨"},67:{icon:"🌧️",desc:"冻雨"},
  71:{icon:"🌨️",desc:"小雪"},73:{icon:"🌨️",desc:"中雪"},75:{icon:"❄️",desc:"大雪"},77:{icon:"❄️",desc:"雪粒"},
  80:{icon:"🌦️",desc:"阵雨"},81:{icon:"🌧️",desc:"阵雨"},82:{icon:"⛈️",desc:"强阵雨"},
  85:{icon:"🌨️",desc:"阵雪"},86:{icon:"❄️",desc:"强阵雪"},
  95:{icon:"⛈️",desc:"雷雨"},96:{icon:"⛈️",desc:"雷雨伴冰雹"},99:{icon:"⛈️",desc:"强雷雨冰雹"},
};
function wmoInfo(c){ return WMO[c]||{icon:"⛅",desc:"未知"}; }
function cToF(c){ return c*9/5+32; }
function fmtTemp(c,unit){
  if(c==null||Number.isNaN(c)) return "--°";
  const v= unit==="f"? cToF(c): c;
  return `${Math.round(v)}°`;
}
function fmtTime(iso){
  if(!iso) return "--:--";
  try{ return new Date(iso).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}); }catch{ return "--:--"; }
}
function windDirText(deg){
  if(deg==null) return "--";
  const dirs=["北","东北","东","东南","南","西南","西","西北"];
  return `${dirs[Math.round(deg/45)%8]} ${Math.round(deg)}°`;
}

const DEFAULT_CITIES = [
  { id:"110000", name:"北京", admin1:"北京市", country:"中国", latitude:39.9042, longitude:116.4074, timezone:"Asia/Shanghai" },
];
const DEFAULT_H = 560;
let cities=[...DEFAULT_CITIES];
let activeIndex=0;
let unit="c";
let appHeight=DEFAULT_H;
let lastSearchResults=[];
let lastWeather=null;

function setDbBadge(state, text){
  if(!els.settingsDbStatus) return;
  els.settingsDbStatus.className="db-badge "+(state||"");
  els.settingsDbStatus.textContent=text;
}
function applyHeight(h, save=true){
  const clamped = Math.max(380, Math.min(720, Math.round(h)));
  appHeight = clamped;
  document.documentElement.style.setProperty("--app-h", clamped+"px");
  if(els.appRoot) els.appRoot.style.setProperty("--app-h", clamped+"px");
  // also set inline for fallback
  if(els.appRoot) els.appRoot.style.height = clamped+"px";
  if(els.heightLabel) els.heightLabel.textContent = clamped+"px";
  if(els.settingsHeightVal) els.settingsHeightVal.textContent = clamped+"px";
  if(save){
    dbSet("appHeight", clamped).then(r=>{
      console.log("[weather] height saved", r);
    });
  }
}

async function loadState(){
  // 等待 papr 注入，最多 5s，期间 db.js 会回退到 localStorage，之后自动迁回 sqlite
  await waitForPapr(5000);
  try{
    const [sCities,sActive,sUnit,sH] = await Promise.all([
      dbGet("cities"),
      dbGet("activeIndex"),
      dbGet("unit"),
      dbGet("appHeight"),
    ]);
    if(Array.isArray(sCities) && sCities.length){
      const cleaned = sCities.filter(c=> c && typeof c.latitude==="number" && typeof c.longitude==="number" && c.name);
      if(cleaned.length) cities=cleaned;
    }
    if(typeof sActive==="number" && sActive>=0 && sActive < cities.length) activeIndex=sActive;
    if(sUnit==="f"||sUnit==="c") unit=sUnit;
    if(typeof sH==="number" && sH>=380 && sH<=720) appHeight=sH;
    applyHeight(appHeight, false);
    const backend = getBackend();
    const isSqlite = backend.includes("papr.db") || backend.includes("sqlite");
    const isLocal = backend.includes("localStorage");
    if(isSqlite){
      setDbBadge("ok", `● 已保存 · sqlite`);
      if(els.settingsSub) els.settingsSub.textContent=`已恢复 ${cities.length} 个地区 · 当前 ${cities[activeIndex]?.name||""} · sqlite (papr.db)`;
      if(els.loadingSub) els.loadingSub.textContent="";
    } else if(isLocal){
      const isMigrating = backend.includes("待迁回") || backend.includes("回退");
      setDbBadge("warn", isMigrating ? `● 已保存 · localStorage（临时，${getLastError()||"等待迁回 sqlite"}）` : `● 已保存 (${backend})`);
      if(els.settingsSub) els.settingsSub.textContent=`已恢复 ${cities.length} 个地区 · 当前 ${cities[activeIndex]?.name||""} · ${backend} — 将自动迁回 sqlite`;
      if(els.loadingSub) els.loadingSub.textContent=`当前使用 ${backend}，将在 papr.db 就绪后自动迁回 sqlite`;
    } else {
      setDbBadge("warn", `● 已保存 (${backend})`);
      if(els.settingsSub) els.settingsSub.textContent=`已恢复 ${cities.length} 个地区 · 当前 ${cities[activeIndex]?.name||""} · ${backend}`;
    }
    console.log("[weather] loadState ok",{cities,activeIndex,unit,appHeight,backend});
  }catch(e){
    console.warn("[weather] loadState fail",e);
    setDbBadge("warn","○ 读取失败："+(e?.message||e));
    applyHeight(appHeight,false);
  }
}

async function saveState(){
  try{
    const r1 = await dbSet("cities", cities);
    const r2 = await dbSet("activeIndex", activeIndex);
    const r3 = await dbSet("unit", unit);
    const backend = r1.backend || getBackend();
    const isSqlite = backend.includes("papr.db") || backend.includes("sqlite");
    const allOk = r1.ok && r2.ok && r3.ok;
    if(allOk){
      if(isSqlite){
        setDbBadge("ok", `● 已保存 · sqlite`);
        if(els.settingsSub) els.settingsSub.textContent = `已保存 ${cities.length} 个地区 · sqlite`;
      } else {
        setDbBadge("warn", `● 已保存 · ${backend}（临时，${r1.warn||getLastError()||"将迁回 sqlite"}）`);
        if(els.settingsSub) els.settingsSub.textContent = `已保存 ${cities.length} 个地区 · ${backend} — 将自动迁回 sqlite`;
      }
      console.log("[weather] saveState ok",{backend, citiesLen:cities.length, activeIndex, unit});
      return true;
    } else {
      setDbBadge("warn","○ 保存异常");
      return false;
    }
  }catch(e){
    const msg = e?.message||String(e);
    console.warn("[weather] saveState fail",e);
    setDbBadge("warn","○ 保存失败："+msg);
    // 尝试把错误详情写入自检区
    if(els.selfTestResult) els.selfTestResult.textContent = `保存失败：${msg}\nbackend=${getBackend()}\nlastError=${getLastError()}`;
    return false;
  }
}

function renderUnit(){
  if(els.btnUnit) els.btnUnit.textContent = unit==="c" ? "°C" : "°F";
  if(els.settingsUnitBtn){
    els.settingsUnitBtn.textContent = unit==="c" ? "°C" : "°F";
    els.settingsUnitBtn.classList.toggle("active", true);
  }
}
function renderSettingsCurrent(){
  const cur = cities[activeIndex];
  if(!cur) return;
  if(els.settingsCurrent){
    els.settingsCurrent.textContent = `${cur.name} · ${[cur.admin1,cur.country].filter(Boolean).join(" · ")} · ${cur.latitude.toFixed(2)}, ${cur.longitude.toFixed(2)}`;
  }
  if(els.favCount) els.favCount.textContent=`${cities.length} 个`;
}
function renderSettingsList(){
  if(!els.settingsCityList) return;
  els.settingsCityList.innerHTML="";
  if(!cities.length){
    if(els.emptyFav) els.emptyFav.classList.remove("hidden");
    return;
  }
  if(els.emptyFav) els.emptyFav.classList.add("hidden");
  cities.forEach((c,i)=>{
    const row=document.createElement("div");
    row.className="city-row"+(i===activeIndex?" active":"");
    row.innerHTML=`
      <div style="min-width:0">
        <div class="city-name">${c.name} ${i===activeIndex?'<span style="font-size:10px;color:var(--accent)">● 当前</span>':''}</div>
        <div class="city-meta">${[c.admin1,c.country].filter(Boolean).join(" · ")} · ${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)}</div>
      </div>
      <div class="city-actions">
        ${i!==activeIndex?'<button class="mini-btn primary" data-act="switch">切换</button>':''}
        <button class="mini-btn danger" data-act="del">移除</button>
      </div>
    `;
    row.querySelectorAll("button").forEach(btn=>{
      btn.addEventListener("click", async()=>{
        const act=btn.dataset.act;
        if(act==="switch"){
          activeIndex=i;
          const ok = await saveState();
          renderSettingsList();
          renderSettingsCurrent();
          renderUnit();
          if(ok) closeSettings(false);
          loadWeather();
          if(!ok) alert("切换已生效，但保存失败："+getLastError()+"\n已回退到 "+getBackend());
        }else if(act==="del"){
          if(cities.length<=1){ alert("至少保留 1 个城市"); return; }
          cities.splice(i,1);
          if(activeIndex>=cities.length) activeIndex=cities.length-1;
          if(i===activeIndex) activeIndex=0;
          if(activeIndex<0) activeIndex=0;
          const ok = await saveState();
          renderSettingsList();
          renderSettingsCurrent();
          loadWeather();
          if(!ok) alert("已移除，但保存失败："+getLastError());
        }
      });
    });
    els.settingsCityList.appendChild(row);
  });
}

function showLoading(isPreview=false, cityName=""){
  els.loading.classList.remove("hidden");
  els.errorBox.classList.add("hidden");
  els.weatherContent.classList.add("hidden");
  if(els.loadingSub) els.loadingSub.textContent = isPreview ? `预览 ${cityName} …` : "";
}
function showError(msg){
  els.loading.classList.add("hidden");
  els.errorBox.classList.remove("hidden");
  els.weatherContent.classList.add("hidden");
  els.errorText.textContent=msg;
}
function showContent(){
  els.loading.classList.add("hidden");
  els.errorBox.classList.add("hidden");
  els.weatherContent.classList.remove("hidden");
}

async function httpGetJson(url){
  let lastErr=null;
  const http=getHTTP();
  if(http?.request){
    try{
      const r=await http.request({method:"GET", url});
      const status=r?.status ?? 200;
      if(status>=400) throw new Error(`HTTP ${status}`);
      const body= typeof r.body==="string"? r.body : (r.body!=null? JSON.stringify(r.body): "");
      if(!body) throw new Error("empty body");
      return JSON.parse(body);
    }catch(e){
      lastErr=e;
      console.warn("[weather] papr.http.request failed:", e?.message||e);
    }
  }
  if(http?.get){
    try{
      const r=await http.get(url);
      const status=r?.status ?? 200;
      if(status>=400) throw new Error(`HTTP ${status}`);
      const body= typeof r.body==="string"? r.body : (r.body!=null? JSON.stringify(r.body): "");
      try{ return JSON.parse(body);}catch{ return r.body; }
    }catch(e){
      lastErr=e;
      console.warn("[weather] papr.http.get failed:", e?.message||e);
    }
  }
  try{
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  }catch(e){
    const msg=e?.message||String(e);
    const hint= lastErr? ` (papr: ${lastErr?.message||lastErr})` : "";
    throw new Error(msg+hint);
  }
}

async function searchCitiesInSettings(query){
  const q=query.trim();
  if(!q){
    els.settingsResults.classList.add("hidden");
    els.settingsHint.classList.remove("hidden");
    els.settingsHint.textContent="支持中文/拼音/英文，回车或点搜索";
    els.settingsPreview.classList.add("hidden");
    lastSearchResults=[];
    return;
  }
  els.settingsResults.innerHTML=`<div style="padding:10px;color:var(--muted);text-align:center">搜索中…</div>`;
  els.settingsResults.classList.remove("hidden");
  els.settingsHint.classList.add("hidden");
  try{
    const url=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=zh&format=json`;
    const data=await httpGetJson(url);
    const results=data.results||[];
    lastSearchResults=results.map(r=>({
      id:String(r.id), name:r.name, admin1:r.admin1||r.admin2||"", country:r.country||"",
      latitude:r.latitude, longitude:r.longitude, timezone:r.timezone||"auto"
    }));
    if(!lastSearchResults.length){
      els.settingsResults.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted)">未找到“${q}”，试试英文或拼音</div>`;
      return;
    }
    els.settingsResults.innerHTML="";
    lastSearchResults.forEach((c,idx)=>{
      const div=document.createElement("div");
      div.className="result-item";
      div.innerHTML=`
        <div>
          <div class="result-main">${c.name}</div>
          <div class="result-sub">${[c.admin1,c.country].filter(Boolean).join(" · ")} · ${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)}</div>
        </div>
        <button class="result-add">添加</button>
      `;
      div.addEventListener("click",(e)=>{
        if(e.target.closest(".result-add")) return;
        previewCity(idx);
      });
      div.querySelector(".result-add").addEventListener("click",(e)=>{
        e.stopPropagation();
        addCity(idx);
      });
      els.settingsResults.appendChild(div);
    });
    els.settingsPreview.classList.remove("hidden");
    els.settingsPreview.textContent=`找到 ${lastSearchResults.length} 个结果，点击可预览天气，点“添加”收藏`;
  }catch(e){
    els.settingsResults.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted)">搜索失败：${e.message||e}</div>`;
  }
}

async function previewCity(idx){
  const c=lastSearchResults[idx];
  if(!c) return;
  els.settingsPreview.textContent=`预览：${c.name} · ${[c.admin1,c.country].filter(Boolean).join(" · ")}（未收藏）`;
  els.settingsPreview.classList.remove("hidden");
  await loadWeatherFor(c,true);
}

async function addCity(idx){
  const c=lastSearchResults[idx];
  if(!c) return;
  const exists=cities.findIndex(x=> Math.abs(x.latitude-c.latitude)<0.01 && Math.abs(x.longitude-c.longitude)<0.01);
  if(exists>=0){
    activeIndex=exists;
    const ok = await saveState();
    renderSettingsList();
    renderSettingsCurrent();
    els.settingsPreview.textContent= ok ? `已切换到已收藏的 ${c.name}` : `已切换到 ${c.name}（保存失败：${getLastError()}）`;
    els.settingsPreview.classList.remove("hidden");
    loadWeather();
    return;
  }
  cities.push(c);
  activeIndex=cities.length-1;
  const ok = await saveState();
  renderSettingsList();
  renderSettingsCurrent();
  els.settingsResults.classList.add("hidden");
  els.settingsHint.classList.remove("hidden");
  els.settingsHint.textContent = ok ? `已添加 ${c.name} 并保存（${getBackend()}）` : `已添加 ${c.name}（保存失败：${getLastError()}）`;
  els.settingsPreview.textContent = ok ? `已添加 ${c.name}，主界面已切换` : `已添加 ${c.name} 但未持久化，请点“运行测试”查看详情`;
  els.settingsPreview.classList.remove("hidden");
  if(els.settingsSearchInput) els.settingsSearchInput.value="";
  if(els.settingsClearBtn) els.settingsClearBtn.classList.add("hidden");
  loadWeather();
  if(!ok){
    // 仍提示用户
    console.warn("[weather] addCity save failed", getLastError());
  }
}

async function loadWeather(){
  const city=cities[activeIndex];
  if(!city) return showError("暂无城市，请打开设置添加");
  await loadWeatherFor(city,false);
}

async function loadWeatherFor(city,isPreview){
  showLoading(isPreview, city.name);
  els.lastUpdate.textContent = isPreview ? `预览 ${city.name} …` : `正在更新 ${city.name} …`;
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=6`;
    const data=await httpGetJson(url);
    lastWeather=data;
    renderWeather(city,data,isPreview);
    showContent();
    const now=new Date().toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
    els.lastUpdate.textContent = isPreview ? `预览 ${city.name} · ${now} 更新` : `${city.name} · ${now} 更新`;
  }catch(e){
    const raw=e?.message||String(e);
    const isManifest=raw.includes("manifest not loaded");
    const msg=isManifest
      ? `获取天气失败：宿主初始化中（manifest not loaded），已自动用备用通道重试仍失败。请点重试或 2 秒后点 ↻。\n详情：${raw}`
      : `获取天气失败：${raw}\n请检查网络后重试`;
    showError(msg);
    els.lastUpdate.textContent="更新失败";
    console.error("[weather] loadWeatherFor failed:",e);
    if(isManifest && !isPreview){
      setTimeout(()=> loadWeatherFor(city,isPreview), 1500);
    }
  }
}

function renderWeather(city,data,isPreview){
  const cur=data.current;
  const daily=data.daily;
  const hourly=data.hourly;
  const info=wmoInfo(cur.weather_code);
  els.locName.textContent=city.name + (isPreview?" · 预览":"");
  els.locMeta.textContent=`${[city.admin1,city.country].filter(Boolean).join(" · ")} · ${city.latitude.toFixed(2)}, ${city.longitude.toFixed(2)} · ${data.timezone||city.timezone||""}`;
  els.weatherDesc.textContent=info.desc;
  els.weatherIcon.textContent=info.icon;
  els.tempNow.textContent=fmtTemp(cur.temperature_2m,unit);
  const tmax0=daily.temperature_2m_max?.[0];
  const tmin0=daily.temperature_2m_min?.[0];
  if(els.tempRange) els.tempRange.textContent = (tmax0!=null&&tmin0!=null) ? `${fmtTemp(tmin0,unit)} / ${fmtTemp(tmax0,unit)}` : "";
  els.mFeels.textContent=fmtTemp(cur.apparent_temperature,unit);
  els.mHum.textContent=`${cur.relative_humidity_2m ?? "--"}%`;
  els.mWind.textContent=`${cur.wind_speed_10m ?? "--"} km/h`;
  els.mPrec.textContent=`${cur.precipitation ?? 0} mm`;
  els.sunrise.textContent=`日出 ${fmtTime(daily.sunrise?.[0])}`;
  els.sunset.textContent=`日落 ${fmtTime(daily.sunset?.[0])}`;
  els.windDir.textContent=`风向 ${windDirText(cur.wind_direction_10m)}`;

  els.hourly.innerHTML="";
  if(hourly?.time && hourly.temperature_2m){
    const now=new Date();
    let startIdx=0, minDiff=Infinity;
    hourly.time.forEach((t,i)=>{
      const d=new Date(t);
      const diff=Math.abs(d-now);
      if(diff<minDiff){ minDiff=diff; startIdx=i; }
    });
    const count=24;
    const sliceStart=Math.max(0,startIdx);
    const sliceEnd=Math.min(hourly.time.length, sliceStart+count);
    let rendered=0;
    for(let i=sliceStart;i<sliceEnd;i++){
      const t=hourly.time[i];
      const temp=hourly.temperature_2m[i];
      const wcode=hourly.weather_code?.[i];
      const d=new Date(t);
      const isNow=i===sliceStart;
      const label=isNow?"现在": d.toLocaleTimeString("zh-CN",{hour:"2-digit",hour12:false}).replace(":00","时");
      const hInfo=wmoInfo(wcode);
      const div=document.createElement("div");
      div.className="hour-item"+(isNow?" now":"");
      div.innerHTML=`<div class="h-time">${label}</div><div class="h-icon">${hInfo.icon}</div><div class="h-temp">${fmtTemp(temp,unit)}</div>`;
      els.hourly.appendChild(div);
      rendered++;
    }
    els.hourlyInfo.textContent=`${rendered} 小时 · ${data.timezone||""}`;
  }else{
    els.hourlyInfo.textContent="";
    els.hourly.innerHTML=`<div style="color:var(--muted);padding:8px">暂无逐小时数据</div>`;
  }

  els.forecast.innerHTML="";
  if(daily?.time){
    const maxTemps=daily.temperature_2m_max||[];
    const minTemps=daily.temperature_2m_min||[];
    const allMax=Math.max(...maxTemps);
    const allMin=Math.min(...minTemps);
    const range=(allMax-allMin)||1;
    daily.time.slice(0,5).forEach((dateStr,i)=>{
      const d=new Date(dateStr);
      const isToday=i===0;
      const dayLabel=isToday?"今天": d.toLocaleDateString("zh-CN",{weekday:"short",month:"numeric",day:"numeric"});
      const wcode=daily.weather_code?.[i];
      const info2=wmoInfo(wcode);
      const tmax=daily.temperature_2m_max?.[i];
      const tmin=daily.temperature_2m_min?.[i];
      const left=((tmin-allMin)/range)*100;
      const width=((tmax-tmin)/range)*100;
      const row=document.createElement("div");
      row.className="f-row";
      row.innerHTML=`
        <div class="f-left">
          <div class="f-day">${dayLabel}</div>
          <div class="f-icon">${info2.icon}</div>
          <div class="f-desc">${info2.desc}</div>
        </div>
        <div class="f-temps">
          <span class="f-min">${fmtTemp(tmin,unit)}</span>
          <div class="f-bar"><div class="f-bar-fill" style="margin-left:${left}%;width:${Math.max(12,width)}%"></div></div>
          <span class="f-max">${fmtTemp(tmax,unit)}</span>
        </div>
      `;
      els.forecast.appendChild(row);
    });
  }
}

function openSettings(){
  renderSettingsList();
  renderSettingsCurrent();
  renderUnit();
  els.settingsModal.classList.remove("hidden");
  els.settingsModal.setAttribute("aria-hidden","false");
  // 同步高度显示
  if(els.settingsHeightVal) els.settingsHeightVal.textContent = appHeight+"px";
  setTimeout(()=> els.settingsSearchInput?.focus(), 80);
}
function closeSettings(refresh=true){
  els.settingsModal.classList.add("hidden");
  els.settingsModal.setAttribute("aria-hidden","true");
  if(refresh){
    if(els.locName.textContent.includes("预览")){
      loadWeather();
    }
  }
}

function bindHeightDrag(){
  const handle = els.resizeHandle;
  if(!handle) return;
  let startY=0, startH=0, dragging=false;
  const onMove = (e)=>{
    if(!dragging) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = clientY - startY;
    const next = startH + dy;
    // 实时应用，不频繁写存储
    const clamped = Math.max(380, Math.min(720, Math.round(next)));
    document.documentElement.style.setProperty("--app-h", clamped+"px");
    if(els.appRoot) els.appRoot.style.height = clamped+"px";
    if(els.heightLabel) els.heightLabel.textContent = clamped+"px";
    if(els.settingsHeightVal) els.settingsHeightVal.textContent = clamped+"px";
    e.preventDefault();
  };
  const onUp = ()=>{
    if(!dragging) return;
    dragging=false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onUp);
    // 结束时保存
    const h = parseInt(els.appRoot.style.height || appHeight, 10) || appHeight;
    applyHeight(h, true);
    handle.style.opacity="";
  };
  const onDown = (e)=>{
    dragging=true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startH = appHeight;
    // 也从当前实际高度取
    const curH = parseInt(getComputedStyle(els.appRoot).height,10);
    if(!isNaN(curH)) startH = curH;
    document.addEventListener("mousemove", onMove, {passive:false});
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, {passive:false});
    document.addEventListener("touchend", onUp);
    handle.style.opacity="0.8";
    e.preventDefault();
  };
  handle.addEventListener("mousedown", onDown);
  handle.addEventListener("touchstart", onDown, {passive:false});
  handle.addEventListener("dblclick", ()=>{
    applyHeight(DEFAULT_H, true);
  });
  // 滚轮在手柄上微调（按住 alt 更精细）
  handle.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta = e.deltaY > 0 ? -12 : 12;
    applyHeight(appHeight + delta, true);
  }, {passive:false});
}

function bindEvents(){
  let debounce=null;
  els.settingsSearchInput?.addEventListener("input",()=>{
    const v=els.settingsSearchInput.value;
    els.settingsClearBtn?.classList.toggle("hidden", !v);
    clearTimeout(debounce);
    debounce=setTimeout(()=> searchCitiesInSettings(v), 380);
  });
  els.settingsClearBtn?.addEventListener("click",()=>{
    els.settingsSearchInput.value="";
    els.settingsClearBtn.classList.add("hidden");
    els.settingsResults.classList.add("hidden");
    els.settingsHint.classList.remove("hidden");
    els.settingsHint.textContent="支持中文/拼音/英文，回车或点搜索";
    els.settingsPreview.classList.add("hidden");
    lastSearchResults=[];
    loadWeather();
  });
  els.settingsSearchBtn?.addEventListener("click",()=> searchCitiesInSettings(els.settingsSearchInput.value));
  els.settingsSearchInput?.addEventListener("keydown",(e)=>{
    if(e.key==="Enter"){ e.preventDefault(); searchCitiesInSettings(els.settingsSearchInput.value); }
    if(e.key==="Escape"){ els.settingsResults.classList.add("hidden"); }
  });
  els.btnRefresh?.addEventListener("click",()=> loadWeather());
  els.btnRetry?.addEventListener("click",()=> loadWeather());
  const toggleUnit= async()=>{
    unit= unit==="c" ? "f" : "c";
    renderUnit();
    const ok = await saveState();
    if(lastWeather && cities[activeIndex]){
      renderWeather(cities[activeIndex], lastWeather, els.locName.textContent.includes("预览"));
    }
    if(!ok) alert("单位已切换，但保存失败："+getLastError());
  };
  els.btnUnit?.addEventListener("click", toggleUnit);
  els.settingsUnitBtn?.addEventListener("click", toggleUnit);
  els.btnSettings?.addEventListener("click", openSettings);
  els.btnOpenSettings2?.addEventListener("click", openSettings);
  els.btnCloseSettings?.addEventListener("click", ()=> closeSettings(true));
  els.btnCloseSettings2?.addEventListener("click", ()=> closeSettings(true));
  els.settingsModal?.addEventListener("click",(e)=>{
    if(e.target===els.settingsModal) closeSettings(true);
  });
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape" && !els.settingsModal.classList.contains("hidden")) closeSettings(true);
  });
  els.btnSelfTest?.addEventListener("click", async()=>{
    if(els.selfTestResult) els.selfTestResult.textContent="测试中…";
    const res = await selfTest();
    const lines = [
      `结果：${res.pass ? "✅ 通过" : "❌ 失败"}`,
      `写入后端：${res.writeBackend}`,
      `读取后端：${res.readBackend}`,
      res.warn ? `警告：${res.warn}` : "",
      res.lastError ? `lastError：${res.lastError}` : "",
      `当前 backend：${getBackend()}`,
      `测试值：${JSON.stringify(res.writeValue)}`,
      `读回值：${JSON.stringify(res.readValue)}`,
    ].filter(Boolean).join("\n");
    if(els.selfTestResult) els.selfTestResult.textContent = lines;
    // 同时刷新徽标
    const backend = getBackend();
    setDbBadge(res.pass ? (backend.includes("papr")?"ok":"warn") : "warn", res.pass ? `● 已保存 (${backend})` : `○ 失败 (${backend})`);
  });
  els.btnResetHeight?.addEventListener("click", ()=> applyHeight(DEFAULT_H, true));
  bindHeightDrag();
}

async function init(){
  bindEvents();
  renderUnit();
  applyHeight(appHeight,false);
  setDbBadge("","○ 正在连接存储…");
  await loadState();
  renderUnit();
  renderSettingsList();
  renderSettingsCurrent();
  // 高度已在 loadState 中应用
  loadWeather();
  // 兜底：若 papr 延迟注入，1.5s 后再尝试一次
  setTimeout(async()=>{
    if(getBackend().includes("unknown") || getBackend().includes("memory")){
      const papr = await waitForPapr(800);
      if(papr?.db){
        console.log("[weather] retry loadState after delay");
        await loadState();
        renderUnit();
        renderSettingsList();
        renderSettingsCurrent();
      }
    }
  }, 1500);
  // 启动时自动跑一次自检（静默）
  setTimeout(async()=>{
    const r = await selfTest();
    console.log("[weather] selfTest", r);
    if(!r.pass && els.selfTestResult){
      els.selfTestResult.textContent = `自检：${r.pass?"通过":"失败"} backend=${r.readBackend} warn=${r.warn||r.lastError}`;
    }
  }, 900);
}

init();
