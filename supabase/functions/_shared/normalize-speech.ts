const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

interface CurrencyNames {
  majorSingular: string;
  majorPlural: string;
  minorSingular: string;
  minorPlural: string;
}

const SYMBOL_CURRENCIES: Record<string, CurrencyNames> = {
  "$": {
    majorSingular: "dollar",
    majorPlural: "dollars",
    minorSingular: "cent",
    minorPlural: "cents",
  },
  "£": {
    majorSingular: "pound",
    majorPlural: "pounds",
    minorSingular: "penny",
    minorPlural: "pence",
  },
  "€": {
    majorSingular: "euro",
    majorPlural: "euros",
    minorSingular: "cent",
    minorPlural: "cents",
  },
};

const CODE_CURRENCIES: Record<string, CurrencyNames> = {
  USD: SYMBOL_CURRENCIES["$"],
  GBP: SYMBOL_CURRENCIES["£"],
  EUR: SYMBOL_CURRENCIES["€"],
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function numberToWords(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const normalized = Math.trunc(value);

  if (normalized < 0) {
    return `minus ${numberToWords(Math.abs(normalized))}`;
  }

  if (normalized < 20) {
    return SMALL_NUMBERS[normalized];
  }

  if (normalized < 100) {
    const tens = Math.floor(normalized / 10);
    const remainder = normalized % 10;
    return remainder === 0 ? TENS[tens] : `${TENS[tens]}-${SMALL_NUMBERS[remainder]}`;
  }

  if (normalized < 1000) {
    const hundreds = Math.floor(normalized / 100);
    const remainder = normalized % 100;
    return remainder === 0
      ? `${SMALL_NUMBERS[hundreds]} hundred`
      : `${SMALL_NUMBERS[hundreds]} hundred ${numberToWords(remainder)}`;
  }

  if (normalized < 1_000_000) {
    const thousands = Math.floor(normalized / 1000);
    const remainder = normalized % 1000;
    return remainder === 0
      ? `${numberToWords(thousands)} thousand`
      : `${numberToWords(thousands)} thousand ${numberToWords(remainder)}`;
  }

  if (normalized < 1_000_000_000) {
    const millions = Math.floor(normalized / 1_000_000);
    const remainder = normalized % 1_000_000;
    return remainder === 0
      ? `${numberToWords(millions)} million`
      : `${numberToWords(millions)} million ${numberToWords(remainder)}`;
  }

  const billions = Math.floor(normalized / 1_000_000_000);
  const remainder = normalized % 1_000_000_000;
  return remainder === 0
    ? `${numberToWords(billions)} billion`
    : `${numberToWords(billions)} billion ${numberToWords(remainder)}`;
}

function pluralize(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}

function parseWholeNumber(value: string) {
  return Number.parseInt(value.replaceAll(",", ""), 10);
}

function normalizeMinorUnits(value: string | undefined) {
  if (!value) {
    return 0;
  }

  return Number.parseInt(value.padEnd(2, "0").slice(0, 2), 10);
}

function buildCurrencySpeech(wholeText: string, minorText: string | undefined, names: CurrencyNames) {
  const whole = parseWholeNumber(wholeText);
  const minor = normalizeMinorUnits(minorText);

  if (!Number.isFinite(whole) || !Number.isFinite(minor)) {
    return `${wholeText}${minorText ? `.${minorText}` : ""}`;
  }

  const parts: string[] = [];

  if (whole > 0 || minor === 0) {
    parts.push(`${numberToWords(whole)} ${pluralize(whole, names.majorSingular, names.majorPlural)}`);
  }

  if (minor > 0) {
    parts.push(`${numberToWords(minor)} ${pluralize(minor, names.minorSingular, names.minorPlural)}`);
  }

  return parts.join(" and ");
}

function normalizeMeridiem(value: string) {
  return /^a/i.test(value) ? "a.m." : "p.m.";
}

function buildTimeSpeech(hoursText: string, minutesText: string | undefined, meridiemText: string) {
  const hours = Number.parseInt(hoursText, 10);
  const minutes = minutesText ? Number.parseInt(minutesText, 10) : 0;

  if (!Number.isFinite(hours) || hours < 1 || hours > 12 || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return `${hoursText}${minutesText ? `:${minutesText}` : ""} ${meridiemText}`;
  }

  const meridiem = normalizeMeridiem(meridiemText);
  const spokenHour = numberToWords(hours);

  if (minutes === 0) {
    if (hours === 12 && meridiem === "a.m.") {
      return "twelve midnight";
    }

    if (hours === 12 && meridiem === "p.m.") {
      return "twelve noon";
    }

    return `${spokenHour} ${meridiem}`;
  }

  const spokenMinutes = minutes < 10
    ? `oh ${numberToWords(minutes)}`
    : numberToWords(minutes);

  return `${spokenHour} ${spokenMinutes} ${meridiem}`;
}

export function normalizeSpeechText(text: string) {
  if (!text.trim()) {
    return "";
  }

  return normalizeWhitespace(
    text
      .replace(/(?<!\w)([$£€])\s?(\d[\d,]*)(?:\.(\d{1,2}))?\b/g, (match, symbol: string, whole: string, minor?: string) => {
        const names = SYMBOL_CURRENCIES[symbol];
        return names ? buildCurrencySpeech(whole, minor, names) : match;
      })
      .replace(/\b(USD|GBP|EUR)\s?(\d[\d,]*)(?:\.(\d{1,2}))?\b/gi, (match, code: string, whole: string, minor?: string) => {
        const names = CODE_CURRENCIES[code.toUpperCase()];
        return names ? buildCurrencySpeech(whole, minor, names) : match;
      })
      .replace(/\b(\d[\d,]*)(?:\.(\d{1,2}))?\s?(USD|GBP|EUR)\b/gi, (match, whole: string, minor: string | undefined, code: string) => {
        const names = CODE_CURRENCIES[code.toUpperCase()];
        return names ? buildCurrencySpeech(whole, minor, names) : match;
      })
      .replace(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi, (match, hours: string, minutes?: string, meridiem?: string) => {
        return meridiem ? buildTimeSpeech(hours, minutes, meridiem) : match;
      })
      .replace(/\b([ap]\.m\.)\./gi, "$1"),
  );
}
