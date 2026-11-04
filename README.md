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

The Vercel API stores orders, payment settings, and notification settings in Upstash Redis because serverless function filesystems are temporary. In the Vercel project, create and link an Upstash Redis database from **Storage**. Make sure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` and `KV_REST_API_TOKEN`) are available in the project environment variables.

Set `STUDIO_ADMIN_PIN` to a long, unique secret in the hosting provider's environment settings. Do not put the PIN in source code, browser storage, or a URL. Studio verifies the PIN with the server and keeps it in the current browser tab's session storage; use **Lock Studio** when finished. The payment settings update API and other Studio APIs require this server-verified PIN. Read-only payment destination settings remain public because customers need them to complete a bank transfer. Rotate the environment variable and redeploy if the PIN is exposed.

Order tracking requires the complete, randomly generated order reference and returns only tracking and delivery-summary fields, not customer contact information, address, notes, or item details. Public ntfy alerts contain no identifying order or inquiry details; use Studio to review them. If an earlier ntfy topic was used for customer details, rotate that topic and remove its old messages where possible.

PayMongo QR Ph is disabled by default, and its webhook endpoint is not deployed. Do not enable `PAYMONGO_QRPH_ENABLED` until the client integration is ready and the webhook function has been restored to the Vercel API routes. At that time, set the explicit flag to `true` and configure `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, and `PAYMONGO_WEBHOOK_SECRET` server-side. Never put a PayMongo secret or webhook key in browser code or commit it. Register `https://your-domain/api/payments/paymongo/webhook` in PayMongo only after the endpoint is restored. Test with PayMongo test keys before switching to live keys.

Checkout uses Leaflet with OpenStreetMap map tiles, Nominatim for explicitly requested address searches, and the public OSRM demo router to compare driving distances from both dispatch offices. No Google Maps key or map-service billing account is needed. The checkout shows required OpenStreetMap attribution. Nominatim searches are user-triggered (not typeahead), cached in Redis for an hour, and coordinated through a shared one-request-per-second limiter. These community-hosted services are best-effort, not guaranteed or suitable for high-volume production; they may rate-limit or change access. Search text and selected map coordinates are sent to those providers, so customers should not include their name or private delivery details in the search. For heavier usage, host the services yourself or choose a provider with an appropriate service agreement.

Delivery is priced using the supplied J&T weight-and-destination rate card. Each 40 ml or 50 ml bottle is estimated at 500 g packed; multiple bottles add together. The nearest dispatch point is selected automatically between Brgy. Bulilan Norte, Pila, Laguna and Calamba City Hall, Calamba, Laguna. Driving distance selects the office only; the J&T destination zone and packed weight determine the delivery fee.

| Packed weight | Luzon | Manila (NCR) | Visayas | Mindanao | Island |
| --- | ---: | ---: | ---: | ---: | ---: |
| Up to 500 g | ₱85 | ₱95 | ₱100 | ₱105 | ₱115 |
| Over 500 g–1 kg | ₱155 | ₱165 | ₱180 | ₱195 | ₱205 |
| Over 1–3 kg | ₱180 | ₱190 | ₱200 | ₱220 | ₱230 |
| Over 3–4 kg | ₱270 | ₱280 | ₱300 | ₱330 | ₱340 |
| Over 4–5 kg | ₱360 | ₱370 | ₱400 | ₱440 | ₱450 |
| Over 5–6 kg | ₱455 | ₱465 | ₱500 | ₱550 | ₱560 |

Orders with a bottle subtotal above ₱1,500 receive free bottle delivery. Starter Kits are excluded from bottle weight and that free-delivery threshold; their shipping is confirmed manually. Shipments over 6 kg, unmapped destinations, and Starter Kits are accepted as orders but show a provisional item subtotal until the concierge confirms shipping. QR Ph is unavailable until shipping charges can be finalized. Update `JNT_ISLAND_PROVINCES` in `lib/delivery.js` to adjust which provinces use the Island column. Set `DELIVERY_QUOTE_SECRET` to a dedicated secret of at least 32 characters; if omitted, the existing `STUDIO_ADMIN_PIN` is used to sign short-lived delivery quotes.

The admin dashboard remains available through Studio Mode (press **Ctrl + Shift + A** or open the site with `?studio=true` to show its PIN prompt). A separate or hard-to-guess link may make the dashboard less obvious, but it is not an access control; the server-side PIN check is what protects dashboard data and payment-setting changes.

Notification channels such as Telegram, Semaphore, Twilio, and webhooks are configured in Studio Mode after the deployment is connected to Redis.

For ntfy order alerts, subscribe to the same topic in the ntfy app and enter either the topic name or its `https://ntfy.sh/<topic>` URL in Studio Mode. Use **Send Test Alert** to verify delivery.

For sharing the catalog in Messenger or Discord, use `https://shop-driftco.vercel.app/share-v2/`. This page has social preview metadata and redirects visitors to the catalog. Its share image is a clean 1200×630 JPEG for chat-app link previews.

## Google Search indexing

The production build generates a crawlable page for every product in `public/js/catalog-data.js`, six fragrance-family collection pages, seven reviewed fragrance-journal articles, a perfume-reseller business page, matching Product/Offer and collection/article structured data, and an XML sitemap. Product routes include pages such as `/products/baccarat-rouge-inspired-perfume/` and `/products/polo-sport-inspired-perfume/`; the partner page is `/pages/perfume-reseller-philippines/`. The build also refreshes `public/sitemap.xml` from the catalog.

After deploying to `https://shop-driftco.vercel.app/`:

1. Open [Google Search Console](https://search.google.com/search-console) and add the `shop-driftco.vercel.app` Domain property.
2. Verify ownership by adding the DNS TXT record Google provides to the domain's DNS host.
3. In Search Console, open **Sitemaps** and submit `https://shop-driftco.vercel.app/sitemap.xml`.
4. Use **URL Inspection** to test the homepage and a product URL, then request indexing if Google reports the pages are available.

The site publishes an indexable `robots.txt` sitemap reference and a branded 404 page; unknown routes are no longer rewritten to the homepage. Crawling, rich-result eligibility, and indexing are controlled by Google and are not guaranteed or immediate. Validate structured data with Google's Rich Results Test after deployment.
