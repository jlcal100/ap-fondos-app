
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

// ============================================================
//  SPRINT Q: CALENDARIO DE COBRANZA Y SEGUIMIENTO
// ============================================================
var calMes = new Date().getMonth();
var calAnio = new Date().getFullYear();
var calEventos = [];

function calNavMes(dir) {
  if (dir === 0) {
    calMes = new Date().getMonth();
    calAnio = new Date().getFullYear();
  } else {
    calMes += dir;
    if (calMes > 11) { calMes = 0; calAnio++; }
    if (calMes < 0) { calMes = 11; calAnio--; }
  }
  renderCalendario();
}

function generarEventosCalendario(anio, mes) {
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var clientes = getStore('clientes');
  var pagosRealizados = getStore('pagos');
  var eventos = [];
  var mesKey = anio + '-' + String(mes + 1).padStart(2, '0');

  // 1. Cobranza esperada (cuotas de amortización)
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || c.estado === 'castigado') return;
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var amort = c.amortizacion || c.tablaAmortizacion || [];
    amort.forEach(function(cuota) {
      if (cuota.pagado) return;
      var fPago = cuota.fecha || cuota.fechaPago;
      if (!fPago || fPago.substring(0, 7) !== mesKey) return;
      var montoCuota = cuota.pagoTotal || cuota.cuota || cuota.total || 0;
      eventos.push({
        fecha: fPago,
        tipo: 'cobranza',
        color: '#0D9F6E',
        titulo: 'Cobro ' + esc(c.numero),
        detalle: (cli ? esc(cli.nombre) + ' — ' : '') + 'Cuota #' + cuota.numero + ': ' + fmt(montoCuota),
        monto: montoCuota,
        creditoId: c.id
      });
    });
  });

  // 2. Pagos a fondeo (intereses mensuales estimados)
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    var saldo = f.saldo || 0;
    if (saldo <= 0) return;
    var interesMensual = saldo * (f.tasa || 0) / 12;
    if (interesMensual > 0) {
      // Pago de intereses a fin de mes
      var ultimoDia = new Date(anio, mes + 1, 0).getDate();
      var fechaPago = mesKey + '-' + ultimoDia;
      eventos.push({
        fecha: fechaPago,
        tipo: 'pago_fondeo',
        color: '#C8102E',
        titulo: 'Pago fondeo ' + esc(f.numero || f.fondeador),
        detalle: 'Intereses: ' + fmt(interesMensual) + ' — Saldo: ' + fmt(saldo),
        monto: interesMensual
      });
    }
    // Vencimiento de fondeo
    if (f.fechaVencimiento && f.fechaVencimiento.substring(0, 7) === mesKey) {
      eventos.push({
        fecha: f.fechaVencimiento,
        tipo: 'venc_fondeo',
        color: '#3B82F6',
        titulo: 'Vence fondeo ' + esc(f.numero || f.fondeador),
        detalle: 'Capital: ' + fmt(saldo) + ' — Fondeador: ' + esc(f.fondeador),
        monto: saldo
      });
    }
  });

  // 3. Vencimiento de créditos
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    if (c.fechaVencimiento && c.fechaVencimiento.substring(0, 7) === mesKey) {
      var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
      eventos.push({
        fecha: c.fechaVencimiento,
        tipo: 'venc_credito',
        color: '#F59E0B',
        titulo: 'Vence ' + esc(c.numero),
        detalle: (cli ? esc(cli.nombre) + ' — ' : '') + 'Saldo: ' + fmt(c.saldo),
        monto: c.saldo,
        creditoId: c.id
      });
    }
    // Inicio de crédito
    if (c.fechaInicio && c.fechaInicio.substring(0, 7) === mesKey) {
      eventos.push({
        fecha: c.fechaInicio,
        tipo: 'inicio_credito',
        color: '#8B5CF6',
        titulo: 'Inicio ' + esc(c.numero),
        detalle: 'Monto: ' + fmt(c.monto),
        monto: c.monto
      });
    }
  });

  // Ordenar por fecha
  eventos.sort(function(a, b) { return a.fecha.localeCompare(b.fecha); });
  return eventos;
}

function renderCalendario() {
  var mNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calTitulo').textContent = mNames[calMes] + ' ' + calAnio;

  calEventos = generarEventosCalendario(calAnio, calMes);

  // Agrupar eventos por día
  var eventosPorDia = {};
  calEventos.forEach(function(e) {
    var dia = parseInt(e.fecha.split('-')[2]);
    if (!eventosPorDia[dia]) eventosPorDia[dia] = [];
    eventosPorDia[dia].push(e);
  });

  // KPIs del mes
  var totalCobranza = calEventos.filter(function(e) { return e.tipo === 'cobranza'; }).reduce(function(s, e) { return s + e.monto; }, 0);
  var totalPagoFondeo = calEventos.filter(function(e) { return e.tipo === 'pago_fondeo'; }).reduce(function(s, e) { return s + e.monto; }, 0);
  var vencCreditos = calEventos.filter(function(e) { return e.tipo === 'venc_credito'; }).length;
  var vencFondeos = calEventos.filter(function(e) { return e.tipo === 'venc_fondeo'; }).length;
  var flujoNeto = totalCobranza - totalPagoFondeo;

  document.getElementById('calKpis').innerHTML =
    '<div class="kpi-card green"><div class="kpi-label">Cobranza del Mes</div><div class="kpi-value">' + fmt(totalCobranza) + '</div><div class="kpi-sub">' + calEventos.filter(function(e){return e.tipo==='cobranza';}).length + ' cuotas</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">Pagos a Fondeo</div><div class="kpi-value">' + fmt(totalPagoFondeo) + '</div></div>' +
    '<div class="kpi-card ' + (flujoNeto >= 0 ? 'navy' : 'red') + '"><div class="kpi-label">Flujo Neto Mes</div><div class="kpi-value">' + fmt(flujoNeto) + '</div></div>' +
    '<div class="kpi-card ' + (vencCreditos > 0 ? 'yellow' : 'green') + '"><div class="kpi-label">Venc. Créditos</div><div class="kpi-value">' + vencCreditos + '</div></div>' +
    '<div class="kpi-card ' + (vencFondeos > 0 ? 'orange' : 'green') + '"><div class="kpi-label">Venc. Fondeos</div><div class="kpi-value">' + vencFondeos + '</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Total Eventos</div><div class="kpi-value">' + calEventos.length + '</div></div>';

  // Construir grilla del calendario
  var primerDia = new Date(calAnio, calMes, 1).getDay(); // 0=dom
  primerDia = primerDia === 0 ? 6 : primerDia - 1; // Convertir a lun=0
  var diasEnMes = new Date(calAnio, calMes + 1, 0).getDate();
  var hoy = new Date();
  var hoyDia = (hoy.getMonth() === calMes && hoy.getFullYear() === calAnio) ? hoy.getDate() : -1;

  var html = '';
  var dia = 1;
  for (var sem = 0; sem < 6; sem++) {
    if (dia > diasEnMes) break;
    html += '<tr>';
    for (var dow = 0; dow < 7; dow++) {
      if ((sem === 0 && dow < primerDia) || dia > diasEnMes) {
        html += '<td style="padding:4px;min-height:80px;background:var(--light-bg);vertical-align:top"></td>';
      } else {
        var esHoy = dia === hoyDia;
        var evts = eventosPorDia[dia] || [];
        var bgStyle = esHoy ? 'background:rgba(30,48,80,0.06);' : '';
        html += '<td class="cal-cell" style="padding:4px;min-height:80px;vertical-align:top;cursor:pointer;border:1px solid var(--border);' + bgStyle + '" onclick="verDiaCal(' + dia + ')">';
        html += '<div style="font-weight:' + (esHoy ? '700' : '400') + ';font-size:13px;margin-bottom:2px;' + (esHoy ? 'color:var(--navy);' : '') + '">' + dia + (esHoy ? ' <small style="color:var(--primary)">hoy</small>' : '') + '</div>';

        // Mostrar hasta 3 eventos como dots
        var maxShow = 3;
        evts.slice(0, maxShow).forEach(function(e) {
          html += '<div style="font-size:10px;padding:1px 4px;margin-bottom:1px;border-radius:3px;background:' + e.color + ';color:white;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%">' + e.titulo + '</div>';
        });
        if (evts.length > maxShow) {
          html += '<div style="font-size:10px;color:var(--gray)">+' + (evts.length - maxShow) + ' más</div>';
        }
        html += '</td>';
        dia++;
      }
    }
    html += '</tr>';
  }
  document.getElementById('calBody').innerHTML = html;

  // Mostrar detalle del día de hoy automáticamente
  if (hoyDia > 0) verDiaCal(hoyDia);
}

function verDiaCal(dia) {
  var fecha = calAnio + '-' + String(calMes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  var mNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var dNames = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var d = new Date(calAnio, calMes, dia);

  document.getElementById('calDiaTitle').textContent = dNames[d.getDay()] + ' ' + dia + ' de ' + mNames[calMes];

  var evts = calEventos.filter(function(e) { return e.fecha === fecha; });

  if (evts.length === 0) {
    document.getElementById('calDiaDetalle').innerHTML = '<div style="padding:8px;color:var(--gray);text-align:center">Sin eventos programados para este día</div>';
    return;
  }

  var totalEntradas = evts.filter(function(e) { return e.tipo === 'cobranza'; }).reduce(function(s, e) { return s + e.monto; }, 0);
  var totalSalidas = evts.filter(function(e) { return e.tipo === 'pago_fondeo' || e.tipo === 'venc_fondeo'; }).reduce(function(s, e) { return s + e.monto; }, 0);

  var html = '';
  if (totalEntradas > 0 || totalSalidas > 0) {
    html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
    if (totalEntradas > 0) html += '<span class="badge badge-green" style="font-size:11px">+' + fmt(totalEntradas) + '</span>';
    if (totalSalidas > 0) html += '<span class="badge badge-red" style="font-size:11px">-' + fmt(totalSalidas) + '</span>';
    html += '</div>';
  }

  evts.forEach(function(e) {
    html += '<div style="padding:8px;margin-bottom:6px;border-left:3px solid ' + e.color + ';background:var(--light-bg);border-radius:0 6px 6px 0">';
    html += '<div style="font-weight:600;font-size:12px">' + e.titulo + '</div>';
    html += '<div style="font-size:11px;color:var(--gray);margin-top:2px">' + e.detalle + '</div>';
    if (e.creditoId) {
      html += '<a style="font-size:11px;color:var(--primary);cursor:pointer;text-decoration:none" onclick="verCredito(' + e.creditoId + ');showPage(\'creditos\')">Ver crédito →</a>';
    }
    html += '</div>';
  });

  document.getElementById('calDiaDetalle').innerHTML = html;
}

// ============================================================
