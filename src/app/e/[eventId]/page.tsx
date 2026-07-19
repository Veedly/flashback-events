import type { Metadata } from "next";
import { EventCamera } from "@/components/event-camera";
import { getEvent } from "@/lib/server-store";

export const metadata: Metadata = {
  title: "Камера события",
  robots: { index: false, follow: false },
};

export default async function EventPage(
  props: PageProps<"/e/[eventId]">,
) {
  const { eventId } = await props.params;
  let event = null;
  try {
    event = await getEvent(eventId);
  } catch {
    // Invalid public IDs are rendered as a friendly not-found state.
  }
  return <EventCamera eventId={eventId} initialEvent={event} />;
}
