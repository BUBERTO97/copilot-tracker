import { useState, useEffect, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { UserSettings, CopilotDayUsage, CopilotUsageSummary } from '../types';
import { getSubscriptionCycle } from './calculations';

const EMPTY: CopilotUsageSummary = { connected: false, cycleTotal: 0, limit: 0, byDate: {} };

export function useGithubUsage(settings: UserSettings) {
  const [usage, setUsage] = useState<CopilotUsageSummary>(EMPTY);

  const fetchUsage = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/user/github-status');
      const status = await statusRes.json();
      if (!status.connected) {
        setUsage(EMPTY);
        return;
      }

      const { start, end } = getSubscriptionCycle(new Date(), settings);
      // end is exclusive in our cycle logic, so subtract 1 day for the API "until"
      const since = format(start, 'yyyy-MM-dd');
      const until = format(addDays(end, -1), 'yyyy-MM-dd');

      const [usageRes, quotaRes] = await Promise.all([
        fetch(`/api/user/copilot-usage-metrics?since=${since}&until=${until}`),
        fetch('/api/user/copilot-quota'),
      ]);

      if (!usageRes.ok) {
        setUsage(EMPTY);
        return;
      }

      const usageData: any[] = await usageRes.json();

      let limit = 0;
      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        limit = quotaData.quota?.premium_requests?.limit ?? 0;
      }

      const byDate: Record<string, CopilotDayUsage> = {};
      let cycleTotal = 0;

      for (const day of usageData) {
        // `total_premium_requests` is the field in apiVersion 2026-03-10
        // fall back to summing premium-tier model completions if absent
        let premiumReqs: number = day.total_premium_requests ?? 0;
        if (!premiumReqs && Array.isArray(day.models)) {
          premiumReqs = (day.models as any[]).reduce((sum: number, model: any) => {
            // Count completions + chat from non-base (premium) models
            if (model.is_custom_model || (model.name && !model.name.startsWith('gpt-3'))) {
              return sum + (model.total_completions ?? 0) + (model.total_chat_turns ?? 0);
            }
            return sum;
          }, 0);
        }

        byDate[day.date] = {
          date: day.date,
          total_completions: day.total_completions ?? day.total_suggestions_count ?? 0,
          total_chat_turns: day.total_chat_turns ?? 0,
          premium_requests: premiumReqs,
        };
        cycleTotal += premiumReqs;
      }

      setUsage({ connected: true, cycleTotal, limit, byDate });
    } catch (err) {
      console.error('Failed to fetch Copilot usage:', err);
    }
  }, [settings]);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchUsage]);

  return { usage, refresh: fetchUsage };
}

