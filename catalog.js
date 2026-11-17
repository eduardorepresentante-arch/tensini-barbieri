/* Catálogo usado no modo demonstração. No modo ao vivo o catálogo vem do banco
   (tabelas barbers, services, opening_hours e settings: ver supabase/seed.sql).
   DADOS DE EXEMPLO: trocar pelos reais da barbearia. */
window.SITE_CATALOG = {
  // slot_step: horários de 30 em 30 min; pausa do almoço; prepay = pagamento antecipado (false = paga na barbearia)
  settings: { hold_hours: 24, slot_step: 30, days_ahead: 30, min_notice_min: 60, break_start: "12:00", break_end: "13:00", prepay: false },
  // 0 = domingo ... 6 = sábado. Dia ausente = fechado
  hours: { 2: ["09:00", "20:00"], 3: ["09:00", "20:00"], 4: ["09:00", "20:00"], 5: ["09:00", "20:00"], 6: ["08:00", "18:00"] },
  // cada barbeiro tem a própria agenda. days = dias em que trabalha (null = todos os dias abertos);
  // services = o que ele faz (null = todos)
  barbers: [
    // hoje ele atende sozinho; para um segundo barbeiro, é só acrescentar uma linha (o site passa a mostrar a escolha)
    { id: "tensini", name: "Tensini", role: "Barbeiro e fundador", days: null, services: null },
  ],
  // min = duração em minutos
  services: [
    { id: "corte", grp: "Cabelo", name: "Corte", min: 40, desc: "Corte na tesoura ou na máquina, lavagem e finalização com pomada.",
      options: [{ label: "Valor único", price: 45 }] },
    { id: "degrade", grp: "Cabelo", name: "Corte degradê", min: 45, desc: "Fade navalhado (low, mid ou high), desenhado no formato do seu rosto.",
      options: [{ label: "Valor único", price: 50 }] },
    { id: "barba", grp: "Barba", name: "Barba completa", min: 30, desc: "Toalha quente, navalha, óleo e balm. Desenho e alinhamento.",
      options: [{ label: "Valor único", price: 35 }] },
    { id: "corte-barba", grp: "Combos", name: "Corte + Barba", min: 70, desc: "O combo completo: corte, barba com toalha quente e finalização.",
      options: [{ label: "Valor único", price: 75 }], note: "Economize R$ 5 no combo." },
    { id: "pigmentacao", grp: "Barba", name: "Pigmentação", min: 30, desc: "Preenche falhas e realça o desenho da barba ou do cabelo.",
      optTitle: "Onde?", options: [{ label: "Barba", price: 35 }, { label: "Cabelo", price: 30 }] },
    { id: "sobrancelha", grp: "Acabamento", name: "Sobrancelha", min: 15, desc: "Limpeza e alinhamento na navalha, com resultado natural.",
      options: [{ label: "Valor único", price: 15 }] },
    { id: "platinado", grp: "Química", name: "Platinado / Nevou", min: 120, desc: "Descoloração global ou nevou, com matização e hidratação.",
      options: [{ label: "Valor único", price: 150 }], note: "Valor final confirmado na avaliação do cabelo." },
    { id: "infantil", grp: "Cabelo", name: "Corte infantil", min: 30, desc: "Para os pequenos até 10 anos, com paciência e capricho.",
      options: [{ label: "Valor único", price: 40 }] },
  ],
};
