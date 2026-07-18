/* =========================================================================
   CRM KYRO — app completo (corretor / gerente / secretaria / diretoria)
   Dados reais e compartilhados via Supabase. Role define o que cada um vê.
   ========================================================================= */

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
// cliente isolado (não mexe na sessão de quem está logado) usado só para
// CRIAR novos acessos (gerente/diretoria cadastrando corretor/gerente/secretaria)
const sbAdmin = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'kyro-admin-temp' },
});

let ME = null;     // perfil do usuário logado
let UID = null;    // id do usuário (ou 'demo' no modo demo)
const isDemo = () => CONFIG.DEMO_MODE;

// caches
const db = { leads: [], imoveis: [], atividades: [], corretores: [], atividadesMes: [], imoveisFotos: [], agendaGerente: [] };

// controla se o Acomp está mostrando a semana ou o mês
let acompModoMensal = false;

// categorias da planilha de produtividade (Acomp)
const ATIV_CATS = [
  { key: 'ligacao', label: 'Ligações' },
  { key: 'conversa', label: 'Conversas' },
  { key: 'resposta_anuncio', label: 'Respostas de anúncio' },
  { key: 'outro', label: 'Outros contatos' },
  { key: 'interessado', label: 'Interessados' },
  { key: 'agendamento', label: 'Agendamentos' },
  { key: 'visita', label: 'Visitas' },
  { key: 'venda', label: 'Vendas' },
];

// navegação por perfil
const ROLE_NAV = {
  leads:      ['corretor', 'gerente', 'diretoria', 'secretaria'],
  agenda:     ['corretor', 'gerente', 'diretoria'],
  acomp:      ['corretor', 'gerente', 'diretoria'],
  imoveis:    ['secretaria', 'corretor', 'gerente', 'diretoria'],
  roleta:     ['gerente', 'diretoria'],
  agendagerente: ['gerente', 'diretoria'],
  corretores: ['gerente', 'diretoria'],
  dashboard:  ['gerente', 'diretoria', 'secretaria'],
};
const NAV_LABEL = { leads: 'Leads', agenda: 'Agenda', acomp: 'Acomp. Ligações', imoveis: 'Imóveis', roleta: 'Roleta de Leads', agendagerente: 'Agenda do Gerente', corretores: 'Corretores', dashboard: 'Dashboard' };

// ---------------- Auth ----------------
async function init() {
  if (isDemo()) {
    ME = { id: 'demo', nome: 'Demo', email: 'demo@kyro', role: 'diretoria' };
    UID = 'demo';
    entrarApp();
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await entrarApp(data.session.user);
  else mostrarLogin();
  sb.auth.onAuthStateChange((_e, session) => {
    if (session) entrarApp(session.user);
    else mostrarLogin();
  });
}

function mostrarLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth').classList.remove('hidden');
  authMsg('');
}

async function entrarApp(user) {
  UID = user.id;
  let { data } = await sb.from('profiles').select('*').eq('id', UID).single();
  if (!data) {
    const { error } = await sb.from('profiles').insert({ id: UID, email: user.email, nome: (user.email || '').split('@')[0] }).select().single();
    data = error ? { id: UID, role: 'corretor', nome: user.email } : error;
    if (!error) data = (await sb.from('profiles').select('*').eq('id', UID).single()).data;
  }
  ME = data || { id: UID, role: 'corretor', nome: user.email };
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = ME.email || ME.nome || '';
  document.getElementById('user-role').textContent = ME.role || 'corretor';
  pedirNotificacoes();
  buildNav();
  showView(Object.keys(ROLE_NAV).find((k) => (ROLE_NAV[k].includes(ME.role))) || 'leads');
}

function authMsg(t, cor) {
  const el = document.getElementById('auth-msg');
  el.textContent = t; el.style.color = cor || 'var(--muted)';
}
document.getElementById('auth-entrar').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithPassword({ email: v('auth-email'), password: v('auth-senha') });
  if (error) authMsg(error.message, 'var(--red)');
});
document.getElementById('logout').addEventListener('click', () => sb.auth.signOut());

// ---------------- Tema claro / escuro ----------------
function atualizarBotaoTema() {
  const btn = document.getElementById('tema-toggle');
  const claro = document.body.classList.contains('tema-claro');
  btn.textContent = claro ? '🌙 Modo escuro' : '☀️ Modo claro';
}
document.getElementById('tema-toggle').addEventListener('click', () => {
  document.body.classList.toggle('tema-claro');
  localStorage.setItem('kyro-tema', document.body.classList.contains('tema-claro') ? 'claro' : 'escuro');
  atualizarBotaoTema();
});
if (localStorage.getItem('kyro-tema') === 'claro') document.body.classList.add('tema-claro');
atualizarBotaoTema();

// ---------------- Menu mobile ----------------
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('aberta');
  document.getElementById('sidebar-overlay').classList.toggle('aberta');
});
document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('aberta');
  document.getElementById('sidebar-overlay').classList.remove('aberta');
});
// fecha o menu sozinho ao escolher uma tela, no celular
document.getElementById('nav').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.remove('aberta');
  document.getElementById('sidebar-overlay').classList.remove('aberta');
});

// ---------------- Navegação ----------------
function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  Object.keys(ROLE_NAV).forEach((key) => {
    if (!ROLE_NAV[key].includes(ME.role)) return;
    const b = document.createElement('button');
    b.textContent = NAV_LABEL[key];
    b.dataset.view = key;
    b.addEventListener('click', () => showView(key));
    nav.appendChild(b);
  });
}

async function showView(name) {
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((s) => s.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  if (name === 'leads') { await Promise.all([carregarLeads(), carregarCorretores()]); renderLeads(); }
  else if (name === 'agenda') { await carregarLeads(); renderAgenda(); }
  else if (name === 'acomp') { await carregarAtividades(); vset('corretor-foco-nicho', (ME && ME.foco_nicho) || ''); renderAcomp(); }
  else if (name === 'imoveis') { await Promise.all([carregarImoveis(), carregarCorretores(), carregarImoveisFotos()]); popularSelectCaptador(); renderImoveis(); }
  else if (name === 'roleta') { await Promise.all([carregarLeads(), carregarCorretores()]); popularSelectRoletaCorretor(); renderRoleta(); }
  else if (name === 'agendagerente') { await Promise.all([carregarAgendaGerente(), carregarCorretores()]); renderAgendaGerente(); }
  else if (name === 'corretores') { await carregarCorretores(); renderCorretores(); }
  else if (name === 'dashboard') { await carregarTudo(); renderDashboard(); }
}

// ---------------- Carregamentos ----------------
async function carregarLeads(all = false) {
  let q = sb.from('leads').select('*').order('criado_em', { ascending: false });
  if (!all && ME && ME.role === 'corretor' && !isDemo()) q = q.eq('corretor_id', UID);
  const { data, error } = await q;
  if (error) return toast(error.message);
  db.leads = data || [];
}
async function carregarAtividades(all = false) {
  let q = sb.from('atividades').select('*');
  if (!all && ME && ME.role === 'corretor' && !isDemo()) q = q.eq('corretor_id', UID);
  const { data, error } = await q;
  if (error) return toast(error.message);
  db.atividades = data || [];
}
async function carregarImoveis() {
  const { data, error } = await sb.from('imoveis').select('*').order('criado_em', { ascending: false });
  if (error) return toast(error.message);
  db.imoveis = data || [];
}
async function carregarImoveisFotos() {
  const { data, error } = await sb.from('imoveis_fotos').select('*').order('ordem', { ascending: true });
  if (error) return toast(error.message);
  db.imoveisFotos = data || [];
}
async function carregarCorretores() {
  const { data, error } = await sb.from('profiles').select('*').order('nome');
  if (error) return toast(error.message);
  db.corretores = data || [];
}
async function carregarTudo() {
  await Promise.all([carregarLeads(true), carregarAtividades(true), carregarImoveis(), carregarCorretores()]);
}

// ============================ LEADS ============================
const leadForm = document.getElementById('lead-form');
leadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = v('lead-id');
  const payload = {
    nome: v('lead-nome').trim(),
    telefone: v('lead-telefone').trim(),
    email: v('lead-email').trim(),
    tipo: v('lead-tipo'),
    nicho: v('lead-nicho'),
    temperatura: v('lead-temperatura'),
    valor_imovel: Number(v('lead-valor')) || 0,
    status: v('lead-status'),
    etiquetas: v('lead-etiquetas').trim(),
    anotacoes: v('lead-anotacoes').trim(),
    bairro: v('lead-bairro').trim(),
    agendamento: v('lead-agendamento') ? new Date(v('lead-agendamento')).toISOString() : null,
    agendamento_obs: v('lead-agendamento-obs').trim(),
  };

  if (id) {
    const leadAntigo = db.leads.find((l) => l.id === id);
    const statusAntigo = leadAntigo ? leadAntigo.status : null;

    const { error } = await sb.from('leads').update(payload).eq('id', id);
    if (error) return toast(error.message);

    if (leadAntigo && leadAntigo.roleta_status === 'aguardando_atendimento') {
      await sb.from('leads').update({ roleta_status: 'atendido' }).eq('id', id);
    }

    if (!isDemo() && statusAntigo && statusAntigo !== payload.status) {
      await sb.from('eventos').insert({
        tipo: 'mudanca_status',
        corretor_id: UID,
        lead_id: id,
        status_anterior: statusAntigo,
        status_novo: payload.status,
      });
      if (payload.status === 'Fechado') {
        await sb.from('eventos').insert({
          tipo: 'venda',
          corretor_id: UID,
          lead_id: id,
          valor_negociado: payload.valor_imovel,
        });
      }
    }
  } else {
    if (!isDemo()) payload.corretor_id = UID;
    const { data: novoLead, error } = await sb.from('leads').insert(payload).select().single();
    if (error) return toast(error.message);

    if (!isDemo() && novoLead) {
      await sb.from('eventos').insert({
        tipo: 'lead_criado',
        corretor_id: UID,
        lead_id: novoLead.id,
      });
    }
  }

  resetLeadForm();
  await carregarLeads();
  renderLeads();
});
document.getElementById('lead-cancel').addEventListener('click', resetLeadForm);
document.getElementById('lead-busca').addEventListener('input', renderLeads);

function resetLeadForm() {
  leadForm.reset();
  vset('lead-id', '');
  document.getElementById('lead-form-title').textContent = 'Novo Lead';
  document.getElementById('lead-cancel').hidden = true;
}
function editarLead(id) {
  showView('leads');
  const l = db.leads.find((x) => x.id === id); if (!l) return;
  vset('lead-id', l.id);
  vset('lead-nome', l.nome); vset('lead-telefone', l.telefone || ''); vset('lead-email', l.email || '');
  vset('lead-tipo', l.tipo || 'Comprador'); vset('lead-nicho', l.nicho || 'Revenda');
  vset('lead-temperatura', l.temperatura || 'morno'); vset('lead-valor', l.valor_imovel || 0);
  vset('lead-status', l.status || 'Novo'); vset('lead-bairro', l.bairro || '');
  vset('lead-etiquetas', l.etiquetas || ''); vset('lead-anotacoes', l.anotacoes || '');
  vset('lead-agendamento', l.agendamento ? l.agendamento.slice(0, 16) : '');
  vset('lead-agendamento-obs', l.agendamento_obs || '');
  document.getElementById('lead-form-title').textContent = 'Editar Lead';
  document.getElementById('lead-cancel').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function excluirLead(id) {
  if (!confirm('Excluir este lead?')) return;
  const { error } = await sb.from('leads').delete().eq('id', id);
  if (error) return toast(error.message);
  await carregarLeads(); renderLeads();
}
function waLead(id) {
  const l = db.leads.find((x) => x.id === id); if (!l) return;
  const url = waLink(l.telefone, l.nome);
  if (url === '#') return toast('Lead sem telefone.');
  window.open(url, '_blank');
  marcarLeadAtendido(id);
}
async function marcarLeadAtendido(id) {
  const l = db.leads.find((x) => x.id === id);
  if (!l || l.roleta_status !== 'aguardando_atendimento') return;
  const { error } = await sb.from('leads').update({ roleta_status: 'atendido' }).eq('id', id);
  if (error) return;
  l.roleta_status = 'atendido';
  renderLeads();
}
function renderLeads() {
  const t = v('lead-busca').toLowerCase();
  const f = db.leads.filter((l) => [l.nome, l.telefone, l.nicho, l.bairro, l.etiquetas].join(' ').toLowerCase().includes(t));
  document.querySelector('#lead-tabela tbody').innerHTML = f.map((l) => `
    <tr>
      <td><span class="lead-link" onclick="openLeadDetail('${l.id}')">${esc(l.nome)}</span>${l.roleta_status === 'aguardando_atendimento' ? '<div><span class="tag" style="background:#e67e22;color:#fff">⏳ Aguardando atendimento</span></div>' : ''}<div style="font-size:11px;margin-top:2px">${renderTags(l.etiquetas)}</div></td>
      <td><span class="tag t-${l.temperatura}">${tempLabel(l.temperatura)}</span></td>
      <td>${esc(l.nicho || '—')}</td>
      <td>${esc(l.status || 'Novo')}</td>
      <td><div class="row-actions">
        <button class="icon-btn wa" onclick="waLead('${l.id}')">WhatsApp</button>
        <button class="icon-btn edit" onclick="editarLead('${l.id}')">Editar</button>
        <button class="icon-btn del" onclick="excluirLead('${l.id}')">Excluir</button>
      </div></td>
    </tr>`).join('');
  document.getElementById('lead-vazio').style.display = f.length ? 'none' : 'block';
}
// ============================ AGENDA ============================
function renderAgenda() {
  const agora = new Date();
  const ags = db.leads.filter((l) => l.agendamento).sort((a, b) => new Date(a.agendamento) - new Date(b.agendamento));
  const pendentes = ags.filter((l) => new Date(l.agendamento) <= agora);
  const alerta = document.getElementById('agenda-alerta');
  if (pendentes.length) {
    alerta.classList.remove('hidden');
    alerta.textContent = `🔔 ${pendentes.length} agendamento(s) precisam de ligação agora!`;
  } else alerta.classList.add('hidden');

  // Notificação real do navegador para agendamentos vencidos
  if (pendentes.length && 'Notification' in window && Notification.permission === 'granted') {
    pendentes.slice(0, 3).forEach((l) => {
      try { new Notification('CRM Kyro — ligar para ' + l.nome, { body: fmtDateTime(l.agendamento) }); } catch (_) {}
    });
  }

  document.querySelector('#agenda-tabela tbody').innerHTML = ags.map((l) => `
    <tr>
      <td>${esc(fmtDateTime(l.agendamento))}</td>
      <td>${esc(l.nome)}</td>
      <td>${l.telefone ? `${esc(l.telefone)} <a class="icon-btn wa" href="${waLink(l.telefone, l.nome)}" target="_blank">WhatsApp</a>` : '—'}</td>
      <td>${esc(l.agendamento_obs || '')}</td>
      <td><div class="row-actions">
        <button class="icon-btn wa" onclick="waLead('${l.id}')">Ligar</button>
        <button class="icon-btn edit" onclick="editarLead('${l.id}')">Reagendar</button>
      </div></td>
    </tr>`).join('');
  document.getElementById('agenda-vazio').style.display = ags.length ? 'none' : 'block';
}

// ============================ ACOMP (PRODUTIVIDADE DIÁRIA / MENSAL) ============================
document.getElementById('salvar-foco-nicho').addEventListener('click', async () => {
  const foco = v('corretor-foco-nicho').trim();
  const { error } = await sb.rpc('atualizar_meu_foco', { novo_foco: foco });
  if (error) return toast(error.message);
  if (ME) ME.foco_nicho = foco;
  toast('Foco atualizado!');
});

function renderAcomp() {
  garantirUIAcompMensal();

  const tabelaSemanal = document.getElementById('acomp-tabela');
  const tabelaMensal = document.getElementById('acomp-tabela-mensal');

  if (acompModoMensal) {
    tabelaSemanal.style.display = 'none';
    tabelaMensal.style.display = '';
    renderAcompMensalConteudo();
  } else {
    tabelaSemanal.style.display = '';
    tabelaMensal.style.display = 'none';
    renderAcompSemanalConteudo();
  }
}

// cria o botão de alternância e a tabela mensal uma única vez, sem duplicar
function garantirUIAcompMensal() {
  if (document.getElementById('acomp-toggle-btn')) return;
  const tabelaSemanal = document.getElementById('acomp-tabela');
  if (!tabelaSemanal) return;

  const btn = document.createElement('button');
  btn.id = 'acomp-toggle-btn';
  btn.className = 'btn-ghost';
  btn.style.marginBottom = '12px';
  btn.textContent = 'Ver mês atual';
  btn.addEventListener('click', async () => {
    acompModoMensal = !acompModoMensal;
    btn.textContent = acompModoMensal ? 'Voltar pra semana' : 'Ver mês atual';
    if (acompModoMensal) await carregarAtividadesMes();
    renderAcomp();
  });
  tabelaSemanal.parentElement.insertBefore(btn, tabelaSemanal);

  const tabelaMensal = document.createElement('table');
  tabelaMensal.id = 'acomp-tabela-mensal';
  tabelaMensal.className = tabelaSemanal.className;
  tabelaMensal.style.display = 'none';
  tabelaMensal.innerHTML = `
    <thead><tr><th>Atividade</th><th style="text-align:center">Total do mês</th></tr></thead>
    <tbody></tbody>
  `;
  tabelaSemanal.parentElement.insertBefore(tabelaMensal, tabelaSemanal.nextSibling);
}

function renderAcompSemanalConteudo() {
  const dias = getWeekDays();
  document.querySelector('#acomp-tabela tbody').innerHTML = ATIV_CATS.map((cat) => {
    let total = 0;
    const cels = dias.map((d) => {
      const ds = ymd(d);
      const reg = db.atividades.find((a) => a.categoria === cat.key && a.data === ds);
      const qtd = reg ? reg.quantidade : 0;
      total += qtd;
      return `<td style="text-align:center">
        <div class="sqn ${qtd ? 'tem' : ''}" style="position:relative;display:inline-block"
             onclick="ajustarAtividade(event,'${cat.key}','${ds}',1)"
             oncontextmenu="ajustarAtividade(event,'${cat.key}','${ds}',-1)">${qtd}<span
             onclick="ajustarAtividade(event,'${cat.key}','${ds}',-1)"
             style="position:absolute;top:-8px;right:-8px;background:var(--red);color:#fff;border-radius:50%;width:20px;height:20px;font-size:13px;line-height:20px;text-align:center;cursor:pointer">−</span></div>
      </td>`;
    }).join('');
    return `<tr><td>${cat.label}</td>${cels}<td style="text-align:center;font-weight:700;color:var(--gold)">${total}</td></tr>`;
  }).join('');
  renderFunilSemana(dias);
}

async function carregarAtividadesMes() {
  const agora = new Date();
  const primeiroDia = ymd(new Date(agora.getFullYear(), agora.getMonth(), 1));
  let q = sb.from('atividades').select('*').gte('data', primeiroDia);
  if (ME && ME.role === 'corretor' && !isDemo()) q = q.eq('corretor_id', UID);
  const { data, error } = await q;
  if (error) { toast(error.message); db.atividadesMes = []; return; }
  db.atividadesMes = data || [];
}

function renderAcompMensalConteudo() {
  document.querySelector('#acomp-tabela-mensal tbody').innerHTML = ATIV_CATS.map((cat) => {
    const total = (db.atividadesMes || [])
      .filter((a) => a.categoria === cat.key)
      .reduce((s, a) => s + a.quantidade, 0);
    return `<tr><td>${cat.label}</td><td style="text-align:center;font-weight:700;color:var(--gold)">${total}</td></tr>`;
  }).join('');
}

async function ajustarAtividade(ev, categoria, dataStr, delta) {
  ev.preventDefault();
  ev.stopPropagation();
  const filtroCorretor = (a) => (isDemo() ? true : a.corretor_id === UID);
  const reg = db.atividades.find((a) => a.categoria === categoria && a.data === dataStr && filtroCorretor(a));
  const novo = Math.max(0, (reg ? reg.quantidade : 0) + delta);
  let error;
  if (reg) ({ error } = await sb.from('atividades').update({ quantidade: novo }).eq('id', reg.id));
  else if (novo > 0) ({ error } = await sb.from('atividades').insert({ corretor_id: isDemo() ? null : UID, categoria, data: dataStr, quantidade: novo }));
  if (error) return toast(error.message);

  // espelha em eventos, preservando o historico individual (Beefreedom)
  if (!isDemo()) {
    if (delta > 0) {
      await sb.from('eventos').insert({
        tipo: categoria,
        corretor_id: UID,
        created_at: new Date(dataStr + 'T12:00:00').toISOString(),
      });
    } else {
      const { data: ultimo } = await sb.from('eventos')
        .select('id')
        .eq('tipo', categoria)
        .eq('corretor_id', UID)
        .gte('created_at', dataStr + 'T00:00:00')
        .lte('created_at', dataStr + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(1);
      if (ultimo && ultimo[0]) await sb.from('eventos').delete().eq('id', ultimo[0].id);
    }
  }

  await carregarAtividades();
  renderAcomp();
}
// ============================ DETALHE DO LEAD (MODAL) ============================
function openLeadDetail(id) {
  const l = db.leads.find((x) => x.id === id); if (!l) return;
  const tags = renderTags(l.etiquetas) || '—';
  const gerentesOptions = db.corretores.filter((c) => c.role === 'gerente')
    .map((c) => `<option value="${c.id}">${esc(c.nome || c.email)}</option>`).join('');
  const html = `
    <h2 style="color:var(--gold);margin-top:0">${esc(l.nome)}</h2>
    <div class="row" style="margin-bottom:6px">
      <div><div class="muted" style="font-size:11px">Temperatura</div><span class="tag t-${l.temperatura}">${tempLabel(l.temperatura)}</span></div>
      <div><div class="muted" style="font-size:11px">Status</div>${esc(l.status || 'Novo')}</div>
    </div>
    <p><b>Telefone:</b> ${l.telefone ? `<a class="icon-btn wa" href="${waLink(l.telefone, l.nome)}" target="_blank">${esc(l.telefone)}</a> <button class="icon-btn wa" onclick="waLead('${l.id}');fecharModal()">WhatsApp</button>` : '—'}</p>
    <p><b>E-mail:</b> ${esc(l.email || '—')}</p>
    <p><b>Tipo / Nicho:</b> ${esc(l.tipo || '—')} / ${esc(l.nicho || '—')}</p>
    <p><b>Valor do imóvel:</b> ${money(l.valor_imovel)}</p>
    <p><b>Bairro:</b> ${esc(l.bairro || '—')}</p>
    <p><b>Agendamento:</b> ${l.agendamento ? esc(fmtDateTime(l.agendamento)) + (l.agendamento_obs ? ' — ' + esc(l.agendamento_obs) : '') : '—'}</p>
    <p><b>Etiquetas:</b> ${tags}</p>
    <p><b>Anotações:</b><br>${esc(l.anotacoes || '—').replace(/\n/g, '<br>')}</p>
    <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px">
      <p><b>Agendar Gerente</b></p>
      <div class="row">
        <label>Gerente<select id="ag-gerente-select">${gerentesOptions || '<option value="">— nenhum gerente cadastrado —</option>'}</select></label>
        <label>Data e hora<input id="ag-data-hora" type="datetime-local" /></label>
      </div>
      <div id="ag-horarios-ocupados" style="margin-top:6px"></div>
      <label>Observação<input id="ag-observacao" placeholder="ex: visita ao imóvel X" /></label>
      <button type="button" class="btn-gold" onclick="solicitarAgendaGerente('${l.id}')">Pedir acompanhamento</button>
    </div>
    <div class="actions" style="margin-top:14px">
      <button class="btn-gold" onclick="editarLead('${l.id}');fecharModal()">Editar</button>
      <button class="btn-ghost" onclick="fecharModal()">Fechar</button>
    </div>`;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');

  const selGerente = document.getElementById('ag-gerente-select');
  carregarHorariosOcupados(selGerente.value);
  selGerente.addEventListener('change', (e) => carregarHorariosOcupados(e.target.value));
}
async function carregarHorariosOcupados(gerenteId) {
  const wrap = document.getElementById('ag-horarios-ocupados');
  if (!wrap) return;
  if (!gerenteId) { wrap.innerHTML = ''; return; }
  const { data, error } = await sb.from('agenda_gerente')
    .select('data_hora')
    .eq('gerente_id', gerenteId)
    .in('status', ['pendente', 'aceito'])
    .order('data_hora', { ascending: true });
  if (error || !data || data.length === 0) {
    wrap.innerHTML = '<span class="muted" style="font-size:11px">Nenhum horário ocupado com esse gerente ainda.</span>';
    return;
  }
  wrap.innerHTML = '<span class="muted" style="font-size:11px">Horários já ocupados com esse gerente: ' +
    data.map((d) => esc(fmtDateTime(d.data_hora))).join(', ') + '</span>';
}
async function solicitarAgendaGerente(leadId) {
  const gerenteId = v('ag-gerente-select');
  const dataHora = v('ag-data-hora');
  if (!gerenteId) return toast('Escolha um gerente.');
  if (!dataHora) return toast('Escolha data e hora.');

  const { error } = await sb.from('agenda_gerente').insert({
    gerente_id: gerenteId,
    corretor_id: UID,
    lead_id: leadId,
    data_hora: new Date(dataHora).toISOString(),
    observacao: v('ag-observacao').trim() || null,
  });

  if (error) {
    if (error.code === '23505') return toast('Esse horário já está ocupado com esse gerente. Escolhe outro horário (veja os ocupados acima do campo de observação).');
    return toast(error.message);
  }
  toast('Pedido enviado ao gerente!');
  fecharModal();
}
function fecharModal() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });

// ============================ IMÓVEIS ============================
const imovelForm = document.getElementById('imovel-form');

function popularSelectCaptador() {
  const sel = document.getElementById('imovel-corretor-captador');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">— selecione —</option>' +
    db.corretores.map((c) => `<option value="${c.id}">${esc(c.nome || c.email)}</option>`).join('');
  if (atual) sel.value = atual;
}

function atualizarCamposImovel() {
  const permuta = v('imovel-permuta') === 'sim';
  document.getElementById('imovel-permuta-desc-wrap').style.display = permuta ? '' : 'none';

  const captacao = v('imovel-captacao-tipo');
  const precisaContato = captacao === 'construtora' || captacao === 'parceria';
  document.getElementById('imovel-captacao-contato-wrap').style.display = precisaContato ? '' : 'none';
  document.getElementById('imovel-captador-wrap').style.display = precisaContato ? 'none' : '';
}
document.getElementById('imovel-permuta').addEventListener('change', atualizarCamposImovel);
document.getElementById('imovel-captacao-tipo').addEventListener('change', atualizarCamposImovel);

document.getElementById('imovel-fotos').addEventListener('change', (e) => {
  const preview = document.getElementById('imovel-fotos-preview');
  preview.innerHTML = '';
  Array.from(e.target.files).forEach((file) => {
    const img = document.createElement('img');
    img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:6px';
    const reader = new FileReader();
    reader.onload = (ev) => { img.src = ev.target.result; };
    reader.readAsDataURL(file);
    preview.appendChild(img);
  });
});

imovelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSalvar = imovelForm.querySelector('button[type="submit"]');
  if (btnSalvar.disabled) return;
  const textoOriginal = btnSalvar.textContent;
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const id = v('imovel-id');

    // planta (opcional, um único arquivo)
    let plantaUrl = v('imovel-planta-url') || null;
    const plantaFile = document.getElementById('imovel-planta').files[0];
    if (plantaFile && !isDemo()) {
      const ext = (plantaFile.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `planta-${(id || 'novo')}-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('fotos').upload(path, plantaFile, { upsert: true });
      if (upErr) toast('Falha no upload da planta: ' + upErr.message);
      else { const { data } = sb.storage.from('fotos').getPublicUrl(path); plantaUrl = data.publicUrl; }
    }

    const permuta = v('imovel-permuta') === 'sim';
    const captacaoTipo = v('imovel-captacao-tipo');
    const precisaContato = captacaoTipo === 'construtora' || captacaoTipo === 'parceria';

    const payload = {
      titulo: v('imovel-titulo').trim(),
      tipo: v('imovel-tipo'),
      bairro: v('imovel-bairro').trim(),
      valor: Number(v('imovel-valor')) || 0,
      status: v('imovel-status'),
      descricao: v('imovel-descricao').trim(),
      planta_url: plantaUrl,
      permuta,
      permuta_descricao: permuta ? v('imovel-permuta-descricao').trim() : null,
      captacao_tipo: captacaoTipo,
      captacao_contato: precisaContato ? v('imovel-captacao-contato').trim() : null,
      corretor_captador_id: !precisaContato ? (v('imovel-corretor-captador') || null) : null,
    };

    let imovelId = id;
    if (id) {
      const { data: atualizado, error } = await sb.from('imoveis').update(payload).eq('id', id).select();
      if (error) { toast(error.message); return; }
      if (!atualizado || atualizado.length === 0) { toast('Você não tem permissão para editar este imóvel.'); return; }
    } else {
      const { data: novoImovel, error } = await sb.from('imoveis').insert(payload).select().single();
      if (error) { toast(error.message); return; }
      imovelId = novoImovel.id;
    }

    // envia cada foto selecionada como uma linha nova em imoveis_fotos
    const fotosFiles = document.getElementById('imovel-fotos').files;
    if (fotosFiles.length && !isDemo()) {
      const jaExistentes = db.imoveisFotos.filter((f) => f.imovel_id === imovelId).length;
      for (let i = 0; i < fotosFiles.length; i++) {
        const file = fotosFiles[i];
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `imovel-${imovelId}-${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await sb.storage.from('fotos').upload(path, file, { upsert: true });
        if (upErr) { toast('Falha no upload de uma foto: ' + upErr.message); continue; }
        const { data: pub } = sb.storage.from('fotos').getPublicUrl(path);
        await sb.from('imoveis_fotos').insert({ imovel_id: imovelId, foto_url: pub.publicUrl, ordem: jaExistentes + i });
      }
    }

    resetImovelForm();
    await Promise.all([carregarImoveis(), carregarImoveisFotos()]);
    renderImoveis();
    toast('Imóvel salvo com sucesso!');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = textoOriginal;
  }
});
document.getElementById('imovel-cancel').addEventListener('click', resetImovelForm);
document.getElementById('imovel-filtro').addEventListener('change', renderImoveis);
document.getElementById('imovel-filtro-busca').addEventListener('input', renderImoveis);
document.getElementById('imovel-filtro-captacao').addEventListener('change', renderImoveis);
document.getElementById('imovel-filtro-permuta').addEventListener('change', renderImoveis);

function resetImovelForm() {
  imovelForm.reset(); vset('imovel-id', '');
  vset('imovel-planta-url', '');
  document.getElementById('imovel-planta-preview').classList.add('hidden');
  document.getElementById('imovel-fotos-preview').innerHTML = '';
  document.getElementById('imovel-form-title').textContent = 'Novo Imóvel';
  document.getElementById('imovel-cancel').hidden = true;
  atualizarCamposImovel();
}
function editarImovel(id) {
  const i = db.imoveis.find((x) => x.id === id); if (!i) return;
  vset('imovel-id', i.id); vset('imovel-titulo', i.titulo); vset('imovel-tipo', i.tipo || 'Revenda');
  vset('imovel-bairro', i.bairro); vset('imovel-valor', i.valor || 0); vset('imovel-status', i.status || 'Disponível');
  vset('imovel-descricao', i.descricao || '');
  vset('imovel-permuta', i.permuta ? 'sim' : 'nao');
  vset('imovel-permuta-descricao', i.permuta_descricao || '');
  vset('imovel-captacao-tipo', i.captacao_tipo || 'exclusiva');
  vset('imovel-captacao-contato', i.captacao_contato || '');
  popularSelectCaptador();
  vset('imovel-corretor-captador', i.corretor_captador_id || '');
  vset('imovel-planta-url', i.planta_url || '');

  const plantaPrev = document.getElementById('imovel-planta-preview');
  if (i.planta_url) { plantaPrev.src = i.planta_url; plantaPrev.classList.remove('hidden'); } else plantaPrev.classList.add('hidden');

  renderFotosExistentes(id);
  atualizarCamposImovel();

  document.getElementById('imovel-form-title').textContent = 'Editar Imóvel';
  document.getElementById('imovel-cancel').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderFotosExistentes(imovelId) {
  const wrap = document.getElementById('imovel-fotos-preview');
  const fotos = db.imoveisFotos.filter((f) => f.imovel_id === imovelId).sort((a, b) => a.ordem - b.ordem);
  wrap.innerHTML = fotos.map((f) => `
    <div style="position:relative;display:inline-block">
      <img src="${esc(f.foto_url)}" style="width:70px;height:70px;object-fit:cover;border-radius:6px" alt="">
      <button type="button" onclick="excluirFotoImovel('${f.id}')" style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer">✕</button>
    </div>`).join('');
}
async function excluirFotoImovel(fotoId) {
  if (!confirm('Excluir esta foto?')) return;
  const { error } = await sb.from('imoveis_fotos').delete().eq('id', fotoId);
  if (error) return toast(error.message);
  await carregarImoveisFotos();
  const id = v('imovel-id');
  if (id) renderFotosExistentes(id);
  renderImoveis();
}
async function excluirImovel(id) {
  if (!confirm('Excluir este imóvel?')) return;
  const { data: excluido, error } = await sb.from('imoveis').delete().eq('id', id).select();
  if (error) return toast(error.message);
  if (!excluido || excluido.length === 0) { toast('Você não tem permissão para excluir este imóvel.'); return; }
  await carregarImoveis(); renderImoveis();
}
function renderImoveis() {
  const filtroTipo = v('imovel-filtro');
  const buscaTxt = (v('imovel-filtro-busca') || '').toLowerCase();
  const filtroCaptacao = v('imovel-filtro-captacao');
  const filtroPermuta = v('imovel-filtro-permuta');

  const f = db.imoveis.filter((i) => {
    if (filtroTipo && i.tipo !== filtroTipo) return false;
    if (filtroCaptacao && i.captacao_tipo !== filtroCaptacao) return false;
    if (filtroPermuta === 'sim' && !i.permuta) return false;
    if (filtroPermuta === 'nao' && i.permuta) return false;
    if (buscaTxt && !`${i.titulo} ${i.bairro}`.toLowerCase().includes(buscaTxt)) return false;
    return true;
  });

  const captacaoLabel = { exclusiva: 'Exclusiva', sem_exclusividade: 'Sem exclusividade', construtora: 'Construtora', parceria: 'Parceria' };

  document.querySelector('#imovel-tabela tbody').innerHTML = f.map((i) => {
    const capa = db.imoveisFotos.filter((fo) => fo.imovel_id === i.id).sort((a, b) => a.ordem - b.ordem)[0];
    const fotoUrl = capa ? capa.foto_url : i.foto_url;

    let contato = '—';
    if ((i.captacao_tipo === 'exclusiva' || i.captacao_tipo === 'sem_exclusividade') && i.corretor_captador_id) {
      const captador = db.corretores.find((c) => c.id === i.corretor_captador_id);
      contato = captador ? `Captado por ${captador.nome || captador.email}` : '—';
    } else if (i.captacao_contato) {
      contato = i.captacao_contato;
    }

    return `
    <tr>
      <td><span class="lead-link" onclick="openImovelDetail('${i.id}')">${esc(i.titulo)}</span></td><td>${esc(i.tipo)}</td><td>${esc(i.bairro)}</td>
      <td>${money(i.valor)}</td>
      <td>${fotoUrl ? `<img src="${esc(fotoUrl)}" class="foto-mini" alt="">` : '—'}</td>
      <td>${captacaoLabel[i.captacao_tipo] || '—'}${i.permuta ? ' · permuta' : ''}<div class="muted" style="font-size:11px">${esc(contato)}</div></td>
      <td>${esc(i.status)}</td>
      <td><div class="row-actions">
        <button class="icon-btn edit" onclick="editarImovel('${i.id}')">Editar</button>
        <button class="icon-btn del" onclick="excluirImovel('${i.id}')">Excluir</button>
      </div></td>
    </tr>`;
  }).join('');
  document.getElementById('imovel-vazio').style.display = f.length ? 'none' : 'block';
}

function openImovelDetail(id) {
  const i = db.imoveis.find((x) => x.id === id); if (!i) return;
  const fotos = db.imoveisFotos.filter((f) => f.imovel_id === id).sort((a, b) => a.ordem - b.ordem);
  const capaUrl = fotos[0] ? fotos[0].foto_url : i.foto_url;

  const galeria = fotos.length > 1
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${fotos.map((f) => `<img src="${esc(f.foto_url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px" alt="">`).join('')}</div>`
    : '';

  const captacaoLabel = { exclusiva: 'Exclusiva', sem_exclusividade: 'Sem exclusividade', construtora: 'Construtora', parceria: 'Parceria' };
  let contato = '—';
  if ((i.captacao_tipo === 'exclusiva' || i.captacao_tipo === 'sem_exclusividade') && i.corretor_captador_id) {
    const captador = db.corretores.find((c) => c.id === i.corretor_captador_id);
    contato = captador ? `Captado por ${captador.nome || captador.email}` : '—';
  } else if (i.captacao_contato) {
    contato = i.captacao_contato;
  }

  const html = `
    <h2 style="color:var(--gold);margin-top:0">${esc(i.titulo)}</h2>
    ${capaUrl ? `<img src="${esc(capaUrl)}" style="width:100%;max-height:280px;object-fit:cover;border-radius:8px" alt="">` : ''}
    ${galeria}
    <div class="row" style="margin-top:12px">
      <div><div class="muted" style="font-size:11px">Tipo</div>${esc(i.tipo || '—')}</div>
      <div><div class="muted" style="font-size:11px">Bairro</div>${esc(i.bairro || '—')}</div>
    </div>
    <div class="row">
      <div><div class="muted" style="font-size:11px">Valor</div>${money(i.valor)}</div>
      <div><div class="muted" style="font-size:11px">Status</div>${esc(i.status || '—')}</div>
    </div>
    <p><b>Captação:</b> ${captacaoLabel[i.captacao_tipo] || '—'}${contato !== '—' ? ' — ' + esc(contato) : ''}</p>
    ${i.permuta ? `<p><b>Aceita permuta:</b> ${esc(i.permuta_descricao || 'Sim')}</p>` : ''}
    ${i.planta_url ? `<p><b>Planta:</b><br><img src="${esc(i.planta_url)}" style="max-width:220px;border-radius:8px;margin-top:6px" alt="planta"></p>` : ''}
    <p><b>Descrição:</b><br>${esc(i.descricao || '—').replace(/\n/g, '<br>')}</p>
    <div class="actions" style="margin-top:14px">
      <button class="btn-gold" onclick="editarImovel('${i.id}');fecharModal()">Editar</button>
      <button class="btn-ghost" onclick="fecharModal()">Fechar</button>
    </div>`;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
}

// ============================ ROLETA DE LEADS ============================
function popularSelectRoletaCorretor() {
  const sel = document.getElementById('roleta-corretor');
  if (!sel) return;
  const corretores = db.corretores.filter((c) => c.role === 'corretor');
  sel.innerHTML = corretores.map((c) => {
    const foco = c.foco_nicho ? ` — foco: ${esc(c.foco_nicho)}` : '';
    return `<option value="${c.id}">${esc(c.nome || c.email)}${foco}</option>`;
  }).join('');
}

document.getElementById('roleta-origem').addEventListener('change', () => {
  document.getElementById('roleta-origem-desc-wrap').style.display = v('roleta-origem') === 'outros' ? '' : 'none';
});
document.getElementById('roleta-urgente').addEventListener('change', () => {
  document.getElementById('roleta-prazo-wrap').style.display = v('roleta-urgente') === 'sim' ? '' : 'none';
});

const roletaForm = document.getElementById('roleta-form');
roletaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = roletaForm.querySelector('button[type="submit"]');
  if (btn.disabled) return;
  const textoOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = 'Distribuindo...';

  try {
    const corretorId = v('roleta-corretor');
    if (!corretorId) { toast('Escolha um corretor.'); return; }

    const urgente = v('roleta-urgente') === 'sim';
    const idReatribuicao = v('roleta-id-reatribuicao');

    const dadosRoleta = {
      corretor_id: corretorId,
      urgente,
      prazo_atendimento: urgente ? new Date(Date.now() + Number(v('roleta-prazo-horas')) * 3600000).toISOString() : null,
      roleta_status: 'aguardando_atendimento',
    };

    if (idReatribuicao) {
      const { data, error } = await sb.from('leads').update(dadosRoleta).eq('id', idReatribuicao).select();
      if (error) { toast(error.message); return; }
      if (!data || data.length === 0) { toast('Você não tem permissão pra reatribuir este lead.'); return; }
    } else {
      const payload = {
        nome: v('roleta-nome').trim(),
        telefone: v('roleta-telefone').trim(),
        origem: v('roleta-origem'),
        origem_descricao: v('roleta-origem') === 'outros' ? v('roleta-origem-descricao').trim() : null,
        anotacoes: v('roleta-descricao').trim(),
        atribuido_por: UID,
        status: 'Novo',
        temperatura: 'morno',
        ...dadosRoleta,
      };
      const { data: novoLead, error } = await sb.from('leads').insert(payload).select().single();
      if (error) { toast(error.message); return; }
      await sb.from('eventos').insert({ tipo: 'lead_criado', corretor_id: UID, lead_id: novoLead.id });
    }

    roletaForm.reset();
    vset('roleta-id-reatribuicao', '');
    document.getElementById('roleta-origem-desc-wrap').style.display = 'none';
    document.getElementById('roleta-prazo-wrap').style.display = 'none';
    await carregarLeads();
    renderRoleta();
    toast('Lead distribuído!');
  } finally {
    btn.disabled = false; btn.textContent = textoOriginal;
  }
});

function renderRoleta() {
  const fila = db.leads.filter((l) => l.roleta_status === 'aguardando_atendimento' || l.roleta_status === 'expirado');
  document.querySelector('#roleta-tabela tbody').innerHTML = fila.map((l) => {
    const corretor = db.corretores.find((c) => c.id === l.corretor_id);
    const statusLabel = l.roleta_status === 'expirado' ? '⏰ Expirado, aguardando reatribuição' : 'Aguardando atendimento';
    const prazo = l.prazo_atendimento ? fmtDateTime(l.prazo_atendimento) : '—';
    return `<tr>
      <td>${esc(l.nome)}</td>
      <td>${l.roleta_status === 'expirado' ? '—' : esc(corretor ? (corretor.nome || corretor.email) : '—')}</td>
      <td>${statusLabel}</td>
      <td>${esc(prazo)}</td>
      <td>${l.roleta_status === 'expirado' ? `<button class="icon-btn edit" onclick="reatribuirLead('${l.id}')">Reatribuir</button>` : ''}</td>
    </tr>`;
  }).join('');
  document.getElementById('roleta-vazio').style.display = fila.length ? 'none' : 'block';
}

function reatribuirLead(id) {
  const l = db.leads.find((x) => x.id === id); if (!l) return;
  vset('roleta-nome', l.nome);
  vset('roleta-telefone', l.telefone || '');
  vset('roleta-origem', l.origem || 'lista_oportunidades');
  vset('roleta-origem-descricao', l.origem_descricao || '');
  document.getElementById('roleta-origem-desc-wrap').style.display = l.origem === 'outros' ? '' : 'none';
  vset('roleta-urgente', l.urgente ? 'sim' : 'nao');
  document.getElementById('roleta-prazo-wrap').style.display = l.urgente ? '' : 'none';
  popularSelectRoletaCorretor();
  vset('roleta-id-reatribuicao', id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('Ajuste e clique em Distribuir lead pra reatribuir.');
}

// ============================ AGENDA DO GERENTE ============================
async function carregarAgendaGerente() {
  const { data, error } = await sb.from('agenda_gerente').select('*').order('data_hora', { ascending: true });
  if (error) { toast(error.message); return; }
  db.agendaGerente = data || [];
}

function renderAgendaGerente() {
  const meus = (ME && ME.role === 'diretoria') ? db.agendaGerente : db.agendaGerente.filter((a) => a.gerente_id === UID);
  const pendentes = meus.filter((a) => a.status === 'pendente');
  const confirmados = meus.filter((a) => a.status === 'aceito');

  document.querySelector('#ag-pendentes-tabela tbody').innerHTML = pendentes.map((a) => {
    const corretor = db.corretores.find((c) => c.id === a.corretor_id);
    return `<tr>
      <td>${esc(corretor ? (corretor.nome || corretor.email) : '—')}</td>
      <td>${esc(fmtDateTime(a.data_hora))}</td>
      <td>${esc(a.observacao || '—')}</td>
      <td><div class="row-actions">
        <button class="icon-btn edit" onclick="responderAgendaGerente('${a.id}','aceito')">Aceitar</button>
        <button class="icon-btn del" onclick="responderAgendaGerente('${a.id}','recusado')">Recusar</button>
      </div></td>
    </tr>`;
  }).join('');
  document.getElementById('ag-pendentes-vazio').style.display = pendentes.length ? 'none' : 'block';

  document.querySelector('#ag-confirmados-tabela tbody').innerHTML = confirmados.map((a) => {
    const corretor = db.corretores.find((c) => c.id === a.corretor_id);
    return `<tr>
      <td>${esc(corretor ? (corretor.nome || corretor.email) : '—')}</td>
      <td>${esc(fmtDateTime(a.data_hora))}</td>
      <td>${esc(a.observacao || '—')}</td>
      <td><button class="icon-btn del" onclick="responderAgendaGerente('${a.id}','cancelado')">Cancelar</button></td>
    </tr>`;
  }).join('');
  document.getElementById('ag-confirmados-vazio').style.display = confirmados.length ? 'none' : 'block';
}

async function responderAgendaGerente(id, novoStatus) {
  const { error } = await sb.from('agenda_gerente').update({ status: novoStatus }).eq('id', id);
  if (error) return toast(error.message);
  await carregarAgendaGerente();
  renderAgendaGerente();
  toast(novoStatus === 'aceito' ? 'Aceito!' : novoStatus === 'cancelado' ? 'Compromisso cancelado.' : 'Recusado.');
}

// ---------------- Exportar CSV ----------------
function exportCSV(rows, cols, filename) {
  const head = cols.map((c) => c.label).join(',');
  const body = rows.map((r) => cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportarLeads() {
  const cols = [
    { key: 'nome', label: 'Nome' }, { key: 'telefone', label: 'Telefone' }, { key: 'email', label: 'Email' },
    { key: 'tipo', label: 'Tipo' }, { key: 'nicho', label: 'Nicho' }, { key: 'temperatura', label: 'Temperatura' },
    { key: 'valor_imovel', label: 'Valor' }, { key: 'status', label: 'Status' }, { key: 'bairro', label: 'Bairro' },
    { key: 'etiquetas', label: 'Etiquetas' },
  ];
  exportCSV(db.leads, cols, 'leads-kyro.csv');
  toast('Leads exportados.');
}
function exportarImoveis() {
  const cols = [
    { key: 'titulo', label: 'Título' }, { key: 'tipo', label: 'Tipo' }, { key: 'bairro', label: 'Bairro' },
    { key: 'valor', label: 'Valor' }, { key: 'status', label: 'Status' },
  ];
  exportCSV(db.imoveis, cols, 'imoveis-kyro.csv');
  toast('Imóveis exportados.');
}
document.getElementById('export-leads').addEventListener('click', exportarLeads);
document.getElementById('export-imoveis').addEventListener('click', exportarImoveis);

// ============================ CORRETORES (GERENTE) ============================
document.getElementById('novo-acesso-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('novo-acesso-msg');
  msg.textContent = ''; msg.style.color = 'var(--muted)';
  const nome = v('na-nome').trim();
  const perfil = v('na-perfil');
  const email = v('na-email').trim();
  const senha = v('na-senha');
  if (senha.length < 6) { msg.textContent = 'A senha precisa ter ao menos 6 caracteres.'; msg.style.color = 'var(--red)'; return; }

  const { data, error } = await sbAdmin.auth.signUp({ email, password: senha });
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = 'var(--red)'; return; }
  if (!data || !data.user) { msg.textContent = 'Não foi possível criar o acesso.'; msg.style.color = 'var(--red)'; return; }

  // a trigger já criou o profile com role 'corretor' — atualiza pro perfil e nome escolhidos
  const { error: perfilErr } = await sb.from('profiles').update({ role: perfil, nome }).eq('id', data.user.id);
  if (perfilErr) { msg.textContent = 'Conta criada, mas não salvei o perfil: ' + perfilErr.message; msg.style.color = 'var(--red)'; return; }

  msg.innerHTML = `✅ Acesso criado! Envie pro corretor: <b>${esc(email)}</b> / senha <b>${esc(senha)}</b>`;
  msg.style.color = 'var(--gold)';
  document.getElementById('novo-acesso-form').reset();
  await carregarCorretores(); renderCorretores();
});

document.getElementById('copiar-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.origin); toast('Link da equipe copiado!'); }
  catch { toast(location.origin); }
});
function renderCorretores() {
  document.querySelector('#corretor-tabela tbody').innerHTML = db.corretores.map((c) => `
    <tr>
      <td>${esc(c.nome || c.email)}</td>
      <td>${esc(c.email || '')}</td>
      <td><select id="role-${c.id}">
        ${['corretor', 'gerente', 'secretaria', 'diretoria'].map((r) => `<option value="${r}" ${r === c.role ? 'selected' : ''}>${r}</option>`).join('')}
      </select></td>
      <td><input id="eq-${c.id}" value="${esc(c.equipe || '')}" placeholder="Equipe A" /></td>
      <td><button class="icon-btn edit" onclick="salvarCorretor('${c.id}')">Salvar</button></td>
    </tr>`).join('');
}
async function salvarCorretor(id) {
  const role = v(`role-${id}`);
  const equipe = v(`eq-${id}`);
  const { error } = await sb.from('profiles').update({ role, equipe }).eq('id', id);
  if (error) return toast(error.message);
  toast('Corretor atualizado.');
  await carregarCorretores(); renderCorretores();
}

// ============================ FUNIL (DASHBOARD) ============================
function bar(label, val, total) {
  const pct = total ? Math.round((val / total) * 100) : 0;
  return `<div class="bar"><span class="label">${esc(label)}</span><span class="track"><span class="fill" style="width:${pct}%"></span></span><span class="val">${val}</span></div>`;
}
function renderFunil() {
  const L = db.leads; const total = L.length;
  const statusOrder = ['Novo', 'Contatado', 'Qualificando', 'Proposta', 'Fechado', 'Perdido'];
  const tempOrder = [['quente', '🔥 Quente'], ['morno', 'Morno'], ['frio', '🧊 Frio']];
  let html = `<h2>Funil de status</h2>` + statusOrder.map((s) => bar(s, L.filter((l) => l.status === s).length, total)).join('');
  html += `<h2 style="margin-top:16px">Temperatura dos leads</h2>` + tempOrder.map(([k, lab]) => bar(lab, L.filter((l) => l.temperatura === k).length, total)).join('');
  document.getElementById('funil-card').innerHTML = html;
}

// ============================ DASHBOARD ============================
function renderDashboard() {
  const L = db.leads;
  const quente = L.filter((l) => l.temperatura === 'quente').length;
  const morno = L.filter((l) => l.temperatura === 'morno').length;
  const frio = L.filter((l) => l.temperatura === 'frio').length;
  const agPendentes = L.filter((l) => l.agendamento && new Date(l.agendamento) <= new Date()).length;
  const vendas = L.filter((l) => l.status === 'Fechado').length;
  const imoveisDisp = db.imoveis.filter((i) => i.status === 'Disponível').length;

  const cards = [
    { num: L.length, lbl: 'Total de leads' },
    { num: quente, lbl: '🔥 Quentes' },
    { num: morno, lbl: 'Mornos' },
    { num: frio, lbl: '🧊 Frios' },
    { num: db.atividades.filter((a) => a.categoria === 'ligacao').reduce((s, a) => s + a.quantidade, 0), lbl: 'Ligações registradas' },
    { num: agPendentes, lbl: 'Agendamentos pendentes' },
    { num: vendas, lbl: 'Vendas fechadas' },
    { num: imoveisDisp, lbl: 'Imóveis disponíveis' },
  ];
  document.getElementById('stats').innerHTML = cards.map((c) => `<div class="stat"><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('');

  // desempenho por corretor
  const porCorretor = db.corretores.map((c) => {
    const meus = L.filter((l) => l.corretor_id === c.id);
    return {
      nome: c.nome || c.email,
      leads: meus.length,
      ligacoes: db.atividades.filter((a) => a.categoria === 'ligacao' && a.corretor_id === c.id).reduce((s, a) => s + a.quantidade, 0),
      agendamentos: meus.filter((l) => l.agendamento).length,
      vendas: meus.filter((l) => l.status === 'Fechado').length,
    };
  });
  document.querySelector('#dash-corretores tbody').innerHTML = porCorretor.map((c) => `
    <tr><td>${esc(c.nome)}</td><td>${c.leads}</td><td>${c.ligacoes}</td><td>${c.agendamentos}</td><td style="color:var(--gold);font-weight:700">${c.vendas}</td></tr>`).join('');
  renderFunil();
}

// ---------------- Utilitários ----------------
function v(id) { return document.getElementById(id).value; }
function vset(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function esc(t) { return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR'); }

// cores fixas pra etiqueta: a mesma palavra sempre cai na mesma cor
const TAG_CORES = ['#d4a017', '#4a90d9', '#5cb85c', '#d9534f', '#9b59b6', '#e67e22', '#1abc9c', '#e91e63'];
function corDaTag(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_CORES[Math.abs(hash) % TAG_CORES.length];
}
function renderTags(etiquetas) {
  return (etiquetas || '').split(',').map((t) => t.trim()).filter(Boolean)
    .map((t) => `<span class="chip" style="background:${corDaTag(t)}22;border:1px solid ${corDaTag(t)};color:${corDaTag(t)}">${esc(t)}</span>`)
    .join(' ');
}
function tempLabel(t) { return t === 'quente' ? '🔥 Quente' : t === 'frio' ? '🧊 Frio' : 'Morno'; }
function fmtDateTime(iso) { return new Date(iso).toLocaleString('pt-BR'); }
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function getWeekDays() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0=seg
  const seg = new Date(now); seg.setDate(now.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return d; });
}
function waLink(tel, nome) {
  if (!tel) return '#';
  let d = String(tel).replace(/\D/g, '');
  if (!d.startsWith('55')) d = '55' + d;
  const msg = encodeURIComponent(`Olá ${nome || ''}, tudo bem? Somos da Kyro Imobiliária.`);
  return `https://wa.me/${d}?text=${msg}`;
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  t.style.zIndex = '99999';
  t.style.position = 'fixed';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------------- Notificações do navegador ----------------
function pedirNotificacoes() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

init();
