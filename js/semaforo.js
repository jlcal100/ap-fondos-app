// ====== MODULE: semaforo.js ======
// Evaluación de semáforo de alertas tempranas, charts, acciones correctivas

// ============================================================
//  CONSTANTES Y CACHE
// ============================================================
var chartSemaforoInst = null;
var chartFactoresInst = null;
var _semaforoCache = null;

var ALERTA_REGLAS = [
  { id: 'mora_leve',    factor: 'mora',         condicion: function(c) { return (c.diasMora || 0) >= 1 && (c.diasMora || 0) <= 15; }, texto: 'Mora leve (1-15 días)', peso: 15 },
  { id: 'mora_media',   factor: 'mora',         condicion: function(c) { return (c.diasMora || 0) > 15 && (c.diasMora || 0) <= 60; }, texto: 'Mora media (16-60 días)', peso: 30 },
  { id: 'mora_grave',   factor: 'mora',         condicion: function(c) { return (c.diasMora || 0) > 60; }, texto: 'Mora grave (+60 días)', peso: 50 },
  { id: 'pago_parcial', factor: 'pagos',        condicion: function(c, cache) { var pagos = (cache ? cache.allPagos : getStore('pagos')).filter(function(p) { return p.creditoId === c.id; }); var last = pagos[pagos.length - 1]; return last && last.monto < (c.pago || 0) * 0.9; }, texto: 'Último pago fue parcial (<90%)', peso: 20 },
  { id: 'sin_pago_rec', factor: 'pagos',        condicion: function(c, cache) { var pagos = (cache ? cache.allPagos : getStore('pagos')).filter(function(p) { return p.creditoId === c.id; }); if (pagos.length === 0) return false; var last = pagos[pagos.length - 1]; var dias = Math.floor((new Date() - new Date(last.fecha)) / 86400000); return dias > 45; }, texto: 'Sin pago hace +45 días', peso: 25 },
  { id: 'sin_garantia', factor: 'garantias',    condicion: function(c) { var cob = getCoberturaGarantias(c.id); return cob.count === 0 && c.saldo > 200000; }, texto: 'Sin garantía (saldo > $200k)', peso: 20 },
  { id: 'cob_baja',     factor: 'garantias',    condicion: function(c) { var cob = getCoberturaGarantias(c.id); return cob.count > 0 && cob.cobertura < 80; }, texto: 'Cobertura garantías < 80%', peso: 15 },
  { id: 'venc_prox',    factor: 'vencimiento',  condicion: function(c) { if (!c.fechaVencimiento) return false; var d = Math.floor((new Date(c.fechaVencimiento) - new Date()) / 86400000); return d > 0 && d <= 30; }, texto: 'Vence en menos de 30 días', peso: 15 },
  { id: 'concentr',     factor: 'concentracion', condicion: function(c, cache) { var total = cache ? cache.totalSaldo : getStore('creditos').filter(function(cr) { return cr.estado !== 'liquidado'; }).reduce(function(s, cr) { return s + (cr.saldo || 0); }, 0); return total > 0 && ((c.saldo || 0) / total) > 0.15; }, texto: 'Concentración > 15% de cartera', peso: 15 },
  { id: 'riesgo_alto',  factor: 'riesgo',       condicion: function(c) { var r = calcularRiesgoCredito(c.id); return r.calificacion === 'D' || r.calificacion === 'E'; }, texto: 'Scoring de riesgo Alto/Crítico', peso: 25 }
];

// ============================================================
//  EVALUACIÓN DE SEMÁFORO
// ============================================================
function _getSemaforoCache() {
  if (_semaforoCache) return _semaforoCache;
  var allCreditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var totalSaldo = allCreditos.reduce(function(s, c) { return s + (c.saldo || 0); }, 0);
  var allPagos = getStore('pagos');
  _semaforoCache = { totalSaldo: totalSaldo, allPagos: allPagos };
  return _semaforoCache;
}

function invalidarSemaforoCache() { _semaforoCache = null; }

function evaluarSemaforoCredito(credito) {
  var cache = _getSemaforoCache();
  var alertas = [];
  var pesoTotal = 0;
  ALERTA_REGLAS.forEach(function(regla) {
    try {
      if (regla.condicion(credito, cache)) {
        alertas.push({ id: regla.id, factor: regla.factor, texto: regla.texto, peso: regla.peso });
        pesoTotal += regla.peso;
      }
    } catch(e) {}
  });

  var semaforo = 'verde';
  if (pesoTotal >= 50) semaforo = 'rojo';
  else if (pesoTotal >= 20) semaforo = 'amarillo';

  return { semaforo: semaforo, pesoTotal: pesoTotal, alertas: alertas };
}

// ============================================================
//  CHARTS DE SEMÁFORO
// ============================================================
function renderChartSemaforo(r, a, v) {
  if (chartSemaforoInst) chartSemaforoInst.destroy();
  var ctx = document.getElementById('chartSemaforo');
  if (!ctx) return;
  chartSemaforoInst = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Rojo — Crítico', 'Amarillo — Precaución', 'Verde — Normal'],
      datasets: [{ data: [r, a, v], backgroundColor: ['#EF4444', '#F59E0B', '#0D9F6E'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' } } }
  });
}

function renderChartFactores(factores) {
  if (chartFactoresInst) chartFactoresInst.destroy();
  var ctx = document.getElementById('chartFactores');
  if (!ctx) return;
  var labels = Object.keys(factores);
  var data = labels.map(function(l) { return factores[l]; });
  var factorLabels = { mora: 'Morosidad', pagos: 'Pagos', garantias: 'Garantías', vencimiento: 'Vencimiento', concentracion: 'Concentración', riesgo: 'Riesgo' };
  chartFactoresInst = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(function(l) { return factorLabels[l] || l; }),
      datasets: [{ label: 'Créditos afectados', data: data, backgroundColor: ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280'].slice(0, labels.length), borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 } } } }
  });
}

// ============================================================
//  REPORTE DE SEMÁFORO
// ============================================================
function renderReporteSemaforo() {
  invalidarSemaforoCache();
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  var filtro = (document.getElementById('semaforoFiltro') || {}).value || '';

  var resultados = creditos.map(function(c) {
    var eval_ = evaluarSemaforoCredito(c);
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return { credito: c, cliente: cli, semaforo: eval_.semaforo, peso: eval_.pesoTotal, alertas: eval_.alertas };
  });

  if (filtro) resultados = resultados.filter(function(r) { return r.semaforo === filtro; });
  resultados.sort(function(a, b) { return b.peso - a.peso; });

  var rojos = resultados.filter(function(r) { return r.semaforo === 'rojo'; });
  var amarillos = resultados.filter(function(r) { return r.semaforo === 'amarillo'; });
  var verdes = resultados.filter(function(r) { return r.semaforo === 'verde'; });
  var saldoRojo = rojos.reduce(function(s, r) { return s + (r.credito.saldo || 0); }, 0);
  var saldoAmarillo = amarillos.reduce(function(s, r) { return s + (r.credito.saldo || 0); }, 0);
  var totalSaldo = resultados.reduce(function(s, r) { return s + (r.credito.saldo || 0); }, 0);

  // KPIs
  document.getElementById('semaforoKPIs').innerHTML =
    '<div class="kpi-card" style="border-left:4px solid #EF4444"><div class="kpi-label">🔴 Crítico</div><div class="kpi-value" style="color:#EF4444">' + rojos.length + '</div><div class="kpi-sub">' + fmt(saldoRojo) + '</div></div>' +
    '<div class="kpi-card" style="border-left:4px solid #F59E0B"><div class="kpi-label">🟡 Precaución</div><div class="kpi-value" style="color:#F59E0B">' + amarillos.length + '</div><div class="kpi-sub">' + fmt(saldoAmarillo) + '</div></div>' +
    '<div class="kpi-card" style="border-left:4px solid #0D9F6E"><div class="kpi-label">🟢 Normal</div><div class="kpi-value" style="color:#0D9F6E">' + verdes.length + '</div><div class="kpi-sub">' + fmt(totalSaldo - saldoRojo - saldoAmarillo) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Créditos</div><div class="kpi-value">' + resultados.length + '</div><div class="kpi-sub">' + fmt(totalSaldo) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">% En Riesgo</div><div class="kpi-value" style="color:' + ((rojos.length + amarillos.length) / Math.max(resultados.length, 1) > 0.3 ? '#EF4444' : '#F59E0B') + '">' + (resultados.length > 0 ? (((rojos.length + amarillos.length) / resultados.length) * 100).toFixed(1) : '0.0') + '%</div><div class="kpi-sub">Rojo + Amarillo</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Exposición Roja</div><div class="kpi-value" style="color:#EF4444">' + (totalSaldo > 0 ? ((saldoRojo / totalSaldo) * 100).toFixed(1) : '0.0') + '%</div><div class="kpi-sub">del saldo total</div></div>';

  var semaforoIcons = { rojo: '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#EF4444;margin-right:6px;vertical-align:middle"></span>', amarillo: '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#F59E0B;margin-right:6px;vertical-align:middle"></span>', verde: '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#0D9F6E;margin-right:6px;vertical-align:middle"></span>' };

  document.getElementById('tblSemaforo').innerHTML = resultados.length === 0 ?
    '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)">Sin créditos en esta categoría</td></tr>' :
    resultados.map(function(r) {
      var alertasTxt = r.alertas.length === 0 ? '<span style="color:#0D9F6E">Sin alertas</span>' :
        r.alertas.map(function(a) { return '<span style="display:inline-block;background:' + (a.peso >= 25 ? '#FEE2E2' : a.peso >= 15 ? '#FEF3C7' : '#DBEAFE') + ';color:' + (a.peso >= 25 ? '#991B1B' : a.peso >= 15 ? '#92400E' : '#1E40AF') + ';font-size:10px;padding:2px 6px;border-radius:4px;margin:1px">' + a.texto + '</span>'; }).join(' ');
      var riesgo = calcularRiesgoCredito(r.credito.id);
      return '<tr>' +
        '<td>' + semaforoIcons[r.semaforo] + r.semaforo.charAt(0).toUpperCase() + r.semaforo.slice(1) + ' <span style="color:var(--text-muted);font-size:11px">(' + r.peso + 'pts)</span></td>' +
        '<td><strong>' + esc(r.credito.numero) + '</strong></td>' +
        '<td>' + (r.cliente ? esc(r.cliente.nombre) : '—') + '</td>' +
        '<td style="text-align:right">' + fmt(r.credito.saldo || 0) + '</td>' +
        '<td style="text-align:center;color:' + ((r.credito.diasMora || 0) > 30 ? '#EF4444' : (r.credito.diasMora || 0) > 0 ? '#F59E0B' : '#0D9F6E') + '">' + (r.credito.diasMora || 0) + '</td>' +
        '<td style="max-width:280px">' + alertasTxt + '</td>' +
        '<td style="text-align:center"><span style="background:' + (RIESGO_COLORS[riesgo.calificacion] || '#999') + ';color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">' + riesgo.calificacion + '</span></td>' +
        '<td><button class="btn btn-outline btn-sm" onclick="showPage(\'creditos\');setTimeout(function(){verCredito(' + r.credito.id + ')},200)" title="Ver crédito">👁️</button></td></tr>';
    }).join('');

  var factoresCount = {};
  resultados.forEach(function(r) {
    r.alertas.forEach(function(a) {
      factoresCount[a.factor] = (factoresCount[a.factor] || 0) + 1;
    });
  });

  renderChartSemaforo(rojos.length, amarillos.length, verdes.length);
  renderChartFactores(factoresCount);
  renderAccionesCorrectivas();
}

// ============================================================
//  EXPORTS
// ============================================================
function exportarSemaforoExcel() {
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  if (creditos.length === 0) { toast('No hay créditos para exportar', 'warning'); return; }
  var rows = creditos.map(function(c) {
    var eval_ = evaluarSemaforoCredito(c);
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return { 'Semáforo': eval_.semaforo.toUpperCase(), 'Crédito': c.numero, 'Cliente': cli ? cli.nombre : '—', 'Saldo': c.saldo || 0, 'Días Mora': c.diasMora || 0, 'Alertas': eval_.alertas.map(function(a) { return a.texto; }).join('; '), 'Peso Total': eval_.pesoTotal, 'Num Alertas': eval_.alertas.length };
  }).sort(function(a, b) { return b['Peso Total'] - a['Peso Total']; });
  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 50 }, { wch: 12 }, { wch: 12 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Semáforo');
  XLSX.writeFile(wb, 'semaforo_cartera_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Excel de semáforo exportado', 'success');
}

function exportarSemaforoPDF() {
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  if (creditos.length === 0) { toast('No hay créditos para exportar', 'warning'); return; }
  var doc = new jspdf.jsPDF('l', 'mm', 'letter');
  doc.setFontSize(16); doc.text('Semáforo de Cartera — Alertas Tempranas', 14, 18);
  doc.setFontSize(10); doc.setTextColor(100);
  doc.text(EMPRESA.nombre + ' — ' + new Date().toLocaleDateString('es-MX'), 14, 25);
  doc.setTextColor(0);
  var rows = creditos.map(function(c) {
    var eval_ = evaluarSemaforoCredito(c);
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return [eval_.semaforo.toUpperCase(), c.numero, cli ? cli.nombre : '—', fmt(c.saldo || 0), (c.diasMora || 0) + ' días', eval_.alertas.map(function(a) { return a.texto; }).join('; ') || 'Sin alertas', eval_.pesoTotal + ' pts'];
  }).sort(function(a, b) { return parseInt(b[6]) - parseInt(a[6]); });
  doc.autoTable({
    startY: 31, head: [['Semáforo', 'Crédito', 'Cliente', 'Saldo', 'Mora', 'Alertas', 'Peso']],
    body: rows, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [220, 38, 38] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 0) {
        var v = data.cell.raw;
        if (v === 'ROJO') data.cell.styles.textColor = [220, 38, 38];
        else if (v === 'AMARILLO') data.cell.styles.textColor = [217, 119, 6];
        else data.cell.styles.textColor = [13, 159, 110];
      }
    }
  });
  doc.save('semaforo_cartera_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('PDF de semáforo exportado', 'success');
}

// ============================================================
//  ACCIONES CORRECTIVAS
// ============================================================
function nuevaAccionCorrectiva() {
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var html = '<div class="form-row-3">';
  html += '<div class="form-group"><label class="form-label">Crédito</label><select class="form-select" id="accCorrCredito">';
  creditos.forEach(function(c) { html += '<option value="' + c.id + '">' + esc(c.numero) + '</option>'; });
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">Tipo Acción</label><select class="form-select" id="accCorrTipo"><option value="llamada">Llamada de cobranza</option><option value="visita">Visita domiciliaria</option><option value="reestructura">Propuesta de reestructura</option><option value="legal">Acción legal</option><option value="garantia">Ejecución de garantía</option><option value="otro">Otro</option></select></div>';
  html += '<div class="form-group"><label class="form-label">Responsable</label><input type="text" class="form-input" id="accCorrResp" value="' + (currentUser ? esc(currentUser.nombre) : '') + '"></div>';
  html += '</div>';
  html += '<div class="form-group" style="margin-bottom:12px"><label class="form-label">Descripción</label><textarea class="form-input" id="accCorrDesc" rows="2" placeholder="Detalle de la acción a tomar..."></textarea></div>';
  html += '<button class="btn btn-primary" onclick="guardarAccionCorrectiva()">Guardar Acción</button>';
  openModal('modalGenerico');
  document.getElementById('modalGenericoTitle').textContent = 'Nueva Acción Correctiva';
  document.getElementById('modalGenericoBody').innerHTML = html;
}

function guardarAccionCorrectiva() {
  var creditoId = parseInt(document.getElementById('accCorrCredito').value);
  var tipo = document.getElementById('accCorrTipo').value;
  var responsable = document.getElementById('accCorrResp').value.trim();
  var desc = document.getElementById('accCorrDesc').value.trim();
  if (!desc) { toast('Agrega una descripción', 'warning'); return; }
  var concs = getStore('conciliaciones');
  concs.push({
    id: nextId('conciliaciones'), tipo: 'accion_correctiva', creditoId: creditoId,
    tipoAccion: tipo, descripcion: desc, responsable: responsable,
    estado: 'pendiente', fecha: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString()
  });
  setStore('conciliaciones', concs);
  var cred = getStore('creditos').find(function(c) { return c.id === creditoId; });
  addAudit('Crear', 'Semáforo', 'Acción correctiva: ' + tipo + ' — Crédito ' + (cred ? cred.numero : creditoId));
  _forceCloseModal('modalGenerico');
  toast('Acción correctiva registrada', 'success');
  renderAccionesCorrectivas();
}

function cambiarEstadoAccCorr(id, nuevoEstado) {
  var concs = getStore('conciliaciones');
  concs = concs.map(function(c) {
    if (c.id === id && c.tipo === 'accion_correctiva') c.estado = nuevoEstado;
    return c;
  });
  setStore('conciliaciones', concs);
  addAudit('Actualizar', 'Semáforo', 'Acción #' + id + ' → ' + nuevoEstado);
  toast('Estado actualizado', 'success');
}

function renderAccionesCorrectivas() {
  var acciones = getStore('conciliaciones').filter(function(c) { return c.tipo === 'accion_correctiva'; });
  var creditos = getStore('creditos');
  var tipoLabels = { llamada: '📞 Llamada', visita: '🏠 Visita', reestructura: '🔄 Reestructura', legal: '⚖️ Legal', garantia: '🛡️ Garantía', otro: '📝 Otro' };
  var estadoStyles = { pendiente: 'background:#FEF3C7;color:#92400E', en_proceso: 'background:#DBEAFE;color:#1E40AF', completada: 'background:#D1FAE5;color:#065F46', cancelada: 'background:#F3F4F6;color:#6B7280' };
  var tbody = document.getElementById('tblAccionesCorr');
  if (!tbody) return;
  if (acciones.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">Sin acciones correctivas registradas</td></tr>';
    return;
  }
  tbody.innerHTML = acciones.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); }).map(function(ac) {
    var cred = creditos.find(function(c) { return c.id === ac.creditoId; });
    return '<tr><td>' + ac.fecha + '</td><td>' + (cred ? esc(cred.numero) : '#' + ac.creditoId) + '</td><td>' + (tipoLabels[ac.tipoAccion] || ac.tipoAccion) + '</td><td style="max-width:200px;font-size:12px">' + esc(ac.descripcion) + '</td><td>' + esc(ac.responsable) + '</td><td><span class="badge" style="' + (estadoStyles[ac.estado] || '') + ';font-size:10px;padding:2px 8px;border-radius:4px">' + ac.estado + '</span></td><td><select class="form-select" style="font-size:11px;padding:2px 4px;width:110px" onchange="cambiarEstadoAccCorr(' + ac.id + ',this.value)"><option value="pendiente"' + (ac.estado === 'pendiente' ? ' selected' : '') + '>Pendiente</option><option value="en_proceso"' + (ac.estado === 'en_proceso' ? ' selected' : '') + '>En proceso</option><option value="completada"' + (ac.estado === 'completada' ? ' selected' : '') + '>Completada</option><option value="cancelada"' + (ac.estado === 'cancelada' ? ' selected' : '') + '>Cancelada</option></select></td></tr>';
  }).join('');
}
