export const OTTO_LOCAL_PROFILE_STORAGE_KEY = "otto.local-profile.v1";

export interface ProfileRow {
  full_name: string | null;
  home_location: string;
  current_region: string;
  language_code: string;
  timezone: string;
  travel_mode: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileFormValues {
  fullName: string;
  homeLocation: string;
  currentRegion: string;
  languageCode: string;
  timezone: string;
  travelMode: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStoredProfile(raw: unknown): ProfileRow | null {
  if (!isRecord(raw)) {
    return null;
  }

  const homeLocation = cleanText(raw.home_location);
  const currentRegion = cleanText(raw.current_region);
  const languageCode = cleanText(raw.language_code, "en");
  const timezone = cleanText(raw.timezone, "UTC");
  const travelMode = cleanText(raw.travel_mode, "walking");

  if (!homeLocation || !currentRegion) {
    return null;
  }

  return {
    full_name: cleanText(raw.full_name) || null,
    home_location: homeLocation,
    current_region: currentRegion,
    language_code: languageCode,
    timezone,
    travel_mode: travelMode,
    onboarding_completed_at: cleanText(raw.onboarding_completed_at) || null,
    created_at: cleanText(raw.created_at, new Date().toISOString()),
    updated_at: cleanText(raw.updated_at, new Date().toISOString()),
  };
}

export function createDefaultProfileValues(profile?: ProfileRow | null): ProfileFormValues {
  return {
    fullName: profile?.full_name ?? "",
    homeLocation: profile?.home_location ?? "",
    currentRegion: profile?.current_region ?? "",
    languageCode: profile?.language_code ?? "en",
    timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    travelMode: profile?.travel_mode ?? "walking",
  };
}

export function buildStoredProfile(
  values: ProfileFormValues,
  existingProfile?: ProfileRow | null,
  onboardingCompleted = false,
): ProfileRow {
  const now = new Date().toISOString();

  return {
    full_name: values.fullName.trim() || null,
    home_location: values.homeLocation.trim(),
    current_region: values.currentRegion.trim(),
    language_code: values.languageCode.trim() || "en",
    timezone: values.timezone.trim() || "UTC",
    travel_mode: values.travelMode.trim() || "walking",
    onboarding_completed_at: onboardingCompleted
      ? existingProfile?.onboarding_completed_at ?? now
      : existingProfile?.onboarding_completed_at ?? null,
    created_at: existingProfile?.created_at ?? now,
    updated_at: now,
  };
}

export function readLocalProfile(): ProfileRow | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(OTTO_LOCAL_PROFILE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return normalizeStoredProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalProfile(profile: ProfileRow) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(OTTO_LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearLocalProfile() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(OTTO_LOCAL_PROFILE_STORAGE_KEY);
}

export function validateProfileValues(values: ProfileFormValues): string | null {
  if (!values.homeLocation.trim()) {
    return "Home or base location is required.";
  }

  if (!values.currentRegion.trim()) {
    return "Current region is required.";
  }

  if (!values.languageCode.trim()) {
    return "Language is required.";
  }

  if (!values.timezone.trim()) {
    return "Timezone is required.";
  }

  if (!values.travelMode.trim()) {
    return "Travel mode is required.";
  }

  return null;
}
