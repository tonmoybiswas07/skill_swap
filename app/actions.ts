"use server";

import { revalidatePath } from "next/cache";
import { BookingError, changeBooking, publishSlots, removeSlot, requestSlot } from "@/lib/booking";
import { CampusError, sendCampusCode, verifyCampusCode } from "@/lib/campus";
import { leaveFeedback } from "@/lib/feedback";
import { markNotificationsRead } from "@/lib/notifications";
import { ProfileError, saveProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";

export type Result = { message: string; error?: boolean };
const messages = {
  profile: "Profile saved.", publish: "Availability published.", remove: "Slot removed.",
  request: "Request sent.", change: "Session updated.", feedback: "Feedback published.",
  "read-inbox": "Notifications marked as read.", "send-campus-code": "Check your institutional email for the code.",
  "verify-campus-code": "Campus email verified.",
};
type Operation = keyof typeof messages;

export async function submit(operation: Operation, _: Result, data: FormData): Promise<Result> {
  const user = await requireUser();
  try {
    switch (operation) {
      case "profile":
        await saveProfile(user.id, data);
        break;
      case "publish":
        await publishSlots(user.id, data.getAll("starts").map(String));
        break;
      case "remove":
        await removeSlot(user.id, String(data.get("slot")));
        break;
      case "request":
        await requestSlot(user.id, String(data.get("slot")), String(data.get("skill")));
        break;
      case "change":
        await changeBooking(user.id, String(data.get("booking")), String(data.get("action")), String(data.get("reason") ?? ""));
        break;
      case "feedback":
        await leaveFeedback(user.id, String(data.get("booking")), Number(data.get("rating")), String(data.get("comment") ?? ""));
        break;
      case "read-inbox":
        await markNotificationsRead(user.id);
        break;
      case "send-campus-code":
        await sendCampusCode(user.id, user.email);
        break;
      case "verify-campus-code":
        await verifyCampusCode(user.id, user.email, String(data.get("code") ?? "").trim());
        break;
      default:
        return { error: true, message: "Invalid operation." };
    }
  } catch (error) {
    if (error instanceof BookingError || error instanceof ProfileError || error instanceof CampusError) {
      return { error: true, message: error.message };
    }
    console.error("SkillSwap operation failed", operation, error instanceof Error ? error.name : "Unknown error");
    return { error: true, message: "The operation could not be saved. Please try again." };
  }
  revalidatePath("/", "layout");
  return { message: messages[operation] };
}
