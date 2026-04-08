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
      scope: 'read:user,user:email', // Basic scopes, Copilot API might need more or specific ones
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

      // GitHub Copilot API endpoint (requires specific permissions/scopes)
      // For now, we'll try to fetch it, but handle failure gracefully
      // Documentation: https://docs.github.com/en/rest/copilot/copilot-user-details
      try {
        const copilotRes = await axios.get('https://api.github.com/user/copilot', {
          headers: { 
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json'
          }
        });
        res.json({
          user: userRes.data,
          copilot: copilotRes.data
        });
      } catch (copilotErr) {
        // If /user/copilot fails, maybe they don't have it or scope is missing
        res.json({
          user: userRes.data,
          copilot: null,
          message: 'Could not fetch Copilot details. Ensure you have an active subscription and the app has correct scopes.'
        });
      }
    } catch (error) {
      console.error('GitHub API Error:', error);
      res.status(500).json({ error: 'Failed to fetch GitHub data' });
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
    const distPath = path.join(process.cwd(), 'dist');
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
