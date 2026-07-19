import {
  createOrganizerSession,
  deleteOrganizerSession,
  verifyOrganizerPassword,
} from "@/lib/organizer-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!body.password || !verifyOrganizerPassword(body.password)) {
      return Response.json({ error: "Неверный пароль." }, { status: 401 });
    }

    await createOrganizerSession();
    return Response.json({ ok: true });
  } catch (error) {
    const notConfigured = (error as Error).message === "ORGANIZER_AUTH_NOT_CONFIGURED";
    return Response.json(
      { error: notConfigured ? "Доступ организатора пока не настроен." : "Не удалось войти." },
      { status: notConfigured ? 503 : 400 },
    );
  }
}

export async function DELETE() {
  await deleteOrganizerSession();
  return Response.json({ ok: true });
}
