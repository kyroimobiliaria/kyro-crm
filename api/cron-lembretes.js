// Roda periodicamente (chamado por um cron externo, a cada ~10 min).
// Verifica quem tem compromisso daqui a ~1 hora e manda lembrete via WhatsApp,
// nas duas agendas: ligações (leads) e visitas confirmadas (agenda_gerente).

module.exports = async function handler(req, res) {
  const segredoRecebido = req.headers["x-webhook-secret"];
  if (segredoRecebido !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const agora = new Date();
  const inicio = new Date(agora.getTime() + 55 * 60000).toISOString();
  const fim = new Date(agora.getTime() + 65 * 60000).toISOString();

  const resultadoLigacoes = await processarLembretesLigacao(inicio, fim);
  const resultadoVisitas = await processarLembretesVisita(inicio, fim);

  console.log("[cron-lembretes] Ligações:", JSON.stringify(resultadoLigacoes));
  console.log("[cron-lembretes] Visitas:", JSON.stringify(resultadoVisitas));

  return res.status(200).json({ ok: true, ligacoes: resultadoLigacoes, visitas: resultadoVisitas });
};

// ---------- Agenda de ligações (leads) ----------
async function processarLembretesLigacao(inicio, fim) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/leads?agendamento=gte.${inicio}&agendamento=lte.${fim}&agendamento_concluido=eq.false&lembrete_1h_enviado=eq.false&excluido_em=is.null&select=id,nome,telefone,agendamento,agendamento_obs,corretor_id`;
  const leads = await fetchSupabase(url);
  let enviados = 0;

  for (const lead of leads) {
    const corretor = await fetchProfile(lead.corretor_id, "whatsapp");
    if (corretor && corretor.whatsapp) {
      await enviarTemplateWhatsApp({
        to: corretor.whatsapp,
        templateName: "kyro_lembrete_ligacao",
        languageCode: "pt_BR",
        bodyParams: [lead.nome || "-", formatarDataHora(lead.agendamento), lead.agendamento_obs || "-"],
      });
      enviados++;
    }
    await marcarLembreteEnviado("leads", lead.id);
  }
  return { encontrados: leads.length, enviados };
}

// ---------- Agenda do Gerente (agenda_gerente) ----------
async function processarLembretesVisita(inicio, fim) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/agenda_gerente?data_hora=gte.${inicio}&data_hora=lte.${fim}&status=eq.aceito&lembrete_1h_enviado=eq.false&select=id,data_hora,observacao,corretor_id,gerente_id`;
  const pedidos = await fetchSupabase(url);
  let enviados = 0;

  for (const pedido of pedidos) {
    const [corretor, gerente] = await Promise.all([
      fetchProfile(pedido.corretor_id, "nome,whatsapp"),
      fetchProfile(pedido.gerente_id, "whatsapp"),
    ]);

    if (corretor && corretor.whatsapp) {
      await enviarTemplateWhatsApp({
        to: corretor.whatsapp,
        templateName: "kyro_lembrete_visita",
        languageCode: "pt_BR",
        bodyParams: [corretor.nome || "-", formatarDataHora(pedido.data_hora), pedido.observacao || "-"],
      });
      enviados++;
    }
    if (gerente && gerente.whatsapp) {
      await enviarTemplateWhatsApp({
        to: gerente.whatsapp,
        templateName: "kyro_lembrete_visita",
        languageCode: "pt_BR",
        bodyParams: [corretor ? corretor.nome || "-" : "-", formatarDataHora(pedido.data_hora), pedido.observacao || "-"],
      });
      enviados++;
    }
    await marcarLembreteEnviado("agenda_gerente", pedido.id);
  }
  return { encontrados: pedidos.length, enviados };
}

// ---------- Utilitários ----------
async function fetchSupabase(url) {
  const res = await fetch(url, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchProfile(id, campos) {
  if (!id) return null;
  const data = await fetchSupabase(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&select=${campos}`);
  return data[0] || null;
}

async function marcarLembreteEnviado(tabela, id) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ lembrete_1h_enviado: true }),
  });
}

function formatarDataHora(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatPhoneForMeta(numero) {
  const digits = String(numero).replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function enviarTemplateWhatsApp({ to, templateName, languageCode = "pt_BR", bodyParams = [] }) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { ok: false, error: "Variáveis da Meta não configuradas." };

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: formatPhoneForMeta(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] : undefined,
    },
  };

  try {
    const apiRes = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await apiRes.json();
    if (!apiRes.ok) console.log("[cron-lembretes] Erro Meta:", JSON.stringify(data));
    return { ok: apiRes.ok };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
