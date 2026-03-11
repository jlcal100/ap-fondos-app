// ====== MODULE: ui.js ======
// Toast, showConfirm, closeConfirm, showLoading, hideLoading, showPrompt, closePrompt, esc(), clearForm(), formatMiles(), parseMiles(), setInputMiles(), fmt(), fmtDate(), fmtMoneda(), toMXN()

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function toast(msg, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<span>' + (icons[type]||'') + '</span><span>' + msg + '</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';
  container.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut 0.3s ease-in forwards'; setTimeout(() => t.remove(), 300); }, duration);
}

// ============================================================
//  CONFIRM DIALOG
// ============================================================
let confirmResolve = null;
function showConfirm(title, msg, btnText) {
  document.getElementById('confirmTitle').textContent = title || '¿Estás seguro?';
  document.getElementById('confirmMsg').textContent = msg || 'Esta acción no se puede deshacer.';
  document.getElementById('confirmBtn').textContent = btnText || 'Confirmar';
  document.getElementById('confirmOverlay').classList.add('active');
  return new Promise(resolve => { confirmResolve = resolve; });
}
function closeConfirm(result) {
  document.getElementById('confirmOverlay').classList.remove('active');
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

// Bug #24: Loading spinner
function showLoading(msg) {
  document.getElementById('loadingText').textContent = msg || 'Procesando...';
  document.getElementById('loadingOverlay').classList.add('active');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

// Bug #29: Prompt modal (reemplazo de prompt() nativo)
let promptResolve = null;
function showPrompt(title, msg, defaultVal) {
  document.getElementById('promptTitle').textContent = title || 'Ingrese un valor';
  document.getElementById('promptMsg').textContent = msg || '';
  document.getElementById('promptInput').value = defaultVal || '';
  document.getElementById('promptOverlay').classList.add('active');
  setTimeout(() => document.getElementById('promptInput').focus(), 100);
  return new Promise(resolve => { promptResolve = resolve; });
}
function closePrompt(value) {
  document.getElementById('promptOverlay').classList.remove('active');
  if (promptResolve) { promptResolve(value); promptResolve = null; }
}

// ============================================================
//  FORM CLEANUP
// ============================================================
function clearForm(fields) {
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else if (el.type === 'number') el.value = '';
    else if (el.type === 'date') el.value = '';
    else el.value = '';
  });
}

