-- Tensini Barbieri — barbeiros, serviços, valores e horários
-- Rodar depois de schema.sql. Pode ser rodado de novo para atualizar (não apaga agendamentos).
-- DADOS DE EXEMPLO: trocar pelos reais (os mesmos de catalog.js, que é a cópia do modo demonstração).

-- Barbeiros: days = dias em que atende (0 = domingo ... 6 = sábado; null = todos os dias abertos)
--            services = serviços que faz (null = todos)
insert into barbers (id, name, role, days, services, sort) values
('tensini', 'Tensini', 'Barbeiro e fundador', null, null, 10)
-- hoje ele atende sozinho. Barbeiro novo: acrescente uma linha, ex.:
-- ('rafael', 'Rafael', 'Degradê e navalha', '{2,3,4,5,6}', null, 20)
on conflict (id) do update set name = excluded.name, role = excluded.role, days = excluded.days,
  services = excluded.services, sort = excluded.sort, active = true;
-- barbeiro que saiu: update barbers set active = false where id = '...';  (os atendimentos antigos ficam)

-- Serviços: duration_min = duração em minutos (decide quais horários aparecem)
insert into services (id, grp, name, description, duration_min, opt_title, options, note, sort) values
('corte', 'Cabelo', 'Corte', 'Corte na tesoura ou na máquina, lavagem e finalização com pomada.', 40, 'Opção',
 '[{"label":"Valor único","price":45}]', null, 10),
('degrade', 'Cabelo', 'Corte degradê', 'Fade navalhado (low, mid ou high), desenhado no formato do seu rosto.', 45, 'Opção',
 '[{"label":"Valor único","price":50}]', null, 20),
('barba', 'Barba', 'Barba completa', 'Toalha quente, navalha, óleo e balm. Desenho e alinhamento.', 30, 'Opção',
 '[{"label":"Valor único","price":35}]', null, 30),
('corte-barba', 'Combos', 'Corte + Barba', 'O combo completo: corte, barba com toalha quente e finalização.', 70, 'Opção',
 '[{"label":"Valor único","price":75}]', 'Economize R$ 5 no combo.', 40),
('pigmentacao', 'Barba', 'Pigmentação', 'Preenche falhas e realça o desenho da barba ou do cabelo.', 30, 'Onde?',
 '[{"label":"Barba","price":35},{"label":"Cabelo","price":30}]', null, 50),
('sobrancelha', 'Acabamento', 'Sobrancelha', 'Limpeza e alinhamento na navalha, com resultado natural.', 15, 'Opção',
 '[{"label":"Valor único","price":15}]', null, 60),
('platinado', 'Química', 'Platinado / Nevou', 'Descoloração global ou nevou, com matização e hidratação.', 120, 'Opção',
 '[{"label":"Valor único","price":150}]', 'Valor final confirmado na avaliação do cabelo.', 70),
('infantil', 'Cabelo', 'Corte infantil', 'Para os pequenos até 10 anos, com paciência e capricho.', 30, 'Opção',
 '[{"label":"Valor único","price":40}]', null, 80)
on conflict (id) do update set
  grp = excluded.grp, name = excluded.name, description = excluded.description, duration_min = excluded.duration_min,
  opt_title = excluded.opt_title, options = excluded.options, note = excluded.note, sort = excluded.sort;

-- Promoção (opcional): um serviço com promo_slots vira promoção com vagas travadas no banco,
-- só Pix/cartão e sem reembolso. Hoje a barbearia não usa nenhuma.

-- Horários: 0 = domingo ... 6 = sábado. Dia sem linha = fechado.
delete from opening_hours;
insert into opening_hours (dow, opens, closes) values
(2, '09:00', '20:00'), (3, '09:00', '20:00'), (4, '09:00', '20:00'), (5, '09:00', '20:00'), (6, '08:00', '18:00');

-- Ajustes gerais
update settings set hold_hours = 24, slot_step = 30, days_ahead = 30, min_notice_min = 60,
  break_start = '12:00', break_end = '13:00', prepay = false where id = 1;
