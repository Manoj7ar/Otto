# Otto: AI for Your Physical World

Otto is a mobile-first AI concierge that can research the web, decide when a real phone call is the better tool, call a business from the cloud, and call the user back with a spoken result.

It is designed for questions that need a real-world answer, not just another list of links.

<p align="center">
  <img src="public/otter-readme.png" alt="Otto otter mark" width="300" />
</p>

## What Otto Does

- Chat with text, voice, and camera input
- Research live information with Firecrawl-backed evidence
- Suggest when Otto should call a business to verify details
- Run cloud phone calls through Twilio
- Speak with ElevenLabs in-app, on the business call, and on the callback
- Save task history, transcripts, approvals, and runtime logs in Supabase
- Install to the home screen as a mobile web app for cleaner demos

Typical use cases:

- restaurant and cafe checks
- reservation and availability verification
- hotel and local place questions
- image-led follow-ups about places or menus
- any task where a business may give new information live on the call

## Product Flow

### 1. In-app answer

1. The user sends text, voice, or an image-backed question.
2. `otto-analyze` interprets the turn with Gemini.
3. Firecrawl runs when live external information matters.
4. Otto returns an answer, source cards, follow-ups, and optional call suggestions.
5. `otto-voice` generates Otto’s spoken reply.

### 2. Cloud call

1. The user approves a call.
2. `otto-call-task` creates the task and ordered steps.
3. Twilio places the business call.
4. `otto-call-webhook` runs the live conversation turn by turn.
5. Otto stores the transcript, learned facts, and runtime diagnostics.
6. Otto calls the user back with a spoken summary.

## Stack

- `React` + `TypeScript` + `Vite`
- `Supabase` for auth, profiles, tasks, approvals, and edge functions
- `Gemini` for reasoning and call-turn planning
- `Firecrawl` for live retrieval and evidence
- `ElevenLabs` for Otto’s voice
- `Twilio` for business calls and callbacks
- `Framer Motion` for UI motion

## Frontend

Main app:

- `src/app/App.tsx`

Main Otto experience:

- `src/features/otto/screens/OttoPage.tsx`

Recent frontend highlights:

- tighter mobile chat UI
- simplified thinking state with dots only
- cleaner mobile message layout
- one-time install prompt for Android and iPhone home-screen installs
- otter-based app icon assets and web-app manifest

## Cloud Functions

- `supabase/functions/otto-analyze`
  - turn analysis, retrieval decisions, call proposals
- `supabase/functions/otto-voice`
  - ElevenLabs voice generation for app, call, and callback
- `supabase/functions/otto-call-task`
  - creates and starts cloud call tasks
- `supabase/functions/otto-call-webhook`
  - Twilio webhook runtime for business calls and callbacks
- `supabase/functions/_shared/otto-concierge.ts`
  - shared task engine, task chain execution, summaries, runtime logging

## Cloud Call Behavior

Otto’s business-call runtime is designed to be grounded and conversational:

- starts with a short introduction
- asks one small question at a time
- answers follow-up questions only from known task or user context
- avoids hallucinating missing details
- keeps a running conversation log
- stores structured runtime events for Twilio, webhook, Gemini, planner, and voice failures
- tracks whether the final closing line was actually served before treating it as delivered

## Installable Mobile App

Otto ships as an installable mobile web app.

- Android: custom one-time prompt that triggers the native install flow when supported
- iPhone Safari: one-time “Add to Home Screen” guidance
- prompt is hidden once dismissed or once the app is already installed

Relevant files:

- `src/features/install/useInstallPrompt.ts`
- `src/features/install/components/InstallPrompt.tsx`
- `public/manifest.webmanifest`
- `public/sw.js`

## Environment

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `FIRECRAWL_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_MODEL_ID`
- `ELEVENLABS_APP_VOICE_ID`
- `ELEVENLABS_CALL_VOICE_ID`
- `ELEVENLABS_CALLBACK_VOICE_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `OTTO_WEBHOOK_SECRET`
- `OTTO_CALLBACK_DELAY_MS`

## Local Development

Install:

```bash
npm install
```

Run:

```bash
npm run dev
```

Checks:

```bash
npm test
npm run lint
npm run build
```

## Supabase Notes

This project expects the call-related edge functions to handle auth inside the function or via webhook tokens. For this setup, the deployed call functions should use `--no-verify-jwt` so Twilio webhooks are not blocked at the edge gateway.

## Why Otto Is Different

Otto is not just chat, not just retrieval, and not just a phone bot.

It combines:

- live evidence
- conversational reasoning
- voice identity
- cloud execution
- real task completion

That is what makes it useful for demos and believable as a product.
