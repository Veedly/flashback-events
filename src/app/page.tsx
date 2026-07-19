import { OrganizerDashboard } from "@/components/organizer-dashboard";
import { listEvents } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <OrganizerDashboard initialEvents={await listEvents()} />;
}
