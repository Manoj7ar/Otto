import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SESSION_TURNS = 8;

type ConfidenceLevel = "low" | "medium" | "high";
type SearchMode = "none" | "search";
type ActionType = "source" | "search" | "directions";

interface AnalyzeRequest {
  query?: string;
  imageBase64?: string;
  sessionContext?: unknown;
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
}

interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
  content: string;
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
  }>;
  structuredDetails: StructuredDetail[];
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

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

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

function shouldForceWebSearch(query: string) {
  return /(review|rating|hours|open|closed|menu|price|website|address|directions|buy|compare|history|book|reserve|availability)/i
    .test(query);
}

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
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
  const searchMode =
    data.searchMode === "search" || data.searchMode === "none"
      ? data.searchMode
      : needsWebSearch
        ? "search"
        : "none";

  return {
    subject: cleanText(data.subject, fallbackSubject),
    subjectType: cleanText(data.subjectType, sessionContext.activeSubjectType || "general"),
    visualDescription: cleanText(
      data.visualDescription,
      usedVision ? "Otto captured the environment and interpreted the scene." : "No camera frame was provided."
    ),
    userIntent: cleanText(data.userIntent, fallbackQuery || "Continue helping with the current walk."),
    confidence,
    needsWebSearch: needsWebSearch || shouldForceWebSearch(fallbackQuery),
    searchMode,
    searchQuery,
    detailHints: cleanStringArray(data.detailHints),
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
) {
  if (interpretation.searchQuery) {
    return interpretation.searchQuery;
  }

  if (sessionContext.activeSubject && query) {
    return `${sessionContext.activeSubject} ${query}`;
  }

  if (query) {
    return query;
  }

  if (sessionContext.activeSubject) {
    return sessionContext.activeSubject;
  }

  return interpretation.subject;
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

function normalizeSynthesis(
  raw: unknown,
  interpretation: Interpretation,
  query: string,
  usedVision: boolean,
  usedWebSearch: boolean,
  sources: SearchSource[],
  sessionContext: OttoSessionContext,
): { reply: OttoReply; sessionSummary: string } {
  const data = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const createdAt = new Date().toISOString();
  const messageId = generateId("msg");
  const answer = cleanText(
    data.answer,
    usedWebSearch
      ? "I found relevant information, but I could not confidently summarize it. Try narrowing the question."
      : "I could interpret the scene, but I could not confidently produce a full answer. Try a more specific follow-up."
  );

  const structuredDetails = (
    Array.isArray(data.structuredDetails) ? data.structuredDetails : []
  )
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

  if (structuredDetails.length === 0 && interpretation.visualDescription) {
    structuredDetails.push({
      label: usedVision ? "What Otto saw" : "Session context",
      value: usedVision ? interpretation.visualDescription : sessionContext.summary || query || interpretation.userIntent,
    });
  }

  if (sources.length > 0) {
    structuredDetails.push({
      label: "Web verification",
      value: `Checked ${sources.length} source${sources.length === 1 ? "" : "s"} for supporting details.`,
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
        buildSearchPlanQuery(interpretation, query, sessionContext),
        sources,
      ),
      sources: sources.map(({ title, url, snippet, sourceType }) => ({
        title,
        url,
        snippet,
        sourceType,
      })),
      structuredDetails: structuredDetails.slice(0, 6),
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = performance.now();

  try {
    const { query = "", imageBase64, sessionContext: rawSessionContext }: AnalyzeRequest = await req.json();
    const trimmedQuery = query.trim();
    const cleanedImage = imageBase64 ? cleanBase64Image(imageBase64) : "";
    const usedVision = Boolean(cleanedImage);
    const sessionContext = normalizeSessionContext(rawSessionContext);

    if (!trimmedQuery && !cleanedImage) {
      return jsonResponse({ error: "Query or image is required" }, 400);
    }

    const identifyStartedAt = performance.now();
    const interpretation = normalizeInterpretation(
      await callGemini<Interpretation>(
        [
          "You are Otto, a mobile AI walking companion.",
          "Interpret the current user turn using the current frame when available, plus the session context.",
          "If the user asks a follow-up like hours, reviews, price, or directions, resolve it against the active session subject when possible.",
          "Choose web retrieval only when external or fresh information is needed.",
          "If the session already identifies the place or object, use that instead of inventing a new subject.",
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
        1400,
      ),
      trimmedQuery,
      usedVision,
      sessionContext,
    );

    const searchStartedAt = performance.now();
    const searchQuery = buildSearchPlanQuery(interpretation, trimmedQuery, sessionContext);
    const shouldSearch = interpretation.searchMode === "search" && interpretation.needsWebSearch;
    const sources = shouldSearch ? await searchWithFirecrawl(searchQuery) : [];
    const usedWebSearch = sources.length > 0;

    const synthesisStartedAt = performance.now();
    const { reply, sessionSummary } = normalizeSynthesis(
      await callGemini<{
        answer: string;
        structuredDetails: StructuredDetail[];
        suggestedFollowUps: string[];
        sessionSummary: string;
      }>(
        [
          "You are Otto, a concise walking companion.",
          "Answer the current turn using the current frame, session memory, and any retrieved web evidence.",
          "Be direct and useful.",
          "Do not claim web verification when sources are missing.",
          "Do not invent hours, prices, ratings, names, or URLs.",
          "Session summary should be a short memory string that helps the next follow-up resolve correctly.",
        ].join("\n"),
        [
          {
            text: JSON.stringify({
              currentQuery: trimmedQuery,
              interpretation,
              session: {
                activeSubject: sessionContext.activeSubject,
                summary: sessionContext.summary,
                recentTurns: formatTurnHistory(sessionContext.turns),
              },
              sources: sources.map((source, index) => ({
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
        1800,
      ),
      interpretation,
      trimmedQuery,
      usedVision,
      usedWebSearch,
      sources,
      sessionContext,
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
