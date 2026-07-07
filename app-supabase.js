/* =========================================================================
   CRM Imobiliário — lógica com Supabase (dados reais, compartilhados)
   -------------------------------------------------------------------------
   Diferente da versão localStorage, aqui os dados ficam num BANCO DE DADOS
   na nuvem (Postgres/Supabase). Vários corretores logados veem os mesmos
   leads e imóveis. O navegador só envia/recebe dados via supabase.from().
   ========================================================================= */

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// Cache em memória (apenas para busca/dashboard no cliente)
const db = { leads: [], imoveis: [] };

const authEl = document.getElementById('auth');
const appEl = document.getElementById('app');

// ---------------- Autenticação ----------------
async function init() {
  if (CONFIG.DEMO_MODE) {
    authEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    await carregarTudo();
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) entrarApp(data.session.user);
  else mostrarLogin();

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) entrarApp(session.user);
    else mostrarLogin();
  });
}

function mostrarLogin() {
  appEl.classList.add('hidden');
  authEl.classList.remove('hidden');
  document.getElementById('auth-msg').textContent = '';
}

function entrarApp(user) {
  authEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  document.getElementById('user-email').textContent = user.email || '';
  carregarTudo();
}

function authMsg(text, cor) {
  const el = document.getElementById('auth-msg');
  el.textContent = text;
  el.style.color = cor || 'var(--muted)';
}

document.getElementById('auth-entrar').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const senha = document.getElementById('auth-senha').value;
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) authMsg(error.message, 'var(--red)');
});

document.getElementById('auth-cadastrar').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const senha = document.getElementById('auth-senha').value;
  if (senha.length < 6) return authMsg('A senha precisa ter ao menos 6 caracteres.', 'var(--red)');
  const { error } = await sb.auth.signUp({ email, password: senha });
  if (error) authMsg(error.message, 'var(--red)');
  else authMsg('Conta criada! Se pediu confirmação, veja seu e-mail e clique em "Entrar".', 'var(--green)');
});

document.getElementById('logout').addEventListener('click', () => sb.auth.signOut());

// ---------------- Carregamento ----------------
async function carregarTudo() {
  await Promise.all([carregarLeads(), carregarImoveis()]);
}

async function carregarLeads() {
  const { data, error } = await sb.from('leads').select('*').order('criado_em', { ascending: false });
  if (error) return alert('Erro ao carregar leads: ' + error.message);
  db.leads = data || [];
  renderLeads();
}

async function carregarImoveis() {
  const { data, error } = await sb.from('imoveis').select('*').order('criado_em', { ascending: false });
  if (error) return alert('Erro ao carregar imóveis: ' + error.message);
  db.imoveis = data || [];
  renderImoveis();
}

// ---------------- Abas ----------------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') renderDashboard();
  });
});

// ============================ LEADS ============================
const leadForm = document.getElementById('lead-form');
const leadTbody = document.querySelector('#lead-tabela tbody');

leadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('lead-id').value;
  const payload = {
    nome: document.getElementById('lead-nome').value.trim(),
    telefone: document.getElementById('lead-telefone').value.trim(),
    email: document.getElementById('lead-email').value.trim(),
    tipo: document.getElementById('lead-tipo').value,
    interesse: document.getElementById('lead-interesse').value.trim(),
    bairro: document.getElementById('lead-bairro').value.trim(),
    status: document.getElementById('lead-status').value,
    obs: document.getElementById('lead-obs').value.trim(),
  };
  let error;
  if (id) ({ error } = await sb.from('leads').update(payload).eq('id', id));
  else ({ error } = await sb.from('leads').insert(payload));

  if (error) return alert('Erro ao salvar: ' + error.message);
  resetLeadForm();
  await carregarLeads();
});

document.getElementById('lead-cancel').addEventListener('click', resetLeadForm);
document.getElementById('lead-busca').addEventListener('input', renderLeads);

function resetLeadForm() {
  leadForm.reset();
  document.getElementById('lead-id').value = '';
  document.getElementById('lead-form-title').textContent = 'Novo Lead';
  document.getElementById('lead-cancel').hidden = true;
}

function editarLead(id) {
  const l = db.leads.find((x) => x.id === id);
  if (!l) return;
  document.getElementById('lead-id').value = l.id;
  document.getElementById('lead-nome').value = l.nome;
  document.getElementById('lead-telefone').value = l.telefone;
  document.getElementById('lead-email').value = l.email || '';
  document.getElementById('lead-tipo').value = l.tipo;
  document.getElementById('lead-interesse').value = l.interesse || '';
  document.getElementById('lead-bairro').value = l.bairro || '';
  document.getElementById('lead-status').value = l.status;
  document.getElementById('lead-obs').value = l.obs || '';
  document.getElementById('lead-form-title').textContent = 'Editar Lead';
  document.getElementById('lead-cancel').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluirLead(id) {
  if (!confirm('Excluir este lead?')) return;
  const { error } = await sb.from('leads').delete().eq('id', id);
  if (error) return alert('Erro ao excluir: ' + error.message);
  await carregarLeads();
}

function renderLeads() {
  const termo = document.getElementById('lead-busca').value.toLowerCase();
  const filtrados = db.leads.filter((l) =>
    [l.nome, l.telefone, l.bairro, l.interesse].join(' ').toLowerCase().includes(termo)
  );
  leadTbody.innerHTML = filtrados.map((l) => `
    <tr>
      <td>${esc(l.nome)}</td>
      <td>${esc(l.telefone)}</td>
      <td>${esc(l.tipo)}</td>
      <td>${esc(l.interesse)}</td>
      <td><span class="tag ${slug(l.status)}">${esc(l.status)}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn edit" onclick="editarLead('${l.id}')">Editar</button>
        <button class="icon-btn del" onclick="excluirLead('${l.id}')">Excluir</button>
      </div></td>
    </tr>`).join('');
  document.getElementById('lead-vazio').style.display = filtrados.length ? 'none' : 'block';
}

// ============================ IMÓVEIS ============================
const imovelForm = document.getElementById('imovel-form');
const imovelTbody = document.querySelector('#imovel-tabela tbody');

imovelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('imovel-id').value;
  const payload = {
    titulo: document.getElementById('imovel-titulo').value.trim(),
    tipo: document.getElementById('imovel-tipo').value,
    bairro: document.getElementById('imovel-bairro').value.trim(),
    valor: Number(document.getElementById('imovel-valor').value) || 0,
    status: document.getElementById('imovel-status').value,
  };
  let error;
  if (id) ({ error } = await sb.from('imoveis').update(payload).eq('id', id));
  else ({ error } = await sb.from('imoveis').insert(payload));

  if (error) return alert('Erro ao salvar: ' + error.message);
  resetImovelForm();
  await carregarImoveis();
});

document.getElementById('imovel-cancel').addEventListener('click', resetImovelForm);
document.getElementById('imovel-busca').addEventListener('input', renderImoveis);

function resetImovelForm() {
  imovelForm.reset();
  document.getElementById('imovel-id').value = '';
  document.getElementById('imovel-form-title').textContent = 'Novo Imóvel';
  document.getElementById('imovel-cancel').hidden = true;
}

function editarImovel(id) {
  const i = db.imoveis.find((x) => x.id === id);
  if (!i) return;
  document.getElementById('imovel-id').value = i.id;
  document.getElementById('imovel-titulo').value = i.titulo;
  document.getElementById('imovel-tipo').value = i.tipo;
  document.getElementById('imovel-bairro').value = i.bairro;
  document.getElementById('imovel-valor').value = i.valor;
  document.getElementById('imovel-status').value = i.status;
  document.getElementById('imovel-form-title').textContent = 'Editar Imóvel';
  document.getElementById('imovel-cancel').hidden = false;
}

async function excluirImovel(id) {
  if (!confirm('Excluir este imóvel?')) return;
  const { error } = await sb.from('imoveis').delete().eq('id', id);
  if (error) return alert('Erro ao excluir: ' + error.message);
  await carregarImoveis();
}

function renderImoveis() {
  const termo = document.getElementById('imovel-busca').value.toLowerCase();
  const filtrados = db.imoveis.filter((i) =>
    [i.titulo, i.bairro, i.tipo].join(' ').toLowerCase().includes(termo)
  );
  imovelTbody.innerHTML = filtrados.map((i) => `
    <tr>
      <td>${esc(i.titulo)}</td>
      <td>${esc(i.tipo)}</td>
      <td>${esc(i.bairro)}</td>
      <td>${i.valor ? 'R$ ' + Number(i.valor).toLocaleString('pt-BR') : '—'}</td>
      <td><span class="tag ${slug(i.status)}">${esc(i.status)}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn edit" onclick="editarImovel('${i.id}')">Editar</button>
        <button class="icon-btn del" onclick="excluirImovel('${i.id}')">Excluir</button>
      </div></td>
    </tr>`).join('');
  document.getElementById('imovel-vazio').style.display = filtrados.length ? 'none' : 'block';
}

// ============================ DASHBOARD ============================
function renderDashboard() {
  const totalLeads = db.leads.length;
  const novos = db.leads.filter((l) => l.status === 'Novo').length;
  const negociacao = db.leads.filter((l) => l.status === 'Em negociação').length;
  const fechados = db.leads.filter((l) => l.status === 'Fechado').length;
  const totalImoveis = db.imoveis.length;
  const disponiveis = db.imoveis.filter((i) => i.status === 'Disponível').length;
  const valorTotal = db.imoveis.reduce((s, i) => s + (Number(i.valor) || 0), 0);

  const cards = [
    { num: totalLeads, lbl: 'Total de leads' },
    { num: novos, lbl: 'Leads novos' },
    { num: negociacao, lbl: 'Em negociação' },
    { num: fechados, lbl: 'Fechados' },
    { num: totalImoveis, lbl: 'Imóveis cadastrados' },
    { num: disponiveis, lbl: 'Imóveis disponíveis' },
    { num: 'R$ ' + valorTotal.toLocaleString('pt-BR'), lbl: 'Valor em carteira' },
  ];
  document.getElementById('stats').innerHTML = cards
    .map((c) => `<div class="stat"><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`)
    .join('');
}

// ---------- Utilitários ----------
function slug(t) {
  return String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- Início ----------
init();
