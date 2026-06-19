import type { IncidentState } from './types.ts';

const KEY = 'chaosim.save.v1';

export interface SaveRecord {
  v: 1;
  scenarioId: string;
  playerName: string;
  state: IncidentState;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveGame(record: SaveRecord): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(record));
  } catch {
    // storage full or blocked: a save is best effort, never fatal
  }
}

export function loadGame(): SaveRecord | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveRecord;
    if (!parsed || parsed.v !== 1 || !parsed.state || parsed.state.submitted) return null;
    // Reject saves from an older shape so a resume never crashes on read.
    const st = parsed.state;
    const valid =
      typeof st.elapsed === 'number' &&
      Array.isArray(st.ceoReplyTimes) &&
      Array.isArray(st.logFeed) &&
      Array.isArray(st.terminal) &&
      typeof st.fileContents === 'object';
    return valid ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    // ignore
  }
}
