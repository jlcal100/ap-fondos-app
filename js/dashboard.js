// ====== MODULE: dashboard.js ======
// setDashPeriod(), getDashPagos(), actualizarDiasMora(), renderDashboard(), chart variables, dashboard alertas widget

// ============================================================
//  DASHBOARD
// ============================================================
let chartCartera, chartIngresosMensual, chartConcentracion, chartVigVenc;
var dashPeriodDays = 0; // 0=hoy, 30, 90, 365, -1=todo

function setDashPeriod(btn, days) {
  document.querySelectorAll('.dash-period').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  dashPeriodDays = days;
  renderDashboard();
}

function getDashPagos() {
  var pagos = getStore('pagos');
  if (dashPeriodDays === 0 || dashPeriodDays === -1) return pagos;
  var desde = new Date();
  desde.setDate(desde.getDate() - dashPeriodDays);
  return pagos.filter(function(p) { return new Date(p.fecha) >= desde; });
}

// Bug #16: Cálculo automático de días mora
function actualizarDiasMora() {
  const hoy = new Date();
  let creditos = getStore('creditos');
  let changed = false;
  creditos = creditos.map(c => {
    if (c.estado === 'liquidado' || c.estado === 'castigado' || c.tipo === 'cuenta_corriente') return c;
    // Buscar el primer pago vencido no pagado en la amortización
    const primerVencido = (c.amortizacion || []).find(a => !a.pagado && new Date(a.fecha) < hoy);
    if (primerVencido) {
      const diasMora = Math.floor((hoy - new Date(primerVencido.fecha)) / (1000 * 60 * 60 * 24));
      if (diasMora !== c.diasMora) {
        c.diasMora = diasMora;
        changed = true;
      }
      // Auto-marcar como vencido si tiene más de 1 día de mora
      if (diasMora > 0 && c.estado === 'vigente') {
        c.estado = 'vencido';
        changed = true;
      }
    } else {
      // Sin pagos vencidos — asegurar 0 días mora
      if (c.diasMora !== 0) {
        c.diasMora = 0;
        changed = true;
      }
      if (c.estado === 'vencido') {
        c.estado = 'vigente';
        changed = true;
      }
    }
    return c;
  });
  if (changed) setStore('creditos', creditos);
}

function renderDashboard() {
  actualizarDiasMora();
  cargarEfectivo();
  const v = calcularValuacion();
  const creditos = getStore('creditos');
  const clientes = getStore('clientes');
  const pagos = getStore('pagos');
  const pagosPeriodo = getDashPagos();
  const fondeos = getStore('fondeos');

  // Métricas adicionales
  const totalColocado = creditos.reduce(function(s, c) { return s + c.monto; }, 0);
  const cobradoPeriodo = pagosPeriodo.reduce(function(s, p) { return s + p.monto; }, 0);
  const interesCobrado = pagosPeriodo.reduce(function(s, p) { return s + (p.interes || 0); }, 0);
  const numClientesActivos = new Set(creditos.filter(function(c) { return c.estado === 'vigente'; }).map(function(c) { return c.clienteId; })).size;

  // Concentración: % del mayor cliente sobre cartera total
  var concentracionMax = 0;
  if (v.carteraTotal > 0) {
    var saldosPorCliente = {};
    creditos.forEach(function(c) {
      if (c.estado !== 'liquidado') saldosPorCliente[c.clienteId] = (saldosPorCliente[c.clienteId] || 0) + c.saldo;
    });
    concentracionMax = Math.max.apply(null, Object.values(saldosPorCliente).concat([0])) / v.carteraTotal * 100;
  }

  // Cobertura fondeo
  var coberturaFondeo = 0;
  var saldoFondeos = fondeos.reduce(function(s, f) { return s + (f.estado !== 'liquidado' ? (f.esRevolvente ? (f.saldoDispuesto || 0) : f.saldo) : 0); }, 0);
  if (saldoFondeos > 0) coberturaFondeo = v.carteraTotal / saldoFondeos * 100;

  // Tasa Promedio Ponderada Activa (cartera colocada)
  var sumTasaActiva = 0, sumSaldoActivo = 0;
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || c.estado === 'castigado') return;
    var saldo = c.saldoActual || c.saldo || 0;
    sumTasaActiva += (c.tasa || 0) * saldo;
    sumSaldoActivo += saldo;
  });
  var tasaPondActiva = sumSaldoActivo > 0 ? (sumTasaActiva / sumSaldoActivo) * 100 : 0;

  // Tasa Promedio Ponderada Pasiva (fondeos)
  var sumTasaPasiva = 0, sumSaldoPasivo = 0;
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    var saldoF = f.esRevolvente ? (f.saldoDispuesto || 0) : (f.saldo || 0);
    sumTasaPasiva += (f.tasa || 0) * saldoF;
    sumSaldoPasivo += saldoF;
  });
  var tasaPondPasiva = sumSaldoPasivo > 0 ? (sumTasaPasiva / sumSaldoPasivo) * 100 : 0;

  // Margen (spread) real ponderado
  var spreadPonderado = tasaPondActiva - tasaPondPasiva;

  // KPIs Fila 1: Financieros principales
  document.getElementById('dashKpis').innerHTML = `
    <div class="kpi-card navy"><div class="kpi-label">Valor de la Empresa</div><div class="kpi-value">${fmt(v.valorEmpresa)}</div><div class="kpi-sub">Activos - Pasivos</div></div>
    <div class="kpi-card green"><div class="kpi-label">Total Activos</div><div class="kpi-value">${fmt(v.totalActivos)}</div><div class="kpi-sub">Cartera + Intereses + Efectivo</div></div>
    <div class="kpi-card red"><div class="kpi-label">Total Pasivos</div><div class="kpi-value">${fmt(v.totalPasivos)}</div><div class="kpi-sub">Fondeos + Int. Devengados</div></div>
    <div class="kpi-card blue"><div class="kpi-label">Yield Cartera</div><div class="kpi-value">${fmtPct(v.yieldCartera)}</div><div class="kpi-sub">Rendimiento anualizado</div></div>
    <div class="kpi-card orange"><div class="kpi-label">Costo Fondeo</div><div class="kpi-value">${fmtPct(v.costoFondeo)}</div><div class="kpi-sub">Costo promedio ponderado</div></div>
    <div class="kpi-card green"><div class="kpi-label">Spread Financiero</div><div class="kpi-value">${fmtPct(v.spread)}</div><div class="kpi-sub">Yield - Costo Fondeo</div></div>
    <div class="kpi-card yellow"><div class="kpi-label">Índice Morosidad</div><div class="kpi-value">${v.morosidad.toFixed(2)}%</div><div class="kpi-sub">Cart. Vencida / Cart. Total</div></div>
    <div class="kpi-card navy"><div class="kpi-label">Cartera Total</div><div class="kpi-value">${fmt(v.carteraTotal)}</div><div class="kpi-sub">${creditos.filter(function(c){return c.estado==='vigente'}).length} créditos vigentes</div></div>
  `;

  // KPIs Fila 2: Operativos
  document.getElementById('dashKpis2').innerHTML = `
    <div class="kpi-card blue"><div class="kpi-label">Cobrado en Periodo</div><div class="kpi-value">${fmt(cobradoPeriodo)}</div><div class="kpi-sub">${pagosPeriodo.length} pagos</div></div>
    <div class="kpi-card green"><div class="kpi-label">Interés Cobrado</div><div class="kpi-value">${fmt(interesCobrado)}</div><div class="kpi-sub">Ingreso financiero</div></div>
    <div class="kpi-card navy"><div class="kpi-label">Clientes Activos</div><div class="kpi-value">${numClientesActivos}</div><div class="kpi-sub">de ${clientes.length} totales</div></div>
    <div class="kpi-card ${concentracionMax > 25 ? 'red' : concentracionMax > 15 ? 'yellow' : 'green'}"><div class="kpi-label">Concentración Máx.</div><div class="kpi-value">${concentracionMax.toFixed(1)}%</div><div class="kpi-sub">${concentracionMax > 25 ? 'Riesgo alto' : concentracionMax > 15 ? 'Moderado' : 'Diversificada'}</div></div>
    <div class="kpi-card ${coberturaFondeo > 120 ? 'green' : coberturaFondeo > 100 ? 'yellow' : 'red'}"><div class="kpi-label">Cobertura Fondeo</div><div class="kpi-value">${coberturaFondeo.toFixed(0)}%</div><div class="kpi-sub">Cartera / Fondeos</div></div>
    <div class="kpi-card green"><div class="kpi-label">Tasa Activa Pond.</div><div class="kpi-value">${tasaPondActiva.toFixed(2)}%</div><div class="kpi-sub">Colocación — ${fmt(sumSaldoActivo)}</div></div>
    <div class="kpi-card red"><div class="kpi-label">Tasa Pasiva Pond.</div><div class="kpi-value">${tasaPondPasiva.toFixed(2)}%</div><div class="kpi-sub">Fondeo — ${fmt(sumSaldoPasivo)}</div></div>
    <div class="kpi-card ${spreadPonderado > 5 ? 'green' : spreadPonderado > 2 ? 'yellow' : 'red'}"><div class="kpi-label">Spread Ponderado</div><div class="kpi-value">${spreadPonderado.toFixed(2)}%</div><div class="kpi-sub">Activa - Pasiva</div></div>
    ${(function() { var ap = getStore('aprobaciones').filter(function(a) { return a.estado === 'pendiente'; }); return ap.length > 0 ? '<div class="kpi-card ' + (ap.length > 3 ? 'red' : 'yellow') + '" style="cursor:pointer" onclick="showPage(\'aprobaciones\')"><div class="kpi-label">Aprobaciones Pend.</div><div class="kpi-value">' + ap.length + '</div><div class="kpi-sub">Por ' + fmt(ap.reduce(function(s, a) { return s + a.monto; }, 0)) + '</div></div>' : ''; })()}
  `;

  // Charts — destruir anteriores
  if (chartCartera) chartCartera.destroy();
  if (chartIngresosMensual) chartIngresosMensual.destroy();
  if (chartConcentracion) chartConcentracion.destroy();
  if (chartVigVenc) chartVigVenc.destroy();

  // 1. Composición de Cartera (dona)
  chartCartera = new Chart(document.getElementById('chartCartera'), {
    type: 'doughnut',
    data: {
      labels: ['Crédito Simple', 'Arrendamiento', 'Nómina'],
      datasets: [{ data: [v.carteraSimple, v.carteraArrend, v.cartNomina], backgroundColor: ['#1E3050', '#C8102E', '#3B82F6'], borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // 2. Ingresos Mensuales (barras — datos REALES de pagos)
  var mesData = {};
  pagos.forEach(function(p) {
    var key = p.fecha ? p.fecha.substring(0, 7) : 'N/A';
    if (!mesData[key]) mesData[key] = { capital: 0, interes: 0, total: 0 };
    mesData[key].capital += p.capital || 0;
    mesData[key].interes += p.interes || 0;
    mesData[key].total += p.monto || 0;
  });
  var meses = Object.keys(mesData).sort().slice(-12);
  var mesLabels = meses.map(function(m) {
    var parts = m.split('-');
    var mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return parts.length === 2 ? mNames[parseInt(parts[1])-1] + ' ' + parts[0].slice(2) : m;
  });
  chartIngresosMensual = new Chart(document.getElementById('chartIngresosMensual'), {
    type: 'bar',
    data: {
      labels: mesLabels,
      datasets: [
        { label: 'Capital', data: meses.map(function(m) { return mesData[m].capital; }), backgroundColor: '#1E3050' },
        { label: 'Interés', data: meses.map(function(m) { return mesData[m].interes; }), backgroundColor: '#0D9F6E' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: function(val) { return fmt(val); } } } }, plugins: { legend: { position: 'bottom' } } }
  });

  // 3. Concentración por Cliente (Top 5)
  var saldoPorCliente = {};
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var nombre = cli ? cli.nombre : 'Desconocido';
    saldoPorCliente[nombre] = (saldoPorCliente[nombre] || 0) + c.saldo;
  });
  var top5 = Object.entries(saldoPorCliente).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);
  var otrosSum = Object.entries(saldoPorCliente).sort(function(a, b) { return b[1] - a[1]; }).slice(5).reduce(function(s, e) { return s + e[1]; }, 0);
  if (otrosSum > 0) top5.push(['Otros', otrosSum]);
  var concColors = ['#1E3050', '#C8102E', '#3B82F6', '#F59E0B', '#0D9F6E', '#9CA3AF'];
  chartConcentracion = new Chart(document.getElementById('chartConcentracion'), {
    type: 'pie',
    data: {
      labels: top5.map(function(e) { return e[0].length > 20 ? e[0].substring(0,18) + '...' : e[0]; }),
      datasets: [{ data: top5.map(function(e) { return e[1]; }), backgroundColor: concColors.slice(0, top5.length), borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });

  // 4. Cartera Vigente vs Vencida (barras horizontal)
  chartVigVenc = new Chart(document.getElementById('chartVigVenc'), {
    type: 'bar',
    data: {
      labels: ['Cartera'],
      datasets: [
        { label: 'Vigente', data: [v.carteraVigente], backgroundColor: '#0D9F6E' },
        { label: 'Vencida', data: [v.carteraVencida], backgroundColor: '#C8102E' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true, ticks: { callback: function(val) { return fmt(val); } } }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } }
  });

  // ===== ALERTAS MEJORADAS =====
  var alertas = [];
  var hoy = new Date();

  // Créditos vencidos
  creditos.forEach(function(c) {
    if (c.estado === 'vencido') alertas.push({ type: 'danger', text: 'Crédito ' + c.numero + ' VENCIDO — Saldo: ' + fmt(c.saldo), priority: 1 });
  });

  // Pagos de amortización atrasados
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || !c.amortizacion) return;
    var atrasados = c.amortizacion.filter(function(a) { return !a.pagado && a.fecha && new Date(a.fecha) < hoy; });
    if (atrasados.length > 0) {
      var dias = Math.floor((hoy - new Date(atrasados[0].fecha)) / 86400000);
      alertas.push({ type: 'danger', text: 'Crédito ' + esc(c.numero) + ': ' + atrasados.length + ' pago(s) atrasado(s), ' + dias + ' días de mora', priority: 2 });
    }
  });

  // Próximos pagos (7 días)
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || !c.amortizacion) return;
    var proximo = c.amortizacion.find(function(a) { if (a.pagado) return false; var d = a.fecha ? Math.floor((new Date(a.fecha) - hoy) / 86400000) : 999; return d >= 0 && d <= 7; });
    if (proximo) alertas.push({ type: 'warning', text: 'Crédito ' + esc(c.numero) + ': pago de ' + fmt(proximo.pago) + ' vence el ' + (proximo.fecha || '-'), priority: 3 });
  });

  // Fondeos por vencer
  fondeos.forEach(function(f) {
    if (f.estado !== 'vigente') return;
    var dias = Math.floor((new Date(f.fechaVencimiento) - hoy) / 86400000);
    if (dias > 0 && dias <= 60) alertas.push({ type: 'info', text: 'Fondeo ' + esc(f.numero) + ' (' + esc(f.fondeador) + ') vence en ' + dias + ' días', priority: 4 });
  });

  // Concentración alta
  if (concentracionMax > 25) alertas.push({ type: 'warning', text: 'Concentración alta: un solo cliente representa el ' + concentracionMax.toFixed(1) + '% de la cartera', priority: 5 });

  // Sprint H: Expedientes incompletos y documentos vencidos
  var cliExpIncompleto = [];
  var docsVencidos = 0;
  clientes.forEach(function(cl) {
    var tieneCredito = creditos.some(function(c) { return c.clienteId === cl.id && c.estado === 'vigente'; });
    if (!tieneCredito) return;
    var expStatus = getExpedienteStatus(cl.id);
    if (expStatus.pct < 100) cliExpIncompleto.push({ nombre: cl.nombre, pct: expStatus.pct });
    var docAlertas = getDocAlertasCliente(cl.id);
    docsVencidos += docAlertas.filter(function(a) { return a.nivel === 'critico'; }).length;
  });
  if (cliExpIncompleto.length > 0) {
    alertas.push({ type: 'warning', text: cliExpIncompleto.length + ' expediente(s) incompleto(s): ' + cliExpIncompleto.slice(0, 3).map(function(c) { return esc(c.nombre) + ' (' + c.pct + '%)'; }).join(', '), priority: 6 });
  }
  if (docsVencidos > 0) {
    alertas.push({ type: 'danger', text: docsVencidos + ' documento(s) vencido(s) requieren renovación urgente', priority: 2 });
  }

  alertas.sort(function(a, b) { return a.priority - b.priority; });
  if (alertas.length === 0) alertas.push({ type: 'info', text: 'Sin alertas pendientes. Todo en orden.' });

  var alertCountEl = document.getElementById('alertCount');
  var urgentes = alertas.filter(function(a) { return a.type === 'danger'; }).length;
  if (alertCountEl) { alertCountEl.textContent = urgentes || alertas.length; alertCountEl.className = 'badge ' + (urgentes > 0 ? 'badge-red' : 'badge-green'); }
  document.getElementById('alertList').innerHTML = alertas.map(function(a) { return '<div class="alert-item ' + a.type + '">' + a.text + '</div>'; }).join('');

  // Valuation detail
  document.getElementById('valuacionDetalle').innerHTML = `
    <table><thead><tr><th colspan="2">ACTIVOS</th><th colspan="2">PASIVOS</th></tr></thead>
    <tbody>
      <tr><td>Cartera Crédito Simple</td><td style="text-align:right">${fmt(v.carteraSimple)}</td><td>Saldo Fondeos</td><td style="text-align:right">${fmt(v.saldoFondeos)}</td></tr>
      <tr><td>Cartera Arrendamiento</td><td style="text-align:right">${fmt(v.carteraArrend)}</td><td>Int. Devengados Fondeos</td><td style="text-align:right">${fmt(v.intDevFondeos)}</td></tr>
      <tr><td>Cartera Nómina</td><td style="text-align:right">${fmt(v.cartNomina)}</td><td><strong>Total Pasivos</strong></td><td style="text-align:right"><strong>${fmt(v.totalPasivos)}</strong></td></tr>
      <tr><td>Intereses Devengados</td><td style="text-align:right">${fmt(v.intDevCartera)}</td><td></td><td></td></tr>
      <tr><td>Efectivo Disponible</td><td style="text-align:right">${fmt(v.efectivo)}</td><td></td><td></td></tr>
      <tr><td><strong>Total Activos</strong></td><td style="text-align:right"><strong>${fmt(v.totalActivos)}</strong></td><td><strong>VALOR EMPRESA</strong></td><td style="text-align:right;color:var(--navy);font-size:18px"><strong>${fmt(v.valorEmpresa)}</strong></td></tr>
    </tbody></table>
  `;

  // Sprint V: Actividad reciente de bitácora
  var actDiv = document.getElementById('dashActividadReciente');
  if (actDiv) actDiv.innerHTML = renderActividadRecienteHTML();
}

