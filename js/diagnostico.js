// ====== MODULE: diagnostico.js ======
// Auto-backup, diagnóstico de datos, log de errores, actividad reciente, utilidades varias

// ============================================================
//  CONSTANTES
// ============================================================
var APP_ERROR_LOG = [];
var AUTO_BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutos
var AUTO_BACKUP_KEY = EMPRESA.sessionPrefix + 'auto_backup';
var AUTO_BACKUP_DATE_KEY = EMPRESA.sessionPrefix + 'auto_backup_date';
var autoBackupTimer = null;
var _reestructCreditoId = null;

// ============================================================
//  AUTO-BACKUP
// ============================================================
function realizarAutoBackup() {
  try {
    var data = { _meta: { version: '2.0', fecha: new Date().toISOString(), app: EMPRESA.backupLabel, tipo: 'auto', stores: STORE_KEYS.length } };
    STORE_KEYS.forEach(function(k) { data[k] = getStore(k); });
    var efectivo = localStorage.getItem(EMPRESA.sessionPrefix + 'efectivo');
    if (efectivo) data._meta.efectivo = efectivo;
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(data));
    localStorage.setItem(AUTO_BACKUP_DATE_KEY, new Date().toISOString());
  } catch (e) {
    console.warn('Auto-backup falló:', e.message);
  }
}

function iniciarAutoBackup() {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  realizarAutoBackup();
  autoBackupTimer = setInterval(realizarAutoBackup, AUTO_BACKUP_INTERVAL);
}

function getAutoBackupInfo() {
  var fecha = localStorage.getItem(AUTO_BACKUP_DATE_KEY);
  var raw = localStorage.getItem(AUTO_BACKUP_KEY);
  if (!fecha || !raw) return null;
  return { fecha: fecha, size: (raw.length / 1024).toFixed(1) + ' KB' };
}

function restaurarAutoBackup() {
  var raw = localStorage.getItem(AUTO_BACKUP_KEY);
  if (!raw) return toast('No hay auto-backup disponible', 'info');
  var fecha = localStorage.getItem(AUTO_BACKUP_DATE_KEY) || 'desconocida';
  showConfirm('Restaurar Auto-Backup',
    'Se restaurará el auto-backup del:\n' + new Date(fecha).toLocaleString('es-MX') +
    '\n\nEsto sobrescribirá TODOS los datos actuales.\n¿Deseas continuar?',
    'Sí, restaurar').then(function(ok) {
    if (!ok) return;
    try {
      var data = JSON.parse(raw);
      var imported = 0;
      STORE_KEYS.forEach(function(k) {
        if (data[k]) { setStore(k, data[k]); imported++; }
      });
      if (data._meta && data._meta.efectivo) localStorage.setItem(EMPRESA.sessionPrefix + 'efectivo', data._meta.efectivo);
      addAudit('Restaurar', 'Auto-Backup', imported + ' colecciones restauradas');
      toast('Auto-backup restaurado exitosamente (' + imported + ' colecciones)', 'success');
      renderDashboard();
    } catch (e) {
      toast('Error al restaurar: ' + e.message, 'error');
    }
  });
}

// ============================================================
//  DIAGNÓSTICO DE DATOS
// ============================================================
function diagnosticarDatos() {
  var problemas = [];
  var advertencias = [];
  var stats = {};

  var clientes = getStore('clientes');
  var creditos = getStore('creditos');
  var pagos = getStore('pagos');
  var fondeos = getStore('fondeos');
  var contabilidad = getStore('contabilidad');
  var usuarios = getStore('usuarios');

  stats.clientes = clientes.length;
  stats.creditos = creditos.length;
  stats.pagos = pagos.length;
  stats.fondeos = fondeos.length;
  stats.contabilidad = contabilidad.length;
  stats.usuarios = usuarios.length;

  var clienteIds = new Set(clientes.map(function(c) { return c.id; }));
  creditos.forEach(function(cr) {
    if (!clienteIds.has(cr.clienteId)) {
      problemas.push({ nivel: 'error', modulo: 'Créditos', msg: 'Crédito ' + cr.numero + ' referencia cliente inexistente (ID ' + cr.clienteId + ')' });
    }
  });

  var creditoIds = new Set(creditos.map(function(c) { return c.id; }));
  pagos.forEach(function(p) {
    if (!creditoIds.has(p.creditoId)) {
      problemas.push({ nivel: 'error', modulo: 'Pagos', msg: 'Pago del ' + (p.fecha || '?') + ' referencia crédito inexistente (ID ' + p.creditoId + ')' });
    }
  });

  creditos.forEach(function(cr) {
    if (cr.saldo < -0.01) {
      problemas.push({ nivel: 'error', modulo: 'Créditos', msg: 'Crédito ' + cr.numero + ' tiene saldo negativo: $' + cr.saldo.toFixed(2) });
    }
  });
  fondeos.forEach(function(f) {
    if (f.saldo < -0.01) {
      problemas.push({ nivel: 'error', modulo: 'Fondeos', msg: 'Fondeo ' + f.numero + ' tiene saldo negativo: $' + f.saldo.toFixed(2) });
    }
  });

  creditos.forEach(function(cr) {
    if (cr.estado === 'vigente' && cr.saldo <= 0 && !cr.esRevolvente) {
      advertencias.push({ nivel: 'warn', modulo: 'Créditos', msg: 'Crédito ' + cr.numero + ' está vigente pero saldo es $0 (debería liquidarse)' });
    }
  });

  clientes.forEach(function(cl) {
    if (!cl.rfc || cl.rfc.trim() === '') {
      advertencias.push({ nivel: 'warn', modulo: 'Clientes', msg: 'Cliente "' + cl.nombre + '" no tiene RFC registrado' });
    }
  });

  var hoy = new Date();
  fondeos.forEach(function(f) {
    if (f.estado === 'vigente' && new Date(f.fechaVencimiento) < hoy) {
      advertencias.push({ nivel: 'warn', modulo: 'Fondeos', msg: 'Fondeo ' + f.numero + ' vencido (' + f.fechaVencimiento + ') pero marcado vigente' });
    }
  });

  ['clientes', 'creditos', 'pagos', 'fondeos'].forEach(function(store) {
    var items = getStore(store);
    var ids = {};
    items.forEach(function(item) {
      if (ids[item.id]) {
        problemas.push({ nivel: 'error', modulo: store, msg: 'ID duplicado: ' + item.id });
      }
      ids[item.id] = true;
    });
  });

  creditos.forEach(function(cr) {
    if (cr.esRevolvente && cr.limite) {
      var diff = Math.abs((cr.saldo + cr.disponible) - cr.limite);
      if (diff > 0.02) {
        problemas.push({ nivel: 'error', modulo: 'Créditos CC', msg: cr.numero + ': saldo(' + cr.saldo + ') + disponible(' + cr.disponible + ') != límite(' + cr.limite + ')' });
      }
    }
  });

  var totalSize = 0;
  STORE_KEYS.forEach(function(k) {
    var raw = localStorage.getItem(EMPRESA.storagePrefix + k);
    if (raw) totalSize += raw.length;
  });
  stats.storageKB = (totalSize / 1024).toFixed(1);
  stats.storagePct = ((totalSize / (5 * 1024 * 1024)) * 100).toFixed(1);

  return { problemas: problemas, advertencias: advertencias, stats: stats };
}

function validarIntegridadInicio() {
  var d = diagnosticarDatos();
  if (d.problemas.length > 0) {
    var errBadge = document.getElementById('errorBadge');
    if (errBadge) { errBadge.textContent = d.problemas.length; errBadge.style.display = 'inline-block'; }
    console.warn('[' + EMPRESA.backupLabel + '] Se detectaron ' + d.problemas.length + ' problemas de integridad al iniciar.');
    d.problemas.forEach(function(p) { console.warn('  [' + p.modulo + '] ' + p.msg); });
    toast('Se detectaron ' + d.problemas.length + ' problemas de datos. Revise Diagnóstico en Admin.', 'error');
  }
}

function verDiagnostico() {
  var d = diagnosticarDatos();
  var backup = getAutoBackupInfo();
  var esSoporte = currentUser && currentUser.rol === 'soporte';

  function sanitizarMsg(msg) {
    if (!esSoporte) return msg;
    return msg.replace(/\$[\d,.]+/g, '$***').replace(/"[^"]+"/g, '"***"').replace(/Cliente "[^"]*"/g, 'Cliente "***"');
  }

  var html = '<div style="max-height:500px;overflow:auto">';
  html += '<div class="kpi-grid" style="margin-bottom:16px">';
  html += '<div class="kpi-card navy"><div class="kpi-label">Clientes</div><div class="kpi-value">' + d.stats.clientes + '</div></div>';
  html += '<div class="kpi-card blue"><div class="kpi-label">Créditos</div><div class="kpi-value">' + d.stats.creditos + '</div></div>';
  html += '<div class="kpi-card green"><div class="kpi-label">Pagos</div><div class="kpi-value">' + d.stats.pagos + '</div></div>';
  html += '<div class="kpi-card orange"><div class="kpi-label">Fondeos</div><div class="kpi-value">' + d.stats.fondeos + '</div></div>';
  html += '<div class="kpi-card ' + (parseFloat(d.stats.storagePct) > 80 ? 'red' : 'green') + '"><div class="kpi-label">Almacenamiento</div><div class="kpi-value">' + d.stats.storageKB + ' KB</div><div class="kpi-sub">' + d.stats.storagePct + '% usado</div></div>';
  html += '<div class="kpi-card ' + (backup ? 'green' : 'red') + '"><div class="kpi-label">Último Auto-Backup</div><div class="kpi-value" style="font-size:14px">' + (backup ? new Date(backup.fecha).toLocaleString('es-MX') : 'Ninguno') + '</div>' + (backup ? '<div class="kpi-sub">' + backup.size + '</div>' : '') + '</div>';
  html += '</div>';

  if (d.problemas.length > 0) {
    html += '<h4 style="color:var(--red);margin-bottom:8px">Errores (' + d.problemas.length + ')</h4>';
    html += '<div style="background:#FEF2F2;border-radius:8px;padding:12px;margin-bottom:12px">';
    d.problemas.forEach(function(p) {
      html += '<div style="font-size:12px;margin-bottom:4px"><span class="badge badge-red">' + p.modulo + '</span> ' + sanitizarMsg(p.msg) + '</div>';
    });
    html += '</div>';
  }

  if (d.advertencias.length > 0) {
    html += '<h4 style="color:#D97706;margin-bottom:8px">Advertencias (' + d.advertencias.length + ')</h4>';
    html += '<div style="background:#FFFBEB;border-radius:8px;padding:12px;margin-bottom:12px">';
    d.advertencias.forEach(function(a) {
      html += '<div style="font-size:12px;margin-bottom:4px"><span class="badge badge-yellow">' + sanitizarMsg(a.msg) + '</span></div>';
    });
    html += '</div>';
  }

  if (d.problemas.length === 0 && d.advertencias.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:#059669;font-weight:600;font-size:16px">✓ Todos los datos están íntegros</div>';
  }
  html += '</div>';

  var footerBtns = '';
  if (!currentUser || currentUser.rol !== 'soporte') {
    footerBtns += '<button class="btn btn-primary btn-sm" onclick="restaurarAutoBackup()">Restaurar Auto-Backup</button> ';
    footerBtns += '<button class="btn btn-outline btn-sm" onclick="exportarDatos()">Exportar Backup Manual</button> ';
  }
  footerBtns += '<button class="btn btn-outline btn-sm" onclick="exportarDiagnosticoTexto()">📋 Copiar Reporte</button>';

  showModal('Diagnóstico del Sistema', html, footerBtns);
}

function exportarDiagnosticoTexto() {
  var d = diagnosticarDatos();
  var backup = getAutoBackupInfo();
  var lineas = [];
  lineas.push('═══ REPORTE DE DIAGNÓSTICO ═══');
  lineas.push('Empresa: ' + EMPRESA.nombre);
  lineas.push('Fecha: ' + new Date().toLocaleString('es-MX'));
  lineas.push('Versión: ' + EMPRESA.version);
  lineas.push('');
  lineas.push('── ESTADÍSTICAS ──');
  lineas.push('Clientes: ' + d.stats.clientes);
  lineas.push('Créditos: ' + d.stats.creditos);
  lineas.push('Pagos: ' + d.stats.pagos);
  lineas.push('Fondeos: ' + d.stats.fondeos);
  lineas.push('Almacenamiento: ' + d.stats.storageKB + ' KB (' + d.stats.storagePct + '%)');
  lineas.push('Último auto-backup: ' + (backup ? new Date(backup.fecha).toLocaleString('es-MX') + ' (' + backup.size + ')' : 'Ninguno'));
  lineas.push('');
  if (d.problemas.length > 0) {
    lineas.push('── ERRORES (' + d.problemas.length + ') ──');
    d.problemas.forEach(function(p, i) {
      var msgLimpio = p.msg.replace(/\$[\d,.]+/g, '$***').replace(/"[^"]+"/g, '"***"');
      lineas.push((i + 1) + '. [' + p.modulo + '] ' + msgLimpio);
    });
    lineas.push('');
  }
  if (d.advertencias.length > 0) {
    lineas.push('── ADVERTENCIAS (' + d.advertencias.length + ') ──');
    d.advertencias.forEach(function(a, i) {
      var msgLimpio = a.msg.replace(/\$[\d,.]+/g, '$***').replace(/"[^"]+"/g, '"***"');
      lineas.push((i + 1) + '. ' + msgLimpio);
    });
    lineas.push('');
  }
  if (d.problemas.length === 0 && d.advertencias.length === 0) {
    lineas.push('✓ TODOS LOS DATOS ESTÁN ÍNTEGROS');
    lineas.push('');
  }
  lineas.push('═══ FIN DEL REPORTE ═══');
  var texto = lineas.join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(texto).then(function() {
      toast('Reporte copiado al portapapeles', 'success');
    }).catch(function() { toast('No se pudo copiar al portapapeles', 'error'); });
  }
}

// ============================================================
//  LOG DE ERRORES
// ============================================================
function actualizarBadgeErrores() {
  var badge = document.getElementById('errorBadge');
  if (!badge) return;
  var count = APP_ERROR_LOG.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function verLogErrores() {
  var html = '<div style="max-height:400px;overflow:auto">';
  if (APP_ERROR_LOG.length === 0) {
    html += '<p style="text-align:center;color:#999;padding:20px">Sin errores registrados en esta sesión</p>';
  } else {
    html += '<table><thead><tr><th>Hora</th><th>Tipo</th><th>Mensaje</th><th>Línea</th></tr></thead><tbody>';
    APP_ERROR_LOG.slice().reverse().forEach(function(e) {
      var hora = e.ts ? e.ts.split('T')[1].split('.')[0] : '-';
      html += '<tr style="font-size:11px"><td>' + hora + '</td><td><span class="badge ' +
        (e.tipo === 'error' ? 'badge-red' : 'badge-yellow') + '">' + e.tipo + '</span></td>' +
        '<td title="' + (e.stack || '').replace(/"/g, '&quot;') + '">' + (e.msg || '').substring(0, 80) + '</td>' +
        '<td>' + (e.linea || '-') + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  showModal('Log de Errores (' + APP_ERROR_LOG.length + ')', html,
    '<button class="btn btn-outline btn-sm" onclick="APP_ERROR_LOG=[];actualizarBadgeErrores();toast(\'Log limpiado\',\'success\');closeModal(\'modalGenerico\')">Limpiar Log</button>');
}

// ============================================================
//  MODAL GENÉRICO (showModal)
// ============================================================
function showModal(titulo, body, footerExtra) {
  var m = document.getElementById('modalGenerico');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modalGenerico';
    m.className = 'modal-backdrop';
    m.innerHTML = '<div class="modal" style="max-width:700px"><div class="modal-header"><h3 id="modalGenTitulo"></h3><button class="btn btn-outline" onclick="closeModal(\'modalGenerico\')">✕</button></div><div class="modal-body" id="modalGenBody"></div><div class="modal-footer" id="modalGenFooter"></div></div>';
    document.body.appendChild(m);
  }
  document.getElementById('modalGenTitulo').textContent = titulo;
  document.getElementById('modalGenBody').innerHTML = body;
  document.getElementById('modalGenFooter').innerHTML = (footerExtra || '') +
    ' <button class="btn btn-outline btn-sm" onclick="closeModal(\'modalGenerico\')">Cerrar</button>';
  m.classList.add('active');
}

// ============================================================
//  ACTIVIDAD RECIENTE
// ============================================================
function getActividadReciente(limite) {
  var bitacora = getStore('bitacora');
  var creditos = getStore('creditos');
  return bitacora.sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, limite || 10).map(function(n) {
    var cat = BITACORA_CATEGORIAS[n.categoria] || BITACORA_CATEGORIAS.nota;
    var cred = creditos.find(function(c) { return c.id === n.creditoId; });
    return {
      icon: cat.icon,
      texto: cat.label + ' — ' + (cred ? cred.numero : 'Crédito #' + n.creditoId),
      comentario: n.comentario.length > 60 ? n.comentario.substring(0, 60) + '...' : n.comentario,
      usuario: n.usuario, fecha: n.createdAt, creditoId: n.creditoId, prioridad: n.prioridad
    };
  });
}

function renderActividadRecienteHTML() {
  var actividad = getActividadReciente(8);
  if (actividad.length === 0) return '';
  var html = '<div class="card" style="margin-top:20px">';
  html += '<div class="card-header"><span class="card-title">📋 Actividad Reciente (Bitácora)</span></div>';
  actividad.forEach(function(a) {
    var fecha = new Date(a.fecha);
    var fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    var priorColor = a.prioridad === 'urgente' ? '#EF4444' : a.prioridad === 'alta' ? '#F59E0B' : 'var(--text-muted)';
    html += '<div style="padding:8px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;cursor:pointer" onclick="showPage(\'creditos\');setTimeout(function(){verCredito(' + a.creditoId + ')},200)">';
    html += '<span style="font-size:18px">' + a.icon + '</span>';
    html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500">' + esc(a.texto) + '</div><div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.comentario) + '</div></div>';
    html += '<div style="text-align:right;white-space:nowrap"><div style="font-size:11px;color:var(--text-muted)">' + fechaStr + '</div><div style="font-size:11px;color:' + priorColor + '">' + esc(a.usuario) + '</div></div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderDashboardAlertas() {
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var hoy = new Date();
  var alertas = [];
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    if ((c.diasMora || 0) > 30) {
      alertas.push({ icon: '🔴', text: esc(c.numero) + ': ' + c.diasMora + ' días mora — ' + fmt(c.saldo) });
    }
  });
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    if (f.fechaVencimiento) {
      var dias = Math.floor((new Date(f.fechaVencimiento) - hoy) / 86400000);
      if (dias <= 15) alertas.push({ icon: '⚠️', text: 'Fondeo ' + esc(f.numero) + ' vence en ' + dias + ' días' });
    }
  });
  var el = document.getElementById('dashAlertas');
  if (!el) return;
  if (alertas.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:var(--green);padding:16px">✅ Sin alertas urgentes</div>';
    return;
  }
  el.innerHTML = alertas.slice(0, 5).map(function(a) {
    return '<div style="padding:8px 12px;border-bottom:1px solid var(--gray-200);font-size:13px">' + a.icon + ' ' + a.text + '</div>';
  }).join('') + (alertas.length > 5 ? '<div style="padding:8px;text-align:center"><a onclick="showPage(\'reportes\');setTimeout(function(){setReporteTab(\'alertas\')},100)" style="cursor:pointer;color:var(--blue)">Ver todas (' + alertas.length + ')</a></div>' : '');
}

// ============================================================
//  UTILIDADES VARIAS
// ============================================================
function parseMilesVal(str) {
  if (typeof str === 'number') return str;
  return parseFloat((str || '0').replace(/,/g, '')) || 0;
}

function eliminarCliente(id) {
  if (!hasPermiso('clientes', 'eliminar')) return toast('Sin permiso para eliminar clientes', 'error');
  var c = getStore('clientes').find(function(x) { return x.id === id; });
  var creds = getStore('creditos').filter(function(cr) { return cr.clienteId === id && cr.estado !== 'liquidado'; });
  if (creds.length > 0) { toast('No se puede eliminar: tiene ' + creds.length + ' crédito(s) activo(s)', 'error'); return; }
  showConfirm('Eliminar cliente', '¿Eliminar a ' + (c ? esc(c.nombre) : '') + '? Esta acción no se puede deshacer.', 'Sí, eliminar').then(function(ok) {
    if (!ok) return;
    var datosAntes = c ? JSON.parse(JSON.stringify(c)) : null;
    var clientes = getStore('clientes').filter(function(x) { return x.id !== id; });
    setStore('clientes', clientes);
    addAudit('Eliminar', 'Clientes', c ? c.nombre : '', datosAntes, null);
    toast('Cliente eliminado', 'warning');
    renderClientes();
    var panel = document.getElementById('expedientePanel');
    if (panel) panel.style.display = 'none';
  });
}

function eliminarFondeo(id) {
  if (!hasPermiso('fondeos', 'eliminar')) return toast('Sin permiso para eliminar fondeos', 'error');
  var f = getStore('fondeos').find(function(x) { return x.id === id; });
  if (!f) return;
  if (f.saldoDispuesto > 0 || f.saldo > 0) {
    return toast('No se puede eliminar: fondeo tiene saldo pendiente (' + fmt(f.saldo || f.saldoDispuesto) + ')', 'error');
  }
  var contaRelacionados = getStore('contabilidad').filter(function(r) { return r.detalle && r.detalle.includes(f.numero); });
  var advertencia = contaRelacionados.length > 0 ? '\n\n⚠️ Tiene ' + contaRelacionados.length + ' registro(s) contable(s) asociados.' : '';
  showConfirm('Eliminar fondeo', '¿Eliminar fondeo ' + esc(f.numero) + '?' + advertencia, 'Sí, eliminar').then(function(ok) {
    if (!ok) return;
    var datosAntes = JSON.parse(JSON.stringify(f));
    var fondeos = getStore('fondeos').filter(function(x) { return x.id !== id; });
    setStore('fondeos', fondeos);
    var contab = getStore('contabilidad').filter(function(e) { return e.fondeoId !== id; });
    setStore('contabilidad', contab);
    addAudit('Eliminar', 'Fondeos', f.numero, datosAntes, null);
    toast('Fondeo eliminado', 'warning');
    renderFondeos();
    var panel = document.getElementById('fondeoDetPanel');
    if (panel) panel.style.display = 'none';
  });
}

// Devengo periódico de intereses
function ejecutarDevengoPeriodico() {
  if (!hasPermiso('contabilidad', 'crear')) return toast('Sin permiso', 'error');
  var creditos = getStore('creditos');
  var contab = getStore('contabilidad');
  var hoy = new Date().toISOString().split('T')[0];
  var periodo = hoy.substring(0, 7);
  var yaDevengado = contab.some(function(r) { return r.tipo === 'devengo_intereses' && r.fecha && r.fecha.startsWith(periodo); });
  if (yaDevengado) return toast('Ya se ejecutó el devengo para ' + periodo, 'info');
  var entries = [];
  var cid = nextId('contabilidad');
  var totalDevengo = 0;
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    var amort = c.amortizacion || [];
    var intDevengado = 0;
    for (var i = 0; i < amort.length; i++) {
      var cuota = amort[i];
      var fCuota = cuota.fecha || '';
      if (!cuota.pagado && fCuota && fCuota <= hoy) {
        intDevengado += (cuota.interes || 0);
      }
    }
    if (intDevengado > 0) {
      var esArrend = c.tipo === 'arrendamiento';
      entries.push({
        id: cid++, fecha: hoy, tipo: 'devengo_intereses',
        concepto: 'Devengo intereses ' + c.numero + ' (' + periodo + ')',
        monto: +intDevengado.toFixed(2),
        cuentaDebe: esArrend ? '1204' : '1203', cuentaHaber: esArrend ? '4103' : '4101',
        creditoId: c.id, referencia: 'DEVENGO-' + periodo, createdAt: new Date().toISOString()
      });
      totalDevengo += intDevengado;
    }
  });
  if (entries.length === 0) return toast('No hay intereses pendientes de devengar', 'info');
  showConfirm('Devengo Periódico', 'Se reconocerán ' + fmt(totalDevengo) + ' en intereses devengados no cobrados (' + entries.length + ' créditos).\n\n¿Proceder?', 'Sí, ejecutar devengo').then(function(ok) {
    if (!ok) return;
    var txContab = getStore('contabilidad');
    entries.forEach(function(e) { txContab.push(e); });
    setStore('contabilidad', txContab);
    addAudit('Devengo Periódico', 'Contabilidad', periodo + ': ' + fmt(totalDevengo) + ' (' + entries.length + ' créditos)');
    toast('Devengo registrado: ' + fmt(totalDevengo), 'success');
    renderContabilidad();
  });
}
