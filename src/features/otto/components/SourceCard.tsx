import { ArrowUpRight, MapPin, Star } from "lucide-react";
import type { OttoSource } from "../types";

interface SourceCardProps {
  source: OttoSource;
}

function compactDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function pickMetaRows(source: OttoSource) {
  const rows = [
    source.meta?.rating ? { key: "rating", label: `${source.meta.rating} rating`, icon: "star" as const } : null,
    source.meta?.reviewCount ? { key: "reviewCount", label: source.meta.reviewCount, icon: null } : null,
    source.meta?.priceLabel ? { key: "priceLabel", label: source.meta.priceLabel, icon: null } : null,
    source.meta?.address ? { key: "address", label: source.meta.address, icon: "pin" as const } : null,
    source.meta?.availabilityText ? { key: "availabilityText", label: source.meta.availabilityText, icon: null } : null,
  ];

  return rows.filter((row): row is NonNullable<(typeof rows)[number]> => Boolean(row)).slice(0, 4);
}

export default function SourceCard({ source }: SourceCardProps) {
  const metaRows = pickMetaRows(source);
  const siteLabel = source.siteName || source.domain || compactDomain(source.url) || source.sourceType;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-[0.95rem] border border-black/10 bg-white/30 transition-colors hover:bg-white/40 sm:rounded-[1.2rem]"
    >
      {source.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-black/5">
          <img
            src={source.imageUrl}
            alt={source.title}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div className="px-3 py-2.5 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary-otto">
              {siteLabel}
            </p>
            <p className="mt-1 text-sm font-medium leading-5 text-foreground sm:mt-2 sm:leading-6">
              {source.title}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/55 p-1.5 text-primary sm:p-2">
            <ArrowUpRight size={14} />
          </span>
        </div>

        {metaRows.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
            {metaRows.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/45 px-2.5 py-1 text-[11px] text-secondary-otto"
              >
                {item.icon === "star" && <Star size={11} className="fill-current" />}
                {item.icon === "pin" && <MapPin size={11} />}
                {item.label}
              </span>
            ))}
          </div>
        )}

        {source.snippet && (
          <p className="mt-2.5 text-sm leading-5 text-foreground/75 sm:mt-3 sm:leading-6">
            {source.snippet}
          </p>
        )}
      </div>
    </a>
  );
}
