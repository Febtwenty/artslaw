export interface UsageLimits {
  dailyTokens: number;
  monthlyTokens: number;
}

export const DEFAULT_LIMITS: UsageLimits = {
  dailyTokens:   100_000,
  monthlyTokens: 2_000_000,
};

// Future hook: map Clerk publicMetadata.plan strings to custom limits.
export const PLAN_LIMITS: Record<string, UsageLimits> = {
  // pro: { dailyTokens: 500_000, monthlyTokens: 10_000_000 },
};

export function getLimitsForUser(_userId: string): UsageLimits {
  return DEFAULT_LIMITS;
}
