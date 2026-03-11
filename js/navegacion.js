// ====== MODULE: navegacion.js ======
// showPage() function and navigation logic

// ============================================================
//  NAVIGATION
// ============================================================
function showPage(page) {
  // Mejora 9: Verificar formularios abiertos con cambios sin guardar
  for (var mi = 0; mi < _MODALES_RASTREADOS.length; mi++) {
    var mid = _MODALES_RASTREADOS[mi];
    var mel = document.getElementById(mid);
    if (mel && mel.classList.contains('active') && _checkDirty(mid)) {
      if (!confirm('Tienes un formulario con cambios sin guardar. ¿Seguro que deseas cambiar de página?')) return;
      _forceCloseModal(mid);
      break;
    }
  }
  if (!hasPermiso(page, 'ver')) return toast('Sin permiso para acceder a ' + (PERMISOS_MODULOS[page]?.label || page), 'error');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  const titles = { dashboard: 'Dashboard — Valuación Diaria', clientes: 'Expediente de Clientes', creditos: 'Gestión de Créditos', pagos: 'Registro de Pagos', cotizador: 'Cotizador Financiero', fondeos: 'Control de Fondeos', contabilidad: 'Contabilidad', reportes: 'Reportes Avanzados', calendario: 'Calendario de Cobranza', aprobaciones: 'Flujos de Aprobación', conciliacion: 'Conciliación Bancaria', admin: 'Administración' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (page === 'dashboard') renderDashboard();
  else if (page === 'clientes') renderClientes();
  else if (page === 'creditos') renderCreditos();
  else if (page === 'pagos') { populatePagoSelect(); renderAllPagos(); }
  else if (page === 'fondeos') renderFondeos();
  else if (page === 'contabilidad') renderContabilidad();
  else if (page === 'reportes') renderReporteCartera();
  else if (page === 'calendario') renderCalendario();
  else if (page === 'aprobaciones') renderAprobaciones();
  else if (page === 'conciliacion') renderConciliacion();
  else if (page === 'admin') { renderUsuarios(); renderAuditoria(); }
}

