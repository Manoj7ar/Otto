# Otto AI Navigator

Otto is a mobile-first cloud assistant for live visual guidance, business verification, and booking support. Point your phone at the world, ask by voice or text, and Otto uses Gemini for vision/orchestration, Firecrawl for web retrieval, Supabase for auth and persistent profile/task data, and ElevenLabs plus Twilio for spoken cloud call workflows.

## Project structure

- `src/app`: authenticated app shell, onboarding gate, and tabbed navigation
- `src/features/auth`: magic-link sign-in
- `src/features/onboarding`: first-run profile capture
- `src/features/account`: persistent profile/preferences editing
- `src/features/tasks`: cloud task history
- `src/features/otto`: the main Otto assistant experience, grouped by API, components, hooks, session helpers, and types
- `src/shared/supabase`: Supabase client setup and generated database types
- `supabase/functions/otto-analyze`: authenticated Gemini + Firecrawl turn orchestration
- `supabase/functions/otto-call-task`: approved task creation and Twilio launch
- `supabase/functions/otto-call-webhook`: Twilio webhook for business call turns and callbacks
- `supabase/functions/otto-voice`: ElevenLabs speech for the app and cloud calls
- `supabase/migrations`: database schema for profiles and cloud tasks

## Environment variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase SQL:

- run the migration in `supabase/migrations/202603210001_phase4_cloud_agent.sql`

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
