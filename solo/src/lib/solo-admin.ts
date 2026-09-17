export function canManageSoloTrades(user?: {
  email?: string | null;
  role?: string | null;
  canManageTrades?: boolean;
} | null): boolean {
  if (!user) return false;
  if (user.canManageTrades === true) return true;
  if (user.role === "ADMIN") return true;
  return user.email?.trim().toLowerCase() === "willeratmit12@gmail.com";
}
