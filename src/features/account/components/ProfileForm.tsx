import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import type { ProfileRow } from "../profile";
import { createDefaultProfileValues, type ProfileFormValues } from "../profile";

interface ProfileFormProps {
  profile?: ProfileRow | null;
  submitLabel: string;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  busy?: boolean;
  title: string;
  description: string;
}

export default function ProfileForm({
  profile,
  submitLabel,
  onSubmit,
  busy = false,
  title,
  description,
}: ProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(() => createDefaultProfileValues(profile));

  useEffect(() => {
    setValues(createDefaultProfileValues(profile));
  }, [profile]);

  const setValue = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      className="glass-strong mx-auto w-full max-w-2xl rounded-[2rem] p-6 sm:p-8"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await onSubmit(values);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save the profile.");
        }
      }}
    >
      <div className="max-w-xl">
        <p className="text-sm uppercase tracking-[0.24em] text-secondary-otto">Otto profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-secondary-otto">{description}</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <label className="glass-panel rounded-3xl p-4 sm:col-span-2">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Name</span>
          <input
            value={values.fullName}
            onChange={(event) => setValue("fullName", event.target.value)}
            placeholder="Manoj"
            className="mt-3 w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
          />
        </label>

        <label className="glass-panel rounded-3xl p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Home or base location</span>
          <input
            value={values.homeLocation}
            onChange={(event) => setValue("homeLocation", event.target.value)}
            placeholder="London, United Kingdom"
            className="mt-3 w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
            required
          />
        </label>

        <label className="glass-panel rounded-3xl p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Current region</span>
          <input
            value={values.currentRegion}
            onChange={(event) => setValue("currentRegion", event.target.value)}
            placeholder="Central London"
            className="mt-3 w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
            required
          />
        </label>

        <label className="glass-panel rounded-3xl p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Language</span>
          <input
            value={values.languageCode}
            onChange={(event) => setValue("languageCode", event.target.value)}
            placeholder="en"
            className="mt-3 w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
            required
          />
        </label>

        <label className="glass-panel rounded-3xl p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Timezone</span>
          <input
            value={values.timezone}
            onChange={(event) => setValue("timezone", event.target.value)}
            placeholder="Europe/London"
            className="mt-3 w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
            required
          />
        </label>

        <label className="glass-panel rounded-3xl p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Travel mode</span>
          <select
            value={values.travelMode}
            onChange={(event) => setValue("travelMode", event.target.value)}
            className="mt-3 w-full bg-transparent text-base outline-none"
          >
            <option value="walking">Walking</option>
            <option value="driving">Driving</option>
            <option value="public_transit">Public transit</option>
          </select>
        </label>

        <label className="glass-panel rounded-3xl p-4">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Callback phone</span>
          <input
            value={values.callbackPhone}
            onChange={(event) => setValue("callbackPhone", event.target.value)}
            placeholder="+44 7..."
            className="mt-3 w-full bg-transparent text-base outline-none placeholder:text-secondary-otto/60"
            required
          />
        </label>

        <div className="glass-panel rounded-3xl p-4 sm:col-span-2">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary-otto">Cloud callback</span>
          <p className="mt-3 text-sm leading-6 text-foreground/80">
            Otto uses this number to call you back after cloud-run business calls finish, even if you leave the app.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="glass-button-primary mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium disabled:opacity-50"
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
        {submitLabel}
      </button>
    </form>
  );
}
