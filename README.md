# Tensini Barbieri — site e agenda online

Duas partes, no mesmo endereço:

| | Para quem | Arquivo |
|---|---|---|
| **Site** | clientes: veem serviços e valores e escolhem um horário livre | `index.html` + `site.js` |
| **Agenda** | barbeiro/dono: recebe os pedidos na hora, confirma, encaixa, bloqueia, financeiro | `admin.html` + `admin.js` + `finance.js` |

Os dois podem ser instalados no celular como aplicativo ("Adicionar à tela de início").

## Agenda por barbeiro
- Hoje a barbearia tem **um barbeiro só**: o site não mostra escolha de barbeiro e o painel esconde os filtros.
- Para um segundo barbeiro, basta acrescentar uma linha na tabela `barbers` (veja `supabase/seed.sql`).
  O site passa a mostrar "Com qual barbeiro?" e "Qualquer um", e o painel mostra a agenda separada por barbeiro.
- Cada barbeiro tem a **própria agenda**: o mesmo horário pode ter um cliente com cada barbeiro.
  Em "Qualquer um", o banco escolhe, entre os livres, o que tem menos atendimentos no dia.
- Cada barbeiro pode ter **dias de trabalho** (`days`) e **serviços que faz** (`services`).
- **Bloqueio** pode ser de um barbeiro (folga, almoço, médico) ou da barbearia toda.
- A regra fica no banco (`barber_free`, `check_fit`, gatilho `bookings_fit`): vale para o site, o painel e o pagamento.
  Dois clientes tentando o mesmo barbeiro no mesmo horário: o banco aceita só o primeiro.

## Como funciona o agendamento
1. O cliente escolhe o serviço, o dia e um horário **livre** (os ocupados aparecem riscados) e toca em **Agendar**.
2. O horário fica **guardado por 24h** e o cliente recebe um código, ex.: `#48F8D9`. O WhatsApp abre com a mensagem pronta.
3. No mesmo instante o pedido aparece na **Agenda**, com som e aviso.
4. O barbeiro toca em **WhatsApp** (mensagem pronta) e depois em **Confirmar horário**. Aparece "Confirmado" para o cliente.
5. **Recusar/Cancelar**: o horário volta a ficar livre na hora. Pedido sem confirmação em 24h expira sozinho.

## Colocar no ar (uma vez)

> Tudo aqui é da barbearia: projeto Supabase próprio, Cloudflare próprio, WhatsApp próprio.
> Nunca reaproveitar o banco, as chaves ou o WhatsApp de outro cliente.

### 1. Banco de dados (Supabase, gratuito)
1. Em <https://supabase.com>, crie um projeto novo (ex.: `tensini-barbieri`, região São Paulo).
2. **SQL Editor** → cole e rode `supabase/schema.sql`, depois `supabase/seed.sql` (antes, troque serviços, valores e horários pelos reais).
3. **Authentication → Users → Add user**: crie o usuário do barbeiro (e-mail e senha, marque "Auto confirm").
4. **SQL Editor** → rode, trocando o e-mail:
   ```sql
   insert into admins (user_id) select id from auth.users where email = 'email-do-barbeiro@exemplo.com';
   ```
5. **Authentication → Sign In / Providers**: desligue "Allow new users to sign up".
6. **Settings → API**: copie a *Project URL* e a chave *publishable* (ou *anon*) para `config.js`. Nunca a chave secreta.
7. Em `config.js`, coloque também o WhatsApp, o Instagram e o bairro reais.

### 2. Site (Cloudflare Pages, gratuito)
Cloudflare → Workers & Pages → Create → Pages → conectar este repositório → sem comando de build, diretório de saída `/`.
O arquivo `_headers` já traz as regras de segurança (CSP).

### 3. Instalar no celular do barbeiro
Abra `https://<endereço do site>/admin.html` → entrar → menu do navegador → **Adicionar à tela de início**.
Em **Ajustes**, preencha chave Pix, link do cartão (se tiver) e endereço completo: ficam só no celular e entram nas mensagens.
Toque em **Ativar avisos** para ouvir o som de pedido novo.

## Painel (admin.html)
- **Pedidos**: pedidos novos, lembretes de hoje e amanhã, visitas ao site.
- **Agenda**: calendário do mês, o dia com os atendimentos, **+ Novo atendimento** (com desconto) e
  **Encaixar atendimento** (horários livres para o serviço escolhido). Com mais de um barbeiro: filtro e agenda por barbeiro.
- **Agendados**: tudo o que está marcado daqui para frente, com busca.
- **Financeiro**: entrou, lucro, despesas, ticket médio, gráfico, por serviço, forma de pagamento,
  planilha para baixar, despesas, "zerar planilha". Com mais de um barbeiro: quadro **por barbeiro** (comissão).
- **Bloquear**: folga, almoço, compromisso.
- Em cada atendimento, **Editar** corrige o valor recebido, reagenda ou troca o barbeiro.

## Pagamento
- Padrão: o cliente paga **na barbearia, no dia** (`settings.prepay = false`). Tudo conta como recebido quando o atendimento é concluído.
- Pagamento antecipado: `prepay = true` na tabela `settings` (Pix/cartão contam como recebidos ao confirmar).
- **InfinitePay automático** (opcional): `supabase/functions/infinitepay/index.ts` cria o link de pagamento e confirma sozinho.
  Segredos da função: `INFINITEPAY_HANDLE`, `SITE_URL` (e `INFINITEPAY_TOKEN` só se a conta exigir). "Verify JWT" desligado.
  Ligar no site: `infinitepay: true` em `config.js` (vale com `prepay = true` ou numa promoção).

## Promoção (opcional, hoje desligada)
Um serviço com `promo_slots` vira promoção: vagas travadas no banco, só Pix/cartão, termos sem reembolso,
faixa no topo do site e agendamento em `index.html?black`.

## Mudar valores, durações e horários
Edite `supabase/seed.sql` e rode de novo no SQL Editor (atualiza sem apagar agendamentos).
`duration_min` decide quais horários aparecem. Ajustes gerais (24h de reserva, intervalo de 30 min, 30 dias à frente,
1h de antecedência, pausa do almoço) ficam na tabela `settings`. `catalog.js` é a cópia usada só no modo demonstração.

## Modo demonstração
Com `supabaseUrl` vazio em `config.js`, tudo funciona, mas os pedidos ficam guardados só no navegador.
Faça um pedido no site, abra `admin.html` no mesmo navegador e confirme. No Financeiro, "Preencher com exemplos" cria 4 meses de dados.
Prévia em arquivos únicos: `python3 tools/build_preview.py <pasta>`.

## Regras do código
- Texto digitado por clientes só entra no painel por `textContent`, nunca `innerHTML`.
- Clientes não leem nenhuma tabela: só as funções `get_catalog`, `busy_slots` (sem nomes nem telefones), `request_booking` e `booking_status`.
- Só quem está na tabela `admins` vê e altera agendamentos.
