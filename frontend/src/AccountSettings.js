import React, { useState } from "react";
export default function AccountSettings({ api, user, onChanged, onUnauthorized }) {
  const [form, setForm] = useState({ username: user.username || "", currentPassword: "", newPassword: "", confirmation: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const field = (key, label, type, autoComplete) => <label>{label}<input type={type} autoComplete={autoComplete} required minLength={key === "username" ? 3 : key === "currentPassword" ? 1 : 8} maxLength={key === "username" ? 50 : 128} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>;
  const save = async e => {
    e.preventDefault(); if (busy) return; setError("");
    if (form.newPassword !== form.confirmation) { setError("Yeni parolalar eşleşmiyor."); return; }
    setBusy(true);
    try { await api.post("/auth/account", { username: form.username, currentPassword: form.currentPassword, newPassword: form.newPassword }); setForm({ username: "", currentPassword: "", newPassword: "", confirmation: "" }); onChanged(); }
    catch (e) { setError(e.response?.data?.message || "Hesap bilgileri değiştirilemedi."); if (e.response?.status === 401) onUnauthorized(); }
    finally { setBusy(false); }
  };
  return <><header><div><p className="eyebrow">KULLANICI HESABI</p><h1>Hesap ayarları</h1><p className="muted">Kendi kullanıcı adınızı ve parolanızı değiştirin.</p></div></header>
    <section className="records" style={{ maxWidth: 640, padding: 20 }}>
      {error && <p className="message error" role="alert">{error}</p>}
      <form onSubmit={save}>
        <div className="form-grid">
          {field("username", "Yeni kullanıcı adı", "text", "username")}
          {field("currentPassword", "Mevcut parola", "password", "current-password")}
          {field("newPassword", "Yeni parola", "password", "new-password")}
          {field("confirmation", "Yeni parola tekrar", "password", "new-password")}
        </div>
        <p className="note">Parola en az 8 karakter olmalıdır. Kaydettikten sonra tüm oturumlar kapanır; yeni bilgilerinizle tekrar giriş yaparsınız. Cari kayıtlar ve işlem sahipliği korunur.</p>
        <div className="dialog-actions"><button className="primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Giriş bilgilerini değiştir"}</button></div>
      </form>
    </section></>;
}
