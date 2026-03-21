import type { OttoSessionContext } from "./types";

export function createOttoSessionContext(): OttoSessionContext {
  const sessionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `otto-${Date.now()}`;

  return {
    sessionId,
    activeSubject: null,
    activeSubjectType: null,
    summary: "",
    turns: [],
  };
}
