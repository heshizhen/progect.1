export type DurationMinutes = 5 | 10 | 20 | 30;

export const ALLOWED_DURATIONS: DurationMinutes[] = [5, 10, 20, 30];

export type RoomStatus = "waiting" | "active" | "expired" | "left" | "under_review";

export type FarewellReason = "timeout" | "partner_left" | "self_left" | "reported";

export type ReportCategory =
  | "harassment"
  | "illegal_or_nsfw"
  | "spam_or_scam"
  | "other";

export interface ChatMessage {
  id: string;
  sender: "me" | "partner";
  type: "text" | "voice";
  text?: string;
  voiceUrl?: string;
  voiceDurationSec?: number;
  createdAtIso: string;
}

export interface AnonymousIdentitySummary {
  maskedId: string;
  createdAtIso: string;
  excludedCount: number;
}
