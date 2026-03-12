
// ============================================================
//  SPRINT R: INDICADORES DE RIESGO Y SCORING DE CARTERA
// ============================================================
var RIESGO_LABELS = { A1: 'Mínimo', A2: 'Bajo', B1: 'Moderado bajo', B2: 'Moderado', C1: 'Medio', C2: 'Medio alto', D: 'Alto', E: 'Crítico' };
var RIESGO_COLORS = { A1: '#0D9F6E', A2: '#34D399', B1: '#3B82F6', B2: '#60A5FA', C1: '#F59E0B', C2: '#FB923C', D: '#EF4444', E: '#991B1B' };

function calcularRiesgoCredito(creditoId) {
  var credito = getStore('creditos').find(function(c) { return c.id === creditoId; });
  if (!credito) return { score: 0, calificacion: 'E', factores: [] };
  var cliente = getStore('clientes').find(function(cl) { return cl.id === credito.clienteId; });
  var pagos = getStore('pagos').filter(function(p) { return p.creditoId === creditoId; });
  var garantias = getGarantiasCredito(creditoId);
  var cobertura = getCoberturaGarantias(creditoId);

  var puntos = 100; // Empezar en 100, se restan puntos por factores de riesgo
  var factores = [];

  // 1. Días de mora (peso: 30 pts)
  var diasMora = credito.diasMora || 0;
  if (diasMora === 0) { /* sin restar */ }
  else if (diasMora <= 15) { puntos -= 5; factores.push({ factor: 'Mora leve', detalle: diasMora + ' días', impacto: -5 }); }
  else if (diasMora <= 30) { puntos -= 10; factores.push({ factor: 'Mora 15-30d', detalle: diasMora + ' días', impacto: -10 }); }
  else if (diasMora <= 60) { puntos -= 18; factores.push({ factor: 'Mora 31-60d', detalle: diasMora + ' días', impacto: -18 }); }
  else if (diasMora <= 90) { puntos -= 25; factores.push({ factor: 'Mora 61-90d', detalle: diasMora + ' días', impacto: -25 }); }
  else { puntos -= 30; factores.push({ factor: 'Mora >90d', detalle: diasMora + ' días', impacto: -30 }); }

  // 2. Score crediticio del cliente (peso: 20 pts)
  var scoreCliente = cliente ? (cliente.score || 0) : 0;
  if (scoreCliente >= 700) { /* bueno */ }
  else if (scoreCliente >= 600) { puntos -= 5; factores.push({ factor: 'Score medio', detalle: scoreCliente + ' pts', impacto: -5 }); }
  else if (scoreCliente >= 500) { puntos -= 12; factores.push({ factor: 'Score bajo', detalle: scoreCliente + ' pts', impacto: -12 }); }
  else if (scoreCliente > 0) { puntos -= 18; factores.push({ factor: 'Score muy bajo', detalle: scoreCliente + ' pts', impacto: -18 }); }
  else { puntos -= 20; factores.push({ factor: 'Sin score', detalle: 'No registrado', impacto: -20 }); }

  // 3. Cobertura de garantías (peso: 15 pts)
  if (cobertura.cobertura >= 120) { /* excelente */ }
  else if (cobertura.cobertura >= 100) { puntos -= 3; factores.push({ factor: 'Cobertura justa', detalle: cobertura.cobertura.toFixed(0) + '%', impacto: -3 }); }
  else if (cobertura.cobertura >= 50) { puntos -= 8; factores.push({ factor: 'Sub-colateralizado', detalle: cobertura.cobertura.toFixed(0) + '%', impacto: -8 }); }
  else if (cobertura.count > 0) { puntos -= 12; factores.push({ factor: 'Cobertura insuficiente', detalle: cobertura.cobertura.toFixed(0) + '%', impacto: -12 }); }
  else { puntos -= 15; factores.push({ factor: 'Sin garantía', detalle: '0 colaterales', impacto: -15 }); }

  // 4. Historial de pagos (peso: 15 pts)
  var amort = credito.amortizacion || [];
  var cuotasPagadas = amort.filter(function(a) { return a.pagado; }).length;
  var cuotasTotal = amort.length;
  var pctPagado = cuotasTotal > 0 ? (cuotasPagadas / cuotasTotal * 100) : 0;
  if (pctPagado >= 50) { /* buen avance — sin penalización */ }
  else if (pctPagado >= 25) { puntos -= 5; factores.push({ factor: 'Avance moderado', detalle: pctPagado.toFixed(0) + '% pagado', impacto: -5 }); }
  else if (cuotasTotal > 0) { puntos -= 8; factores.push({ factor: 'Crédito nuevo', detalle: pctPagado.toFixed(0) + '% avance', impacto: -8 }); }
  // Pagos tardíos (si hubo pagos con mora) — hasta -7 pts adicionales
  if (pagos.length > 0 && diasMora > 0) {
    puntos -= 7; factores.push({ factor: 'Historial irregular', detalle: pagos.length + ' pagos realizados', impacto: -7 });
  }

  // 5. Concentración del cliente (peso: 10 pts)
  var creditosCliente = getStore('creditos').filter(function(c) { return c.clienteId === credito.clienteId && c.estado !== 'liquidado'; });
  var saldoCliente = creditosCliente.reduce(function(s, c) { return s + c.saldo; }, 0);
  var carteraTotal = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.saldo; }, 0);
  var concentracion = carteraTotal > 0 ? (saldoCliente / carteraTotal * 100) : 0;
  if (concentracion > 25) { puntos -= 10; factores.push({ factor: 'Alta concentración', detalle: concentracion.toFixed(1) + '% de cartera', impacto: -10 }); }
  else if (concentracion > 15) { puntos -= 5; factores.push({ factor: 'Concentración moderada', detalle: concentracion.toFixed(1) + '%', impacto: -5 }); }

  // 6. Monto vs ingresos del cliente (peso: 10 pts — capacidad de pago)
  if (cliente && cliente.ingresos > 0) {
    var pagoMensual = credito.pago || 0;
    var ratioEndeudamiento = pagoMensual / cliente.ingresos * 100;
    if (ratioEndeudamiento > 40) { puntos -= 10; factores.push({ factor: 'Sobreendeudamiento', detalle: ratioEndeudamiento.toFixed(0) + '% ingreso', impacto: -10 }); }
    else if (ratioEndeudamiento > 30) { puntos -= 5; factores.push({ factor: 'Endeudamiento alto', detalle: ratioEndeudamiento.toFixed(0) + '% ingreso', impacto: -5 }); }
  }

  // Clamp
  puntos = Math.max(0, Math.min(100, puntos));

  // Calificación
  var calificacion;
  if (puntos >= 95) calificacion = 'A1';
  else if (puntos >= 85) calificacion = 'A2';
  else if (puntos >= 75) calificacion = 'B1';
  else if (puntos >= 65) calificacion = 'B2';
  else if (puntos >= 55) calificacion = 'C1';
  else if (puntos >= 40) calificacion = 'C2';
  else if (puntos >= 20) calificacion = 'D';
  else calificacion = 'E';

  return { score: puntos, calificacion: calificacion, factores: factores, diasMora: diasMora, cobertura: cobertura.cobertura, concentracion: concentracion };
}

function renderRiesgoHTML(creditoId) {
  var r = calcularRiesgoCredito(creditoId);
  var color = RIESGO_COLORS[r.calificacion];
  var html = '<div style="margin-top:16px">' +
    '<h4 style="margin:0 0 12px 0">Scoring de Riesgo</h4>' +
    '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">' +
    '<div style="width:64px;height:64px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
    '<span style="color:white;font-weight:700;font-size:18px">' + r.calificacion + '</span></div>' +
    '<div><div style="font-size:14px;font-weight:600">' + esc(RIESGO_LABELS[r.calificacion]) + ' — ' + r.score + '/100 pts</div>' +
    '<div style="height:6px;width:200px;background:#e5e7eb;border-radius:3px;margin-top:4px"><div style="height:100%;width:' + r.score + '%;background:' + color + ';border-radius:3px;transition:width 0.3s"></div></div></div></div>';

  if (r.factores.length > 0) {
    html += '<div style="font-size:12px">';
    r.factores.forEach(function(f) {
      html += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">' +
        '<span>' + esc(f.factor) + ' <small style="color:var(--gray)">(' + esc(f.detalle) + ')</small></span>' +
        '<span style="color:var(--red);font-weight:600">' + f.impacto + '</span></div>';
    });
    html += '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--green)">Sin factores de riesgo detectados</div>';
  }
  html += '</div>';
  return html;
}

function renderReporteRiesgo() {
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');

  // Calcular riesgo para todos los créditos
  var riesgos = creditos.map(function(c) {
    var r = calcularRiesgoCredito(c.id);
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return { credito: c, cliente: cli, riesgo: r };
  });

  // Distribución por calificación
  var distrib = {};
  Object.keys(RIESGO_LABELS).forEach(function(k) { distrib[k] = { count: 0, saldo: 0 }; });
  riesgos.forEach(function(r) {
    distrib[r.riesgo.calificacion].count++;
    distrib[r.riesgo.calificacion].saldo += r.credito.saldo;
  });

  var carteraTotal = riesgos.reduce(function(s, r) { return s + r.credito.saldo; }, 0);
  var scoreProm = riesgos.length > 0 ? (riesgos.reduce(function(s, r) { return s + r.riesgo.score; }, 0) / riesgos.length) : 0;
  var riesgoAlto = riesgos.filter(function(r) { return r.riesgo.calificacion === 'D' || r.riesgo.calificacion === 'E'; });
  var saldoRiesgoAlto = riesgoAlto.reduce(function(s, r) { return s + r.credito.saldo; }, 0);
  var pctRiesgoAlto = carteraTotal > 0 ? (saldoRiesgoAlto / carteraTotal * 100) : 0;

  // Calificación global
  var calGlobal;
  if (scoreProm >= 85) calGlobal = 'A';
  else if (scoreProm >= 65) calGlobal = 'B';
  else if (scoreProm >= 40) calGlobal = 'C';
  else calGlobal = 'D';

  // KPIs
  document.getElementById('rptRiesgoKpis').innerHTML =
    '<div class="kpi-card ' + (scoreProm >= 70 ? 'green' : scoreProm >= 50 ? 'yellow' : 'red') + '"><div class="kpi-label">Score Promedio</div><div class="kpi-value">' + scoreProm.toFixed(0) + '/100</div><div class="kpi-sub">Calificación: ' + calGlobal + '</div></div>' +
    '<div class="kpi-card ' + (riesgoAlto.length === 0 ? 'green' : 'red') + '"><div class="kpi-label">Créditos Riesgo Alto</div><div class="kpi-value">' + riesgoAlto.length + '</div><div class="kpi-sub">' + fmt(saldoRiesgoAlto) + ' (' + pctRiesgoAlto.toFixed(1) + '%)</div></div>' +
    '<div class="kpi-card green"><div class="kpi-label">A1-A2 (Bajo)</div><div class="kpi-value">' + (distrib.A1.count + distrib.A2.count) + '</div><div class="kpi-sub">' + fmt(distrib.A1.saldo + distrib.A2.saldo) + '</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">B1-B2 (Moderado)</div><div class="kpi-value">' + (distrib.B1.count + distrib.B2.count) + '</div><div class="kpi-sub">' + fmt(distrib.B1.saldo + distrib.B2.saldo) + '</div></div>' +
    '<div class="kpi-card yellow"><div class="kpi-label">C1-C2 (Medio)</div><div class="kpi-value">' + (distrib.C1.count + distrib.C2.count) + '</div><div class="kpi-sub">' + fmt(distrib.C1.saldo + distrib.C2.saldo) + '</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">D-E (Alto/Crítico)</div><div class="kpi-value">' + (distrib.D.count + distrib.E.count) + '</div><div class="kpi-sub">' + fmt(distrib.D.saldo + distrib.E.saldo) + '</div></div>';

  // Tabla detallada
  riesgos.sort(function(a, b) { return a.riesgo.score - b.riesgo.score; }); // Peores primero
  document.getElementById('tbRiesgo').innerHTML = riesgos.map(function(r) {
    var color = RIESGO_COLORS[r.riesgo.calificacion];
    return '<tr>' +
      '<td><strong>' + esc(r.credito.numero) + '</strong></td>' +
      '<td>' + (r.cliente ? esc(r.cliente.nombre) : '-') + '</td>' +
      '<td>' + fmt(r.credito.saldo) + '</td>' +
      '<td><span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:' + color + ';color:white;text-align:center;line-height:28px;font-weight:700;font-size:11px">' + r.riesgo.calificacion + '</span></td>' +
      '<td>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        '<div style="height:6px;flex:1;max-width:80px;background:#e5e7eb;border-radius:3px"><div style="height:100%;width:' + r.riesgo.score + '%;background:' + color + ';border-radius:3px"></div></div>' +
        '<span style="font-weight:600;font-size:12px">' + r.riesgo.score + '</span></div>' +
      '</td>' +
      '<td>' + r.riesgo.diasMora + 'd</td>' +
      '<td>' + r.riesgo.cobertura.toFixed(0) + '%</td>' +
      '<td style="font-size:11px">' + (r.riesgo.factores.length > 0 ? r.riesgo.factores.slice(0, 2).map(function(f) { return esc(f.factor); }).join(', ') + (r.riesgo.factores.length > 2 ? '...' : '') : '<span style="color:var(--green)">OK</span>') + '</td>' +
      '</tr>';
  }).join('');

  // Distribución chart
  if (window._chartRiesgo) window._chartRiesgo.destroy();
  var labels = Object.keys(RIESGO_LABELS);
  var dataSaldo = labels.map(function(k) { return distrib[k].saldo; });
  var colores = labels.map(function(k) { return RIESGO_COLORS[k]; });
  window._chartRiesgo = new Chart(document.getElementById('chartRiesgoDistrib'), {
    type: 'bar',
    data: {
      labels: labels.map(function(k) { return k + ' — ' + RIESGO_LABELS[k]; }),
      datasets: [{ label: 'Saldo en Cartera', data: dataSaldo, backgroundColor: colores, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { title: { display: true, text: 'Distribución de Cartera por Calificación de Riesgo' }, legend: { display: false } },
      scales: { x: { ticks: { callback: function(v) { return fmt(v); } } } }
    }
  });
}

function exportarRiesgoPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');

  var riesgos = creditos.map(function(c) {
    var r = calcularRiesgoCredito(c.id);
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return { credito: c, cliente: cli, riesgo: r };
  });
  riesgos.sort(function(a, b) { return a.riesgo.score - b.riesgo.score; });

  var scoreProm = riesgos.length > 0 ? (riesgos.reduce(function(s, r) { return s + r.riesgo.score; }, 0) / riesgos.length) : 0;

  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Reporte de Riesgo de Cartera', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy + '   |   Score Promedio: ' + scoreProm.toFixed(0) + '/100', 14, 20);

  doc.autoTable({
    startY: 34,
    head: [['Crédito', 'Cliente', 'Saldo', 'Calif.', 'Score', 'Mora', 'Cobertura', 'Principales Factores']],
    body: riesgos.map(function(r) {
      return [r.credito.numero, r.cliente ? r.cliente.nombre : '-', fmt(r.credito.saldo), r.riesgo.calificacion + ' (' + RIESGO_LABELS[r.riesgo.calificacion] + ')', r.riesgo.score + '/100', r.riesgo.diasMora + 'd', r.riesgo.cobertura.toFixed(0) + '%', r.riesgo.factores.slice(0, 3).map(function(f) { return f.factor; }).join(', ') || 'Sin riesgos'];
    }),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 48, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 3) {
        var cal = data.cell.raw.split(' ')[0];
        if (cal === 'D' || cal === 'E') data.cell.styles.textColor = [200, 16, 46];
        else if (cal.startsWith('C')) data.cell.styles.textColor = [245, 158, 11];
        else data.cell.styles.textColor = [13, 159, 110];
      }
    }
  });

  doc.save('AP_Reporte_Riesgo_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Reporte de riesgo PDF generado', 'success');
}

function exportarRiesgoExcel() {
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  var headers = ['Crédito', 'Cliente', 'Saldo', 'Calificación', 'Score', 'Nivel', 'Días Mora', 'Cobertura %', 'Concentración %', 'Factores'];
  var data = creditos.map(function(c) {
    var r = calcularRiesgoCredito(c.id);
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return [c.numero, cli ? cli.nombre : '-', c.saldo, r.calificacion, r.score, RIESGO_LABELS[r.calificacion], r.diasMora, +r.cobertura.toFixed(1), +r.concentracion.toFixed(1), r.factores.map(function(f) { return f.factor; }).join('; ')];
  });
  exportToExcel(data, headers, 'AP_Reporte_Riesgo_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Riesgo Cartera');
}

// ============================================================
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


// ============================================================
//  DUPLICATES REMOVED: 20 PLD functions (canonical in pld.js),
//  4 calendar functions (canonical in calendario.js)
// ============================================================


// ============================================================
