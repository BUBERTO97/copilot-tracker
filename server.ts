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
   * Per the official Copilot Usage Metrics API (apiVersion 2026-03-10):
   *   https://docs.github.com/en/rest/copilot/copilot-metrics
   *   https://docs.github.com/en/rest/copilot/copilot-usage-metrics
   *
   * There is NO per-user endpoint — usage metrics are only exposed at the
   * organization or enterprise level. Strategy:
   *
   *   1. Fetch the user's orgs.
   *   2. For each org, call GET /orgs/{org}/copilot/metrics with ISO 8601
   *      timestamps. Requires `read:org` or `manage_billing:copilot`.
   *   3. Aggregate per-day engagement counters across orgs (these are the
   *      closest available proxy for "premium request" activity since the
   *      public API does not expose per-user premium-request counts).
   *   4. Return [] if the policy is disabled (422) or the user has no orgs.
   *
   * Response shape (normalized for the client):
   *   [{ date, total_completions, total_chat_turns, total_premium_requests, source }]
   */
  app.get('/api/user/copilot-usage-metrics', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { since, until } = req.query as { since?: string; until?: string };
    // The official API requires ISO 8601 timestamps (YYYY-MM-DDTHH:MM:SSZ),
    // not plain dates — that mismatch was the source of the previous 404.
    const params: Record<string, string> = {};
    if (since) params.since = `${since}T00:00:00Z`;
    if (until) params.until = `${until}T23:59:59Z`;

    const ghHeaders = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    };

    let orgs: any[] = [];
    try {
      const orgsRes = await axios.get('https://api.github.com/user/orgs', { headers: ghHeaders });
      orgs = orgsRes.data;
    } catch (err: any) {
      console.error('Failed to fetch user orgs:', err.response?.status);
    }

    if (orgs.length === 0) {
      return res.json({
        days: [],
        message: 'No organizations found. The Copilot Usage Metrics API is only available at the organization or enterprise level.',
        scope: 'individual',
      });
    }

    // Aggregate per-day metrics across all accessible orgs
    const merged: Record<string, {
      date: string;
      total_completions: number;
      total_chat_turns: number;
      total_premium_requests: number;
      total_active_users: number;
      sources: string[];
    }> = {};

    let anySuccess = false;
    let policyDisabled = false;

    for (const org of orgs) {
      try {
        const orgMetrics = await axios.get(
          `https://api.github.com/orgs/${org.login}/copilot/metrics`,
          { headers: ghHeaders, params }
        );

        anySuccess = true;
        const days: any[] = orgMetrics.data ?? [];

        for (const day of days) {
          const date: string = day.date;
          if (!merged[date]) {
            merged[date] = {
              date,
              total_completions: 0,
              total_chat_turns: 0,
              total_premium_requests: 0,
              total_active_users: day.total_active_users ?? 0,
              sources: [],
            };
          }

          // Sum code-completion engagement (per-language counts under editors[].models[].languages)
          const ideCompl = day.copilot_ide_code_completions;
          if (ideCompl?.editors) {
            for (const editor of ideCompl.editors) {
              for (const model of editor.models ?? []) {
                for (const lang of model.languages ?? []) {
                  merged[date].total_completions += lang.total_code_acceptances
                    ?? lang.total_code_suggestions
                    ?? 0;
                }
              }
            }
          }

          // Sum chat turns from IDE chat + dotcom chat
          const ideChat = day.copilot_ide_chat;
          if (ideChat?.editors) {
            for (const editor of ideChat.editors) {
              for (const model of editor.models ?? []) {
                merged[date].total_chat_turns += model.total_chats ?? 0;
              }
            }
          }
          const dotChat = day.copilot_dotcom_chat;
          if (dotChat?.models) {
            for (const model of dotChat.models) {
              merged[date].total_chat_turns += model.total_chats ?? 0;
            }
          }

          // Premium-request proxy: sum of premium-model chat turns + PR summaries.
          // The public API does not expose raw premium-request counts, so we
          // infer them from non-base-model chat events + PR generation.
          const dotPR = day.copilot_dotcom_pull_requests;
          let premiumProxy = 0;
          if (ideChat?.editors) {
            for (const editor of ideChat.editors) {
              for (const model of editor.models ?? []) {
                // base/free models (e.g. gpt-4o-mini, gpt-3.5) don't count toward premium quota
                const isBase = /mini|3\.5|free/i.test(model.name ?? '');
                if (!isBase) premiumProxy += model.total_chats ?? 0;
              }
            }
          }
          if (dotChat?.models) {
            for (const model of dotChat.models) {
              const isBase = /mini|3\.5|free/i.test(model.name ?? '');
              if (!isBase) premiumProxy += model.total_chats ?? 0;
            }
          }
          if (dotPR?.repositories) {
            for (const repo of dotPR.repositories) {
              for (const model of repo.models ?? []) {
                premiumProxy += model.total_pr_summaries_created ?? 0;
              }
            }
          }
          merged[date].total_premium_requests += premiumProxy;
          merged[date].sources.push(org.login);
        }
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 422) {
          policyDisabled = true;
        } else if (status !== 403 && status !== 404) {
          console.error(`Org metrics error for ${org.login}:`, status, err.response?.data?.message);
        }
        // Silently skip 403/404 (no access to this org's metrics)
      }
    }

    return res.json({
      days: Object.values(merged).sort((a, b) => a.date.localeCompare(b.date)),
      scope: 'organization',
      orgs_checked: orgs.length,
      orgs_with_data: Object.values(merged).flatMap(d => d.sources).filter((v, i, a) => a.indexOf(v) === i),
      message: !anySuccess
        ? policyDisabled
          ? 'Copilot Usage Metrics policy is disabled at the organization level (HTTP 422).'
          : 'No organization metrics accessible. Token needs read:org or manage_billing:copilot scope, and the org must enable the Copilot Usage Metrics policy.'
        : undefined,
    });
  });

  /**
   * GET /api/user/copilot-quota
   *
   * Strategy:
   *   1. Use GET /user/copilot for plan_type → derive monthly premium limit.
   *   2. Live usage counter is no longer publicly exposed; client must derive
   *      it from /api/user/copilot-usage-metrics aggregation.
   *
   * Response: { quota: { premium_requests: { limit, usage } }, plan_type }
   *   `usage` will be 0 here — the client computes it from the metrics endpoint.
   */
  app.get('/api/user/copilot-quota', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const ghHeaders = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
    };

    let limit = 300;
    let planType = 'unknown';

    try {
      const copilotRes = await axios.get('https://api.github.com/user/copilot', { headers: ghHeaders });
      planType = copilotRes.data.plan_type ?? copilotRes.data.copilot_plan ?? 'unknown';
      limit = PLAN_LIMITS[planType] ?? 300;
    } catch (err: any) {
      // 404 → individual user without /user/copilot access; default to Pro limits
      if (err.response?.status !== 404) {
        console.error('GET /user/copilot error:', err.response?.status);
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
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
      });
      res.json(r.data);
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
