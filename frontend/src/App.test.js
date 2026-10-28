import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import axios from "axios";
import App from "./App";
import { netPreview, csv } from "./accountUtils";
import * as accountUtils from "./accountUtils";
jest.mock("axios", () => {
  const api = { get: jest.fn(), post: jest.fn(), request: jest.fn() };
  return { create: () => api };
});
const api = axios.create();
const user = { id: "u1", name: "Muhasebe", role: "admin" };
const summary = {
  debitCents: 800000,
  creditCents: 0,
  balanceCents: -800000,
  netPaymentsCents: 0,
  grossPaymentsCents: 0,
  commissionCents: 0,
};
const customer = {
  _id: "c1",
  code: "C000001",
  name: "Ayşe",
  phone: "111",
  defaultPosRate: 2,
  version: 0,
  summary,
};
function setup(extraCustomers = [], tickets = []) {
  let current = { ...summary };
  api.get.mockImplementation((url) => {
    if (url === "/auth/me") return Promise.resolve({ data: { user } });
    if (url === "/customers")
      return Promise.resolve({
        data: [{ ...customer, summary: current }, ...extraCustomers],
      });
    if (url === "/tickets") return Promise.resolve({ data: tickets });
    if (url.includes("/statement"))
      return Promise.resolve({
        data: {
          customer,
          summary: current,
          tickets: [],
          rows: [],
          openingBalanceCents: 0,
          endingBalanceCents: current.balanceCents,
          unknownDateCount: 0,
        },
      });
    return Promise.resolve({ data: [] });
  });
  return (value) => {
    current = value;
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, "crypto", {
    configurable: true,
    value: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
  });
});
test("ticket form saves the optional payment date", async () => {
  setup();
  api.request.mockResolvedValue({ data: {} });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Kartı aç" }));
  fireEvent.click(await screen.findByRole("button", { name: "＋ Bilet", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "Yeni bilet borcu" });
  fireEvent.change(within(dialog).getByLabelText("Bilet tutarı (TL)"), { target: { value: "10000" } });
  fireEvent.change(within(dialog).getByLabelText("Ödeme tarihi (isteğe bağlı)"), { target: { value: "2026-11-03" } });
  fireEvent.click(within(dialog).getByText("Bileti kaydet"));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    url: "/tickets", method: "post", data: expect.objectContaining({ dueDate: "2026-11-03", customerId: "c1" }),
  })));
});
test("homepage reveals a scheduled debt when its date arrives and opens the customer", async () => {
  jest.useFakeTimers();
  const date = jest.spyOn(accountUtils, "today").mockReturnValue("2026-11-02");
  try {
    setup();
    const originalGet = api.get.getMockImplementation();
    api.get.mockImplementation((url, ...args) => url === "/customers"
      ? Promise.resolve({ data: [{ ...customer, paymentSchedule: [
        { ticketId: "due", dueDate: "2026-11-03", remainingCents: 120000, pnr: "DUE03", route: "IST-AYT" },
        { ticketId: "future", dueDate: "2026-11-05", remainingCents: 500000, pnr: "LATER" },
      ] }] }) : originalGet(url, ...args));
    render(<App />);
    await screen.findByText("C000001");
    expect(screen.queryByRole("region", { name: "Ödeme hatırlatmaları" })).not.toBeInTheDocument();
    date.mockReturnValue("2026-11-03");
    act(() => jest.advanceTimersByTime(30000));
    const region = screen.getByRole("region", { name: "Ödeme hatırlatmaları" });
    expect(within(region).getByText("Bugün ödenecek")).toBeInTheDocument();
    expect(within(region).getByText("DUE03")).toBeInTheDocument();
    expect(within(region).queryByText("LATER")).not.toBeInTheDocument();
    date.mockReturnValue("2026-11-04");
    act(() => jest.advanceTimersByTime(30000));
    expect(within(region).getByText("Gecikti")).toBeInTheDocument();
    fireEvent.click(within(region).getByText("Kartı aç"));
    expect(await screen.findByText("Bu karta bağlı biletler")).toBeInTheDocument();
  } finally { date.mockRestore(); jest.useRealTimers(); }
});
test("login still uses the protected cookie API", async () => {
  api.get.mockRejectedValueOnce({ response: { status: 401 } });
  api.post.mockRejectedValueOnce({
    response: {
      status: 401,
      data: { message: "Kullanıcı adı veya parola hatalı." },
    },
  });
  render(<App />);
  fireEvent.change(await screen.findByLabelText("Kullanıcı adı"), {
    target: { value: "worker" },
  });
  fireEvent.change(screen.getByLabelText("Parola"), {
    target: { value: "wrong" },
  });
  fireEvent.click(screen.getByText("Giriş yap"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Kullanıcı adı veya parola hatalı.",
  );
  expect(api.get).not.toHaveBeenCalledWith("/customers");
});
test("distinct cards with the same name can be searched by card ID", async () => {
  setup([
    {
      ...customer,
      _id: "c2",
      code: "C000002",
      phone: "222",
      summary: { ...summary, balanceCents: 10000 },
    },
  ]);
  render(<App />);
  await screen.findByText("C000002");
  fireEvent.change(
    screen.getByPlaceholderText("Kart no, müşteri adı veya telefon…"),
    { target: { value: "C000001" } },
  );
  expect(screen.queryByText("C000002")).not.toBeInTheDocument();
  expect(screen.getByText("C000001")).toBeInTheDocument();
});
test("independent POS payment deducts fee and permits a positive customer balance", async () => {
  const update = setup();
  api.request.mockImplementation((data) => {
    update({
      ...summary,
      creditCents: 980000,
      balanceCents: 180000,
      netPaymentsCents: 980000,
      grossPaymentsCents: 1000000,
      commissionCents: 20000,
    });
    return Promise.resolve({ data: { _id: "e1" } });
  });
  render(<App />);
  fireEvent.click(await screen.findByText("Kartı aç"));
  await screen.findByText(
    "Bu kartta henüz bilet yok. Bilet olmadan da tahsilat girebilirsiniz.",
  );
  fireEvent.click(screen.getByText("＋ Tahsilat"));
  fireEvent.change(screen.getByLabelText("Karttan çekilen brüt tutar (TL)"), {
    target: { value: "10000" },
  });
  expect(
    screen.getByText("Cariye işlenecek net alacak: ₺9.800,00"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText("Hareketi kaydet"));
  await waitFor(() => expect(api.request).toHaveBeenCalled());
  expect(api.request.mock.calls[0][0]).toMatchObject({
    url: "/customers/c1/entries",
    method: "post",
    data: {
      type: "payment",
      amount: "10000",
      commissionValue: "2",
      requestId: "00000000-0000-4000-8000-000000000001",
    },
  });
  expect(await screen.findByText("Müşteri alacaklı")).toBeInTheDocument();
  expect(screen.getByText("+₺1.800,00")).toBeInTheDocument();
});
test("legacy tickets are linked explicitly to a chosen customer card", async () => {
  setup(
    [],
    [
      {
        _id: "t1",
        customerName: "Eski Müşteri",
        price: 1000,
        isPaid: true,
        staffName: "Önceki",
        version: 2,
        pnr: "OLD001",
      },
    ],
  );
  api.request.mockResolvedValue({ data: { _id: "t1", customerId: "c1" } });
  render(<App />);
  fireEvent.click(await screen.findByText("Eski biletleri göster"));
  fireEvent.click(screen.getByText("Karta bağla"));
  fireEvent.change(screen.getByRole("combobox", { name: "Müşteri kartı" }), {
    target: { value: "c1" },
  });
  fireEvent.click(screen.getAllByText("Karta bağla").at(-1));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      url: "/tickets/t1/customer",
      method: "put",
      data: { customerId: "c1", version: 2 },
    }),
  );
});
test("money preview rounds in cents and exported notes cannot execute formulas", () => {
  expect(netPreview("10000", "percent", "2", "Kart")).toEqual({
    gross: 1000000,
    fee: 20000,
    net: 980000,
  });
  expect(netPreview("10000", "percent", "2", "Havale").fee).toBe(0);
  expect(csv([[" =1+1", -1800]])).toContain("' =1+1");
});

test("accountant edits an entry with a reason and sees its audit history", async () => {
  setup();
  const baseGet = api.get.getMockImplementation();
  const row = {
    id: "entry:e1", source: "entry", sourceId: "e1", type: "payment", date: "2026-10-27",
    description: "Banka tahsilatı", method: "Havale", creditCents: 50000, debitCents: 0,
    balanceCents: -750000, version: 2, history: [],
    edit: { amount: 500, method: "Havale", date: "2026-10-27", commissionMode: "percent", commissionValue: 0, description: "Banka tahsilatı", reference: "D123", account: "Banka" },
  };
  api.get.mockImplementation(async url => {
    const result = await baseGet(url);
    if (url.includes("/statement")) result.data.rows = [row];
    return result;
  });
  api.request.mockResolvedValue({ data: {} });
  render(<App />);
  fireEvent.click(await screen.findByText("Kartı aç"));
  fireEvent.click(await screen.findByRole("button", { name: "Düzenle", exact: true }));
  expect(screen.getByLabelText("Tutar (TL)")).toHaveValue(500);
  fireEvent.change(screen.getByLabelText("Tutar (TL)"), { target: { value: "750" } });
  fireEvent.change(screen.getByLabelText("Düzeltme gerekçesi"), { target: { value: "Dekont kontrolü" } });
  fireEvent.click(screen.getByRole("button", { name: "Hareketi kaydet" }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({
    method: "put", url: "/customers/c1/entries/e1", data: expect.objectContaining({ amount: "750", version: 2, reason: "Dekont kontrolü", commissionValue: 0 }),
  })));
});

test("admin removes only the listed legacy tickets and can open the recovery list", async () => {
  const old = { _id: "old1", customerName: "Deneme eski", route: "Test rota", price: 100, staffName: "Muhasebe", version: 3 };
  setup([], [old]);
  const getBase = api.get.getMockImplementation();
  let removed = false;
  api.get.mockImplementation(url => {
    if (url === "/tickets/archived-legacy") return Promise.resolve({ data: removed ? [{ ...old, deletedAt: "2026-10-27" }] : [] });
    if (url === "/tickets") return Promise.resolve({ data: removed ? [] : [old] });
    return getBase(url);
  });
  api.request.mockImplementation(() => { removed = true; return Promise.resolve({ data: {} }); });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Eski biletleri göster" }));
  fireEvent.click(screen.getByRole("button", { name: "Tüm eski biletleri sil (1)" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Deneme eski");
  fireEvent.click(screen.getByRole("button", { name: "Biletleri sil", exact: true }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith({ method: "post", url: "/tickets/old1/archive", data: { version: 3 } }));
  fireEvent.click(await screen.findByRole("button", { name: "Silinen eski biletler (1)" }));
  expect(await screen.findByRole("button", { name: "Geri al", exact: true })).toBeInTheDocument();
});

test("account settings require matching passwords and return to login on success", async () => {
  setup(); api.post.mockResolvedValue({data:{}});
  render(<App />);
  fireEvent.click(await screen.findByRole("button", {name:"Hesap ayarları"}));
  fireEvent.change(screen.getByLabelText("Yeni kullanıcı adı"),{target:{value:"admin"}});
  fireEvent.change(screen.getByLabelText("Mevcut parola"),{target:{value:"old-test-password"}});
  fireEvent.change(screen.getByLabelText("Yeni parola",{exact:true}),{target:{value:"new-test-8"}});
  fireEvent.change(screen.getByLabelText("Yeni parola tekrar"),{target:{value:"different-8"}});
  fireEvent.click(screen.getByRole("button",{name:"Giriş bilgilerini değiştir"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("eşleşmiyor");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Yeni parola tekrar"),{target:{value:"new-test-8"}});
  fireEvent.click(screen.getByRole("button",{name:"Giriş bilgilerini değiştir"}));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/account",{username:"admin",currentPassword:"old-test-password",newPassword:"new-test-8"}));
  expect(await screen.findByRole("button",{name:"Giriş yap"})).toBeInTheDocument();
  expect(screen.getByLabelText("Parola")).toHaveValue("");
});
