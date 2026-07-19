import { redirect } from "next/navigation";
import { OrganizerLogin } from "@/components/organizer-login";
import { isOrganizerAuthenticated } from "@/lib/organizer-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let authenticated = false;
  try {
    authenticated = await isOrganizerAuthenticated();
  } catch {}

  if (authenticated) redirect("/");

  return <OrganizerLogin />;
}
