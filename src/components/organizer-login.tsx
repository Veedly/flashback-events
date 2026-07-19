"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/brand-mark";

export function OrganizerLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/organizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("password") }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? "Не удалось войти.");
      setLoading(false);
      return;
    }

    window.location.replace("/");
  }

  return (
    <main className="organizer-login-shell">
      <section className="organizer-login-card">
        <BrandMark />
        <span className="dialog-icon"><KeyRound /></span>
        <div>
          <span className="kicker">Только для организатора</span>
          <h1>Вход в события</h1>
          <p>Гостям доступна только страница события по QR-коду.</p>
        </div>
        <form onSubmit={signIn} className="organizer-login-form">
          <label htmlFor="organizer-password">Пароль</label>
          <input
            id="organizer-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            placeholder="Введите пароль"
          />
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button className="button button-primary button-large" disabled={loading}>
            {loading ? <LoaderCircle className="spin" /> : <KeyRound />}
            {loading ? "Проверяем…" : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
