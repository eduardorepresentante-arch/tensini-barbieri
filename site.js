/* Site da Tensini Barbieri: serviços, barbeiros, horários ao vivo de cada barbeiro e agendamento (window.DB). */
const C = window.SITE_CONFIG;
const T = window.BT;
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: Number(v) % 1 ? 2 : 0 });
const hh = (t) => t.replace(":00", "h").replace(":", "h");
const waUrl = (text) => "https://wa.me/" + C.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
const NAME = C.name || "Tensini Barbieri";
const fromPrice = (s) => Math.min(...s.options.map((o) => o.price));

let CAT = null, services = [], barbers = [], busy = [], solo = false;
const state = { svc: null, opt: null, barber: "any", day: null, time: null, pay: null, sending: false };

// ---------- contato e textos fixos ----------
$("#address").innerHTML = C.area;
$("#wa-link").href = waUrl(`Olá, ${NAME}! Vim pelo site.`);
$("#float-wa").href = $("#wa-link").href;
$("#phone-text").textContent = C.whatsappLabel;
$("#year").textContent = new Date().getFullYear();
["#ig-link", "#ig-foot"].forEach((id) => { $(id).href = `https://www.instagram.com/${C.instagram}/`; });
$("#ig-link").textContent = "@" + C.instagram;

// ---------- carregamento ----------
async function boot() {
  // sem conexão com o banco: catálogo do site, sem a promoção (que só vale conferida no banco)
  try { CAT = await DB.catalog(); } catch (e) { CAT = DB.live ? { ...window.SITE_CATALOG, services: window.SITE_CATALOG.services.filter((x) => !x.promo) } : window.SITE_CATALOG; }
  const q = new URLSearchParams(location.search), testing = q.has("teste"), black = q.has("black");
  // grupo "Teste" só aparece com ?teste; promoções só entram no agendamento vindo da página da promoção (?black)
  services = CAT.services.filter((x) => (x.grp !== "Teste" || testing) && (!x.promo || (black && promoLive(x))));
  barbers = CAT.barbers || [];
  // um barbeiro só: sem escolha de barbeiro (a agenda é a dele)
  solo = barbers.length === 1;
  if (solo) { state.barber = barbers[0].id; soloTexts(); }
  renderCatalog(); renderTeam(); renderHours(); openStatus(); promoBar(black); marquee();
  $("#team-count").textContent = solo ? "Atendimento individual" : `${barbers.length} barbeiros`;
  $("#pay-rule").textContent = payOnline() ? "Pix ou cartão antecipados pelo link seguro, ou na barbearia no dia." : "Na barbearia, no dia: Pix, cartão ou dinheiro.";
  renderSvcList(); renderBarberPick(); renderDays(); renderOptions(); renderSlots(); update();
  await refreshBusy();
  setInterval(() => { if (!document.hidden) refreshBusy(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshBusy(); refreshMine(); } });
  refreshMine();
  setInterval(() => { if (!document.hidden) refreshMine(); }, 45000);
  checkReturn();
  const promo = black && services.find((x) => x.promo);
  if (promo) openBooking({ svc: promo.id });
  else if (black) toast("As vagas da promoção acabaram. Fale com a gente pelo WhatsApp.");
}
// pagamento antecipado (link InfinitePay) só quando a barbearia usa
const payOnline = (s) => !!C.infinitepay && (!!CAT.settings.prepay || !!(s && s.promo));
// promoção valendo: já começou, não acabou e ainda tem vaga
const promoLive = (x) => !!x.promo && x.promo.restam > 0 && (!x.promo.de || Date.parse(x.promo.de) <= Date.now()) && (!x.promo.ate || Date.parse(x.promo.ate) > Date.now());
function promoBar(black) {
  const p = !black && CAT.services.find(promoLive);
  $("#promo-bar").hidden = !p;
  if (p) $("#promo-bar-text").textContent = `${p.name.split(" · ")[0]} por ${brl(p.options[0].price)} · restam ${p.promo.restam} de ${p.promo.vagas} vagas`;
}

const CLOCK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="vertical-align:-1px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
function renderCatalog() {
  const groups = [];
  services.filter((s) => !s.promo).forEach((s) => { let g = groups.find((x) => x.name === s.grp); if (!g) groups.push(g = { name: s.grp, items: [] }); g.items.push(s); });
  $("#groups").innerHTML = groups.map((g) => `
    <div class="group"><h3>${esc(g.name)}</h3><div class="cards">${g.items.map((s) => `
      <article class="card glow-card reveal">
        <div class="c-top"><h4>${esc(s.name)}</h4><span class="dur">${CLOCK} ${s.min} min</span></div>
        <div style="display:grid;gap:10px;align-content:start"><p class="desc">${esc(s.desc)}</p>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}</div>
        <div class="c-foot">
          <div class="price">${s.options.length > 1
            ? `<small>a partir de</small><b>${brl(fromPrice(s))}</b><span class="opts">${s.options.map((o) => `${esc(o.label)} ${brl(o.price)}`).join(" · ")}</span>`
            : `<small>valor</small><b>${brl(s.options[0].price)}</b>`}</div>
          <a class="btn btn-line" href="#agendar" data-book="${esc(s.id)}">Agendar</a>
        </div>
      </article>`).join("")}</div></div>`).join("");
  glow();
}
const daysText = (b) => {
  const open = Object.keys(CAT.hours).map(Number);
  const d = (b.days || open).filter((x) => open.includes(x)).sort((a, c) => ((a + 6) % 7) - ((c + 6) % 7));
  if (!d.length) return "";
  const contiguous = d.every((x, i) => !i || x === (d[i - 1] + 1) % 7);
  return contiguous && d.length > 2 ? `${T.WD_SHORT[d[0]]} a ${T.WD_SHORT[d[d.length - 1]]}` : d.map((x) => T.WD_SHORT[x]).join(" · ");
};
function soloTexts() {
  const b = barbers[0];
  $("#barber-step").hidden = true;
  $("#nav-team").textContent = "O barbeiro";
  $("#team-eyebrow").textContent = "O barbeiro";
  $("#team-title").innerHTML = `Atendimento <span class="gold">com o ${esc(b.name)}</span>`;
  $("#team-sub").textContent = "Do começo ao fim com o mesmo barbeiro: você sempre sai com o mesmo padrão.";
  $("#step1-title").textContent = "Serviço";
  $("#step1-text").textContent = "Escolha o que vai fazer: corte, barba, combo ou acabamento.";
}
function renderTeam() {
  if (solo) {
    const b = barbers[0];
    $("#team").style.display = "block";
    $("#team").innerHTML = `<article class="solo-card glow-card reveal">
      <img src="mark.webp" alt="" width="160" height="165">
      <div><h3>${esc(b.name)}</h3><p class="role">${esc(b.role || "Barbeiro")}</p>
        <p class="txt">Corte, barba e acabamento feitos por ele, com hora marcada e sem fila. Cada horário é só seu: sem pressa, sem dividir a cadeira.</p>
        <div class="facts"><span class="tag"><i class="dot gold"></i>${esc(daysText(b))}</span><span class="tag"><i class="dot gold"></i>${services.filter((s) => !s.promo).length} serviços</span><span class="tag"><i class="dot gold"></i>Lages · SC</span></div>
        <a class="btn btn-gold" href="#agendar" data-open-booking>Agendar com ${esc(b.name.split(" ")[0])}</a></div>
    </article>`;
    glow(); return;
  }
  $("#team").innerHTML = barbers.map((b) => `
    <article class="barber glow-card reveal">
      <div class="mono"><span class="gold">${esc(b.name.trim()[0] || "?")}</span></div>
      <h4>${esc(b.name)}</h4>
      <p class="role">${esc(b.role || "Barbeiro")}</p>
      <p class="bdays">${esc(daysText(b).toUpperCase())}</p>
      <a class="btn btn-line" href="#agendar" data-barber="${esc(b.id)}">Agendar com ${esc(b.name.split(" ")[0])}</a>
    </article>`).join("") + `
    <article class="barber glow-card reveal">
      <div class="mono any"><span class="gold">✦</span></div>
      <h4>Qualquer um</h4>
      <p class="role">O primeiro horário livre, com quem estiver disponível.</p>
      <p class="bdays">MAIS HORÁRIOS</p>
      <a class="btn btn-gold" href="#agendar" data-barber="any">Primeiro horário livre</a>
    </article>`;
  glow();
}
function marquee() {
  const items = [...services.filter((s) => !s.promo).map((s) => s.name), "Barba na navalha", "Lages · SC"];
  const one = items.map((x) => `<span>${esc(x)}</span><i>✦</i>`).join("");
  $("#marquee").innerHTML = one + one;
}

function renderHours() {
  const today = T.local(Date.now()).dow;
  const st = CAT.settings;
  $("#hours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = CAT.hours[d], t = d === today;
    return `<li class="${t ? "today" : ""}"><span>${T.WD[d]}${t ? " · hoje" : ""}</span>${h ? `<span>${hh(h[0])} – ${hh(h[1])}</span>` : `<span class="off">Fechado</span>`}</li>`;
  }).join("") + (st.break_start ? `<li><span>Pausa para o almoço</span><span>${hh(st.break_start)} – ${hh(st.break_end)}</span></li>` : "");
}
function openStatus() {
  const n = T.local(Date.now()), h = CAT.hours[n.dow];
  const bs = CAT.settings.break_start, be = CAT.settings.break_end;
  if (h && bs && n.min >= T.toMin(bs) && n.min < T.toMin(be) && n.min >= T.toMin(h[0])) { $("#status-text").textContent = "Pausa para o almoço · volta " + hh(be); return; }
  if (h && n.min >= T.toMin(h[0]) && n.min < T.toMin(h[1])) { $("#status-dot").classList.add("open"); $("#status-text").textContent = "Aberto agora · até " + hh(h[1]); return; }
  for (let i = 0; i < 8; i++) {
    const ymd = T.addDays(n.ymd, i), x = CAT.hours[T.dow(ymd)];
    if (!x || (i === 0 && n.min >= T.toMin(x[0]))) continue;
    $("#status-text").textContent = "Fechado · abre " + (i === 0 ? "hoje" : i === 1 ? "amanhã" : T.WD[T.dow(ymd)].toLowerCase()) + " " + hh(x[0]);
    return;
  }
}

// ---------- horários ocupados (de cada barbeiro) ----------
let days = [];
async function refreshBusy() {
  if (!days.length) buildDays();
  const from = T.ms(days[0], 0), to = T.ms(T.addDays(days[days.length - 1], 1), 0);
  try {
    busy = await DB.busy(from, to);
    ["#live", "#live-cta"].forEach((id) => $(id).classList.add("on"));
    $("#live-text").textContent = "Agenda ao vivo";
  } catch (e) {
    ["#live", "#live-cta"].forEach((id) => $(id).classList.remove("on"));
    $("#live-text").textContent = "Sem conexão com a agenda";
    helpAlert("Sem conexão com a agenda");
  }
  if (state.time != null && !slotFree(state.day, state.time)) {
    state.time = null;
    toast("O horário que você escolheu acabou de ser reservado. Escolha outro, por favor.");
  }
  nextFree();
  renderDays(); renderSlots(); update();
}
// barbeiros que podem atender o serviço escolhido neste dia (todos, ou só o escolhido)
function candidates(ymd, svc = state.svc) {
  const list = T.barbersFor(CAT, svc && svc.id, ymd);
  return state.barber === "any" ? list : list.filter((b) => b.id === state.barber);
}
function slotFree(ymd, m, svc = state.svc) {
  const s = T.ms(ymd, m), e = s + svc.min * 60000;
  return candidates(ymd, svc).some((b) => T.isFree(busy, b.id, s, e));
}
function slotsFor(ymd, svc = state.svc) {
  if (!svc || !CAT.hours[T.dow(ymd)] || !candidates(ymd, svc).length) return [];
  const minStart = Date.now() + CAT.settings.min_notice_min * 60000;
  return T.grid(CAT, ymd, svc.min).filter((m) => T.ms(ymd, m) >= minStart).map((m) => ({ m, free: slotFree(ymd, m, svc) }));
}
// "próximo horário" na capa: primeiro horário livre de qualquer barbeiro para o serviço mais comum
function nextFree() {
  const svc = services.find((s) => !s.promo);
  if (!svc) return;
  const keep = state.barber; state.barber = "any";
  let txt = "—";
  for (const ymd of days.slice(0, 14)) {
    const x = slotsFor(ymd, svc).find((y) => y.free);
    if (x) { const i = days.indexOf(ymd); txt = `${i === 0 ? "hoje" : i === 1 ? "amanhã" : T.WD_SHORT[T.dow(ymd)]} ${T.hm(x.m)}`; break; }
  }
  state.barber = keep;
  $("#next-free").textContent = txt;
}

// ---------- passo 1: serviço, opção e barbeiro ----------
function renderSvcList() {
  $("#svc-list").innerHTML = services.map((s) => `<button type="button" class="svc${s.promo ? " promo" : ""}" data-id="${esc(s.id)}" aria-pressed="${state.svc === s}">
    <strong>${esc(s.name)}</strong><small>${CLOCK} ${s.min} min${s.options.length > 1 ? ` · ${s.options.length} opções` : ""}</small>
    <b>${s.options.length > 1 ? "a partir de " : ""}${brl(fromPrice(s))}</b></button>`).join("");
}
$("#svc-list").addEventListener("click", (e) => { const b = e.target.closest(".svc"); if (b) pickService(b.dataset.id); });
function pickService(id) {
  state.svc = services.find((s) => s.id === id) || null;
  if (!state.svc) return;
  state.opt = state.svc.options.length === 1 ? 0 : null;
  state.time = null;
  // o barbeiro escolhido não faz este serviço: volta para "qualquer um"
  const br = barbers.find((b) => b.id === state.barber);
  if (br && br.services && !br.services.includes(state.svc.id)) { state.barber = "any"; toast(`${br.name} não faz ${state.svc.name}. Deixamos "Qualquer um".`); }
  // promoção: só Pix ou cartão, antecipado, com termos sem reembolso
  const promo = !!state.svc.promo;
  ["Dinheiro", "Cartão de débito"].forEach((p) => { $(`#pay [data-pay="${p}"]`).hidden = promo; });
  if (promo && (state.pay === "Dinheiro" || state.pay === "Cartão de débito")) state.pay = null;
  $("#promo-terms").hidden = !promo;
  if (!promo) $("#agree-black").checked = false;
  if (promo && state.svc.promo.atendeAte) $("#promo-last").textContent = `Atendimento até ${T.br(state.svc.promo.atendeAte)}, no dia e horário que você escolher agora.`;
  payLabels();
  renderSvcList(); renderOptions(); renderBarberPick(); renderDays(); renderSlots(); update();
}
function payLabels() {
  const online = payOnline(state.svc);
  $("#pay-pix-sub").textContent = online ? "Antecipado, pelo link" : "Na barbearia";
  $("#pay-card-sub").textContent = online ? "Antecipado, até 12x" : "Na barbearia";
  $("#pay").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.pay === state.pay)));
}
function renderOptions() {
  const s = state.svc, many = !!s && s.options.length > 1;
  $("#opt-step").hidden = !many;
  if (!many) return;
  $("#opt-title").textContent = s.optTitle || "Opção";
  $("#opt-chips").innerHTML = s.options.map((o, i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${state.opt === i}">${esc(o.label)}<em>${brl(o.price)}</em></button>`).join("");
}
$("#opt-chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  state.opt = +b.dataset.i;
  $("#opt-chips").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  update();
});
const ANY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M15 14.2c2.6-.3 4.8 1.2 5.5 4"/></svg>`;
function renderBarberPick() {
  const s = state.svc;
  const any = `<button type="button" class="bp" data-b="any" aria-pressed="${state.barber === "any"}"><span class="av">${ANY_ICON}</span><strong>Qualquer um</strong><small>primeiro livre</small></button>`;
  $("#barber-pick").innerHTML = any + barbers.map((b) => {
    const no = s && b.services && !b.services.includes(s.id);
    return `<button type="button" class="bp" data-b="${esc(b.id)}" aria-pressed="${state.barber === b.id}" ${no ? "disabled" : ""}>
      <span class="av">${esc(b.name.trim()[0] || "?")}</span><strong>${esc(b.name)}</strong><small>${no ? "não faz este serviço" : esc(daysText(b))}</small></button>`;
  }).join("");
}
$("#barber-pick").addEventListener("click", (e) => {
  const b = e.target.closest(".bp"); if (!b || b.disabled) return;
  state.barber = b.dataset.b; state.time = null;
  renderBarberPick(); renderDays(); renderSlots(); update();
});
const barberName = (id = state.barber) => id === "any" ? "Qualquer um" : (barbers.find((b) => b.id === id) || {}).name || "";

// ---------- passo 2: dia e horário ----------
function buildDays() {
  const today = T.local(Date.now()).ymd;
  days = Array.from({ length: CAT.settings.days_ahead }, (_, i) => T.addDays(today, i));
}
// calendário de um mês por vez; dias lotados mostram "esgotado" tremendo
const MON = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let calMonth = null;   // "AAAA-MM" do mês na tela
function renderDays() {
  if (!days.length) buildDays();
  const first = days[0], last = days[days.length - 1];
  if (!calMonth) calMonth = (state.day || first).slice(0, 7);
  const [y, mo] = calMonth.split("-").map(Number);
  const start = `${calMonth}-01`, nDays = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  $("#cal-month").textContent = MON[mo - 1];
  $("#cal-who").textContent = solo ? NAME : state.barber === "any" ? "Todos os barbeiros" : "Agenda de " + barberName();
  $("#cal-prev").disabled = calMonth <= first.slice(0, 7);
  $("#cal-next").disabled = calMonth >= last.slice(0, 7);
  const cells = Array.from({ length: T.dow(start) }, () => `<span class="cell"></span>`);
  const lastPromo = state.svc && state.svc.promo && state.svc.promo.atendeAte;
  for (let d = 1; d <= nDays; d++) {
    const ymd = `${calMonth}-${String(d).padStart(2, "0")}`;
    const inRange = ymd >= first && ymd <= last && (!lastPromo || ymd <= lastPromo);
    const open = inRange && !!CAT.hours[T.dow(ymd)] && (!state.svc || candidates(ymd).length > 0);
    const list = open && state.svc ? slotsFor(ymd) : [];
    const full = open && !!state.svc && !list.some((x) => x.free);
    const cls = ["day", open ? "" : "off", full ? "soldout" : "", ymd === first ? "today" : ""].filter(Boolean).join(" ");
    cells.push(`<button type="button" class="${cls}" data-d="${ymd}" aria-pressed="${state.day === ymd}" ${open && !full ? "" : "disabled"} aria-label="${T.dayLabel(ymd)}${full ? ", esgotado" : !open ? ", fechado" : ""}">` +
      (full ? `<span class="sold">esgotado</span>` : "") + `<span class="dn">${d}</span></button>`);
  }
  while (cells.length % 7) cells.push(`<span class="cell"></span>`);
  $("#days").innerHTML = cells.join("");
}
function moveMonth(step) {
  const [y, m] = calMonth.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + step, 1));
  calMonth = d.toISOString().slice(0, 7); renderDays();
}
$("#cal-prev").addEventListener("click", () => moveMonth(-1));
$("#cal-next").addEventListener("click", () => moveMonth(1));
$("#days").addEventListener("click", (e) => {
  const b = e.target.closest(".day"); if (!b || b.disabled) return;
  state.day = b.dataset.d; state.time = null;
  $("#days").querySelectorAll(".day").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  renderSlots(); update();
  setTimeout(() => $("#slots").scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
});
function renderSlots() {
  const el = $("#slots");
  if (!state.svc) { el.innerHTML = `<p class="empty">Escolha o serviço para ver os horários.</p>`; return; }
  if (!state.day) { el.innerHTML = `<p class="empty">Escolha um dia para ver os horários livres${state.barber === "any" ? "" : " de " + esc(barberName())}.</p>`; return; }
  const list = slotsFor(state.day);
  if (!list.some((x) => x.free)) { el.innerHTML = `<p class="empty">Sem horários livres neste dia${state.barber === "any" ? "" : " para " + esc(barberName())}. Tente outro dia${state.barber === "any" ? "" : " ou \"Qualquer um\""}.</p>`; return; }
  const PER = [["Manhã", 0, 720], ["Tarde", 720, 1080], ["Noite", 1080, 1440]];
  el.innerHTML = PER.map(([label, a, b]) => {
    const part = list.filter((x) => x.m >= a && x.m < b);
    if (!part.length) return "";
    return `<div class="slots-group"><small>${label}</small><div class="slots">${part.map((x) =>
      `<button type="button" class="chip${x.free ? "" : " busy"}" data-m="${x.m}" aria-pressed="${state.time === x.m}" ${x.free ? "" : `disabled aria-label="${T.hm(x.m)} reservado"`}>${T.hm(x.m)}</button>`).join("")}</div></div>`;
  }).join("");
}
$("#slots").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b || b.disabled) return;
  state.time = +b.dataset.m;
  $("#slots").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  update();
});

// ---------- passo 3: dados e pagamento ----------
$("#pay").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  state.pay = b.dataset.pay;
  payLabels(); update();
});
["#f-name", "#f-phone", "#f-notes"].forEach((id) => $(id).addEventListener("input", update));
$("#agree").addEventListener("change", update);
$("#agree-black").addEventListener("change", update);

function current() {
  const s = state.svc, opt = s && state.opt != null ? s.options[state.opt] : null;
  return { s, opt, total: opt ? opt.price : null, name: $("#f-name").value.trim(), phone: $("#f-phone").value.trim(), notes: $("#f-notes").value.trim() };
}
// ---------- janela: 3 passos ----------
const PAGES = ["SERVIÇO E BARBEIRO", "DIA E HORÁRIO", "SEUS DADOS"];
let page = 1;
function pageMissing(n) {
  const { s, opt, name, phone } = current(), miss = [];
  if (n === 1) {
    if (!s) miss.push("serviço"); else if (!opt) miss.push((s.optTitle || "opção").toLowerCase().replace("?", ""));
  } else if (n === 2) {
    if (!state.day) miss.push("dia"); else if (state.time == null) miss.push("horário");
  } else {
    if (name.length < 3) miss.push("nome completo");
    if (T.phoneBR(phone).length !== 11) miss.push("WhatsApp com DDD e 9 dígitos");
    if (!state.pay) miss.push("forma de pagamento");
    if (!$("#agree").checked) miss.push("aceite dos combinados");
    if (s && s.promo && !$("#agree-black").checked) miss.push("aceite dos termos da promoção");
  }
  return miss;
}
function goPage(n) {
  page = n;
  document.querySelectorAll(".bk-page").forEach((el) => { el.hidden = +el.dataset.page !== n; });
  $("#bk-steps").textContent = `PASSO ${n} DE 3 · ${solo && n === 1 ? "SERVIÇO" : PAGES[n - 1]}`;
  $("#bk-progress").style.width = (n / 3) * 100 + "%";
  $("#bk-prev").disabled = n === 1;
  $("#bk-next").hidden = n === 3; $("#send").hidden = n !== 3;
  $(".bk-body").scrollTop = 0;
  if (n === 2) { if (state.day) calMonth = state.day.slice(0, 7); renderDays(); renderSlots(); }
  update();
}
function update() {
  const { s, opt, total } = current();
  const parts = [];
  if (s) parts.push(s.name + (opt && opt.label !== "Valor único" ? ` · ${opt.label}` : ""));
  if (s && !solo) parts.push(state.barber === "any" ? "qualquer barbeiro" : "com " + barberName());
  if (state.day) parts.push(`${T.WD_SHORT[T.dow(state.day)]} ${T.br(state.day).slice(0, 5)}` + (state.time != null ? ` · ${T.hm(state.time)}` : ""));
  $("#s-line").textContent = parts.join(" · ") || "Escolha o serviço";
  setTotal(total != null ? brl(total) : "—");
  const online = payOnline(s) && state.pay && state.pay !== "Dinheiro" && state.pay !== "Cartão de débito";
  $("#pay-note").textContent = !state.pay ? "" : online
    ? "Depois de agendar, você paga pelo link seguro da InfinitePay (Pix ou cartão em até 12x). O horário confirma sozinho quando o pagamento for aprovado."
    : s && s.promo ? "Depois de agendar, a barbearia manda a chave Pix ou o link do cartão pelo WhatsApp. A vaga é confirmada com o pagamento."
    : "Você paga na barbearia, no dia do atendimento. A barbearia confirma o horário pelo WhatsApp.";
  if (s && s.promo && state.pay) $("#pay-note").textContent += " Promoção: sem reembolso.";
  const miss = pageMissing(page);
  $("#missing").textContent = miss.length ? "Falta: " + miss.join(", ") + "." : "";
  $("#bk-next").setAttribute("aria-disabled", miss.length ? "true" : "false");
  $("#send").setAttribute("aria-disabled", miss.length || state.sending ? "true" : "false");
}
const missing = () => [1, 2, 3].flatMap(pageMissing);
$("#bk-next").addEventListener("click", () => { if (pageMissing(page).length) { $("#missing").animate([{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], 240); return; } goPage(page + 1); });
$("#bk-prev").addEventListener("click", () => { if (page > 1) goPage(page - 1); });

function openBooking({ svc, barber } = {}) {
  $("#bk").hidden = false; document.body.classList.add("bk-open");
  $("#done").hidden = true; $("#bk-foot").hidden = false;
  if (barber) { state.barber = barber; state.time = null; }
  if (svc) pickService(svc); else { renderBarberPick(); renderDays(); }
  goPage(1);
  setTimeout(() => { const f = $(".bk-win"); f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }, 30);
}
function closeBooking() { $("#bk").hidden = true; document.body.classList.remove("bk-open"); }
document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open-booking], [data-book], [data-barber]");
  if (opener && !opener.closest("#bk")) { e.preventDefault(); openBooking({ svc: opener.dataset.book, barber: opener.dataset.barber }); return; }
  if (e.target.closest("[data-close]")) closeBooking();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#bk").hidden) closeBooking(); });

function setTotal(txt) {
  const el = $("#s-total");
  if (el.textContent === txt) return;
  el.textContent = txt;
  if (txt !== "—") { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
}

// ---------- enviar pedido ----------
$("#booking").addEventListener("submit", (e) => e.preventDefault());
$("#send").addEventListener("click", async () => {
  const miss = missing();
  if (miss.length || state.sending) { $("#missing").scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
  const { s, opt, total, name, phone, notes } = current();
  state.sending = true; $("#send").textContent = "Reservando…"; update();
  try {
    const r = await DB.request({ serviceId: s.id, option: state.opt, barber: state.barber, startIso: T.iso(state.day, state.time),
      name, phone: T.phoneBR(phone), notes: notes +
        (s.promo ? `${notes ? " · " : ""}Aceitou os termos da promoção (sem reembolso) em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""), payment: state.pay });
    const order = { promo: !!s.promo, code: r.code, service: s.name, opt: opt.label, day: state.day, time: state.time, total: r.total != null ? r.total : total,
      pay: state.pay, barber: r.barber_name || barberName(), any: state.barber === "any" };
    saveMine(order);
    // Pix e cartão antecipados: paga pelo link da InfinitePay e o horário confirma sozinho; se o link falhar, segue pelo WhatsApp
    let payUrl = null;
    if (payOnline(s) && DB.pay && (state.pay === "Pix" || state.pay === "Cartão de crédito")) {
      try { payUrl = (await DB.pay({ action: "link", code: r.code })).url; } catch (e) { console.warn("infinitepay", e); }
    }
    if (payUrl) showPay(order, payUrl); else showDone(order, name, phone, notes);
    state.time = null;   // o horário agora é dele: não avisar "acabou de ser reservado"
    refreshBusy();
  } catch (e) {
    toast(e.message); helpAlert(e.message);
    if (/reservado|livre/.test(e.message)) { state.time = null; refreshBusy(); }
  } finally {
    state.sending = false; $("#send").textContent = "Agendar"; update();
  }
});

function waOrderText(o, name, phone, notes) {
  const prepay = o.promo || payOnline();
  return `Olá, ${NAME}! Acabei de agendar pelo site:\n\n` +
    `• Pedido: #${o.code}\n• Serviço: ${o.service}${o.opt !== "Valor único" ? ` (${o.opt})` : ""}\n` + (solo ? "" : `• Barbeiro: ${o.barber}${o.any ? " (escolhi qualquer um)" : ""}\n`) + `• Valor: ${brl(o.total)}\n` +
    `• Dia: ${T.WD[T.dow(o.day)]}, ${T.br(o.day)} às ${T.hm(o.time)}\n• Pagamento: ${o.pay}${prepay ? "" : " (na barbearia)"}\n• Nome: ${name}\n• WhatsApp: ${phone}` +
    (notes ? `\n• Obs.: ${notes}` : "") + "\n\nLi e concordo com os combinados da barbearia." +
    (o.promo ? " Sei que, na promoção, não há reembolso. Aguardo a chave Pix ou o link do cartão." : "") +
    `\n\nPara a barbearia confirmar: ${new URL("admin.html#pedido-" + o.code, location.href).href}`;
}
// tela final da janela: title, texto, botão principal (href, rótulo, abre em nova aba?) e nota
function doneScreen({ step, title, code, when, text, href, label, newTab = true, note = "" }) {
  document.querySelectorAll(".bk-page").forEach((el) => { el.hidden = true; });
  $("#bk-foot").hidden = true; $("#bk-steps").textContent = step; $("#bk-progress").style.width = "100%"; $("#bk-prev").disabled = true;
  $("#done").hidden = false; $(".bk-body").scrollTop = 0;
  $("#done-title").textContent = title;
  $("#done-code").textContent = code ? "#" + code : "—";
  $("#done-when").textContent = when || "";
  $("#done-hold").textContent = text;
  $("#done-wa").hidden = !href; if (href) $("#done-wa").href = href;
  $("#done-wa").textContent = label || "";
  if (newTab) $("#done-wa").setAttribute("target", "_blank"); else $("#done-wa").removeAttribute("target");
  $("#done-note").textContent = note; $("#done-note").hidden = !note;
}
const whenText = (o) => `${o.service}${solo ? "" : ` · com ${o.barber}`} · ${T.dayLabel(o.day)} às ${T.hm(o.time)}`;
function showPay(o, url) {
  doneScreen({ step: "PAGAMENTO", title: "Falta só o pagamento", code: o.code, when: whenText(o),
    text: `Você paga com segurança pela InfinitePay (Pix ou cartão). Assim que o pagamento for aprovado, o horário fica confirmado automaticamente. Ele fica guardado por ${CAT.settings.hold_hours}h.`,
    href: url, label: `Pagar ${brl(o.total)} agora`, newTab: false, note: "Estamos abrindo a página de pagamento. Se não abrir, toque no botão acima." });
  setTimeout(() => { try { location.href = url; } catch (e) { /* fica o botão */ } }, 1500);
}
// o cliente voltou da InfinitePay: confere o pagamento e mostra o resultado
async function checkReturn() {
  const q = new URLSearchParams(location.search);
  const code = q.get("order_nsu") || q.get("pagamento");
  if (!code || !DB.pay) return;
  history.replaceState(null, "", location.pathname);
  $("#bk").hidden = false; document.body.classList.add("bk-open");
  doneScreen({ step: "PAGAMENTO", title: "Confirmando seu pagamento…", code, text: "Só um instante." });
  let r = null;
  try { if (q.get("transaction_nsu")) r = await DB.pay({ action: "check", order_nsu: code, transaction_nsu: q.get("transaction_nsu"), slug: q.get("slug") || q.get("invoice_slug") || "" }); } catch (e) { r = null; }
  if (!r || !r.paid) { try { const st = await DB.status(code); if (st && st.status === "confirmed") r = { paid: true }; } catch (e) { /* ignore */ } }
  if (r && r.paid) {
    doneScreen({ step: "PAGAMENTO APROVADO", title: "Pagamento aprovado!", code,
      text: "Seu horário está confirmado. A barbearia manda a confirmação com o endereço pelo WhatsApp.",
      href: waUrl(`Olá, ${NAME}! Acabei de pagar o pedido #${code} pelo site.`), label: "Avisar a barbearia no WhatsApp" });
  } else {
    doneScreen({ step: "PAGAMENTO", title: "Ainda não recebemos o pagamento", code,
      text: "Se você já pagou, a confirmação pode levar alguns minutos e chega pelo WhatsApp. Se ainda não pagou, fale com a gente.",
      href: waUrl(`Olá, ${NAME}! Sobre o pedido #${code}: tive um problema no pagamento pelo site.`), label: "Falar no WhatsApp" });
  }
  refreshMine();
}
function showDone(o, name, phone, notes) {
  doneScreen({ step: "PEDIDO ENVIADO", title: "Horário reservado!", code: o.code, when: whenText(o),
    text: `Estamos abrindo o WhatsApp com o pedido pronto: é só tocar em enviar. A barbearia confirma por lá. Seu horário fica guardado por ${CAT.settings.hold_hours}h.`,
    href: "#", label: "Abrir o WhatsApp", note: "Se o WhatsApp não abrir sozinho, toque no botão acima." });
  const url = waUrl(waOrderText(o, name, phone, notes));
  $("#done-wa").href = url;
  // abre o WhatsApp sozinho com a mensagem pronta (o botão fica para quando o celular não abrir)
  setTimeout(() => { try { location.href = url; } catch (e) { /* fica o botão */ } }, 1400);
}
$("#done-new").addEventListener("click", () => {
  $("#done").hidden = true; $("#bk-foot").hidden = false;
  state.time = null; goPage(1);
});

// ---------- meus agendamentos (neste aparelho) ----------
const MINE_KEY = "tensini-meus-pedidos";
const readMine = () => { try { return JSON.parse(localStorage.getItem(MINE_KEY)) || []; } catch (e) { return []; } };
function saveMine(o) {
  const list = [o, ...readMine()].slice(0, 6);
  try { localStorage.setItem(MINE_KEY, JSON.stringify(list)); } catch (e) { /* sem storage */ }
  refreshMine();
}
const STATUS = {
  pending: ["Aguardando confirmação", "wait"], confirmed: ["Confirmado", "ok"], done: ["Concluído", "ok"],
  cancelled: ["Cancelado", "no"], expired: ["Expirou sem confirmação", "no"],
};
async function refreshMine() {
  const list = readMine().filter((o) => T.ms(o.day, o.time) > Date.now() - 86400000);
  $("#mine").hidden = !list.length;
  if (!list.length) return;
  const rows = await Promise.all(list.map(async (o) => { try { return [o, await DB.status(o.code)]; } catch (e) { return [o, null]; } }));
  $("#mine-list").innerHTML = rows.map(([o, st]) => {
    const [label, cls] = STATUS[st && st.status] || ["Verificando…", "wait"];
    return `<li><div><strong>${esc(o.service)}${solo || !o.barber ? "" : " · " + esc(o.barber)}</strong><span>${T.dayLabel(o.day)} às ${T.hm(o.time)} · #${esc(o.code)}</span></div><em class="pill ${cls}">${label}</em></li>`;
  }).join("");
}

// ---------- "não estou conseguindo agendar": WhatsApp com o que ele já escolheu e o erro ----------
let lastError = "";
function helpText() {
  const { s, opt, total, name, phone } = current(), lines = [];
  if (s) lines.push(`• Serviço: ${s.name}${opt && opt.label !== "Valor único" ? ` (${opt.label})` : ""}${total ? ` · ${brl(total)}` : ""}`);
  if (s && !solo) lines.push(`• Barbeiro: ${barberName()}`);
  if (state.day) lines.push(`• Dia: ${T.WD[T.dow(state.day)]}, ${T.br(state.day)}${state.time != null ? ` às ${T.hm(state.time)}` : ""}`);
  if (state.pay) lines.push(`• Pagamento: ${state.pay}`);
  if (name) lines.push(`• Nome: ${name}`);
  if (phone) lines.push(`• WhatsApp: ${phone}`);
  if (lastError) lines.push(`• Apareceu: "${lastError}"`);
  return `Olá, ${NAME}! Não estou conseguindo agendar pelo site. Pode me ajudar?` + (lines.length ? "\n\n" + lines.join("\n") : "");
}
function helpAlert(msg) {
  lastError = String(msg || "").slice(0, 200);
  $("#bk-help").classList.add("alert");
}
const updHelp = () => { $("#bk-help").href = waUrl(helpText()); };
["pointerdown", "focus", "click"].forEach((ev) => $("#bk-help").addEventListener(ev, updHelp));
updHelp();

// ---------- contador de visitas (um código aleatório por aparelho, nada pessoal) ----------
(function countVisit() {
  try {
    if (localStorage.getItem("tensini-nao-contar")) return;   // aparelho do dono: não conta
    let id = localStorage.getItem("tensini-visitante");
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join(""); localStorage.setItem("tensini-visitante", id); }
    if (sessionStorage.getItem("tensini-contou")) return;      // recarregar a página não conta de novo
    sessionStorage.setItem("tensini-contou", "1");
    if (DB.track) DB.track(id).catch(() => {});
  } catch (e) { /* sem storage: não conta */ }
})();

// ---------- aviso rápido ----------
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false; requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 300); }, 5000);
}

// ---------- brilho dourado que segue o dedo/mouse nos cartões ----------
function glow() {
  document.querySelectorAll(".glow-card:not([data-glow])").forEach((el) => {
    el.dataset.glow = "1";
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`); el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}
glow();

// ---------- capa: rede de partículas douradas ----------
(function fx() {
  const cv = $("#fx"), ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, pts = [], visible = true, mouse = null;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, (W * H) / 14000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, r: Math.random() * 1.6 + .4, p: Math.random() * 6.28 }));
  }
  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    const link = Math.min(140, W / 6);
    for (const a of pts) {
      a.x += a.vx; a.y += a.vy;
      if (a.x < -10) a.x = W + 10; if (a.x > W + 10) a.x = -10; if (a.y < -10) a.y = H + 10; if (a.y > H + 10) a.y = -10;
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < link) { ctx.strokeStyle = `rgba(212,168,75,${(1 - d / link) * .22})`; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    if (mouse) for (const a of pts) {
      const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (d < 180) { ctx.strokeStyle = `rgba(244,220,149,${(1 - d / 180) * .45})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
    }
    for (const a of pts) {
      const tw = (Math.sin(t / 700 + a.p) + 1) / 2;
      ctx.fillStyle = `rgba(244,220,149,${.35 + tw * .6})`;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r * (.7 + tw * .5), 0, 6.28); ctx.fill();
    }
  }
  function loop(t) { if (visible) frame(t); requestAnimationFrame(loop); }
  addEventListener("resize", size); size();
  cv.parentElement.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  cv.parentElement.addEventListener("pointerleave", () => { mouse = null; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cv);
  if (reduce) frame(0); else requestAnimationFrame(loop);
})();

// aplicativo instalável (funciona só no site publicado, em https)
try { if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude/.test(location.hostname)) navigator.serviceWorker.register("sw.js"); } catch (e) { /* ignore */ }

boot();
