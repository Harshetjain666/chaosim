export function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const FILE_BADGE: Record<string, string> = {
  js: 'JS',
  yaml: 'YML',
  env: 'ENV',
  md: 'MD',
  log: 'LOG',
};
