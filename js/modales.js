// ====== MODULE: modales.js ======
// Modal management (openModal, closeModal, _forceCloseModal, dirty form tracking, _snapshotModal, _checkDirty), transaction handlers (openDisposicion, patchPagoCC, etc.)

// ============================================================
//  MODALS & UTILS
// ============================================================
// ===== MEJORA 9: CONFIRMACIÓN ANTES DE SALIR CON CAMBIOS SIN GUARDAR =====
var _dirtyForms = {};      // { modalId: boolean }
var _formSnapshots = {};   // { modalId: { fieldId: value } }
var _MODALES_RASTREADOS = ['modalCredito', 'modalCliente', 'modalFondeo', 'modalPago', 'modalGenerico'];

function _snapshotModal(modalId) {
  var modal = document.getElementById(modalId);
  if (!modal) return {};
  var snap = {};
  modal.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (el.id) snap[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return snap;
}

function _checkDirty(modalId) {
  var modal = document.getElementById(modalId);
  if (!modal) return false;
  var snap = _formSnapshots[modalId] || {};
  var dirty = false;
  modal.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (!el.id) return;
    var current = el.type === 'checkbox' ? el.checked : el.value;
    if (snap[el.id] !== undefined && snap[el.id] !== current) dirty = true;
  });
  return dirty;
}

function _markFormSaved(modalId) {
  _dirtyForms[modalId] = false;
}

function openModal(id) {
  var el = document.getElementById(id);
  el.classList.add('active');
  // Tomar snapshot después de un tick para que los campos estén poblados
  setTimeout(function() {
    _formSnapshots[id] = _snapshotModal(id);
    _dirtyForms[id] = false;
  }, 100);
}

function closeModal(id) {
  // Verificar si hay cambios sin guardar
  if (_MODALES_RASTREADOS.indexOf(id) !== -1 && _checkDirty(id)) {
    if (!confirm('Tienes cambios sin guardar. ¿Seguro que deseas cerrar?')) return;
  }
  _dirtyForms[id] = false;
  _formSnapshots[id] = {};
  document.getElementById(id).classList.remove('active');
}

function _forceCloseModal(id) {
  _dirtyForms[id] = false;
  _formSnapshots[id] = {};
  document.getElementById(id).classList.remove('active');
}

// Beforeunload: prevenir cierre del navegador con modal abierto y datos sin guardar
window.addEventListener('beforeunload', function(e) {
  var hayDirty = false;
  _MODALES_RASTREADOS.forEach(function(mid) {
    var modal = document.getElementById(mid);
    if (modal && modal.classList.contains('active') && _checkDirty(mid)) hayDirty = true;
  });
  if (hayDirty) {
    e.preventDefault();
    e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que deseas salir?';
    return e.returnValue;
  }
});

// Close modal on overlay click (con protección dirty)
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target !== m) return;
    var id = m.id;
    if (_MODALES_RASTREADOS.indexOf(id) !== -1 && _checkDirty(id)) {
      if (!confirm('Tienes cambios sin guardar. ¿Seguro que deseas cerrar?')) return;
    }
    _dirtyForms[id] = false;
    _formSnapshots[id] = {};
    m.classList.remove('active');
  });
});

// Bug #26: Teclas de atajo globales
document.addEventListener('keydown', function(e) {
  // Sprint J: Búsqueda global search keyboard nav
  if (document.getElementById('searchOverlay').classList.contains('active')) {
    if (e.key === 'Escape') { closeSearch(); return; }
    handleSearchKeydown(e);
    return;
  }

  // Sprint J: Ayuda de teclado overlay
  if (document.getElementById('kbdHelpOverlay').classList.contains('active')) {
    if (e.key === 'Escape') { document.getElementById('kbdHelpOverlay').classList.remove('active'); return; }
    return;
  }

  // Esc: cerrar modals, confirm, prompt
  if (e.key === 'Escape') {
    // Cerrar notif panel
    var notifPanel = document.getElementById('notifPanel');
    if (notifPanel && notifPanel.style.display !== 'none') { notifPanel.style.display = 'none'; return; }
    // Cerrar prompt primero (más alto z-index)
    if (document.getElementById('promptOverlay').classList.contains('active')) {
      closePrompt(null); return;
    }
    // Luego confirm
    if (document.getElementById('confirmOverlay').classList.contains('active')) {
      closeConfirm(false); return;
    }
    // Luego cualquier modal abierto
    const openModal = document.querySelector('.modal-overlay.active');
    if (openModal) { openModal.classList.remove('active'); return; }
  }

  // Enter: aceptar confirm/prompt (si están abiertos)
  if (e.key === 'Enter') {
    if (document.getElementById('promptOverlay').classList.contains('active')) {
      e.preventDefault();
      closePrompt(document.getElementById('promptInput').value); return;
    }
    if (document.getElementById('confirmOverlay').classList.contains('active')) {
      e.preventDefault();
      closeConfirm(true); return;
    }
  }

  // Sprint J: Ctrl+K → Búsqueda global
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }

  // Sprint J: Ctrl+D → Toggle dark mode
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    toggleDarkMode();
    return;
  }

  // Sprint J: ? → Ayuda de teclado (solo si no hay input activo)
  if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    document.getElementById('kbdHelpOverlay').classList.add('active');
    return;
  }

  // Sprint J: Alt+1-8 → Navegación rápida
  if (e.altKey && e.key >= '1' && e.key <= '8') {
    e.preventDefault();
    var pages = ['dashboard', 'clientes', 'creditos', 'pagos', 'fondeos', 'contabilidad', 'reportes', 'admin'];
    var idx = parseInt(e.key) - 1;
    if (idx < pages.length) showPage(pages[idx]);
    return;
  }
});


// ============================================================
//  CUENTA CORRIENTE — DISPOSICIONES Y PAGOS
// ============================================================

function openDisposicion(creditoId) {
  var c = getStore('creditos').find(function(cr) { return cr.id === creditoId; });
  if (!c || !c.esRevolvente) return toast('Este crédito no es cuenta corriente', 'error');
  if (c.estado !== 'vigente') return toast('La línea no está vigente', 'error');

  var disponible = c.disponible || 0;
  // Bug #29: Reemplazar prompt() nativo por modal
  showPrompt('Disposición de línea', 'Disponible: ' + fmt(disponible), '').then(function(val) {
  if (!val) return;
  var monto = parseFloat(val.replace(/,/g, ''));
  if (isNaN(monto) || monto <= 0) return toast('Monto inválido', 'error');
  if (monto > disponible + 0.01) return toast('Monto excede el disponible: ' + fmt(disponible), 'error');

  var fecha = new Date().toISOString().split('T')[0];
  var creditos = getStore('creditos');
  creditos = creditos.map(function(cr) {
    if (cr.id !== creditoId) return cr;
    cr.saldo = (cr.saldo || 0) + monto;
    cr.disponible = (cr.limite || cr.monto) - cr.saldo;
    if (!cr.disposiciones) cr.disposiciones = [];
    cr.disposiciones.push({ fecha: fecha, monto: monto, tipo: 'disposicion', saldo: cr.saldo, id: Date.now() });
    return cr;
  });
  setStore('creditos', creditos);

  // Registro contable
  var contab = getStore('contabilidad');
  contab.push({
    id: nextId('contabilidad'), fecha: fecha, tipo: 'colocacion',
    concepto: 'Disposición ' + c.numero + ' — ' + fmt(monto),
    monto: monto, cuentaDebe: '1201', cuentaHaber: '1101',
    creditoId: creditoId, referencia: c.numero, createdAt: new Date().toISOString()
  });
  setStore('contabilidad', contab);

  addAudit('Disposición', 'Créditos', c.numero + ': ' + fmt(monto));
  toast('Disposición registrada: ' + fmt(monto) + ' — Nuevo saldo: ' + fmt((c.saldo || 0) + monto), 'success');
  renderCreditos();
  }); // cierre de showPrompt.then
}

// Override pago para cuenta corriente: el capital pagado libera línea
var _originalGuardarPago = null;
function patchPagoCC() {
  // Después de guardar un pago, verificar si es CC y actualizar disponible
  var creditos = getStore('creditos');
  creditos = creditos.map(function(cr) {
    if (!cr.esRevolvente) return cr;
    cr.disponible = (cr.limite || cr.monto) - cr.saldo;
    if (cr.saldo <= 0.01) { cr.saldo = 0; cr.disponible = cr.limite || cr.monto; }
    // Registrar en disposiciones como pago
    return cr;
  });
  setStore('creditos', creditos);
  addAudit('Actualizar', 'Créditos', 'Saldo CC actualizado (post-pago)');
}

// Fondeo cuenta corriente: disposición desde fondeo
function openDisposicionFondeo(fondeoId) {
  var f = getStore('fondeos').find(function(fo) { return fo.id === fondeoId; });
  if (!f) return;
  var disponible = (f.limite || f.monto) - (f.saldoDispuesto || 0);

  showPrompt('Disposición de fondeo', 'Disponible: ' + fmt(disponible), '').then(function(val) {
    if (!val) return;
    var monto = parseFloat(val.replace(/,/g, ''));
    if (isNaN(monto) || monto <= 0) return toast('Monto inválido', 'error');
    if (monto > disponible + 0.01) return toast('Monto excede disponible: ' + fmt(disponible), 'error');

    var fecha = new Date().toISOString().split('T')[0];
    var fondeos = getStore('fondeos');
    fondeos = fondeos.map(function(fo) {
      if (fo.id !== fondeoId) return fo;
      fo.saldoDispuesto = (fo.saldoDispuesto || 0) + monto;
      fo.saldo = fo.saldoDispuesto;
      fo.disponibleFondeo = (fo.limite || fo.monto) - fo.saldoDispuesto;
      if (!fo.disposiciones) fo.disposiciones = [];
      fo.disposiciones.push({ fecha: fecha, monto: monto, tipo: 'disposicion', saldo: fo.saldoDispuesto, id: Date.now() });
      return fo;
    });
    setStore('fondeos', fondeos);

    var contab = getStore('contabilidad');
    contab.push({
      id: nextId('contabilidad'), fecha: fecha, tipo: 'pago_recibido',
      concepto: 'Disposición Fondeo ' + f.numero + ' — ' + fmt(monto),
      monto: monto, cuentaDebe: '1101', cuentaHaber: '2101',
      referencia: f.numero, createdAt: new Date().toISOString()
    });
    setStore('contabilidad', contab);

    addAudit('Disposición Fondeo', 'Fondeos', f.numero + ': ' + fmt(monto));
    toast('Disposición de fondeo: ' + fmt(monto), 'success');
    renderFondeos();
  });
}

function pagarFondeoCC(fondeoId) {
  var f = getStore('fondeos').find(function(fo) { return fo.id === fondeoId; });
  if (!f) return;
  var saldoDisp = f.saldoDispuesto || f.saldo || 0;

  showPrompt('Pago a fondeo', 'Saldo dispuesto: ' + fmt(saldoDisp), '').then(function(val) {
    if (!val) return;
    var monto = parseFloat(val.replace(/,/g, ''));
    if (isNaN(monto) || monto <= 0) return toast('Monto inválido', 'error');
    if (monto > saldoDisp + 0.01) return toast('Monto excede saldo: ' + fmt(saldoDisp), 'error');

    var fecha = new Date().toISOString().split('T')[0];
    var fondeos = getStore('fondeos');
    fondeos = fondeos.map(function(fo) {
      if (fo.id !== fondeoId) return fo;
      fo.saldoDispuesto = (fo.saldoDispuesto || 0) - monto;
      fo.saldo = fo.saldoDispuesto;
      fo.disponibleFondeo = (fo.limite || fo.monto) - fo.saldoDispuesto;
      if (!fo.disposiciones) fo.disposiciones = [];
      fo.disposiciones.push({ fecha: fecha, monto: monto, tipo: 'pago', saldo: fo.saldoDispuesto, id: Date.now() });
      return fo;
    });
    setStore('fondeos', fondeos);

    var contab = getStore('contabilidad');
    contab.push({
      id: nextId('contabilidad'), fecha: fecha, tipo: 'pago_fondeo',
      concepto: 'Pago Fondeo CC ' + f.numero + ' — ' + fmt(monto),
      monto: monto, cuentaDebe: '2101', cuentaHaber: '1101',
      referencia: f.numero, createdAt: new Date().toISOString()
    });
    setStore('contabilidad', contab);

    addAudit('Pago Fondeo CC', 'Fondeos', f.numero + ': ' + fmt(monto));
    toast('Pago a fondeo registrado: ' + fmt(monto), 'success');
    renderFondeos();
    refreshNotifications();
  });
}

