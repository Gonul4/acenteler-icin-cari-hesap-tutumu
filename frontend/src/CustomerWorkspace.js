import React, { useEffect, useRef, useState } from "react";
import {
  money,
  today,
  balanceLabel,
  signedMoney,
  netPreview,
  typeLabel,
  downloadCSV,
} from "./accountUtils";
const blankCustomer = () => ({
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  defaultPosRate: "0",
});
const blankTicket = () => ({
  route: "",
  pnr: "",
  ticketNumber: "",
  price: "",
  saleDate: today(),
  travelDate: "",
  dueDate: "",
  notes: "",
});
export function Dialog({ title, onClose, busy, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => [
      ...ref.current.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
      ),
    ];
    controls()[0]?.focus();
    const trap = (e) => {
      if (e.key === "Tab") {
        const list = controls();
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list[list.length - 1]?.focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === list[list.length - 1]
        ) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <section
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) { e.preventDefault(); onClose(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) {
            e.preventDefault(); ref.current.querySelector("form")?.requestSubmit();
          }
        }}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button aria-label="Formu kapat" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <p className="footnote">Ctrl / ⌘ + Enter: kaydet · Esc: kapat</p>
      </section>
    </div>
  );
}
export default function CustomerWorkspace({ api, user, onUnauthorized }) {
  const [businessDate, setBusinessDate] = useState(today);
  const [customers, setCustomers] = useState([]),
    [tickets, setTickets] = useState([]),
    [archivedTickets, setArchivedTickets] = useState([]),
    [selected, setSelected] = useState(null),
    [statement, setStatement] = useState(null);
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("customers");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null),
    [form, setForm] = useState({}),
    [range, setRange] = useState({ from: "", to: "" }),
    [dates, setDates] = useState({ from: "", to: "" });
  const [movementQuery, setMovementQuery] = useState("");
  const [showVoided, setShowVoided] = useState(true);
  const lock = useRef(false);
  useEffect(() => {
    const tick = setInterval(() => setBusinessDate(today()), 30000);
    const reload = () => {
      setBusinessDate(today());
      if (!lock.current && !modal) setRevision((v) => v + 1);
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 5 * 60 * 1000);
    window.addEventListener("focus", reload);
    return () => { clearInterval(tick); clearInterval(poll); window.removeEventListener("focus", reload); };
  }, [modal]);
  const fail = (e) => {
    setError(
      e.response?.data?.message ||
        "Sunucuya ulaşılamadı. Kaydetme sırasında bağlantı kesildiyse yeniden girmeden önce listeyi yenileyin.",
    );
    if (e.response?.status === 401) onUnauthorized();
  };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.get("/customers"), api.get("/tickets"), user.role === "admin" ? api.get("/tickets/archived-legacy") : Promise.resolve({ data: [] })])
      .then(([c, t, archived]) => {
        if (alive) {
          setCustomers(c.data);
          setTickets(t.data);
          setArchivedTickets(archived.data);
        }
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
  }, [revision]);
  useEffect(() => {
    if (!selected) {
      setStatement(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setStatement(null);
    api
      .get(`/customers/${selected}/statement`, { params: range })
      .then((r) => {
        if (alive) setStatement(r.data);
      })
      .catch((e) => {
        if (alive) fail(e);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, range, revision]);
  const customer =
    statement?.customer || customers.find((c) => c._id === selected);
  const summary = statement?.summary || customer?.summary;
  const unassigned = tickets.filter((t) => !t.customerId && !t.deletedAt);
  const legacyRows = view === "archived" ? archivedTickets : unassigned;
  const duePayments = customers.flatMap((c) => (c.paymentSchedule || [])
    .filter((t) => t.dueDate <= businessDate)
    .map((t) => ({ ...t, customerId: c._id, code: c.code, customerName: c.name })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.code.localeCompare(b.code));
  const visible = customers.filter(
    (c) =>
      [c.code, c.name, c.phone, c.email]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query.trim().toLocaleLowerCase("tr-TR")) &&
      (filter === "all" ||
        (filter === "debt"
          ? c.summary.balanceCents < 0
          : filter === "credit"
            ? c.summary.balanceCents > 0
            : c.summary.balanceCents === 0)),
  );
  const canEdit = (t) =>
    user.role === "admin" ||
    (t.staffId
      ? String(t.staffId) === String(user.id)
      : t.staffName === user.name);
  const refresh = () => {
    setError("");
    setRevision((v) => v + 1);
  };
  const select = (id) => {
    setSelected(id);
    setStatement(null);
    setRange({ from: "", to: "" });
    setDates({ from: "", to: "" });
    setError("");
    setNotice("");
  };
  const open = (type, record) => {
    setError("");
    if (type === "customer") setForm(record ? { ...record } : blankCustomer());
    else if (type === "ticket")
      setForm(
        record
          ? {
              ...record,
              saleDate:
                record.saleDate || record.createdAt?.slice(0, 10) || today(),
            }
          : blankTicket(),
      );
    else if (record?.source === "entry" && !["void", "history"].includes(type))
      setForm({ ...record.edit, type: record.type, version: record.version, reason: "" });
    else if (["legacy-delete", "legacy-restore"].includes(type)) setForm({});
    else if (type === "link") setForm({ customerId: selected || "" });
    else if (type === "void" || type === "cancel") setForm({ reason: "" });
    else
      setForm({
        type,
        amount: "",
        date: today(),
        method: "Kart",
        commissionMode: "percent",
        commissionValue: String(customer?.defaultPosRate || 0),
        description: {
          payment: "Tahsilat",
          debit: "Borç / devir kaydı",
          credit: "Alacak / devir kaydı",
          refund: "Müşteriye iade / ödeme",
        }[type],
        reference: "",
        account: "",
        requestId: crypto.randomUUID(),
      });
    setModal({ type, record });
  };
  const save = async (url, method, data, message, after) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.request({ url, method, data });
      setModal(null);
      after?.(r.data);
      setNotice(message);
      setRevision((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const field = (
    key,
    label,
    type = "text",
    required = false,
    maxLength = 150,
  ) => (
    <label>
      {label}
      <input
        type={type}
        value={form[key] ?? ""}
        required={required}
        maxLength={maxLength}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  const feedback = (
    <>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
    </>
  );
  const totals = customers.reduce(
    (s, c) => ({
      debt: s.debt + Math.max(0, -c.summary.balanceCents),
      credit: s.credit + Math.max(0, c.summary.balanceCents),
      commission: s.commission + c.summary.commissionCents,
    }),
    { debt: 0, credit: 0, commission: 0 },
  );
  const exportStatement = () =>
    downloadCSV(`${customer.code}-ekstre-${today()}.csv`, [
      ["Kart", customer.code, customer.name],
      ["Dönem başlangıcı", statement.openingBalanceCents / 100],
      [
        "Tarih",
        "Tür",
        "Açıklama",
        "Referans",
        "Yöntem",
        "Brüt TL",
        "Komisyon TL",
        "Borç TL",
        "Alacak TL",
        "Bakiye TL",
        "Durum",
        "Ekleyen",
      ],
      ...statement.rows.map((r) => [
        r.date || "Tarih bilinmiyor",
        typeLabel(r.type),
        r.description,
        r.reference,
        r.method || "",
        (r.grossCents || r.creditCents || r.debitCents) / 100,
        (r.commissionCents || 0) / 100,
        r.debitCents / 100,
        r.creditCents / 100,
        r.balanceCents / 100,
        r.voided ? "Geçersiz" : "Aktif",
        r.staffName,
      ]),
      ["Dönem sonu", statement.endingBalanceCents / 100],
      ["Güncel bakiye", statement.summary.balanceCents / 100],
    ]);
  const cleanLegacy = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const restoring = modal.type === "legacy-restore";
    try {
      const results = await Promise.allSettled(modal.record.map(t => api.request({
        method: "post", url: `/tickets/${t._id}/${restoring ? "restore" : "archive"}`, data: { version: t.version || 0 },
      })));
      const done = results.filter(r => r.status === "fulfilled").length;
      setModal(null); setRevision(v => v + 1);
      if (!restoring) setView("customers");
      setNotice(`${done} eski bilet ${restoring ? "geri alındı" : "silindi; Silinen eski biletler bölümünden geri alınabilir"}.`);
      const rejected = results.find(r => r.status === "rejected");
      if (rejected) fail(rejected.reason);
    } finally { lock.current = false; setBusy(false); }
  };
  const title = modal?.record?.source === "entry" && !["void", "history"].includes(modal.type) ? "Cari hareket düzenleme" :
    modal?.type === "customer"
      ? modal.record
        ? "Müşteri kartını düzenle"
        : "Yeni müşteri kartı"
      : modal?.type === "ticket"
        ? modal.record
          ? "Bileti düzenle"
          : "Yeni bilet borcu"
        : {
            payment: "Bağımsız tahsilat",
            debit: "Borç kaydı",
            credit: "Alacak kaydı",
            refund: "İade / ödeme kaydı",
            link: "Eski bileti müşteri kartına bağla",
            void: "Hareketi geçersiz kıl",
            cancel: "Bileti iptal et",
            history: "Hareket değişiklik geçmişi",
            "legacy-delete": "Eski deneme biletlerini sil",
            "legacy-restore": "Silinen eski biletleri geri al",
          }[modal?.type];
  const preview = netPreview(
    form.amount,
    form.commissionMode,
    form.commissionValue,
    form.method,
  );
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">CARİ HESAP TAKİBİ</p>
          <h1>
            {selected ? customer?.name || "Müşteri kartı" : "Müşteri kartları"}
          </h1>
          <p className="muted">
            {selected
              ? `${customer?.code || ""} · ${customer?.phone || "Telefon eklenmemiş"}`
              : "Biletler, bağımsız tahsilatlar ve müşteri bakiyeleri."}
          </p>
        </div>
        <div className="header-actions">
          {selected ? (
            <>
              <button onClick={() => select(null)}>← Kart listesi</button>
              <button
                className="primary"
                disabled={!customer || detailLoading}
                onClick={() => open("payment")}
              >
                ＋ Tahsilat
              </button>
              <button
                disabled={!customer || detailLoading}
                onClick={() => open("ticket")}
              >
                ＋ Bilet
              </button>
            </>
          ) : (
            <button className="primary" onClick={() => open("customer")}>
              ＋ Müşteri kartı aç
            </button>
          )}
        </div>
      </header>
      {!modal && feedback}
      {!selected ? (
        <>
          <section className="stats">
            <article>
              <span>Müşteri kartı</span>
              <strong>{customers.length}</strong>
              <small>Sabit kart numarasıyla takip</small>
            </article>
            <article>
              <span>Müşterilerden alacağımız</span>
              <strong className="orange">{money(totals.debt)}</strong>
              <small>Borçlu müşterilerin toplamı</small>
            </article>
            <article>
              <span>Müşterilere borcumuz</span>
              <strong className="green">{money(totals.credit)}</strong>
              <small>Fazla ödeme / avans bakiyeleri</small>
            </article>
            <article>
              <span>POS komisyonu</span>
              <strong>{money(totals.commission)}</strong>
              <small>Kaydedilen toplam kesinti</small>
            </article>
          </section>
          {!loading && duePayments.length > 0 && (
            <section className="records due-payments" aria-label="Ödeme hatırlatmaları">
              <div className="section-heading">
                <div>
                  <h2>Ödemesi gelen biletler ({duePayments.length})</h2>
                  <p className="muted">Bugün ve geciken ödemeler · Kalan: {money(duePayments.reduce((sum, t) => sum + t.remainingCents, 0))}</p>
                </div>
              </div>
              <div className="table-scroll"><table>
                <thead><tr><th>Ödeme tarihi</th><th>Müşteri / Kart</th><th>PNR / Rota</th><th>Kalan borç</th><th></th></tr></thead>
                <tbody>{duePayments.map((t) => <tr key={t.ticketId}>
                  <td><strong>{t.dueDate.split("-").reverse().join(".")}</strong><small className={t.dueDate < businessDate ? "orange" : "green"}>{t.dueDate < businessDate ? "Gecikti" : "Bugün ödenecek"}</small></td>
                  <td>{t.customerName}<small>{t.code}</small></td>
                  <td>{t.pnr || "—"}<small>{t.route || "—"}</small></td>
                  <td className="amount">{money(t.remainingCents)}</td>
                  <td><button onClick={() => select(t.customerId)}>Kartı aç</button></td>
                </tr>)}</tbody>
              </table></div>
              <p className="footnote">Tahsilat ve alacaklar en eski borçtan başlayarak düşülür. POS tahsilatında komisyon sonrası net tutar dikkate alınır.</p>
            </section>
          )}
          {unassigned.length > 0 && (
            <div className="legacy-banner">
              <div>
                <strong>
                  {unassigned.length} eski bilet müşteri kartına bağlanmayı
                  bekliyor.
                </strong>
                <p>
                  Eski kayıtlar korunuyor. Aynı isimli müşterileri telefon / PNR
                  ile kontrol edin.
                </p>
              </div>
              <button
                onClick={() =>
                  setView(view === "legacy" ? "customers" : "legacy")
                }
              >
                {view === "legacy"
                  ? "Kart listesine dön"
                  : "Eski biletleri göster"}
              </button>
            </div>
          )}
          {user.role === "admin" && <div className="extra-actions">
            <button onClick={() => setView(view === "archived" ? "customers" : "archived")}>{view === "archived" ? "Kart listesine dön" : `Silinen eski biletler (${archivedTickets.length})`}</button>
            {view === "legacy" && unassigned.length > 0 && <button className="danger" onClick={() => open("legacy-delete", [...unassigned])}>Tüm eski biletleri sil ({unassigned.length})</button>}
          </div>}
          <section className="records">
            <div className="toolbar">
              <label className="search">
                Ara
                <input
                  placeholder="Kart no, müşteri adı veya telefon…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {view === "customers" && (
                <label>
                  Bakiye durumu
                  <select
                    aria-label="Bakiye durumu"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Tüm kartlar</option>
                    <option value="debt">Müşteri borçlu</option>
                    <option value="credit">Müşteri alacaklı</option>
                    <option value="zero">Hesap dengede</option>
                  </select>
                </label>
              )}
              <button disabled={loading} onClick={refresh}>
                Yenile
              </button>
              {view === "customers" && (
                <button
                  disabled={!visible.length || loading}
                  onClick={() =>
                    downloadCSV(`cari-kartlar-${today()}.csv`, [
                      [
                        "Kart no",
                        "Müşteri",
                        "Telefon",
                        "Toplam borç TL",
                        "Toplam alacak TL",
                        "Bakiye TL",
                      ],
                      ...visible.map((c) => [
                        c.code,
                        c.name,
                        c.phone,
                        c.summary.debitCents / 100,
                        c.summary.creditCents / 100,
                        c.summary.balanceCents / 100,
                      ]),
                    ])
                  }
                >
                  CSV indir
                </button>
              )}
            </div>
            {loading ? (
              <p className="empty" role="status">
                Kartlar yükleniyor…
              </p>
            ) : ["legacy", "archived"].includes(view) ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Müşteri / PNR</th>
                      <th>Rota</th>
                      <th>Tutar</th>
                      <th>Eski tahsilat</th>
                      <th>Ekleyen</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {legacyRows
                      .filter((t) =>
                        [t.customerName, t.pnr, t.phone]
                          .join(" ")
                          .toLocaleLowerCase("tr-TR")
                          .includes(query.toLocaleLowerCase("tr-TR")),
                      )
                      .map((t) => (
                        <tr key={t._id}>
                          <td>
                            <strong>{t.customerName}</strong>
                            <small>
                              {t.pnr || t.ticketNumber || t.phone || "—"}
                            </small>
                          </td>
                          <td>{t.route || "—"}</td>
                          <td>
                            {money(Math.round((t.price || 0) * 100))}
                            {t.status === "cancelled" && <small>İptal</small>}
                          </td>
                          <td>
                            {money(
                              Math.round(
                                (t.legacyPaidAmount ||
                                  (t.isPaid && !t.payments?.length
                                    ? t.price
                                    : 0) ||
                                  0) * 100,
                              ) +
                                (t.payments || [])
                                  .filter((p) => !p.voidedAt)
                                  .reduce(
                                    (s, p) => s + Math.round(p.amount * 100),
                                    0,
                                  ),
                            )}
                          </td>
                          <td>{t.staffName}</td>
                          <td>
                            {user.role === "admin" ? (
                              <span className="row-actions">
                                {view === "archived" ? <button onClick={() => open("legacy-restore", [t])}>Geri al</button> : <>
                                  <button onClick={() => open("link", t)}>Karta bağla</button>
                                  <button className="danger" onClick={() => open("legacy-delete", [t])}>Sil</button>
                                </>}
                              </span>
                            ) : (
                              <small>Muhasebe kartla eşleştirecek</small>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : !visible.length ? (
              <div className="empty">
                <h3>
                  {error
                    ? "Kartlar yüklenemedi"
                    : customers.length
                      ? "Eşleşen kart yok"
                      : "İlk müşteri kartını açın"}
                </h3>
                <p>
                  Müşterinin biletleri ve tüm tahsilatları aynı kartta birleşir.
                </p>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Kart no</th>
                      <th>Müşteri</th>
                      <th>Toplam borç</th>
                      <th>Toplam alacak</th>
                      <th>Bakiye</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c) => (
                      <tr key={c._id}>
                        <td>
                          <span className="card-code">{c.code}</span>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => select(c._id)}
                          >
                            {c.name}
                          </button>
                          <small>{c.phone || "Telefon yok"}</small>
                        </td>
                        <td>{money(c.summary.debitCents)}</td>
                        <td>{money(c.summary.creditCents)}</td>
                        <td>
                          <strong
                            className={
                              c.summary.balanceCents < 0 ? "orange" : "green"
                            }
                          >
                            {signedMoney(c.summary.balanceCents)}
                          </strong>
                          <small>{balanceLabel(c.summary.balanceCents)}</small>
                        </td>
                        <td>
                          <button onClick={() => select(c._id)}>
                            Kartı aç
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="footnote">
            + bakiye: müşteri alacaklı. − bakiye: müşteri borçlu. Her kartın
            bakiyesi ayrı tutulur.
          </p>
        </>
      ) : (
        <>
          {detailLoading ? (
            <p className="empty" role="status">
              Cari ekstre yükleniyor…
            </p>
          ) : (
            !statement ? (
              <div className="empty">
                <p>Ekstre yüklenemedi. Tarih filtresini kaldırıp yeniden deneyebilirsiniz.</p>
                <button
                  onClick={() => {
                    setRange({ from: "", to: "" });
                    setDates({ from: "", to: "" });
                    refresh();
                  }}
                >
                  Tüm hareketleri yeniden yükle
                </button>
              </div>
            ) : (
              <>
                <section className="account-hero">
                  <div>
                    <span className="card-code">{customer.code}</span>
                    <h2>{balanceLabel(summary.balanceCents)}</h2>
                    <strong
                      className={summary.balanceCents < 0 ? "orange" : "green"}
                    >
                      {signedMoney(summary.balanceCents)}
                    </strong>
                    <p>
                      Tahsilatlar toplam müşteri borcundan düşer; fazla tutar
                      alacakta kalır.
                    </p>
                  </div>
                  <div className="account-info">
                    <p>{customer.email || "E-posta eklenmemiş"}</p>
                    {customer.address && <p>{customer.address}</p>}
                    <p>
                      Varsayılan POS komisyonu: %{customer.defaultPosRate || 0}
                    </p>
                    {user.role === "admin" && (
                      <button onClick={() => open("customer", customer)}>
                        Kart bilgilerini düzenle
                      </button>
                    )}
                  </div>
                </section>
                {customer.notes && <p className="note">{customer.notes}</p>}
                <section className="stats">
                  <article>
                    <span>Toplam borç hareketi</span>
                    <strong>{money(summary.debitCents)}</strong>
                    <small>Bilet, borç ve iade / ödeme kayıtları</small>
                  </article>
                  <article>
                    <span>Toplam alacak hareketi</span>
                    <strong>{money(summary.creditCents)}</strong>
                    <small>Net tahsilat ve alacak kayıtları</small>
                  </article>
                  <article>
                    <span>Net tahsilat</span>
                    <strong className="green">
                      {money(summary.netPaymentsCents)}
                    </strong>
                    <small>Brüt: {money(summary.grossPaymentsCents)}</small>
                  </article>
                  <article>
                    <span>POS komisyonu</span>
                    <strong>{money(summary.commissionCents)}</strong>
                    <small>Müşteri alacağına dahil edilmez</small>
                  </article>
                </section>
                {user.role === "admin" && (
                  <div className="extra-actions">
                    <button onClick={() => open("debit")}>
                      ＋ Borç / devir
                    </button>
                    <button onClick={() => open("credit")}>
                      ＋ Alacak / devir
                    </button>
                    <button onClick={() => open("refund")}>
                      İade / ödeme kaydı
                    </button>
                  </div>
                )}
                <section className="records">
                  <div className="section-heading">
                    <div>
                      <h3>Cari hesap ekstresi</h3>
                      <p className="muted">
                        İşlem tarihi sırasıyla borç, alacak ve bakiye.
                      </p>
                    </div>
                    <button onClick={() => window.print()}>Yazdır</button>
                    <button disabled={detailLoading} onClick={exportStatement}>
                      Ekstre CSV indir
                    </button>
                  </div>
                  <form
                    className="toolbar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setError("");
                      setRange({ ...dates });
                    }}
                  >
                    <label>
                      Başlangıç
                      <input
                        type="date"
                        value={dates.from}
                        onChange={(e) =>
                          setDates({ ...dates, from: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Bitiş
                      <input
                        type="date"
                        value={dates.to}
                        onChange={(e) =>
                          setDates({ ...dates, to: e.target.value })
                        }
                      />
                    </label>
                    <button>Tarihi uygula</button>
                    <button
                      type="button"
                      onClick={() => {
                        setDates({ from: "", to: "" });
                        setRange({ from: "", to: "" });
                      }}
                    >
                      Tümü
                    </button>
                    <button type="button" onClick={refresh}>
                      Yenile
                    </button>
                  </form>
                  {(range.from || range.to) && (
                    <div className="period-note">
                      Dönem başlangıcı:{" "}
                      <strong>
                        {signedMoney(statement.openingBalanceCents)}
                      </strong>{" "}
                      · Dönem sonu:{" "}
                      <strong>
                        {signedMoney(statement.endingBalanceCents)}
                      </strong>
                      {statement.unknownDateCount > 0 && (
                        <p>
                          Tarihi bilinmeyen {statement.unknownDateCount} eski
                          hareket dönem başlangıç bakiyesine dahildir.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="toolbar movement-tools">
                    <label className="search">Hareket ara<input value={movementQuery} onChange={e => setMovementQuery(e.target.value)} placeholder="Açıklama, referans, banka veya çalışan" /></label>
                    <label className="check-label"><input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} /> Geçersiz kayıtları göster</label>
                    <span className="muted">Bakiye sütunu tam ekstre sırasını korur.</span>
                  </div>
                  {!statement.rows.length ? (
                    <p className="empty">
                      Bu dönemde hareket yok. Tahsilat veya bilet
                      ekleyebilirsiniz.
                    </p>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Tarih / Tür</th>
                            <th>Açıklama</th>
                            <th>Brüt / Komisyon</th>
                            <th>Borç</th>
                            <th>Alacak</th>
                            <th>Bakiye</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.rows.filter(r => (showVoided || !r.voided) && [r.description, r.reference, r.account, r.method, r.staffName].join(" ").toLocaleLowerCase("tr-TR").includes(movementQuery.trim().toLocaleLowerCase("tr-TR"))).map((r) => (
                            <tr key={r.id} className={r.voided ? "voided" : ""}>
                              <td>
                                {r.date || "Tarih bilinmiyor"}
                                <small>
                                  {typeLabel(r.type)}
                                  {r.voided ? " · Geçersiz" : ""}
                                </small>
                              </td>
                              <td className="description-cell">
                                {r.description}
                                <small>
                                  {[
                                    r.reference,
                                    r.method,
                                    r.account,
                                    r.staffName,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                                {r.voided && (
                                  <small>Gerekçe: {r.voidReason}</small>
                                )}
                              </td>
                              <td>
                                {r.type === "payment"
                                  ? money(r.grossCents)
                                  : "—"}
                                {r.commissionCents > 0 && (
                                  <small>
                                    Kesinti: {money(r.commissionCents)}
                                  </small>
                                )}
                              </td>
                              <td>
                                {r.debitCents ? money(r.debitCents) : "—"}
                              </td>
                              <td>
                                {r.creditCents ? money(r.creditCents) : "—"}
                              </td>
                              <td className="amount">
                                {signedMoney(r.balanceCents)}
                              </td>
                              <td>
                                {user.role === "admin" &&
                                  !r.voided &&
                                  r.source === "entry" && (
                                    <span className="row-actions">
                                      <button className="small-button" onClick={() => open(r.type, r)}>Düzenle</button>
                                      <button className="small-button danger" onClick={() => open("void", r)}>Geçersiz kıl</button>
                                    </span>
                                  )}
                                {r.history?.length > 0 && <button className="small-button" onClick={() => open("history", r)}>Geçmiş ({r.history.length})</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <section className="records account-tickets">
                  <div className="section-heading">
                    <h3>Bu karta bağlı biletler</h3>
                    <button onClick={() => open("ticket")}>
                      ＋ Bilet ekle
                    </button>
                  </div>
                  {statement.tickets.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>PNR / Bilet</th>
                            <th>Rota / Seyahat</th>
                            <th>Tutar</th>
                            <th>Ödeme tarihi</th>
                            <th>Durum</th>
                            <th>Ekleyen</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.tickets.map((t) => (
                            <tr key={t._id}>
                              <td>
                                {t.pnr || t.ticketNumber || "—"}
                                <small>
                                  {t.saleDate ||
                                    t.createdAt?.slice(0, 10) ||
                                    "—"}
                                </small>
                              </td>
                              <td>
                                {t.route || "—"}
                                <small>{t.travelDate || "—"}</small>
                                {t.notes && (
                                  <small className="description-cell">
                                    {t.notes}
                                  </small>
                                )}
                              </td>
                              <td>{money(Math.round((t.price || 0) * 100))}</td>
                              <td>{t.dueDate ? t.dueDate.split("-").reverse().join(".") : "—"}</td>
                              <td>
                                {t.status === "cancelled" ? "İptal" : "Aktif"}
                              </td>
                              <td>{t.staffName}</td>
                              <td>
                                {canEdit(t) && t.status !== "cancelled" && (
                                  <div className="row-actions">
                                    <button onClick={() => open("ticket", t)}>
                                      Düzenle
                                    </button>
                                    <button
                                      className="danger"
                                      onClick={() => open("cancel", t)}
                                    >
                                      İptal
                                    </button>
                                  </div>
                                )}

                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="empty">
                      Bu kartta henüz bilet yok. Bilet olmadan da tahsilat
                      girebilirsiniz.
                    </p>
                  )}
                </section>
              </>
            )
          )}
        </>
      )}
      {modal && (
        <Dialog title={title} busy={busy} onClose={() => setModal(null)}>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {modal.type === "customer" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  modal.record
                    ? `/customers/${modal.record._id}`
                    : "/customers",
                  modal.record ? "put" : "post",
                  { ...form, version: modal.record?.version || 0 },
                  "Müşteri kartı kaydedildi.",
                  (d) => select(d._id),
                );
              }}
            >
              <div className="form-grid">
                {field("name", "Müşteri adı", "text", true)}
                {field("phone", "Telefon", "text", false, 40)}
                {field("email", "E-posta", "email")}
                {field(
                  "defaultPosRate",
                  "Varsayılan POS komisyonu (%)",
                  "number",
                )}
                <label className="wide">
                  Adres
                  <textarea
                    maxLength={500}
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                  />
                </label>
                <label className="wide">
                  Notlar
                  <textarea
                    maxLength={2000}
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="muted">
                Kart numarası otomatik oluşturulur ve değişmez. Aynı isimli
                kişiler için ayrı kart açabilirsiniz.
              </p>
              <button className="primary" disabled={busy}>
                {busy ? "Kaydediliyor…" : "Kartı kaydet"}
              </button>
            </form>
          ) : modal.type === "ticket" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  modal.record ? `/tickets/${modal.record._id}` : "/tickets",
                  modal.record ? "put" : "post",
                  {
                    ...form,
                    customerId: selected,
                    version: modal.record?.version || 0,
                  },
                  "Bilet borcu kaydedildi.",
                );
              }}
            >
              <p className="note">
                {customer?.code} · {customer?.name} — bilet tutarı bu kartın
                borcuna eklenir.
              </p>
              <div className="form-grid">
                {field("pnr", "PNR", "text", false, 50)}
                {field("ticketNumber", "Bilet numarası", "text", false, 80)}
                {field("route", "Rota", "text", false, 200)}
                {field("price", "Bilet tutarı (TL)", "number", true)}
                {field("saleDate", "Satış tarihi", "date", true)}
                {field("travelDate", "Seyahat tarihi", "date")}
                {field("dueDate", "Ödeme tarihi (isteğe bağlı)", "date")}
                <label className="wide">
                  Notlar
                  <textarea
                    maxLength={2000}
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="muted">Ödeme tarihi geldiğinde kalan borç ana sayfada hatırlatılır. Geçmiş tarihler gecikmiş olarak görünür.</p>
              <div className="dialog-actions">
                <button className="primary" disabled={busy}>
                  {busy ? "Kaydediliyor…" : "Bileti kaydet"}
                </button>
              </div>
            </form>
          ) : ["legacy-delete", "legacy-restore"].includes(modal.type) ? (
            <form onSubmit={e => { e.preventDefault(); cleanLegacy(); }}>
              <p>{modal.record.length} eski bilet {modal.type === "legacy-delete" ? "listeden kaldırılacak. Müşteri kartları ve cari bakiyeler etkilenmez. Kayıtlar Silinen eski biletler bölümünden geri alınabilir." : "eski bilet listesine geri alınacak."}</p>
              <ul>{modal.record.map(t => <li key={t._id}>{t.customerName} · {t.pnr || t.route || "PNR yok"} · {money(Math.round(t.price * 100))}</li>)}</ul>
              <div className="dialog-actions"><button type="button" disabled={busy} onClick={() => setModal(null)}>Vazgeç</button><button className="danger" disabled={busy}>{busy ? "İşleniyor…" : modal.type === "legacy-delete" ? "Biletleri sil" : "Geri almayı onayla"}</button></div>
            </form>
          ) : modal.type === "link" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  `/tickets/${modal.record._id}/customer`,
                  "put",
                  {
                    customerId: form.customerId,
                    version: modal.record.version || 0,
                  },
                  "Eski bilet ve önceki tahsilatları müşteri kartına bağlandı.",
                );
              }}
            >
              <p>
                <strong>{modal.record.customerName}</strong> ·{" "}
                {modal.record.pnr || modal.record.route} ·{" "}
                {money(Math.round((modal.record.price || 0) * 100))}
              </p>
              <label>
                Müşteri kartı
                <select
                  aria-label="Müşteri kartı"
                  required
                  value={form.customerId}
                  onChange={(e) =>
                    setForm({ ...form, customerId: e.target.value })
                  }
                >
                  <option value="">Kart seçin</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.code} · {c.name} · {c.phone}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Biletin borcu ve önceki ödemeleri aynı karta dahil olur.
                Müşteriyi kontrol ederek seçin.
              </p>
              <button className="primary" disabled={busy || !form.customerId}>
                {busy ? "Bağlanıyor…" : "Karta bağla"}
              </button>
            </form>
          ) : modal.type === "history" ? (
            <div className="audit-list">
              <p>{modal.record.description}</p>
              {modal.record.history.map((h, i) => <section key={i} className="note">
                <strong>{new Date(h.date).toLocaleString("tr-TR")} · {h.staffName}</strong>
                <p>Gerekçe: {h.reason}</p>
                <table><thead><tr><th>Alan</th><th>Önce</th><th>Sonra</th></tr></thead><tbody>
                  {[["date", "Tarih"], ["amountCents", "Brüt"], ["commissionCents", "Komisyon"], ["netCents", "Net"], ["method", "Yöntem"], ["description", "Açıklama"], ["reference", "Referans"], ["account", "Banka / POS"]].map(([k,l]) => <tr key={k}><td>{l}</td><td>{k.endsWith("Cents") ? money(h.before[k]) : h.before[k] || "—"}</td><td>{k.endsWith("Cents") ? money(h.after[k]) : h.after[k] || "—"}</td></tr>)}
                </tbody></table>
              </section>)}
            </div>
          ) : modal.type === "void" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  `/customers/${selected}/entries/${modal.record.sourceId}/void`,
                  "post",
                  { reason: form.reason },
                  "Hareket geçersiz kılındı. Kaydı korunuyor.",
                );
              }}
            >
              <p>
                {modal.record.description} — bu hareket bakiye hesabından
                çıkarılacak; geçmişte saklanacak.
              </p>
              <label>
                Düzeltme gerekçesi
                <textarea
                  required
                  maxLength={500}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </label>
              <div className="dialog-actions">
                <button className="danger" disabled={busy}>
                  Düzeltmeyi onayla
                </button>
              </div>
            </form>
          ) : modal.type === "cancel" ? (
            <>
              <p>
                {modal.record.pnr || modal.record.route} bileti iptal edilecek,
                borcu hesaptan düşecek. Tahsilatlar müşteri hesabında kalır;
                ödeme iadesini ayrıca kaydedebilirsiniz.
              </p>
              <div className="dialog-actions">
                <button disabled={busy} onClick={() => setModal(null)}>
                  Vazgeç
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    save(
                      `/tickets/${modal.record._id}/cancel`,
                      "post",
                      { version: modal.record.version || 0 },
                      "Bilet iptal edildi; cari bakiye güncellendi.",
                    )
                  }
                >
                  İptali onayla
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  modal.record?.source === "entry" ? `/customers/${selected}/entries/${modal.record.sourceId}` : `/customers/${selected}/entries`,
                  modal.record?.source === "entry" ? "put" : "post",
                  {
                    ...form,
                    commissionValue:
                      modal.type === "payment" && form.method === "Kart"
                        ? form.commissionValue
                        : 0,
                  },
                  "Cari hareket kaydedildi.",
                );
              }}
            >
              <p className="note">
                {customer?.code} · {customer?.name} · Güncel:{" "}
                {signedMoney(summary?.balanceCents || 0)}
              </p>
              {modal.record?.source === "entry" && <label>Düzeltme gerekçesi<textarea required maxLength={500} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>}
              <div className="form-grid">
                {field(
                  "amount",
                  modal.type === "payment" && form.method === "Kart"
                    ? "Karttan çekilen brüt tutar (TL)"
                    : "Tutar (TL)",
                  "number",
                  true,
                )}
                {field("date", "İşlem tarihi", "date", true)}
                {["payment", "refund"].includes(modal.type) && (
                  <label>
                    Ödeme yöntemi
                    <select
                      aria-label="Ödeme yöntemi"
                      value={form.method}
                      onChange={(e) =>
                        setForm({ ...form, method: e.target.value })
                      }
                    >
                      {["Kart", "Havale", "Nakit"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                )}
                {modal.type === "payment" && form.method === "Kart" && (
                  <>
                    <label>
                      Komisyon türü
                      <select
                        aria-label="Komisyon türü"
                        value={form.commissionMode}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            commissionMode: e.target.value,
                            commissionValue: "0",
                          })
                        }
                      >
                        <option value="percent">Yüzde (%)</option>
                        <option value="fixed">Sabit tutar (TL)</option>
                      </select>
                    </label>
                    {field(
                      "commissionValue",
                      form.commissionMode === "percent"
                        ? "Komisyon oranı (%)"
                        : "Komisyon tutarı (TL)",
                      "number",
                    )}
                  </>
                )}
                {["payment", "refund"].includes(modal.type) &&
                  field("account", "Banka / POS adı", "text", false, 100)}
                {field("reference", "Referans / dekont no", "text", false, 100)}
                <label className="wide">
                  Açıklama
                  <textarea
                    required
                    maxLength={500}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
              </div>
              {modal.type === "payment" && (
                <div className="net-preview">
                  <span>
                    Brüt: {money(preview.gross)} · Komisyon:{" "}
                    {money(preview.fee)}
                  </span>
                  <strong>
                    Cariye işlenecek net alacak: {money(preview.net)}
                  </strong>
                  <small>
                    Fazla ödeme müşterinin alacak bakiyesi olarak kalır.
                  </small>
                </div>
              )}
              {modal.type === "refund" && (
                <p className="muted">
                  Müşteriye yapılan ödeme / iade hesabın alacağını azaltır. Bu
                  kayıt banka transferi yapmaz.
                </p>
              )}
              <div className="dialog-actions">
                <button className="primary" disabled={busy}>
                  {busy ? "Kaydediliyor…" : "Hareketi kaydet"}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
