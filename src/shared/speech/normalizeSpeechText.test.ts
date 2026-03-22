import { describe, expect, it } from "vitest";
import { normalizeSpeechText } from "./normalizeSpeechText";

describe("normalizeSpeechText", () => {
  it("speaks money amounts more naturally", () => {
    expect(normalizeSpeechText("Dinner is $12.50 per person.")).toBe(
      "Dinner is twelve dollars and fifty cents per person.",
    );
    expect(normalizeSpeechText("The room costs EUR 199.")).toBe(
      "The room costs one hundred ninety-nine euros.",
    );
  });

  it("speaks times with clearer human phrasing", () => {
    expect(normalizeSpeechText("Your table is at 7:05 PM.")).toBe(
      "Your table is at seven oh five p.m.",
    );
    expect(normalizeSpeechText("Check-in starts at 12:00 PM and breakfast ends at 12:00 AM.")).toBe(
      "Check-in starts at twelve noon and breakfast ends at twelve midnight.",
    );
  });
});
