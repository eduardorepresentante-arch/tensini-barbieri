/* Painel da Tensini Barbieri: pedidos em tempo real, agenda de cada barbeiro, bloqueios e mensagens prontas de WhatsApp.
   Texto vindo de clientes só entra na página por textContent (nunca innerHTML). */
const T = window.BT;
const $ = (s) => document.querySelector(s);
const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR");

// cria elemento: h("div", {class: "x", onclick: fn}, filhos...)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

// ---------- preferências deste aparelho ----------
const PREF_KEY = "tensini-admin-prefs";
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } })();
$("#p-pix").value = prefs.pix || ""; $("#p-card").value = prefs.card || ""; $("#p-addr").value = prefs.addr || "";
$("#prefs").addEventListener("submit", (e) => {
  e.preventDefault();
  Object.assign(prefs, { pix: $("#p-pix").value.trim(), card: $("#p-card").value.trim(), addr: $("#p-addr").value.trim() });
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (err) { /* sem storage */ }
  toast("Ajustes salvos neste celular.");
});

// ---------- formatação ----------
const when = (b) => {
  const s = T.local(Date.parse(b.starts_at)), e = T.local(Date.parse(b.ends_at));
  return { ymd: s.ymd, start: s.min, end: e.min, label: `${T.dayLabel(s.ymd)} · ${T.hm(s.min)} às ${T.hm(e.min)}` };
};
const first = (name) => String(name).trim().split(/\s+/)[0];
const phoneLabel = (p) => { const d = T.phoneBR(p); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
const waTo = (phone, text) => `https://wa.me/55${T.phoneBR(phone)}?text=${encodeURIComponent(text)}`;
function ago(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)}h` : `há ${Math.round(m / 1440)} dias`;
}
function left(iso) {
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
  return m <= 0 ? "expirou" : m < 60 ? `faltam ${m} min` : `faltam ${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
}

// ---------- barbeiros ----------
const BCOL = ["#d4a84b", "#8fb3ff", "#ff9a6b", "#5fd3a5", "#d58cf0", "#f2e27a"];
const barberList = () => (DB_CAT && DB_CAT.barbers) || [];
const bColor = (id) => { const i = barberList().findIndex((b) => b.id === id); return i < 0 ? "#a69c87" : BCOL[i % BCOL.length]; };
const bName = (b) => b.barber_name || (barberList().find((x) => x.id === b.barber_id) || {}).name || "—";
const bPill = (b) => h("span", { class: "bpill", style: `--c:${bColor(b.barber_id)}` }, bName(b));
let bFilter = "all";   // barbeiro escolhido na Agenda e em Agendados (o mesmo nas duas abas)
const byFilter = (x) => bFilter === "all" || x.barber_id === bFilter;
function renderBFilters() {
  const opts = [{ id: "all", name: "Todos" }, ...barberList()];
  ["#a-barbers", "#g-barbers"].forEach((sel) => $(sel).replaceChildren(...opts.map((b) =>
    h("button", { type: "button", "aria-pressed": String(bFilter === b.id), style: b.id === "all" ? null : `--c:${bColor(b.id)}`,
      onclick: () => { bFilter = b.id; renderBFilters(); renderAgenda(); renderAgendados(); } }, b.id === "all" ? null : h("i"), b.name))));
  $("#a-who").textContent = bFilter === "all" ? "Todos os barbeiros" : "Agenda de " + (barberList().find((x) => x.id === bFilter) || {}).name;
}
const NAME = (window.SITE_CONFIG && window.SITE_CONFIG.name) || "Tensini Barbieri";
const isPromo = (b) => !!(DB_CAT && DB_CAT.services.some((x) => x.id === b.service_id && x.promo));
const prepaid = (b) => !!(DB_CAT && DB_CAT.settings && DB_CAT.settings.prepay) || isPromo(b);
const svcLine = (b) => `${b.service_name}${b.option_label && b.option_label !== "Valor único" ? ` (${b.option_label})` : ""}`;

function pendingMsg(b) {
  const w = when(b);
  let pay;
  if (b.pay_url && b.payment !== "Dinheiro") pay = `Para confirmar, é só pagar por este link seguro (Pix ou cartão em até 12x). A confirmação é automática:\n${b.pay_url}`;
  else if (prepaid(b) && b.payment === "Pix") pay = prefs.pix ? `Para confirmar, faça o Pix de ${brl(b.total)} para a chave:\n${prefs.pix}\ne me mande o comprovante por aqui.` : "Para confirmar, já te passo a chave Pix. Depois é só mandar o comprovante por aqui.";
  else if (prepaid(b) && b.payment === "Cartão de crédito") pay = prefs.card ? `Para confirmar, é só pagar pelo link (até 12x):\n${prefs.card}` : "Para confirmar, já te mando o link do cartão (até 12x).";
  else pay = `O pagamento é na barbearia, no dia (${b.payment}). Posso confirmar seu horário? Responda *SIM* que eu já deixo garantido. 👊`;
  return `Fala, ${first(b.client_name)}! Aqui é da ${NAME}. 💈\nRecebi seu pedido #${b.code}:\n• ${svcLine(b)}\n• Barbeiro: ${bName(b)}\n• ${T.WD[T.dow(w.ymd)]}, ${T.br(w.ymd)} às ${T.hm(w.start)}\n• Valor: ${brl(b.total)}\n\n${pay}`;
}
// mensagem de confirmação enviada ao cliente
function confirmedMsg(b) {
  const w = when(b);
  return `✅ Horário confirmado na ${NAME}!\n\n` +
    `📅 ${T.WD[T.dow(w.ymd)]}, ${T.br(w.ymd)} às ${T.hm(w.start)}\n` +
    `✂️ ${svcLine(b)}\n` +
    `💈 Com ${bName(b)}\n` +
    (prefs.addr ? `📍 ${prefs.addr}\n` : "") +
    (b.paid_amount == null ? `💵 Pagamento na barbearia: ${brl(b.total)} (${b.payment})\n` : `💳 Pago: ${brl(b.paid_amount)} ✓\n`) +
    `\n⏰ Tolerância de 10 minutos de atraso. Se precisar remarcar, avise com antecedência por aqui.\n\n` +
    `Te esperamos! 👑`;
}

// lembrete antes do atendimento: pede para o cliente confirmar a presença
function reminderMsg(b) {
  const w = when(b), dia = T.dow(w.ymd), amanha = w.ymd === T.addDays(T.local(Date.now()).ymd, 1), hoje = w.ymd === T.local(Date.now()).ymd;
  const quando = hoje ? "hoje" : amanha ? "amanhã" : `${T.WD[dia].toLowerCase()}, ${T.br(w.ymd).slice(0, 5)}`;
  return `Fala, ${first(b.client_name)}! Passando para lembrar do seu horário na ${NAME}: 💈\n\n` +
    `📅 ${quando.charAt(0).toUpperCase() + quando.slice(1)}, às ${T.hm(w.start)}\n` +
    `✂️ ${svcLine(b)} com ${bName(b)}\n` +
    (prefs.addr ? `📍 ${prefs.addr}\n` : "") +
    `\nConfirma sua presença? Responda *SIM*. 👊\n` +
    `Se não puder vir, me avise para liberar o horário.`;
}
// marca neste aparelho que o lembrete já foi enviado
const REM_KEY = "tensini-lembretes";
const remSent = () => { try { return JSON.parse(localStorage.getItem(REM_KEY)) || {}; } catch (e) { return {}; } };
function markReminded(id) { const r = remSent(); r[id] = Date.now(); try { localStorage.setItem(REM_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ } }
function reminderBtn(b) {
  if (!b.client_phone) return null;
  const sent = remSent()[b.id];
  const a = h("a", { class: "btn small " + (sent ? "b-ghost" : "b-accent"), href: waTo(b.client_phone, reminderMsg(b)), target: "_blank", rel: "noopener",
    onclick: () => { markReminded(b.id); setTimeout(() => { a.textContent = "Lembrete enviado ✓"; a.className = "btn small b-ghost"; }, 300); } },
    sent ? "Lembrete enviado ✓" : "Lembrar cliente");
  return a;
}

// ---------- ações ----------
async function setStatus(b, status, btn) {
  if (btn) btn.disabled = true;
  try {
    await DB.setStatus(b.id, status);
    if (status === "confirmed") { const nb = { ...b, status, paid_amount: b.paid_amount != null ? b.paid_amount : prepaid(b) && b.payment !== "Dinheiro" ? b.total : null };
      toastLink("Confirmado! O horário já aparece reservado no site.", "Mandar confirmação", confirmLink(nb)); }
    else if (status === "cancelled") toast("Cancelado. O horário voltou a ficar livre no site.");
    else if (status === "done") toast("Marcado como concluído.");
    await refresh();
  } catch (e) {
    toast(e.message);
    if (btn) btn.disabled = false;
  }
}
// botão de duas etapas (sem confirm(), que não funciona em todo lugar)
function twoTap(label, armedLabel, run) {
  let armed = false, timer;
  const btn = h("button", { type: "button", class: "btn small b-no", onclick: () => {
    if (!armed) { armed = true; btn.classList.add("armed"); btn.textContent = armedLabel; timer = setTimeout(() => { armed = false; btn.classList.remove("armed"); btn.textContent = label; }, 3500); return; }
    clearTimeout(timer); run(btn);
  } }, label);
  return btn;
}

// cancelar: se já tinha pagamento lançado, pergunta se o dinheiro foi devolvido
function cancelBtn(b, label, armedLabel) {
  return twoTap(label, armedLabel, (btn) => {
    if (b.paid_amount == null) return setStatus(b, "cancelled", btn);
    const box = btn.parentNode;
    const keep = [...box.children];
    const back = () => box.replaceChildren(...keep);
    const go = async (el, patch, msg) => {
      el.disabled = true;
      try { await DB.updateBooking(b.id, patch); toast(msg); await refresh(); } catch (e) { toast(e.message); el.disabled = false; }
    };
    box.replaceChildren(
      h("p", { class: "sub", style: "flex-basis:100%" }, `Já tinha ${brl(b.paid_amount)} lançado como recebido. O que aconteceu com o dinheiro?`),
      h("button", { type: "button", class: "btn small b-no armed", onclick: (e) => go(e.currentTarget, { status: "cancelled", paid_amount: null }, "Cancelado e valor devolvido. Saiu do financeiro.") }, "Devolvi o dinheiro"),
      h("button", { type: "button", class: "btn small b-ghost", onclick: (e) => go(e.currentTarget, { status: "cancelled" }, "Cancelado. O valor continua como recebido (crédito do cliente).") }, "Fiquei com o valor"),
      h("button", { type: "button", class: "btn small b-ghost", onclick: back }, "Voltar"));
  });
}

const STATUS = { pending: "Aguardando", confirmed: "Confirmado", done: "Concluído", cancelled: "Cancelado", expired: "Expirou" };
function bookingCard(b, { fresh } = {}) {
  const w = when(b);
  const actions = h("div", { class: "actions" });
  if (b.status === "pending" || b.status === "expired") {
    actions.append(
      h("a", { class: "btn small b-wa", href: waTo(b.client_phone, pendingMsg(b)), target: "_blank", rel: "noopener" }, "WhatsApp"),
      h("button", { type: "button", class: "btn small b-ok", onclick: (e) => setStatus(b, "confirmed", e.currentTarget) },
        b.status === "expired" ? "Confirmar mesmo assim" : prepaid(b) && b.payment !== "Dinheiro" ? "Recebi · confirmar" : "Confirmar horário"),
      cancelBtn(b, "Recusar", "Toque de novo para recusar"));
  } else if (b.status === "confirmed") {
    actions.append(confirmBtn(b, "Mandar confirmação") || h("span", { class: "sub" }, "sem WhatsApp"));
    if (Date.parse(b.starts_at) > Date.now()) { const rb = reminderBtn(b); if (rb) actions.append(rb); }
    if (Date.parse(b.starts_at) < Date.now()) actions.append(h("button", { type: "button", class: "btn small b-ghost", onclick: (e) => setStatus(b, "done", e.currentTarget) }, "Concluído"));
    actions.append(cancelBtn(b, "Cancelar", "Toque de novo para cancelar"));
  }
  return h("article", { class: "card" + (fresh ? " new" : "") + (b.status === "cancelled" ? " off" : ""), "data-code": b.code, style: `--c:${bColor(b.barber_id)}` },
    h("div", { class: "top" },
      h("div", null, h("h3", null, b.service_name), h("p", { class: "when" }, w.label)),
      h("span", { class: "pill p-" + b.status }, STATUS[b.status])),
    barberList().length > 1 ? h("div", { class: "row" }, bPill(b), b.any_barber ? h("small", { class: "sub" }, "cliente escolheu \"qualquer um\"") : null) : null,
    h("div", { class: "top" },
      h("div", { class: "meta" },
        h("span", null, `${b.option_label && b.option_label !== "Valor único" ? b.option_label + " · " : ""}${b.payment}`),
        h("span", null, `${b.client_name} · ${phoneLabel(b.client_phone)}`),
        h("span", null, `Pedido #${b.code} · ${ago(b.created_at)}` + (b.status === "pending" && b.expires_at ? ` · segura o horário (${left(b.expires_at)})` : ""))),
      h("span", { class: "price" }, brl(b.total))),
    b.notes ? h("p", { class: "notes" }, b.notes) : null,
    paidLine(b),
    actions,
    b.status !== "expired" ? editor(b, actions) : null);
}
const IP_METHOD = { PIX: "Pix", CREDIT: "Cartão de crédito", CREDIT_CARD: "Cartão de crédito", DEBIT: "Débito" };
function paidLine(b) {
  if (b.ip_transaction_nsu && b.paid_amount != null) {
    const how = [IP_METHOD[b.ip_method] || b.ip_method, b.ip_installments > 1 ? `${b.ip_installments}x` : ""].filter(Boolean).join(" ");
    const juros = b.ip_charged != null && Number(b.ip_charged) > Number(b.paid_amount) ? ` · cliente pagou ${brl(b.ip_charged)} com juros do cartão` : "";
    return h("p", { class: "paid" }, `Pago pela InfinitePay ✓ ${brl(b.paid_amount)}${how ? " · " + how : ""}${juros}`,
      /^https:\/\/([a-z0-9-]+\.)*infinitepay\.io\//i.test(b.ip_receipt_url || "") ? h("span", null, " · ", h("a", { href: b.ip_receipt_url, target: "_blank", rel: "noopener", style: "color:inherit" }, "recibo")) : null);
  }
  if (b.paid_amount != null) return h("p", { class: "paid" }, `Recebido: ${brl(b.paid_amount)}` + (Number(b.paid_amount) !== Number(b.total) ? ` (tabela ${brl(b.total)})` : ""));
  if (b.status === "confirmed") return h("p", { class: "unpaid" }, prepaid(b) && b.payment !== "Dinheiro" ? "Pagamento ainda não lançado" : `A receber no dia: ${brl(b.total)}`);
  return null;
}

// editar valor recebido / reagendar / concluir
function editor(b, actions) {
  const w = when(b), dur = (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000;
  const paid = h("input", { type: "number", min: "0", step: "0.01", inputmode: "decimal", value: b.paid_amount != null ? b.paid_amount : (b.status === "confirmed" || b.status === "done" ? b.total : ""), "aria-label": "Valor recebido" });
  const date = h("input", { type: "date", value: w.ymd, "aria-label": "Dia" });
  const time = h("input", { type: "time", step: "900", value: T.hm(w.start), "aria-label": "Horário" });
  const barber = h("select", { "aria-label": "Barbeiro" }, ...barberList().map((x) => h("option", { value: x.id, selected: x.id === b.barber_id }, x.name)));
  const box = h("div", { class: "editor", hidden: true },
    h("label", null, "Valor recebido (R$) · deixe vazio se ainda não pagou", paid),
    h("div", { class: "two" }, h("label", null, "Reagendar: dia", date), h("label", null, "horário", time)),
    h("label", null, "Barbeiro", barber));
  async function save(btn, extra) {
    const v = paid.value.trim(), patch = { paid_amount: v === "" ? null : Math.max(0, Number(v.replace(",", "."))), ...extra };
    const moved = date.value !== w.ymd || time.value !== T.hm(w.start);
    const swapped = barber.value && barber.value !== b.barber_id;
    if (swapped) { patch.barber_id = barber.value; patch.barber_name = (barberList().find((x) => x.id === barber.value) || {}).name || ""; }
    if (moved) {
      if (!date.value || !time.value) return toast("Escolha o novo dia e horário.");
      const st = T.ms(date.value, T.toMin(time.value));
      patch.starts_at = new Date(st).toISOString(); patch.ends_at = new Date(st + dur * 60000).toISOString();
    }
    btn.disabled = true;
    try {
      await DB.updateBooking(b.id, patch);
      toast(moved || swapped ? "Agenda atualizada. O site já mostra a mudança." : extra && extra.status === "done" ? "Atendimento concluído." : "Salvo.");
      await refresh();
    } catch (e) { toast(e.message); btn.disabled = false; }
  }
  const row = h("div", { class: "actions" }, h("button", { type: "button", class: "btn small b-accent", onclick: (e) => save(e.currentTarget) }, "Salvar"));
  if (b.status === "confirmed") row.append(h("button", { type: "button", class: "btn small b-ok", onclick: (e) => save(e.currentTarget, { status: "done" }) }, "Salvar e concluir"));
  box.append(row);
  actions.append(h("button", { type: "button", class: "btn small b-ghost", "aria-expanded": "false", onclick: (e) => { box.hidden = !box.hidden; e.currentTarget.setAttribute("aria-expanded", String(!box.hidden)); } }, "Editar"));
  return box;
}

const empty = (title, text) => h("div", { class: "empty" }, h("b", null, title), text);

// ---------- pedidos ----------
let known = null;
async function renderPending() {
  const list = await DB.pending();
  const pend = list.filter((b) => b.status === "pending"), exp = list.filter((b) => b.status === "expired");
  const ids = new Set(pend.map((b) => b.id));
  const fresh = known ? pend.filter((b) => !known.has(b.id)) : [];
  if (fresh.length) notifyNew(fresh);
  known = ids;
  $("#pending-list").replaceChildren(...(pend.length ? pend.map((b) => bookingCard(b, { fresh: fresh.includes(b) })) : [empty("Nenhum pedido esperando", "Quando um cliente pedir um horário no site, ele aparece aqui na hora.")]));
  $("#badge").hidden = !pend.length; $("#badge").textContent = pend.length;
  document.title = pend.length ? `(${pend.length}) Agenda · Tensini` : "Agenda · Tensini Barbieri";
  $("#expired-wrap").hidden = !exp.length;
  $("#expired-sum").textContent = `${exp.length} pedido${exp.length > 1 ? "s" : ""} expirou sem confirmação`;
  $("#expired-list").replaceChildren(...exp.map((b) => bookingCard(b)));
  focusLinked();
}

// link da mensagem do WhatsApp: admin.html#pedido-ABC123 abre direto no pedido
let linkedDone = false;
function focusLinked() {
  const m = /^#pedido-([A-Z0-9]{4,8})$/i.exec(location.hash);
  if (!m || linkedDone) return;
  const card = document.querySelector(`#v-pedidos [data-code="${m[1].toUpperCase()}"]`);
  if (!card) return;
  linkedDone = true;
  show("pedidos");
  const exp = card.closest("details"); if (exp) exp.open = true;
  card.classList.add("new");
  setTimeout(() => card.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
}

// lembretes: quem vem hoje e amanhã (aba Pedidos)
// confirmação com endereço para quem pagou: abre o WhatsApp da cliente e marca como enviada neste aparelho
const CONF_KEY = "tensini-confirmacoes";
const confSent = () => { try { return JSON.parse(localStorage.getItem(CONF_KEY)) || {}; } catch (e) { return {}; } };
function markConfirmed(id) { const r = confSent(); r[id] = Date.now(); try { localStorage.setItem(CONF_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ } }
const confirmLink = (b) => waTo(b.client_phone, confirmedMsg(b));
function confirmBtn(b, label = "Mandar confirmação") {
  if (!b.client_phone) return null;
  const sent = confSent()[b.id];
  const a = h("a", { class: "btn small " + (sent ? "b-ghost" : "b-wa"), href: confirmLink(b), target: "_blank", rel: "noopener",
    onclick: () => { markConfirmed(b.id); setTimeout(() => { a.textContent = "Confirmação enviada ✓"; a.className = "btn small b-ghost"; renderPaidList(); }, 300); } },
    sent ? "Confirmação enviada ✓" : label);
  return a;
}
// pagaram (InfinitePay) e ainda não receberam a confirmação com endereço
async function renderPaidList() {
  const from = Date.now(), to = from + 120 * 86400000, sent = confSent();
  const list = (await DB.bookings(from, to)).filter((b) => b.status === "confirmed" && b.ip_transaction_nsu && b.client_phone && !sent[b.id]);
  const box = $("#paidlist");
  box.hidden = !list.length;
  if (!list.length) return;
  box.replaceChildren(
    h("div", { class: "top" }, h("h3", null, "Pagamentos recebidos"), h("span", { class: "pill p-confirmed" }, `${list.length} para confirmar`)),
    h("p", { class: "sub" }, prefs.addr ? "Pagaram pelo site e o horário já está confirmado. Toque para mandar a confirmação com o endereço." :
      "Pagaram pelo site. ⚠️ Preencha o endereço em Ajustes para ele ir junto na mensagem."),
    ...list.map((b) => h("div", { class: "rem-row" },
      h("div", null, h("strong", null, b.client_name), h("span", null, `${when(b).label} · ${b.service_name} · ${brl(b.paid_amount)}`)),
      confirmBtn(b))));
}

// ---------- promoção (Black Week): vagas usadas ----------
async function renderPromo() {
  let cat = null;
  try { cat = await DB.catalog(); } catch (e) { /* sem conexão: fica como está */ return; }
  const p = cat.services.find((x) => x.promo), box = $("#promo");
  box.hidden = !p;
  if (!p) return;
  const used = p.promo.vagas - p.promo.restam, started = !p.promo.de || Date.parse(p.promo.de) <= Date.now();
  box.replaceChildren(
    h("div", { class: "top" }, h("h3", null, p.grp || "Promoção"), h("span", { class: "pill " + (p.promo.restam ? "p-confirmed" : "p-cancelled") },
      p.promo.restam ? `${p.promo.restam} de ${p.promo.vagas} vagas livres` : "ESGOTADO")),
    h("div", { class: "visit-bars", style: "height:10px;grid-auto-columns:auto;display:block;background:var(--raise);border-radius:999px;overflow:hidden" },
      h("i", { style: `display:block;height:100%;width:${(used / p.promo.vagas) * 100}%;background:var(--accent);border-radius:999px` })),
    h("p", { class: "sub" }, `${p.name} · ${used} vaga${used === 1 ? "" : "s"} preenchida${used === 1 ? "" : "s"}` +
      (started ? "" : ` · começa ${T.br(T.local(Date.parse(p.promo.de)).ymd)}`) +
      ". Pedidos aguardando pagamento seguram a vaga até expirar."));
}

// ---------- visitas ao site ----------
async function renderVisits() {
  if (!DB.visits) return;
  let v = null;
  try { v = await DB.visits(); } catch (e) { /* tabela ainda não criada no banco */ }
  const box = $("#visits");
  box.hidden = !v;
  if (!v) return;
  const n = (x) => Number(x || 0).toLocaleString("pt-BR"), pp = (x) => (Number(x) === 1 ? "pessoa" : "pessoas");
  const k = (label, value, sub, cls) => h("div", { class: "kpi" + (cls ? " " + cls : "") }, h("span", null, label), h("b", null, n(value)), h("small", null, sub));
  const max = Math.max(1, ...v.days.map((d) => d.n));
  box.replaceChildren(
    h("div", { class: "top" }, h("h3", null, "Visitas ao site"), h("small", { class: "sub" }, v.since ? `contando desde ${T.br(v.since)}` : "contando a partir de agora")),
    h("div", { class: "kpis" },
      k("Hoje", v.today, pp(v.today)),
      k("Últimos 7 dias", v.week, pp(v.week)),
      k("Este mês", v.month, pp(v.month)),
      k("Desde o início", v.total, `${pp(v.total)} · ${n(v.views)} visitas`)),
    h("div", { class: "visit-bars", title: "Pessoas por dia nos últimos 14 dias" },
      ...v.days.map((d) => h("i", { style: `height:${Math.max(3, (d.n / max) * 100)}%`, title: `${T.br(d.day)}: ${d.n} ${pp(d.n)}` }))),
    h("p", { class: "sub" }, "Cada celular ou computador conta como uma pessoa por dia. Pessoas por dia, nos últimos 14 dias."));
}

async function renderReminders() {
  const t = T.local(Date.now()).ymd, from = Date.now(), to = T.ms(T.addDays(t, 2), 0);
  const list = (await DB.bookings(from, to)).filter((b) => b.status === "confirmed" && Date.parse(b.starts_at) > from);
  const box = $("#remind");
  box.hidden = !list.length;
  if (!list.length) return;
  const sent = remSent();
  const left = list.filter((b) => !sent[b.id] && b.client_phone).length;
  box.replaceChildren(
    h("div", { class: "top" }, h("h3", null, "Lembretes"), h("span", { class: "pill p-pending" }, left ? `${left} para enviar` : "todos enviados ✓")),
    h("p", { class: "sub" }, "Clientes confirmados para hoje e amanhã. Toque para mandar a mensagem pedindo para ele confirmar a presença."),
    ...list.map((b) => h("div", { class: "rem-row" },
      h("div", null, h("strong", null, b.client_name), h("span", null, `${T.local(Date.parse(b.starts_at)).ymd === t ? "Hoje" : "Amanhã"} ${T.hm(when(b).start)} · ${b.service_name} · ${bName(b)}`)),
      reminderBtn(b) || h("small", { class: "sub" }, "sem WhatsApp"))));
}

// ---------- agendados: tudo o que está marcado daqui para frente ----------
let gFilter = "all";
const gOpen = new Set();   // clientes abertas (continuam abertas quando a lista atualiza)
$("#g-filter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  gFilter = b.dataset.f;
  $("#g-filter").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderAgendados();
});
$("#g-search").addEventListener("input", () => renderAgendados());
async function renderAgendados() {
  const now = Date.now(), list = (await DB.bookings(now - 3 * 3600000, now + 400 * 86400000))
    .filter((b) => (b.status === "confirmed" || b.status === "pending") && Date.parse(b.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const conf = list.filter((b) => b.status === "confirmed"), pend = list.filter((b) => b.status === "pending");
  const toGet = conf.reduce((n, b) => n + (b.paid_amount == null ? Number(b.total) : 0), 0);
  const week = list.filter((b) => Date.parse(b.starts_at) < now + 7 * 86400000).length;
  const kpi = (label, value, sub) => h("div", { class: "kpi" }, h("span", null, label), h("b", null, value), h("small", null, sub));
  $("#g-kpis").replaceChildren(
    kpi("Agendados", String(list.length), `${conf.length} confirmado${conf.length === 1 ? "" : "s"}`),
    kpi("Aguardando", String(pend.length), "pagamento ou confirmação"),
    kpi("Próximos 7 dias", String(week), week === 1 ? "cliente" : "clientes"),
    kpi("A receber", brl(toGet), "dos confirmados"));
  const q = $("#g-search").value.trim().toLowerCase();
  const shown = list.filter((b) => byFilter(b) && (gFilter === "all" || b.status === gFilter) &&
    (!q || `${b.client_name} ${b.service_name} ${b.option_label} ${b.code} ${b.client_phone} ${bName(b)}`.toLowerCase().includes(q)));
  if (!shown.length) {
    $("#g-list").replaceChildren(empty(q ? "Ninguém encontrado" : "Nada marcado", q ? "Confira o nome digitado." : "Quando alguém agendar, aparece aqui."));
    return;
  }
  const byDay = {};
  shown.forEach((b) => { (byDay[when(b).ymd] = byDay[when(b).ymd] || []).push(b); });
  $("#g-list").replaceChildren(...Object.entries(byDay).map(([ymd, bs]) => h("section", { class: "g-day" },
    h("h3", null, T.dayLabel(ymd), h("small", null, `${bs.length} cliente${bs.length === 1 ? "" : "s"}`)),
    ...bs.flatMap((b) => {
      const w = when(b), open = gOpen.has(b.id), card = open ? bookingCard(b) : null;
      const row = h("button", { type: "button", class: "g-row " + b.status, "aria-expanded": String(open), style: `--c:${bColor(b.barber_id)}`,
        onclick: () => { if (gOpen.has(b.id)) gOpen.delete(b.id); else gOpen.add(b.id); renderAgendados(); } },
        h("time", null, T.hm(w.start)),
        h("div", null, h("strong", null, b.client_name), h("span", null, `${svcLine(b)} · ${bName(b)}`), h("span", null, `até ${T.hm(w.end)} · ${b.payment}`)),
        h("div", { class: "right" }, h("b", null, brl(b.total)), h("span", { class: "pill p-" + b.status }, b.paid_amount != null ? "Pago ✓" : STATUS[b.status])));
      return card ? [row, card] : [row];
    }))));
}

// ---------- agenda ----------
const today = () => T.local(Date.now()).ymd;
let aDay = today();
// calendário de um mês por vez, igual ao do site das clientes
const MON = ["Jan.", "Fev.", "Mar.", "Abr.", "Mai.", "Jun.", "Jul.", "Ago.", "Set.", "Out.", "Nov.", "Dez."];
let aMonth = aDay.slice(0, 7);
const monthStep = (ym, step) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7); };
$("#a-prev").addEventListener("click", () => { aMonth = monthStep(aMonth, -1); renderAgenda(); });
$("#a-next").addEventListener("click", () => { aMonth = monthStep(aMonth, 1); renderAgenda(); });
async function renderAgenda() {
  const mStart = `${aMonth}-01`, mEnd = `${monthStep(aMonth, 1)}-01`;
  const from = T.ms(aDay < mStart ? aDay : mStart, 0), to = T.ms(aDay >= mEnd ? T.addDays(aDay, 1) : mEnd, 0);
  const [books, blocks] = await Promise.all([DB.bookings(from, to), DB.blocks(from, to)]);
  const act = books.filter((b) => b.status === "pending" || b.status === "confirmed" || b.status === "done");
  const count = {};
  act.filter(byFilter).forEach((b) => { const d = when(b).ymd; count[d] = (count[d] || 0) + 1; });
  const [, mo] = aMonth.split("-").map(Number), nDays = T.addDays(mEnd, -1).slice(8) * 1;
  $("#a-month").textContent = MON[mo - 1];
  const cells = Array.from({ length: T.dow(mStart) }, () => h("span", { class: "cell" }));
  for (let dd = 1; dd <= nDays; dd++) {
    const d = `${aMonth}-${String(dd).padStart(2, "0")}`, open = !DB_CAT || !!DB_CAT.hours[T.dow(d)];
    cells.push(h("button", { type: "button", class: "day" + (open ? "" : " off") + (d === today() ? " today" : ""), "aria-pressed": String(d === aDay),
      "aria-label": `${T.dayLabel(d)}${count[d] ? `, ${count[d]} atendimento${count[d] === 1 ? "" : "s"}` : ""}`, onclick: () => { aDay = d; renderAgenda(); } },
      count[d] ? h("span", { class: "cnt" }, count[d]) : null, h("span", { class: "dn" }, dd)));
  }
  while (cells.length % 7) cells.push(h("span", { class: "cell" }));
  $("#a-days").replaceChildren(...cells);
  const onDay = (x) => T.local(Date.parse(x.starts_at)).ymd === aDay || T.local(Date.parse(x.ends_at) - 1).ymd === aDay;
  // itens de um barbeiro (ou da barbearia toda, barber = null), em ordem de horário
  const itemsOf = (barber) => [
    ...act.filter((b) => b.barber_id === barber && when(b).ymd === aDay).map((b) => ({ s: when(b).start, el: bookingCard(b) })),
    ...books.filter((b) => b.barber_id === barber && b.status === "cancelled" && when(b).ymd === aDay).map((b) => ({ s: 2000 + when(b).start, t: when(b).start, el: bookingCard(b) })),
    ...blocks.filter((k) => (k.barber_id || null) === barber && onDay(k)).map((k) => ({ s: T.local(Date.parse(k.starts_at)).min, el: blockCard(k) })),
  ].sort((a, b) => a.s - b.s).map((x) => h("div", { class: "slot" }, h("div", { class: "t" }, h("b", null, T.hm(x.t != null ? x.t : x.s))), x.el));
  const hours = (DB_CAT && DB_CAT.hours[T.dow(aDay)]) || null;
  const lanes = [];
  const shop = itemsOf(null);
  if (shop.length) lanes.push(h("div", { class: "lane", style: "--c:#a69c87" }, h("div", { class: "lane-head" }, h("h3", null, "Barbearia toda"), h("small", null, "bloqueio")), ...shop));
  barberList().filter((x) => bFilter === "all" || x.id === bFilter).forEach((x) => {
    const works = !x.days || x.days.includes(T.dow(aDay));
    const its = itemsOf(x.id), n = act.filter((b) => b.barber_id === x.id && when(b).ymd === aDay).length;
    if (!its.length && bFilter === "all" && !works) return;
    lanes.push(h("div", { class: "lane", style: `--c:${bColor(x.id)}` },
      h("div", { class: "lane-head" }, h("h3", null, x.name), h("small", null, works ? `${n} atendimento${n === 1 ? "" : "s"}` : "folga neste dia")),
      ...(its.length ? its : [h("p", { class: "free" }, works && hours ? `Livre o dia todo (${hours[0]} às ${hours[1]}).` : "Não atende neste dia.")])));
  });
  $("#a-list").replaceChildren(...(hours || lanes.length ? lanes : [empty("Barbearia fechada", "Não abre neste dia da semana.")]),
    hours ? fitPanel(books, blocks) : "");
}

// horários livres de cada barbeiro no dia, com as mesmas regras do site; tocar num livre abre o "Novo atendimento" preenchido
let fitSvc = null;
function fitPanel(books, blocks) {
  const cat = DB_CAT, svcs = cat.services.filter((x) => !x.promo);
  const svc = svcs.find((x) => x.id === fitSvc) || svcs[0];
  if (!svc) return "";
  const busy = [
    ...books.filter((b) => b.status === "confirmed" || (b.status === "pending" && Date.parse(b.expires_at) > Date.now()))
      .map((b) => ({ s: Date.parse(b.starts_at), e: Date.parse(b.ends_at), barber: b.barber_id })),
    ...blocks.map((k) => ({ s: Date.parse(k.starts_at), e: Date.parse(k.ends_at), barber: k.barber_id || null })),
  ];
  const times = T.grid(cat, aDay, svc.min);
  const pick = h("select", { "aria-label": "Serviço", onchange: (e) => { fitSvc = e.target.value; renderAgenda(); } },
    ...svcs.map((x) => h("option", { value: x.id, selected: x.id === svc.id }, `${x.name} (${x.min} min)`)));
  const rows = T.barbersFor(cat, svc.id, aDay).filter((x) => bFilter === "all" || x.id === bFilter).map((x) => [
    h("p", { class: "fit-title" }, h("span", { class: "bpill", style: `--c:${bColor(x.id)}` }, x.name)),
    h("div", { class: "fit-row" }, ...times.map((m) => {
      const ok = T.isFree(busy, x.id, T.ms(aDay, m), T.ms(aDay, m + svc.min));
      return h("button", { type: "button", class: "fchip" + (ok ? "" : " busy"), disabled: !ok, onclick: () => openManual(aDay, T.hm(m), svc.id, x.id) },
        T.hm(m), ok ? null : h("small", null, "ocupado"));
    }))]).flat();
  return h("div", { class: "panel fit-panel" },
    h("h3", null, "Encaixar atendimento"),
    h("p", { class: "sub" }, "Para quem marcou por fora do site ou chegou sem horário: escolha o serviço e toque num horário livre do barbeiro. O horário some do site na hora."),
    h("label", null, "Serviço", pick),
    ...(rows.length ? rows : [h("p", { class: "sub" }, "Nenhum barbeiro faz esse serviço neste dia.")]));
}
function openManual(ymd, hm, svcId, barberId) {
  $("#m-form").hidden = false;
  $("#m-date").value = ymd; mFill();
  if (svcId) { $("#m-svc").value = svcId; mSvc(); }
  if (barberId) $("#m-barber").value = barberId;
  $("#m-time").value = hm;
  $("#m-form").scrollIntoView({ block: "start", behavior: "smooth" });
  setTimeout(() => $("#m-name").focus({ preventScroll: true }), 300);
}

$("#a-goto").addEventListener("change", (e) => { if (e.target.value) { aDay = e.target.value; aMonth = aDay.slice(0, 7); renderAgenda(); } });

// ---------- bloqueios ----------
function blockCard(k) {
  const s = T.local(Date.parse(k.starts_at)), e = T.local(Date.parse(k.ends_at));
  const allDay = s.min === 0 && (e.min === 0 || e.min >= 1439);
  const who = k.barber_id ? (barberList().find((x) => x.id === k.barber_id) || {}).name || k.barber_id : "Barbearia toda";
  return h("article", { class: "card", style: `--c:${k.barber_id ? bColor(k.barber_id) : "#a69c87"}` },
    h("div", { class: "top" },
      h("div", null, h("h3", null, k.reason || "Horário bloqueado"), h("p", { class: "when" }, `${T.dayLabel(s.ymd)} · ${allDay ? "dia inteiro" : `${T.hm(s.min)} às ${T.hm(e.min)}`}`)),
      h("span", { class: "pill p-block" }, "Bloqueado")),
    h("div", { class: "row" }, h("span", { class: "bpill", style: `--c:${k.barber_id ? bColor(k.barber_id) : "#a69c87"}` }, who)),
    h("div", { class: "actions" }, twoTap("Remover bloqueio", "Toque de novo para remover", async (btn) => {
      btn.disabled = true;
      try { await DB.delBlock(k.id); toast("Bloqueio removido. O horário voltou para o site."); await refresh(); } catch (err) { toast(err.message); btn.disabled = false; }
    })));
}
async function renderBlocks() {
  const from = T.ms(today(), 0), list = await DB.blocks(from, from + 120 * 86400000);
  list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  $("#block-list").replaceChildren(...(list.length ? list.map(blockCard) : [empty("Nenhum bloqueio", "Os horários bloqueados aparecem aqui.")]));
}
$("#b-date").value = today();
$("#b-all").addEventListener("change", (e) => { $("#b-times").hidden = e.target.checked; });
$("#block-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = $("#b-date").value, all = $("#b-all").checked;
  if (!d) return toast("Escolha o dia.");
  const from = all ? 0 : T.toMin($("#b-from").value || "00:00"), to = all ? 1440 : T.toMin($("#b-to").value || "00:00");
  if (to <= from) return toast("O horário final precisa ser depois do inicial.");
  const btn = e.submitter; if (btn) btn.disabled = true;
  try {
    await DB.addBlock(T.iso(d, from), to === 1440 ? T.iso(T.addDays(d, 1), 0) : T.iso(d, to), $("#b-reason").value.trim(), $("#b-barber").value || null);
    $("#b-reason").value = "";
    toast("Bloqueado. Esse horário já sumiu do site.");
    await refresh();
  } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
});

// ---------- novo atendimento (lançado à mão) ----------
const AVULSO = { id: "avulso", name: "Outro serviço", grp: "Outros", min: 30, options: [{ label: "Valor livre", price: 0 }] };
const mSvcs = () => [...((DB_CAT && DB_CAT.services.filter((x) => !x.promo)) || []), AVULSO];
function mFill() {
  $("#m-svc").replaceChildren(...mSvcs().map((s) => h("option", { value: s.id }, s.name)));
  const keep = $("#m-barber").value;
  $("#m-barber").replaceChildren(...barberList().map((b) => h("option", { value: b.id }, b.name)));
  $("#m-barber").value = keep || (bFilter !== "all" ? bFilter : (barberList()[0] || {}).id || "");
  mSvc();
}
function mSvc() {
  const s = mSvcs().find((x) => x.id === $("#m-svc").value) || mSvcs()[0];
  $("#m-custom-wrap").hidden = s.id !== "avulso";
  $("#m-opt").replaceChildren(...s.options.map((o, i) => h("option", { value: i }, s.id === "avulso" ? o.label : `${o.label} · ${brl(o.price)}`)));
  $("#m-dur").value = s.min;
  mPrice();
}
function mPrice() {
  const s = mSvcs().find((x) => x.id === $("#m-svc").value) || mSvcs()[0], o = s.options[+$("#m-opt").value || 0];
  $("#m-total").value = s.id === "avulso" ? "" : o.price;
  mSit();
}
// valor final = tabela − desconto (é o que vai para a planilha)
function mFinal() {
  const base = Number($("#m-total").value) || 0, disc = Math.min(base, Math.max(0, Number(String($("#m-disc").value).replace(",", ".")) || 0));
  const fin = Math.round((base - disc) * 100) / 100;
  $("#m-final").textContent = disc ? `Valor final: ${brl(fin)} (desconto de ${brl(disc)})` : (base ? `Valor final: ${brl(fin)}` : "");
  return { base, disc, fin };
}
function mSit() { $("#m-paid-wrap").hidden = $("#m-sit").value === "confirmed"; $("#m-paid").value = mFinal().fin || ""; }
$("#m-svc").addEventListener("change", mSvc);
$("#m-opt").addEventListener("change", mPrice);
$("#m-sit").addEventListener("change", mSit);
$("#m-total").addEventListener("input", mSit);
$("#m-disc").addEventListener("input", mSit);
$("#m-open").addEventListener("click", () => { $("#m-form").hidden = !$("#m-form").hidden; if (!$("#m-form").hidden) { $("#m-date").value = aDay; mFill(); $("#m-name").focus(); } });
$("#m-cancel").addEventListener("click", () => { $("#m-form").hidden = true; });
$("#m-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = mSvcs().find((x) => x.id === $("#m-svc").value), o = s.options[+$("#m-opt").value || 0];
  const { base, disc, fin } = mFinal();
  const name = $("#m-name").value.trim(), total = fin, dur = Number($("#m-dur").value) || s.min;
  if (name.length < 2) return toast("Escreva o nome do cliente.");
  if (!$("#m-barber").value) return toast("Escolha o barbeiro.");
  if (!(total >= 0) || $("#m-total").value === "") return toast("Coloque o valor do serviço.");
  if (s.id === "avulso" && !$("#m-custom").value.trim()) return toast("Escreva o nome do serviço.");
  const st = T.ms($("#m-date").value, T.toMin($("#m-time").value || "09:00")), sit = $("#m-sit").value;
  const paid = sit === "confirmed" ? null : Number(String($("#m-paid").value || total).replace(",", "."));
  const row = {
    code: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase(),
    service_id: s.id, service_name: s.id === "avulso" ? $("#m-custom").value.trim() : s.name, option_label: o.label,
    barber_id: $("#m-barber").value, barber_name: (barberList().find((x) => x.id === $("#m-barber").value) || {}).name || "",
    total, starts_at: new Date(st).toISOString(), ends_at: new Date(st + dur * 60000).toISOString(),
    client_name: name, client_phone: T.phoneBR($("#m-phone").value), notes: disc ? `Desconto de ${brl(disc)} (tabela ${brl(base)})` : "", payment: $("#m-pay").value,
    status: sit === "done" ? "done" : "confirmed", paid_amount: paid, source: "manual",
  };
  const btn = e.submitter; if (btn) btn.disabled = true;
  try {
    await DB.addBooking(row);
    toast("Atendimento salvo na agenda.");
    $("#m-form").hidden = true; $("#m-name").value = ""; $("#m-phone").value = ""; $("#m-custom").value = ""; $("#m-disc").value = "";
    aDay = T.local(st).ymd; aMonth = aDay.slice(0, 7); await refresh();
  } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
});

// ---------- avisos ----------
let audio = null;
$("#notify-btn").addEventListener("click", async () => {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); beep(); } catch (e) { /* sem som */ }
  try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch (e) { /* ignore */ }
  $("#notify-btn").textContent = "Avisos ativados";
});
function beep() {
  if (!audio) return;
  [0, .18].forEach((d, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = i ? 1046 : 784; o.type = "sine";
    g.gain.setValueAtTime(.0001, audio.currentTime + d); g.gain.exponentialRampToValueAtTime(.3, audio.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + d + .35);
    o.connect(g).connect(audio.destination); o.start(audio.currentTime + d); o.stop(audio.currentTime + d + .4);
  });
}
function notifyNew(list) {
  beep();
  const b = list[0], text = `${b.client_name} · ${b.service_name}${barberList().length > 1 ? " com " + bName(b) : ""} · ${when(b).label}`;
  toast(list.length > 1 ? `${list.length} pedidos novos!` : `Pedido novo: ${text}`);
  try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("Novo pedido · " + NAME, { body: text, icon: "icon-192.png" }); } catch (e) { /* ignore */ }
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { /* ignore */ }
}

// ---------- abas ----------
const VIEWS = ["pedidos", "agenda", "agendados", "financeiro", "bloquear", "ajustes"];
function show(v) {
  VIEWS.forEach((x) => { $("#v-" + x).hidden = x !== v; });
  $("#tabs").querySelectorAll("button").forEach((b) => { if (b.dataset.v === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  scrollTo({ top: 0 });
  if (v === "financeiro" && window.FIN) FIN.render();
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(b.dataset.v); });

// ---------- aviso rápido ----------
let toastTimer;
function toastShow(...kids) {
  const el = $("#toast"); el.replaceChildren(...kids); el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 300); }, 6000);
}
const toast = (msg) => toastShow(msg);
const toastLink = (msg, label, href) => toastShow(msg, " ", h("a", { href, target: "_blank", rel: "noopener", style: "color:var(--accent);font-weight:600" }, label + " →"));

// ---------- início ----------
let DB_CAT = null, refreshing = null, again = false;
async function refresh() {
  if (refreshing) { again = true; return refreshing; }
  refreshing = (async () => {
    try { await Promise.all([renderPromo(), renderVisits(), renderPending(), renderPaidList(), renderReminders(), renderAgenda(), renderAgendados(), renderBlocks(), !$("#v-financeiro").hidden && window.FIN ? FIN.render() : null]); }
    catch (e) { toast(e.message); }
  })();
  await refreshing; refreshing = null;
  if (again) { again = false; return refresh(); }
}
function setConn(on) { $("#conn").classList.toggle("on", on); $("#conn-text").textContent = on ? "Ao vivo" : "Reconectando…"; }

async function start(session) {
  try { localStorage.setItem("tensini-nao-contar", "1"); } catch (e) { /* ok */ }   // as visitas do dono não entram na conta
  $("#login").hidden = true; $("#app").hidden = false; $("#tabs").hidden = false;
  $("#demo").hidden = DB.live;
  $("#who").textContent = DB.live ? session.email : "Agenda da barbearia · demonstração";
  try { DB_CAT = await DB.catalog(); } catch (e) { DB_CAT = window.SITE_CATALOG; }
  renderBFilters();
  document.body.classList.toggle("solo", barberList().length < 2);
  $("#b-barber").replaceChildren(h("option", { value: "" }, "Barbearia toda"), ...barberList().map((b) => h("option", { value: b.id }, b.name)));
  await refresh();
  // aviso quando um pagamento da InfinitePay confirma um pedido sozinho
  const paidSeen = new Set();
  DB.subscribe((p) => {
    const n = p && p.new;
    if (n && n.ip_transaction_nsu && n.status === "confirmed" && !paidSeen.has(n.id)) {
      paidSeen.add(n.id);
      beep(); toastLink(`Pagamento recebido pela InfinitePay: ${n.client_name} · ${brl(n.paid_amount)}. Horário confirmado.`,
        "Mandar confirmação", confirmLink(n));
    }
    refresh();
  }, setConn);
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}
function showLogin(msg) {
  $("#app").hidden = true; $("#tabs").hidden = true; $("#login").hidden = false;
  $("#l-err").hidden = !msg; $("#l-err").textContent = msg || "";
  setConn(false); $("#conn-text").textContent = "Desconectado";
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#l-btn").disabled = true; $("#l-err").hidden = true;
  try {
    await DB.signIn($("#l-email").value.trim(), $("#l-pass").value);
    const s = await DB.session();
    if (!s || !s.admin) { await DB.signOut(); showLogin("Esta conta não tem acesso ao painel."); return; }
    start(s);
  } catch (err) { showLogin(err.message); } finally { $("#l-btn").disabled = false; }
});
$("#logout").addEventListener("click", async () => { await DB.signOut(); if (DB.live) location.reload(); else toast("No modo demonstração não há login."); });

try { if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude/.test(location.hostname)) navigator.serviceWorker.register("sw.js"); } catch (e) { /* ignore */ }

(async () => {
  let s = null;
  try { s = await DB.session(); } catch (e) { /* sem sessão */ }
  if (s && s.admin) start(s); else showLogin(s ? "Esta conta não tem acesso ao painel." : "");
})();
