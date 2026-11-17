// Tensini Barbieri — pagamento automático pela InfinitePay (Supabase Edge Function "infinitepay")
//
// Três caminhos, todos em POST:
//   { action: "link", code }                                → cria o link de pagamento do pedido e devolve { url }
//   { action: "check", order_nsu, transaction_nsu, slug }   → o cliente voltou do pagamento: confere e confirma
//   aviso da InfinitePay (webhook: order_nsu, transaction_nsu, invoice_slug...) → confere e confirma
//
// Nada que chega de fora é confiado: o valor sai do banco e o pagamento só vale depois de
// conferido no payment_check da própria InfinitePay.
//
// Segredos (Supabase → Edge Functions → Secrets): INFINITEPAY_HANDLE (a InfiniteTag, sem $ e sem @),
// INFINITEPAY_TOKEN (opcional, só se a conta exigir), SITE_URL (ex.: https://tensini-barbieri.pages.dev).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem em toda Edge Function.

const env = (k: string) => (globalThis as any).Deno?.env.get(k) ?? "";
const HANDLE = () => env("INFINITEPAY_HANDLE").replace(/^[$@]/, "").trim();
const SITE = () => (env("SITE_URL") || "https://tensini-barbieri.pages.dev").replace(/\/$/, "");
const IP_BASES = ["https://api.infinitepay.io/invoices/public/checkout", "https://api.checkout.infinitepay.io"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- banco (PostgREST com a chave de serviço, que só existe aqui dentro) ----------
// projetos antigos têm SUPABASE_SERVICE_ROLE_KEY; os novos têm SUPABASE_SECRET_KEYS ({"default": "sb_secret_..."})
function serviceKey() {
  if (env("SUPABASE_SERVICE_ROLE_KEY")) return env("SUPABASE_SERVICE_ROLE_KEY");
  try { const keys = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}"); return keys.default || Object.values(keys)[0] || ""; } catch { return ""; }
}
async function db(path: string, init: RequestInit = {}) {
  const key = serviceKey();
  if (!key) throw new Error("chave de serviço do Supabase não encontrada");
  const auth: Record<string, string> = key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {};
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, ...auth, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const getBooking = async (code: string) =>
  ((await db(`bookings?code=eq.${encodeURIComponent(code.toUpperCase())}&select=*`)) || [])[0] || null;
const patchBooking = (id: string, patch: Record<string, unknown>) =>
  db(`bookings?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });

// ---------- InfinitePay ----------
async function ip(path: string, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env("INFINITEPAY_TOKEN")) headers.Authorization = `Bearer ${env("INFINITEPAY_TOKEN")}`;
  let last = "";
  for (const base of IP_BASES) {
    try {
      const res = await fetch(`${base}/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : {};
      last = `${res.status}: ${text.slice(0, 200)}`;
      if (res.status !== 404) break;   // 404 = tenta o outro endereço da API
    } catch (e) { last = String(e); }
  }
  throw new Error(`infinitepay ${path} ${last}`);
}

const phoneE164 = (p: string) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `+55${d}` : d.length >= 12 ? `+${d}` : "";
};

async function createLink(code: string) {
  if (!HANDLE()) throw new Error("INFINITEPAY_HANDLE não configurado");
  const b = await getBooking(code);
  if (!b) return json({ error: "pedido_nao_encontrado" }, 404);
  if (b.paid_amount != null) return json({ error: "ja_pago" }, 409);
  if (b.status !== "pending" && b.status !== "confirmed") return json({ error: "pedido_inativo" }, 409);
  if (b.pay_url) return json({ url: b.pay_url });

  const cents = Math.round(Number(b.total) * 100);
  const customer: Record<string, string> = { name: String(b.client_name).slice(0, 100) };
  const ph = phoneE164(b.client_phone); if (ph) customer.phone = ph;
  const out = await ip("links", {
    handle: HANDLE(),
    order_nsu: b.code,
    redirect_url: `${SITE()}/?pagamento=${b.code}`,
    webhook_url: `${env("SUPABASE_URL")}/functions/v1/infinitepay`,
    amount: cents,
    customer,
    items: [{ id: b.service_id, description: `${b.service_name} · ${b.option_label}`.slice(0, 100), quantity: 1, price: cents }],
  });
  const url = out.url || out.payment_url || out.link;
  if (!url) throw new Error(`infinitepay links sem url: ${JSON.stringify(out).slice(0, 200)}`);
  await patchBooking(b.id, { pay_url: url });
  return json({ url });
}

// confere na InfinitePay e, se pago, confirma o agendamento
async function settle(orderNsu: string, transactionNsu: string, slug: string, hint: Record<string, unknown> = {}) {
  if (!orderNsu || !transactionNsu || !slug) return json({ error: "dados_incompletos" }, 400);
  const b = await getBooking(orderNsu);
  if (!b) return json({ error: "pedido_nao_encontrado" }, 404);
  if (b.ip_transaction_nsu === transactionNsu && b.paid_amount != null) return json({ paid: true, status: b.status, code: b.code });

  // a mesma transação não pode pagar dois pedidos
  const reused = (await db(`bookings?ip_transaction_nsu=eq.${encodeURIComponent(transactionNsu)}&id=neq.${b.id}&select=id`)) || [];
  if (reused.length) return json({ paid: false, code: b.code, error: "transacao_ja_usada" }, 409);

  const chk = await ip("payment_check", { handle: HANDLE(), order_nsu: b.code, transaction_nsu: transactionNsu, slug });
  if (!chk || chk.paid !== true) return json({ paid: false, code: b.code });

  // valor: só o que a própria InfinitePay devolveu (nunca o que veio no aviso, que qualquer um poderia mandar)
  const paidCents = Number(chk.paid_amount ?? chk.amount ?? 0);
  const totalCents = Math.round(Number(b.total) * 100);
  if (paidCents && paidCents < totalCents) return json({ paid: false, code: b.code, error: "valor_menor" });
  const safeUrl = (u: unknown) => { try { const x = new URL(String(u)); return x.protocol === "https:" && /(^|\.)infinitepay\.io$/.test(x.hostname) ? x.href : null; } catch { return null; } };

  const info = {
    // na planilha entra o valor do serviço; juros do parcelamento (pagos pelo cliente) ficam só anotados
    paid_amount: Number(b.total),
    ip_charged: paidCents ? paidCents / 100 : null,
    paid_at: new Date().toISOString(),
    ip_transaction_nsu: transactionNsu,
    ip_slug: slug,
    ip_method: String(chk.capture_method ?? hint.capture_method ?? "").toUpperCase() || null,
    ip_installments: Number(chk.installments ?? hint.installments ?? 0) || null,
    ip_receipt_url: safeUrl(chk.receipt_url) || safeUrl(hint.receipt_url),
  };
  try {
    // pagou: confirma o horário (a regra de lotação do banco ainda confere)
    await patchBooking(b.id, { ...info, status: "confirmed" });
    return json({ paid: true, status: "confirmed", code: b.code });
  } catch (_e) {
    // horário já foi ocupado (ex.: pedido expirou antes do pagamento): registra o pagamento e deixa para a barbearia remarcar
    await patchBooking(b.id, { ...info, notes: `${b.notes ? b.notes + " · " : ""}PAGO pela InfinitePay, mas o horário foi ocupado: remarcar` });
    return json({ paid: true, status: b.status, code: b.code, warning: "remarcar" });
  }
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "json_invalido" }, 400); }
  try {
    if (body.action === "link") return await createLink(String(body.code || ""));
    if (body.action === "check") return await settle(String(body.order_nsu || ""), String(body.transaction_nsu || ""), String(body.slug || ""));
    // aviso automático da InfinitePay
    return await settle(String(body.order_nsu || ""), String(body.transaction_nsu || ""), String(body.invoice_slug || body.slug || ""), body);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
}

(globalThis as any).Deno?.serve(handle);
export { handle };
