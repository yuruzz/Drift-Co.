<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ded9c528-b4f3-445c-8dd5-abd98202979e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploying on Vercel

The Vercel API stores orders and notification settings in Upstash Redis because serverless function filesystems are temporary. In the Vercel project, create and link an Upstash Redis database from **Storage**. Make sure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` and `KV_REST_API_TOKEN`) are available in the project environment variables. Also set `STUDIO_ADMIN_PIN` to the PIN used to unlock Studio Mode; this protects stored notification credentials and customer order details. Use the same PIN in Studio Mode, then redeploy. Without these variables, the API returns a configuration error instead of silently discarding settings or orders.

Notification channels such as Telegram, Semaphore, Twilio, and webhooks are configured in Studio Mode after the deployment is connected to Redis.
