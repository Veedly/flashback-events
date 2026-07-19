# Flashback

Мобильное веб-приложение для общей фотокамеры события. Организатор создаёт событие и QR-код, гости открывают ссылку без регистрации, снимают или выбирают фотографию, применяют плёночный WebGL-эффект и загружают JPEG в общую галерею.

## Возможности

- события с отдельными гостевыми ссылками и QR-кодами;
- камера и выбор из галереи на Android и iPhone;
- три плёночных пресета с зерном, виньеткой, засветкой и царапинами;
- приватное хранение оригиналов в Supabase Storage;
- подписанные ссылки для загрузки и просмотра;
- фоновая синхронизация готовых фотографий в Google Drive;
- PWA-манифест и адаптивный интерфейс.

## Архитектура

- Next.js 16 и React 19 — интерфейс и серверные маршруты;
- Supabase Postgres — события, фотографии и очередь синхронизации;
- Supabase Storage — приватный bucket `event-photos`;
- Supabase Edge Function `flashback-api` — API, выдача подписанных URL и Drive worker;
- Google Drive API — резервная копия обработанных JPEG в папку `Flashback Events`.

## Локальный запуск

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev -- --hostname 0.0.0.0
```

Открой `http://localhost:3000`. Для проверки с телефона используй HTTPS-deployment: доступ к камере в мобильных браузерах ограничен secure context.

## Переменные окружения Next.js

Заполни `.env.local` по шаблону `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL` — URL проекта Supabase;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — публичный ключ браузерного клиента;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — legacy anon JWT для вызова Edge Function с `verify_jwt`;
- `NEXT_PUBLIC_SUPABASE_PHOTO_BUCKET` — bucket фотографий;
- `FLASHBACK_ADMIN_TOKEN` — серверный токен панели организатора.

Google OAuth-секреты не нужны в Next.js или Vercel. Они хранятся только в Supabase Edge Function Secrets:

- `GOOGLE_DRIVE_CLIENT_ID`;
- `GOOGLE_DRIVE_CLIENT_SECRET`;
- `GOOGLE_DRIVE_REFRESH_TOKEN`.

Корневая папка Drive хранится в `app_settings.drive_root_folder_id`.

## Проверки

```powershell
npm.cmd run lint
npm.cmd run build
```

Файлы `.env*`, OAuth JSON, `.vercel`, `.next` и локальные runtime-данные исключены из Git.
