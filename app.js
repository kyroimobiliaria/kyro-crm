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
const db = { leads: [], imoveis: [], atividades: [], corretores: [] };

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
  corretores: ['gerente', 'diretoria'],
  dashboard:  ['gerente', 'diretoria', 'secretaria'],
};
const NAV_LABEL = { leads: 'Leads', agenda: 'Agenda', acomp: 'Acomp. Ligações', imoveis: 'Imóveis', corretores: 'Corretores', dashboard: 'Dashboard' };

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
  if (name === 'leads') { await carregarLeads(); renderLeads(); }
  else if (name === 'agenda') { await carregarLeads(); renderAgenda(); }
  else if (name === 'acomp') { await carregarAtividades(); renderAcomp(); }
  else if (name === 'imoveis') { await carregarImoveis(); renderImoveis(); }
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

// ============================ ACOMP (PRODUTIVIDADE DIÁRIA) ============================
function renderAcomp() {
  const dias = getWeekDays();
  document.querySelector('#acomp-tabela tbody').innerHTML = ATIV_CATS.map((cat) => {
    let total = 0;
    const cels = dias.map((d) => {
      const ds = ymd(d);
      const reg = db.atividades.find((a) => a.categoria === cat.key && a.data === ds);
      const qtd = reg ? reg.quantidade : 0;
      total += qtd;
      return `<td style="text-align:center">
        <div class="sqn ${qtd ? 'tem' : ''}"
             onclick="ajustarAtividade(event,'${cat.key}','${ds}',1)"
             oncontextmenu="ajustarAtividade(event,'${cat.key}','${ds}',-1)">${qtd}</div>
      </td>`;
    }).join('');
    return `<tr><td>${cat.label}</td>${cels}<td style="text-align:center;font-weight:700;color:var(--gold)">${total}</td></tr>`;
  }).join('');
  renderFunilSemana(dias);
}

async function ajustarAtividade(ev, categoria, dataStr, delta) {
  ev.preventDefault();
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
  const tags = (l.etiquetas || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join(' ') || '—';
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
    <div class="actions" style="margin-top:14px">
      <button class="btn-gold" onclick="editarLead('${l.id}');fecharModal()">Editar</button>
      <button class="btn-ghost" onclick="fecharModal()">Fechar</button>
    </div>`;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
}
function fecharModal() { document.getElementById('modal').classList.add('hidden'); }
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });

// ============================ IMÓVEIS ============================
const imovelForm = document.getElementById('imovel-form');
imovelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = v('imovel-id');
  let fotoUrl = v('imovel-foto-url') || null;
  const file = document.getElementById('imovel-foto').files[0];
  if (file && !isDemo()) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${(id || UID || 'novo')}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('fotos').upload(path, file, { upsert: true });
    if (upErr) toast('Falha no upload da foto: ' + upErr.message);
    else { const { data } = sb.storage.from('fotos').getPublicUrl(path); fotoUrl = data.publicUrl; }
  }
  const payload = {
    titulo: v('imovel-titulo').trim(),
    tipo: v('imovel-tipo'),
    bairro: v('imovel-bairro').trim(),
    valor: Number(v('imovel-valor')) || 0,
    status: v('imovel-status'),
    foto_url: fotoUrl,
  };
  if (id) { const { error } = await sb.from('imoveis').update(payload).eq('id', id); if (error) return toast(error.message); }
  else { const { error } = await sb.from('imoveis').insert(payload); if (error) return toast(error.message); }
  resetImovelForm(); await carregarImoveis(); renderImoveis();
});
document.getElementById('imovel-cancel').addEventListener('click', resetImovelForm);
document.getElementById('imovel-filtro').addEventListener('change', renderImoveis);

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
function resetImovelForm() {
  imovelForm.reset(); vset('imovel-id', '');
  vset('imovel-foto-url', '');
  document.getElementById('imovel-foto-preview').classList.add('hidden');
  document.getElementById('imovel-form-title').textContent = 'Novo Imóvel';
  document.getElementById('imovel-cancel').hidden = true;
}
function editarImovel(id) {
  const i = db.imoveis.find((x) => x.id === id); if (!i) return;
  vset('imovel-id', i.id); vset('imovel-titulo', i.titulo); vset('imovel-tipo', i.tipo || 'Revenda');
  vset('imovel-bairro', i.bairro); vset('imovel-valor', i.valor || 0); vset('imovel-status', i.status || 'Disponível');
  vset('imovel-foto-url', i.foto_url || '');
  const prev = document.getElementById('imovel-foto-preview');
  if (i.foto_url) { prev.src = i.foto_url; prev.classList.remove('hidden'); } else prev.classList.add('hidden');
  document.getElementById('imovel-form-title').textContent = 'Editar Imóvel';
  document.getElementById('imovel-cancel').hidden = false;
}
async function excluirImovel(id) {
  if (!confirm('Excluir este imóvel?')) return;
  const { error } = await sb.from('imoveis').delete().eq('id', id);
  if (error) return toast(error.message);
  await carregarImoveis(); renderImoveis();
}
function renderImoveis() {
  const filtro = v('imovel-filtro');
  const f = db.imoveis.filter((i) => !filtro || i.tipo === filtro);
  document.querySelector('#imovel-tabela tbody').innerHTML = f.map((i) => `
    <tr>
      <td>${esc(i.titulo)}</td><td>${esc(i.tipo)}</td><td>${esc(i.bairro)}</td>
      <td>${money(i.valor)}</td>
      <td>${i.foto_url ? `<img src="${esc(i.foto_url)}" class="foto-mini" alt="">` : '—'}</td>
      <td>${esc(i.status)}</td>
      <td><div class="row-actions">
        <button class="icon-btn edit" onclick="editarImovel('${i.id}')">Editar</button>
        <button class="icon-btn del" onclick="excluirImovel('${i.id}')">Excluir</button>
      </div></td>
    </tr>`).join('');
  document.getElementById('imovel-vazio').style.display = f.length ? 'none' : 'block';
}

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
