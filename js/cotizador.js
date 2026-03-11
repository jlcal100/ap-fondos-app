// Formato de miles para inputs del cotizador
function formatMiles(el) {
  const pos = el.selectionStart;
  const prevLen = el.value.length;
  const raw = el.value.replace(/[^0-9.]/g, '');
  const parts = raw.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  el.value = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];
  // Ajustar cursor
  const diff = el.value.length - prevLen;
  el.setSelectionRange(pos + diff, pos + diff);
}
function parseMiles(id) {
  return parseFloat((document.getElementById(id).value || '0').replace(/,/g, '')) || 0;
}
// Setear valor formateado con miles en un input
function setInputMiles(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = parseFloat(val) || 0;
  if (n === 0) { el.value = ''; return; }
  const parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  el.value = parts.join('.');
}

let cotizadorTipo = 'credito_simple';
let lastCotizacion = null;

function setCotizadorTab(tipo) {
  cotizadorTipo = tipo;
  document.querySelectorAll('#page-cotizador .tab').forEach(t => t.classList.remove('active'));
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');
  // Sprint S: toggle entre cotizador normal y escenarios
  var esEscenarios = tipo === 'escenarios';
  var formCards = document.querySelectorAll('#page-cotizador > .card');
  formCards.forEach(function(c) { c.style.display = esEscenarios ? 'none' : ''; });
  var secEsc = document.getElementById('seccionEscenarios');
  if (secEsc) secEsc.style.display = esEscenarios ? '' : 'none';
  if (esEscenarios) return;
  document.getElementById('cotVRGroup').style.display = tipo === 'arrendamiento' ? 'block' : 'none';
  document.getElementById('cotIVAGroup').style.display = tipo === 'arrendamiento' ? 'block' : 'none';
  if (tipo === 'nomina') {
    document.getElementById('cotPeriodicidad').value = 'quincenal';
    document.getElementById('cotTasa').value = '36';
    document.getElementById('cotPlazo').value = '12';
    setInputMiles('cotMonto', 80000);
  } else if (tipo === 'arrendamiento') {
    document.getElementById('cotPeriodicidad').value = 'mensual';
    document.getElementById('cotTasa').value = '22';
    document.getElementById('cotPlazo').value = '36';
    setInputMiles('cotMonto', 2000000);
  } else {
    document.getElementById('cotPeriodicidad').value = 'mensual';
    document.getElementById('cotTasa').value = '24';
    document.getElementById('cotPlazo').value = '24';
    setInputMiles('cotMonto', 500000);
  }
}

function calcularCotizacion() {
  const monto = parseMiles('cotMonto');
  const tasa = parseFloat(document.getElementById('cotTasa').value) / 100;
  const plazo = parseInt(document.getElementById('cotPlazo').value);
  const periodicidad = document.getElementById('cotPeriodicidad').value;
  const vrPct = cotizadorTipo === 'arrendamiento' ? parseFloat(document.getElementById('cotVR').value) || 0 : 0;
  const ivaPct = cotizadorTipo === 'arrendamiento' ? parseInt(document.getElementById('cotIVA').value) || 0 : 0;
  // Bug #20: Comisión de apertura
  const comisionPct = parseFloat(document.getElementById('cotComision').value) || 0;
  const comisionApertura = +(monto * (comisionPct / 100)).toFixed(2);

  if (!monto || !tasa || !plazo) return toast('Complete todos los campos', 'error');

  const tabla = generarAmortizacion(monto, tasa, plazo, periodicidad, new Date().toISOString().split('T')[0], vrPct, ivaPct, cotizadorTipo);
  const pagoP = tabla[0]?.pagoTotal || 0;
  const totalIntereses = tabla.reduce((s, r) => s + r.interes, 0);
  const totalIVA = tabla.reduce((s, r) => s + r.iva, 0);
  const costoTotal = tabla.reduce((s, r) => s + r.pagoTotal, 0) + comisionApertura;

  // CAT: Costo Anual Total (metodología Banxico Circular 21/2009)
  // Para S.A. de C.V.: incluye IVA 16% sobre intereses y sobre comisión de apertura
  const fechaHoy = new Date().toISOString().split('T')[0];
  const catOpciones = {
    ivaComision: +(comisionApertura * 0.16).toFixed(2),
    // Si la tabla ya incluye IVA (arrendamiento con ivaPct > 0), no duplicar
    ivaIntereses: ivaPct === 0
  };
  const cat = calcularCAT(monto, tabla, fechaHoy, comisionApertura, catOpciones);
  const catPct = (cat * 100).toFixed(1);

  lastCotizacion = { tipo: cotizadorTipo, monto, tasa, plazo, periodicidad, vrPct, tabla, pagoP, totalIntereses, totalIVA, costoTotal, comisionApertura, comisionPct, cat, catPct };

  document.getElementById('cotResultado').style.display = 'block';
  document.getElementById('cotResumen').innerHTML = `
    <div class="kpi-card navy"><div class="kpi-label">Pago ${periodicidad}</div><div class="kpi-value">${fmt(pagoP)}</div></div>
    <div class="kpi-card red"><div class="kpi-label">Total Intereses</div><div class="kpi-value">${fmt(totalIntereses)}</div></div>
    <div class="kpi-card blue"><div class="kpi-label">Costo Total del Crédito</div><div class="kpi-value">${fmt(costoTotal)}</div></div>
    <div class="kpi-card" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff"><div class="kpi-label" style="color:rgba(255,255,255,0.8)">CAT</div><div class="kpi-value">${catPct}%</div><div class="kpi-sub" style="color:rgba(255,255,255,0.7)">Costo Anual Total</div></div>
    ${comisionApertura > 0 ? `<div class="kpi-card yellow"><div class="kpi-label">Comisión Apertura</div><div class="kpi-value">${fmt(comisionApertura)}</div><div class="kpi-sub">${comisionPct}% del monto</div></div>` : ''}
    ${ivaPct > 0 ? `<div class="kpi-card yellow"><div class="kpi-label">IVA Total</div><div class="kpi-value">${fmt(totalIVA)}</div></div>` : ''}
    <div class="kpi-card green"><div class="kpi-label">Monto</div><div class="kpi-value">${fmt(monto)}</div></div>
    <div class="kpi-card orange"><div class="kpi-label">No. Pagos</div><div class="kpi-value">${tabla.length}</div></div>
  `;

  document.getElementById('tbAmortCot').innerHTML = tabla.map(r => `<tr>
    <td>${r.numero}</td><td>${fmtDate(r.fecha)}</td><td>${fmt(r.saldoInicial)}</td>
    <td>${fmt(r.capital)}</td><td>${fmt(r.interes)}</td><td>${fmt(r.iva)}</td>
    <td><strong>${fmt(r.pagoTotal)}</strong></td><td>${fmt(r.saldoFinal)}</td>
  </tr>`).join('');

  document.getElementById('cotResultado').scrollIntoView({ behavior: 'smooth' });
}

// Bug #27: Exportación PDF programática con jsPDF + autoTable
function exportCotizacionPDF() {
  if (!hasPermiso('cotizador', 'exportar')) return toast('Sin permiso para exportar cotizaciones', 'error');
  if (!lastCotizacion) return;
  showLoading('Generando PDF...');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'letter');

    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 48, 80);
    doc.text(EMPRESA.nombre, 20, 20);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Cotización Financiera', 20, 28);

    // Info
    doc.setFontSize(10);
    doc.setTextColor(0);
    const cot = lastCotizacion;
    doc.text('Producto: ' + (tipoLabel[cot.tipo] || cot.tipo), 20, 38);
    doc.text('Monto: ' + fmt(cot.monto) + '  |  Tasa: ' + (cot.tasa * 100).toFixed(2) + '%  |  Plazo: ' + cot.plazo + ' meses  |  CAT: ' + (cot.catPct || '0.0') + '%', 20, 44);

    // Summary boxes
    let y = 52;
    const boxes = [
      ['Pago Periódico', fmt(cot.pagoP)],
      ['Total Intereses', fmt(cot.totalIntereses)],
      ['Costo Total', fmt(cot.costoTotal)],
      ['CAT', (cot.catPct || '0.0') + '%']
    ];
    if (cot.comisionApertura > 0) boxes.push(['Comisión Apertura', fmt(cot.comisionApertura)]);
    const bw = (170 / boxes.length);
    boxes.forEach((b, i) => {
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(20 + i * bw, y, bw - 4, 18, 2, 2, 'F');
      doc.setFontSize(7); doc.setTextColor(100);
      doc.text(b[0], 20 + i * bw + (bw - 4) / 2, y + 6, { align: 'center' });
      doc.setFontSize(11); doc.setTextColor(30, 48, 80);
      doc.text(b[1], 20 + i * bw + (bw - 4) / 2, y + 14, { align: 'center' });
    });

    // Table
    doc.autoTable({
      startY: y + 24,
      head: [['#', 'Fecha', 'Saldo Inicial', 'Capital', 'Interés', 'IVA', 'Pago Total', 'Saldo Final']],
      body: cot.tabla.map(r => [r.numero, r.fecha, fmt(r.saldoInicial), fmt(r.capital), fmt(r.interes), fmt(r.iva), fmt(r.pagoTotal), fmt(r.saldoFinal)]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 48, 80], textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      margin: { left: 20, right: 20 }
    });

    // Footer
    const pageH = doc.internal.pageSize.height;
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text('Generado el ' + new Date().toLocaleDateString('es-MX') + ' — ' + EMPRESA.nombre + '. Cotización informativa, no constituye una oferta de crédito.', 20, pageH - 10);

    doc.save('Cotizacion_AP_' + new Date().toISOString().split('T')[0] + '.pdf');
    toast('PDF generado exitosamente', 'success');
  } catch (err) {
    toast('Error al generar PDF: ' + err.message, 'error');
  }
  hideLoading();
}

function guardarCotizacion() {
  if (!lastCotizacion) return;
  const cots = getStore('cotizaciones');
  cots.push({ id: cots.length + 1, ...lastCotizacion, createdAt: new Date().toISOString() });
  setStore('cotizaciones', cots);
  addAudit('Guardar', 'Cotizador', `${tipoLabel[lastCotizacion.tipo]} - ${fmt(lastCotizacion.monto)}`);
  toast('Cotización guardada exitosamente', 'success');
}

// ============================================================
//  SPRINT S: SIMULADOR DE ESCENARIOS
// ============================================================
var lastEscenarios = null;
var chartEscInst = null;

function simularEscenarios() {
  var varMin = parseFloat(document.getElementById('escVarMin').value) || -3;
  var varMax = parseFloat(document.getElementById('escVarMax').value) || 3;
  var step = parseFloat(document.getElementById('escStep').value) || 1;
  var tiie = parseFloat(document.getElementById('escTIIE').value) || 11.25;
  var horizonte = parseInt(document.getElementById('escHorizonte').value) || 12;
  if (step <= 0) step = 0.5;
  if (varMin >= varMax) { toast('Variación mínima debe ser menor que máxima', 'warning'); return; }

  var creditos = getStore('creditos').filter(function(c) { return c.estado === 'vigente'; });
  var fondeos = getStore('fondeos').filter(function(f) { return f.estado === 'vigente'; });

  // Calcular base: ingresos cartera y costo fondeos actuales
  var carteraSaldo = 0, tasaPromCartera = 0, fondeoSaldo = 0, tasaPromFondeo = 0;
  creditos.forEach(function(c) {
    var saldo = c.saldoActual || c.monto || 0;
    carteraSaldo += saldo;
    tasaPromCartera += (c.tasa || 0) * saldo;
  });
  fondeos.forEach(function(f) {
    var saldo = f.saldoActual || f.monto || 0;
    fondeoSaldo += saldo;
    tasaPromFondeo += (f.tasa || 0) * saldo;
  });
  tasaPromCartera = carteraSaldo > 0 ? tasaPromCartera / carteraSaldo : 0;
  tasaPromFondeo = fondeoSaldo > 0 ? tasaPromFondeo / fondeoSaldo : 0;

  // Generar escenarios
  var escenarios = [];
  for (var v = varMin; v <= varMax + 0.001; v = +(v + step).toFixed(4)) {
    var varTasa = +v.toFixed(2);
    var tasaCartera = tasaPromCartera + varTasa;
    var tasaFondeo = tasaPromFondeo + varTasa * 0.7; // fondeos reaccionan al 70%
    var ingresoAnual = carteraSaldo * (tasaCartera / 100);
    var costoAnual = fondeoSaldo * (tasaFondeo / 100);
    var ingresoPeriodo = ingresoAnual * (horizonte / 12);
    var costoPeriodo = costoAnual * (horizonte / 12);
    var spread = tasaCartera - tasaFondeo;
    var utilidad = ingresoPeriodo - costoPeriodo;
    escenarios.push({
      variacion: varTasa,
      tasaCartera: +tasaCartera.toFixed(2),
      tasaFondeo: +tasaFondeo.toFixed(2),
      ingresoCartera: +ingresoPeriodo.toFixed(2),
      costoFondeo: +costoPeriodo.toFixed(2),
      spread: +spread.toFixed(2),
      utilidad: +utilidad.toFixed(2),
      esBase: Math.abs(varTasa) < 0.001
    });
  }

  var base = escenarios.find(function(e) { return e.esBase; }) || escenarios[Math.floor(escenarios.length / 2)];
  lastEscenarios = { escenarios: escenarios, base: base, carteraSaldo: carteraSaldo, fondeoSaldo: fondeoSaldo, tiie: tiie, horizonte: horizonte, tasaPromCartera: tasaPromCartera, tasaPromFondeo: tasaPromFondeo };

  renderEscenariosResultados();
  document.getElementById('escResultados').style.display = '';
  addAudit('Simulación', 'Cotizador', 'Simulación de ' + escenarios.length + ' escenarios de tasa');
}

function renderEscenariosResultados() {
  if (!lastEscenarios) return;
  var esc = lastEscenarios.escenarios;
  var base = lastEscenarios.base;
  var peor = esc[0], mejor = esc[esc.length - 1];
  if (peor.utilidad > mejor.utilidad) { var tmp = peor; peor = mejor; mejor = tmp; }

  // KPIs
  document.getElementById('escKPIs').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Cartera Vigente</div><div class="kpi-value">' + fmt(lastEscenarios.carteraSaldo) + '</div><div class="kpi-sub">' + lastEscenarios.tasaPromCartera.toFixed(2) + '% prom.</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Fondeo Vigente</div><div class="kpi-value">' + fmt(lastEscenarios.fondeoSaldo) + '</div><div class="kpi-sub">' + lastEscenarios.tasaPromFondeo.toFixed(2) + '% prom.</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Spread Base</div><div class="kpi-value">' + base.spread.toFixed(2) + ' pts</div><div class="kpi-sub">Utilidad: ' + fmt(base.utilidad) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Mejor Escenario</div><div class="kpi-value" style="color:#0D9F6E">' + fmt(mejor.utilidad) + '</div><div class="kpi-sub">Var: ' + (mejor.variacion > 0 ? '+' : '') + mejor.variacion + ' pts</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Peor Escenario</div><div class="kpi-value" style="color:#EF4444">' + fmt(peor.utilidad) + '</div><div class="kpi-sub">Var: ' + (peor.variacion > 0 ? '+' : '') + peor.variacion + ' pts</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Rango Utilidad</div><div class="kpi-value">' + fmt(mejor.utilidad - peor.utilidad) + '</div><div class="kpi-sub">' + esc.length + ' escenarios</div></div>';

  // Tabla de sensibilidad
  var thead = '<tr><th>Variación</th><th>Tasa Cartera</th><th>Tasa Fondeo</th><th>Spread</th><th>Ingreso</th><th>Costo</th><th>Utilidad</th><th>Δ vs Base</th></tr>';
  document.getElementById('tblSensHead').innerHTML = thead;
  var tbody = '';
  esc.forEach(function(e) {
    var delta = e.utilidad - base.utilidad;
    var deltaColor = delta > 0 ? '#0D9F6E' : delta < 0 ? '#EF4444' : 'var(--text-primary)';
    var rowBg = e.esBase ? 'background:rgba(59,130,246,0.08);font-weight:600' : '';
    tbody += '<tr style="' + rowBg + '">' +
      '<td style="text-align:center">' + (e.variacion > 0 ? '+' : '') + e.variacion.toFixed(2) + ' pts' + (e.esBase ? ' <span class="badge" style="background:#3B82F6;color:#fff;font-size:10px">BASE</span>' : '') + '</td>' +
      '<td style="text-align:center">' + e.tasaCartera.toFixed(2) + '%</td>' +
      '<td style="text-align:center">' + e.tasaFondeo.toFixed(2) + '%</td>' +
      '<td style="text-align:center;font-weight:600">' + e.spread.toFixed(2) + ' pts</td>' +
      '<td style="text-align:right">' + fmt(e.ingresoCartera) + '</td>' +
      '<td style="text-align:right">' + fmt(e.costoFondeo) + '</td>' +
      '<td style="text-align:right;font-weight:600;color:' + (e.utilidad >= 0 ? '#0D9F6E' : '#EF4444') + '">' + fmt(e.utilidad) + '</td>' +
      '<td style="text-align:right;color:' + deltaColor + '">' + (delta > 0 ? '+' : '') + fmt(delta) + '</td>' +
      '</tr>';
  });
  document.getElementById('tblSensBody').innerHTML = tbody;

  // Detalle
  var detBody = '';
  esc.forEach(function(e, i) {
    var delta = e.utilidad - base.utilidad;
    var deltaPct = base.utilidad !== 0 ? ((delta / Math.abs(base.utilidad)) * 100).toFixed(1) : '0.0';
    var impacto = delta > 0 ? '<span style="color:#0D9F6E">▲ Favorable</span>' : delta < 0 ? '<span style="color:#EF4444">▼ Adverso</span>' : '<span style="color:#6B7280">— Neutro</span>';
    var nombre = e.esBase ? 'Base' : e.variacion > 0 ? 'Alcista +' + e.variacion : 'Bajista ' + e.variacion;
    detBody += '<tr>' +
      '<td><strong>' + nombre + '</strong></td>' +
      '<td style="text-align:center">' + (e.variacion > 0 ? '+' : '') + e.variacion.toFixed(2) + ' pts</td>' +
      '<td style="text-align:right">' + fmt(e.ingresoCartera) + '</td>' +
      '<td style="text-align:right">' + fmt(e.costoFondeo) + '</td>' +
      '<td style="text-align:center;font-weight:600">' + e.spread.toFixed(2) + '%</td>' +
      '<td style="text-align:right;font-weight:600">' + fmt(e.utilidad) + '</td>' +
      '<td style="text-align:right;color:' + (delta >= 0 ? '#0D9F6E' : '#EF4444') + '">' + (delta > 0 ? '+' : '') + fmt(delta) + ' (' + deltaPct + '%)</td>' +
      '<td>' + impacto + '</td></tr>';
  });
  document.getElementById('tblEscDetalle').innerHTML = detBody;

  // Gráfica
  renderChartEscenarios(esc, base);
}

function renderChartEscenarios(esc, base) {
  if (chartEscInst) chartEscInst.destroy();
  var ctx = document.getElementById('chartEscenarios').getContext('2d');
  var labels = esc.map(function(e) { return (e.variacion > 0 ? '+' : '') + e.variacion.toFixed(1) + ' pts'; });
  var bgColors = esc.map(function(e) { return e.utilidad >= base.utilidad ? 'rgba(13,159,110,0.7)' : 'rgba(239,68,68,0.7)'; });

  chartEscInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Utilidad Estimada', data: esc.map(function(e) { return e.utilidad; }), backgroundColor: bgColors, borderRadius: 4 },
        { label: 'Spread (pts)', data: esc.map(function(e) { return e.spread; }), type: 'line', borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.1)', yAxisID: 'y1', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#F59E0B', borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + (ctx.datasetIndex === 0 ? fmt(ctx.parsed.y) : ctx.parsed.y.toFixed(2) + ' pts'); } } }
      },
      scales: {
        y: { position: 'left', ticks: { callback: function(v) { return fmt(v); } }, title: { display: true, text: 'Utilidad' } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function(v) { return v.toFixed(1) + '%'; } }, title: { display: true, text: 'Spread' } }
      }
    }
  });
}

function exportarEscenariosPDF() {
  if (!lastEscenarios) { toast('Ejecuta una simulación primero', 'warning'); return; }
  var doc = new jspdf.jsPDF('l', 'mm', 'letter');
  doc.setFontSize(16);
  doc.text('Simulación de Escenarios de Tasas', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(EMPRESA.nombre + ' — ' + new Date().toLocaleDateString('es-MX'), 14, 25);
  doc.text('TIIE Ref: ' + lastEscenarios.tiie + '% | Horizonte: ' + lastEscenarios.horizonte + ' meses | Cartera: ' + fmt(lastEscenarios.carteraSaldo) + ' | Fondeo: ' + fmt(lastEscenarios.fondeoSaldo), 14, 31);
  doc.setTextColor(0);

  var rows = lastEscenarios.escenarios.map(function(e) {
    var delta = e.utilidad - lastEscenarios.base.utilidad;
    return [
      (e.variacion > 0 ? '+' : '') + e.variacion.toFixed(2),
      e.tasaCartera.toFixed(2) + '%',
      e.tasaFondeo.toFixed(2) + '%',
      e.spread.toFixed(2),
      fmt(e.ingresoCartera),
      fmt(e.costoFondeo),
      fmt(e.utilidad),
      (delta > 0 ? '+' : '') + fmt(delta)
    ];
  });
  doc.autoTable({
    startY: 36,
    head: [['Var. Tasa', 'Tasa Cartera', 'Tasa Fondeo', 'Spread', 'Ingreso', 'Costo Fondeo', 'Utilidad', 'Δ vs Base']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 38, 38] }
  });

  doc.save('escenarios_tasas_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('PDF de escenarios exportado', 'success');
}

function exportarEscenariosExcel() {
  if (!lastEscenarios) { toast('Ejecuta una simulación primero', 'warning'); return; }
  var rows = lastEscenarios.escenarios.map(function(e) {
    return {
      'Variación (pts)': e.variacion,
      'Tasa Cartera (%)': e.tasaCartera,
      'Tasa Fondeo (%)': e.tasaFondeo,
      'Spread (pts)': e.spread,
      'Ingreso Cartera': e.ingresoCartera,
      'Costo Fondeo': e.costoFondeo,
      'Utilidad Estimada': e.utilidad,
      'Delta vs Base': e.utilidad - lastEscenarios.base.utilidad
    };
  });
  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Escenarios');
  XLSX.writeFile(wb, 'escenarios_tasas_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Excel de escenarios exportado', 'success');
}

