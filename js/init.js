// ====== MODULE: init.js ======
// DOMContentLoaded initialization sequence

// ============================================================
//  INIT
// ============================================================
document.getElementById('currentDate').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
initData();
// FIX QA 2026-04-16: sanar datos existentes una sola vez (DBs previas al fix del seed)
try {
  if (typeof sanarCreditos === 'function' && !localStorage.getItem('ap_sanacion_v1_done')) {
    const resultado = sanarCreditos();
    localStorage.setItem('ap_sanacion_v1_done', new Date().toISOString());
    if (resultado.conCambios > 0 && typeof console !== 'undefined') {
      console.log('[Sanación QA 2026-04-16] Créditos corregidos:', resultado.conCambios, 'de', resultado.totalCreditos);
      console.table(resultado.cambios);
    }
  }
} catch (e) { console.warn('Sanación falló:', e && e.message); }
loadSession();
restaurarFiltros();
renderDashboard();
checkStorageUsage();
// Sprint I: Inicializar notificaciones
refreshNotifications();
// Sprint M: Inicializar badge de aprobaciones
updateApprovalsBadge();
// Sprint J: Inicializar UX avanzada
initDarkMode();
initScrollTopBtn();
// Bug #50: Verificar si hay backup reciente
setTimeout(checkAutoBackupReminder, 3000);
