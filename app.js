import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const EMPLOYEES_COL = 'employees';
const PAGE_SIZE = 50;
let unsubscribeSnapshot = null;

const ICONS = {
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C8B87" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C8B87" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E6E8E" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E62" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B6B67" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  userx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4432E" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M18 8l4 4M22 8l-4 4"/></svg>',
  usercheck: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E62" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M17 11l2 2 4-4"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A9793" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16211F" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4432E" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  upload: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
};

const STATUS_META = {
  vencido:   { label: 'Vencido',                 color: 'var(--c-vencido)',   bg: 'var(--c-vencido-bg)' },
  vence30:   { label: 'Vence em 30 dias',         color: 'var(--c-vence30)',   bg: 'var(--c-vence30-bg)' },
  vence90:   { label: 'Vence em 90 dias',         color: 'var(--c-vence90)',   bg: 'var(--c-vence90-bg)' },
  em_dia:    { label: 'Em dia',                   color: 'var(--c-emdia)',     bg: 'var(--c-emdia-bg)' },
  agendado:  { label: 'Agendado',                 color: 'var(--c-agendado)',  bg: 'var(--c-agendado-bg)' },
  sem_exame: { label: 'Sem exame',                color: 'var(--c-semexame)',  bg: 'var(--c-semexame-bg)' },
  inativo:   { label: 'Inativo',                  color: 'var(--c-inativo)',   bg: 'var(--c-inativo-bg)' },
};

let state = { employees: [], busca: '', departamento: 'Todos', status: 'Todos', page: 1, isManager: false, managerSetor: null };
const today = new Date(); today.setHours(0,0,0,0);

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}
function fmt(dateStr) {
  if (!dateStr) return '—';
  const d = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : dateStr;
  return d.toLocaleDateString('pt-BR');
}
function daysBetween(a, b) { return Math.round((a - b) / 86400000); }

// ---- Importação de planilhas (novos colaboradores / desligamentos) ----
const FIELD_MAP = {
  nome: 'nome', name: 'nome', colaborador: 'nome',
  matricula: 'matricula', re: 'matricula', registro: 'matricula', matriculare: 'matricula',
  cargo: 'cargo', funcao: 'cargo', função: 'cargo',
  departamento: 'departamento', depto: 'departamento',
  setor: 'setor', area: 'setor',
  ultimadata: 'ultimaData', data: 'ultimaData', dataultimarealizacao: 'ultimaData',
  ultimarealizacao: 'ultimaData', dataexame: 'ultimaData', dataultima: 'ultimaData',
  periodicidade: 'periodicidade', meses: 'periodicidade', periodicidademeses: 'periodicidade',
};
function normalizeKey(k) {
  return (k ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function parseDateFlexible(val) {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date) {
    const y = val.getFullYear(), m = String(val.getMonth() + 1).padStart(2, '0'), d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = val.toString().trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) { const [, yy, mm, dd] = m; return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`; }
  return '';
}
function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    if (!window.XLSX) { reject(new Error('Biblioteca de planilha não carregou. Recarregue a página e tente de novo.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!rows.length) { resolve([]); return; }
        const headers = rows[0].map(normalizeKey);
        const objs = rows.slice(1)
          .filter(r => r.some(c => c !== '' && c !== null && c !== undefined))
          .map(r => {
            const obj = {};
            headers.forEach((h, i) => { const field = FIELD_MAP[h]; if (field) obj[field] = r[i]; });
            return obj;
          });
        resolve(objs);
      } catch (err) { reject(new Error('Não consegui ler esse arquivo. Confira se é .xlsx, .xls ou .csv.')); }
    };
    reader.readAsArrayBuffer(file);
  });
}
function buildNewEmployeesFromRows(rows) {
  const valid = [], errors = [];
  rows.forEach((r, i) => {
    const nome = (r.nome || '').toString().trim();
    const ultimaData = parseDateFlexible(r.ultimaData);
    if (!nome || !ultimaData) { errors.push(nome || `linha ${i + 2}`); return; }
    const matricula = (r.matricula || '').toString().trim();
    valid.push({
      id: matricula ? 'mat_' + matricula.replace(/[^\w-]/g, '') : 'novo_' + Date.now() + '_' + i,
      nome, matricula,
      cargo: (r.cargo || '').toString().trim(),
      departamento: (r.departamento || '').toString().trim(),
      setor: (r.setor || '').toString().trim(),
      ultimaData,
      periodicidade: Number(r.periodicidade) || 12,
      dataAgendada: '', ativo: true,
    });
  });
  return { valid, errors };
}
function buildDismissalsFromRows(rows, employees) {
  const byMatricula = new Map(), byNome = new Map();
  employees.forEach(f => {
    if (f.matricula) byMatricula.set(f.matricula.toString().trim(), f);
    if (f.nome) byNome.set(f.nome.toString().trim().toLowerCase(), f);
  });
  const matched = [], notFound = [];
  rows.forEach(r => {
    const matricula = (r.matricula || '').toString().trim();
    const nome = (r.nome || '').toString().trim();
    let f = matricula ? byMatricula.get(matricula) : null;
    if (!f && nome) f = byNome.get(nome.toLowerCase());
    if (f && f.ativo) matched.push(f.id);
    else if (!f) notFound.push(matricula || nome || '(linha sem matrícula/nome)');
  });
  return { matched, notFound };
}
async function bulkImportNew(list) {
  const CHUNK = 400;
  for (let i = 0; i < list.length; i += CHUNK) {
    const batch = writeBatch(db);
    list.slice(i, i + CHUNK).forEach(emp => batch.set(doc(db, EMPLOYEES_COL, emp.id), emp, { merge: true }));
    await batch.commit();
  }
}
async function bulkDismiss(ids) {
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = writeBatch(db);
    ids.slice(i, i + CHUNK).forEach(id => batch.set(doc(db, EMPLOYEES_COL, id), { ativo: false, dataAgendada: '' }, { merge: true }));
    await batch.commit();
  }
}

function getStatus(f) {
  if (!f.ativo) return 'inativo';
  if (f.dataAgendada) {
    const ag = new Date(f.dataAgendada + 'T00:00:00');
    if (ag >= today) return 'agendado';
  }
  if (!f.ultimaData) return 'sem_exame';
  const vencimento = addMonths(f.ultimaData, f.periodicidade || 12);
  const diasRestantes = daysBetween(vencimento, today);
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= 30) return 'vence30';
  if (diasRestantes <= 90) return 'vence90';
  return 'em_dia';
}

async function seedIfEmpty() {
  let snap;
  try { snap = await getDocs(collection(db, EMPLOYEES_COL)); }
  catch (e) { return; } // sem permissão pra listar tudo (ex: gestor) — não faz nada
  if (!snap.empty) return;
  const res = await fetch('data.json');
  const seed = await res.json();
  const CHUNK = 400; // Firestore batch limit is 500 writes
  for (let i = 0; i < seed.length; i += CHUNK) {
    const batch = writeBatch(db);
    seed.slice(i, i + CHUNK).forEach(f => batch.set(doc(db, EMPLOYEES_COL, f.id), f));
    await batch.commit();
  }
}

async function checkManagerStatus() {
  try {
    const snap = await getDoc(doc(db, 'managers', auth.currentUser.email));
    if (snap.exists()) {
      state.isManager = true;
      state.managerSetor = snap.data().setor || null;
      state.departamento = state.managerSetor || 'Todos';
    } else {
      state.isManager = false;
      state.managerSetor = null;
    }
  } catch (e) {
    state.isManager = false;
    state.managerSetor = null;
  }
}

function listenToEmployees() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  const ref = state.isManager && state.managerSetor
    ? query(collection(db, EMPLOYEES_COL), where('setor', '==', state.managerSetor))
    : collection(db, EMPLOYEES_COL);
  unsubscribeSnapshot = onSnapshot(ref, (snap) => {
    state.employees = snap.docs.map(d => d.data());
    render();
  }, (err) => {
    showToast('Erro ao conectar ao banco de dados: ' + err.message, true);
  });
}

async function saveEmployee(id, data) {
  try { await setDoc(doc(db, EMPLOYEES_COL, id), data, { merge: true }); }
  catch (e) { showToast('Não foi possível salvar: ' + e.message, true); }
}
async function removeEmployee(id) {
  try { await deleteDoc(doc(db, EMPLOYEES_COL, id)); }
  catch (e) { showToast('Não foi possível excluir: ' + e.message, true); }
}

function showToast(msg, isError) {
  const root = document.getElementById('toast-root');
  root.innerHTML = `<div class="toast" style="background:${isError ? '#C4432E' : '#1A1A1A'}">${msg}</div>`;
  setTimeout(() => { root.innerHTML = ''; }, 2800);
}

function updateEmployee(id, patch) {
  const idx = state.employees.findIndex(f => f.id === id);
  if (idx === -1) return;
  const updated = { ...state.employees[idx], ...patch };
  saveEmployee(id, updated); // onSnapshot will re-render once Firestore confirms
}
function addEmployee(data) {
  const id = 'novo_' + Date.now();
  const record = { id, matricula: data.matricula || '', dataAgendada: '', ativo: true, periodicidade: 12, situacao: 'Ativo', ...data };
  saveEmployee(id, record);
  showToast(`${data.nome} adicionado ao controle.`);
}
function deleteEmployee(id) {
  removeEmployee(id);
  showToast('Registro excluído permanentemente.');
}

function getFiltered() {
  const enriched = state.employees.map(f => ({ ...f, status: getStatus(f) }));
  return enriched.filter(f => {
    if (state.busca) {
      const q = state.busca.toLowerCase();
      if (!f.nome.toLowerCase().includes(q) && !(f.matricula || '').includes(state.busca)) return false;
    }
    if (state.departamento !== 'Todos' && f.departamento !== state.departamento) return false;
    if (state.status !== 'Todos' && f.status !== state.status) return false;
    return true;
  }).sort((a, b) => {
    const va = a.ultimaData ? addMonths(a.ultimaData, a.periodicidade || 12) : new Date(0);
    const vb = b.ultimaData ? addMonths(b.ultimaData, b.periodicidade || 12) : new Date(0);
    return va - vb;
  });
}

function render() {
  const app = document.getElementById('app');
  const enrichedAll = state.employees.map(f => ({ ...f, status: getStatus(f) }));
  const ativos = state.employees.filter(f => f.ativo).length;
  const counts = enrichedAll.reduce((acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc; }, {});
  const departamentos = ['Todos', ...Array.from(new Set(state.employees.map(f => f.departamento).filter(Boolean))).sort()];
  const filtered = getFiltered();

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const pageItems = filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  app.innerHTML = `
    <div class="header">
      <div>
        <div class="eyebrow">Controle de Saúde Ocupacional</div>
        <h1 class="display">${state.isManager ? `Painel de Indicadores — ${escapeHtml(state.managerSetor || '')}` : 'Painel de ASOs'}</h1>
        <div class="sub">${state.employees.length.toLocaleString('pt-BR')} colaborador(es)${state.isManager ? ' · modo consulta (somente leitura)' : ' no controle'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${state.isManager ? '' : `
          <button class="btn-secondary" id="btn-import-new">${ICONS.upload} Importar colaboradores</button>
          <button class="btn-secondary" id="btn-import-dismiss">${ICONS.upload} Importar desligamentos</button>
          <button class="btn-add" id="btn-add">${ICONS.plus} Novo colaborador</button>
        `}
        <button class="logout-btn" id="btn-logout">Sair (${escapeHtml(auth.currentUser ? auth.currentUser.email : '')})</button>
      </div>
    </div>

    <div class="counters">
      ${countCard('Total ativos', ativos, 'var(--pine)', null)}
      ${countCard('Em dia', counts.em_dia || 0, 'var(--c-emdia)', 'em_dia')}
      ${countCard('Vence em 90 dias', counts.vence90 || 0, 'var(--c-vence90)', 'vence90')}
      ${countCard('Vence em 30 dias', counts.vence30 || 0, 'var(--c-vence30)', 'vence30')}
      ${countCard('Vencidos', counts.vencido || 0, 'var(--c-vencido)', 'vencido')}
      ${countCard('Agendados', counts.agendado || 0, 'var(--c-agendado)', 'agendado')}
      ${countCard('Sem exame', counts.sem_exame || 0, 'var(--c-semexame)', 'sem_exame')}
      ${countCard('Inativos', counts.inativo || 0, 'var(--c-inativo)', 'inativo')}
    </div>

    <div class="toolbar">
      <div class="search-wrap">${ICONS.search}<input id="input-busca" placeholder="Buscar por nome ou matrícula" value="${escapeAttr(state.busca)}"></div>
      <div class="select-wrap">
        <select id="select-depto">
          ${departamentos.map(d => `<option value="${escapeAttr(d)}" ${d === state.departamento ? 'selected' : ''}>${d === 'Todos' ? 'Todos os departamentos' : d}</option>`).join('')}
        </select>${ICONS.chevron}
      </div>
      <div class="select-wrap">
        <select id="select-status">
          <option value="Todos" ${state.status === 'Todos' ? 'selected' : ''}>Todos os status</option>
          ${Object.entries(STATUS_META).map(([k, v]) => `<option value="${k}" ${state.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>${ICONS.chevron}
      </div>
      ${(state.departamento !== 'Todos' || state.status !== 'Todos' || state.busca) ? `<button class="clear-link" id="btn-clear">Limpar filtros</button>` : ''}
    </div>

    <div class="result-count">${filtered.length.toLocaleString('pt-BR')} registro(s) encontrado(s)</div>

    <div class="table-wrap">
      <div class="table-card">
        <table>
          <thead><tr>
            <th>Colaborador</th><th>Departamento</th><th>Última realização</th><th>Vencimento</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody>
            ${pageItems.length === 0 ? `<tr class="empty-row"><td colspan="6">Nenhum registro encontrado com os filtros atuais.</td></tr>` : pageItems.map(rowHtml).join('')}
          </tbody>
        </table>
        <div class="pagination">
          <span>Página ${state.page} de ${totalPages}</span>
          <div class="pages">
            <button id="pg-prev" ${state.page === 1 ? 'disabled' : ''}>Anterior</button>
            <button id="pg-next" ${state.page === totalPages ? 'disabled' : ''}>Próxima</button>
          </div>
        </div>
      </div>
    </div>
    <div class="footer-note">Dados salvos automaticamente neste navegador.</div>
  `;

  attachEvents();
}

function countCard(label, value, color, statusKey) {
  const active = statusKey && state.status === statusKey;
  return `<div class="count-card ${active ? 'active' : ''}" style="border-top-color:${color}" data-status="${statusKey || ''}">
    <div class="val mono" style="color:${color}">${value.toLocaleString('pt-BR')}</div>
    <div class="lbl">${label}</div>
  </div>`;
}

function rowHtml(f) {
  const meta = STATUS_META[f.status];
  const vencimento = f.ultimaData ? addMonths(f.ultimaData, f.periodicidade || 12) : null;
  return `
    <tr style="border-left-color:${meta.color}">
      <td class="name-cell">
        <div class="name">${escapeHtml(f.nome)}</div>
        <div class="meta mono">Matr. ${escapeHtml(f.matricula || '—')} · ${escapeHtml(f.cargo || '')}</div>
      </td>
      <td>${escapeHtml(f.departamento || '—')}${f.setor ? `<div class="meta" style="font-size:11.5px;color:#8A9793">${escapeHtml(f.setor)}</div>` : ''}</td>
      <td class="mono">${fmt(f.ultimaData)}</td>
      <td class="mono">
        ${vencimento ? fmt(vencimento) : '—'}
        ${f.dataAgendada && f.status === 'agendado' ? `<div class="sched-note">agendado: ${fmt(f.dataAgendada)}</div>` : ''}
      </td>
      <td><span class="badge" style="background:${meta.bg};color:${meta.color}">${meta.label}</span></td>
      <td>
        <div class="row-actions">
          ${state.isManager ? '<span style="color:#8A9793;font-size:12px">—</span>' : (f.ativo ? `
            <button class="icon-btn" title="Marcar como agendado" data-action="agendar" data-id="${f.id}">${ICONS.calendar}</button>
            <button class="icon-btn" title="Marcar como realizado" data-action="realizar" data-id="${f.id}">${ICONS.check}</button>
            <button class="icon-btn" title="Editar" data-action="edit" data-id="${f.id}">${ICONS.edit}</button>
            <button class="icon-btn" title="Inativar (desligado)" data-action="inativar" data-id="${f.id}">${ICONS.userx}</button>
          ` : `<button class="icon-btn" title="Reativar" data-action="reativar" data-id="${f.id}">${ICONS.usercheck}</button>`)}
          ${state.isManager ? '' : `<button class="icon-btn" title="Excluir permanentemente" data-action="delete" data-id="${f.id}">${ICONS.trash}</button>`}
        </div>
      </td>
    </tr>`;
}

function escapeHtml(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

function attachEvents() {
  const btnAdd = document.getElementById('btn-add');
  if (btnAdd) btnAdd.onclick = () => openModal('add');
  const btnImportNew = document.getElementById('btn-import-new');
  if (btnImportNew) btnImportNew.onclick = () => openModal('import-new');
  const btnImportDismiss = document.getElementById('btn-import-dismiss');
  if (btnImportDismiss) btnImportDismiss.onclick = () => openModal('import-dismiss');
  document.getElementById('btn-logout').onclick = () => signOut(auth);
  document.getElementById('input-busca').oninput = (e) => {
    state.busca = e.target.value;
    state.page = 1;
    const cursorPos = e.target.selectionStart;
    render();
    const input = document.getElementById('input-busca');
    input.focus();
    input.setSelectionRange(cursorPos, cursorPos);
  };
  document.getElementById('select-depto').onchange = (e) => { state.departamento = e.target.value; state.page = 1; render(); };
  document.getElementById('select-status').onchange = (e) => { state.status = e.target.value; state.page = 1; render(); };
  const clearBtn = document.getElementById('btn-clear');
  if (clearBtn) clearBtn.onclick = () => { state.busca = ''; state.departamento = 'Todos'; state.status = 'Todos'; state.page = 1; render(); };

  document.querySelectorAll('.count-card').forEach(el => {
    el.onclick = () => { state.status = el.dataset.status || 'Todos'; state.page = 1; render(); };
  });
  const prev = document.getElementById('pg-prev'), next = document.getElementById('pg-next');
  if (prev) prev.onclick = () => { state.page--; render(); };
  if (next) next.onclick = () => { state.page++; render(); };

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const f = state.employees.find(e => e.id === id);
      if (action === 'agendar') openModal('agendar', f);
      else if (action === 'realizar') openModal('realizar', f);
      else if (action === 'edit') openModal('edit', f);
      else if (action === 'delete') openModal('delete', f);
      else if (action === 'inativar') updateEmployee(id, { ativo: false, dataAgendada: '' });
      else if (action === 'reativar') updateEmployee(id, { ativo: true });
    };
  });
}

const TITLES = {
  add: 'Novo colaborador', edit: 'Editar colaborador',
  agendar: 'Marcar exame como agendado', realizar: 'Registrar exame realizado',
  delete: 'Excluir registro permanentemente',
  'import-new': 'Importar novos colaboradores', 'import-dismiss': 'Importar desligamentos em lote',
};

function openModal(type, f) {
  const root = document.getElementById('modal-root');
  const isForm = type === 'add' || type === 'edit';
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal-box">
        <div class="modal-head"><h3 class="display">${TITLES[type]}</h3><button class="icon-btn" id="modal-close">${ICONS.x}</button></div>
        <div id="modal-body"></div>
      </div>
    </div>`;
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') closeModal(); };
  document.getElementById('modal-close').onclick = closeModal;

  const body = document.getElementById('modal-body');
  if (isForm) {
    const d = f || { nome: '', matricula: '', cargo: '', departamento: '', setor: '', ultimaData: '', periodicidade: 12 };
    body.innerHTML = `
      <label class="field-label">Nome completo</label><input class="field-input" id="f-nome" value="${escapeAttr(d.nome)}">
      <label class="field-label">Matrícula</label><input class="field-input" id="f-matricula" value="${escapeAttr(d.matricula)}">
      <label class="field-label">Cargo</label><input class="field-input" id="f-cargo" value="${escapeAttr(d.cargo)}">
      <label class="field-label">Departamento</label><input class="field-input" id="f-departamento" value="${escapeAttr(d.departamento)}">
      <label class="field-label">Setor</label><input class="field-input" id="f-setor" value="${escapeAttr(d.setor)}">
      <label class="field-label">Data da última realização</label><input type="date" class="field-input" id="f-ultimaData" value="${d.ultimaData || ''}">
      <label class="field-label">Periodicidade (meses)</label><input type="number" class="field-input" id="f-periodicidade" value="${d.periodicidade || 12}">
      <button class="modal-primary" style="background:#1A1A1A" id="modal-save">${type === 'add' ? 'Adicionar colaborador' : 'Salvar alterações'}</button>
    `;
    document.getElementById('modal-save').onclick = () => {
      const data = {
        nome: document.getElementById('f-nome').value.trim(),
        matricula: document.getElementById('f-matricula').value.trim(),
        cargo: document.getElementById('f-cargo').value.trim(),
        departamento: document.getElementById('f-departamento').value.trim(),
        setor: document.getElementById('f-setor').value.trim(),
        ultimaData: document.getElementById('f-ultimaData').value,
        periodicidade: Number(document.getElementById('f-periodicidade').value) || 12,
      };
      if (!data.nome || !data.ultimaData) { showToast('Preencha nome e data da última realização.', true); return; }
      if (type === 'add') addEmployee(data); else updateEmployee(f.id, data);
      closeModal();
      showToast(type === 'add' ? undefined : 'Registro atualizado.');
    };
  } else if (type === 'agendar') {
    body.innerHTML = `
      <p style="font-size:14px;color:var(--muted);margin-top:0">Informe a data agendada para o exame de <strong>${escapeHtml(f.nome)}</strong>.</p>
      <label class="field-label">Data agendada</label><input type="date" class="field-input" id="f-data">
      <button class="modal-primary" style="background:#2E6E8E" id="modal-save">Confirmar agendamento</button>`;
    document.getElementById('modal-save').onclick = () => {
      const val = document.getElementById('f-data').value;
      if (!val) { showToast('Escolha uma data.', true); return; }
      updateEmployee(f.id, { dataAgendada: val });
      closeModal(); showToast('Exame agendado.');
    };
  } else if (type === 'realizar') {
    body.innerHTML = `
      <p style="font-size:14px;color:var(--muted);margin-top:0">Informe a data em que o exame de <strong>${escapeHtml(f.nome)}</strong> foi realizado. O vencimento será recalculado automaticamente.</p>
      <label class="field-label">Data de realização</label><input type="date" class="field-input" id="f-data">
      <button class="modal-primary" style="background:#2F9E62" id="modal-save">Confirmar realização</button>`;
    document.getElementById('modal-save').onclick = () => {
      const val = document.getElementById('f-data').value;
      if (!val) { showToast('Escolha uma data.', true); return; }
      updateEmployee(f.id, { ultimaData: val, dataAgendada: '' });
      closeModal(); showToast('Exame registrado como realizado.');
    };
  } else if (type === 'delete') {
    body.innerHTML = `
      <div class="warn-box">${ICONS.alert}<p>Isso removerá <strong>${escapeHtml(f.nome)}</strong> e todo o histórico permanentemente. Se o colaborador foi apenas desligado, prefira "Inativar" para manter o histórico.</p></div>
      <button class="modal-primary" style="background:#C4432E" id="modal-save">Excluir permanentemente</button>`;
    document.getElementById('modal-save').onclick = () => { deleteEmployee(f.id); closeModal(); };
  } else if (type === 'import-new' || type === 'import-dismiss') {
    const isNew = type === 'import-new';
    body.innerHTML = `
      <p style="font-size:13.5px;color:var(--muted);margin-top:0">
        ${isNew
          ? 'Envie uma planilha (.xlsx ou .csv) com uma linha por colaborador. Colunas aceitas no cabeçalho:'
          : 'Envie uma planilha (.xlsx ou .csv) com os colaboradores desligados. Eles serão marcados como <strong>inativos</strong> (o histórico é mantido — nada é excluído). Coluna aceita no cabeçalho:'}
      </p>
      <div class="mono" style="font-size:12px;background:#F7F9F8;padding:10px;border-radius:6px;margin-bottom:12px;overflow-x:auto">
        ${isNew ? 'nome | matricula | cargo | departamento | setor | ultimaData | periodicidade' : 'matricula (ou nome, se não tiver matrícula)'}
      </div>
      <p style="font-size:12.5px;color:var(--muted)">
        ${isNew
          ? '<strong>nome</strong> e <strong>ultimaData</strong> são obrigatórios (data no formato dd/mm/aaaa). <strong>periodicidade</strong> em meses — se vazio, assume 12. Se a matrícula já existir no sistema, o colaborador é atualizado em vez de duplicado.'
          : 'Usamos a <strong>matrícula</strong> para encontrar o colaborador certo (mais confiável que o nome). Quem não for encontrado aparece listado abaixo pra você conferir.'}
      </p>
      <input type="file" id="import-file-input" accept=".xlsx,.xls,.csv" class="field-input" style="padding:8px">
      <div id="import-preview" style="font-size:13px;color:var(--muted);min-height:20px;margin:4px 0 14px"></div>
      <button class="modal-primary" style="background:#1A1A1A" id="modal-save" disabled>${isNew ? 'Importar colaboradores' : 'Confirmar desligamentos'}</button>
    `;
    const fileInput = document.getElementById('import-file-input');
    const preview = document.getElementById('import-preview');
    const saveBtn = document.getElementById('modal-save');
    let ready = null;

    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      preview.textContent = 'Lendo planilha…';
      saveBtn.disabled = true;
      ready = null;
      try {
        const rows = await parseSpreadsheet(file);
        if (isNew) {
          const { valid, errors } = buildNewEmployeesFromRows(rows);
          ready = valid;
          preview.innerHTML = `${valid.length} colaborador(es) prontos para importar.` +
            (errors.length ? `<br><span style="color:var(--c-vencido)">${errors.length} linha(s) ignorada(s) por falta de nome/data: ${escapeHtml(errors.slice(0, 5).join(', '))}${errors.length > 5 ? '…' : ''}</span>` : '');
        } else {
          const { matched, notFound } = buildDismissalsFromRows(rows, state.employees);
          ready = matched;
          preview.innerHTML = `${matched.length} colaborador(es) serão marcados como desligados.` +
            (notFound.length ? `<br><span style="color:var(--c-vencido)">${notFound.length} não encontrado(s) ou já inativo(s): ${escapeHtml(notFound.slice(0, 5).join(', '))}${notFound.length > 5 ? '…' : ''}</span>` : '');
        }
        saveBtn.disabled = !ready || ready.length === 0;
      } catch (e) {
        preview.innerHTML = `<span style="color:var(--c-vencido)">${escapeHtml(e.message)}</span>`;
      }
    };

    saveBtn.onclick = async () => {
      if (!ready || !ready.length) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Importando…';
      try {
        if (isNew) { await bulkImportNew(ready); showToast(`${ready.length} colaborador(es) importado(s).`); }
        else { await bulkDismiss(ready); showToast(`${ready.length} colaborador(es) marcado(s) como desligados.`); }
        closeModal();
      } catch (e) {
        showToast('Não foi possível concluir a importação: ' + e.message, true);
        saveBtn.disabled = false;
        saveBtn.textContent = isNew ? 'Importar colaboradores' : 'Confirmar desligamentos';
      }
    };
  }
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function renderLogin(errorMsg) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-box">
        <div class="eyebrow">Controle de Saúde Ocupacional</div>
        <h1 class="display">Entrar no painel</h1>
        <div class="login-error">${errorMsg ? escapeHtml(errorMsg) : ''}</div>
        <label class="field-label">E-mail</label>
        <input class="field-input" id="login-email" type="email" placeholder="voce@empresa.com">
        <label class="field-label">Senha</label>
        <input class="field-input" id="login-senha" type="password">
        <button class="modal-primary" style="background:#1A1A1A" id="login-btn">Entrar</button>
      </div>
    </div>`;
  document.getElementById('login-btn').onclick = doLogin;
  document.getElementById('login-senha').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (e) {
    renderLogin('Não foi possível entrar. Confira e-mail e senha.');
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('app').innerHTML = '<div class="loading">Carregando registros…</div>';
    await checkManagerStatus();
    if (!state.isManager) await seedIfEmpty();
    listenToEmployees();
  } else {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    state.isManager = false;
    state.managerSetor = null;
    renderLogin();
  }
});
