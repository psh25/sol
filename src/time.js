(function (root) {
  'use strict';
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;
  const pad = n => String(n).padStart(2, '0');
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1900 || y > 2100) return false;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }
  function start(value) {
    if (!validDate(value)) throw new RangeError('日期必须在 1900—2100 年之间。');
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - OFFSET;
  }
  function dateString(ms) {
    const d = new Date(ms + OFFSET);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function now(ms = Date.now()) {
    const d = new Date(ms + OFFSET);
    return { date: dateString(ms), seconds: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() };
  }
  function timeString(seconds, withSeconds = true) {
    const s = Math.floor(((seconds % 86400) + 86400) % 86400);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}${withSeconds ? ':' + pad(s % 60) : ''}`;
  }
  function parseTime(value) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
    const [h, m, s = 0] = value.split(':').map(Number);
    return h < 24 && m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
  }
  function yearDays(y) { return (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY; }
  function dayIndex(value) { const y = Number(value.slice(0, 4)); return (start(value) + OFFSET - Date.UTC(y, 0, 1)) / DAY; }
  function fromDay(y, index) { return dateString(Date.UTC(y, 0, 1) - OFFSET + index * DAY); }
  function changeYear(value, year) {
    const [, m, d] = value.split('-').map(Number);
    const maxDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return `${year}-${pad(m)}-${pad(Math.min(d, maxDay))}`;
  }
  function eventTime(event) {
    if (!event) return '—';
    const rounded = Math.round(event.date.getTime() / 60000) * 60000;
    return timeString(now(rounded).seconds, false);
  }
  const api = { DAY, OFFSET, validDate, start, dateString, now, timeString, parseTime, yearDays, dayIndex, fromDay, changeYear, eventTime };
  root.SunTime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
