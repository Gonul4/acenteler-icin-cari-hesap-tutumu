import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import CustomerWorkspace, { Dialog } from "./CustomerWorkspace";
import "./App.css";
import AccountSettings from "./AccountSettings";
const API_ROOT =
  process.env.REACT_APP_API_URL ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? `http://${window.location.hostname}:5000/api`
    : "/api");
const api = axios.create({
  baseURL: API_ROOT,
  withCredentials: true,
  timeout: 20000,
  headers: { "X-Requested-With": "XMLHttpRequest" },
});
const blankUser = () => ({
  name: "",
  username: "",
  password: "",
  role: "staff",
});
function Users({ user, onUnauthorized }) {
  const [users, setUsers] = useState([]),
    [form, setForm] = useState(blankUser),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const fail = (e) => {
    setError(
      e.response?.data?.message || "İşlem tamamlanamadı. Tekrar deneyin.",
    );
    if (e.response?.status === 401) onUnauthorized();
  };
  useEffect(() => {
    let alive = true;
    api
      .get("/users")
      .then((r) => {
        if (alive) setUsers(r.data);
      })
      .catch((e) => {
        if (alive) fail(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/users", form);
      setUsers((old) => [...old, r.data]);
      setModal(false);
      setForm(blankUser());
      setNotice("Çalışan hesabı oluşturuldu.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">EKİP YÖNETİMİ</p>
          <h1>Çalışan hesapları</h1>
          <p className="muted">
            Kişisel hesaplarla işlem sahiplerini takip edin.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setForm(blankUser());
            setModal(true);
            setError("");
          }}
        >
          ＋ Çalışan ekle
        </button>
      </header>
      {!modal && error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
      <section className="records">
        {loading ? (
          <p className="empty">Çalışanlar yükleniyor…</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Kullanıcı adı</th>
                  <th>Yetki</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td>{u.username}</td>
                    <td>
                      {u.role === "admin" ? "Yönetici / Muhasebe" : "Çalışan"}
                    </td>
                    <td>{u.active ? "Aktif" : "Pasif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="footnote padded">
          Çalışanlar kart açar, kendi biletlerini yönetir ve tahsilat ekler.
          Muhasebe borç / alacak düzeltmelerini ve eski kayıt eşleştirmelerini
          yönetir.
        </p>
      </section>
      {modal && (
        <Dialog
          title="Çalışan hesabı aç"
          busy={busy}
          onClose={() => {
            setModal(false);
            setForm(blankUser());
          }}
        >
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={save}>
            <div className="form-grid">
              <label>
                Çalışan adı
                <input
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Kullanıcı adı
                <input
                  required
                  minLength={3}
                  maxLength={50}
                  pattern="[a-zA-Z0-9._-]+"
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </label>
              <label>
                İlk parola
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </label>
              <label>
                Yetki
                <select
                  aria-label="Yetki"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="staff">Çalışan</option>
                  <option value="admin">Yönetici / Muhasebe</option>
                </select>
              </label>
            </div>
            <p className="muted">
              Parola en az 12 karakter olmalı. Giriş bilgilerini çalışana
              güvenli bir kanaldan iletin.
            </p>
            <button className="primary" disabled={busy}>
              {busy ? "Oluşturuluyor…" : "Hesabı oluştur"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export default function App() {
  const [user, setUser] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [credentials, setCredentials] = useState({ username: "", password: "" }),
    [section, setSection] = useState("customers");
  const onUnauthorized = useCallback(() => {
    setUser(null);
    setError("Oturum süresi doldu. Tekrar giriş yapın.");
  }, []);
  useEffect(() => {
    let alive = true;
    api
      .get("/auth/me")
      .then((r) => {
        if (alive) setUser(r.data.user);
      })
      .catch((e) => {
        if (alive && e.response?.status !== 401)
          setError(
            "Oturum kontrolü yapılamadı. Sunucu bağlantısını kontrol edin.",
          );
      })
      .finally(() => {
        if (alive) setAuthLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const login = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/login", credentials);
      setUser(r.data.user);
      setSection("customers");
      setCredentials({ username: "", password: "" });
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Giriş yapılamadı. Sunucu bağlantısını kontrol edin.",
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/auth/logout");
      setUser(null);
      setError("");
    } catch (e) {
      setError("Çıkış tamamlanamadı. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };
  if (authLoading)
    return (
      <main className="login-page">
        <p role="status">Oturum kontrol ediliyor…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-mark">↗</div>
          <p className="eyebrow">ACENTE CARİ TAKİP</p>
          <h1>Cari Takip</h1>
          <p className="muted">
            Portföy demosu — yalnızca hayalî örnek veriler.
          </p>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={login}>
            <label>
              Kullanıcı adı
              <input
                autoComplete="username"
                required
                value={credentials.username}
                onChange={(e) =>
                  setCredentials({ ...credentials, username: e.target.value })
                }
              />
            </label>
            <label>
              Parola
              <input
                type="password"
                autoComplete="current-password"
                required
                value={credentials.password}
                onChange={(e) =>
                  setCredentials({ ...credentials, password: e.target.value })
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
            <p className="muted">Oturumunuz bu tarayıcıda 24 saat açık kalır. Ortak cihazlarda işiniz bitince çıkış yapın.</p>
          </form>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">↗</span>
          <div>
            Cari Takip<small>Portföy demosu · Örnek veriler</small>
          </div>
        </div>
        <nav>
          <button
            className={section === "customers" ? "nav-active" : ""}
            onClick={() => setSection("customers")}
          >
            ▤ Müşteri kartları
          </button>
          {user.role === "admin" && (
            <button
              className={section === "users" ? "nav-active" : ""}
              onClick={() => setSection("users")}
            >
              ♙ Çalışan hesapları
            </button>
          )}
          <button className={section === "account" ? "nav-active" : ""} onClick={() => setSection("account")}>Hesap ayarları</button>
        </nav>
        <p className="sidebar-note">
          Her müşteriye bir kart.
          <br />
          Her harekete bir kayıt.
        </p>
        <div className="profile">
          <strong>{user.name}</strong>
          <small>
            {user.role === "admin" ? "Yönetici / Muhasebe" : "Çalışan"}
          </small>
          <button disabled={busy} onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </aside>
      <main className="workspace">
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {section === "account" ? (
          <AccountSettings api={api} user={user} onUnauthorized={onUnauthorized} onChanged={() => { setUser(null); setSection("customers"); setCredentials({ username: "", password: "" }); setError("Giriş bilgileriniz değiştirildi. Yeni bilgilerinizle giriş yapın."); }} />
        ) : section === "users" && user.role === "admin" ? (
          <Users user={user} onUnauthorized={onUnauthorized} />
        ) : (
          <CustomerWorkspace
            api={api}
            user={user}
            onUnauthorized={onUnauthorized}
          />
        )}
      </main>
    </div>
  );
}
