export interface OttoSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
}

export interface OttoAction {
  label: string;
  url: string | null;
  type: "source" | "search" | "directions";
}

export interface StructuredDetail {
  label: string;
  value: string;
}

export interface OttoReplyData {
  messageId: string;
  createdAt: string;
  subject: string;
  subjectType: string;
  answer: string;
  confidence: "low" | "medium" | "high";
  usedVision: boolean;
  usedWebSearch: boolean;
  suggestedFollowUps: string[];
  actions: OttoAction[];
  sources: OttoSource[];
  structuredDetails: StructuredDetail[];
}

export interface OttoUserTurn {
  id: string;
  role: "user";
  content: string;
  createdAt: string;
  usedVision: boolean;
}

export interface OttoAssistantTurn {
  id: string;
  role: "assistant";
  content: string;
  createdAt: string;
  usedVision: boolean;
  usedWebSearch: boolean;
  reply: OttoReplyData;
}

export type OttoConversationTurn = OttoUserTurn | OttoAssistantTurn;

export interface OttoSessionContext {
  sessionId: string;
  activeSubject: string | null;
  activeSubjectType: string | null;
  summary: string;
  turns: OttoConversationTurn[];
}

export interface OttoTurnResponse {
  reply: OttoReplyData;
  sessionContext: OttoSessionContext;
  sessionStatus: "active";
}
