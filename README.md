# 🎬 StudioX Backend Architecture

Welcome to the StudioX backend repository. This backend powers the StudioX application, providing everything from AI model orchestration and token-based billing to community features and secure media storage.

## 🚀 Tech Stack
- **Environment**: Firebase Functions v2, Node.js 24
- **Database**: Firebase Firestore
- **Storage**: Firebase Cloud Storage
- **Authentication**: Firebase Authentication (with Identity triggers)
- **Secrets Management**: Google Cloud Secret Manager (`defineSecret`)
- **Key External APIs**: Poyo API (AI Generation), Stripe API (Billing)
- **Language**: TypeScript

## 📁 Directory Structure
`functions/src/`
- `auth/` - Triggers for new user signups, handling initial token drops setup.
- `billing/` - Stripe integration: creating checkout sessions and handling secure webhooks.
- `community/` - API endpoints for social features (Publish, Like, Comment, Remix, Delete).
- `creations/` - API endpoints for fetching and managing private user creations.
- `studio/` - The core AI generation engine. Sends jobs to Poyo, manages job states, downloads media to Firebase Storage natively.
- `tokens/` - Internal transactional functions for securely deducting and adding tokens using Firestore transactions.
- `utils/` - Shared admin SDK initialization and custom error handling classes.

## 🔌 API Endpoints
All main endpoints are implemented as Firebase **HTTPS Callable** (`onCall`) functions, which automatically handle JWT validation and CORS natively from your frontend.

### 🎥 Studio Generation (`/src/studio`)
- `createStudioJob`: Main endpoint to initiate an AI generation job (video/image) via Poyo API. Deducts tokens transactionally upfront.
- `getJobStatus`: Polls the status of an active job. When Poyo finishes, this function securely saves the generated media from Poyo's temporary URLs to your secure Firebase Storage bucket.

### 🏦 Token & User State
- `getUserBalance`: Fetches the current token balance and subscription plan of the user. *(Note: Next.js Frontend should ideally use `onSnapshot` for real-time updates over calling this manually)*.
- `onUserCreated`: An internal `beforeUserCreated` Identity trigger that automatically provisions a new user's Firestore document and drops a 200 token welcome bonus securely before their first dashboard load.

### 🖼 Private Creations (`/src/creations`)
- `getUserCreations`: Retrieves a paginated list of the user's private media generations.
- `deleteCreation`: Securely deletes a private creation document and its associated massive media files from Cloud Storage entirely.

### 👥 Community Features (`/src/community`)
- `publishPost`: Moves a private creation into the public community feed.
- `likePost`: Toggles a like on a community post. Operates via deterministic IDs (`postId_userId`) for easy highly-responsive frontend React components.
- `commentPost`: Adds a text comment to a specific post.
- `remixPost`: Duplicates the generation parameters of a public post into a new session for the current authenticated user.
- `deletePost`: Removes a user's published post from the public feed globally.

### 💳 Stripe Billing (`/src/billing`)
- `createCheckoutSession`: Generates a Stripe checkout URL for purchasing token bundles natively connected to user auth mappings.
- `stripeWebhook`: An `onRequest` endpoint that Stripe calls directly upon payment success to credit the user's account transactionally via ledger.

## 🔑 Environment Secrets
The project strictly enforces Google Cloud Secret Manager instead of global `.env` scope initializations in production to maintain strict security compliance.

| Secret Name | Purpose |
| ----------- | ------- |
| `POYO_API_KEY` | Bearer token for submitting rendering jobs to Poyo.ai |
| `STRIPE_SECRET_KEY` | Secret key for Stripe backend SDK initialization |
| `STRIPE_WEBHOOK_SECRET` | Cryptographic signing secret for validating Stripe webhook payloads |

*(To set a secret during deployment, use the Firebase CLI: `firebase functions:secrets:set SECRET_NAME`)*

## 🛠️ Local Development & Deployment

### Setup
```bash
cd functions
npm install
```

### Local Emulator
A `.env.example` file is provided. Copy it to `.env` to define your local keys.
```bash
npm run serve
```

### Deployment
To deploy all functions statically to Google Cloud:
```bash
npm run deploy
```
*Note: Built dynamically with `setGlobalOptions({ maxInstances: 2, concurrency: 80, memory: "256MiB", cpu: 1 })` in `index.ts` to ensure flawless deployment within quotas and bypassing concurrent CPU lockouts.*

## 💡 Frontend Integration
When hitting `onCall` functions from Next.js/React, you **must use the Firebase Client SDK** (`httpsCallable`), not raw `fetch`. The SDK handles securely attaching the user's `Bearer $FIREBASE_ID_TOKEN` natively under the hood. For detailed code examples on implementing deterministic persistence, Stripe, and generation polling cleanly, refer to the frontend integration manuals.
