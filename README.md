# Otto AI Navigator

Otto is a mobile-first cloud assistant for live visual guidance, Firecrawl-first research, business verification, and callback-driven cloud calls. Point your phone at the world, ask by voice or text, and Otto uses Gemini for vision/orchestration, Firecrawl for retrieval, Supabase for auth and persistent task data, and ElevenLabs plus Twilio for business calls and callback briefings.

## Project structure

- `src/app`: authenticated app shell, onboarding gate, and tabbed navigation
- `src/features/auth`: magic-link sign-in
- `src/features/onboarding`: first-run profile capture
- `src/features/account`: persistent profile/preferences editing
- `src/features/tasks`: concierge inbox, approvals, and job history
- `src/features/otto`: the main Otto assistant experience, grouped by API, components, hooks, session helpers, and types
- `src/shared/supabase`: Supabase client setup and generated database types
- `supabase/functions/otto-analyze`: authenticated Gemini + Firecrawl turn orchestration with call proposals
- `supabase/functions/otto-call-task`: Firecrawl-backed cloud call task creation and step execution
- `supabase/functions/otto-call-webhook`: Twilio webhook for business calls and user callback briefings
- `supabase/functions/otto-task-approval`: approval resolution for pending job actions
- `supabase/functions/otto-voice`: ElevenLabs speech for the app and cloud calls
- `supabase/functions/_shared/otto-concierge.ts`: shared task orchestration, SMTP email dispatch, and Twilio helpers
- `supabase/migrations`: database schema for profiles, concierge jobs, approvals, and emails

## Environment variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase SQL:

- run:
  - `supabase/migrations/202603210001_phase4_cloud_agent.sql`
  - `supabase/migrations/202603210002_concierge_inbox_email.sql`
  - `supabase/migrations/202603210003_callback_step_phase6.sql`

Supabase Edge Function secrets:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` optional, defaults to `gemini-2.5-flash`
- `FIRECRAWL_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_MODEL_ID` optional, defaults to `eleven_multilingual_v2`
- `ELEVENLABS_APP_VOICE_ID`
- `ELEVENLABS_CALL_VOICE_ID`
- `ELEVENLABS_CALLBACK_VOICE_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `OTTO_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_NAME`
- `SMTP_FROM_EMAIL`

Callback phone:

- A user callback phone number is required in onboarding/account settings before Otto can start cloud calls.
- If SMTP is not configured, email follow-up is treated as optional and is skipped without breaking the callback flow.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm test
npm run lint
```

`deno check` is recommended for the edge functions, but Deno must be installed locally first.

## Product rules

- Firecrawl is the only retrieval/search layer.
- Gemini is the orchestration and planning layer.
- ElevenLabs plus Twilio handle voice output and telephony.
- There is no browser automation in this product.
