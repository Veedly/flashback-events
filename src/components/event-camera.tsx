"use client";

import {
  Aperture,
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  Images,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { applyFilmEffect, type FilmPreset } from "@/lib/film";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { EventDetails, UploadTicket } from "@/lib/types";

const presets: { id: FilmPreset; label: string; swatch: string }[] = [
  { id: "gold", label: "Gold 200", swatch: "#cf9d5a" },
  { id: "sunset", label: "Sunset", swatch: "#d86842" },
  { id: "noir", label: "Noir", swatch: "#34322f" },
];

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function EventCamera({ eventId, initialEvent }: { eventId: string; initialEvent: EventDetails | null }) {
  const [event, setEvent] = useState<EventDetails | null>(initialEvent);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [preset, setPreset] = useState<FilmPreset>("gold");
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

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
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const processPhoto = useCallback(async (file: File, nextPreset: FilmPreset) => {
    setProcessing(true);
    setError("");
    try {
      const blob = await applyFilmEffect(file, nextPreset);
      setProcessedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setProcessing(false);
    }
  }, []);

  async function pickPhoto(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    change.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Выберите фотографию.");
      return;
    }
    setSourceFile(file);
    setSent(false);
    await processPhoto(file, preset);
  }

  async function choosePreset(nextPreset: FilmPreset) {
    setPreset(nextPreset);
    if (sourceFile) await processPhoto(sourceFile, nextPreset);
  }

  async function uploadPhoto() {
    if (!processedBlob) return;
    setUploading(true);
    setError("");
    try {
      const ticketResponse = await fetch(`/api/events/${eventId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: processedBlob.size, contentType: "image/jpeg" }),
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

  return (
    <main className="guest-shell">
      <header className="guest-header">
        <BrandMark compact />
        <span className="live-pill"><i /> Камера открыта</span>
      </header>

      <section className="event-intro">
        <span className="eyebrow"><Sparkles size={14} /> Общий альбом</span>
        <h1>{event.title}</h1>
        <p>{formatEventDate(event.date)}{event.location && <><span>·</span><MapPin size={14} /> {event.location}</>}</p>
      </section>

      {!sourceFile ? (
        <section className="capture-card">
          <div className="viewfinder">
            <span className="corner corner-tl" /><span className="corner corner-tr" />
            <span className="corner corner-bl" /><span className="corner corner-br" />
            <Aperture size={54} strokeWidth={1.35} />
            <h2>Поймайте момент</h2>
            <p>Кадр получит мягкий плёночный цвет, зерно и виньетку.</p>
          </div>
          <input ref={cameraInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={pickPhoto} />
          <input ref={galleryInput} className="visually-hidden" type="file" accept="image/*" onChange={pickPhoto} />
          <button className="shutter-button" onClick={() => cameraInput.current?.click()}>
            <span><Camera size={28} /></span> Снять фото
          </button>
          <button className="gallery-button" onClick={() => galleryInput.current?.click()}><ImagePlus size={18} /> Выбрать из галереи</button>
          <p className="privacy-note">Фото отправится только после вашего подтверждения.</p>
        </section>
      ) : (
        <section className="editor-card">
          <div className="photo-preview">
            {previewUrl && <Image src={previewUrl} alt="Предпросмотр фотографии" fill unoptimized sizes="(max-width: 680px) 100vw, 640px" />}
            {processing && <div className="processing-overlay"><LoaderCircle className="spin" /><span>Проявляем плёнку…</span></div>}
            <div className="film-stamp">FLASHBACK · {new Date().getFullYear()}</div>
          </div>
          <div className="editor-copy">
            <span className="kicker">Плёночный профиль</span>
            <h2>Выберите настроение</h2>
          </div>
          <div className="preset-row">
            {presets.map((item) => (
              <button key={item.id} className={`preset ${preset === item.id ? "preset-active" : ""}`} onClick={() => void choosePreset(item.id)} disabled={processing}>
                <i style={{ background: item.swatch }} />
                <span>{item.label}</span>
                {preset === item.id && <Check size={15} />}
              </button>
            ))}
          </div>
          {error && <div className="notice notice-error">{error}</div>}
          {sent ? (
            <div className="sent-panel">
              <span><Check /></span><div><strong>Кадр в альбоме</strong><p>Спасибо! Можно снять ещё один.</p></div>
              <button className="button button-secondary" onClick={resetCapture}><Camera size={18} /> Ещё кадр</button>
            </div>
          ) : (
            <div className="editor-actions">
              <button className="button button-secondary" onClick={resetCapture}><RefreshCw size={18} /> Переснять</button>
              <button className="button button-primary" onClick={uploadPhoto} disabled={processing || uploading || !processedBlob}>
                {uploading ? <LoaderCircle className="spin" /> : <Send size={18} />}
                {uploading ? "Отправляем…" : "В общий альбом"}
              </button>
            </div>
          )}
        </section>
      )}

      {event.photos.length > 0 && (
        <section className="guest-gallery">
          <div className="section-heading guest-gallery-heading">
            <div><span className="kicker">Уже проявлено</span><h2>Последние кадры</h2></div>
            <span className="gallery-count"><Images size={17} /> {event.photoCount}</span>
          </div>
          <div className="photo-grid">
            {event.photos.slice(0, 9).map((photo, index) => (
              <div className="gallery-photo" key={photo.id}>
                <Image src={photo.url} alt={`Фото гостя ${index + 1}`} fill unoptimized sizes="(max-width: 600px) 33vw, 220px" />
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="guest-footer">Снимайте живое. Остальное сделает плёнка.</footer>
    </main>
  );
}
