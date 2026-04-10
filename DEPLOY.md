# Deploy Aria Assistant

## Quick Remote Access (ngrok - temporary)

1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   ```

2. **Sign up for ngrok account** at https://ngrok.com and get your authtoken

3. **Set your authtoken:**
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

4. **Start your servers:**
   ```bash
   # Terminal 1 - Backend
   npm run server:dev

   # Terminal 2 - Frontend
   npm run client:dev
   ```

5. **Create tunnel:**
   ```bash
   # Terminal 3
   ngrok http 3001
   ```

6. **Use the ngrok URL** from the output (e.g., `https://abc123.ngrok.io`)

## Permanent Deployment

### Backend (Railway)

1. **Deploy backend:**
   ```bash
   cd server
   railway login
   railway init
   railway up
   ```

2. **Get the backend URL** from Railway dashboard

### Frontend (Vercel)

1. **Update vercel.json** with your backend URL:
   ```json
   {
     "env": {
       "VITE_API_BASE": "https://your-railway-backend-url"
     }
   }
   ```

2. **Deploy frontend:**
   ```bash
   vercel --prod
   ```

## Environment Variables

Make sure to set these in your deployment platform:

- `VITE_ANTHROPIC_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_TO_NUMBER`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN` (or `GOOGLE_ACCOUNTS`)

## Mobile Access

Once deployed, you can access Aria from anywhere:
- **Phone:** Open the Vercel URL in mobile browser
- **Car:** Use mobile hotspot or public WiFi
- **Anywhere:** As long as you have internet connection