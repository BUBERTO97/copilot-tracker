import { useState, useEffect, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { UserSettings, CopilotDayUsage, CopilotUsageSummary } from '../types';
import { getSubscriptionCycle } from './calculations';

const EMPTY: CopilotUsageSummary = { connected: false, cycleTotal: 0, limit: 0, byDate: {} };

export interface CopilotUsageSummaryEx extends CopilotUsageSummary {
  scope?: 'individual' | 'organization';
  message?: string;
  planType?: string;
  orgsWithData?: string[];
}

export function useGithubUsage(settings: UserSettings) {
  const [usage, setUsage] = useState<CopilotUsageSummaryEx>(EMPTY);

  const fetchUsage = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/user/github-status');
      const status = await statusRes.json();
      if (!status.connected) {
        setUsage(EMPTY);
        return;
      }

      const { start, end } = getSubscriptionCycle(new Date(), settings);
      const since = format(start, 'yyyy-MM-dd');
      const until = format(addDays(end, -1), 'yyyy-MM-dd');

      const [usageRes, quotaRes] = await Promise.all([
        fetch(`/api/user/copilot-usage-metrics?since=${since}&until=${until}`),
        fetch('/api/user/copilot-quota'),
      ]);

      // Quota — limit + plan type
      let limit = 0;
      let planType = 'unknown';
      if (quotaRes.ok) {
        const q = await quotaRes.json();
        limit = q.quota?.premium_requests?.limit ?? 0;
        planType = q.plan_type ?? 'unknown';
      }

      // Usage metrics — server now returns { days, scope, message, orgs_with_data }
      let days: any[] = [];
      let scope: 'individual' | 'organization' = 'individual';
      let message: string | undefined;
      let orgsWithData: string[] = [];

      if (usageRes.ok) {
        const data = await usageRes.json();
        days = data.days ?? [];
        scope = data.scope ?? 'individual';
        message = data.message;
        orgsWithData = data.orgs_with_data ?? [];
      }

      const byDate: Record<string, CopilotDayUsage> = {};
      let cycleTotal = 0;

      for (const day of days) {
        const premiumReqs = day.total_premium_requests ?? 0;
        byDate[day.date] = {
          date: day.date,
          total_completions: day.total_completions ?? 0,
          total_chat_turns: day.total_chat_turns ?? 0,
          premium_requests: premiumReqs,
        };
        cycleTotal += premiumReqs;
      }

      setUsage({
        connected: true,
        cycleTotal,
        limit,
        byDate,
        scope,
        message,
        planType,
        orgsWithData,
      });
    } catch (err) {
      console.error('Failed to fetch Copilot usage:', err);
    }
  }, [settings]);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  return { usage, refresh: fetchUsage };
}
