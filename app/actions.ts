"use server";

import { revalidatePath } from "next/cache";
import { BookingError, changeBooking, publishSlot, requestSlot } from "@/lib/booking";
import { ProfileError, saveProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";

export type Result = { message: string; error?: boolean };
type Operation = "profile" | "publish" | "request" | "change";

export async function submit(operation: Operation, _: Result, data: FormData): Promise<Result> {
  const user = await requireUser();
  try {
    switch (operation) {
      case "profile":
        await saveProfile(user.id, data);
        break;
      case "publish":
        await publishSlot(user.id, String(data.get("start")));
        break;
      case "request":
        await requestSlot(user.id, String(data.get("slot")), String(data.get("skill")));
        break;
      case "change":
        await changeBooking(user.id, String(data.get("booking")), String(data.get("action")));
        break;
      default:
        return { error: true, message: "Invalid operation." };
    }
  } catch (error) {
    if (error instanceof BookingError || error instanceof ProfileError) {
      return { error: true, message: error.message };
    }
    console.error("SkillSwap operation failed", operation, error instanceof Error ? error.name : "Unknown error");
    return { error: true, message: "The operation could not be saved. Please try again." };
  }
  revalidatePath("/", "layout");
  return { message: { profile: "Profile saved.", publish: "Slot published.", request: "Request sent.", change: "Session updated." }[operation] };
}
