import { completePhotoUpload } from "@/lib/server-store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/events/[eventId]/photos/complete">,
) {
  try {
    const { eventId } = await context.params;
    const body = (await request.json()) as {
      photoId?: string;
      completionToken?: string;
    };
    if (!body.photoId || !body.completionToken) {
      return Response.json({ error: "Загрузка не подтверждена." }, { status: 400 });
    }
    await completePhotoUpload(eventId, {
      photoId: body.photoId,
      completionToken: body.completionToken,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json(
      { error: "Не удалось подтвердить загрузку фотографии." },
      { status },
    );
  }
}
