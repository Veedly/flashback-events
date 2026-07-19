import { createPhotoUpload } from "@/lib/server-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/events/[eventId]/photos">,
) {
  try {
    const { eventId } = await context.params;
    const body = (await request.json()) as {
      size?: number;
      contentType?: string;
      guestId?: string;
      guestToken?: string;
    };
    if (
      body.contentType !== "image/jpeg" ||
      !Number.isSafeInteger(body.size) ||
      !body.guestId ||
      !body.guestToken
    ) {
      return Response.json({ error: "Некорректный JPEG-файл." }, { status: 400 });
    }
    const ticket = await createPhotoUpload(eventId, {
      size: body.size as number,
      contentType: "image/jpeg",
      guestId: body.guestId,
      guestToken: body.guestToken,
    });
    return Response.json(ticket, { status: 201 });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    const message = status === 404
      ? "Событие не найдено."
      : status === 403
        ? "Приём фотографий уже закрыт."
        : status === 401
          ? "Профиль гостя не найден. Откройте ссылку события заново."
          : status === 429
            ? "Вы уже использовали все доступные кадры."
        : "Не удалось подготовить загрузку фотографии.";
    return Response.json({ error: message }, { status });
  }
}
