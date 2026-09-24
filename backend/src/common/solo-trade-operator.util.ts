export const SOLO_TRADE_COMMENT_PREFIX = 'S|';
const BROKER_COMMENT_MAX = 31;

export function sanitizeSoloCommentPart(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, BROKER_COMMENT_MAX);
}

/** Short label from display name, else local-part of email. */
export function defaultSoloTraderLabel(input: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const name = sanitizeSoloCommentPart(input.displayName || '');
  if (name.length >= 2 && name.toLowerCase() !== 'trader') {
    return name.slice(0, 12);
  }
  const local = sanitizeSoloCommentPart(
    (input.email || '').split('@')[0] || '',
  );
  return (local || 'trader').slice(0, 12);
}

/**
 * Broker comment always names who opened the trade.
 * Optional chosen text is appended after the identity.
 */
export function buildSoloOpenComment(input: {
  userId: string;
  displayName?: string | null;
  email?: string | null;
  chosen?: string | null;
}): string {
  const identity = defaultSoloTraderLabel(input);
  const chosen = sanitizeSoloCommentPart(input.chosen || '');
  let comment =
    chosen && chosen.toLowerCase() !== identity.toLowerCase()
      ? `${identity}:${chosen}`
      : identity;
  if (!comment) comment = `${SOLO_TRADE_COMMENT_PREFIX}${input.userId}`;
  return comment.slice(0, BROKER_COMMENT_MAX);
}

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
  identity?: string | null,
): boolean {
  const parsed = parseSoloTradeUserId(comment);
  if (parsed) {
    return (
      userId.startsWith(parsed) ||
      parsed.startsWith(userId.slice(0, parsed.length))
    );
  }
  const token = sanitizeSoloCommentPart(identity || '').toLowerCase();
  if (token.length >= 2 && comment) {
    const head = comment.split(':')[0]?.toLowerCase() || '';
    return head === token || head.startsWith(token) || token.startsWith(head);
  }
  return false;
}

export function roundSoloUsdt(n: number): number {
  return Math.round(n * 100) / 100;
}
