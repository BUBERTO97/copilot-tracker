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
   * Official Copilot Usage Metrics API (apiVersion 2026-03-10).
   * All endpoints return signed download_links — not data directly.
   *
   *   https://docs.github.com/en/rest/copilot/copilot-usage-metrics?apiVersion=2026-03-10
   *
   * Strategy:
   *   1. Fetch the user's orgs.
   *   2. For each org, call:
   *        GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest
   *      This returns `{ download_links[], report_start_day, report_end_day }`.
   *   3. Follow each download_link (they are signed S3-style URLs — no auth needed),
   *      parse the JSON report, and filter daily records to the authenticated user.
   *   4. Aggregate per-day engagement across all reports (completions, chat turns,
   *      premium-request proxy).
   *
   * Required scopes: `read:org` OR `manage_billing:copilot` on the token,
   *                  AND the org must enable the Copilot Usage Metrics policy.
   */
  app.get('/api/user/copilot-usage-metrics', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    };

    // Fetch user + orgs in parallel
    let username = '';
    let orgs: any[] = [];
    try {
      const [userRes, orgsRes] = await Promise.all([
        axios.get('https://api.github.com/user', { headers: ghHeaders }),
        axios.get('https://api.github.com/user/orgs', { headers: ghHeaders }),
      ]);
      username = userRes.data.login;
      orgs = orgsRes.data;
    } catch (err: any) {
      return res.status(err.response?.status || 500).json({
        error: 'Failed to fetch user/orgs',
        details: err.response?.data,
      });
    }

    if (orgs.length === 0) {
      return res.json({
        days: [],
        scope: 'individual',
        message: 'No organizations found. The Copilot Usage Metrics API (apiVersion 2026-03-10) is only available at the organization or enterprise level — not for individual Copilot Pro/Pro+ subscribers.',
      });
    }

    // Aggregated per-day data across all orgs, filtered to the authenticated user
    const merged: Record<string, {
      date: string;
      total_completions: number;
      total_chat_turns: number;
      total_premium_requests: number;
      sources: string[];
    }> = {};

    const errors: Array<{ org: string; status?: number; message?: string }> = [];
    let reportStartDay: string | undefined;
    let reportEndDay: string | undefined;

    for (const org of orgs) {
      // Step 1: get download links for this org's users-28-day report
      let reportMeta: { download_links: string[]; report_start_day: string; report_end_day: string };
      try {
        const metaRes = await axios.get(
          `https://api.github.com/orgs/${org.login}/copilot/metrics/reports/users-28-day/latest`,
          { headers: ghHeaders }
        );
        reportMeta = metaRes.data;
        reportStartDay = reportStartDay ?? reportMeta.report_start_day;
        reportEndDay = reportEndDay ?? reportMeta.report_end_day;
      } catch (err: any) {
        const status = err.response?.status;
        if (status !== 403 && status !== 404) {
          errors.push({ org: org.login, status, message: err.response?.data?.message });
          console.error(`[${org.login}] users-28-day report error:`, status, err.response?.data?.message);
        }
        continue;
      }

      if (!reportMeta.download_links?.length) continue;

      // Step 2: fetch each download_link (signed URL — strip auth headers)
      for (const url of reportMeta.download_links) {
        try {
          const reportRes = await axios.get(url, {
            // Signed URLs must NOT carry the GitHub Authorization header
            headers: { Accept: 'application/json' },
            transformRequest: [(data, headers) => {
              delete (headers as any).Authorization;
              return data;
            }],
            maxContentLength: 50 * 1024 * 1024,
          });

          const report = reportRes.data;
          // Report structure: array of days, each with per-user breakdown
          const days = Array.isArray(report) ? report : (report.days ?? report.data ?? []);

          for (const day of days) {
            const date: string = day.date;
            if (!date) continue;

            if (!merged[date]) {
              merged[date] = {
                date,
                total_completions: 0,
                total_chat_turns: 0,
                total_premium_requests: 0,
                sources: [],
              };
            }

            // Look for per-user breakdown and filter to the authenticated user
            const users = day.users ?? day.user_metrics ?? [];
            const me = Array.isArray(users)
              ? users.find((u: any) => (u.login ?? u.username) === username)
              : null;

            if (me) {
              merged[date].total_completions += me.total_code_suggestions
                ?? me.total_completions
                ?? me.code_suggestions_count
                ?? 0;
              merged[date].total_chat_turns += me.total_chats
                ?? me.total_chat_turns
                ?? me.chat_turns
                ?? 0;
              merged[date].total_premium_requests += me.total_premium_requests
                ?? me.premium_requests_count
                ?? me.premium_requests
                ?? 0;
              merged[date].sources.push(org.login);
            }
          }
        } catch (dlErr: any) {
          console.error(`[${org.login}] download_link fetch failed:`, dlErr.response?.status ?? dlErr.message);
        }
      }
    }

    const daysOut = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
    const orgsWithData = Array.from(new Set(daysOut.flatMap(d => d.sources)));

    return res.json({
      days: daysOut,
      scope: 'organization',
      orgs_checked: orgs.map(o => o.login),
      orgs_with_data: orgsWithData,
      report_start_day: reportStartDay,
      report_end_day: reportEndDay,
      errors: errors.length ? errors : undefined,
      message: daysOut.length === 0
        ? `No usage data found for user "${username}" in any of the ${orgs.length} accessible org(s). This can mean: (a) none of your orgs have the Copilot Usage Metrics policy enabled, (b) your token lacks read:org / manage_billing:copilot scope, or (c) you haven't used Copilot through an org seat in the last 28 days.`
        : undefined,
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
