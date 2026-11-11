/**
 * @module utils/ethiopianCalendar
 * @description Deterministic Julian Day Number (JDN) algorithms for bidirectional
 * Gregorian and Ethiopian calendar conversion, supporting Ethiopian date parsing,
 * formatting, and UTC midnight normalization.
 */

/**
 * Converts a Gregorian date (year, month, day) to Julian Day Number (JDN).
 * @param {number} year - Gregorian year (e.g. 2026)
 * @param {number} month - Gregorian month (1-12)
 * @param {number} day - Gregorian day of month (1-31)
 * @returns {number} Julian Day Number
 */
export function gregorianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Converts a Julian Day Number (JDN) to Ethiopian date components.
 * @param {number} jdn - Julian Day Number
 * @returns {{ year: number, month: number, day: number }} Ethiopian date components
 */
export function jdnToEthiopian(jdn) {
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

/**
 * Converts a Date object or ISO date string to Ethiopian date components.
 * @param {Date|string} dateInput - Input Gregorian date or date string
 * @returns {{ year: number, month: number, day: number }|null} Ethiopian date components
 * @throws {Error} If dateInput is an invalid Date or unparseable string.
 */
export function toEthiopianDate(dateInput) {
  if (!dateInput) return null;
  let year;
  let month;
  let day;

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = parseInt(m[1], 10);
      month = parseInt(m[2], 10);
      day = parseInt(m[3], 10);
    }
  } else if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) {
      throw new Error('Invalid date provided to toEthiopianDate.');
    }
    year = dateInput.getUTCFullYear();
    month = dateInput.getUTCMonth() + 1;
    day = dateInput.getUTCDate();
  }

  if (!year || !month || !day) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) {
      throw new Error('Invalid date provided to toEthiopianDate.');
    }
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    day = d.getUTCDate();
  }

  const jdn = gregorianToJdn(year, month, day);
  return jdnToEthiopian(jdn);
}

/**
 * Formats a Gregorian date input into an Ethiopian date string formatted as DD-MM-YY.
 * @param {Date|string} dateInput - Input Gregorian date or date string
 * @returns {string|null} Formatted Ethiopian date string (e.g. '03-03-19')
 */
export function toEthiopianDateString(dateInput) {
  if (!dateInput) return null;
  const eth = toEthiopianDate(dateInput);
  if (!eth) return null;
  const dd = String(eth.day).padStart(2, '0');
  const mm = String(eth.month).padStart(2, '0');
  const yy = String(eth.year).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/**
 * Converts a Julian Day Number (JDN) to Gregorian date components.
 * @param {number} jdn - Julian Day Number
 * @returns {{ year: number, month: number, day: number }} Gregorian date components
 */
export function jdnToGregorian(jdn) {
  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l2 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l2 + 1)) / 1461001);
  const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l3) / 2447);
  const day = l3 - Math.floor((2447 * j) / 80);
  const l4 = Math.floor(j / 11);
  const month = j + 2 - 12 * l4;
  const year = 100 * (n - 49) + i + l4;
  return { year, month, day };
}

/**
 * Converts an Ethiopian date (year, month, day) to Julian Day Number (JDN).
 * @param {number} year - Ethiopian year (e.g. 2019)
 * @param {number} month - Ethiopian month (1-13)
 * @param {number} day - Ethiopian day of month (1-30)
 * @returns {number} Julian Day Number
 */
export function ethiopianToJdn(year, month, day) {
  return 1723856 + 365 * year + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
}

/**
 * Parses an Ethiopian date string (e.g. '03-03-19', '03/03/2019') into a Gregorian Date object normalized to UTC midnight.
 * @param {string} ethDateStr - Ethiopian date string in DD-MM-YY, DD-MM-YYYY, or slash-separated format
 * @returns {Date|null} UTC midnight normalized Date object, or null if invalid
 */
export function parseEthiopianToGregorianDate(ethDateStr) {
  const clean = String(ethDateStr || '').trim().replace(/\//g, '-');
  const m = clean.match(/^(\d{2})-(\d{2})-(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const jdn = ethiopianToJdn(year, month, day);
  const { year: gYear, month: gMonth, day: gDay } = jdnToGregorian(jdn);
  return new Date(Date.UTC(gYear, gMonth - 1, gDay, 0, 0, 0, 0));
}

export default {
  gregorianToJdn,
  jdnToEthiopian,
  toEthiopianDate,
  toEthiopianDateString,
  jdnToGregorian,
  ethiopianToJdn,
  parseEthiopianToGregorianDate,
};
