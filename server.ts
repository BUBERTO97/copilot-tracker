import express from 'express';
import path from 'path';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cookieParser());
  app.use(express.json());

  // GitHub OAuth Routes
  app.get('/api/auth/github/url', (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: 'read:user,user:email,manage_billing:copilot,read:org', 
    });
    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }, {
        headers: { Accept: 'application/json' }
      });

      const { access_token } = response.data;

      if (!access_token) {
        throw new Error('Failed to get access token');
      }

      // Set cookie with SameSite=None and Secure=true for iframe compatibility
      res.cookie('github_token', access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('GitHub OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  app.get('/api/user/github-status', (req, res) => {
    const token = req.cookies.github_token;
    res.json({ connected: !!token });
  });

  app.post('/api/auth/set-token', (req, res) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    res.cookie('github_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({ success: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('github_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.json({ success: true });
  });

  // Fetch Copilot subscription info
  // Note: This API might require specific scopes or be part of GitHub Enterprise
  // For standard users, we might just check if they have a Copilot seat or similar
  app.get('/api/user/copilot-info', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      // Try to get user info first
      const userRes = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      });
      const username = userRes.data.login;

      let copilotData = null;
      let message = '';

      // 1. Try Individual Seat
      try {
        const individualRes = await axios.get('https://api.github.com/user/copilot', {
          headers: { 
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json'
          }
        });
        copilotData = individualRes.data;
      } catch (err: any) {
        // 404 is expected if not an individual subscriber
        if (err.response?.status !== 404) {
          console.error('Individual Copilot API Error:', err.response?.status);
        }
      }

      // 2. If no individual seat, check Organizations
      if (!copilotData) {
        try {
          const orgsRes = await axios.get('https://api.github.com/user/orgs', {
            headers: { Authorization: `token ${token}` }
          });
          
          const orgs = orgsRes.data;
          for (const org of orgs) {
            try {
              const orgCopilotRes = await axios.get(`https://api.github.com/orgs/${org.login}/members/${username}/copilot`, {
                headers: { 
                  Authorization: `token ${token}`,
                  Accept: 'application/vnd.github+json'
                }
              });
              if (orgCopilotRes.data) {
                copilotData = orgCopilotRes.data;
                copilotData.organization = org; // Attach org info
                break;
              }
            } catch (e: any) {
              // 404 means no seat in this org
            }
          }
        } catch (orgErr) {
          console.error('Failed to fetch user orgs:', orgErr);
        }
      }

      if (!copilotData) {
        message = 'Could not find an active Copilot seat (Individual or Organization). Ensure you have a seat assigned and the token has "manage_billing:copilot" and "read:org" scopes.';
      }

      res.json({
        user: userRes.data,
        copilot: copilotData,
        message
      });
    } catch (error: any) {
      console.error('GitHub API Error:', error.response?.status, error.response?.data);
      res.status(500).json({ error: 'Failed to fetch GitHub data' });
    }
  });

  app.get('/api/user/copilot-usage', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      // GitHub Copilot Usage API endpoint
      // Documentation: https://docs.github.com/en/rest/copilot/copilot-usage
      // Note: This endpoint is only for Business/Enterprise seats.
      const usageRes = await axios.get('https://api.github.com/user/copilot/usage', {
        headers: { 
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json'
        }
      });
      res.json(usageRes.data);
    } catch (error: any) {
      // If 404, it might be an individual account which doesn't support this API
      if (error.response?.status === 404) {
        return res.status(404).json({ 
          error: 'Usage data not available for this account type.',
          message: 'The Copilot Usage API is only available for Business and Enterprise subscriptions.'
        });
      }
      
      console.error('Copilot Usage API Error:', error.response?.status, error.response?.data);
      res.status(error.response?.status || 500).json({ 
        error: 'Failed to fetch Copilot usage data',
        details: error.response?.data
      });
    }
  });

  // Known monthly premium-request limits per Copilot plan type
  const PLAN_LIMITS: Record<string, number> = {
    free: 50,
    pro: 300,
    pro_plus: 1500,
    business: 300,
    enterprise: 300,
  };

  /**
   * GET /api/user/copilot-usage-metrics
   *
   * Multi-tier approach because different endpoints have different permission levels:
   *
   * Tier 1: /orgs/{org}/copilot/metrics/reports/users-28-day/latest  (2026-03-10 API)
   *         → Requires: org admin / billing manager / "View Organization Copilot Metrics" fine-grained permission
   *         → Best data: per-user daily breakdown with premium request counts
   *
   * Tier 2: /orgs/{org}/copilot/metrics  (older API, still available)
   *         → Requires: org owner OR manage_billing:copilot scope on token
   *         → Returns: aggregate org-level daily metrics (not per-user, but still useful)
   *
   * Tier 3: /orgs/{org}/members/{user}/copilot  (seat info only)
   *         → Requires: manage_billing:copilot
   *         → Gives us seat info + plan to derive limits (no usage data)
   *
   * Your IDE shows quota because it uses internal Copilot extension APIs
   * (copilot_internal/*) that use a special auth flow, not a PAT.
   */
  app.get('/api/user/copilot-usage-metrics', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { org: orgSlug, enterprise: entSlug } = req.query as {
      org?: string;
      enterprise?: string;
    };

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    };

    // 1. Identify the authenticated user
    let username = '';
    try {
      const userRes = await axios.get('https://api.github.com/user', { headers: ghHeaders });
      username = userRes.data.login;
    } catch (err: any) {
      return res.status(err.response?.status || 500).json({
        error: 'Failed to fetch authenticated user',
        details: err.response?.data,
      });
    }

    // 2. Build the list of sources to query
    interface ReportSource { kind: 'org' | 'enterprise'; slug: string; }
    const sources: ReportSource[] = [];

    if (entSlug) sources.push({ kind: 'enterprise', slug: entSlug });
    if (orgSlug) sources.push({ kind: 'org', slug: orgSlug });

    // Auto-discovery
    if (sources.length === 0) {
      try {
        const mRes = await axios.get('https://api.github.com/user/memberships/orgs?state=active', { headers: ghHeaders });
        for (const m of (mRes.data as any[])) {
          if (m.organization?.login) sources.push({ kind: 'org', slug: m.organization.login });
        }
      } catch {}
      if (sources.length === 0) {
        try {
          const oRes = await axios.get('https://api.github.com/user/orgs', { headers: ghHeaders });
          for (const o of (oRes.data as any[])) {
            if (o.login) sources.push({ kind: 'org', slug: o.login });
          }
        } catch {}
      }
    }

    if (sources.length === 0) {
      return res.json({
        days: [], scope: 'individual',
        message: 'No org/enterprise found. Specify one in Settings → Organization Slug.',
      });
    }

    const merged: Record<string, {
      date: string;
      total_completions: number;
      total_chat_turns: number;
      total_premium_requests: number;
      sources: string[];
    }> = {};

    const attempts: Array<{ source: string; tier: string; status: string; detail?: string }> = [];
    let reportStartDay: string | undefined;
    let reportEndDay: string | undefined;
    let dataTier = 'none';

    for (const src of sources) {
      // ───── TIER 1: users-28-day report (admin only) ─────
      if (src.kind === 'org' || src.kind === 'enterprise') {
        const reportPath = src.kind === 'enterprise'
          ? `https://api.github.com/enterprises/${src.slug}/copilot/metrics/reports/users-28-day/latest`
          : `https://api.github.com/orgs/${src.slug}/copilot/metrics/reports/users-28-day/latest`;

        try {
          const metaRes = await axios.get(reportPath, { headers: ghHeaders });
          const reportMeta = metaRes.data;
          reportStartDay = reportStartDay ?? reportMeta.report_start_day;
          reportEndDay = reportEndDay ?? reportMeta.report_end_day;

          for (const url of (reportMeta.download_links ?? [])) {
            try {
              const reportRes = await axios.get(url, {
                headers: { Accept: 'application/json' },
                transformRequest: [(d, h) => { delete (h as any).Authorization; return d; }],
                maxContentLength: 50 * 1024 * 1024,
              });
              const report = reportRes.data;
              const days = Array.isArray(report) ? report : (report.days ?? report.data ?? []);
              for (const day of days) {
                const date: string = day.date;
                if (!date) continue;
                if (!merged[date]) merged[date] = { date, total_completions: 0, total_chat_turns: 0, total_premium_requests: 0, sources: [] };
                const users = day.users ?? day.user_metrics ?? [];
                const me = Array.isArray(users) ? users.find((u: any) => (u.login ?? u.username) === username) : null;
                if (me) {
                  merged[date].total_completions += me.total_code_suggestions ?? me.total_completions ?? 0;
                  merged[date].total_chat_turns += me.total_chats ?? me.total_chat_turns ?? 0;
                  merged[date].total_premium_requests += me.total_premium_requests ?? me.premium_requests ?? 0;
                  merged[date].sources.push(src.slug);
                }
              }
            } catch (dlErr: any) {
              attempts.push({ source: src.slug, tier: '1-download', status: 'error', detail: dlErr.message });
            }
          }
          attempts.push({ source: src.slug, tier: '1-users-28-day', status: 'ok' });
          dataTier = 'users-report';
          continue; // Skip lower tiers for this source
        } catch (err: any) {
          const msg = err.response?.data?.message || err.message;
          attempts.push({ source: src.slug, tier: '1-users-28-day', status: `${err.response?.status ?? 'error'}`, detail: msg });
          console.error(`[Tier1 ${src.slug}] ${err.response?.status}: ${msg}`);
        }
      }

      // ───── TIER 2: /orgs/{org}/copilot/metrics (older API, aggregated org data) ─────
      if (src.kind === 'org') {
        try {
          // This endpoint uses the older API version and takes since/until as ISO timestamps
          const metricsRes = await axios.get(`https://api.github.com/orgs/${src.slug}/copilot/metrics`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
          });
          const metricsData: any[] = metricsRes.data ?? [];

          for (const day of metricsData) {
            const date: string = day.date;
            if (!date) continue;
            if (!merged[date]) merged[date] = { date, total_completions: 0, total_chat_turns: 0, total_premium_requests: 0, sources: [] };

            // Aggregate completions from IDE
            const ideCompl = day.copilot_ide_code_completions;
            if (ideCompl?.editors) {
              for (const editor of ideCompl.editors) {
                for (const model of editor.models ?? []) {
                  for (const lang of model.languages ?? []) {
                    merged[date].total_completions += lang.total_code_acceptances ?? lang.total_code_suggestions ?? 0;
                  }
                }
              }
            }

            // Aggregate chat turns
            let chatTurns = 0;
            let premiumProxy = 0;
            const ideChat = day.copilot_ide_chat;
            if (ideChat?.editors) {
              for (const editor of ideChat.editors) {
                for (const model of editor.models ?? []) {
                  chatTurns += model.total_chats ?? 0;
                  // Non-base models count as premium
                  if (!/mini|3\.5|free/i.test(model.name ?? '')) {
                    premiumProxy += model.total_chats ?? 0;
                  }
                }
              }
            }
            const dotChat = day.copilot_dotcom_chat;
            if (dotChat?.models) {
              for (const model of dotChat.models) {
                chatTurns += model.total_chats ?? 0;
                if (!/mini|3\.5|free/i.test(model.name ?? '')) {
                  premiumProxy += model.total_chats ?? 0;
                }
              }
            }
            const dotPR = day.copilot_dotcom_pull_requests;
            if (dotPR?.repositories) {
              for (const repo of dotPR.repositories) {
                for (const model of repo.models ?? []) {
                  premiumProxy += model.total_pr_summaries_created ?? 0;
                }
              }
            }

            merged[date].total_chat_turns += chatTurns;
            merged[date].total_premium_requests += premiumProxy;
            merged[date].sources.push(src.slug);
          }

          attempts.push({ source: src.slug, tier: '2-org-metrics', status: 'ok' });
          if (dataTier === 'none') dataTier = 'org-aggregate';
          continue;
        } catch (err: any) {
          const msg = err.response?.data?.message || err.message;
          attempts.push({ source: src.slug, tier: '2-org-metrics', status: `${err.response?.status ?? 'error'}`, detail: msg });
          console.error(`[Tier2 ${src.slug}] ${err.response?.status}: ${msg}`);
        }
      }

      // ───── TIER 3: /orgs/{org}/copilot/metrics/reports/organization-28-day/latest ─────
      if (src.kind === 'org') {
        try {
          const orgReportRes = await axios.get(
            `https://api.github.com/orgs/${src.slug}/copilot/metrics/reports/organization-28-day/latest`,
            { headers: ghHeaders }
          );
          const orgMeta = orgReportRes.data;
          reportStartDay = reportStartDay ?? orgMeta.report_start_day;
          reportEndDay = reportEndDay ?? orgMeta.report_end_day;

          for (const url of (orgMeta.download_links ?? [])) {
            try {
              const rr = await axios.get(url, {
                headers: { Accept: 'application/json' },
                transformRequest: [(d, h) => { delete (h as any).Authorization; return d; }],
                maxContentLength: 50 * 1024 * 1024,
              });
              const report = rr.data;
              const days = Array.isArray(report) ? report : (report.days ?? report.data ?? []);
              for (const day of days) {
                const date: string = day.date;
                if (!date) continue;
                if (!merged[date]) merged[date] = { date, total_completions: 0, total_chat_turns: 0, total_premium_requests: 0, sources: [] };
                merged[date].total_completions += day.total_completions ?? day.total_code_suggestions ?? 0;
                merged[date].total_chat_turns += day.total_chats ?? day.total_chat_turns ?? 0;
                merged[date].total_premium_requests += day.total_premium_requests ?? 0;
                merged[date].sources.push(src.slug);
              }
            } catch {}
          }

          attempts.push({ source: src.slug, tier: '3-org-28-day', status: 'ok' });
          if (dataTier === 'none') dataTier = 'org-report';
          continue;
        } catch (err: any) {
          attempts.push({ source: src.slug, tier: '3-org-28-day', status: `${err.response?.status ?? 'error'}`, detail: err.response?.data?.message });
        }
      }
    }

    const daysOut = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
    const orgsWithData = Array.from(new Set(daysOut.flatMap(d => d.sources)));

    // Build helpful message for non-admin users
    const allFailed = daysOut.length === 0;
    const all403 = attempts.every(a => a.status === '403');
    let message: string | undefined;

    if (allFailed) {
      if (all403) {
        message = `All API tiers returned 403 (Forbidden) for "${username}" on ${sources.map(s => s.slug).join(', ')}.\n\n` +
          `This means your token works but you don't have admin/billing-manager access to the org's Copilot metrics.\n\n` +
          `Options:\n` +
          `• Ask your org admin to grant you the "View Organization Copilot Metrics" role\n` +
          `• Ask your org admin to enable the "Copilot usage metrics" policy in the enterprise settings\n` +
          `• Ask your org admin to add you as a billing manager\n` +
          `• The app will still show your plan limit (${PLAN_LIMITS.business ?? 300} premium requests/month for Business plans) and projected pacing — just without actual usage data from GitHub`;
      } else {
        message = `No usage data found. Attempted tiers: ${attempts.map(a => `${a.tier}:${a.status}`).join(', ')}`;
      }
    }

    return res.json({
      days: daysOut,
      scope: sources.some(s => s.kind === 'enterprise') ? 'enterprise' : 'organization',
      username,
      data_tier: dataTier,
      data_note: dataTier === 'org-aggregate'
        ? 'Data is aggregate org-level (not per-user). Numbers reflect the entire org, not just your personal usage.'
        : dataTier === 'org-report'
          ? 'Data is from the org-level report (not per-user breakdown).'
          : undefined,
      sources_queried: sources.map(s => `${s.kind}:${s.slug}`),
      orgs_with_data: orgsWithData,
      report_start_day: reportStartDay,
      report_end_day: reportEndDay,
      attempts,
      message,
    });
  });

  /**
   * GET /api/user/copilot-quota
   *
   * Uses GET /user/copilot for plan_type → derives the monthly premium-request limit.
   * Live usage counter is not publicly exposed for individual users; the client must
   * aggregate from /api/user/copilot-usage-metrics.
   */
  app.get('/api/user/copilot-quota', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    };

    let limit = 300;
    let planType = 'unknown';

    try {
      const copilotRes = await axios.get('https://api.github.com/user/copilot', { headers: ghHeaders });
      planType = copilotRes.data.plan_type ?? copilotRes.data.copilot_plan ?? 'unknown';
      limit = PLAN_LIMITS[planType] ?? 300;
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error('GET /user/copilot error:', err.response?.status, err.response?.data?.message);
      }
    }

    return res.json({
      quota: { premium_requests: { limit, usage: 0 } },
      plan_type: planType,
      usage_source: 'derive_from_metrics',
    });
  });

  // Debug: inspect raw /user/copilot response (plan_type, seat info)
  app.get('/api/debug/copilot-seat', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const r = await axios.get('https://api.github.com/user/copilot', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
      });
      res.json(r.data);
    } catch (e: any) {
      res.status(e.response?.status || 500).json(e.response?.data ?? { error: e.message });
    }
  });

  /**
   * Debug: inspect the raw report metadata + first downloaded file for a given org.
   *   GET /api/debug/copilot-report?org=OWNER&type=users-28-day|organization-28-day
   * This helps you see exactly what GitHub returns so the parser can be adjusted.
   */
  app.get('/api/debug/copilot-report', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { org, type = 'users-28-day' } = req.query as { org?: string; type?: string };
    if (!org) return res.status(400).json({ error: 'Missing ?org=OWNER' });

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    };

    try {
      const meta = await axios.get(
        `https://api.github.com/orgs/${org}/copilot/metrics/reports/${type}/latest`,
        { headers: ghHeaders }
      );
      const result: any = { meta: meta.data, downloaded: [] };
      for (const url of (meta.data.download_links ?? []).slice(0, 2)) {
        try {
          const r = await axios.get(url, {
            headers: { Accept: 'application/json' },
            transformRequest: [(d, h) => { delete (h as any).Authorization; return d; }],
          });
          const sample = Array.isArray(r.data) ? r.data.slice(0, 2) : r.data;
          result.downloaded.push({ url, sample });
        } catch (e: any) {
          result.downloaded.push({ url, error: e.message });
        }
      }
      res.json(result);
    } catch (e: any) {
      res.status(e.response?.status || 500).json(e.response?.data ?? { error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
