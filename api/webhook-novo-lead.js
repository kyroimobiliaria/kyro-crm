// api/webhook-novo-lead.js
//
// Função "serverless" da Vercel (roda no servidor, nunca no navegador).
// O Supabase chama essa URL automaticamente toda vez que uma linha nova é
// inserida na tabela "leads". Aqui a gente busca o WhatsApp do corretor
// responsável e manda o aviso via Meta WhatsApp Cloud API.
//
// Variáveis de ambiente necessárias (Vercel > Settings > Environment Variables):
//   SUPABASE_URL               -> a mesma URL que está no config.js
//   SUPABASE_SERVICE_ROLE_KEY  -> Supabase > Settings > API > "service_role" (secreta, NUNCA a "anon")
//   META_WHATSAPP_TOKEN
//   META_PHONE_NUMBER_ID
//   WEBHOOK_SECRET              -> uma senha qualquer que você inventa, só pra confirmar
//                                  que quem chamou essa função foi realmente o Supabase

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // 1) Confere a "senha" enviada pelo Supabase no cabeçalho da requisição.
  //    Isso impede que qualquer pessoa na internet chame essa URL e dispare
  //    mensagens falsas.
  const segredoRecebido = req.headers["x-webhook-secret"];
  if (segredoRecebido !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  // 2) O Supabase manda o formato: { type: 'INSERT', table: 'leads', record: {...} }
  const payload = req.body;
  if (!payload || payload.type !== "INSERT" || payload.table !== "leads") {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  const lead = payload.record;
  if (!lead.corretor_id) {
    return res.status(200).json({ ok: true, motivo: "Lead sem corretor responsável ainda." });
  }

  // 3) Busca o nome + whatsapp do corretor responsável na tabela profiles.
  //    Usamos a service_role key aqui (nunca a anon) porque essa consulta
  //    roda no servidor, protegida — ela ignora as regras de RLS.
  const profileRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${lead.corretor_id}&select=nome,whatsapp`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  const profiles = await profileRes.json();
  const corretor = Array.isArray(profiles) ? profiles[0] : null;

  if (!corretor || !corretor.whatsapp) {
    return res.status(200).json({ ok: true, motivo: "Corretor sem WhatsApp cadastrado no perfil." });
  }

  // 4) Manda a mensagem usando o template aprovado.
  const resultado = await enviarTemplateWhatsApp({
    to: corretor.whatsapp,
    templateName: "novo_lead_kyro",
    languageCode: "pt_BR",
    bodyParams: [lead.nome || "Sem nome", lead.tipo || lead.interesse || "-", formatarAgora()],
  });

  return res.status(200).json({ ok: resultado.ok, error: resultado.error });
};

function formatarAgora() {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Formata o número pro padrão que a Meta espera: só dígitos, com "55" na frente.
function formatPhoneForMeta(numero) {
  const digits = String(numero).replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function enviarTemplateWhatsApp({ to, templateName, languageCode = "pt_BR", bodyParams = [] }) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "META_WHATSAPP_TOKEN ou META_PHONE_NUMBER_ID não configurados." };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: formatPhoneForMeta(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  };

  try {
    const apiRes = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await apiRes.json();
    if (!apiRes.ok) return { ok: false, error: data?.error?.message || `Erro HTTP ${apiRes.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
