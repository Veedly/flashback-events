import { createEvent, listEvents } from "@/lib/server-store";
import { isOrganizerAuthenticated } from "@/lib/organizer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isOrganizerAuthenticated())) {
    return Response.json({ error: "Требуется вход организатора." }, { status: 401 });
  }
  return Response.json({ events: await listEvents() });
}

export async function POST(request: Request) {
  if (!(await isOrganizerAuthenticated())) {
    return Response.json({ error: "Требуется вход организатора." }, { status: 401 });
  }
  const body = (await request.json()) as {
    title?: string;
    date?: string;
    location?: string;
    guestPhotoLimit?: number | null;
  };

  if (!body.title?.trim() || !body.date) {
    return Response.json(
      { error: "Укажите название и дату события." },
      { status: 400 },
    );
  }

  const event = await createEvent({
    title: body.title,
    date: body.date,
    location: body.location ?? "",
    guestPhotoLimit: body.guestPhotoLimit === 20 || body.guestPhotoLimit === 50 || body.guestPhotoLimit === 100
      ? body.guestPhotoLimit
      : null,
  });
  return Response.json({ event }, { status: 201 });
}
