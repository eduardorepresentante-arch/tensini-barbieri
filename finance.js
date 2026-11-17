/* Financeiro do painel: quanto entrou, despesas, lucro, atendimentos por procedimento,
   cancelamentos, gráfico de entradas, planilha (com download) e lançamento de despesas.
   Usa h(), toast(), twoTap(), refresh(), DB_CAT e T de admin.js. */
const FIN = (() => {
  const money = (v) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const short = (v) => v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : String(Math.round(v));
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const GROUP_LABEL = { Cabelo: ["corte", "cortes"], Barba: ["barba", "barbas"], Combos: ["combo", "combos"], Acabamento: ["acabamento", "acabamentos"], "Química": ["química", "químicas"], Outros: ["outro", "outros"] };
  const STATUS_LABEL = { pending: "Aguardando", confirmed: "Confirmado", done: "Concluído", cancelled: "Cancelado", expired: "Expirou" };

  let mode = "month";
  let anchor = T.local(Date.now()).ymd.slice(0, 7);   // "AAAA-MM"
  let lastRows = [];
  let sheetIdx = null;   // null = planilha atual

  // planilhas: a inicial (tudo antes do 1º "zerar") + uma por vez que zerou. Cada lançamento (atendimento
  // ou despesa) pertence à planilha em que foi criado.
  const fmtDay = (ms) => T.br(T.local(ms).ymd);
  function sheetsFrom(ledgers) {
    const starts = [-Infinity, ...ledgers.map((l) => Date.parse(l.started_at))];
    return starts.map((st, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : Infinity;
      const label = end === Infinity ? (st === -Infinity ? "Atual" : `Atual (desde ${fmtDay(st)})`)
        : st === -Infinity ? `Anterior (até ${fmtDay(end)})` : `${fmtDay(st)} a ${fmtDay(end)}`;
      return { st, end, label };
    });
  }

  const ymdOf = (iso) => T.local(Date.parse(iso)).ymd;
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, "0");

  function period(a, md) {
    const [y, m] = a.split("-").map(Number);
    if (md === "year") {
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y),
        prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
        buckets: MONTHS.map((n, i) => ({ label: n.slice(0, 3), long: `${n} de ${y}`, from: `${y}-${pad(i + 1)}-01`, to: `${y}-${pad(i + 1)}-${pad(lastDay(y, i + 1))}` })) };
    }
    const n = lastDay(y, m), py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return { from: `${a}-01`, to: `${a}-${pad(n)}`, label: `${MONTHS[m - 1]} de ${y}`,
      prev: { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` },
      buckets: Array.from({ length: n }, (_, i) => ({ label: String(i + 1), long: `${i + 1} de ${MONTHS[m - 1]}`, from: `${a}-${pad(i + 1)}`, to: `${a}-${pad(i + 1)}` })) };
  }
  function shift(dir) {
    const [y, m] = anchor.split("-").map(Number);
    if (mode === "year") anchor = `${y + dir}-${pad(m)}`;
    else { const t = y * 12 + (m - 1) + dir; anchor = `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; }
    render();
  }

  const groupOf = (b) => { const s = DB_CAT && DB_CAT.services.find((x) => x.id === b.service_id); return s ? s.grp : "Outros"; };

  function stats(books, exps, from, to) {
    const now = Date.now(), inP = (ymd) => ymd >= from && ymd <= to;
    const paid = books.filter((b) => b.paid_amount != null && b.paid_at && inP(ymdOf(b.paid_at)));
    const inside = books.filter((b) => inP(ymdOf(b.starts_at)));
    const realized = inside.filter((b) => b.status === "done" || (b.status === "confirmed" && Date.parse(b.starts_at) < now));
    const upcoming = inside.filter((b) => b.status === "confirmed" && Date.parse(b.starts_at) >= now);
    const cancelled = inside.filter((b) => b.status === "cancelled"), expired = inside.filter((b) => b.status === "expired");
    const received = paid.reduce((t, b) => t + Number(b.paid_amount), 0);
    const toReceive = inside.filter((b) => b.status === "confirmed" && b.paid_amount == null).reduce((t, b) => t + Number(b.total), 0);
    const spent = exps.filter((x) => inP(x.spent_on)).reduce((t, x) => t + Number(x.amount), 0);
    const byPay = {}; paid.forEach((b) => { byPay[b.payment] = (byPay[b.payment] || 0) + Number(b.paid_amount); });
    const byBarber = {}; realized.forEach((b) => { const k = b.barber_name || b.barber_id || "—"; (byBarber[k] = byBarber[k] || { n: 0, v: 0 }); byBarber[k].n++; byBarber[k].v += Number(b.paid_amount != null ? b.paid_amount : b.total); });
    const bySvc = {}; realized.forEach((b) => { const k = b.service_name; (bySvc[k] = bySvc[k] || { n: 0, v: 0 }); bySvc[k].n++; bySvc[k].v += Number(b.paid_amount != null ? b.paid_amount : b.total); });
    const byGrp = {}; realized.forEach((b) => { const g = groupOf(b); byGrp[g] = (byGrp[g] || 0) + 1; });
    const clients = new Set(realized.map((b) => (b.client_phone || b.client_name).toLowerCase())).size;
    const base = realized.length + upcoming.length + cancelled.length;
    return { paid, inside, realized, upcoming, cancelled, expired, received, toReceive, spent, byPay, bySvc, byBarber, byGrp, clients,
      ticket: paid.length ? received / paid.length : 0, cancelRate: base ? cancelled.length / base : 0 };
  }

  // lowerIsBetter: para despesas, subir é ruim (vermelho)
  function delta(cur, prev, lowerIsBetter) {
    if (!prev) return cur ? h("small", null, "sem dados no período anterior") : null;
    const p = Math.round(((cur - prev) / prev) * 100), good = lowerIsBetter ? p <= 0 : p >= 0;
    return h("small", null, h("span", { class: "delta " + (good ? "up" : "down") }, (p >= 0 ? "▲ " : "▼ ") + Math.abs(p) + "%"), " vs. anterior");
  }
  const kpi = (label, value, sub, cls) => h("div", { class: "kpi" + (cls ? " " + cls : "") }, h("span", null, label), h("b", null, value), sub || null);

  // ---------- gráfico de barras (uma série) ----------
  const SVG = "http://www.w3.org/2000/svg";
  const s = (tag, attrs, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); kids.forEach((k) => el.append(k)); return el; };
  function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function barChart(el, data) {
    const W = 640, H = 220, L = 46, R = 8, Tp = 12, B = 24, iw = W - L - R, ih = H - Tp - B;
    const max = niceMax(Math.max(...data.map((d) => d.v))), step = iw / data.length, bw = Math.max(2, Math.min(28, step - 2));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Entradas por " + (data.length > 12 ? "dia" : "mês") });
    const grid = s("g", { class: "grid" });
    for (let i = 0; i <= 4; i++) {
      const y = Tp + ih - (ih * i) / 4;
      grid.append(s("line", { x1: L, x2: W - R, y1: y, y2: y }), s("text", { x: L - 6, y: y + 3, "text-anchor": "end" }, i ? short((max * i) / 4) : "0"));
    }
    svg.append(grid);
    const tip = h("div", { class: "tip", hidden: true });
    const every = data.length > 12 ? 5 : 1;
    data.forEach((d, i) => {
      const x = L + step * i + (step - bw) / 2, bh = (d.v / max) * ih, y = Tp + ih - bh, r = Math.min(4, bw / 2, bh);
      const hit = s("rect", { class: "hit", x: L + step * i, y: Tp, width: step, height: ih });
      const bar = bh > 0 ? s("path", { class: "bar", d: `M${x},${Tp + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${Tp + ih} Z` }) : s("path", { class: "bar", d: "" });
      const show = () => {
        tip.replaceChildren(h("b", null, money(d.v)), `${d.long} · ${d.n} pagamento${d.n === 1 ? "" : "s"}`);
        tip.hidden = false; tip.style.left = ((x + bw / 2) / W) * 100 + "%"; tip.style.top = (Math.max(y, Tp + 20) / H) * 100 + "%";
        bar.classList.add("on");
      };
      const hide = () => { tip.hidden = true; bar.classList.remove("on"); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerleave", hide); hit.addEventListener("click", show);
      svg.append(hit, bar);
      if (i === 0 || (i + 1) % every === 0) svg.append(s("text", { x: L + step * i + step / 2, y: H - 6, "text-anchor": "middle" }, d.label));
    });
    el.replaceChildren(svg, tip);
  }
  function hbars(el, rows, fmt) {
    const max = Math.max(1, ...rows.map((r) => r.v));
    el.replaceChildren(rows.length ? h("div", { class: "hbars" }, ...rows.map((r) => h("div", { class: "hbar" },
      h("div", { class: "lbl" }, h("span", null, r.label), h("span", null, fmt(r))),
      h("div", { class: "track" }, h("div", { class: "fill", style: `width:${(r.v / max) * 100}%` }))))) : h("p", { class: "sub" }, "Nada no período."));
  }

  // ---------- planilha ----------
  function table(rows) {
    const head = h("thead", null, h("tr", null, ...["Data", "Cliente", "Serviço", "Barbeiro", "Pagamento", "Valor", "Recebido", "Situação"].map((t, i) => h("th", { class: i >= 5 && i <= 6 ? "num" : null }, t))));
    const body = h("tbody", null, ...rows.map((b) => {
      const w = T.local(Date.parse(b.starts_at));
      return h("tr", null,
        h("td", null, `${T.br(w.ymd).slice(0, 5)} ${T.hm(w.min)}`), h("td", null, b.client_name), h("td", null, b.option_label && b.option_label !== "Valor único" ? `${b.service_name} · ${b.option_label}` : b.service_name),
        h("td", null, b.barber_name || "—"), h("td", null, b.payment), h("td", { class: "num" }, money(b.total)), h("td", { class: "num" }, b.paid_amount != null ? money(b.paid_amount) : "—"),
        h("td", null, h("span", { class: "pill p-" + b.status }, STATUS_LABEL[b.status] || b.status)));
    }));
    const sum = rows.reduce((t, b) => t + (b.paid_amount != null ? Number(b.paid_amount) : 0), 0);
    const foot = h("tfoot", null, h("tr", null, h("td", { colspan: "6" }, `${rows.length} atendimento${rows.length === 1 ? "" : "s"}`), h("td", { class: "num" }, money(sum)), h("td", null, "")));
    $("#f-table").replaceChildren(head, body, foot);
  }
  function csv() {
    const cell = (v) => { const t = String(v == null ? "" : v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const num = (v) => (v == null ? "" : Number(v).toFixed(2).replace(".", ","));
    const lines = [["Data", "Hora", "Cliente", "WhatsApp", "Serviço", "Opção", "Barbeiro", "Pagamento", "Valor tabela", "Valor recebido", "Recebido em", "Situação", "Pedido", "Origem"].join(";")];
    lastRows.forEach((b) => {
      const w = T.local(Date.parse(b.starts_at));
      lines.push([T.br(w.ymd), T.hm(w.min), b.client_name, b.client_phone, b.service_name, b.option_label, b.barber_name || "", b.payment, num(b.total), num(b.paid_amount),
        b.paid_at ? T.br(ymdOf(b.paid_at)) : "", STATUS_LABEL[b.status] || b.status, b.code, b.source === "manual" ? "Painel" : "Site"].map(cell).join(";"));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `tensini-financeiro-${mode === "year" ? anchor.slice(0, 4) : anchor}${sheetIdx != null && $("#f-sheet").selectedIndex > 0 ? "-planilha-anterior" : ""}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- despesas ----------
  function expenses(list, from, to) {
    const inP = list.filter((x) => x.spent_on >= from && x.spent_on <= to);
    $("#f-exp-sum").textContent = inP.length ? `${inP.length} lançamento${inP.length === 1 ? "" : "s"} · ${money(inP.reduce((t, x) => t + Number(x.amount), 0))}` : "";
    $("#x-list").replaceChildren(...(inP.length ? inP.map((x) => h("div", { class: "xrow" },
      h("div", null, h("span", null, x.description), h("small", null, `${T.br(x.spent_on)} · ${x.category}`)),
      h("div", { class: "row" }, h("b", null, money(x.amount)), twoTap("Apagar", "Apagar?", async (btn) => {
        btn.disabled = true;
        try { await DB.delExpense(x.id); toast("Despesa apagada."); render(); } catch (e) { toast(e.message); btn.disabled = false; }
      })))) : [h("p", { class: "sub" }, "Nenhuma despesa lançada neste período.")]));
  }
  $("#x-date").value = T.local(Date.now()).ymd;
  $("#x-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number(String($("#x-amount").value).replace(",", "."));
    if (!(amount > 0)) return toast("Coloque o valor da despesa.");
    const btn = e.submitter; if (btn) btn.disabled = true;
    try {
      await DB.addExpense({ spent_on: $("#x-date").value, description: $("#x-desc").value.trim(), category: $("#x-cat").value, amount });
      $("#x-desc").value = ""; $("#x-amount").value = "";
      toast("Despesa lançada."); render();
    } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
  });

  // ---------- montar a tela ----------
  let busy = false, queued = false;
  async function render() {
    if (busy) { queued = true; return; }
    busy = true;
    try {
      const p = period(anchor, mode);
      $("#f-label").textContent = p.label.charAt(0).toUpperCase() + p.label.slice(1);
      $("#f-demo").hidden = DB.live;
      document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      const wide = [T.addDays(p.prev.from, -60), T.addDays(p.to, 60)];
      const [allBooks, allExps, ledgers] = await Promise.all([DB.bookings(T.ms(wide[0], 0), T.ms(wide[1], 0)), DB.expenses(p.prev.from, p.to),
        DB.ledgers().catch(() => null)]);
      const sheets = sheetsFrom(ledgers || []);
      if (sheetIdx == null || sheetIdx >= sheets.length) sheetIdx = sheets.length - 1;
      const sh = sheets[sheetIdx], old = sheetIdx < sheets.length - 1;
      const inSheet = (x) => { const c = Date.parse(x.created_at); return !(c < sh.st) && c < sh.end; };
      const books = allBooks.filter(inSheet), exps = allExps.filter(inSheet);
      $("#f-sheet").replaceChildren(...sheets.map((x, i) => h("option", { value: i, selected: i === sheetIdx }, x.label)).reverse());
      $("#f-reset").hidden = old || ledgers == null;
      $("#f-sheet-note").hidden = !old;
      $("#f-sheet-note").textContent = old ? "Você está vendo uma planilha anterior. Ela fica salva aqui; os lançamentos novos vão para a planilha atual." : "";
      $("#x-form").hidden = old;
      const cur = stats(books, exps, p.from, p.to), prev = stats(books, exps, p.prev.from, p.prev.to);
      const profit = cur.received - cur.spent;

      $("#f-kpis").replaceChildren(
        kpi("Entrou", money(cur.received), delta(cur.received, prev.received), "hero"),
        kpi("Lucro", money(profit), h("small", null, "entradas − despesas")),
        kpi("Despesas", money(cur.spent), delta(cur.spent, prev.spent, true)),
        kpi("Atendimentos", String(cur.realized.length), delta(cur.realized.length, prev.realized.length)),
        kpi("Ticket médio", money(Math.round(cur.ticket)), h("small", null, `${cur.clients} cliente${cur.clients === 1 ? "" : "s"} atendido${cur.clients === 1 ? "" : "s"}`)),
        kpi("A receber", money(cur.toReceive), h("small", null, `${cur.upcoming.length} agendado${cur.upcoming.length === 1 ? "" : "s"} pela frente`)),
        kpi("Cancelamentos", String(cur.cancelled.length), h("small", null, `${Math.round(cur.cancelRate * 100)}% · ${cur.expired.length} expirado${cur.expired.length === 1 ? "" : "s"}`)));

      const data = p.buckets.map((bk) => {
        const list = cur.paid.filter((b) => { const d = ymdOf(b.paid_at); return d >= bk.from && d <= bk.to; });
        return { label: bk.label, long: bk.long, v: list.reduce((t, b) => t + Number(b.paid_amount), 0), n: list.length };
      });
      $("#f-chart-sub").textContent = mode === "year" ? "por mês, pela data do pagamento" : "por dia, pela data do pagamento";
      barChart($("#f-chart"), data);

      $("#f-groups").replaceChildren(...Object.entries(cur.byGrp).sort((a, b) => b[1] - a[1]).map(([g, n]) => {
        const [one, many] = GROUP_LABEL[g] || [g.toLowerCase(), g.toLowerCase()];
        return h("span", { class: "pill" }, `${n} ${n === 1 ? one : many}`);
      }));
      hbars($("#f-barbers"), Object.entries(cur.byBarber).map(([k, v]) => ({ label: k, v: v.v, n: v.n })).sort((a, b) => b.v - a.v),
        (r) => `${r.n}× · ${money(r.v)}`);
      hbars($("#f-procs"), Object.entries(cur.bySvc).map(([k, v]) => ({ label: k, v: v.n, money: v.v })).sort((a, b) => b.v - a.v),
        (r) => `${r.v}× · ${money(r.money)}`);
      const totalPay = Object.values(cur.byPay).reduce((t, v) => t + v, 0) || 1;
      hbars($("#f-pay"), ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"].filter((k) => cur.byPay[k]).map((k) => ({ label: k, v: cur.byPay[k] })),
        (r) => `${money(r.v)} · ${Math.round((r.v / totalPay) * 100)}%`);

      lastRows = cur.inside.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      table(lastRows);
      expenses(exps, p.from, p.to);
    } catch (e) { toast(e.message); }
    busy = false;
    if (queued) { queued = false; render(); }
  }

  $("#f-sheet").addEventListener("change", (e) => { sheetIdx = +e.target.value; render(); });
  let resetArmed = false;
  $("#f-reset").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!resetArmed) {
      resetArmed = true; btn.classList.add("armed"); btn.textContent = "Toque de novo para zerar";
      setTimeout(() => { resetArmed = false; btn.classList.remove("armed"); btn.textContent = "Zerar planilha"; }, 3500);
      return;
    }
    resetArmed = false; btn.disabled = true;
    try {
      await DB.addLedger(`Planilha desde ${fmtDay(Date.now())}`);
      sheetIdx = null;
      toast("Planilha zerada. A anterior ficou salva: escolha em \"Planilha\" para ver.");
      await render();
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.classList.remove("armed"); btn.textContent = "Zerar planilha";
  });
  $("#f-prev").addEventListener("click", () => shift(-1));
  $("#f-next").addEventListener("click", () => shift(1));
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; render(); }));
  $("#f-csv").addEventListener("click", () => { if (!lastRows.length) return toast("Nenhum atendimento neste período."); csv(); });
  $("#f-seed").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    await DB.seedDemo(); toast("Exemplos criados na agenda de cada barbeiro. Veja também a Agenda e os Pedidos."); e.currentTarget.disabled = false;
    refresh();
  });
  let clearArmed = false;
  $("#f-clear").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!clearArmed) { clearArmed = true; btn.textContent = "Toque de novo para apagar"; setTimeout(() => { clearArmed = false; btn.textContent = "Apagar tudo"; }, 3500); return; }
    clearArmed = false; btn.textContent = "Apagar tudo";
    await DB.clearDemo(); toast("Demonstração zerada."); refresh();
  });

  return { render };
})();
window.FIN = FIN;
