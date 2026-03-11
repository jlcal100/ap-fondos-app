//  PLD — PREVENCIÓN DE LAVADO DE DINERO Y FINANCIAMIENTO AL TERRORISMO
//  Marco regulatorio: LFPIORPI (Ley Federal para la Prevención e Identificación
//    de Operaciones con Recursos de Procedencia Ilícita)
//  Actividad vulnerable: Art. 17 Fracc. IV — Otorgamiento de préstamos o créditos
//  Portal de avisos: SAT SPPLD (https://sppld.sat.gob.mx)
//  Plazo de avisos: Día 17 del mes siguiente (Art. 23 LFPIORPI)
//  Conservación documental: 10 años mínimo (Art. 18 LFPIORPI)
// ============================================================
// Umbrales por defecto (configurables) — Basados en UMA 2026
var PLD_CONFIG_DEFAULTS = {
  valorUMA: 117.31,              // UMA diaria 2026 (vigente 01-feb-2026 al 31-ene-2027, INEGI)
  umbralAviso: 188283,           // 1,605 UMAs = ~$188,283 MXN (Art. 17 fracc. IV LFPIORPI)
  umbralIdentificacion: 0,       // Siempre requerido (sin mínimo para Art. 17 fracc. IV)
  umbralEfectivo: 188283,        // Monitoreo interno: operaciones en efectivo (Art. 32 no aplica a fracc. IV)
  umbralInusual: 200,            // 200% del promedio histórico del cliente
  diasFraccionamiento: 5,        // Ventana para detectar fraccionamiento
  umbralAcumEfectivo30d: 500000, // Acumulado en efectivo 30 días por cliente
  // Plazos regulatorios (referencia)
  plazoAvisoMensual: 17,         // Día 17 del mes siguiente (Art. 23 LFPIORPI)
  plazo24h: 24,                  // Horas para aviso urgente por indicios ilícitos (Reforma jul-2025)
  conservacionAnios: 10,         // Años de conservación documental (Art. 18 LFPIORPI)
  oficial: '',
  razonSocial: EMPRESA.razonSocial,
  clavePortalSPPLD: ''           // Clave del Portal de Prevención SAT
};

var PLD_CATEGORIAS = {
  relevante:     { label: 'Aviso (Art.17 IV)',            icon: '🔴', color: '#EF4444', desc: 'Supera umbral de aviso LFPIORPI (1,605 UMAs)', plazo: 'Mensual — día 17 del mes siguiente' },
  inusual:       { label: 'Operación Inusual',            icon: '🟠', color: '#F59E0B', desc: 'Operación atípica para el perfil del cliente', plazo: 'Aviso 24h si hay indicios ilícitos (Reforma 2025)' },
  fraccionamiento: { label: 'Posible Fraccionamiento',    icon: '🟡', color: '#EAB308', desc: 'Estructuración — múltiples operaciones para evadir umbral', plazo: 'Evaluar como aviso 24h' },
  preocupante:   { label: 'Op. Preocupante',              icon: '⚫', color: '#7C3AED', desc: 'Indicios de procedencia ilícita — requiere aviso 24h', plazo: 'Aviso 24h a UIF vía SAT SPPLD' }
};

var PLD_ESTADOS = {
  pendiente:  { label: 'Pendiente',  color: '#F59E0B' },
  revisada:   { label: 'Revisada',   color: '#3B82F6' },
  reportada:  { label: 'Reportada',  color: '#EF4444' },
  descartada: { label: 'Descartada', color: '#6B7280' }
};

function getPLDConfig() {
  try {
    var cfg = JSON.parse(localStorage.getItem('apf_pld_config') || 'null');
    return Object.assign({}, PLD_CONFIG_DEFAULTS, cfg || {});
  } catch (e) { return Object.assign({}, PLD_CONFIG_DEFAULTS); }
}

function guardarConfigPLD() {
  var cfg = {
    valorUMA: parseFloat(document.getElementById('pldValorUMA').value) || 117.31,
    umbralAviso: parseMilesVal(document.getElementById('pldUmbralAviso').value),
    umbralEfectivo: parseMilesVal(document.getElementById('pldUmbralEfectivo').value),
    umbralAcumEfectivo30d: parseMilesVal(document.getElementById('pldUmbralAcumEfectivo').value),
    umbralInusual: parseFloat(document.getElementById('pldUmbralInusual').value) || 200,
    diasFraccionamiento: parseInt(document.getElementById('pldDiasFraccionamiento').value) || 5,
    oficial: document.getElementById('pldOficial').value.trim(),
    razonSocial: document.getElementById('pldRazonSocial').value.trim(),
    clavePortalSPPLD: document.getElementById('pldClavePortal').value.trim()
  };
  localStorage.setItem('apf_pld_config', JSON.stringify(cfg));
  toast('Configuración PLD guardada (LFPIORPI)', 'success');
  addAudit('Configurar', 'PLD', 'UMA: $' + cfg.valorUMA + ', Umbral Aviso: ' + fmt(cfg.umbralAviso) + ', Efectivo: ' + fmt(cfg.umbralEfectivo));
}

// Recalcular umbrales a partir de UMA vigente (Art. 17 fracc. IV LFPIORPI)
function recalcularUmbralesPLD() {
  var uma = parseFloat(document.getElementById('pldValorUMA').value) || 117.31;
  // Umbral de aviso: 1,605 UMAs (Art. 17 fracc. IV — préstamos o créditos)
  var aviso = Math.round(1605 * uma);
  setInputMiles('pldUmbralAviso', aviso);
  setInputMiles('pldUmbralEfectivo', aviso);
  toast('Umbrales recalculados desde UMA $' + uma + ': Aviso=' + fmt(aviso), 'info');
}

function cargarConfigPLD() {
  var cfg = getPLDConfig();
  document.getElementById('pldValorUMA').value = cfg.valorUMA || 117.31;
  setInputMiles('pldUmbralAviso', cfg.umbralAviso);
  setInputMiles('pldUmbralEfectivo', cfg.umbralEfectivo);
  setInputMiles('pldUmbralAcumEfectivo', cfg.umbralAcumEfectivo30d);
  document.getElementById('pldUmbralInusual').value = cfg.umbralInusual;
  document.getElementById('pldDiasFraccionamiento').value = cfg.diasFraccionamiento;
  document.getElementById('pldOficial').value = cfg.oficial || '';
  document.getElementById('pldRazonSocial').value = cfg.razonSocial || '';
  document.getElementById('pldClavePortal').value = cfg.clavePortalSPPLD || '';
}

function setPLDTab(tab) {
  ['pldMonitor', 'pldAlertas', 'pldReporteMensual', 'pldConfiguracion'].forEach(function(id) {
    document.getElementById(id).style.display = 'none';
  });
  var tabMap = { monitor: 'pldMonitor', alertas: 'pldAlertas', reporteMensual: 'pldReporteMensual', configuracion: 'pldConfiguracion' };
  document.getElementById(tabMap[tab]).style.display = '';
  document.querySelectorAll('#page-pld .tab').forEach(function(t) { t.classList.remove('active'); });
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');
  if (tab === 'configuracion') cargarConfigPLD();
  if (tab === 'configuracion') renderRiesgoClientes();
}

// ---- MOTOR DE DETECCIÓN PLD ----
function escanearPLD() {
  if (!hasPermiso('pld', 'crear')) return toast('Sin permiso para escanear operaciones PLD', 'error');
  var cfg = getPLDConfig();
  var creditos = getStore('creditos');
  var clientes = getStore('clientes');
  var pagos = getStore('pagos');
  var pldStore = getStore('pld');
  var hoy = new Date();
  var nuevasAlertas = 0;

  // IDs ya registrados para no duplicar
  var idsExistentes = {};
  pldStore.forEach(function(p) { idsExistentes[p.ref] = true; });

  // 1. OPERACIONES RELEVANTES: disposiciones o pagos que superan el umbral
  creditos.forEach(function(c) {
    var cliente = clientes.find(function(cl) { return cl.id === c.clienteId; });
    // Disposición (monto del crédito)
    if (c.monto >= cfg.umbralAviso) {
      var refKey = 'cred-' + c.id;
      if (!idsExistentes[refKey]) {
        pldStore.push({
          id: nextId('pld'),
          ref: refKey,
          fecha: c.fechaInicio || c.createdAt,
          clienteId: c.clienteId,
          clienteNombre: cliente ? cliente.nombre : 'Desconocido',
          tipoOperacion: 'Disposición de crédito',
          categoria: 'relevante',
          monto: c.monto,
          riesgo: c.monto >= cfg.umbralAviso * 2 ? 'alto' : 'medio',
          estado: 'pendiente',
          observaciones: '',
          revisadoPor: null,
          fechaRevision: null,
          createdAt: new Date().toISOString()
        });
        nuevasAlertas++;
      }
    }
  });

  // 2. PAGOS RELEVANTES: pagos grandes (cualquier método)
  pagos.forEach(function(p) {
    if (p.monto >= cfg.umbralAviso) {
      var refKey = 'pago-' + p.id;
      if (!idsExistentes[refKey]) {
        var cred = creditos.find(function(c) { return c.id === p.creditoId; });
        var cliente = cred ? clientes.find(function(cl) { return cl.id === cred.clienteId; }) : null;
        pldStore.push({
          id: nextId('pld'),
          ref: refKey,
          fecha: p.fecha,
          clienteId: cred ? cred.clienteId : null,
          clienteNombre: cliente ? cliente.nombre : 'Desconocido',
          tipoOperacion: 'Pago recibido' + (p.metodo === 'efectivo' ? ' (EFECTIVO)' : ' (' + (p.metodo || 'transferencia') + ')'),
          categoria: 'relevante',
          monto: p.monto,
          riesgo: p.monto >= cfg.umbralAviso * 2 ? 'alto' : 'medio',
          estado: 'pendiente',
          observaciones: p.metodo === 'efectivo' ? '⚠️ DEPÓSITO EN EFECTIVO — Requiere reporte obligatorio' : '',
          revisadoPor: null,
          fechaRevision: null,
          createdAt: new Date().toISOString()
        });
        nuevasAlertas++;
      }
    }
  });

  // 2b. DEPÓSITOS EN EFECTIVO: monitoreo interno de pagos en efectivo (Art. 32 LFPIORPI no aplica a fracc. IV, pero se monitorea por control de riesgo)
  var umbralEfect = cfg.umbralEfectivo || 188283;
  pagos.forEach(function(p) {
    if (p.metodo === 'efectivo' && p.monto >= umbralEfect && p.monto < cfg.umbralAviso) {
      var refKey = 'efectivo-' + p.id;
      if (!idsExistentes[refKey]) {
        var cred = creditos.find(function(c) { return c.id === p.creditoId; });
        var cliente = cred ? clientes.find(function(cl) { return cl.id === cred.clienteId; }) : null;
        pldStore.push({
          id: nextId('pld'),
          ref: refKey,
          fecha: p.fecha,
          clienteId: cred ? cred.clienteId : null,
          clienteNombre: cliente ? cliente.nombre : 'Desconocido',
          tipoOperacion: 'Depósito en EFECTIVO',
          categoria: 'relevante',
          monto: p.monto,
          riesgo: p.monto >= umbralEfect * 1.5 ? 'alto' : 'medio',
          estado: 'pendiente',
          observaciones: '⚠️ Operación en efectivo supera umbral PLD (' + fmt(umbralEfect) + '). Art. 17 fracc. IV LFPIORPI',
          revisadoPor: null,
          fechaRevision: null,
          createdAt: new Date().toISOString()
        });
        nuevasAlertas++;
      }
    }
  });

  // 2c. ACUMULACIÓN DE EFECTIVO POR CLIENTE (30 días)
  var umbralAcumEf = cfg.umbralAcumEfectivo30d || 500000;
  var pagosEfectivoCliente = {};
  pagos.forEach(function(p) {
    if (p.metodo !== 'efectivo') return;
    var cred = creditos.find(function(c) { return c.id === p.creditoId; });
    if (!cred) return;
    if (!pagosEfectivoCliente[cred.clienteId]) pagosEfectivoCliente[cred.clienteId] = [];
    pagosEfectivoCliente[cred.clienteId].push(p);
  });
  Object.keys(pagosEfectivoCliente).forEach(function(clienteId) {
    var pgArr = pagosEfectivoCliente[clienteId].slice().sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
    // Ventana deslizante de 30 días
    for (var i = 0; i < pgArr.length; i++) {
      var acum = 0;
      var grupo = [];
      for (var j = i; j < pgArr.length; j++) {
        var difDias = Math.abs(Math.round((new Date(pgArr[j].fecha) - new Date(pgArr[i].fecha)) / 86400000));
        if (difDias > 30) break;
        acum += pgArr[j].monto;
        grupo.push(pgArr[j]);
      }
      if (acum >= umbralAcumEf && grupo.length >= 2) {
        var refKey = 'acumefect-' + clienteId + '-' + pgArr[i].fecha;
        if (!idsExistentes[refKey]) {
          var cliente = clientes.find(function(cl) { return cl.id === parseInt(clienteId); });
          pldStore.push({
            id: nextId('pld'),
            ref: refKey,
            fecha: pgArr[i].fecha,
            clienteId: parseInt(clienteId),
            clienteNombre: cliente ? cliente.nombre : 'Desconocido',
            tipoOperacion: 'Acumulación efectivo 30d: ' + grupo.length + ' operaciones',
            categoria: 'preocupante',
            monto: acum,
            riesgo: 'alto',
            estado: 'pendiente',
            observaciones: '⚠️ Cliente acumula ' + fmt(acum) + ' en efectivo en 30 días (' + grupo.length + ' ops). Supera umbral de ' + fmt(umbralAcumEf),
            revisadoPor: null,
            fechaRevision: null,
            createdAt: new Date().toISOString()
          });
          nuevasAlertas++;
        }
      }
    }
  });

  // 3. OPERACIONES INUSUALES: operaciones que superan X% del promedio del cliente
  var pagosCliente = {};
  pagos.forEach(function(p) {
    var cred = creditos.find(function(c) { return c.id === p.creditoId; });
    if (!cred) return;
    if (!pagosCliente[cred.clienteId]) pagosCliente[cred.clienteId] = [];
    pagosCliente[cred.clienteId].push(p);
  });
  Object.keys(pagosCliente).forEach(function(clienteId) {
    var pgArr = pagosCliente[clienteId];
    if (pgArr.length < 3) return; // Necesitamos historial
    var promedio = pgArr.reduce(function(s, p) { return s + p.monto; }, 0) / pgArr.length;
    var umbralInusual = promedio * (cfg.umbralInusual / 100);
    pgArr.forEach(function(p) {
      if (p.monto >= umbralInusual) {
        var refKey = 'inusual-pago-' + p.id;
        if (!idsExistentes[refKey]) {
          var cliente = clientes.find(function(cl) { return cl.id === parseInt(clienteId); });
          pldStore.push({
            id: nextId('pld'),
            ref: refKey,
            fecha: p.fecha,
            clienteId: parseInt(clienteId),
            clienteNombre: cliente ? cliente.nombre : 'Desconocido',
            tipoOperacion: 'Pago inusual (' + ((p.monto / promedio) * 100).toFixed(0) + '% del promedio)',
            categoria: 'inusual',
            monto: p.monto,
            riesgo: p.monto >= umbralInusual * 1.5 ? 'alto' : 'medio',
            estado: 'pendiente',
            observaciones: 'Promedio histórico: ' + fmt(promedio),
            revisadoPor: null,
            fechaRevision: null,
            createdAt: new Date().toISOString()
          });
          nuevasAlertas++;
        }
      }
    });
  });

  // 4. FRACCIONAMIENTO: múltiples pagos pequeños en ventana corta que suman > umbral
  Object.keys(pagosCliente).forEach(function(clienteId) {
    var pgArr = pagosCliente[clienteId].slice().sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
    for (var i = 0; i < pgArr.length; i++) {
      var acum = 0;
      var grupo = [];
      for (var j = i; j < pgArr.length; j++) {
        var difDias = Math.abs(Math.round((new Date(pgArr[j].fecha) - new Date(pgArr[i].fecha)) / 86400000));
        if (difDias > cfg.diasFraccionamiento) break;
        acum += pgArr[j].monto;
        grupo.push(pgArr[j]);
      }
      if (grupo.length >= 3 && acum >= cfg.umbralAviso) {
        var refKey = 'fracc-' + clienteId + '-' + pgArr[i].fecha;
        if (!idsExistentes[refKey]) {
          var cliente = clientes.find(function(cl) { return cl.id === parseInt(clienteId); });
          pldStore.push({
            id: nextId('pld'),
            ref: refKey,
            fecha: pgArr[i].fecha,
            clienteId: parseInt(clienteId),
            clienteNombre: cliente ? cliente.nombre : 'Desconocido',
            tipoOperacion: grupo.length + ' operaciones en ' + cfg.diasFraccionamiento + ' días',
            categoria: 'fraccionamiento',
            monto: acum,
            riesgo: 'alto',
            estado: 'pendiente',
            observaciones: 'Acumulado: ' + fmt(acum) + ' en ' + grupo.length + ' ops',
            revisadoPor: null,
            fechaRevision: null,
            createdAt: new Date().toISOString()
          });
          nuevasAlertas++;
        }
      }
    }
  });

  setStore('pld', pldStore);
  addAudit('Escanear', 'PLD', nuevasAlertas + ' nuevas alertas detectadas');
  toast(nuevasAlertas > 0 ? nuevasAlertas + ' nuevas alertas PLD detectadas' : 'Escaneo completo. Sin nuevas alertas.', nuevasAlertas > 0 ? 'warning' : 'success');
  renderPLD();
}

// ---- RENDER ----
function renderPLD() {
  var pldStore = getStore('pld');
  var filtro = document.getElementById('pldFiltroEstado') ? document.getElementById('pldFiltroEstado').value : 'todas';

  // KPIs
  var pendientes = pldStore.filter(function(p) { return p.estado === 'pendiente'; }).length;
  var revisadas = pldStore.filter(function(p) { return p.estado === 'revisada'; }).length;
  var reportadas = pldStore.filter(function(p) { return p.estado === 'reportada'; }).length;
  var altoRiesgo = pldStore.filter(function(p) { return p.riesgo === 'alto' && p.estado === 'pendiente'; }).length;

  var kpiEl = document.getElementById('pldKPIs');
  if (kpiEl) {
    kpiEl.innerHTML =
      '<div class="kpi-card red"><div class="kpi-label">Pendientes</div><div class="kpi-value">' + pendientes + '</div></div>' +
      '<div class="kpi-card blue"><div class="kpi-label">Revisadas</div><div class="kpi-value">' + revisadas + '</div></div>' +
      '<div class="kpi-card" style="background:#7C3AED;color:#fff"><div class="kpi-label" style="color:rgba(255,255,255,0.8)">Avisos UIF</div><div class="kpi-value">' + reportadas + '</div></div>' +
      '<div class="kpi-card yellow"><div class="kpi-label">Alto Riesgo ⚠️</div><div class="kpi-value">' + altoRiesgo + '</div></div>' +
      '<div class="kpi-card green"><div class="kpi-label">Total Operaciones</div><div class="kpi-value">' + pldStore.length + '</div></div>';
  }

  // Tabla
  var ops = filtro === 'todas' ? pldStore.slice() : pldStore.filter(function(p) { return p.estado === filtro; });
  ops.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });

  var tbEl = document.getElementById('tbPLDOperaciones');
  if (tbEl) {
    tbEl.innerHTML = ops.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px">Sin operaciones registradas. Ejecuta un escaneo.</td></tr>' :
    ops.map(function(op) {
      var cat = PLD_CATEGORIAS[op.categoria] || PLD_CATEGORIAS.relevante;
      var est = PLD_ESTADOS[op.estado] || PLD_ESTADOS.pendiente;
      var riesgoColor = op.riesgo === 'alto' ? '#EF4444' : op.riesgo === 'medio' ? '#F59E0B' : '#3B82F6';
      return '<tr>' +
        '<td>' + fmtDate(op.fecha) + '</td>' +
        '<td><strong>' + esc(op.clienteNombre) + '</strong></td>' +
        '<td style="font-size:12px">' + esc(op.tipoOperacion) + '</td>' +
        '<td>' + cat.icon + ' <span style="font-size:12px">' + cat.label + '</span></td>' +
        '<td style="text-align:right;font-weight:600">' + fmt(op.monto) + '</td>' +
        '<td><span class="badge" style="background:' + riesgoColor + ';color:#fff;font-size:10px">' + (op.riesgo || 'medio').toUpperCase() + '</span></td>' +
        '<td><span class="badge" style="background:' + est.color + ';color:#fff;font-size:10px">' + est.label + '</span></td>' +
        '<td style="white-space:nowrap">' +
          (op.estado === 'pendiente' ? '<button class="btn btn-outline btn-sm" onclick="revisarPLD(' + op.id + ')" style="font-size:11px;margin-right:4px">✅ Revisar</button>' +
          '<button class="btn btn-outline btn-sm" onclick="reportarPLD(' + op.id + ')" style="font-size:11px;margin-right:4px;color:#EF4444">📤 Reportar</button>' +
          '<button class="btn btn-outline btn-sm" onclick="descartarPLD(' + op.id + ')" style="font-size:11px">❌</button>' :
          '<span style="font-size:11px;color:var(--text-muted)">' + (op.revisadoPor || '-') + '</span>') +
        '</td></tr>';
    }).join('');
  }

  // Alertas tab
  renderAlertasPLD(pldStore);

  // Gráficas de tendencia, alerta deadline, KPIs cumplimiento
  renderPLDCharts(pldStore);
  renderAlertaDeadlinePLD(pldStore);
  renderKPIsCumplimiento(pldStore);
}

function renderAlertasPLD(pldStore) {
  var alertas = pldStore.filter(function(p) { return p.estado === 'pendiente'; });
  alertas.sort(function(a, b) {
    var riskOrder = { alto: 0, medio: 1, bajo: 2 };
    return (riskOrder[a.riesgo] || 1) - (riskOrder[b.riesgo] || 1);
  });
  var countEl = document.getElementById('pldAlertasCount');
  if (countEl) countEl.textContent = alertas.length + ' alertas pendientes';

  var listEl = document.getElementById('pldAlertasList');
  if (!listEl) return;
  if (alertas.length === 0) {
    listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:30px">Sin alertas pendientes</p>';
    return;
  }
  listEl.innerHTML = alertas.map(function(a) {
    var cat = PLD_CATEGORIAS[a.categoria] || PLD_CATEGORIAS.relevante;
    var riesgoColor = a.riesgo === 'alto' ? '#EF4444' : a.riesgo === 'medio' ? '#F59E0B' : '#3B82F6';
    return '<div style="padding:14px 16px;border-bottom:1px solid var(--border);border-left:4px solid ' + riesgoColor + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<div>' + cat.icon + ' <strong>' + esc(a.clienteNombre) + '</strong> — ' + cat.label +
        ' <span class="badge" style="background:' + riesgoColor + ';color:#fff;font-size:10px;margin-left:6px">' + (a.riesgo || '').toUpperCase() + '</span></div>' +
        '<span style="font-size:12px;color:var(--text-muted)">' + fmtDate(a.fecha) + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-primary);margin-bottom:8px">' + esc(a.tipoOperacion) + ' — <strong>' + fmt(a.monto) + '</strong></div>' +
      (a.observaciones ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">' + esc(a.observaciones) + '</div>' : '') +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-outline btn-sm" onclick="revisarPLD(' + a.id + ')" style="font-size:11px">✅ Marcar Revisada</button>' +
        '<button class="btn btn-sm" onclick="reportarPLD(' + a.id + ')" style="font-size:11px;background:#EF4444;color:#fff">📤 Aviso a UIF</button>' +
        '<button class="btn btn-outline btn-sm" onclick="descartarPLD(' + a.id + ')" style="font-size:11px">Descartar</button>' +
      '</div></div>';
  }).join('');
}

// ---- ACCIONES ----
function revisarPLD(id) {
  var pldStore = getStore('pld');
  pldStore = pldStore.map(function(p) {
    if (p.id === id) {
      p.estado = 'revisada';
      p.revisadoPor = currentUser ? currentUser.nombre : 'Sistema';
      p.fechaRevision = new Date().toISOString();
    }
    return p;
  });
  setStore('pld', pldStore);
  addAudit('Revisar', 'PLD', 'Operación #' + id + ' marcada como revisada');
  toast('Operación marcada como revisada', 'success');
  renderPLD();
}

function reportarPLD(id) {
  var motivo = prompt('Motivo del aviso a la UIF (vía SAT SPPLD):');
  if (!motivo) return;
  var pldStore = getStore('pld');
  pldStore = pldStore.map(function(p) {
    if (p.id === id) {
      p.estado = 'reportada';
      p.revisadoPor = currentUser ? currentUser.nombre : 'Sistema';
      p.fechaRevision = new Date().toISOString();
      p.observaciones = (p.observaciones ? p.observaciones + ' | ' : '') + 'REPORTADA: ' + motivo;
    }
    return p;
  });
  setStore('pld', pldStore);
  addAudit('Aviso UIF', 'PLD', 'Operación #' + id + ' — aviso a UIF vía SPPLD: ' + motivo);
  toast('Aviso a UIF registrado (presentar en SAT SPPLD)', 'warning');
  renderPLD();
}

function descartarPLD(id) {
  if (!confirm('¿Descartar esta alerta PLD?')) return;
  var pldStore = getStore('pld');
  pldStore = pldStore.map(function(p) {
    if (p.id === id) {
      p.estado = 'descartada';
      p.revisadoPor = currentUser ? currentUser.nombre : 'Sistema';
      p.fechaRevision = new Date().toISOString();
    }
    return p;
  });
  setStore('pld', pldStore);
  addAudit('Descartar', 'PLD', 'Alerta #' + id + ' descartada');
  toast('Alerta descartada', 'info');
  renderPLD();
}

// ---- GRÁFICAS DE TENDENCIA PLD ----
var chartPLDTendencia = null;
var chartPLDCategorias = null;

function renderPLDCharts(pldStore) {
  // 1. TENDENCIA MENSUAL: operaciones detectadas por mes (últimos 12 meses)
  var hoy = new Date();
  var mesesArr = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    mesesArr.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  var mesesLabels = mesesArr.map(function(m) {
    var parts = m.split('-');
    var nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return nombres[parseInt(parts[1]) - 1] + ' ' + parts[0].substring(2);
  });

  var datosRelevante = mesesArr.map(function(m) { return pldStore.filter(function(p) { return p.fecha && p.fecha.substring(0, 7) === m && p.categoria === 'relevante'; }).length; });
  var datosInusual = mesesArr.map(function(m) { return pldStore.filter(function(p) { return p.fecha && p.fecha.substring(0, 7) === m && p.categoria === 'inusual'; }).length; });
  var datosFragm = mesesArr.map(function(m) { return pldStore.filter(function(p) { return p.fecha && p.fecha.substring(0, 7) === m && (p.categoria === 'fraccionamiento' || p.categoria === 'preocupante'); }).length; });
  var datosReportadas = mesesArr.map(function(m) { return pldStore.filter(function(p) { return p.fecha && p.fecha.substring(0, 7) === m && p.estado === 'reportada'; }).length; });

  var ctxTend = document.getElementById('chartPLDTendencia');
  if (ctxTend) {
    if (chartPLDTendencia) chartPLDTendencia.destroy();
    chartPLDTendencia = new Chart(ctxTend, {
      type: 'bar',
      data: {
        labels: mesesLabels,
        datasets: [
          { label: 'Aviso (Art.17 IV)', data: datosRelevante, backgroundColor: '#EF4444', borderRadius: 3 },
          { label: 'Inusuales', data: datosInusual, backgroundColor: '#F59E0B', borderRadius: 3 },
          { label: 'Fracc./Preocup.', data: datosFragm, backgroundColor: '#7C3AED', borderRadius: 3 },
          { label: 'Avisos UIF', data: datosReportadas, type: 'line', borderColor: '#1E3A5F', backgroundColor: 'rgba(30,58,95,0.1)', fill: true, tension: 0.3, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, usePointStyle: true } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }

  // 2. DISTRIBUCIÓN POR CATEGORÍA (donut)
  var catConteo = {};
  Object.keys(PLD_CATEGORIAS).forEach(function(k) { catConteo[k] = 0; });
  pldStore.forEach(function(p) { if (catConteo[p.categoria] !== undefined) catConteo[p.categoria]++; });

  var ctxCat = document.getElementById('chartPLDCategorias');
  if (ctxCat) {
    if (chartPLDCategorias) chartPLDCategorias.destroy();
    chartPLDCategorias = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: Object.keys(PLD_CATEGORIAS).map(function(k) { return PLD_CATEGORIAS[k].label; }),
        datasets: [{ data: Object.keys(PLD_CATEGORIAS).map(function(k) { return catConteo[k]; }),
          backgroundColor: Object.keys(PLD_CATEGORIAS).map(function(k) { return PLD_CATEGORIAS[k].color; }),
          borderWidth: 2, borderColor: '#fff' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { position: 'right', labels: { font: { size: 12 }, padding: 12, usePointStyle: true } },
          tooltip: { callbacks: { label: function(ctx) { var total = ctx.dataset.data.reduce(function(s, v) { return s + v; }, 0); return ctx.label + ': ' + ctx.raw + ' (' + (total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0) + '%)'; } } }
        }
      }
    });
  }
}

// ---- ALERTA FECHA LÍMITE DÍA 17 ----
function renderAlertaDeadlinePLD(pldStore) {
  var el = document.getElementById('pldAlertaDeadline');
  if (!el) return;

  var hoy = new Date();
  var dia = hoy.getDate();
  var mes = hoy.getMonth(); // 0-indexed
  var anio = hoy.getFullYear();

  // Calcular deadline: día 17 del mes actual (si ya pasó, del próximo)
  var deadlineMes, deadlineAnio;
  if (dia <= 17) {
    deadlineMes = mes; deadlineAnio = anio;
  } else {
    deadlineMes = mes + 1;
    deadlineAnio = anio;
    if (deadlineMes > 11) { deadlineMes = 0; deadlineAnio++; }
  }
  var deadline = new Date(deadlineAnio, deadlineMes, 17);
  var diasRestantes = Math.ceil((deadline - hoy) / 86400000);

  // Periodo que debería reportarse (mes anterior al deadline)
  var periodoMes = deadlineMes === 0 ? 12 : deadlineMes;
  var periodoAnio = deadlineMes === 0 ? deadlineAnio - 1 : deadlineAnio;
  var periodoStr = periodoAnio + '-' + String(periodoMes).padStart(2, '0');
  var meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Operaciones pendientes del periodo
  var pendientesPeriodo = pldStore.filter(function(p) {
    return p.fecha && p.fecha.substring(0, 7) === periodoStr && p.estado === 'pendiente';
  }).length;
  var reportadasPeriodo = pldStore.filter(function(p) {
    return p.fecha && p.fecha.substring(0, 7) === periodoStr && p.estado === 'reportada';
  }).length;

  if (diasRestantes <= 10 && pendientesPeriodo > 0) {
    var urgencia = diasRestantes <= 3 ? '#EF4444' : diasRestantes <= 7 ? '#F59E0B' : '#3B82F6';
    el.style.display = '';
    el.style.borderLeftColor = urgencia;
    el.style.background = urgencia === '#EF4444' ? '#FEF2F2' : urgencia === '#F59E0B' ? '#FFFBEB' : '#EFF6FF';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><strong>📅 Fecha límite de avisos: ' + deadline.toLocaleDateString('es-MX') + '</strong> (' + diasRestantes + ' día' + (diasRestantes !== 1 ? 's' : '') + ' restantes)' +
      '<br>Periodo: <strong>' + meses[periodoMes] + ' ' + periodoAnio + '</strong> — ' +
      '<span style="color:#EF4444;font-weight:600">' + pendientesPeriodo + ' operaciones pendientes de revisar</span>' +
      (reportadasPeriodo > 0 ? ' | <span style="color:#7C3AED">' + reportadasPeriodo + ' avisos registrados</span>' : '') +
      '</div>' +
      '<button class="btn btn-sm" onclick="setPLDTab(\'reporteMensual\')" style="background:' + urgencia + ';color:#fff;font-size:12px">Ver Reporte</button></div>';
  } else {
    el.style.display = 'none';
  }
}

// ---- KPIs DE CUMPLIMIENTO ----
function renderKPIsCumplimiento(pldStore) {
  var el = document.getElementById('pldKPIsCumplimiento');
  if (!el) return;

  var total = pldStore.length;
  var revisadas = pldStore.filter(function(p) { return p.estado === 'revisada' || p.estado === 'reportada'; }).length;
  var pctRevisadas = total > 0 ? ((revisadas / total) * 100).toFixed(1) : '0.0';

  // Tiempo promedio de respuesta (días entre creación y revisión)
  var tiemposRespuesta = pldStore.filter(function(p) { return p.fechaRevision && p.createdAt; }).map(function(p) {
    return Math.abs(new Date(p.fechaRevision) - new Date(p.createdAt)) / 86400000;
  });
  var promedioResp = tiemposRespuesta.length > 0 ? (tiemposRespuesta.reduce(function(s, v) { return s + v; }, 0) / tiemposRespuesta.length).toFixed(1) : '-';

  // Operaciones vencidas (pendientes > 15 días sin revisar)
  var hoy = new Date();
  var vencidas = pldStore.filter(function(p) {
    if (p.estado !== 'pendiente') return false;
    var dias = Math.abs(hoy - new Date(p.createdAt)) / 86400000;
    return dias > 15;
  }).length;

  // Avisos presentados este año
  var anioActual = hoy.getFullYear();
  var avisosAnio = pldStore.filter(function(p) {
    return p.estado === 'reportada' && p.fechaRevision && p.fechaRevision.substring(0, 4) === String(anioActual);
  }).length;

  // Monto acumulado operaciones reportadas
  var montoReportado = pldStore.filter(function(p) { return p.estado === 'reportada'; }).reduce(function(s, p) { return s + (p.monto || 0); }, 0);

  el.innerHTML =
    '<div class="kpi-card green"><div class="kpi-label">% Revisión</div><div class="kpi-value">' + pctRevisadas + '%</div><div class="kpi-sub">' + revisadas + ' de ' + total + ' operaciones</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Tiempo Promedio</div><div class="kpi-value">' + promedioResp + '</div><div class="kpi-sub">días para revisar</div></div>' +
    '<div class="kpi-card ' + (vencidas > 0 ? 'red' : 'green') + '"><div class="kpi-label">Vencidas (&gt;15d)</div><div class="kpi-value">' + vencidas + '</div><div class="kpi-sub">pendientes sin revisión</div></div>' +
    '<div class="kpi-card" style="background:#7C3AED;color:#fff"><div class="kpi-label" style="color:rgba(255,255,255,0.8)">Avisos ' + anioActual + '</div><div class="kpi-value">' + avisosAnio + '</div><div class="kpi-sub">' + fmt(montoReportado) + ' acumulado</div></div>';
}

// ---- EXPORTAR CSV ----
function exportarPLDCSV() {
  var pldStore = getStore('pld');
  if (pldStore.length === 0) return toast('Sin operaciones PLD para exportar', 'info');

  var headers = ['ID','Fecha','Cliente','Tipo Operación','Categoría','Monto','Nivel Riesgo','Estado','Revisado Por','Fecha Revisión','Observaciones'];
  var rows = pldStore.map(function(op) {
    var cat = PLD_CATEGORIAS[op.categoria] || {};
    var est = PLD_ESTADOS[op.estado] || {};
    return [op.id, op.fecha || '', '"' + (op.clienteNombre || '').replace(/"/g, '""') + '"', '"' + (op.tipoOperacion || '').replace(/"/g, '""') + '"',
      cat.label || op.categoria, op.monto || 0, op.riesgo || '', est.label || op.estado,
      '"' + (op.revisadoPor || '').replace(/"/g, '""') + '"', op.fechaRevision || '',
      '"' + (op.observaciones || '').replace(/"/g, '""') + '"'].join(',');
  });

  var csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'PLD_Operaciones_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exportado con ' + pldStore.length + ' operaciones', 'success');
  addAudit('Exportar CSV', 'PLD', pldStore.length + ' operaciones exportadas');
}

function exportarReportePLDCSV() {
  var mes = document.getElementById('pldReporteMes').value;
  var anio = document.getElementById('pldReporteAnio').value;
  var periodo = anio + '-' + mes;
  var pldStore = getStore('pld');
  var opsMes = pldStore.filter(function(p) { return p.fecha && p.fecha.substring(0, 7) === periodo; });
  if (opsMes.length === 0) return toast('Sin operaciones en este periodo', 'info');

  var headers = ['ID','Fecha','Cliente','Tipo Operación','Categoría','Monto','Nivel Riesgo','Estado','Revisado Por','Fecha Revisión','Observaciones'];
  var rows = opsMes.map(function(op) {
    var cat = PLD_CATEGORIAS[op.categoria] || {};
    var est = PLD_ESTADOS[op.estado] || {};
    return [op.id, op.fecha || '', '"' + (op.clienteNombre || '').replace(/"/g, '""') + '"', '"' + (op.tipoOperacion || '').replace(/"/g, '""') + '"',
      cat.label || op.categoria, op.monto || 0, op.riesgo || '', est.label || op.estado,
      '"' + (op.revisadoPor || '').replace(/"/g, '""') + '"', op.fechaRevision || '',
      '"' + (op.observaciones || '').replace(/"/g, '""') + '"'].join(',');
  });

  var csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'PLD_Reporte_' + periodo + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV del periodo ' + periodo + ' exportado (' + opsMes.length + ' ops)', 'success');
}

// ---- RIESGO POR CLIENTE ----
function renderRiesgoClientes() {
  var clientes = getStore('clientes');
  var creditos = getStore('creditos');
  var pagos = getStore('pagos');
  var hoy = new Date();
  var hace6m = new Date(hoy); hace6m.setMonth(hace6m.getMonth() - 6);

  var tbEl = document.getElementById('tbPLDRiesgoClientes');
  if (!tbEl) return;

  var rows = clientes.map(function(cl) {
    var creditosCl = creditos.filter(function(c) { return c.clienteId === cl.id; });
    var pagosCl = pagos.filter(function(p) {
      var cred = creditos.find(function(c) { return c.id === p.creditoId; });
      return cred && cred.clienteId === cl.id && new Date(p.fecha) >= hace6m;
    });
    var montoAcum = pagosCl.reduce(function(s, p) { return s + (p.monto || 0); }, 0) +
      creditosCl.filter(function(c) { return new Date(c.fechaInicio || c.createdAt) >= hace6m; }).reduce(function(s, c) { return s + c.monto; }, 0);

    var nivel = 'bajo';
    if (montoAcum > 5000000 || creditosCl.length > 5) nivel = 'alto';
    else if (montoAcum > 2000000 || creditosCl.length > 3) nivel = 'medio';

    return {
      cliente: cl,
      tipo: cl.tipo === 'moral' ? 'Persona Moral' : 'Persona Física',
      operaciones: pagosCl.length + creditosCl.length,
      montoAcum: montoAcum,
      nivel: nivel
    };
  });

  rows.sort(function(a, b) {
    var nOrder = { alto: 0, medio: 1, bajo: 2 };
    return (nOrder[a.nivel] || 2) - (nOrder[b.nivel] || 2);
  });

  tbEl.innerHTML = rows.map(function(r) {
    var nColor = r.nivel === 'alto' ? '#EF4444' : r.nivel === 'medio' ? '#F59E0B' : '#0D9F6E';
    return '<tr>' +
      '<td><strong>' + esc(r.cliente.nombre) + '</strong></td>' +
      '<td>' + r.tipo + '</td>' +
      '<td style="text-align:center">' + r.operaciones + '</td>' +
      '<td style="text-align:right">' + fmt(r.montoAcum) + '</td>' +
      '<td><span class="badge" style="background:' + nColor + ';color:#fff">' + r.nivel.toUpperCase() + '</span></td>' +
      '<td style="font-size:12px;color:var(--text-muted)">' + (r.cliente.ultimaRevisionPLD || 'Nunca') + '</td>' +
      '<td><button class="btn btn-outline btn-sm" onclick="marcarRevisionPLD(' + r.cliente.id + ')" style="font-size:11px">Marcar Revisión</button></td>' +
      '</tr>';
  }).join('');
}

function marcarRevisionPLD(clienteId) {
  var clientes = getStore('clientes');
  clientes = clientes.map(function(c) {
    if (c.id === clienteId) c.ultimaRevisionPLD = new Date().toISOString().split('T')[0];
    return c;
  });
  setStore('clientes', clientes);
  addAudit('Revisar KYC/PLD', 'Clientes', 'Cliente #' + clienteId);
  toast('Revisión PLD registrada', 'success');
  renderRiesgoClientes();
}

// ---- REPORTE MENSUAL ----
function generarReporteMensualPLD() {
  var mes = document.getElementById('pldReporteMes').value;
  var anio = document.getElementById('pldReporteAnio').value;
  var periodo = anio + '-' + mes;
  var pldStore = getStore('pld');

  var opsMes = pldStore.filter(function(p) {
    return p.fecha && p.fecha.substring(0, 7) === periodo;
  });

  // KPIs del reporte
  var totalOps = opsMes.length;
  var montoTotal = opsMes.reduce(function(s, p) { return s + (p.monto || 0); }, 0);
  var reportadas = opsMes.filter(function(p) { return p.estado === 'reportada'; });
  var pendientes = opsMes.filter(function(p) { return p.estado === 'pendiente'; });

  var catConteo = {};
  opsMes.forEach(function(p) {
    if (!catConteo[p.categoria]) catConteo[p.categoria] = { count: 0, monto: 0 };
    catConteo[p.categoria].count++;
    catConteo[p.categoria].monto += p.monto || 0;
  });

  var kpiEl = document.getElementById('pldReporteKPIs');
  if (kpiEl) {
    var meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    kpiEl.innerHTML =
      '<div class="kpi-card navy"><div class="kpi-label">' + meses[parseInt(mes)] + ' ' + anio + '</div><div class="kpi-value">' + totalOps + '</div><div class="kpi-sub">operaciones detectadas</div></div>' +
      '<div class="kpi-card red"><div class="kpi-label">Monto Total</div><div class="kpi-value">' + fmt(montoTotal) + '</div></div>' +
      '<div class="kpi-card" style="background:#7C3AED;color:#fff"><div class="kpi-label" style="color:rgba(255,255,255,0.8)">Avisos UIF</div><div class="kpi-value">' + reportadas.length + '</div></div>' +
      '<div class="kpi-card yellow"><div class="kpi-label">Pendientes</div><div class="kpi-value">' + pendientes.length + '</div></div>';
  }

  // Tabla
  var tbEl = document.getElementById('tbPLDReporte');
  if (tbEl) {
    tbEl.innerHTML = opsMes.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)">Sin operaciones detectadas en este periodo</td></tr>' :
    opsMes.map(function(op) {
      var cat = PLD_CATEGORIAS[op.categoria] || PLD_CATEGORIAS.relevante;
      var est = PLD_ESTADOS[op.estado] || PLD_ESTADOS.pendiente;
      return '<tr>' +
        '<td>' + fmtDate(op.fecha) + '</td>' +
        '<td>' + esc(op.clienteNombre) + '</td>' +
        '<td style="font-size:12px">' + esc(op.tipoOperacion) + '</td>' +
        '<td>' + cat.icon + ' ' + cat.label + '</td>' +
        '<td style="text-align:right;font-weight:600">' + fmt(op.monto) + '</td>' +
        '<td><span class="badge" style="background:' + (op.riesgo === 'alto' ? '#EF4444' : '#F59E0B') + ';color:#fff;font-size:10px">' + (op.riesgo || '').toUpperCase() + '</span></td>' +
        '<td><span class="badge" style="background:' + est.color + ';color:#fff;font-size:10px">' + est.label + '</span></td>' +
        '<td style="font-size:11px">' + esc(op.observaciones || '-') + '</td></tr>';
    }).join('');
  }

  // Resumen por categoría
  var resEl = document.getElementById('pldReporteResumenCat');
  if (resEl) {
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;padding:12px">';
    Object.keys(PLD_CATEGORIAS).forEach(function(k) {
      var cat = PLD_CATEGORIAS[k];
      var datos = catConteo[k] || { count: 0, monto: 0 };
      html += '<div style="padding:16px;border-radius:8px;border-left:4px solid ' + cat.color + ';background:var(--gray-50)">' +
        '<div style="font-size:18px;margin-bottom:4px">' + cat.icon + ' ' + cat.label + '</div>' +
        '<div style="font-size:24px;font-weight:700">' + datos.count + '</div>' +
        '<div style="font-size:13px;color:var(--text-muted)">' + fmt(datos.monto) + '</div></div>';
    });
    html += '</div>';
    resEl.innerHTML = html;
  }

  document.getElementById('pldReporteContenido').style.display = '';
  addAudit('Generar Reporte', 'PLD', 'Reporte mensual ' + periodo);
}

// ---- EXPORTAR PDF ----
function exportarReportePLDPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var mes = document.getElementById('pldReporteMes').value;
  var anio = document.getElementById('pldReporteAnio').value;
  var periodo = anio + '-' + mes;
  var cfg = getPLDConfig();
  var pldStore = getStore('pld');
  var opsMes = pldStore.filter(function(p) { return p.fecha && p.fecha.substring(0, 7) === periodo; });
  var meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('p', 'mm', 'letter');

  // Header
  doc.setFontSize(16);
  doc.setTextColor(30, 48, 80);
  doc.text('REPORTE PLD/FT — CONTROL INTERNO', 20, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('LFPIORPI Art. 17 Fracc. IV — Actividad Vulnerable: Otorgamiento de Préstamos', 20, 27);
  doc.text((cfg.razonSocial || EMPRESA.razonSocial), 20, 33);
  doc.text('Periodo: ' + meses[parseInt(mes)] + ' ' + anio + '  |  Portal SAT SPPLD: ' + (cfg.clavePortalSPPLD || 'N/A') + '  |  Oficial: ' + (cfg.oficial || 'N/A'), 20, 39);
  doc.setFontSize(8);
  doc.text('UMA diaria: $' + (cfg.valorUMA || 117.31) + '  |  Umbral Aviso (1,605 UMAs): ' + fmt(cfg.umbralAviso) + '  |  Umbral efectivo: ' + fmt(cfg.umbralEfectivo), 20, 44);

  // Resumen
  var montoTotal = opsMes.reduce(function(s, p) { return s + (p.monto || 0); }, 0);
  var reportadas = opsMes.filter(function(p) { return p.estado === 'reportada'; }).length;
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text('Total operaciones detectadas: ' + opsMes.length + '  |  Monto total: ' + fmt(montoTotal) + '  |  Con aviso a UIF: ' + reportadas, 20, 50);

  // Tabla
  if (opsMes.length > 0) {
    doc.autoTable({
      startY: 55,
      head: [['Fecha', 'Cliente', 'Tipo Operación', 'Categoría', 'Monto', 'Riesgo', 'Estado', 'Observaciones']],
      body: opsMes.map(function(op) {
        var cat = PLD_CATEGORIAS[op.categoria] || {};
        var est = PLD_ESTADOS[op.estado] || {};
        return [op.fecha, op.clienteNombre, op.tipoOperacion, cat.label || op.categoria, fmt(op.monto), (op.riesgo || '').toUpperCase(), est.label || op.estado, op.observaciones || ''];
      }),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 247, 255] },
      columnStyles: { 4: { halign: 'right' }, 7: { cellWidth: 35 } },
      margin: { left: 20, right: 20 }
    });
  } else {
    doc.text('Sin operaciones detectadas en este periodo.', 20, 59);
  }

  // Footer
  var pageH = doc.internal.pageSize.height;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Documento generado el ' + new Date().toLocaleDateString('es-MX') + ' — ' + (cfg.razonSocial || EMPRESA.nombre) + '. Marco: LFPIORPI Art. 17 Fracc. IV (Actividades Vulnerables).', 20, pageH - 20);
  doc.text('Plazo de avisos: Día 17 del mes siguiente (Art. 23 LFPIORPI) | Aviso 24h por indicios ilícitos (Reforma jul-2025) | Conservación: 10 años (Art. 18).', 20, pageH - 15);
  doc.text('Este documento es para control interno y no sustituye los avisos formales al SAT a través del Portal SPPLD (https://sppld.sat.gob.mx).', 20, pageH - 10);

  doc.save('PLD_Reporte_' + periodo + '.pdf');
  toast('Reporte PLD exportado en PDF', 'success');
}
