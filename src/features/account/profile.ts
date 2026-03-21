import type { Database } from "@/shared/supabase/types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

export interface ProfileFormValues {
  fullName: string;
  homeLocation: string;
  currentRegion: string;
  languageCode: string;
  timezone: string;
  travelMode: string;
  callbackPhone: string;
  callBriefingEnabled: boolean;
}

export function createDefaultProfileValues(profile?: ProfileRow | null): ProfileFormValues {
  return {
    fullName: profile?.full_name ?? "",
    homeLocation: profile?.home_location ?? "",
    currentRegion: profile?.current_region ?? "",
    languageCode: profile?.language_code ?? "en",
    timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    travelMode: profile?.travel_mode ?? "walking",
    callbackPhone: profile?.callback_phone ?? "",
    callBriefingEnabled: profile?.call_briefing_enabled ?? true,
  };
}

export function toProfileUpsert(userId: string, values: ProfileFormValues, onboardingCompleted: boolean): ProfileInsert {
  return {
    id: userId,
    full_name: values.fullName.trim() || null,
    home_location: values.homeLocation.trim(),
    current_region: values.currentRegion.trim(),
    language_code: values.languageCode.trim() || "en",
    timezone: values.timezone.trim() || "UTC",
    travel_mode: values.travelMode.trim() || "walking",
    callback_phone: values.callbackPhone.trim() || null,
    call_briefing_enabled: values.callBriefingEnabled,
    onboarding_completed_at: onboardingCompleted ? new Date().toISOString() : null,
  };
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
