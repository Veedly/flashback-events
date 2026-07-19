import { createGuestSession } from "@/lib/server-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/events/[eventId]/guests/session">,
) {
  try {
    const { eventId } = await context.params;
    const body = (await request.json()) as {
      displayName?: string;
      guestId?: string;
      guestToken?: string;
    };
    const session = await createGuestSession(eventId, body);
    return Response.json(session, { status: body.displayName ? 201 : 200 });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    const message = status === 401
      ? "Не удалось восстановить профиль гостя."
      : status === 400
        ? "Введите имя длиной до 40 символов."
        : "Не удалось войти в событие.";
    return Response.json({ error: message }, { status });
  }
}
