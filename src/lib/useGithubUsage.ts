import { useState, useEffect, useCallback } from 'react';
import { UserSettings, CopilotDayUsage, CopilotUsageSummary } from '../types';

const EMPTY: CopilotUsageSummary = { connected: false, cycleTotal: 0, limit: 0, byDate: {} };

export interface CopilotUsageSummaryEx extends CopilotUsageSummary {
  scope?: 'individual' | 'organization' | 'enterprise';
  message?: string;
  planType?: string;
  orgsWithData?: string[];
  reportStartDay?: string;
  reportEndDay?: string;
  dataTier?: string;
  dataNote?: string;
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

      // Build query string with explicit org/enterprise if the user set them in settings
      const qs = new URLSearchParams();
      if (settings.organizationSlug) qs.set('org', settings.organizationSlug);
      if (settings.enterpriseSlug) qs.set('enterprise', settings.enterpriseSlug);
      const qsStr = qs.toString() ? `?${qs.toString()}` : '';

      const [usageRes, quotaRes] = await Promise.all([
        fetch(`/api/user/copilot-usage-metrics${qsStr}`),
        fetch('/api/user/copilot-quota'),
      ]);

      let limit = 0;
      let planType = 'unknown';
      if (quotaRes.ok) {
        const q = await quotaRes.json();
        limit = q.quota?.premium_requests?.limit ?? 0;
        planType = q.plan_type ?? 'unknown';
      }

      let days: any[] = [];
      let scope: 'individual' | 'organization' | 'enterprise' = 'individual';
      let message: string | undefined;
      let orgsWithData: string[] = [];
      let reportStartDay: string | undefined;
      let reportEndDay: string | undefined;
      let dataTier: string | undefined;
      let dataNote: string | undefined;

      if (usageRes.ok) {
        const data = await usageRes.json();
        days = data.days ?? [];
        scope = data.scope ?? 'individual';
        message = data.message;
        orgsWithData = data.orgs_with_data ?? [];
        reportStartDay = data.report_start_day;
        reportEndDay = data.report_end_day;
        dataTier = data.data_tier;
        dataNote = data.data_note;
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
        reportStartDay,
        reportEndDay,
        dataTier,
        dataNote,
      });
    } catch (err) {
      console.error('Failed to fetch Copilot usage:', err);
    }
  }, [settings.organizationSlug, settings.enterpriseSlug]);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  return { usage, refresh: fetchUsage };
}
