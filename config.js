/* Configuração da Tensini Barbieri.
   supabaseUrl e supabaseKey vazios = modo demonstração (agenda fica só neste navegador).
   Preencha com o projeto do Supabase DA BARBEARIA (Settings → API: Project URL e a chave publishable/anon).
   Nunca coloque aqui a chave secreta (service_role). */
window.SITE_CONFIG = {
  name: "Tensini Barbieri",
  supabaseUrl: "",
  supabaseKey: "",                  // chave pública: pode ficar no site
  whatsapp: "5549900000000",        // EXEMPLO: DDI + DDD + número, só dígitos
  whatsappLabel: "(49) 9 0000-0000",
  instagram: "tensinibarbieri",     // EXEMPLO: sem @
  area: "Centro<br>Lages · Santa Catarina",   // só o bairro: o endereço completo vai pelo WhatsApp
  infinitepay: false,               // true = Pix e cartão pagam pelo link da InfinitePay e confirmam sozinhos
};
