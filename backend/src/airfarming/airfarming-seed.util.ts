export function deterministicSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function pickIntervalHours(
  userId: string,
  weekStartKey: string,
  dropIndex: number,
  intervals: number[],
): number {
  const seed = deterministicSeed(`${userId}:${weekStartKey}:${dropIndex}`);
  return intervals[seed % intervals.length] ?? intervals[0] ?? 2;
}
