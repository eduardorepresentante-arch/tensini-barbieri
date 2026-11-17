/* Camada de dados da Tensini Barbieri: o site e o painel só falam com window.DB.
   Modo ao vivo: Supabase (config.js preenchido). Modo demonstração: localStorage deste navegador.
   Cada barbeiro tem a própria agenda: um horário só fica ocupado para o barbeiro que vai atender. */
(function () {
  const C = window.SITE_CONFIG || {};
  const live = !!(C.supabaseUrl && C.supabaseKey && window.supabase);

  // ---------- horário de Lages (America/Sao_Paulo, UTC-3 o ano todo) ----------
  const TZ = "America/Sao_Paulo", OFFSET = "-03:00";
  const pad = (n) => String(n).padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const T = {
    // {ymd, dow, min} de um instante, no horário de Lages
    local(ms) {
      const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      const ymd = `${p.year}-${p.month}-${p.day}`;
      return { ymd, dow: T.dow(ymd), min: +p.hour * 60 + +p.minute };
    },
    dow: (ymd) => new Date(ymd + "T12:00:00Z").getUTCDay(),
    addDays(ymd, n) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
    ms: (ymd, min) => Date.parse(`${ymd}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00${OFFSET}`),
    iso: (ymd, min) => `${ymd}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00${OFFSET}`,
    hm: (min) => pad(Math.floor(min / 60)) + ":" + pad(min % 60),
    toMin: (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; },
    WD: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    WD_SHORT: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
    MO: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    dayLabel(ymd) { const [, m, d] = ymd.split("-").map(Number); return `${T.WD[T.dow(ymd)]}, ${d} de ${T.MO[m - 1]}`; },
    br(ymd) { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${y}`; },
  };

  // ---------- regras da agenda (as mesmas do banco: funções check_fit e request_booking) ----------
  // barbeiros que atendem este serviço neste dia
  T.barbersFor = (cat, svcId, ymd) => (cat.barbers || []).filter((b) =>
    (!b.days || b.days.includes(T.dow(ymd))) && (!b.services || !svcId || b.services.includes(svcId)));
  // busy: [{s, e, barber}] — barber null = bloqueio da barbearia toda
  T.isFree = (busy, barberId, s, e) => !busy.some((b) => (b.barber == null || b.barber === barberId) && b.s < e && b.e > s);
  // inícios possíveis no dia: de slot_step em slot_step, sem invadir a pausa nem passar do fechamento
  T.grid = (cat, ymd, dur) => {
    const h = cat.hours[T.dow(ymd)], st = cat.settings;
    if (!h) return [];
    const open = T.toMin(h[0]), close = T.toMin(h[1]);
    const bs = st.break_start ? T.toMin(st.break_start) : null, be = st.break_end ? T.toMin(st.break_end) : null;
    const segs = bs != null && bs > open && be < close ? [[open, bs], [be, close]] : [[open, close]];
    const out = [];
    segs.forEach(([a, b]) => { for (let m = a; m + dur <= b; m += st.slot_step) out.push(m); });
    return out;
  };
  // "qualquer um": entre os livres, o que tem menos atendimentos no dia (empate: a ordem da lista)
  T.pickBarber = (cat, busy, svcId, ymd, s, e) => {
    const d0 = T.ms(ymd, 0), d1 = T.ms(T.addDays(ymd, 1), 0);
    const load = (id) => busy.filter((b) => b.barber === id && b.s < d1 && b.e > d0).length;
    const free = T.barbersFor(cat, svcId, ymd).filter((b) => T.isFree(busy, b.id, s, e));
    free.sort((a, b) => load(a.id) - load(b.id));
    return free[0] || null;
  };
  // celular do Brasil: DDD + 9 dígitos. Tira o 55 da frente e põe o 9 que falta em número antigo de 8 dígitos
  T.phoneBR = (p) => {
    let d = String(p || "").replace(/\D/g, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.startsWith("0")) d = d.replace(/^0+/, "");
    if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
    return d;
  };
  window.BT = T;

  const ERR = {
    horario_ocupado: "Esse horário acabou de ser reservado. Escolha outro, por favor.",
    sem_barbeiro: "Nenhum barbeiro está livre nesse horário. Escolha outro, por favor.",
    barbeiro_invalido: "Esse barbeiro não faz esse serviço. Escolha outro barbeiro.",
    barbeiro_folga: "Esse barbeiro não atende nesse dia. Escolha outro dia ou outro barbeiro.",
    antecedencia: "Esse horário está muito em cima. Escolha um horário com pelo menos 1 hora de antecedência.",
    fora_do_horario: "Esse horário não cabe no expediente. Escolha outro.",
    fechado: "A barbearia não abre nesse dia.",
    muito_longe: "Essa data ainda não está aberta para agendamento.",
    muitos_pedidos: "Você já tem pedidos aguardando confirmação. Fale com a gente pelo WhatsApp.",
    nome_invalido: "Escreva seu nome completo.",
    telefone_invalido: "Confira o número de WhatsApp, com DDD.",
    obs_longa: "As observações passaram de 500 caracteres.",
    promo_esgotada: "As vagas da promoção acabaram. Fale com a gente pelo WhatsApp.",
    promo_nao_comecou: "A promoção ainda não começou.",
    promo_encerrada: "A promoção já terminou.",
    promo_pagamento: "Na promoção, o pagamento é só por Pix ou cartão, antecipado.",
    promo_data: "Na promoção, o atendimento precisa ser até a data limite. Escolha outro dia.",
    "Invalid login credentials": "E-mail ou senha incorretos.",
  };
  function friendly(e) {
    const m = String((e && (e.message || e.code)) || e);
    if (e && e.code === "23P01") return ERR.horario_ocupado;
    for (const k in ERR) if (m.includes(k)) return ERR[k];
    // erro inesperado: mostra um trecho técnico curto para facilitar o suporte
    return "Não foi possível concluir agora. Confira a internet e tente de novo." + (m && m !== "undefined" ? ` (detalhe: ${m.slice(0, 90)})` : "");
  }
  const fail = (e) => { const err = new Error(friendly(e)); err.raw = e; throw err; };
  const overlaps = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;

  // ---------- Supabase ----------
  function liveDB() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
    const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) fail(error); return data; };
    const q = async (p) => { const { data, error } = await p; if (error) fail(error); return data; };
    return {
      live: true,
      catalog: () => rpc("get_catalog"),
      async busy(fromMs, toMs) {
        const rows = await rpc("busy_slots", { p_from: new Date(fromMs).toISOString(), p_to: new Date(toMs).toISOString() });
        return rows.map((r) => ({ s: Date.parse(r.starts_at), e: Date.parse(r.ends_at), barber: r.barber_id || null }));
      },
      request: (b) => rpc("request_booking", {
        p_service: b.serviceId, p_option: b.option, p_barber: b.barber, p_start: b.startIso,
        p_name: b.name, p_phone: b.phone, p_notes: b.notes, p_payment: b.payment }),
      status: (code) => rpc("booking_status", { p_code: code }),
      track: (visitor) => rpc("track_visit", { p_visitor: visitor }),
      visits: () => rpc("visit_stats"),
      // pagamento pela InfinitePay (Edge Function "infinitepay")
      async pay(body) {
        const { data, error } = await sb.functions.invoke("infinitepay", { body });
        if (error) fail(error);
        if (data && data.error && !data.paid) fail(data.error);
        return data;
      },

      // painel
      async session() {
        const { data } = await sb.auth.getSession();
        const user = data.session && data.session.user;
        if (!user) return null;
        const rows = await q(sb.from("admins").select("user_id").eq("user_id", user.id));
        return { email: user.email, admin: rows.length > 0 };
      },
      async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) fail(error); },
      signOut: () => sb.auth.signOut(),
      async bookings(fromMs, toMs) {
        await sb.rpc("expire_pending");
        return q(sb.from("bookings").select("*").lt("starts_at", new Date(toMs).toISOString()).gt("ends_at", new Date(fromMs).toISOString()).order("starts_at"));
      },
      async pending() {
        await sb.rpc("expire_pending");
        return q(sb.from("bookings").select("*").in("status", ["pending", "expired"]).gt("starts_at", new Date().toISOString()).order("created_at", { ascending: false }));
      },
      setStatus: (id, status) => q(sb.from("bookings").update({ status }).eq("id", id).select()),
      updateBooking: (id, patch) => q(sb.from("bookings").update(patch).eq("id", id).select()),
      addBooking: (row) => q(sb.from("bookings").insert(row).select()),
      expenses: (fromYmd, toYmd) => q(sb.from("expenses").select("*").gte("spent_on", fromYmd).lte("spent_on", toYmd).order("spent_on", { ascending: false })),
      addExpense: (row) => q(sb.from("expenses").insert(row)),
      delExpense: (id) => q(sb.from("expenses").delete().eq("id", id)),
      ledgers: () => q(sb.from("ledgers").select("*").order("started_at")),
      addLedger: (name) => q(sb.from("ledgers").insert({ name })),
      blocks: (fromMs, toMs) => q(sb.from("blocks").select("*").lt("starts_at", new Date(toMs).toISOString()).gt("ends_at", new Date(fromMs).toISOString()).order("starts_at")),
      addBlock: (startIso, endIso, reason, barberId) => q(sb.from("blocks").insert({ starts_at: startIso, ends_at: endIso, reason, barber_id: barberId || null })),
      delBlock: (id) => q(sb.from("blocks").delete().eq("id", id)),
      subscribe(cb, onState) {
        const ch = sb.channel("agenda")
          .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (p) => cb(p))
          .on("postgres_changes", { event: "*", schema: "public", table: "blocks" }, (p) => cb(p))
          .subscribe((s) => onState && onState(s === "SUBSCRIBED"));
        return () => sb.removeChannel(ch);
      },
    };
  }

  // ---------- Demonstração (localStorage) ----------
  function demoDB() {
    const KEY = "tensini-demo-v1";
    let mem = { bookings: [], blocks: [], expenses: [], ledgers: [] };
    const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.bookings) mem = s; } catch (e) { /* sem storage: fica em memória */ } mem.expenses = mem.expenses || []; mem.ledgers = mem.ledgers || []; return mem; };
    const cat = () => window.SITE_CATALOG;
    // mesmo comportamento do gatilho bookings_touch do banco
    const touch = (was, b) => {
      if (b.status === "confirmed" && was !== "confirmed") {
        b.confirmed_at = b.confirmed_at || new Date().toISOString();
        if (cat().settings.prepay && b.payment !== "Dinheiro" && b.paid_amount == null && !(was === null && b.source === "manual")) b.paid_amount = b.total;
      }
      if (b.status === "done" && b.paid_amount == null) b.paid_amount = b.total;
      if (b.paid_amount != null && !b.paid_at) b.paid_at = new Date().toISOString();
      if (b.paid_amount == null) b.paid_at = null;
      if (b.status !== "pending") b.expires_at = null;
      return b;
    };
    const active = (b) => b.status === "confirmed" || (b.status === "pending" && Date.parse(b.expires_at) > Date.now());
    const busyOf = (d, exceptId) => [
      ...d.bookings.filter((x) => x.id !== exceptId && active(x)).map((x) => ({ s: Date.parse(x.starts_at), e: Date.parse(x.ends_at), barber: x.barber_id })),
      ...d.blocks.map((k) => ({ s: Date.parse(k.starts_at), e: Date.parse(k.ends_at), barber: k.barber_id || null }))];
    const clash = (d, b) => (b.status === "pending" || b.status === "confirmed") &&
      !T.isFree(busyOf(d, b.id), b.barber_id, Date.parse(b.starts_at), Date.parse(b.ends_at));
    const listeners = new Set();
    const save = (d) => { mem = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* idem */ } listeners.forEach((f) => f({})); };
    try { addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((f) => f({})); }); } catch (e) { /* ignore */ }
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(Math.random()).slice(2));
    const expire = (d) => { const now = Date.now(); d.bookings.forEach((b) => { if (b.status === "pending" && Date.parse(b.expires_at) < now) b.status = "expired"; }); return d; };
    const wait = (v) => new Promise((r) => setTimeout(() => r(v), 200));
    const barberName = (id) => { const b = (cat().barbers || []).find((x) => x.id === id); return b ? b.name : ""; };
    return {
      live: false,
      catalog: () => wait(cat()),
      busy(fromMs, toMs) { return wait(busyOf(load(), null).filter((x) => overlaps(x.s, x.e, fromMs, toMs))); },
      async request(b) {
        await wait();
        const c = cat(), s = c.services.find((x) => x.id === b.serviceId), opt = s && s.options[b.option];
        if (!opt) fail("opcao_invalida");
        const phone = String(b.phone).replace(/\D/g, "");
        if (b.name.trim().length < 3) fail("nome_invalido");
        if (phone.length < 10 || phone.length > 13) fail("telefone_invalido");
        if (s.promo && b.payment === "Dinheiro") fail("promo_pagamento");
        const st = Date.parse(b.startIso), loc = T.local(st), en = st + s.min * 60000;
        if (!c.hours[loc.dow]) fail("fechado");
        if (!T.grid(c, loc.ymd, s.min).includes(loc.min)) fail("fora_do_horario");
        if (st < Date.now() + c.settings.min_notice_min * 60000) fail("antecedencia");
        const d = expire(load()), busy = busyOf(d, null);
        let barber;
        if (!b.barber || b.barber === "any") {
          barber = T.pickBarber(c, busy, s.id, loc.ymd, st, en);
          if (!barber) fail("sem_barbeiro");
        } else {
          barber = c.barbers.find((x) => x.id === b.barber);
          if (!barber || (barber.services && !barber.services.includes(s.id))) fail("barbeiro_invalido");
          if (barber.days && !barber.days.includes(loc.dow)) fail("barbeiro_folga");
          if (!T.isFree(busy, barber.id, st, en)) fail("horario_ocupado");
        }
        if (d.bookings.filter((x) => x.client_phone === phone && x.status === "pending").length >= 2) fail("muitos_pedidos");
        const code = uuid().replace(/-/g, "").slice(0, 6).toUpperCase();
        const expires_at = new Date(Date.now() + c.settings.hold_hours * 3600000).toISOString();
        d.bookings.push({ id: uuid(), code, created_at: new Date().toISOString(), service_id: s.id, service_name: s.name,
          option_label: opt.label, total: opt.price, starts_at: new Date(st).toISOString(), ends_at: new Date(en).toISOString(),
          barber_id: barber.id, barber_name: barber.name, any_barber: !b.barber || b.barber === "any",
          client_name: b.name.trim(), client_phone: phone, notes: b.notes || "", payment: b.payment, status: "pending", expires_at,
          confirmed_at: null, paid_amount: null, paid_at: null, source: "site" });
        save(d);
        return { code, total: opt.price, expires_at, barber_id: barber.id, barber_name: barber.name };
      },
      status(code) {
        const b = expire(load()).bookings.find((x) => x.code === String(code).toUpperCase());
        return wait(b ? { code: b.code, status: b.status, service: b.service_name, starts_at: b.starts_at, barber: b.barber_name } : null);
      },

      // pagamento simulado: o "link" volta direto para o site como se a InfinitePay tivesse aprovado
      async pay(body) {
        await wait();
        const d = expire(load()), b = d.bookings.find((x) => x.code === String(body.code || body.order_nsu || "").toUpperCase());
        if (!b) fail("pedido_nao_encontrado");
        if (body.action === "link") return { url: `${location.pathname}?pagamento=${b.code}&order_nsu=${b.code}&transaction_nsu=DEMO${b.code}&slug=demo` };
        if (b.paid_amount == null) {
          Object.assign(b, { paid_amount: b.total, paid_at: new Date().toISOString(), ip_transaction_nsu: body.transaction_nsu, ip_method: "PIX", ip_installments: 1 });
          const was = b.status; b.status = "confirmed"; touch(was, b); save(d);
        }
        return { paid: true, status: b.status, code: b.code };
      },
      session: () => wait({ email: "demonstração", admin: true }),
      signIn: () => wait(),
      signOut: () => wait(),
      bookings(fromMs, toMs) {
        const d = expire(load());
        return wait(d.bookings.filter((b) => overlaps(Date.parse(b.starts_at), Date.parse(b.ends_at), fromMs, toMs)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      },
      pending() {
        const d = expire(load());
        return wait(d.bookings.filter((b) => (b.status === "pending" || b.status === "expired") && Date.parse(b.starts_at) > Date.now())
          .sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      async setStatus(id, status) {
        await wait();
        const d = expire(load()), b = d.bookings.find((x) => x.id === id);
        if (!b) fail("nao_encontrado");
        if (clash(d, { ...b, status })) fail("horario_ocupado");
        const was = b.status; b.status = status; touch(was, b);
        save(d);
      },
      async updateBooking(id, patch) {
        await wait();
        const d = expire(load()), b = d.bookings.find((x) => x.id === id);
        if (!b) fail("nao_encontrado");
        const next = { ...b, ...patch };
        if (patch.barber_id) next.barber_name = barberName(patch.barber_id) || next.barber_name;
        if (clash(d, next)) fail("horario_ocupado");
        Object.assign(b, touch(b.status, next));
        save(d);
      },
      async addBooking(row) {
        await wait();
        const d = expire(load()), b = { id: uuid(), created_at: new Date().toISOString(), notes: "", paid_amount: null, paid_at: null, confirmed_at: null, expires_at: null, source: "manual", any_barber: false, ...row };
        b.barber_name = barberName(b.barber_id) || b.barber_name || "";
        if (clash(d, b)) fail("horario_ocupado");
        d.bookings.push(touch(null, b)); save(d);
      },
      expenses(fromYmd, toYmd) { return wait(load().expenses.filter((x) => x.spent_on >= fromYmd && x.spent_on <= toYmd).sort((a, b) => b.spent_on.localeCompare(a.spent_on))); },
      async addExpense(row) { await wait(); const d = load(); d.expenses.push({ id: uuid(), created_at: new Date().toISOString(), ...row }); save(d); },
      async delExpense(id) { await wait(); const d = load(); d.expenses = d.expenses.filter((x) => x.id !== id); save(d); },
      ledgers() { return wait(load().ledgers.slice().sort((a, b) => a.started_at.localeCompare(b.started_at))); },
      async addLedger(name) { await wait(); const d = load(); d.ledgers.push({ id: uuid(), name, started_at: new Date().toISOString() }); save(d); },
      // visitas: na demonstração, só deste navegador
      async track(visitor) {
        const d = load(), day = T.local(Date.now()).ymd; d.visits = d.visits || [];
        const v = d.visits.find((x) => x.day === day && x.visitor === visitor);
        if (v) v.views++; else d.visits.push({ day, visitor, views: 1 });
        save(d);
      },
      async visits() {
        const vs = load().visits || [], today = T.local(Date.now()).ymd, uniq = (a) => new Set(a.map((x) => x.visitor)).size;
        return { today: vs.filter((x) => x.day === today).length, week: uniq(vs.filter((x) => x.day > T.addDays(today, -7))),
          month: uniq(vs.filter((x) => x.day.slice(0, 7) === today.slice(0, 7))), total: uniq(vs), views: vs.reduce((n, x) => n + x.views, 0),
          since: vs.length ? vs.map((x) => x.day).sort()[0] : null,
          days: Array.from({ length: 14 }, (_, i) => { const day = T.addDays(today, i - 13); return { day, n: vs.filter((x) => x.day === day).length }; }) };
      },
      // só na demonstração: 4 meses de atendimentos e despesas de exemplo, na agenda de cada barbeiro
      async seedDemo() {
        const d = load(), c = cat(), names = ["André", "Bruno", "Caio", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Lucas", "Matheus", "Pedro", "Thiago"];
        const pays = ["Pix", "Pix", "Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"], weights = { corte: 5, degrade: 6, barba: 3, "corte-barba": 6, pigmentacao: 2, sobrancelha: 2, platinado: 1, infantil: 2 };
        const pool = c.services.filter((s) => !s.promo).flatMap((s) => Array(weights[s.id] || 1).fill(s));
        let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const today = T.local(Date.now()).ymd;
        for (let i = -120; i <= 10; i++) {
          const ymd = T.addDays(today, i), h = c.hours[T.dow(ymd)];
          if (!h) continue;
          T.barbersFor(c, null, ymd).forEach((br) => {
            let m = T.toMin(h[0]) + Math.floor(rnd() * 4) * 30;
            const n = 2 + Math.floor(rnd() * 5);
            for (let k = 0; k < n; k++) {
              const s = pool[Math.floor(rnd() * pool.length)];
              if (br.services && !br.services.includes(s.id)) continue;
              const opt = s.options[Math.floor(rnd() * s.options.length)];
              if (m + s.min > T.toMin(h[1])) break;
              if (c.settings.break_start && m < T.toMin(c.settings.break_end) && m + s.min > T.toMin(c.settings.break_start)) { m = T.toMin(c.settings.break_end); continue; }
              const st = T.ms(ymd, m), past = st < Date.now(), pay = pays[Math.floor(rnd() * pays.length)];
              const r = rnd(), status = past ? (r < 0.07 ? "cancelled" : r < 0.1 ? "expired" : "done") : (r < 0.25 ? "pending" : "confirmed");
              const paid = status === "done" ? opt.price : null;
              d.bookings.push({ id: uuid(), code: "EX" + uuid().slice(0, 4).toUpperCase(), created_at: new Date(st - 3 * 86400000).toISOString(), service_id: s.id, service_name: s.name,
                option_label: opt.label, total: opt.price, starts_at: new Date(st).toISOString(), ends_at: new Date(st + s.min * 60000).toISOString(),
                barber_id: br.id, barber_name: br.name, any_barber: rnd() < 0.3,
                client_name: names[Math.floor(rnd() * names.length)] + " (exemplo)", client_phone: "4999999" + String(1000 + Math.floor(rnd() * 8999)), notes: "", payment: pay, status,
                expires_at: status === "pending" ? new Date(Date.now() + 20 * 3600000).toISOString() : null, confirmed_at: status === "confirmed" || status === "done" ? new Date(st - 2 * 86400000).toISOString() : null,
                paid_amount: paid, paid_at: paid == null ? null : new Date(st + s.min * 60000).toISOString(), source: "site" });
              m += s.min + (rnd() < 0.5 ? 0 : 30);
              m = Math.ceil(m / 30) * 30;
            }
          });
        }
        const exp = [["Produtos", "Pomadas, óleos e balm", 380], ["Material", "Lâminas e toalhas", 140], ["Contas", "Luz e água", 260], ["Aluguel", "Aluguel do ponto", 1800], ["Marketing", "Impulsionamento Instagram", 90]];
        for (let mo = 0; mo < 4; mo++) exp.forEach(([category, description, amount], j) => {
          const day = T.addDays(today, -mo * 30 - j * 5 - 2);
          d.expenses.push({ id: uuid(), spent_on: day, description: description + " (exemplo)", category, amount: Math.round(amount * (0.85 + rnd() * 0.3)), created_at: new Date(T.ms(day, 600)).toISOString() });
        });
        save(d);
      },
      async clearDemo() { await wait(); save({ bookings: [], blocks: [], expenses: [], ledgers: [] }); },
      blocks(fromMs, toMs) { return wait(load().blocks.filter((b) => overlaps(Date.parse(b.starts_at), Date.parse(b.ends_at), fromMs, toMs))); },
      async addBlock(startIso, endIso, reason, barberId) { await wait(); const d = load(); d.blocks.push({ id: uuid(), starts_at: new Date(startIso).toISOString(), ends_at: new Date(endIso).toISOString(), reason, barber_id: barberId || null }); save(d); },
      async delBlock(id) { await wait(); const d = load(); d.blocks = d.blocks.filter((b) => b.id !== id); save(d); },
      subscribe(cb, onState) { listeners.add(cb); onState && onState(true); return () => listeners.delete(cb); },
    };
  }

  window.DB = live ? liveDB() : demoDB();
})();
