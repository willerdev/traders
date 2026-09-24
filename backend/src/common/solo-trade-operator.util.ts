export const SOLO_TRADE_COMMENT_PREFIX = 'S|';

/** Broker comment budget is tight; keep a unique prefix of the user id. */
export function soloTradeComment(userId: string): string {
  const tag = `${SOLO_TRADE_COMMENT_PREFIX}${userId}`;
  return tag.slice(0, 26);
}

export function parseSoloTradeUserId(comment?: string | null): string | null {
  if (!comment?.trim()) return null;
  const raw = comment.trim();
  const m = raw.match(/^(?:SOLO\||S\|)(.+)$/i);
  if (!m?.[1]) return null;
  const id = m[1].trim();
  return id.length >= 8 ? id : null;
}

export function commentBelongsToUser(
  comment: string | null | undefined,
  userId: string,
): boolean {
  const parsed = parseSoloTradeUserId(comment);
  if (!parsed) return false;
  return userId.startsWith(parsed) || parsed.startsWith(userId.slice(0, parsed.length));
}

export function roundSoloUsdt(n: number): number {
  return Math.round(n * 100) / 100;
}
