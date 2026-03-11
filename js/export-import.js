// ====== MODULE: export-import.js ======
// exportarDatos(), exportarBackupExcel(), renderBackupStatus(), importarDatos(), resetDatos(), editarTipoCambio(), guardarTipoCambio()

// ============================================================
//  EXPORT DATA
// ============================================================
function exportarDatos() {
  if (!hasPermiso('admin', 'backup')) return toast('Sin permiso para exportar datos', 'error');
  const data = { _meta: { version: '2.0', fecha: new Date().toISOString(), app: 'AP Fondos', stores: STORE_KEYS.length } };
  // Sprint W: Exportar TODOS los stores
  STORE_KEYS.forEach(k => { data[k] = getStore(k); });
  // También exportar stores legacy
  ['documentos','cierres_contables'].forEach(k => { var d = getStore(k); if (d && d.length) data[k] = d; });
  data._meta.efectivo = localStorage.getItem('ap_efectivo') || '500000';
  data._meta.lastBackup = localStorage.getItem('ap_last_backup_date') || null;

  // Estadísticas del respaldo
  var stats = {};
  STORE_KEYS.forEach(k => { stats[k] = (data[k] || []).length; });
  data._meta.stats = stats;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'AP_Fondos_Backup_' + new Date().toISOString().split('T')[0] + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  localStorage.setItem('ap_last_backup_date', new Date().toISOString());
  toast('Respaldo JSON completo exportado (' + STORE_KEYS.length + ' colecciones)', 'success');
  addAudit('Exportar', 'Sistema', 'Backup completo JSON — ' + Object.values(stats).reduce(function(s,v){return s+v},0) + ' registros');
  logSecurityEvent('backup_exportado', 'Backup completo exportado');
}

// Sprint W: Backup multi-hoja Excel
function exportarBackupExcel() {
  if (!hasPermiso('admin', 'backup')) return toast('Sin permiso para exportar datos', 'error');
  var wb = XLSX.utils.book_new();
  var totalRegs = 0;

  STORE_KEYS.forEach(function(key) {
    var datos = getStore(key);
    if (!datos || datos.length === 0) return;
    totalRegs += datos.length;

    // Aplanar objetos anidados para Excel
    var flat = datos.map(function(item) {
      var row = {};
      Object.keys(item).forEach(function(k) {
        var val = item[k];
        if (val === null || val === undefined) row[k] = '';
        else if (Array.isArray(val)) row[k] = JSON.stringify(val);
        else if (typeof val === 'object') row[k] = JSON.stringify(val);
        else row[k] = val;
      });
      return row;
    });

    var ws = XLSX.utils.json_to_sheet(flat);
    // Nombre de hoja (máx 31 caracteres)
    var sheetName = key.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // Hoja resumen
  var resumen = STORE_KEYS.map(function(k) {
    return { 'Colección': k, 'Registros': (getStore(k) || []).length };
  });
  resumen.push({ 'Colección': 'TOTAL', 'Registros': totalRegs });
  resumen.push({ 'Colección': 'Fecha backup', 'Registros': new Date().toLocaleString('es-MX') });
  resumen.push({ 'Colección': 'Versión', 'Registros': '2.0' });
  var wsResumen = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsResumen, '_Resumen');

  XLSX.writeFile(wb, 'AP_Fondos_Backup_' + new Date().toISOString().split('T')[0] + '.xlsx');
  localStorage.setItem('ap_last_backup_date', new Date().toISOString());
  toast('Backup Excel exportado (' + totalRegs + ' registros en ' + STORE_KEYS.length + ' hojas)', 'success');
  addAudit('Exportar', 'Sistema', 'Backup Excel multi-hoja — ' + totalRegs + ' registros');
  logSecurityEvent('backup_exportado', 'Backup Excel exportado');
}

// Sprint W: Indicador visual de estado de respaldo
function renderBackupStatus() {
  var bar = document.getElementById('backupStatusBar');
  if (!bar) return;
  var lastBackup = localStorage.getItem('ap_last_backup_date');
  var totalRegs = STORE_KEYS.reduce(function(s, k) { return s + (getStore(k) || []).length; }, 0);

  if (!lastBackup) {
    bar.innerHTML = '<div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px">' +
      '<span style="font-size:24px">⚠️</span><div style="flex:1"><strong style="color:#991B1B">Sin respaldo</strong><p style="margin:4px 0 0;font-size:12px;color:#B91C1C">Nunca se ha realizado un respaldo. Se recomienda exportar una copia de seguridad.</p></div>' +
      '<div style="text-align:right;font-size:12px;color:var(--text-muted)">' + totalRegs + ' registros<br>' + STORE_KEYS.length + ' colecciones</div></div>';
    return;
  }

  var diasDesde = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
  var fechaStr = new Date(lastBackup).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var estado, color, bgColor, borderColor;
  if (diasDesde <= 1) { estado = 'Actualizado'; color = '#065F46'; bgColor = '#D1FAE5'; borderColor = '#A7F3D0'; }
  else if (diasDesde <= 7) { estado = 'Reciente (' + diasDesde + ' días)'; color = '#92400E'; bgColor = '#FEF3C7'; borderColor = '#FDE68A'; }
  else { estado = 'Desactualizado (' + diasDesde + ' días)'; color = '#991B1B'; bgColor = '#FEE2E2'; borderColor = '#FECACA'; }

  bar.innerHTML = '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px">' +
    '<span style="font-size:24px">💾</span><div style="flex:1"><strong style="color:' + color + '">Respaldo: ' + estado + '</strong><p style="margin:4px 0 0;font-size:12px;color:' + color + '">Último: ' + fechaStr + '</p></div>' +
    '<div style="text-align:right;font-size:12px;color:var(--text-muted)">' + totalRegs + ' registros<br>' + STORE_KEYS.length + ' colecciones</div></div>';
}

function importarDatos(input) {
  if (!hasPermiso('admin', 'backup')) return toast('Sin permiso para importar datos', 'error');
  const file = input.files[0];
  if (!file) return;
  // Bug #49: Validar archivo antes de procesar
  const validacion = validarArchivo(file, 'backup');
  if (!validacion.ok) { toast(validacion.error, 'error'); input.value = ''; return; }
  logSecurityEvent('backup_importado', 'Importando: ' + file.name + ' (' + (file.size / 1024).toFixed(0) + 'KB)');

  showConfirm('Importar datos', '¿Reemplazar todos los datos actuales con el archivo "' + esc(file.name) + '"? Se recomienda exportar un backup antes.', 'Sí, importar').then(ok => {
    if (!ok) { input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        // Sprint W: Importar TODOS los stores (compatible con v1.0 y v2.0)
        const validKeys = STORE_KEYS.concat(['documentos','cierres_contables']);
        let imported = 0;
        validKeys.forEach(k => {
          if (data[k] && Array.isArray(data[k])) { setStore(k, data[k]); imported++; }
        });
        if (data._meta && data._meta.efectivo) localStorage.setItem('ap_efectivo', data._meta.efectivo);
        if (imported === 0) return toast('Archivo no contiene datos válidos de AP Fondos', 'error');
        addAudit('Importar', 'Sistema', file.name + ' (' + imported + ' colecciones)');
        toast('Datos importados (' + imported + ' colecciones). Recargando...', 'success');
        setTimeout(() => location.reload(), 1500);
      } catch(err) { toast('Error al importar: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    input.value = '';
  });
}

// Bug #39: Funciones de efectivo editable
function guardarEfectivo() {
  const val = parseFloat((document.getElementById('dashEfectivo').value || '0').replace(/,/g, '')) || 0;
  localStorage.setItem('ap_efectivo', val.toString());
}
function cargarEfectivo() {
  const el = document.getElementById('dashEfectivo');
  if (el) {
    const raw = parseFloat(localStorage.getItem('ap_efectivo') || '500000');
    setInputMiles('dashEfectivo', raw);
  }
}

function resetDatos() {
  showConfirm('Resetear todos los datos', 'Se borrarán todos los registros. ¿Continuar?', 'Sí, resetear').then(ok => {
    if (!ok) return;
    STORE_KEYS.concat(['documentos','cierres_contables']).forEach(k => localStorage.removeItem('apf_' + k));
    toast('Datos reseteados. Recargando...', 'warning');
    setTimeout(() => location.reload(), 1000);
  });
}
