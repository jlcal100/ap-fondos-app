//  SPRINT T: CONCILIACIÓN BANCARIA
// ============================================================
var chartConcInst = null;

function renderConciliacion() {
  var concs = getStore('conciliaciones');
  var movs = concs.filter(function(c) { return c.tipo === 'movimiento'; });
  var matches = concs.filter(function(c) { return c.tipo === 'match'; });

  // Movimientos bancarios
  var tbMov = document.getElementById('tbMovBancarios');
  var vacio = document.getElementById('movBancVacio');
  if (movs.length === 0) {
    tbMov.innerHTML = '';
    vacio.style.display = '';
  } else {
    vacio.style.display = 'none';
    tbMov.innerHTML = movs.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); }).map(function(m) {
      var matchObj = matches.find(function(mt) { return mt.movBancId === m.id; });
      var estado = matchObj ? '<span class="badge" style="background:#0D9F6E;color:#fff">Conciliado</span>' :
        '<span class="badge" style="background:#F59E0B;color:#fff">Pendiente</span>';
      var acciones = matchObj ? '<button class="btn btn-outline btn-sm" onclick="desvincularConc(' + matchObj.id + ')" title="Desvincular">✕</button>' :
        '<button class="btn btn-primary btn-sm" onclick="conciliarManual(' + m.id + ')" title="Conciliar">🔗</button> ' +
        '<button class="btn btn-outline btn-sm" onclick="eliminarMovBanc(' + m.id + ')" title="Eliminar">🗑️</button>';
      return '<tr>' +
        '<td>' + m.fecha + '</td>' +
        '<td>' + esc(m.concepto) + '</td>' +
        '<td>' + esc(m.referencia || '—') + '</td>' +
        '<td style="text-align:right;font-weight:600;color:' + (m.monto >= 0 ? '#0D9F6E' : '#EF4444') + '">' + fmt(Math.abs(m.monto)) + (m.monto < 0 ? ' (E)' : ' (I)') + '</td>' +
        '<td>' + estado + '</td>' +
        '<td>' + acciones + '</td></tr>';
    }).join('');
  }

  // Resumen conciliación
  renderResumenConc(movs, matches);
}

function agregarMovBancManual() {
  document.getElementById('formMovManual').style.display = '';
  document.getElementById('formMovManual2').style.display = '';
  document.getElementById('movBancFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('movBancConcepto').value = '';
  document.getElementById('movBancMonto').value = '';
  document.getElementById('movBancRef').value = '';
}

function guardarMovBancManual() {
  var fecha = document.getElementById('movBancFecha').value;
  var concepto = document.getElementById('movBancConcepto').value.trim();
  var monto = parseFloat(document.getElementById('movBancMonto').value);
  var ref = document.getElementById('movBancRef').value.trim();
  if (!fecha || !concepto || isNaN(monto) || monto === 0) { toast('Completa fecha, concepto y monto', 'warning'); return; }

  var concs = getStore('conciliaciones');
  var mov = { id: nextId('conciliaciones'), tipo: 'movimiento', fecha: fecha, concepto: concepto, monto: monto, referencia: ref, origen: 'manual', createdAt: new Date().toISOString() };
  concs.push(mov);
  setStore('conciliaciones', concs);
  addAudit('Crear', 'Conciliación', 'Mov. bancario manual: ' + concepto + ' ' + fmt(Math.abs(monto)));
  toast('Movimiento bancario registrado', 'success');
  document.getElementById('formMovManual').style.display = 'none';
  document.getElementById('formMovManual2').style.display = 'none';
  renderConciliacion();
}

function importarMovBancCSV(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result;
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
    if (lines.length < 2) { toast('CSV vacío o sin datos', 'warning'); return; }

    var concs = getStore('conciliaciones');
    var count = 0;
    // Calcular ID base desde el array en memoria (no desde store) para evitar duplicados
    var maxIdConc = concs.length > 0 ? Math.max.apply(null, concs.map(function(c) { return c.id || 0; })) : 0;
    // Intentar detectar formato: fecha, concepto, monto[, referencia]
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(',').map(function(c) { return c.trim().replace(/^"|"$/g, ''); });
      if (cols.length < 3) continue;
      var fecha = cols[0];
      var concepto = cols[1];
      var monto = parseFloat(cols[2].replace(/[$,]/g, ''));
      var ref = cols[3] || '';
      if (!fecha || !concepto || isNaN(monto)) continue;
      // Normalizar fecha si viene como dd/mm/yyyy
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
        var parts = fecha.split('/');
        fecha = parts[2] + '-' + parts[1] + '-' + parts[0];
      }
      maxIdConc++;
      concs.push({ id: maxIdConc, tipo: 'movimiento', fecha: fecha, concepto: concepto, monto: monto, referencia: ref, origen: 'csv', createdAt: new Date().toISOString() });
      count++;
    }
    setStore('conciliaciones', concs);
    addAudit('Importar', 'Conciliación', count + ' movimientos importados de CSV');
    toast(count + ' movimientos importados exitosamente', 'success');
    renderConciliacion();
  };
  reader.readAsText(file);
  input.value = '';
}

function eliminarMovBanc(id) {
  if (!confirm('¿Eliminar este movimiento bancario?')) return;
  var concs = getStore('conciliaciones');
  concs = concs.filter(function(c) { return !(c.id === id && c.tipo === 'movimiento'); });
  // También eliminar matches que lo referencien
  concs = concs.filter(function(c) { return !(c.tipo === 'match' && c.movBancId === id); });
  setStore('conciliaciones', concs);
  addAudit('Eliminar', 'Conciliación', 'Movimiento bancario #' + id);
  toast('Movimiento eliminado', 'success');
  renderConciliacion();
}

// Fix #9: Conciliación automática batch con múltiples estrategias de matching
function ejecutarConciliacionAuto() {
  var concs = getStore('conciliaciones');
  var movs = concs.filter(function(c) { return c.tipo === 'movimiento'; });
  var matches = concs.filter(function(c) { return c.tipo === 'match'; });
  var movsConc = matches.map(function(m) { return m.movBancId; });
  var pagosConc = matches.map(function(m) { return m.pagoId || m.contabId; });
  var pendientes = movs.filter(function(m) { return movsConc.indexOf(m.id) === -1; });

  var pagos = getStore('pagos');
  var contab = getStore('contabilidad');
  var newMatches = 0;
  var matchesPorEstrategia = { referencia: 0, exacto: 0, cercano: 0, fuzzy: 0 };

  // Construir índice de pagos y contabilidad disponibles para matching rápido
  var pagosDisp = pagos.filter(function(p) { return pagosConc.indexOf('pago_' + p.id) === -1 && !p.reversado; });
  var contabDisp = contab.filter(function(ct) { return pagosConc.indexOf('contab_' + ct.id) === -1 && ct.monto > 0; });

  pendientes.forEach(function(mov) {
    var mejorMatch = null;
    var mejorScore = 0; // 0-100 confidence score
    var estrategia = '';

    // ESTRATEGIA 1: Match por referencia bancaria (más confiable)
    if (mov.referencia && mov.referencia.trim()) {
      var refNorm = mov.referencia.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      pagosDisp.forEach(function(p) {
        if (mejorScore >= 95) return; // Ya encontramos excelente match
        var pRefNorm = (p.referencia || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        // Evitar falsos positivos: refs deben tener al menos 4 caracteres y la menor
        // debe cubrir al menos 60% de la mayor para considerar substring match
        var refMinLen = Math.min(refNorm.length, pRefNorm.length);
        var refMaxLen = Math.max(refNorm.length, pRefNorm.length);
        var refCobertura = refMaxLen > 0 ? refMinLen / refMaxLen : 0;
        if (pRefNorm && refNorm && refMinLen >= 4 && refCobertura >= 0.6 && (refNorm.indexOf(pRefNorm) !== -1 || pRefNorm.indexOf(refNorm) !== -1)) {
          var montoOk = Math.abs(p.monto - Math.abs(mov.monto)) <= Math.abs(mov.monto) * 0.05;
          if (montoOk) {
            mejorMatch = { tipo: 'pago', id: p.id, monto: p.monto, fecha: p.fecha, desc: 'Pago crédito #' + p.creditoId };
            mejorScore = 98;
            estrategia = 'referencia';
          }
        }
      });
    }

    // ESTRATEGIA 2: Match exacto (monto ±$0.50 + fecha ±1 día)
    if (mejorScore < 90) {
      var candidatos = [];
      pagosDisp.forEach(function(p) {
        var diffMonto = Math.abs(p.monto - Math.abs(mov.monto));
        var diffDias = Math.abs(daysBetween(mov.fecha, p.fecha));
        if (diffMonto <= 0.50 && diffDias <= 1) {
          var score = 90 - diffDias * 2 - diffMonto;
          candidatos.push({ tipo: 'pago', id: p.id, monto: p.monto, fecha: p.fecha, desc: 'Pago crédito #' + p.creditoId, score: score });
        }
      });
      contabDisp.forEach(function(ct) {
        var diffMonto = Math.abs(ct.monto - Math.abs(mov.monto));
        var diffDias = Math.abs(daysBetween(mov.fecha, ct.fecha));
        if (diffMonto <= 0.50 && diffDias <= 1) {
          var score = 88 - diffDias * 2 - diffMonto;
          candidatos.push({ tipo: 'contab', id: ct.id, monto: ct.monto, fecha: ct.fecha, desc: ct.concepto, score: score });
        }
      });
      if (candidatos.length > 0) {
        candidatos.sort(function(a, b) { return b.score - a.score; });
        if (candidatos[0].score > mejorScore) {
          mejorMatch = candidatos[0];
          mejorScore = candidatos[0].score;
          estrategia = 'exacto';
        }
      }
    }

    // ESTRATEGIA 3: Match cercano (monto ±2% + fecha ±3 días)
    if (mejorScore < 75) {
      var toleranciaMonto = Math.abs(mov.monto) * 0.02; // 2%
      pagosDisp.forEach(function(p) {
        var diffMonto = Math.abs(p.monto - Math.abs(mov.monto));
        var diffDias = Math.abs(daysBetween(mov.fecha, p.fecha));
        if (diffMonto <= toleranciaMonto && diffDias <= 3) {
          var score = 75 - (diffDias * 5) - (diffMonto / Math.abs(mov.monto) * 50);
          if (score > mejorScore) {
            mejorMatch = { tipo: 'pago', id: p.id, monto: p.monto, fecha: p.fecha, desc: 'Pago crédito #' + p.creditoId };
            mejorScore = score;
            estrategia = 'cercano';
          }
        }
      });
    }

    // ESTRATEGIA 4: Match fuzzy (monto ±10% + fecha ±5 días, solo para ingresos)
    if (mejorScore < 55 && mov.monto > 0) {
      var toleranciaFuzzy = Math.abs(mov.monto) * 0.10; // 10%
      pagosDisp.forEach(function(p) {
        var diffMonto = Math.abs(p.monto - Math.abs(mov.monto));
        var diffDias = Math.abs(daysBetween(mov.fecha, p.fecha));
        if (diffMonto <= toleranciaFuzzy && diffDias <= 5) {
          // Base 65: permite que matches razonables (1-2 días, 2-5% diff) superen umbral 40
          var score = 65 - (diffDias * 3) - (diffMonto / Math.abs(mov.monto) * 30);
          if (score > mejorScore) {
            mejorMatch = { tipo: 'pago', id: p.id, monto: p.monto, fecha: p.fecha, desc: 'Pago crédito #' + p.creditoId };
            mejorScore = score;
            estrategia = 'fuzzy';
          }
        }
      });
    }

    // Aplicar match si confianza >= 40 (permite fuzzy matches razonables)
    if (mejorMatch && mejorScore >= 40) {
      var refId = mejorMatch.tipo === 'pago' ? 'pago_' + mejorMatch.id : 'contab_' + mejorMatch.id;
      concs.push({
        id: nextId('conciliaciones'),
        tipo: 'match',
        movBancId: mov.id,
        pagoId: refId,
        montoMovBanc: mov.monto,
        montoSistema: mejorMatch.monto,
        diferencia: +(Math.abs(mov.monto) - mejorMatch.monto).toFixed(2),
        descSistema: mejorMatch.desc,
        fechaConc: new Date().toISOString().split('T')[0],
        metodo: 'auto_' + estrategia,
        confianza: Math.round(mejorScore),
        createdAt: new Date().toISOString()
      });
      pagosConc.push(refId);
      // Remover de disponibles para no usar dos veces
      if (mejorMatch.tipo === 'pago') pagosDisp = pagosDisp.filter(function(p) { return p.id !== mejorMatch.id; });
      else contabDisp = contabDisp.filter(function(ct) { return ct.id !== mejorMatch.id; });
      newMatches++;
      matchesPorEstrategia[estrategia]++;
    }
  });

  setStore('conciliaciones', concs);

  // Resumen detallado
  var resumen = newMatches + ' movimientos conciliados';
  var detalle = [];
  if (matchesPorEstrategia.referencia > 0) detalle.push(matchesPorEstrategia.referencia + ' por referencia');
  if (matchesPorEstrategia.exacto > 0) detalle.push(matchesPorEstrategia.exacto + ' exactos');
  if (matchesPorEstrategia.cercano > 0) detalle.push(matchesPorEstrategia.cercano + ' cercanos');
  if (matchesPorEstrategia.fuzzy > 0) detalle.push(matchesPorEstrategia.fuzzy + ' fuzzy');
  if (detalle.length > 0) resumen += ' (' + detalle.join(', ') + ')';
  var pendientesRestantes = pendientes.length - newMatches;
  if (pendientesRestantes > 0) resumen += '. ' + pendientesRestantes + ' pendientes de revisión manual.';

  addAudit('Conciliar', 'Conciliación', 'Automática batch: ' + resumen);
  toast(newMatches > 0 ? resumen : 'No se encontraron coincidencias nuevas', newMatches > 0 ? 'success' : 'info');
  renderConciliacion();
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return Infinity;
  var a = new Date(d1), b = new Date(d2);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return Infinity;
  return Math.round((a - b) / 86400000);
}

function conciliarManual(movId) {
  var concs = getStore('conciliaciones');
  var mov = concs.find(function(c) { return c.id === movId && c.tipo === 'movimiento'; });
  if (!mov) return;

  // Mostrar pagos y contabilidad cercanos para seleccionar
  var pagos = getStore('pagos');
  var contab = getStore('contabilidad');
  var matches = concs.filter(function(c) { return c.tipo === 'match'; });
  var usados = matches.map(function(m) { return m.pagoId; });

  var opciones = [];
  pagos.forEach(function(p) {
    if (usados.indexOf('pago_' + p.id) !== -1) return;
    var diffMonto = Math.abs(p.monto - Math.abs(mov.monto));
    if (diffMonto <= Math.abs(mov.monto) * 0.2) { // 20% tolerancia para manual
      opciones.push({ refId: 'pago_' + p.id, desc: 'Pago crédito #' + p.creditoId + ' — ' + p.fecha, monto: p.monto, diffMonto: diffMonto });
    }
  });
  contab.forEach(function(ct) {
    if (usados.indexOf('contab_' + ct.id) !== -1) return;
    if (ct.monto <= 0) return;
    var diffMonto = Math.abs(ct.monto - Math.abs(mov.monto));
    if (diffMonto <= Math.abs(mov.monto) * 0.2) {
      opciones.push({ refId: 'contab_' + ct.id, desc: ct.concepto + ' — ' + ct.fecha, monto: ct.monto, diffMonto: diffMonto });
    }
  });

  opciones.sort(function(a, b) { return a.diffMonto - b.diffMonto; });
  if (opciones.length === 0) { toast('No se encontraron registros similares para conciliar', 'info'); return; }

  var html = '<div style="max-height:300px;overflow-y:auto">';
  html += '<p style="margin-bottom:12px;color:var(--text-muted)">Mov. bancario: <strong>' + esc(mov.concepto) + '</strong> — ' + fmt(Math.abs(mov.monto)) + ' — ' + mov.fecha + '</p>';
  html += '<table class="data-table"><thead><tr><th>Registro</th><th>Monto</th><th>Diff</th><th></th></tr></thead><tbody>';
  opciones.slice(0, 10).forEach(function(op) {
    html += '<tr><td style="font-size:12px">' + esc(op.desc) + '</td>' +
      '<td style="text-align:right">' + fmt(op.monto) + '</td>' +
      '<td style="text-align:right;color:' + (op.diffMonto < 1 ? '#0D9F6E' : '#F59E0B') + '">' + fmt(op.diffMonto) + '</td>' +
      '<td><button class="btn btn-primary btn-sm" onclick="confirmarConcManual(' + movId + ',\'' + op.refId + '\',' + op.monto + ')">Vincular</button></td></tr>';
  });
  html += '</tbody></table></div>';

  openModal('modalGenerico');
  document.getElementById('modalGenericoTitle').textContent = 'Conciliación Manual';
  document.getElementById('modalGenericoBody').innerHTML = html;
}

function confirmarConcManual(movId, refId, montoSistema) {
  var concs = getStore('conciliaciones');
  var mov = concs.find(function(c) { return c.id === movId; });
  if (!mov) return;

  concs.push({
    id: nextId('conciliaciones'),
    tipo: 'match',
    movBancId: movId,
    pagoId: refId,
    montoMovBanc: mov.monto,
    montoSistema: montoSistema,
    diferencia: +(Math.abs(mov.monto) - montoSistema).toFixed(2),
    descSistema: refId,
    fechaConc: new Date().toISOString().split('T')[0],
    metodo: 'manual',
    createdAt: new Date().toISOString()
  });
  setStore('conciliaciones', concs);
  addAudit('Conciliar', 'Conciliación', 'Manual: Mov #' + movId + ' ↔ ' + refId);
  _forceCloseModal('modalGenerico');
  toast('Movimiento conciliado manualmente', 'success');
  renderConciliacion();
}

function desvincularConc(matchId) {
  if (!confirm('¿Desvincular esta conciliación?')) return;
  var concs = getStore('conciliaciones');
  concs = concs.filter(function(c) { return c.id !== matchId; });
  setStore('conciliaciones', concs);
  addAudit('Desvincular', 'Conciliación', 'Match #' + matchId);
  toast('Conciliación desvinculada', 'success');
  renderConciliacion();
}

function renderResumenConc(movs, matches) {
  var totalMovs = movs.length;
  var totalConc = matches.length;
  var pendientes = totalMovs - totalConc;
  var pctConc = totalMovs > 0 ? ((totalConc / totalMovs) * 100).toFixed(1) : '0.0';
  var sumIngreso = 0, sumEgreso = 0, sumDiff = 0;
  movs.forEach(function(m) { if (m.monto >= 0) sumIngreso += m.monto; else sumEgreso += Math.abs(m.monto); });
  matches.forEach(function(m) { sumDiff += Math.abs(m.diferencia || 0); });

  document.getElementById('concKPIs').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Movimientos</div><div class="kpi-value">' + totalMovs + '</div><div class="kpi-sub">' + totalConc + ' conciliados</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">% Conciliado</div><div class="kpi-value" style="color:' + (parseFloat(pctConc) >= 80 ? '#0D9F6E' : '#F59E0B') + '">' + pctConc + '%</div><div class="kpi-sub">' + pendientes + ' pendientes</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Ingresos Banco</div><div class="kpi-value" style="color:#0D9F6E">' + fmt(sumIngreso) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Egresos Banco</div><div class="kpi-value" style="color:#EF4444">' + fmt(sumEgreso) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Saldo Neto</div><div class="kpi-value">' + fmt(sumIngreso - sumEgreso) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Diferencias</div><div class="kpi-value" style="color:' + (sumDiff > 0 ? '#EF4444' : '#0D9F6E') + '">' + fmt(sumDiff) + '</div><div class="kpi-sub">Acum. en matches</div></div>';

  // Tabla de conciliaciones
  var tbConc = document.getElementById('tbConciliacion');
  if (matches.length === 0) {
    tbConc.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px">Sin conciliaciones aún. Ejecuta la conciliación automática o vincula manualmente.</td></tr>';
  } else {
    tbConc.innerHTML = matches.map(function(mt) {
      var mov = movs.find(function(m) { return m.id === mt.movBancId; });
      var diffColor = Math.abs(mt.diferencia) < 0.01 ? '#0D9F6E' : '#F59E0B';
      return '<tr>' +
        '<td style="font-size:12px">' + (mov ? esc(mov.concepto) : '#' + mt.movBancId) + '</td>' +
        '<td>' + (mov ? mov.fecha : '—') + '</td>' +
        '<td style="text-align:right">' + fmt(Math.abs(mt.montoMovBanc)) + '</td>' +
        '<td style="text-align:center;font-size:18px;color:var(--text-muted)">↔</td>' +
        '<td style="font-size:12px">' + esc(mt.descSistema || mt.pagoId) + '</td>' +
        '<td style="text-align:right">' + fmt(mt.montoSistema) + '</td>' +
        '<td style="text-align:right;color:' + diffColor + ';font-weight:600">' + fmt(Math.abs(mt.diferencia)) + '</td>' +
        '<td><span class="badge" style="background:' + (mt.metodo === 'auto' ? '#3B82F6' : '#8B5CF6') + ';color:#fff;font-size:10px">' + (mt.metodo === 'auto' ? 'Auto' : 'Manual') + '</span></td>' +
        '<td><button class="btn btn-outline btn-sm" onclick="desvincularConc(' + mt.id + ')">✕</button></td></tr>';
    }).join('');
  }

  // Gráfica
  renderChartConciliacion(totalConc, pendientes);
}

function renderChartConciliacion(conciliados, pendientes) {
  if (chartConcInst) chartConcInst.destroy();
  var ctx = document.getElementById('chartConciliacion');
  if (!ctx) return;
  chartConcInst = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Conciliados', 'Pendientes'],
      datasets: [{ data: [conciliados, pendientes], backgroundColor: ['#0D9F6E', '#F59E0B'], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + ctx.parsed + ' movimientos'; } } }
      }
    }
  });
}

function exportarConciliacionPDF() {
  var concs = getStore('conciliaciones');
  var matches = concs.filter(function(c) { return c.tipo === 'match'; });
  var movs = concs.filter(function(c) { return c.tipo === 'movimiento'; });
  if (movs.length === 0) { toast('No hay movimientos para exportar', 'warning'); return; }

  var doc = new jspdf.jsPDF('l', 'mm', 'letter');
  doc.setFontSize(16);
  doc.text('Reporte de Conciliación Bancaria', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(EMPRESA.nombre + ' — ' + new Date().toLocaleDateString('es-MX'), 14, 25);
  doc.text('Movimientos: ' + movs.length + ' | Conciliados: ' + matches.length + ' | Pendientes: ' + (movs.length - matches.length), 14, 31);
  doc.setTextColor(0);

  // Tabla de movimientos
  var rows = movs.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); }).map(function(m) {
    var matchObj = matches.find(function(mt) { return mt.movBancId === m.id; });
    return [m.fecha, m.concepto, m.referencia || '', fmt(Math.abs(m.monto)), m.monto >= 0 ? 'Ingreso' : 'Egreso', matchObj ? 'Conciliado' : 'Pendiente'];
  });
  doc.autoTable({
    startY: 36, head: [['Fecha', 'Concepto', 'Referencia', 'Monto', 'Tipo', 'Estado']],
    body: rows, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [220, 38, 38] }
  });
  doc.save('conciliacion_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('PDF de conciliación exportado', 'success');
}

function exportarConciliacionExcel() {
  var concs = getStore('conciliaciones');
  var movs = concs.filter(function(c) { return c.tipo === 'movimiento'; });
  var matches = concs.filter(function(c) { return c.tipo === 'match'; });
  if (movs.length === 0) { toast('No hay movimientos para exportar', 'warning'); return; }

  var rows = movs.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); }).map(function(m) {
    var matchObj = matches.find(function(mt) { return mt.movBancId === m.id; });
    return {
      'Fecha': m.fecha, 'Concepto': m.concepto, 'Referencia': m.referencia || '',
      'Monto': Math.abs(m.monto), 'Tipo': m.monto >= 0 ? 'Ingreso' : 'Egreso',
      'Estado': matchObj ? 'Conciliado' : 'Pendiente',
      'Monto Sistema': matchObj ? matchObj.montoSistema : '', 'Diferencia': matchObj ? matchObj.diferencia : '',
      'Método': matchObj ? matchObj.metodo : ''
    };
  });
  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conciliación');
  XLSX.writeFile(wb, 'conciliacion_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Excel de conciliación exportado', 'success');
}

