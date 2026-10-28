import { customerInput, ticketInput, entryInput, ledgerRows, summarize, statement, paymentSchedule, text, badRequest } from "./demoRules";

const KEY = "acente-cari-portfolio-v1";
const user = { id: "demo-user", _id: "demo-user", name: "Yerel Demo", role: "admin", username: "demo" };
const clone = (value) => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const date = (offset) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() + offset * 86400000));
function initialState() {
  const customers = ["Örnek Müşteri A", "Örnek Müşteri B", "Örnek Müşteri C"].map((name, i) => ({
    _id: `demo-c${i + 1}`, code: `C00000${i + 1}`, name, phone: "", email: "", address: "", notes: "Hayalî demo verisi", defaultPosRate: 2, version: 0, staffName: user.name, history: [], createdAt: stamp(),
  }));
  const tickets = customers.map((c, i) => ({
    _id: `demo-t${i + 1}`, customerId: c._id, customerName: c.name, price: [10000, 8000, 12000][i], route: ["IST-AYT", "IST-ESB", "IST-ADB"][i], pnr: `DEMO0${i + 1}`, ticketNumber: "", saleDate: date(-7), travelDate: date(10), dueDate: date([0, -1, 7][i]), notes: "Gerçek yolcu içermez", staffId: user.id, staffName: user.name, version: 0, status: "active", history: [], payments: [], createdAt: stamp(),
  }));
  const entries = [{ _id: "demo-e1", customerId: customers[0]._id, type: "payment", amountCents: 300000, commissionCents: 6000, netCents: 294000, commissionMode: "percent", commissionValue: 2, method: "Kart", date: date(-1), description: "Örnek POS tahsilatı", reference: "", account: "", staffName: user.name, staffId: user.id, requestId: id(), version: 0, history: [], createdAt: stamp() }];
  return { schema: 1, sequence: 3, customers, tickets, entries };
}
let memory;
export function localStorageAvailable() {
  try { const key = `${KEY}-check`; localStorage.setItem(key, "1"); localStorage.removeItem(key); return true; }
  catch { return false; }
}
function read() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch { /* Some file viewers block storage. */ }
  if (raw) {
    let state;
    try { state = JSON.parse(raw); } catch { throw badRequest("Yerel demo verisi okunamadı. Örnek verileri sıfırlayabilirsiniz."); }
    if (state.schema !== 1 || !Array.isArray(state.customers) || !Array.isArray(state.tickets) || !Array.isArray(state.entries))
      throw badRequest("Yerel demo verisinin biçimi geçersiz.");
    return state;
  }
  if (!memory) { memory = initialState(); write(memory); }
  return clone(memory);
}
function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch {
    if (localStorageAvailable()) throw badRequest("Tarayıcı depolama alanı dolu. Kayıt kaydedilemedi.");
  }
  memory = clone(state);
}
export function resetLocalDemo() { const state = initialState(); write(state); }
const getCustomer = (state, key) => {
  const customer = state.customers.find((c) => c._id === key);
  if (!customer) throw badRequest("Müşteri bulunamadı.", 404);
  return customer;
};
const versionCheck = (record, version) => { if (version !== record.version) throw badRequest("Kayıt başka sekmede değişti. Yenileyin.", 409); };

async function request({ url, method = "get", data = {}, params = {} }) {
  try {
    method = method.toLowerCase();
    const state = read();
    const [resource, key, child, entryId, action] = url.split("/").filter(Boolean);
    let result;
    if (resource === "auth" && key === "me") return { data: { user } };
    if (resource === "tickets" && method === "get")
      return { data: clone(key === "archived-legacy" ? state.tickets.filter((t) => t.deletedAt) : state.tickets.filter((t) => !t.deletedAt)) };
    if (resource === "customers" && !key && method === "get")
      return { data: state.customers.map((c) => {
        const tickets = state.tickets.filter((t) => t.customerId === c._id && !t.deletedAt);
        const entries = state.entries.filter((e) => e.customerId === c._id);
        return { ...c, summary: summarize(ledgerRows(tickets, entries)), paymentSchedule: paymentSchedule(tickets, entries) };
      }) };
    if (resource === "customers" && !key && method === "post") {
      const input = customerInput(data);
      state.sequence++;
      result = { ...input, _id: id(), code: `C${String(state.sequence).padStart(6, "0")}`, version: 0, staffName: user.name, history: [], createdAt: stamp() };
      state.customers.push(result);
    } else if (resource === "customers" && key) {
      const customer = getCustomer(state, key);
      const tickets = state.tickets.filter((t) => t.customerId === key && !t.deletedAt);
      const entries = state.entries.filter((e) => e.customerId === key);
      if (child === "statement" && method === "get")
        return { data: { customer, tickets, ...statement(ledgerRows(tickets, entries), params.from || "", params.to || "") } };
      if (!child && method === "put") {
        versionCheck(customer, data.version);
        Object.assign(customer, customerInput(data), { version: customer.version + 1 });
        result = customer;
      } else if (child === "entries" && !entryId && method === "post") {
        const input = entryInput(data, customer);
        const existing = state.entries.find((e) => e.requestId === input.requestId);
        const signature = JSON.stringify({ ...input, customerId: key });
        if (existing) {
          if (existing.signature !== signature) throw badRequest("Aynı işlem anahtarı farklı kayıt için kullanılamaz.", 409);
          return { data: clone(existing) };
        }
        result = { ...input, signature, _id: id(), customerId: key, version: 0, history: [], staffId: user.id, staffName: user.name, createdAt: stamp() };
        state.entries.push(result);
      } else if (child === "entries" && entryId) {
        const entry = entries.find((e) => e._id === entryId);
        if (!entry || entry.voidedAt) throw badRequest("Hareket bulunamadı veya geçersiz.", 409);
        const reason = text(data.reason, "Düzeltme gerekçesi", 500, true);
        if (action === "void" && method === "post") Object.assign(entry, { voidedAt: stamp(), voidReason: reason, voidedBy: user.name });
        else if (!action && method === "put") {
          versionCheck(entry, data.version);
          const input = entryInput({ ...data, type: entry.type, requestId: entry.requestId }, customer);
          const before = Object.fromEntries(Object.keys(input).map((k) => [k, entry[k]]));
          entry.history.push({ date: stamp(), staffName: user.name, reason, before, after: input });
          Object.assign(entry, input, { version: entry.version + 1 });
        } else throw badRequest("Bu işlem yerel demoda desteklenmiyor.");
        result = entry;
      }
    } else if (resource === "tickets" && method === "post" && !key) {
      const customer = getCustomer(state, data.customerId);
      result = { ...ticketInput({ ...data, customerName: customer.name, phone: customer.phone }), _id: id(), customerId: customer._id, staffId: user.id, staffName: user.name, version: 0, status: "active", payments: [], history: [], createdAt: stamp() };
      state.tickets.push(result);
    } else if (resource === "tickets" && key) {
      const ticket = state.tickets.find((t) => t._id === key);
      if (!ticket || ticket.deletedAt || ticket.status === "cancelled") throw badRequest("Bilet bulunamadı veya iptal edilmiş.");
      versionCheck(ticket, data.version);
      if (child === "cancel" && method === "post") ticket.status = "cancelled";
      else if (!child && method === "put") {
        const customer = getCustomer(state, ticket.customerId);
        Object.assign(ticket, ticketInput({ ...data, customerName: customer.name, phone: customer.phone }));
      } else throw badRequest("Bu işlem yerel demoda desteklenmiyor.");
      ticket.version++;
      result = ticket;
    }
    if (!result) throw badRequest("Bu işlem yerel demoda desteklenmiyor.");
    write(state);
    return { data: clone(result) };
  } catch (error) {
    const failure = new Error(error.message || "Yerel demo işlemi tamamlanamadı.");
    failure.response = { status: error.status || 400, data: { message: failure.message } };
    throw failure;
  }
}
export const localDemoApi = { request, get: (url, config) => request({ url, method: "get", ...config }), post: (url, data) => request({ url, method: "post", data }) };
