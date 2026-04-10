// Run this with: node get-google-token.js
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manually load .env
const envPath = path.resolve(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [key, ...rest] = trimmed.split('=');
  env[key.trim()] = rest.join('=').trim();
}

const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3001/auth/google/callback';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify')}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n✅ Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n⏳ Waiting for Google to redirect back...\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3001');
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('No code found.');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();

    if (tokens.refresh_token) {
      console.log('\n🎉 SUCCESS! Your refresh token is:\n');
      console.log(tokens.refresh_token);
      console.log('\n👉 Copy that token and paste it into your .env file as GOOGLE_REFRESH_TOKEN=\n');
      res.end('<h1>✅ Success! Go back to your terminal and copy the refresh token.</h1>');
    } else {
      console.log('\n❌ No refresh token received. Full response:');
      console.log(JSON.stringify(tokens, null, 2));
      res.end('<h1>❌ Error - check your terminal</h1>');
    }

    server.close();
  } catch (err) {
    console.error('Error getting token:', err.message);
    res.end('Error: ' + err.message);
    server.close();
  }
});

server.listen(3001, () => {
  console.log('Listening on http://localhost:3001...');
});
