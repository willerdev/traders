export const SOLO_TRADE_COMMENT_PREFIX = 'SOLO|';

export function soloTradeComment(userId: string): string {
  const tag = `${SOLO_TRADE_COMMENT_PREFIX}${userId}`;
  return tag.slice(0, 31);
}

export function parseSoloTradeUserId(comment?: string | null): string | null {
  if (!comment?.trim()) return null;
  const raw = comment.trim();
  if (!raw.toUpperCase().startsWith('SOLO|')) return null;
  const id = raw.slice(raw.indexOf('|') + 1).trim();
  return id.length >= 8 ? id : null;
}

export function roundSoloUsdt(n: number): number {
  return Math.round(n * 100) / 100;
}
