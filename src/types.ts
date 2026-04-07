export type RenewalType = 'days' | 'weekly' | 'monthly_fixed' | 'monthly_1st';

export interface UserSettings {
  workDaysPerWeek: number; // 1-7
  workWeekStart: number; // 0 (Sun) to 6 (Sat), usually 1 (Mon)
  renewalType: RenewalType;
  renewalValue: number; // days if 'days', day of month if 'monthly_fixed'
  lastRenewalDate: string; // ISO string
  maxPercentage: number; // 0-100
}

export interface DayData {
  date: string; // YYYY-MM-DD
  isWorkDay: boolean;
  percentage: number;
}
