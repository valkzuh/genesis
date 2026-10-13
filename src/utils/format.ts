/** Human-friendly number and date formatting for the interface. */

export function formatNumber(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(0)}k`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(digits)}k`;
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
  if (abs >= 10) return `${sign}${abs.toFixed(abs % 1 === 0 ? 0 : 1)}`;
  return `${sign}${abs.toFixed(abs % 1 === 0 ? 0 : 1)}`;
}

export function formatPopulation(n: number): string {
  return formatNumber(Math.max(0, n), n >= 1e6 ? 2 : 1);
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatPercent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatYear(year: number): string {
  return `Year ${Math.round(year).toLocaleString('en-US')}`;
}

export function formatYears(n: number): string {
  const v = Math.round(n);
  return `${v.toLocaleString('en-US')} ${v === 1 ? 'year' : 'years'}`;
}

export function signed(n: number, digits = 0): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}
