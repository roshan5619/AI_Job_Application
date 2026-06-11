import { google } from "googleapis";
import { googleClientForUser } from "./client";

/** Google Calendar helpers for interview scheduling. */

/** Busy intervals in [timeMin, timeMax). Empty array if not connected. */
export async function getBusy(
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ start: string; end: string }[]> {
  const auth = await googleClientForUser(userId);
  if (!auth) return [];
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: [{ id: "primary" }] },
  });
  const busy = res.data.calendars?.primary?.busy ?? [];
  return busy.map((b) => ({ start: b.start ?? "", end: b.end ?? "" }));
}

export interface CreatedEvent {
  eventId: string;
  htmlLink: string | null;
}

/** Create a calendar event (optionally inviting the recruiter). */
export async function createEvent(
  userId: string,
  args: {
    summary: string;
    description?: string;
    start: string; // ISO
    end: string; // ISO
    attendees?: string[];
  },
): Promise<CreatedEvent | null> {
  const auth = await googleClientForUser(userId);
  if (!auth) return null;
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: args.attendees?.map((email) => ({ email })),
    },
  });
  return { eventId: res.data.id ?? "", htmlLink: res.data.htmlLink ?? null };
}

/**
 * Propose up to `count` candidate slots over the next `days` days: weekday
 * business-hour starts (default 30 min) that don't overlap a busy interval.
 */
export function proposeSlots(
  busy: { start: string; end: string }[],
  opts: { days?: number; count?: number; durationMin?: number } = {},
): string[] {
  const days = opts.days ?? 7;
  const count = opts.count ?? 3;
  const durationMin = opts.durationMin ?? 30;
  const busyRanges = busy.map((b) => [
    new Date(b.start).getTime(),
    new Date(b.end).getTime(),
  ]);

  const slots: string[] = [];
  const now = new Date();
  for (let d = 1; d <= days && slots.length < count; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    for (const hour of [10, 14, 16]) {
      if (slots.length >= count) break;
      const start = new Date(day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + durationMin * 60_000);
      const overlaps = busyRanges.some(
        ([bs, be]) => start.getTime() < be && end.getTime() > bs,
      );
      if (!overlaps) slots.push(start.toISOString());
    }
  }
  return slots;
}
