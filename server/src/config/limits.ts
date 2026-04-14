export interface UsageLimits {
  dailyTokens: number;
  monthlyTokens: number;
}

export const DEFAULT_LIMITS: UsageLimits = {
  dailyTokens:   200_000,
  monthlyTokens: 2_000_000,
};

// Future hook: map Clerk publicMetadata.plan strings to custom limits.
export const PLAN_LIMITS: Record<string, UsageLimits> = {
  // pro: { dailyTokens: 500_000, monthlyTokens: 10_000_000 },
};

export function getLimitsForUser(userId: string): UsageLimits | null {
  // Read at call time so dotenv has already run (module-level reads execute before dotenv.config())
  const unlimited = new Set((process.env.UNLIMITED_USER_IDS ?? '').split(',').filter(Boolean));
  if (unlimited.has(userId)) return null;
  return DEFAULT_LIMITS;
}
