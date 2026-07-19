import { OrganizerDashboard } from "@/components/organizer-dashboard";
import { isOrganizerAuthenticated } from "@/lib/organizer-auth";
import { listEvents } from "@/lib/server-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  let authenticated = false;
  try {
    authenticated = await isOrganizerAuthenticated();
  } catch {}

  if (!authenticated) redirect("/login");

  return <OrganizerDashboard initialEvents={await listEvents()} />;
}
