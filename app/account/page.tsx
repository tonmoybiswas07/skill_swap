import { currentUser } from "@/lib/session";
import AccountForm from "./form";

export default async function Account() {
  return <AccountForm email={(await currentUser())?.email} />;
}
