// ====== MODULE: init.js ======
// DOMContentLoaded initialization sequence

// ============================================================
//  INIT
// ============================================================
document.getElementById('currentDate').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
initData();
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
