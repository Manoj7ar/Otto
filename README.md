# Otto AI Navigator

Otto is a mobile-first web app for live visual guidance. Point your phone at the world, ask by voice or text, and Otto uses Gemini plus Firecrawl to answer with session memory and source-backed follow-ups.

## Project structure

- `src/app`: app shell and entrypoint wiring
- `src/features/otto`: the main Otto product feature, grouped by API, components, hooks, screens, session helpers, and types
- `src/shared/supabase`: Supabase client setup and generated database types
- `supabase/functions/otto-analyze`: backend orchestration for Gemini vision/reasoning and Firecrawl retrieval

## Environment variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase Edge Function secrets:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` optional, defaults to `gemini-2.5-flash`
- `FIRECRAWL_API_KEY` optional but recommended for source-backed answers

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
