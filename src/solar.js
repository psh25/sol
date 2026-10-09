(function (root) {
  'use strict';
  const A = root.Astronomy || (typeof require === 'function' ? require('../vendor/astronomy.browser.min.js') : null);
  const T = root.SunTime || (typeof require === 'function' ? require('./time.js') : null);
  const BEIJING = Object.freeze({ latitude: 39.9042, longitude: 116.4074, elevation: 0 });
  const observers = new Map();
  function observer(location) {
    const key = `${location.latitude},${location.longitude},${location.elevation || 0}`;
    if (!observers.has(key)) observers.set(key, new A.Observer(location.latitude, location.longitude, location.elevation || 0));
    return observers.get(key);
  }
  function position(ms, location = BEIJING) {
    const date = new Date(ms);
    const obs = observer(location);
    const eq = A.Equator(A.Body.Sun, date, obs, true, true);
    const hor = A.Horizon(date, obs, eq.ra, eq.dec, null);
    return { ms, azimuth: hor.azimuth, altitude: hor.altitude };
  }
  function crossing(a, b, location) {
    let lo = a.ms, hi = b.ms;
    const positive = a.altitude >= 0;
    for (let i = 0; i < 19; i++) {
      const mid = (lo + hi) / 2;
      if ((position(mid, location).altitude >= 0) === positive) lo = mid;
      else hi = mid;
    }
    return { ...position((lo + hi) / 2, location), altitude: 0 };
  }
  function trajectory(value, location = BEIJING, interval = 120) {
    if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('采样间隔必须大于零。');
    const first = T.start(value), end = first + T.DAY;
    const points = [];
    for (let ms = first; ms < end; ms += interval * 1000) {
      const p = position(ms, location), prev = points[points.length - 1];
      if (prev && prev.altitude * p.altitude < 0) points.push(crossing(prev, p, location));
      points.push(p);
    }
    const last = position(end, location), prev = points[points.length - 1];
    if (prev.altitude * last.altitude < 0) points.push(crossing(prev, last, location));
    points.push(last);
    return points;
  }
  function events(value, location = BEIJING) {
    const first = T.start(value), end = first + T.DAY;
    const obs = observer(location), startDate = new Date(first);
    const within = time => time && time.date.getTime() >= first && time.date.getTime() < end ? time : null;
    const nextRise = A.SearchRiseSet(A.Body.Sun, obs, 1, startDate, 2);
    const nextSet = A.SearchRiseSet(A.Body.Sun, obs, -1, startDate, 2);
    const collect = (next,direction) => {
      const found=[];
      while(within(next)) {
        found.push(next);
        const cursor=next.date.getTime()+1000;
        if(cursor>=end)break;
        next=A.SearchRiseSet(A.Body.Sun,obs,direction,new Date(cursor),(end-cursor)/T.DAY);
      }
      return found;
    };
    const rises=collect(nextRise,1),sets=collect(nextSet,-1);
    const sunrise=rises[0]||null,sunset=sets[0]||null;
    const transit = A.SearchHourAngle(A.Body.Sun, obs, 0, startDate, 1);
    const noon = within(transit.time);
    // Sum illuminated intervals within the selected UTC+8 calendar day.
    // At western longitudes sunset can precede sunrise; polar transitions
    // can contain just one event. The next event determines the initial state.
    let illuminated = nextSet && (!nextRise || nextSet.date < nextRise.date) ? true :
      nextRise ? false : position(first + T.DAY / 2, location).altitude > -.833;
    let daylight = 0, cursor = first;
    // Near a polar transition there can even be repeated rise/set events
    // within 24 hours. Include every crossing, rather than just the first pair.
    const boundaries = [...rises.map(time=>({time,above:true,key:'sunrise'})),...sets.map(time=>({time,above:false,key:'sunset'}))]
      .sort((a,b)=>a.time.date-b.time.date);
    for (const event of boundaries) {
      const ms = event.time.date.getTime();
      if (illuminated) daylight += (ms-cursor)/1000;
      cursor = ms; illuminated = event.above;
    }
    if (illuminated) daylight += (end-cursor)/1000;
    return { sunrise, sunset, noon, daylight, crossings: boundaries };
  }
  function compass(azimuth) { return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(azimuth / 45) % 8]; }
  function subsolar(ms) {
    // Spherical-Earth schematic: apparent geocentric declination is latitude;
    // right ascension minus GAST gives east-positive Earth-fixed longitude.
    const date = new Date(ms);
    const eq = A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(date), A.GeoVector(A.Body.Sun, date, true)));
    const longitude = ((15 * (eq.ra - A.SiderealTime(date)) + 180) % 360 + 360) % 360 - 180;
    return { ms, latitude: eq.dec, longitude };
  }
  function subsolarTrajectory(value) {
    const first = T.start(value), points = [];
    for (let minutes = 0; minutes <= 1440; minutes += 10) points.push(subsolar(first + minutes * 60000));
    return points;
  }
  function earthOrientation(ms) {
    const date = new Date(ms);
    // Earth-fixed -> true equator/equinox of date -> true ecliptic of date.
    // Astronomy Engine stores rotation matrices by input column.
    return { sidereal: 15 * A.SiderealTime(date), rotation: A.Rotation_EQD_ECT(date).rot };
  }
  function landmarksFromDays(days) {
    const valid = days.filter(d => Number.isFinite(d.daylight));
    if (!valid.length) return [];
    const longest = valid.reduce((a, b) => b.daylight > a.daylight ? b : a);
    const shortest = valid.reduce((a, b) => b.daylight < a.daylight ? b : a);
    const equals = new Map();
    for (let i = 1; i < days.length; i++) {
      const a = days[i - 1], b = days[i];
      if (!Number.isFinite(a.daylight) || !Number.isFinite(b.daylight)) continue;
      if ((a.daylight - 43200) * (b.daylight - 43200) <= 0) {
        const closest = Math.abs(a.daylight - 43200) <= Math.abs(b.daylight - 43200) ? a : b;
        equals.set(closest.date, { ...closest, kind: 'equal' });
      }
    }
    return [{ ...longest, kind: 'longest' }, { ...shortest, kind: 'shortest' }, ...equals.values()].sort((a, b) => a.index - b.index);
  }
  function yearLandmarks(year, location = BEIJING) {
    const days = [];
    for (let index = 0; index < T.yearDays(year); index++) {
      const date = T.fromDay(year, index);
      days.push({ date, index, daylight: events(date, location).daylight });
    }
    return landmarksFromDays(days);
  }
  const api = { BEIJING, position, trajectory, events, compass, subsolar, subsolarTrajectory, earthOrientation, landmarksFromDays, yearLandmarks };
  root.SunSolar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
