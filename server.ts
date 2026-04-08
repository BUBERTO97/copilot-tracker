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
