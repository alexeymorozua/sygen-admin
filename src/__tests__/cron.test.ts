import { describe, it, expect } from "vitest";
import { isValidCron, describeCron, CRON_PRESETS } from "@/lib/cron";

describe("isValidCron", () => {
  it("accepts standard 5-field expressions", () => {
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("0 3 * * *")).toBe(true);
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("0 9 * * 1")).toBe(true);
    expect(isValidCron("0 0 1 * *")).toBe(true);
    expect(isValidCron("0,30 */6 * * *")).toBe(true);
    expect(isValidCron("0-30 * * * *")).toBe(true);
  });

  it("rejects invalid expressions", () => {
    expect(isValidCron("")).toBe(false);
    expect(isValidCron("hello")).toBe(false);
    expect(isValidCron("* * *")).toBe(false);
    expect(isValidCron("* * * * * *")).toBe(false);
    expect(isValidCron("abc * * * *")).toBe(false);
  });
});

describe("describeCron", () => {
  it("describes every minute", () => {
    expect(describeCron("* * * * *")).toBe("Every minute");
  });

  it("describes interval minutes", () => {
    expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes");
    expect(describeCron("*/15 * * * *")).toBe("Every 15 minutes");
  });

  it("describes daily at time", () => {
    expect(describeCron("0 3 * * *")).toBe("Daily at 03:00");
    expect(describeCron("30 9 * * *")).toBe("Daily at 09:30");
  });

  it("describes weekly schedules", () => {
    const result = describeCron("0 9 * * 1");
    expect(result).toContain("Monday");
    expect(result).toContain("09:00");
  });

  it("describes monthly schedules", () => {
    expect(describeCron("0 0 1 * *")).toBe("Monthly on day 1 at 00:00");
  });

  it("returns empty string for invalid expressions", () => {
    expect(describeCron("invalid")).toBe("");
    expect(describeCron("")).toBe("");
  });
});

describe("CRON_PRESETS", () => {
  it("all presets are valid cron expressions", () => {
    for (const preset of CRON_PRESETS) {
      expect(isValidCron(preset.value)).toBe(true);
    }
  });

  it("all presets have non-empty labels", () => {
    for (const preset of CRON_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});
