/** Second product: Trade Guard Solo (investor-only API process). */
let soloMarked = false;

export function markSoloApp(): void {
  soloMarked = true;
  if (!(process.env.APP_VARIANT || '').trim()) {
    process.env.APP_VARIANT = 'solo';
  }
}

export function isSoloApp(): boolean {
  if (soloMarked) return true;
  return (process.env.APP_VARIANT || '').trim().toLowerCase() === 'solo';
}
