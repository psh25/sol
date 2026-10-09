(function () {
  'use strict';
  const T = SunTime, S = SunSolar;
  const $ = id => document.getElementById(id);
  const initial = T.now();
  const state = { date: initial.date, seconds: initial.seconds, location: {...S.BEIJING}, following: true, playing: false, speed: 1800, lastFrame: 0, computeFrame: 0, playFrame: 0, markerKey: null, yearFrame: 0 };
  const view = new SkyView($('sky'));
  const earth = new EarthView($('earth'));
  const cache = new Map();
  const yearCache = new Map();
  const locationKey = () => `${state.location.latitude},${state.location.longitude}`;
  function locationName() {
    return state.location.latitude === S.BEIJING.latitude && state.location.longitude === S.BEIJING.longitude ? '北京' : '自定义地点';
  }
  function syncLocation() {
    const l=state.location;
    $('location-name').textContent=locationName();
    $('location-coordinates').textContent=`${Math.abs(l.latitude).toFixed(4)}° ${l.latitude<0?'S':'N'} / ${Math.abs(l.longitude).toFixed(4)}° ${l.longitude<0?'W':'E'}`;
    $('latitude').value=String(l.latitude);$('longitude').value=String(l.longitude);
    $('location-error').hidden=true;$('location-error').textContent='';
    ['latitude','longitude'].forEach(id=>$(id).setAttribute('aria-invalid','false'));
  }
  function applyLocation(latitude,longitude) {
    pause();state.location={latitude:latitude===0?0:latitude,longitude:longitude===0?0:longitude,elevation:0};
    syncLocation();syncDate();
    cancelAnimationFrame(state.computeFrame);updateDay();
  }
  $('location-form').addEventListener('submit',e=>{
    e.preventDefault();
    const latText=$('latitude').value.trim(),lonText=$('longitude').value.trim();
    const lat=Number(latText),lon=Number(lonText);
    const latOK=latText!==''&&Number.isFinite(lat)&&lat>=-90&&lat<=90;
    const lonOK=lonText!==''&&Number.isFinite(lon)&&lon>=-180&&lon<=180;
    $('latitude').setAttribute('aria-invalid',String(!latOK));$('longitude').setAttribute('aria-invalid',String(!lonOK));
    if(!latOK||!lonOK){$('location-error').hidden=false;$('location-error').textContent='纬度范围 −90°～90°，经度范围 −180°～180°。';return;}
    applyLocation(lat,lon);
  });
  $('reset-location').addEventListener('click',()=>applyLocation(S.BEIJING.latitude,S.BEIJING.longitude));
  function renderMarkers(container, entries, stagger = false) {
    container.replaceChildren();
    entries.forEach((entry, index) => {
      const marker = document.createElement('span'); marker.className = 'axis-marker';
      marker.style.left = `${entry.fraction * 100}%`;
      marker.style.setProperty('--lane', stagger && index % 2 ? '18px' : '0px');
      if (entry.fraction > .88) marker.classList.add('align-end');
      if (entry.fraction < .12) marker.classList.add('align-start');
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = entry.label; button.title = entry.title; button.setAttribute('aria-label', entry.title);
      button.addEventListener('click', entry.select);
      marker.append(button); container.append(marker);
    });
  }
  function renderYear(year, markers) {
    const names = { longest: '昼最长', shortest: '昼最短', equal: '昼夜近等长' };
    renderMarkers($('date-markers'), markers.map(m => {
      const seconds = Math.round(m.daylight);
      const duration = `${Math.floor(seconds/3600)} 时 ${Math.floor(seconds/60)%60} 分 ${seconds%60} 秒`;
      return { fraction: m.index/(T.yearDays(year)-1), label: `${names[m.kind]} ${m.date.slice(5).replace('-','/')}`, title: `${names[m.kind]}：${m.date}，昼长 ${duration}。点击跳转日期。`, select: () => setDate(m.date) };
    }), true);
    $('date-markers').setAttribute('aria-busy','false');
  }
  function updateYear(year) {
    const key=`${locationKey()}|${year}`,location=state.location;
    if (state.markerKey === key) return;
    state.markerKey = key;
    cancelAnimationFrame(state.yearFrame);
    $('date-markers').replaceChildren(); $('date-markers').setAttribute('aria-busy','true');
    if (yearCache.has(key)) { renderYear(year,yearCache.get(key)); return; }
    const days = [], count = T.yearDays(year);
    function step() {
      if (state.markerKey !== key) return;
      const last = Math.min(days.length+16,count);
      while (days.length < last) {
        const index = days.length, date = T.fromDay(year,index);
        days.push({index,date,daylight:S.events(date,location).daylight});
      }
      if (days.length < count) { state.yearFrame = requestAnimationFrame(step); return; }
      const markers = S.landmarksFromDays(days);
      yearCache.set(key,markers); if (yearCache.size > 8) yearCache.delete(yearCache.keys().next().value);
      renderYear(year,markers); state.yearFrame = 0;
    }
    state.yearFrame = requestAnimationFrame(step);
  }
  function pause() {
    state.playing = false;
    cancelAnimationFrame(state.playFrame);
    state.playFrame = 0;
    $('play').setAttribute('aria-pressed', 'false');
    $('play-symbol').textContent = '▷'; $('play-label').textContent = '播放';
  }
  function stopFollowing() { state.following = false; $('follow-now').checked = false; }
  function manual() { stopFollowing(); pause(); }
  function followTick() {
    if (!state.following) return;
    const n = T.now(), changed = n.date !== state.date;
    state.date = n.date; state.seconds = n.seconds; error('');
    if (changed) syncDate();
    if (changed || state.computeFrame) {
      cancelAnimationFrame(state.computeFrame); updateDay();
    } else syncPosition();
  }
  function setFollowing(enabled) {
    state.following = enabled; $('follow-now').checked = enabled;
    if (enabled) { pause(); followTick(); }
  }
  function error(message) { $('input-error').textContent = message || ''; $('input-error').hidden = !message; }
  function syncDate() {
    const year = Number(state.date.slice(0, 4)), day = T.dayIndex(state.date), days = T.yearDays(year);
    $('date').value = state.date; $('year').value = year;
    $('date-slider').max = days - 1; $('date-slider').value = day;
    $('date-slider').setAttribute('aria-valuetext', state.date);
    $('day-index').textContent = `第 ${day + 1} / ${days} 天`;
    $('prev-day').disabled = state.date === '1900-01-01'; $('next-day').disabled = state.date === '2100-12-31';
    updateYear(year);
  }
  function syncPosition() {
    $('time').value = T.timeString(state.seconds);
    $('time-slider').value = Math.floor(state.seconds);
    $('time-slider').setAttribute('aria-valuetext', T.timeString(state.seconds));
    const p = S.position(T.start(state.date) + state.seconds * 1000,state.location);
    view.sun = p;
    const subsolar = S.subsolar(p.ms); earth.sun = subsolar;
    earth.orientation = S.earthOrientation(p.ms); earth.localSun = p; earth.location = state.location;
    const latitude = `${Math.abs(subsolar.latitude).toFixed(1)}° ${subsolar.latitude >= 0 ? 'N' : 'S'}`;
    const longitude = `${Math.abs(subsolar.longitude).toFixed(1)}° ${subsolar.longitude >= 0 ? 'E' : 'W'}`;
    $('subsolar-coordinates').textContent = `直射点：${latitude} / ${longitude}`;
    $('earth').setAttribute('aria-label', `${state.date} ${T.timeString(state.seconds)}，地球辅助示意。N 为北极，S 为南极；地轴默认倾斜约 23.4 度，改变日期或时间时地轴方向保持不变，改变时间时地球绕地轴自转。方点的小半球对应当地天空图，昼面较亮、夜面较暗。太阳直射点 ${latitude}，${longitude}，圈点表示当前直射点，曲线表示当日轨迹。可用方向键自由旋转视角。`);
    $('altitude').textContent = (Math.abs(p.altitude) < .05 ? 0 : p.altitude).toFixed(1);
    $('azimuth').textContent = (Number(p.azimuth.toFixed(1)) % 360).toFixed(1);
    $('direction').textContent = S.compass(p.azimuth);
    $('sun-state').textContent = p.altitude >= 0 ? '太阳中心在地平线以上' : '太阳中心在地平线以下';
    $('sun-state').dataset.above = p.altitude >= 0;
    $('current-stamp').textContent = `${state.date.replaceAll('-', ' / ')} · ${T.timeString(state.seconds)}`;
    $('sky').setAttribute('aria-label', `${state.date} ${T.timeString(state.seconds)}，${locationName()}太阳高度角 ${p.altitude.toFixed(1)} 度，方位角 ${p.azimuth.toFixed(1)} 度。${view.mode === 'dome' ? '半球视图，可用方向键旋转。' : '平面天空图，北上东右。'}`);
    view.draw(); earth.draw();
  }
  function updateDay() {
    state.computeFrame = 0;
    const key=`${locationKey()}|${state.date}`;
    let day = cache.get(key);
    if (!day) {
      day = { points: S.trajectory(state.date,state.location), events: S.events(state.date,state.location), subsolar: S.subsolarTrajectory(state.date) };
      cache.set(key, day);
      if (cache.size > 16) cache.delete(cache.keys().next().value);
    }
    view.points = day.points;
    earth.track = day.subsolar;
    renderMarkers($('time-markers'), day.events.crossings.map(({key,time:event}) => {
      const seconds = (event.date.getTime()-T.start(state.date))/1000;
      const name = key === 'sunrise' ? '日出' : '日落';
      return {fraction:seconds/86399,label:`${name} ${T.eventTime(event)}`,title:`${name} ${T.timeString(seconds)}（北京时间）。点击跳转时刻。`,select:()=>{manual();state.seconds=seconds;syncPosition();}};
    }));
    const polar = !day.events.sunrise&&!day.events.sunset ? day.events.daylight===86400?'极昼':day.events.daylight===0?'极夜':null : null;
    $('sunrise').textContent = polar||T.eventTime(day.events.sunrise);
    $('sunset').textContent = polar||T.eventTime(day.events.sunset);
    $('noon').textContent = T.eventTime(day.events.noon);
    const seconds = day.events.daylight;
    if (seconds === null) $('daylight').textContent = '—';
    else {
      const minutes = Math.round(seconds / 60);
      $('daylight').textContent = `${Math.floor(minutes / 60)} 时 ${String(minutes % 60).padStart(2, '0')} 分`;
    }
    syncPosition();
  }
  function setDate(value) {
    manual();
    if (!T.validDate(value)) { error('请输入 1900—2100 年之间的有效日期。'); return; }
    error(''); state.date = value; syncDate();
    if (state.computeFrame) cancelAnimationFrame(state.computeFrame);
    state.computeFrame = requestAnimationFrame(updateDay);
  }
  $('date').addEventListener('change', e => setDate(e.target.value));
  $('date').addEventListener('input', manual);
  function changeYear(e, reportInvalid) {
    const year = Number(e.target.value);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      if (reportInvalid) { manual(); error('年份范围为 1900—2100。'); }
      return;
    }
    setDate(T.changeYear(state.date, year));
  }
  $('year').addEventListener('input', e => { manual(); changeYear(e, false); });
  $('year').addEventListener('change', e => changeYear(e, true));
  $('date-slider').addEventListener('input', e => setDate(T.fromDay(Number(state.date.slice(0, 4)), Number(e.target.value))));
  $('prev-day').addEventListener('click', () => setDate(T.dateString(T.start(state.date) - T.DAY)));
  $('next-day').addEventListener('click', () => setDate(T.dateString(T.start(state.date) + T.DAY)));
  $('time').addEventListener('change', e => {
    manual(); const seconds = T.parseTime(e.target.value);
    if (seconds === null) { error('请输入有效时间（00:00:00—23:59:59）。'); return; }
    error(''); state.seconds = seconds; syncPosition();
  });
  $('time').addEventListener('input', manual);
  $('time-slider').addEventListener('input', e => { manual(); error(''); state.seconds = Number(e.target.value); syncPosition(); });
  $('follow-now').addEventListener('change', e => setFollowing(e.target.checked));
  $('now').addEventListener('click', () => setFollowing(true));
  function setView(mode) {
    view.mode = mode;
    $('view-dome').setAttribute('aria-pressed', mode === 'dome'); $('view-flat').setAttribute('aria-pressed', mode === 'flat');
    $('reset-view').hidden = mode === 'flat';
    $('view-hint').textContent = mode === 'flat' ? '北上东右 · 圆心为天顶' : '拖动旋转 · 方向键微调';
    syncPosition();
  }
  $('view-dome').addEventListener('click', () => setView('dome'));
  $('view-flat').addEventListener('click', () => setView('flat'));
  $('reset-view').addEventListener('click', () => view.reset());
  $('reset-earth').addEventListener('click', () => earth.reset());
  $('underground').addEventListener('change', e => { view.underground = e.target.checked; view.draw(); });
  function theme(value) {
    document.documentElement.dataset.theme = value;
    $('theme').textContent = value === 'light' ? '深色' : '浅色';
    $('theme').setAttribute('aria-label', value === 'light' ? '切换到深色模式' : '切换到浅色模式');
    try { localStorage.setItem('sun-path-theme', value); } catch (_) { /* file URLs can disable storage */ }
    view.draw(); earth.draw();
  }
  let saved;
  try { saved = localStorage.getItem('sun-path-theme'); } catch (_) { /* optional preference only */ }
  theme(saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
  $('theme').addEventListener('click', () => theme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  $('speed').addEventListener('change', e => { state.speed = Number(e.target.value); });
  function animate(timestamp) {
    if (!state.playing) return;
    if (state.lastFrame) state.seconds = (state.seconds + Math.min((timestamp - state.lastFrame) / 1000, .1) * state.speed) % 86400;
    state.lastFrame = timestamp;
    syncPosition(); state.playFrame = requestAnimationFrame(animate);
  }
  $('play').addEventListener('click', () => {
    if (state.playing) { pause(); return; }
    stopFollowing();
    if (state.computeFrame) { cancelAnimationFrame(state.computeFrame); updateDay(); }
    state.playing = true; state.lastFrame = 0;
    $('play').setAttribute('aria-pressed', 'true'); $('play-symbol').textContent = 'Ⅱ'; $('play-label').textContent = '暂停';
    state.playFrame = requestAnimationFrame(animate);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else followTick(); });
  syncLocation(); syncDate(); updateDay();
  // Always read the wall clock; background throttling cannot accumulate drift.
  setInterval(() => { if (!document.hidden) followTick(); }, 1000);
})();
