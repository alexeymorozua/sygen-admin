/**
 * Client-side cron expression validation and human-readable description.
 */

const CRON_FIELD = "(?:\\*(?:\\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*)";
const CRON_REGEX = new RegExp(`^${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}$`);

export function isValidCron(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeField(value: string, unit: string, names?: string[]): string {
  if (value === "*") return `every ${unit}`;
  if (value.includes("/")) {
    const [, step] = value.split("/");
    return `every ${step} ${unit}s`;
  }
  if (value.includes(",")) {
    const parts = value.split(",").map((v) => names ? (names[parseInt(v)] || v) : v);
    return parts.join(", ");
  }
  if (value.includes("-")) {
    const [from, to] = value.split("-").map((v) => names ? (names[parseInt(v)] || v) : v);
    return `${from} to ${to}`;
  }
  return names ? (names[parseInt(value)] || value) : value;
}

export function describeCron(expr: string): string {
  const trimmed = expr.trim();
  if (!CRON_REGEX.test(trimmed)) return "";

  const [minute, hour, day, month, weekday] = trimmed.split(/\s+/);

  // Common patterns
  if (minute === "*" && hour === "*" && day === "*" && month === "*" && weekday === "*") {
    return "Every minute";
  }
  if (minute.startsWith("*/") && hour === "*" && day === "*" && month === "*" && weekday === "*") {
    return `Every ${minute.split("/")[1]} minutes`;
  }
  if (hour.startsWith("*/") && day === "*" && month === "*" && weekday === "*") {
    const m = minute === "0" ? "" : `:${minute.padStart(2, "0")}`;
    return `Every ${hour.split("/")[1]} hours${m ? ` at ${m} past` : ""}`;
  }
  if (minute !== "*" && hour !== "*" && day === "*" && month === "*" && weekday === "*") {
    return `Daily at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  if (minute !== "*" && hour !== "*" && day === "*" && month === "*" && weekday !== "*") {
    const days = weekday.split(",").map((d) => WEEKDAYS[parseInt(d)] || d).join(", ");
    return `${days} at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  if (minute !== "*" && hour !== "*" && day !== "*" && month === "*" && weekday === "*") {
    return `Monthly on day ${day} at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  // Generic description
  const parts: string[] = [];
  if (minute !== "*") parts.push(`minute ${describeField(minute, "minute")}`);
  if (hour !== "*") parts.push(`hour ${describeField(hour, "hour")}`);
  if (day !== "*") parts.push(`day ${describeField(day, "day")}`);
  if (month !== "*") parts.push(`month ${describeField(month, "month")}`);
  if (weekday !== "*") parts.push(describeField(weekday, "weekday", WEEKDAYS));

  return parts.join(", ") || "Every minute";
}

/** Common cron presets for quick selection */
export const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 3:00 AM", value: "0 3 * * *" },
  { label: "Daily at 9:00 AM", value: "0 9 * * *" },
  { label: "Weekly (Mon 9:00)", value: "0 9 * * 1" },
  { label: "Monthly (1st, 00:00)", value: "0 0 1 * *" },
] as const;
