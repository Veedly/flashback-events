"use client";

import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Grid3X3,
  ImagePlus,
  Images,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Send,
  SwitchCamera,
  Timer,
  Trophy,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  applyFilmEffect,
  type FilmRenderOptions,
} from "@/lib/film";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { EventDetails, GuestSession, UploadTicket } from "@/lib/types";

type CameraStatus = "starting" | "ready" | "permission" | "unavailable";
type FacingMode = "environment" | "user";
type ViewMode = "camera" | "album" | "leaderboard";
type GuestStatus = "checking" | "required" | "ready";

const GUEST_STORAGE_PREFIX = "flashback-guest:";

const CAMERA_MODEL = "FLASH 98";
const CAMERA_DESCRIPTION = "одноразовая вспышка · 35 мм";

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function photoWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return "кадр";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "кадра";
  return "кадров";
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function captureVideoFrame(video: HTMLVideoElement, mirrored: boolean) {
  return new Promise<File>((resolve, reject) => {
    if (!video.videoWidth || !video.videoHeight) {
      reject(new Error("Камера ещё не готова к снимку."));
      return;
    }

    const maxSide = 2400;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Не удалось подготовить кадр."));
      return;
    }

    if (mirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Не удалось снять кадр."));
          return;
        }
        resolve(new File([blob], `flashback-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.94,
    );
  });
}

export function EventCamera({ eventId, initialEvent }: { eventId: string; initialEvent: EventDetails | null }) {
  const [event, setEvent] = useState<EventDetails | null>(initialEvent);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("starting");
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [gridEnabled, setGridEnabled] = useState(true);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [dateStamp, setDateStamp] = useState(true);
  const [colorFlash, setColorFlash] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("camera");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [guestStatus, setGuestStatus] = useState<GuestStatus>("checking");
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState("");
  const [guestSaving, setGuestSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackCameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const photoTotal = event?.photos.length ?? 0;
  const guestAtLimit = guest?.photoLimit !== null
    && guest?.photoLimit !== undefined
    && guest.photoCount >= guest.photoLimit;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      setCameraError("В этом браузере доступна только системная камера.");
      return;
    }

    stopCamera();
    setCameraStatus("starting");
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setCameraStatus("ready");
    } catch (reason) {
      const cameraReason = reason as DOMException;
      const permissionDenied = cameraReason.name === "NotAllowedError" || cameraReason.name === "SecurityError";
      setCameraStatus(permissionDenied ? "permission" : "unavailable");
      setCameraError(
        permissionDenied
          ? "Разрешите доступ к камере, чтобы открыть живой видоискатель."
          : "Камера занята или недоступна. Можно открыть системную камеру.",
      );
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (guestStatus !== "ready" || viewMode !== "camera" || sourceFile) {
      stopCamera();
      return;
    }
    const frame = window.requestAnimationFrame(() => void startCamera());
    return () => {
      window.cancelAnimationFrame(frame);
      stopCamera();
    };
  }, [guestStatus, sourceFile, startCamera, stopCamera, viewMode]);

  useEffect(() => {
    if (selectedPhotoIndex === null || photoTotal === 0) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleLightboxKeys(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape") setSelectedPhotoIndex(null);
      if (keyboardEvent.key === "ArrowLeft") {
        setSelectedPhotoIndex((current) => current === null ? null : (current - 1 + photoTotal) % photoTotal);
      }
      if (keyboardEvent.key === "ArrowRight") {
        setSelectedPhotoIndex((current) => current === null ? null : (current + 1) % photoTotal);
      }
    }

    window.addEventListener("keydown", handleLightboxKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleLightboxKeys);
    };
  }, [photoTotal, selectedPhotoIndex]);

  const loadEvent = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
      const data = (await response.json()) as { event?: EventDetails; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error ?? "Событие не найдено.");
      setEvent(data.event);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [eventId]);

  useEffect(() => {
    if (!event?.id) return;
    let cancelled = false;
    const storageKey = `${GUEST_STORAGE_PREFIX}${eventId}`;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      void Promise.resolve().then(() => {
        if (!cancelled) setGuestStatus("required");
      });
    } else {
      void (async () => {
        try {
          const credentials = JSON.parse(saved) as { guestId?: string; guestToken?: string };
          const response = await fetch(`/api/events/${eventId}/guests/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
          });
          const session = (await response.json()) as GuestSession & { error?: string };
          if (!response.ok) throw new Error(session.error ?? "Сессия гостя истекла.");
          if (!cancelled) {
            setGuest(session);
            setGuestStatus("ready");
          }
        } catch {
          window.localStorage.removeItem(storageKey);
          if (!cancelled) setGuestStatus("required");
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [event?.id, eventId]);

  async function submitGuestName(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const displayName = guestName.trim().replace(/\s+/g, " ");
    if (!displayName) return;
    setGuestSaving(true);
    setGuestError("");
    try {
      const response = await fetch(`/api/events/${eventId}/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const session = (await response.json()) as GuestSession & { error?: string };
      if (!response.ok) throw new Error(session.error ?? "Не удалось войти в событие.");
      window.localStorage.setItem(`${GUEST_STORAGE_PREFIX}${eventId}`, JSON.stringify({
        guestId: session.guestId,
        guestToken: session.guestToken,
      }));
      setGuest(session);
      setGuestStatus("ready");
      await loadEvent();
    } catch (reason) {
      setGuestError((reason as Error).message);
    } finally {
      setGuestSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const processPhoto = useCallback(async (
    file: File,
    options: FilmRenderOptions = { dateStamp, colorFlash },
  ) => {
    setProcessing(true);
    setError("");
    try {
      const blob = await applyFilmEffect(file, options);
      setProcessedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [colorFlash, dateStamp]);

  async function pickPhoto(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    change.target.value = "";
    if (!file) return;
    if (guestAtLimit) {
      setError(`Вы уже использовали все ${guest?.photoLimit} кадров.`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Выберите фотографию.");
      return;
    }
    setSourceFile(file);
    setSent(false);
    await processPhoto(file);
  }

  async function toggleDateStamp() {
    const nextValue = !dateStamp;
    setDateStamp(nextValue);
    if (sourceFile) {
      await processPhoto(sourceFile, { dateStamp: nextValue, colorFlash });
    }
  }

  async function toggleColorFlash() {
    const nextValue = !colorFlash;
    setColorFlash(nextValue);
    if (sourceFile) {
      await processPhoto(sourceFile, { dateStamp, colorFlash: nextValue });
    }
  }

  async function takePhoto() {
    if (guestAtLimit) {
      setError(`Вы уже использовали все ${guest?.photoLimit} кадров.`);
      return;
    }
    if (cameraStatus !== "ready" || !videoRef.current) {
      fallbackCameraInput.current?.click();
      return;
    }

    setError("");
    try {
      if (timerEnabled) {
        for (let remaining = 3; remaining > 0; remaining -= 1) {
          setCountdown(remaining);
          await delay(1000);
        }
        setCountdown(0);
      }

      setShutterFlash(true);
      window.setTimeout(() => setShutterFlash(false), 140);
      const file = await captureVideoFrame(videoRef.current, facingMode === "user");
      setSourceFile(file);
      setSent(false);
      await processPhoto(file);
    } catch (reason) {
      setCountdown(0);
      setError((reason as Error).message);
    }
  }

  async function uploadPhoto() {
    if (!processedBlob || !guest) return;
    if (guestAtLimit) {
      setError(`Вы уже использовали все ${guest.photoLimit} кадров.`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const ticketResponse = await fetch(`/api/events/${eventId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: processedBlob.size,
          contentType: "image/jpeg",
          guestId: guest.guestId,
          guestToken: guest.guestToken,
        }),
      });
      const ticket = (await ticketResponse.json()) as UploadTicket & { error?: string };
      if (!ticketResponse.ok) {
        throw new Error(ticket.error ?? "Не удалось подготовить загрузку фото.");
      }

      const { error: uploadError } = await getSupabaseBrowserClient().storage
        .from(process.env.NEXT_PUBLIC_SUPABASE_PHOTO_BUCKET ?? "event-photos")
        .uploadToSignedUrl(ticket.path, ticket.uploadToken, processedBlob, {
          contentType: "image/jpeg",
        });
      if (uploadError) throw uploadError;

      const completeResponse = await fetch(`/api/events/${eventId}/photos/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId: ticket.photoId,
          completionToken: ticket.completionToken,
        }),
      });
      const complete = (await completeResponse.json()) as { error?: string };
      if (!completeResponse.ok) {
        throw new Error(complete.error ?? "Не удалось подтвердить загрузку фото.");
      }
      setSent(true);
      setGuest((current) => current ? { ...current, photoCount: current.photoCount + 1 } : current);
      await loadEvent();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function resetCapture() {
    setSourceFile(null);
    setProcessedBlob(null);
    setPreviewUrl("");
    setSent(false);
    setError("");
  }

  if (!event) {
    return (
      <main className="guest-loading error-state">
        <span className="dialog-icon"><Camera /></span>
        <h1>Камера не найдена</h1>
        <p>{error || "Проверьте ссылку или попросите организатора показать QR-код ещё раз."}</p>
        <Link className="button button-secondary" href="/"><ArrowLeft size={18} /> На главную</Link>
      </main>
    );
  }

  if (guestStatus !== "ready" || !guest) {
    return (
      <main className="guest-shell camera-app-shell guest-onboarding-shell">
        <section className="guest-onboarding-card">
          <span className="guest-onboarding-kicker">Общая камера</span>
          <h1>{event.title}</h1>
          {guestStatus === "checking" ? (
            <div className="guest-onboarding-loading"><LoaderCircle className="spin" /> Возвращаем ваш профиль…</div>
          ) : (
            <form onSubmit={submitGuestName}>
              <span className="guest-avatar"><UserRound size={26} /></span>
              <h2>Как вас подписать?</h2>
              <p>Имя появится под вашими фотографиями и в рейтинге гостей.</p>
              <label>
                <span>Имя или ник</span>
                <input
                  value={guestName}
                  onChange={(change) => setGuestName(change.target.value)}
                  maxLength={40}
                  autoComplete="name"
                  placeholder="Например, Лера"
                  autoFocus
                  required
                />
              </label>
              {guestError && <div className="camera-inline-error">{guestError}</div>}
              <button className="button button-primary button-large" disabled={guestSaving || !guestName.trim()}>
                {guestSaving ? <LoaderCircle className="spin" /> : <Camera size={19} />}
                {guestSaving ? "Входим…" : "Открыть камеру"}
              </button>
              <small>Запомним вас на этом устройстве. Пароль не нужен.</small>
            </form>
          )}
        </section>
      </main>
    );
  }

  const selectedPhoto = selectedPhotoIndex === null ? null : event.photos[selectedPhotoIndex];
  return (
    <main className="guest-shell camera-app-shell">
      <section className="camera-event-strip">
        <div>
          <span>Общая камера</span>
          <h1>{event.title}</h1>
        </div>
        <aside>
          <p><CalendarDays size={13} /> {formatEventDate(event.date)}{event.location && <><i /> <MapPin size={13} /> {event.location}</>}</p>
          <div className="guest-identity"><UserRound size={14} /><strong>{guest.displayName}</strong><small>{guest.photoCount}{guest.photoLimit ? ` / ${guest.photoLimit}` : ""}</small></div>
        </aside>
      </section>

      <nav className="event-view-switcher" aria-label="Режим события">
        <button className={viewMode === "camera" ? "active" : ""} onClick={() => setViewMode("camera")} aria-pressed={viewMode === "camera"}>
          <Camera size={16} /> Камера
        </button>
        <button className={viewMode === "album" ? "active" : ""} onClick={() => setViewMode("album")} aria-pressed={viewMode === "album"}>
          <Images size={16} /> Альбом <strong>{event.photoCount}</strong>
        </button>
        <button className={viewMode === "leaderboard" ? "active" : ""} onClick={() => setViewMode("leaderboard")} aria-pressed={viewMode === "leaderboard"}>
          <Trophy size={16} /> Рейтинг
        </button>
      </nav>

      {viewMode === "camera" ? (!sourceFile ? (
        <section className="dazz-camera" aria-label="Камера события">
          <div className="camera-toolbar" aria-label="Настройки камеры">
            <button className={colorFlash ? "active" : ""} onClick={() => void toggleColorFlash()} aria-pressed={colorFlash}>
              <Zap size={17} /><span>вспышка</span>
            </button>
            <button className={timerEnabled ? "active" : ""} onClick={() => setTimerEnabled((value) => !value)} aria-pressed={timerEnabled}>
              <Timer size={17} /><span>{timerEnabled ? "3 сек" : "таймер"}</span>
            </button>
            <button className={gridEnabled ? "active" : ""} onClick={() => setGridEnabled((value) => !value)} aria-pressed={gridEnabled}>
              <Grid3X3 size={17} /><span>сетка</span>
            </button>
            <button className={dateStamp ? "active" : ""} onClick={() => void toggleDateStamp()} aria-pressed={dateStamp}>
              <CalendarDays size={17} /><span>дата</span>
            </button>
          </div>

          <div className={`live-viewfinder live-preset-flash98 ${colorFlash ? "color-flash-on" : ""}`}>
            <video
              ref={videoRef}
              className={facingMode === "user" ? "mirrored" : ""}
              autoPlay
              muted
              playsInline
            />
            <div className="live-film-grain" />
            <div className="live-vignette" />
            <div className="live-flash-halo" />
            {gridEnabled && <div className="viewfinder-grid"><i /><i /><i /><i /></div>}
            <div className="viewfinder-readout">
              <span>FLASHBACK / {CAMERA_MODEL}</span>
              <span>REC · 1×</span>
            </div>
            {dateStamp && <span className="live-date">{formatEventDate(event.date)}</span>}
            {shutterFlash && <div className="shutter-flash" />}
            {countdown > 0 && <div className="camera-countdown">{countdown}</div>}

            {cameraStatus !== "ready" && (
              <div className="camera-status-panel">
                {cameraStatus === "starting" ? (
                  <><LoaderCircle className="spin" /><strong>Запускаем камеру</strong><span>При первом входе браузер попросит разрешение.</span></>
                ) : (
                  <>
                    <Camera size={34} />
                    <strong>{cameraStatus === "permission" ? "Нужен доступ к камере" : "Откройте системную камеру"}</strong>
                    <span>{cameraError}</span>
                    {cameraStatus === "permission" && <button onClick={() => void startCamera()}>Разрешить камеру</button>}
                    {cameraStatus === "unavailable" && <button onClick={() => fallbackCameraInput.current?.click()}>Снять системной камерой</button>}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="camera-control-row">
            <button className="camera-side-control gallery-control" onClick={() => galleryInput.current?.click()} disabled={guestAtLimit} aria-label="Выбрать фотографию из галереи">
              {event.photos[0] ? <Image src={event.photos[0].url} alt="Последний кадр" fill unoptimized sizes="48px" /> : <ImagePlus size={21} />}
            </button>
            <button className="camera-shutter" onClick={() => void takePhoto()} disabled={guestAtLimit || cameraStatus === "starting" || countdown > 0} aria-label="Снять фото">
              <span />
            </button>
            <button className="camera-side-control" onClick={() => setFacingMode((value) => value === "environment" ? "user" : "environment")} aria-label="Переключить камеру">
              <SwitchCamera size={23} />
            </button>
          </div>

          <div className="camera-deck-label">
            <span>{CAMERA_MODEL}</span>
            <small>{CAMERA_DESCRIPTION}</small>
          </div>

          <input ref={fallbackCameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={pickPhoto} />
          <input ref={galleryInput} className="visually-hidden" type="file" accept="image/*" onChange={pickPhoto} />
          {guestAtLimit && <div className="camera-limit-notice"><Trophy size={17} /> Вы сняли все {guest.photoLimit} доступных кадров</div>}
          {error && <div className="camera-inline-error">{error}</div>}
          <p className="camera-privacy">Фото отправится только после подтверждения.</p>
        </section>
      ) : (
        <section className="camera-review">
          <div className="review-topline"><span>Предпросмотр</span><strong>{CAMERA_MODEL}</strong></div>
          <div className="photo-preview">
            {previewUrl && <Image src={previewUrl} alt="Предпросмотр фотографии" fill unoptimized sizes="(max-width: 680px) 100vw, 640px" />}
            {processing && <div className="processing-overlay"><LoaderCircle className="spin" /><span>Проявляем плёнку…</span></div>}
            <div className="film-stamp">FLASHBACK · {CAMERA_MODEL}</div>
          </div>

          {error && <div className="camera-inline-error">{error}</div>}
          {sent ? (
            <div className="sent-panel camera-sent-panel">
              <span><Check /></span><div><strong>Кадр в альбоме</strong><p>Проявлено и отправлено организатору.</p></div>
              <button className="button button-secondary" onClick={resetCapture}><Camera size={18} /> Ещё кадр</button>
            </div>
          ) : (
            <div className="editor-actions camera-review-actions">
              <button className="button button-secondary" onClick={resetCapture}><RefreshCw size={18} /> Переснять</button>
              <button className="button button-primary" onClick={uploadPhoto} disabled={guestAtLimit || processing || uploading || !processedBlob}>
                {uploading ? <LoaderCircle className="spin" /> : <Send size={18} />}
                {uploading ? "Отправляем…" : "В общий альбом"}
              </button>
            </div>
          )}
        </section>
      )) : viewMode === "album" ? (
        <section className="event-album" aria-label="Альбом события">
          <header className="event-album-header">
            <div>
              <span>Все воспоминания</span>
              <h2>Альбом события</h2>
              <p>Кадры появляются здесь сразу после проявки.</p>
            </div>
            <button onClick={() => setViewMode("camera")}><Camera size={17} /> Снять ещё</button>
          </header>

          {event.photos.length > 0 ? (
            <div className="event-album-grid">
              {event.photos.map((photo, index) => (
                <button className={`event-album-photo photo-shape-${index % 5}`} key={photo.id} onClick={() => setSelectedPhotoIndex(index)} aria-label={`Открыть фотографию ${index + 1}`}>
                  <Image src={photo.url} alt={`Фото события ${index + 1}`} fill unoptimized sizes="(max-width: 600px) 50vw, 260px" />
                  <span className="event-album-index">{String(index + 1).padStart(2, "0")}</span>
                  {photo.authorName && <small className="event-album-author"><UserRound size={12} /> {photo.authorName}</small>}
                </button>
              ))}
            </div>
          ) : (
            <div className="event-album-empty">
              <Images size={38} />
              <strong>Плёнка пока пустая</strong>
              <p>Станьте первым, кто добавит воспоминание в этот альбом.</p>
              <button onClick={() => setViewMode("camera")}><Camera size={17} /> Открыть камеру</button>
            </div>
          )}

          <footer className="event-album-count"><Images size={16} /> {event.photoCount} {photoWord(event.photoCount)}</footer>
        </section>
      ) : (
        <section className="event-leaderboard" aria-label="Рейтинг гостей">
          <header>
            <span>Участники события</span>
            <h2>Кто поймал больше моментов</h2>
            <p>В рейтинг попадают только фотографии, уже добавленные в общий альбом.</p>
          </header>
          {(event.leaderboard ?? []).length > 0 ? (
            <ol>
              {(event.leaderboard ?? []).map((entry, index) => (
                <li className={entry.guestId === guest.guestId ? "current" : ""} key={entry.guestId}>
                  <span className="leaderboard-rank">{index + 1}</span>
                  <span className="leaderboard-avatar"><UserRound size={18} /></span>
                  <div><strong>{entry.displayName}</strong>{entry.guestId === guest.guestId && <small>Это вы</small>}</div>
                  <b>{entry.photoCount}<small>{photoWord(entry.photoCount)}</small></b>
                </li>
              ))}
            </ol>
          ) : (
            <div className="event-leaderboard-empty"><Trophy size={34} /><strong>Рейтинг пока пуст</strong><p>Первый загруженный кадр откроет таблицу.</p></div>
          )}
        </section>
      )}

      {selectedPhoto && selectedPhotoIndex !== null && (
        <div className="album-lightbox" role="dialog" aria-modal="true" aria-label={`Фотография ${selectedPhotoIndex + 1}`}>
          <button className="album-lightbox-close" onClick={() => setSelectedPhotoIndex(null)} aria-label="Закрыть фотографию"><X size={24} /></button>
          <div className="album-lightbox-stage">
            <button onClick={() => setSelectedPhotoIndex((selectedPhotoIndex - 1 + event.photos.length) % event.photos.length)} aria-label="Предыдущая фотография"><ChevronLeft size={27} /></button>
            <div className="album-lightbox-photo">
              <Image src={selectedPhoto.url} alt={`Фото события ${selectedPhotoIndex + 1}`} fill unoptimized sizes="100vw" priority />
            </div>
            <button onClick={() => setSelectedPhotoIndex((selectedPhotoIndex + 1) % event.photos.length)} aria-label="Следующая фотография"><ChevronRight size={27} /></button>
          </div>
          <div className="album-lightbox-meta">
            <span>{selectedPhoto.authorName ? `Снял(а): ${selectedPhoto.authorName}` : `${selectedPhotoIndex + 1} / ${event.photos.length}`}</span>
            <a href={selectedPhoto.url} target="_blank" rel="noreferrer"><Download size={16} /> Открыть оригинал</a>
          </div>
        </div>
      )}

      <footer className="guest-footer camera-footer">Снимайте живое. Остальное сделает плёнка.</footer>
    </main>
  );
}
