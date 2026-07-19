import { getEvent } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/events/[eventId]">,
) {
  try {
    const { eventId } = await context.params;
    const event = await getEvent(eventId);
    if (!event) {
      return Response.json({ error: "Событие не найдено." }, { status: 404 });
    }
    return Response.json({ event });
  } catch {
    return Response.json({ error: "Некорректная ссылка." }, { status: 400 });
  }
}
