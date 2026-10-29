'use strict';

const $ = (selector) => document.querySelector(selector);

let currentTab = null;
let currentData = {};

// ---------------------------------------------------------------------------
// Funções injetadas na página. Rodam no contexto da aba (mundo isolado), então
// precisam ser autocontidas: não podem usar nada de fora do próprio corpo.
// ---------------------------------------------------------------------------

function pageGetAll() {
  try {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      data[key] = localStorage.getItem(key);
    }
    return { data };
  } catch (e) {
    return { error: e.message };
  }
}

function pageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return {};
  } catch (e) {
    return { error: e.message };
  }
}

function pageRemoveItem(key) {
  try {
    localStorage.removeItem(key);
    return {};
  } catch (e) {
    return { error: e.message };
  }
}

function pageImport(data, clearFirst) {
  try {
    if (clearFirst) localStorage.clear();
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, value);
    }
    return { count: Object.keys(data).length };
  } catch (e) {
    return { error: e.message };
  }
}

function pageClear() {
  try {
    localStorage.clear();
    return {};
  } catch (e) {
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Comunicação com a aba
// ---------------------------------------------------------------------------

async function runInPage(func, args = []) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func,
    args,
  });
  const result = injection && injection.result;
  if (!result) throw new Error('Sem resposta da página.');
  if (result.error) throw new Error(result.error);
  return result;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

function setStatus(message, type = '') {
  const status = $('#status');
  status.textContent = message;
  status.className = `status ${type}`;
}

function toJson(data) {
  return JSON.stringify(data, null, 2);
}

function getOrigin() {
  try {
    return new URL(currentTab.url).origin;
  } catch {
    return '';
  }
}

function renderList() {
  const list = $('#list');
  const filter = $('#filter').value.trim().toLowerCase();
  const keys = Object.keys(currentData).sort((a, b) => a.localeCompare(b));
  const visible = keys.filter(
    (key) =>
      !filter ||
      key.toLowerCase().includes(filter) ||
      String(currentData[key]).toLowerCase().includes(filter)
  );

  list.replaceChildren();
  $('#count').textContent = filter
    ? `${visible.length} de ${keys.length} itens`
    : `${keys.length} itens`;

  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = keys.length === 0 ? 'localStorage vazio.' : 'Nenhum item encontrado.';
    list.append(empty);
    return;
  }

  for (const key of visible) {
    list.append(renderItem(key, currentData[key]));
  }
}

function renderItem(key, value) {
  const item = document.createElement('li');
  item.className = 'item';

  const keyEl = document.createElement('div');
  keyEl.className = 'item-key';
  keyEl.textContent = key;

  const valueEl = document.createElement('textarea');
  valueEl.className = 'field';
  valueEl.rows = Math.min(6, Math.max(2, value.split('\n').length));
  valueEl.value = value;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Salvar';
  saveBtn.addEventListener('click', () => saveItem(key, valueEl.value));

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copiar valor';
  copyBtn.addEventListener('click', () => copyText(valueEl.value, 'Valor copiado.'));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'danger';
  removeBtn.textContent = 'Remover';
  removeBtn.addEventListener('click', () => removeItem(key));

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.append(saveBtn, copyBtn, removeBtn);

  item.append(keyEl, valueEl, actions);
  return item;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function loadData() {
  const { data } = await runInPage(pageGetAll);
  currentData = data;
  renderList();
}

async function saveItem(key, value) {
  try {
    await runInPage(pageSetItem, [key, value]);
    await loadData();
    setStatus(`"${key}" salvo.`, 'ok');
  } catch (e) {
    setStatus(`Erro ao salvar: ${e.message}`, 'error');
  }
}

async function removeItem(key) {
  if (!confirm(`Remover "${key}"?`)) return;
  try {
    await runInPage(pageRemoveItem, [key]);
    await loadData();
    setStatus(`"${key}" removido.`, 'ok');
  } catch (e) {
    setStatus(`Erro ao remover: ${e.message}`, 'error');
  }
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(message, 'ok');
  } catch (e) {
    setStatus(`Erro ao copiar: ${e.message}`, 'error');
  }
}

async function copyAll() {
  try {
    await loadData();
    await copyText(toJson(currentData), 'localStorage copiado para a área de transferência.');
  } catch (e) {
    setStatus(`Erro ao copiar: ${e.message}`, 'error');
  }
}

async function clearAll() {
  if (!confirm('Apagar todo o localStorage desta página? Essa ação não pode ser desfeita.')) return;
  try {
    await runInPage(pageClear);
    await loadData();
    setStatus('localStorage limpo.', 'ok');
  } catch (e) {
    setStatus(`Erro ao limpar: ${e.message}`, 'error');
  }
}

// Aceita apenas um objeto JSON simples. Valores que não são string (números,
// objetos, etc.) são convertidos com JSON.stringify, pois o localStorage só
// guarda strings.
function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON inválido: ${e.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('O JSON precisa ser um objeto no formato {"chave": "valor"}.');
  }
  const data = {};
  for (const [key, value] of Object.entries(parsed)) {
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return data;
}

async function importJson() {
  const text = $('#import-text').value.trim();
  if (!text) {
    setStatus('Cole um JSON para importar.', 'error');
    return;
  }
  try {
    const data = parseImport(text);
    const clearFirst = $('#import-clear').checked;
    if (clearFirst && !confirm('Isso vai apagar todo o localStorage atual antes de importar. Continuar?')) {
      return;
    }
    const { count } = await runInPage(pageImport, [data, clearFirst]);
    await loadData();
    $('#import-text').value = '';
    setStatus(`${count} itens importados.`, 'ok');
  } catch (e) {
    setStatus(`Erro ao importar: ${e.message}`, 'error');
  }
}

async function addItem(event) {
  event.preventDefault();
  const key = $('#add-key').value;
  if (!key) return;
  await saveItem(key, $('#add-value').value);
  $('#form-add').reset();
}

async function refresh() {
  try {
    await loadData();
    setStatus('Atualizado.', 'ok');
  } catch (e) {
    setStatus(`Erro ao ler: ${e.message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('#origin').textContent = getOrigin() || currentTab.url || '—';

  $('#btn-close').addEventListener('click', () => window.close());
  $('#btn-refresh').addEventListener('click', refresh);
  $('#btn-copy').addEventListener('click', copyAll);
  $('#btn-clear').addEventListener('click', clearAll);
  $('#btn-import').addEventListener('click', importJson);
  $('#form-add').addEventListener('submit', addItem);
  $('#filter').addEventListener('input', renderList);

  try {
    await loadData();
  } catch (e) {
    setStatus(
      `Não foi possível acessar o localStorage desta página (${e.message}). ` +
        'Páginas internas do Chrome (chrome://) e a Chrome Web Store não permitem extensões.',
      'error'
    );
  }
}

init();
