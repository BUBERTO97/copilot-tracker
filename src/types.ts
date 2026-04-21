export type RenewalType = 'days' | 'weekly' | 'monthly_fixed' | 'monthly_1st';

export interface UserSettings {
  workDaysPerWeek: number; // 1-7
  workWeekStart: number; // 0 (Sun) to 6 (Sat), usually 1 (Mon)
  renewalType: RenewalType;
  renewalValue: number; // days if 'days', day of month if 'monthly_fixed'
  lastRenewalDate: string; // ISO string
  maxPercentage: number; // 0-100
  /** Optional: explicit GitHub organization slug (e.g. "ELX-EMCC-DevOps") to query metrics for. */
  organizationSlug?: string;
  /** Optional: explicit GitHub enterprise slug to query enterprise metrics for. */
  enterpriseSlug?: string;
}

export interface DayData {
  date: string; // YYYY-MM-DD
  isWorkDay: boolean;
  percentage: number;
}

export interface CopilotDayUsage {
  date: string; // YYYY-MM-DD
  total_completions: number;
  total_chat_turns: number;
  premium_requests: number;
}

export interface CopilotUsageSummary {
  connected: boolean;
  cycleTotal: number;       // total premium requests used in cycle
  limit: number;            // monthly premium request limit
  byDate: Record<string, CopilotDayUsage>;
}
