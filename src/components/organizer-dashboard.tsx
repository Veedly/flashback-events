"use client";

import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  Copy,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Plus,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import type { EventRecord } from "@/lib/types";

function formatDate(value: string) {
  if (!value) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function OrganizerDashboard({ initialEvents }: { initialEvents: EventRecord[] }) {
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const eventUrl =
    selected && typeof window !== "undefined"
      ? `${window.location.origin}/e/${selected.id}`
      : "";

  async function createNewEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          date: form.get("date"),
          location: form.get("location"),
          guestPhotoLimit: form.get("guestPhotoLimit") === "unlimited"
            ? null
            : Number(form.get("guestPhotoLimit")),
        }),
      });
      const data = (await response.json()) as {
        event?: EventRecord;
        error?: string;
      };
      if (!response.ok || !data.event) {
        throw new Error(data.error ?? "Не удалось создать событие.");
      }
      setEvents((current) => [data.event!, ...current]);
      setSelected(data.event);
      setShowForm(false);
      event.currentTarget.reset();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!eventUrl) return;
    await navigator.clipboard.writeText(eventUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="organizer-shell">
      <header className="topbar">
        <BrandMark />
        <span className="mode-pill">Для организатора</span>
      </header>

      <section className="hero-section">
        <div className="eyebrow"><Sparkles size={15} /> Живые кадры гостей</div>
        <h1>Событие проходит.<br />Воспоминания остаются.</h1>
        <p>
          Создайте общую камеру за минуту. Гости сканируют QR-код,
          снимают фото — и все кадры собираются у вас.
        </p>
        <button className="button button-primary button-large" onClick={() => setShowForm(true)}>
          <Plus size={20} /> Создать событие
        </button>
      </section>

      <section className="steps-grid" aria-label="Как это работает">
        <article><span>01</span><QrCode /><h2>Создайте QR</h2><p>Название, дата — и личная ссылка готова.</p></article>
        <article><span>02</span><Camera /><h2>Гости снимают</h2><p>Без приложения и регистрации, прямо в браузере.</p></article>
        <article><span>03</span><ImageIcon /><h2>Получите альбом</h2><p>Плёночные кадры сохраняются в одном месте.</p></article>
      </section>

      <section className="events-section">
        <div className="section-heading">
          <div><span className="kicker">Ваше пространство</span><h2>События</h2></div>
          {events.length > 0 && (
            <button className="button button-secondary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Новое
            </button>
          )}
        </div>

        {error && <div className="notice notice-error">{error}</div>}
        {events.length === 0 ? (
          <button className="empty-card empty-card-action" onClick={() => setShowForm(true)}>
            <span className="empty-icon"><Plus size={28} /></span>
            <h3>Здесь появится ваше первое событие</h3>
            <p>Создайте его, покажите QR гостям и наблюдайте, как растёт живой альбом.</p>
            <span className="text-link">Начать <ArrowRight size={16} /></span>
          </button>
        ) : (
          <div className="event-list">
            {events.map((item) => (
              <button className="event-card" key={item.id} onClick={() => setSelected(item)}>
                <span className="event-monogram">{item.title.slice(0, 1).toUpperCase()}</span>
                <span className="event-copy">
                  <strong>{item.title}</strong>
                  <span><CalendarDays size={14} /> {formatDate(item.date)}</span>
                  {item.location && <span><MapPin size={14} /> {item.location}</span>}
                </span>
                <span className="photo-count">{item.photoCount}<small>кадров</small></span>
                <ArrowRight className="event-arrow" size={20} />
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">
        <BrandMark compact />
        <span>Сделано для настоящих моментов</span>
      </footer>

      {showForm && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowForm(false)}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-event-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="icon-button dialog-close" onClick={() => setShowForm(false)} aria-label="Закрыть"><X /></button>
            <span className="dialog-icon"><Sparkles /></span>
            <h2 id="new-event-title">Новое событие</h2>
            <p>Заполните главное — детали можно будет настроить позже.</p>
            <form onSubmit={createNewEvent} className="event-form">
              <label>Название<input name="title" required maxLength={80} placeholder="Например, свадьба Маши и Саши" autoFocus /></label>
              <div className="form-row">
                <label>Дата<input name="date" required type="date" /></label>
                <label>Место<input name="location" maxLength={100} placeholder="Лофт «Смена»" /></label>
              </div>
              <fieldset className="limit-picker">
                <legend>Кадров на одного гостя</legend>
                <div>
                  {[
                    ["unlimited", "Без лимита"],
                    ["20", "20"],
                    ["50", "50"],
                    ["100", "100"],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input type="radio" name="guestPhotoLimit" value={value} defaultChecked={value === "unlimited"} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="button button-primary button-large" disabled={saving}>
                {saving ? <LoaderCircle className="spin" /> : <QrCode />}
                {saving ? "Создаём…" : "Создать и получить QR"}
              </button>
            </form>
          </section>
        </div>
      )}

      {selected && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="dialog qr-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="icon-button dialog-close" onClick={() => setSelected(null)} aria-label="Закрыть"><X /></button>
            <span className="kicker">Ссылка готова</span>
            <h2 id="qr-title">{selected.title}</h2>
            <p>Покажите этот код гостям или отправьте им ссылку.</p>
            <div className="qr-event-limit">
              {selected.guestPhotoLimit ? `До ${selected.guestPhotoLimit} кадров на гостя` : "Без лимита кадров"}
            </div>
            <div className="qr-frame">
              {eventUrl && <QRCodeSVG value={eventUrl} size={220} level="H" marginSize={2} bgColor="#fffdf8" fgColor="#171512" title={`QR-код события ${selected.title}`} />}
            </div>
            <div className="share-link"><span>{eventUrl}</span><button className="icon-button" onClick={copyLink} aria-label="Копировать ссылку">{copied ? <Check /> : <Copy />}</button></div>
            <a className="button button-primary button-large" href={`/e/${selected.id}`}>
              Открыть страницу гостя <ArrowRight size={19} />
            </a>
          </section>
        </div>
      )}
    </main>
  );
}
