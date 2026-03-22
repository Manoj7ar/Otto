import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-otto-auth, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SESSION_TURNS = 8;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

type ConfidenceLevel = "low" | "medium" | "high";
type SearchMode = "none" | "search";
type ActionType = "source" | "search" | "directions";
type IntentKind = "answer" | "call_verification" | "call_booking";
type FollowUpAction = "callback_user";

interface AnalyzeRequest {
  query?: string;
  imageBase64?: string;
  sessionContext?: unknown;
}

interface ProfileRow {
  full_name: string | null;
  home_location: string;
  current_region: string;
  language_code: string;
  timezone: string;
  travel_mode: string;
  callback_phone: string | null;
  call_briefing_enabled: boolean;
  onboarding_completed_at: string | null;
}

interface Interpretation {
  subject: string;
  subjectType: string;
  visualDescription: string;
  userIntent: string;
  confidence: ConfidenceLevel;
  needsWebSearch: boolean;
  searchMode: SearchMode;
  searchQuery: string;
  detailHints: string[];
  intentKind: IntentKind;
  targetBusinessHint: string;
}

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
  content: string;
  imageUrl?: string;
  siteName?: string;
  domain?: string;
  meta?: {
    rating?: string;
    reviewCount?: string;
    priceLabel?: string;
    address?: string;
    availabilityText?: string;
  };
}

interface StructuredDetail {
  label: string;
  value: string;
}

interface OttoAction {
  label: string;
  url: string | null;
  type: ActionType;
}

interface OttoCallProposal {
  callType: "verification" | "booking";
  title: string;
  summary: string;
  callReason: string;
  callTargetName: string;
  callTargetPhone: string;
  callTargetEmail: string | null;
  firecrawlEvidence: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
  }>;
  callQuestions: string[];
  followUpActions: FollowUpAction[];
}

interface OttoReply {
  messageId: string;
  createdAt: string;
  subject: string;
  subjectType: string;
  answer: string;
  confidence: ConfidenceLevel;
  usedVision: boolean;
  usedWebSearch: boolean;
  suggestedFollowUps: string[];
  actions: OttoAction[];
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    imageUrl?: string;
    siteName?: string;
    domain?: string;
    meta?: {
      rating?: string;
      reviewCount?: string;
      priceLabel?: string;
      address?: string;
      availabilityText?: string;
    };
  }>;
  structuredDetails: StructuredDetail[];
  callProposal: OttoCallProposal | null;
}

interface OttoUserTurn {
  id: string;
  role: "user";
  content: string;
  createdAt: string;
  usedVision: boolean;
}

interface OttoAssistantTurn {
  id: string;
  role: "assistant";
  content: string;
  createdAt: string;
  usedVision: boolean;
  usedWebSearch: boolean;
  reply: OttoReply;
}

type OttoConversationTurn = OttoUserTurn | OttoAssistantTurn;

interface OttoSessionContext {
  sessionId: string;
  activeSubject: string | null;
  activeSubjectType: string | null;
  summary: string;
  turns: OttoConversationTurn[];
}

interface OttoTurnResponse {
  reply: OttoReply;
  sessionContext: OttoSessionContext;
  sessionStatus: "active";
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const interpretationSchema = {
  type: "OBJECT",
  properties: {
    subject: { type: "STRING" },
    subjectType: { type: "STRING" },
    visualDescription: { type: "STRING" },
    userIntent: { type: "STRING" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    needsWebSearch: { type: "BOOLEAN" },
    searchMode: { type: "STRING", enum: ["none", "search"] },
    searchQuery: { type: "STRING" },
    detailHints: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    intentKind: { type: "STRING", enum: ["answer", "call_verification", "call_booking"] },
    targetBusinessHint: { type: "STRING" },
  },
  required: [
    "subject",
    "subjectType",
    "visualDescription",
    "userIntent",
    "confidence",
    "needsWebSearch",
    "searchMode",
    "searchQuery",
    "detailHints",
    "intentKind",
    "targetBusinessHint",
  ],
};

const synthesisSchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    structuredDetails: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          value: { type: "STRING" },
        },
        required: ["label", "value"],
      },
    },
    suggestedFollowUps: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    sessionSummary: { type: "STRING" },
    callProposal: {
      type: "OBJECT",
      properties: {
        callType: { type: "STRING", enum: ["verification", "booking"] },
        title: { type: "STRING" },
        summary: { type: "STRING" },
        callReason: { type: "STRING" },
        callTargetName: { type: "STRING" },
        callTargetPhone: { type: "STRING" },
        callTargetEmail: { type: "STRING" },
        callQuestions: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
        followUpActions: {
          type: "ARRAY",
          items: { type: "STRING", enum: ["callback_user"] },
        },
      },
      required: [
        "callType",
        "title",
        "summary",
        "callReason",
        "callTargetName",
        "callTargetPhone",
        "callTargetEmail",
        "callQuestions",
        "followUpActions",
      ],
    },
  },
  required: ["answer", "structuredDetails", "suggestedFollowUps", "sessionSummary"],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === "low" || value === "medium" || value === "high";
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
}

function cleanStringArray(value: unknown, limit = 5): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function cleanBase64Image(imageBase64: string): string {
  return imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
}

function normalizePhone(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^\d+]/g, "");
  return normalized.length >= 7 ? normalized : null;
}

function shouldForceWebSearch(query: string) {
  return /(review|rating|hours|open|closed|menu|price|website|address|directions|buy|compare|history|book|reserve|availability|phone|call)/i
    .test(query);
}

function isHospitalityQuery(value: string) {
  return /(restaurant|restraunt|hotel|resort|inn|motel|hostel|cafe|café|bar|pub|bistro|diner|reservation|booking|book a table|table for|room|suite|check-in|check in|check-out|check out|stay)/i
    .test(value);
}

function shouldBiasCallIntent(query: string, usedVision: boolean, sessionContext: OttoSessionContext) {
  const combined = [query, sessionContext.activeSubject, sessionContext.summary].filter(Boolean).join(" ");

  if (isHospitalityQuery(combined)) {
    return true;
  }

  return usedVision;
}

function isConversationalTurn(query: string, usedVision: boolean) {
  if (usedVision) {
    return false;
  }

  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|thanks|thank you|thank you so much|cool|great|nice|awesome|perfect|ok|okay|alright|sounds good|got it|understood|that helps|that helped|love it|bye|goodbye|see you)$/i
    .test(normalized);
}

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeCallProposal(raw: unknown, sources: SearchSource[], profile: ProfileRow): OttoCallProposal | null {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;

  if (!data || sources.length === 0) {
    return null;
  }

  const callType =
    data.callType === "verification" || data.callType === "booking"
      ? data.callType
      : null;
  const title = cleanText(data.title);
  const summary = cleanText(data.summary);
  const callReason = cleanText(data.callReason);
  const callTargetName = cleanText(data.callTargetName);
  const callTargetPhone = normalizePhone(cleanText(data.callTargetPhone));
  const requestedFollowUps = cleanStringArray(data.followUpActions, 3)
    .filter((entry): entry is FollowUpAction => entry === "callback_user");
  const followUpActions = Array.from(
    new Set<FollowUpAction>([
      profile.callback_phone ? "callback_user" : requestedFollowUps[0] ?? "callback_user",
      ...requestedFollowUps,
    ]),
  );

  if (!callType || !title || !summary || !callReason || !callTargetName || !callTargetPhone) {
    return null;
  }

  return {
    callType,
    title,
    summary,
    callReason,
    callTargetName,
    callTargetPhone,
    callTargetEmail: cleanText(data.callTargetEmail) || null,
    firecrawlEvidence: sources.slice(0, 3).map(({ title, url, snippet, sourceType }) => ({
      title,
      url,
      snippet,
      sourceType,
    })),
    callQuestions: cleanStringArray(data.callQuestions, 6),
    followUpActions,
  };
}

function normalizeReply(raw: unknown): OttoReply | null {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const messageId = cleanText(data.messageId);
  const answer = cleanText(data.answer);

  if (!messageId || !answer) {
    return null;
  }

  const confidence = isConfidenceLevel(data.confidence) ? data.confidence : "medium";
  const sources = Array.isArray(data.sources)
    ? data.sources
      .map((entry) => {
        const source = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
        const title = cleanText(source.title);
        const url = cleanText(source.url);

        if (!title || !url) {
          return null;
        }

        return {
          title,
          url,
          snippet: cleanText(source.snippet),
          sourceType: cleanText(source.sourceType, "web"),
          imageUrl: cleanText(source.imageUrl) || undefined,
          siteName: cleanText(source.siteName) || undefined,
          domain: cleanText(source.domain) || undefined,
          meta: typeof source.meta === "object" && source.meta !== null
            ? {
              rating: cleanText((source.meta as Record<string, unknown>).rating) || undefined,
              reviewCount: cleanText((source.meta as Record<string, unknown>).reviewCount) || undefined,
              priceLabel: cleanText((source.meta as Record<string, unknown>).priceLabel) || undefined,
              address: cleanText((source.meta as Record<string, unknown>).address) || undefined,
              availabilityText: cleanText((source.meta as Record<string, unknown>).availabilityText) || undefined,
            }
            : undefined,
        };
      })
      .filter((entry): entry is OttoReply["sources"][number] => Boolean(entry))
    : [];
  const structuredDetails = Array.isArray(data.structuredDetails)
    ? data.structuredDetails
      .map((entry) => {
        const detail = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
        const label = cleanText(detail.label);
        const value = cleanText(detail.value);

        if (!label || !value) {
          return null;
        }

        return { label, value } satisfies StructuredDetail;
      })
      .filter((entry): entry is StructuredDetail => Boolean(entry))
    : [];
  const actions = Array.isArray(data.actions)
    ? data.actions
      .map((entry) => {
        const action = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
        const label = cleanText(action.label);

        if (!label) {
          return null;
        }

        const type = action.type === "source" || action.type === "search" || action.type === "directions"
          ? action.type
          : "source";

        return {
          label,
          url: cleanText(action.url) || null,
          type,
        } satisfies OttoAction;
      })
      .filter((entry): entry is OttoAction => Boolean(entry))
    : [];

  return {
    messageId,
    createdAt: cleanText(data.createdAt, new Date().toISOString()),
    subject: cleanText(data.subject, "Current subject"),
    subjectType: cleanText(data.subjectType, "general"),
    answer,
    confidence,
    usedVision: Boolean(data.usedVision),
    usedWebSearch: Boolean(data.usedWebSearch),
    suggestedFollowUps: cleanStringArray(data.suggestedFollowUps, 4),
    actions,
    sources,
    structuredDetails,
    callProposal: data.callProposal as OttoCallProposal | null,
  };
}

function normalizeTurn(raw: unknown): OttoConversationTurn | null {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const role = data.role === "assistant" ? "assistant" : data.role === "user" ? "user" : null;
  const content = cleanText(data.content);

  if (!role || !content) {
    return null;
  }

  if (role === "assistant") {
    const reply = normalizeReply(data.reply);

    if (!reply) {
      return null;
    }

    return {
      id: cleanText(data.id, reply.messageId),
      role,
      content,
      createdAt: cleanText(data.createdAt, reply.createdAt),
      usedVision: Boolean(data.usedVision ?? reply.usedVision),
      usedWebSearch: Boolean(data.usedWebSearch ?? reply.usedWebSearch),
      reply,
    };
  }

  return {
    id: cleanText(data.id, generateId("turn")),
    role,
    content,
    createdAt: cleanText(data.createdAt, new Date().toISOString()),
    usedVision: Boolean(data.usedVision),
  };
}

function normalizeSessionContext(raw: unknown): OttoSessionContext {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const turns = (Array.isArray(data.turns) ? data.turns : [])
    .map(normalizeTurn)
    .filter((turn): turn is OttoConversationTurn => Boolean(turn))
    .slice(-MAX_SESSION_TURNS);

  return {
    sessionId: cleanText(data.sessionId, generateId("session")),
    activeSubject: cleanText(data.activeSubject) || null,
    activeSubjectType: cleanText(data.activeSubjectType) || null,
    summary: cleanText(data.summary),
    turns,
  };
}

function formatTurnHistory(turns: OttoConversationTurn[]) {
  return turns
    .map((turn) => {
      const mode = turn.role === "assistant"
        ? `vision=${turn.usedVision ? "yes" : "no"}, web=${turn.usedWebSearch ? "yes" : "no"}`
        : `vision=${turn.usedVision ? "yes" : "no"}`;

      return `${turn.role.toUpperCase()} [${mode}]: ${turn.content}`;
    })
    .join("\n");
}

function buildProfileContext(profile: ProfileRow) {
  return {
    homeLocation: profile.home_location,
    currentRegion: profile.current_region,
    languageCode: profile.language_code,
    timezone: profile.timezone,
    travelMode: profile.travel_mode,
    callbackPhone: profile.callback_phone,
    callBriefingEnabled: true,
  };
}

function normalizeInterpretation(
  raw: unknown,
  fallbackQuery: string,
  usedVision: boolean,
  sessionContext: OttoSessionContext,
): Interpretation {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const fallbackSubject =
    sessionContext.activeSubject || fallbackQuery || (usedVision ? "observed subject" : "current request");
  const confidence = isConfidenceLevel(data.confidence) ? data.confidence : usedVision ? "medium" : "low";
  const searchQuery = cleanText(
    data.searchQuery,
    sessionContext.activeSubject && fallbackQuery
      ? `${sessionContext.activeSubject} ${fallbackQuery}`
      : fallbackQuery
  );
  const needsWebSearch =
    typeof data.needsWebSearch === "boolean"
      ? data.needsWebSearch
      : shouldForceWebSearch(fallbackQuery);
  const conversationalTurn = isConversationalTurn(fallbackQuery, usedVision);
  const callBias = shouldBiasCallIntent(fallbackQuery, usedVision, sessionContext);
  const searchMode =
    data.searchMode === "search" || data.searchMode === "none"
      ? data.searchMode
      : needsWebSearch || callBias
        ? "search"
        : "none";
  const intentKind = data.intentKind === "call_verification" || data.intentKind === "call_booking"
    ? data.intentKind
    : callBias
      ? "call_verification"
      : "answer";

  return {
    subject: cleanText(data.subject, fallbackSubject),
    subjectType: cleanText(data.subjectType, sessionContext.activeSubjectType || "general"),
    visualDescription: cleanText(
      data.visualDescription,
      usedVision ? "Otto captured the environment and interpreted the scene." : "No camera frame was provided."
    ),
    userIntent: cleanText(data.userIntent, fallbackQuery || "Continue helping with the current walk."),
    confidence,
    needsWebSearch: conversationalTurn ? false : needsWebSearch || shouldForceWebSearch(fallbackQuery) || callBias,
    searchMode: conversationalTurn ? "none" : (searchMode === "none" && callBias ? "search" : searchMode),
    searchQuery,
    detailHints: cleanStringArray(data.detailHints),
    intentKind,
    targetBusinessHint: cleanText(data.targetBusinessHint, sessionContext.activeSubject || fallbackSubject),
  };
}

function normalizeSources(raw: unknown): SearchSource[] {
  const candidates =
    typeof raw === "object" && raw !== null && "data" in raw
      ? (raw as Record<string, unknown>).data
      : raw;

  const rows = Array.isArray(candidates)
    ? candidates
    : typeof candidates === "object" && candidates !== null && Array.isArray((candidates as Record<string, unknown>).web)
      ? (candidates as Record<string, unknown>).web
      : [];

  return rows
    .map((row) => {
      const source = typeof row === "object" && row !== null ? row as Record<string, unknown> : {};
      const title = cleanText(source.title, cleanText(source.url, "Untitled source"));
      const url = cleanText(source.url);
      const snippet = cleanText(source.description, cleanText(source.markdown)).slice(0, 280);
      const content = cleanText(source.markdown, cleanText(source.description)).slice(0, 2200);

      if (!url) {
        return null;
      }

      return {
        title,
        url,
        snippet,
        sourceType: "web",
        content,
      } satisfies SearchSource;
    })
    .filter((entry): entry is SearchSource => Boolean(entry))
    .slice(0, 5);
}

function buildSearchPlanQuery(
  interpretation: Interpretation,
  query: string,
  sessionContext: OttoSessionContext,
  profile: ProfileRow,
) {
  const regionHint = [profile.current_region, profile.home_location].filter(Boolean).join(" ");

  if (interpretation.searchQuery) {
    return `${interpretation.searchQuery} ${regionHint}`.trim();
  }

  if (sessionContext.activeSubject && query) {
    return `${sessionContext.activeSubject} ${query} ${regionHint}`.trim();
  }

  if (query) {
    return `${query} ${regionHint}`.trim();
  }

  if (sessionContext.activeSubject) {
    return `${sessionContext.activeSubject} ${regionHint}`.trim();
  }

  return `${interpretation.subject} ${regionHint}`.trim();
}

function cleanDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanImageUrl(url: string, baseUrl: string) {
  if (!url) {
    return "";
  }

  try {
    const resolved = new URL(url, baseUrl);

    if (!/^https?:$/i.test(resolved.protocol)) {
      return "";
    }

    return resolved.toString();
  } catch {
    return "";
  }
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function readMetaTag(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedKey}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedKey}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(collapseWhitespace(match[1]));
    }
  }

  return "";
}

function extractPattern(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return collapseWhitespace(match[1]);
    }
  }

  return "";
}

function inferSourceMeta(source: SearchSource) {
  const text = collapseWhitespace(`${source.snippet} ${source.content}`);
  const rating = extractPattern(text, [
    /\b([0-5](?:\.\d)?)\s*(?:\/\s*5)?\s*(?:stars?|rating)\b/i,
  ]);
  const reviewCount = extractPattern(text, [
    /\b([\d,.]+\s*(?:reviews?|ratings?))\b/i,
  ]);
  const priceLabel = extractPattern(text, [
    /\b(price[:\s]+(?:[$€£]{1,4}|cheap|moderate|expensive|mid-range|budget)[^.,;]*)/i,
    /\b((?:[$€£]{1,4})\s*(?:per person|pp|for two)?)\b/i,
  ]);
  const address = extractPattern(text, [
    /\b(\d{1,5}[^.]{8,120}(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|square|sq|way|place|pl|parkway|pkwy)[^.]{0,80})/i,
  ]);
  const availabilityText = extractPattern(text, [
    /\b((?:in stock|out of stock|available now|limited stock|only \d+ left|sold out|open now|closed now))\b/i,
  ]);
  const meta = {
    rating: rating || undefined,
    reviewCount: reviewCount || undefined,
    priceLabel: priceLabel || undefined,
    address: address || undefined,
    availabilityText: availabilityText || undefined,
  };

  return Object.values(meta).some(Boolean) ? meta : undefined;
}

async function fetchPageMetadata(source: SearchSource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "OttoBot/1.0 (+https://otto.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return {};
    }

    const html = (await response.text()).slice(0, 120000);
    const imageUrl = cleanImageUrl(
      readMetaTag(html, "og:image") || readMetaTag(html, "twitter:image"),
      source.url,
    );
    const siteName =
      readMetaTag(html, "og:site_name") ||
      readMetaTag(html, "application-name") ||
      readMetaTag(html, "twitter:site");

    return {
      imageUrl: imageUrl || undefined,
      siteName: siteName || undefined,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichSource(source: SearchSource): Promise<SearchSource> {
  const metadata = await fetchPageMetadata(source);

  return {
    ...source,
    ...metadata,
    domain: cleanDomain(source.url) || undefined,
    meta: inferSourceMeta(source),
  };
}

async function enrichSources(sources: SearchSource[]) {
  const enriched = await Promise.allSettled(sources.map((source) => enrichSource(source)));

  return enriched.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      ...sources[index],
      domain: cleanDomain(sources[index].url) || undefined,
      meta: inferSourceMeta(sources[index]),
    };
  });
}

function dedupeSources(sources: SearchSource[]) {
  const seen = new Set<string>();

  return sources.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }

    seen.add(source.url);
    return true;
  });
}

function buildFirecrawlQueries(
  interpretation: Interpretation,
  searchQuery: string,
  profile: ProfileRow,
) {
  const queries = [searchQuery];

  if (interpretation.intentKind !== "answer") {
    queries.push(`${interpretation.targetBusinessHint || interpretation.subject} phone contact ${profile.current_region}`.trim());
    queries.push(`${interpretation.targetBusinessHint || interpretation.subject} official site phone ${profile.current_region}`.trim());
  }

  return Array.from(new Set(queries.filter(Boolean))).slice(0, 3);
}

function buildSourceActions(subject: string, searchQuery: string, sources: SearchSource[]): OttoAction[] {
  const actions: OttoAction[] = [];

  if (sources[0]?.url) {
    actions.push({
      label: "Open best source",
      url: sources[0].url,
      type: "source",
    });
  }

  if (searchQuery) {
    actions.push({
      label: "Search the web",
      url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
      type: "search",
    });
  }

  if (subject) {
    actions.push({
      label: "Get directions",
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(subject)}`,
      type: "directions",
    });
  }

  return actions.slice(0, 3);
}

function ensureCallPrompt(answer: string, proposal: OttoCallProposal | null) {
  if (!proposal) {
    return answer;
  }

  return /do you want me to make a call and check\?/i.test(answer)
    ? answer
    : `${answer} Do you want me to make a call and check?`;
}

function isSimpleGreeting(query: string, usedVision: boolean) {
  if (usedVision) {
    return false;
  }

  const normalized = query.trim().toLowerCase();
  return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)$/.test(normalized);
}

function normalizeSynthesis(
  raw: unknown,
  interpretation: Interpretation,
  query: string,
  usedVision: boolean,
  usedWebSearch: boolean,
  sources: SearchSource[],
  sessionContext: OttoSessionContext,
  profile: ProfileRow,
): { reply: OttoReply; sessionSummary: string } {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const createdAt = new Date().toISOString();
  const messageId = generateId("msg");
  const callProposal = normalizeCallProposal(data.callProposal, sources, profile);
  const answer = ensureCallPrompt(cleanText(
    data.answer,
    callProposal
      ? `I found enough Firecrawl evidence to call ${callProposal.callTargetName} and verify this for you.`
      : usedWebSearch
        ? "I found relevant information, but I could not confidently summarize it. Try narrowing the question."
        : "I could interpret the scene, but I could not confidently produce a full answer. Try a more specific follow-up."
  ), callProposal);

  const cleanedStructuredDetails = (Array.isArray(data.structuredDetails) ? data.structuredDetails : [])
    .map((entry) => {
      const row = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
      const label = cleanText(row.label);
      const value = cleanText(row.value);

      if (!label || !value) {
        return null;
      }

      return { label, value } satisfies StructuredDetail;
    })
    .filter((entry): entry is StructuredDetail => Boolean(entry))
    .slice(0, 6);

  if (cleanedStructuredDetails.length === 0 && interpretation.visualDescription) {
    cleanedStructuredDetails.push({
      label: usedVision ? "What Otto saw" : "Session context",
      value: usedVision ? interpretation.visualDescription : sessionContext.summary || query || interpretation.userIntent,
    });
  }

  cleanedStructuredDetails.push({
    label: "Profile context",
    value: `${profile.current_region} | ${profile.travel_mode} | ${profile.timezone}`,
  });

  if (sources.length > 0) {
    cleanedStructuredDetails.push({
      label: "Firecrawl research",
      value: `Checked ${sources.length} Firecrawl source${sources.length === 1 ? "" : "s"} to verify the details.`,
    });
  }

  const sessionSummary = cleanText(
    data.sessionSummary,
    `Currently discussing ${interpretation.subject}. ${answer}`.slice(0, 240)
  );

  return {
    reply: {
      messageId,
      createdAt,
      subject: interpretation.subject,
      subjectType: interpretation.subjectType,
      answer,
      confidence: interpretation.confidence,
      usedVision,
      usedWebSearch,
      suggestedFollowUps: cleanStringArray(data.suggestedFollowUps, 4),
      actions: buildSourceActions(
        interpretation.subject,
        buildSearchPlanQuery(interpretation, query, sessionContext, profile),
        sources,
      ),
      sources: sources.map(({ title, url, snippet, sourceType, imageUrl, siteName, domain, meta }) => ({
        title,
        url,
        snippet,
        sourceType,
        imageUrl,
        siteName,
        domain,
        meta,
      })),
      structuredDetails: cleanedStructuredDetails.slice(0, 6),
      callProposal,
    },
    sessionSummary,
  };
}

function buildUpdatedSessionContext(
  sessionContext: OttoSessionContext,
  query: string,
  usedVision: boolean,
  reply: OttoReply,
  sessionSummary: string,
): OttoSessionContext {
  const now = new Date().toISOString();
  const userTurn: OttoUserTurn = {
    id: generateId("turn"),
    role: "user",
    content: query,
    createdAt: now,
    usedVision,
  };

  const assistantTurn: OttoAssistantTurn = {
    id: reply.messageId,
    role: "assistant",
    content: reply.answer,
    createdAt: reply.createdAt,
    usedVision: reply.usedVision,
    usedWebSearch: reply.usedWebSearch,
    reply,
  };

  return {
    sessionId: sessionContext.sessionId || generateId("session"),
    activeSubject: reply.subject || sessionContext.activeSubject,
    activeSubjectType: reply.subjectType || sessionContext.activeSubjectType,
    summary: sessionSummary,
    turns: [...sessionContext.turns, userTurn, assistantTurn].slice(-MAX_SESSION_TURNS),
  };
}

function buildGreetingResponse(
  query: string,
  sessionContext: OttoSessionContext,
  profile: ProfileRow,
): OttoTurnResponse {
  const createdAt = new Date().toISOString();
  const greetingText = `Hello ${profile.full_name || "there"}. I'm ready. You can ask about what you're looking at, or I can use Firecrawl research and make a cloud call if needed.`;
  const reply: OttoReply = {
    messageId: generateId("msg"),
    createdAt,
    subject: "Otto",
    subjectType: "assistant",
    answer: `Hello ${profile.full_name || "there"}. I’m ready. You can ask about what you’re looking at, or I can use Firecrawl research and make a cloud call if needed.`,
    confidence: "high",
    usedVision: false,
    usedWebSearch: false,
    suggestedFollowUps: [
      "What am I looking at?",
      "Can you verify this by calling?",
      "Find more information about this",
    ],
    actions: [],
    sources: [],
    structuredDetails: [
      {
        label: "Ready",
        value: "Otto is online and waiting for your next question.",
      },
      {
        label: "Cloud workflow",
        value: "If a live call would help, Otto can run it in the cloud and call you back with the result.",
      },
    ],
    callProposal: null,
  };
  reply.answer = greetingText;

  return {
    reply,
    sessionContext: buildUpdatedSessionContext(
      sessionContext,
      query,
      false,
      reply,
      "The user greeted Otto and Otto is ready for the next task.",
    ),
    sessionStatus: "active",
  };
}

function getGeminiText(response: unknown): string {
  const data = typeof response === "object" && response !== null ? response as Record<string, unknown> : {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate =
    candidates.length > 0 && typeof candidates[0] === "object" && candidates[0] !== null
      ? candidates[0] as Record<string, unknown>
      : null;
  const content =
    firstCandidate && typeof firstCandidate.content === "object" && firstCandidate.content !== null
      ? firstCandidate.content as Record<string, unknown>
      : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => {
      const row = typeof part === "object" && part !== null ? part as Record<string, unknown> : {};
      return typeof row.text === "string" ? row.text : "";
    })
    .join("")
    .trim();

  if (text) {
    return text;
  }

  const promptFeedback =
    typeof data.promptFeedback === "object" && data.promptFeedback !== null
      ? data.promptFeedback as Record<string, unknown>
      : null;
  const blockReason = promptFeedback && typeof promptFeedback.blockReason === "string"
    ? promptFeedback.blockReason
    : null;

  throw new HttpError(502, blockReason ? `Gemini blocked the request: ${blockReason}` : "Gemini returned an empty response.");
}

async function callGemini<T>(
  systemInstruction: string,
  userParts: Array<Record<string, unknown>>,
  responseSchema: Record<string, unknown>,
  maxOutputTokens: number,
): Promise<T> {
  if (!GEMINI_API_KEY) {
    throw new HttpError(500, "GEMINI_API_KEY not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: userParts,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          candidateCount: 1,
          maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("gemini_error", response.status, errText);

    if (response.status === 429) {
      throw new HttpError(429, "Gemini rate limit reached. Try again shortly.");
    }

    throw new HttpError(502, `Gemini request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const text = getGeminiText(payload);

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("gemini_parse_error", text, error);
    throw new HttpError(502, "Gemini returned invalid JSON.");
  }
}

async function searchWithFirecrawl(query: string): Promise<SearchSource[]> {
  if (!FIRECRAWL_API_KEY || !query) {
    return [];
  }

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        sources: ["web"],
        scrapeOptions: {
          formats: ["markdown"],
        },
      }),
    });

    if (!response.ok) {
      console.error("firecrawl_error", response.status, await response.text());
      return [];
    }

    return normalizeSources(await response.json());
  } catch (error) {
    console.error("firecrawl_exception", error);
    return [];
  }
}

async function researchWithFirecrawl(
  interpretation: Interpretation,
  searchQuery: string,
  profile: ProfileRow,
) {
  const queries = buildFirecrawlQueries(interpretation, searchQuery, profile);
  const results = await Promise.all(queries.map((query) => searchWithFirecrawl(query)));
  const deduped = dedupeSources(results.flat()).slice(0, 6);
  return await enrichSources(deduped);
}

async function getAuthenticatedProfile(req: Request): Promise<ProfileRow> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new HttpError(500, "Supabase environment is not configured.");
  }

  const authHeader = req.headers.get("x-otto-auth") ?? req.headers.get("Authorization");

  if (!authHeader) {
    throw new HttpError(401, "Authentication required.");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    throw new HttpError(401, "Invalid session.");
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select(
      "full_name, home_location, current_region, language_code, timezone, travel_mode, callback_phone, call_briefing_enabled, onboarding_completed_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(500, "Failed to load profile.");
  }

  if (!profile?.onboarding_completed_at) {
    throw new HttpError(403, "Complete onboarding before using Otto.");
  }

  return profile as ProfileRow;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = performance.now();

  try {
    const profile = await getAuthenticatedProfile(req);
    const { query = "", imageBase64, sessionContext: rawSessionContext }: AnalyzeRequest = await req.json();
    const trimmedQuery = query.trim();
    const cleanedImage = imageBase64 ? cleanBase64Image(imageBase64) : "";
    const usedVision = Boolean(cleanedImage);
    const sessionContext = normalizeSessionContext(rawSessionContext);

    if (!trimmedQuery && !cleanedImage) {
      return jsonResponse({ error: "Query or image is required" }, 400);
    }

    if (isSimpleGreeting(trimmedQuery, usedVision)) {
      return jsonResponse({
        success: true,
        data: buildGreetingResponse(trimmedQuery, sessionContext, profile),
      });
    }

    const identifyStartedAt = performance.now();
    const interpretation = normalizeInterpretation(
      await callGemini<Interpretation>(
        [
          "You are Otto, a mobile AI walking companion and cloud call planner.",
          "Interpret the current user turn using the current frame when available, plus session memory and the user's stored profile context.",
          "Use call_verification or call_booking when a live call would materially improve the outcome over research alone.",
          "For restaurants, hotels, cafes, bars, reservations, bookings, or image-based place questions, strongly prefer call_verification when a call could check live details.",
          "Firecrawl is the only retrieval layer. There is no browser automation.",
          "Choose web retrieval when external, fresh, contact, or verification information is needed.",
          "For greetings, thanks, acknowledgements, confirmations, and other lightweight conversational turns, do not request web search.",
          "For lightweight conversational turns, answer directly from Gemini using session context and profile context only.",
          "Keep subjectType short and human-readable.",
        ].join("\n"),
        [
          ...(cleanedImage
            ? [{
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanedImage,
              },
            }]
            : []),
          {
            text: JSON.stringify({
              currentQuery: trimmedQuery || "Interpret what I am looking at and continue the walk session.",
              profile: buildProfileContext(profile),
              session: {
                sessionId: sessionContext.sessionId,
                activeSubject: sessionContext.activeSubject,
                activeSubjectType: sessionContext.activeSubjectType,
                summary: sessionContext.summary,
                recentTurns: sessionContext.turns.map((turn) => ({
                  role: turn.role,
                  content: turn.content,
                  usedVision: turn.usedVision,
                  usedWebSearch: turn.role === "assistant" ? turn.usedWebSearch : false,
                })),
              },
            }),
          },
        ],
        interpretationSchema,
        1600,
      ),
      trimmedQuery,
      usedVision,
      sessionContext,
    );

    const searchStartedAt = performance.now();
    const searchQuery = buildSearchPlanQuery(interpretation, trimmedQuery, sessionContext, profile);
    const shouldSearch =
      interpretation.searchMode === "search" &&
      (interpretation.needsWebSearch || interpretation.intentKind !== "answer");
    const sources = shouldSearch ? await researchWithFirecrawl(interpretation, searchQuery, profile) : [];
    const usedWebSearch = sources.length > 0;

    const synthesisStartedAt = performance.now();
    const { reply, sessionSummary } = normalizeSynthesis(
      await callGemini<{
        answer: string;
        structuredDetails: StructuredDetail[];
        suggestedFollowUps: string[];
        sessionSummary: string;
        callProposal?: OttoCallProposal;
      }>(
        [
          "You are Otto, a concise walking companion and cloud call planner.",
          "Answer the current turn using the current frame, session memory, user profile defaults, and Firecrawl evidence.",
          "If there is no Firecrawl evidence and the turn is lightweight conversation, reply naturally and briefly without implying that research happened.",
          "If a call would help more than research alone, return a callProposal with the target, phone number, exact reason, and question list.",
          "For restaurants, hotels, cafes, bars, reservations, bookings, or image-led place questions, prefer returning a callProposal when Firecrawl gives a plausible business phone.",
          "When you return a callProposal, your answer should naturally lead into asking whether Otto should make the call and check.",
          "Only return callProposal when the phone number is plausible from Firecrawl-backed evidence.",
          "followUpActions must only contain callback_user.",
          "There is no browser automation.",
          "Do not invent hours, prices, ratings, names, URLs, or phone numbers.",
          "Session summary should be a short memory string that helps the next follow-up resolve correctly.",
        ].join("\n"),
        [
          {
            text: JSON.stringify({
              currentQuery: trimmedQuery,
              interpretation,
              profile: buildProfileContext(profile),
              session: {
                activeSubject: sessionContext.activeSubject,
                summary: sessionContext.summary,
                recentTurns: formatTurnHistory(sessionContext.turns),
              },
              firecrawlSources: sources.map((source, index) => ({
                id: index + 1,
                title: source.title,
                url: source.url,
                snippet: source.snippet,
                content: source.content,
              })),
            }),
          },
        ],
        synthesisSchema,
        2200,
      ),
      interpretation,
      trimmedQuery,
      usedVision,
      usedWebSearch,
      sources,
      sessionContext,
      profile,
    );

    const updatedSessionContext = buildUpdatedSessionContext(
      sessionContext,
      trimmedQuery || "What am I looking at?",
      usedVision,
      reply,
      sessionSummary,
    );

    console.log("otto_analyze_timing", {
      identifyMs: Math.round(searchStartedAt - identifyStartedAt),
      searchMs: Math.round(synthesisStartedAt - searchStartedAt),
      synthesizeMs: Math.round(performance.now() - synthesisStartedAt),
      totalMs: Math.round(performance.now() - startedAt),
      sessionId: updatedSessionContext.sessionId,
      turnCount: updatedSessionContext.turns.length,
      usedVision,
      usedWebSearch,
      intentKind: interpretation.intentKind,
      searchQuery,
    });

    const response: OttoTurnResponse = {
      reply,
      sessionContext: updatedSessionContext,
      sessionStatus: "active",
    };

    return jsonResponse({ success: true, data: response });
  } catch (error) {
    console.error("otto_analyze_error", error);

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
