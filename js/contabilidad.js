//  CONTABILIDAD
// ============================================================
function setContaTab(tab) {
  ['contaMovimientos','contaBalance','contaResultados','contaConciliacion','contaCierres'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var target = document.getElementById('conta' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) target.style.display = 'block';
  var tabs = document.querySelectorAll('#page-contabilidad .tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');
  if (tab === 'balance') renderBalance();
  else if (tab === 'resultados') renderResultados();
  else if (tab === 'conciliacion') renderConciliacion();
  else if (tab === 'cierres') renderCierres();
}

// Bug #40: Cierre contable mensual
function getPeriodoActual() {
  const hoy = new Date();
  return hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
}

function isPeriodoCerrado(periodo) {
  const cierres = getStore('cierres_contables');
  return cierres.some(c => c.periodo === periodo);
}

function renderCierres() {
  const cierres = getStore('cierres_contables');
  if (cierres.length === 0) {
    document.getElementById('tbCierres').innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999">No hay cierres contables registrados</td></tr>';
    return;
  }
  document.getElementById('tbCierres').innerHTML = cierres.sort((a, b) => b.periodo.localeCompare(a.periodo)).map(c => `<tr>
    <td><strong>${esc(c.periodo)}</strong></td>
    <td>${new Date(c.fechaCierre).toLocaleString('es-MX')}</td>
    <td>${c.cerradoPor ? esc(c.cerradoPor) : '-'}</td>
    <td style="color:var(--green)">${fmt(c.ingresos)}</td>
    <td style="color:var(--red)">${fmt(c.egresos)}</td>
    <td style="font-weight:600;color:${c.resultado >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(c.resultado)}</td>
    <td><span class="badge badge-green">🔒 Cerrado</span></td>
  </tr>`).join('');
}

function ejecutarCierreContable() {
  if (!hasPermiso('contabilidad', 'crear')) return toast('Sin permiso para cerrar períodos contables', 'error');
  const periodo = getPeriodoActual();
  if (isPeriodoCerrado(periodo)) return toast('El período ' + periodo + ' ya está cerrado', 'error');

  // Calcular resumen del período
  const registros = getStore('contabilidad').filter(r => r.fecha && r.fecha.startsWith(periodo));
  const tiposIngreso = ['ingreso_intereses', 'ingreso_arrendamiento', 'comision'];
  const tiposEgreso = ['pago_fondeo', 'gasto_operativo', 'quita_reestructura'];
  const ingresos = registros.filter(r => tiposIngreso.includes(r.tipo)).reduce((s, r) => s + r.monto, 0);
  const egresos = registros.filter(r => tiposEgreso.includes(r.tipo)).reduce((s, r) => s + Math.abs(r.monto), 0);
  const resultado = ingresos - egresos;

  showConfirm('Cerrar período ' + periodo,
    'Se cerrará el período contable actual.\n\nIngresos: ' + fmt(ingresos) + '\nEgresos: ' + fmt(egresos) + '\nResultado: ' + fmt(resultado) +
    '\n\n⚠️ Una vez cerrado, no se podrán modificar registros de este período.',
    'Sí, cerrar período').then(ok => {
    if (!ok) return;
    const cierres = getStore('cierres_contables');
    cierres.push({
      id: cierres.length + 1,
      periodo: periodo,
      fechaCierre: new Date().toISOString(),
      cerradoPor: currentUser ? currentUser.nombre : 'Admin',
      ingresos: ingresos,
      egresos: egresos,
      resultado: resultado,
      registros: registros.length
    });
    setStore('cierres_contables', cierres);
    addAudit('Cierre Contable', 'Contabilidad', 'Período ' + periodo + ' cerrado. Resultado: ' + fmt(resultado));
    toast('Período ' + periodo + ' cerrado exitosamente', 'success');
    renderCierres();
  });
}

function renderContabilidad() {
  var filterTipo = document.getElementById('filterContaTipo').value;
  var filterMes = (document.getElementById('filterContaMes') || {}).value || '';
  var allRegistros = getStore('contabilidad').filter(function(r) {
    if (filterTipo && r.tipo !== filterTipo) return false;
    if (filterMes && r.fecha && !r.fecha.startsWith(filterMes)) return false;
    return true;
  }).sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var tiposIngreso = ['ingreso_intereses', 'ingreso_arrendamiento', 'comision'];
  var tiposEgreso = ['pago_fondeo', 'gasto_operativo', 'quita_reestructura'];
  var ingresos = allRegistros.filter(function(r) { return tiposIngreso.includes(r.tipo); }).reduce(function(s, r) { return s + r.monto; }, 0);
  var egresos = allRegistros.filter(function(r) { return tiposEgreso.includes(r.tipo); }).reduce(function(s, r) { return s + Math.abs(r.monto); }, 0);
  var utilidad = ingresos - egresos;

  document.getElementById('contaResumen').innerHTML =
    '<div class="kpi-card green"><div class="kpi-label">Ingresos</div><div class="kpi-value">' + fmt(ingresos) + '</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">Egresos</div><div class="kpi-value">' + fmt(egresos) + '</div></div>' +
    '<div class="kpi-card ' + (utilidad >= 0 ? 'navy' : 'red') + '"><div class="kpi-label">Resultado</div><div class="kpi-value">' + fmt(utilidad) + '</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Registros</div><div class="kpi-value">' + allRegistros.length + '</div></div>';

  var pg = paginate(allRegistros, 'contabilidad');
  document.getElementById('tbContabilidad').innerHTML = pg.items.map(function(r) {
    var poliza = POLIZA_MAP[r.tipo] || {};
    var esIngreso = tiposIngreso.includes(r.tipo);
    var cuentaDebe = r.cuentaDebe || poliza.debe || '-';
    var cuentaHaber = r.cuentaHaber || poliza.haber || '-';
    return '<tr>' +
      '<td>' + fmtDate(r.fecha) + '</td>' +
      '<td><span class="badge ' + (esIngreso ? 'badge-green' : 'badge-red') + '">' + (contaTipoLabel[r.tipo] || r.tipo) + '</span></td>' +
      '<td style="font-size:11px">' + getCuentaNombre(cuentaDebe) + ' / ' + getCuentaNombre(cuentaHaber) + '</td>' +
      '<td>' + esc(r.concepto) + '</td>' +
      '<td style="text-align:right">' + fmt(r.monto) + '</td>' +
      '<td style="text-align:right">' + fmt(r.monto) + '</td>' +
      '<td>' + (r.referencia ? esc(r.referencia) : '-') + '</td></tr>';
  }).join('');
  renderPagination('contabilidad', pg.total, pg.page, pg.count);
}

// ===== BALANCE GENERAL =====
function renderBalance() {
  var fechaCorte = document.getElementById('balanceFecha').value || new Date().toISOString().split('T')[0];
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var pagos = getStore('pagos');
  var contab = getStore('contabilidad');

  // Filtrar por fechaCorte: solo datos hasta esa fecha
  var pagosCorte = pagos.filter(function(p) { return p.fecha && p.fecha <= fechaCorte && !p.reversado; });
  var contabCorte = contab.filter(function(r) { return r.fecha && r.fecha <= fechaCorte; });

  // Activos — reconstruir cartera al fechaCorte
  var carteraVigente = 0;
  var carteraVencida = 0;
  var provisionEstimada = 0;
  creditos.forEach(function(c) {
    if (!c.fechaInicio || c.fechaInicio > fechaCorte) return; // crédito no existía aún
    if (c.estado === 'liquidado') {
      // Verificar si fue liquidado antes de fechaCorte
      var pagosLiq = pagosCorte.filter(function(p) { return p.creditoId === c.id; });
      var totalCapPagado = pagosLiq.reduce(function(s, p) { return s + (p.capital || 0); }, 0);
      var saldoAlCorte = Math.max(c.monto - totalCapPagado, 0);
      if (saldoAlCorte > 0.01) {
        // Aún no estaba liquidado al fechaCorte
        carteraVigente += saldoAlCorte;
        provisionEstimada += calcProvisionCNBV(saldoAlCorte, 0);
      }
      return;
    }
    // Reconstruir saldo al fechaCorte
    var pagosC = pagosCorte.filter(function(p) { return p.creditoId === c.id; });
    var totalCapPagado = pagosC.reduce(function(s, p) { return s + (p.capital || 0); }, 0);
    var saldoAlCorte = Math.max(c.monto - totalCapPagado, 0);
    // Determinar si estaba vencida al fechaCorte
    var amort = c.amortizacion || [];
    var diasMoraCorte = 0;
    for (var i = 0; i < amort.length; i++) {
      var cuota = amort[i];
      if (!cuota.pagado && cuota.fecha && cuota.fecha <= fechaCorte) {
        var diffMs = new Date(fechaCorte) - new Date(cuota.fecha);
        var diffDias = Math.floor(diffMs / 86400000);
        if (diffDias > diasMoraCorte) diasMoraCorte = diffDias;
      }
    }
    if (diasMoraCorte > 90) {
      carteraVencida += saldoAlCorte;
    } else {
      carteraVigente += saldoAlCorte;
    }
    provisionEstimada += calcProvisionCNBV(saldoAlCorte, diasMoraCorte);
  });

  // Intereses por cobrar: sumar interés de TODAS las cuotas vencidas no pagadas hasta fechaCorte
  var intPorCobrar = creditos.filter(function(c) { return c.estado !== 'liquidado' && c.amortizacion; }).reduce(function(s, c) {
    var amort = c.amortizacion || [];
    var intDevengado = 0;
    for (var i = 0; i < amort.length; i++) {
      var cuota = amort[i];
      var fCuota = cuota.fecha || cuota.fechaPago || '';
      if (!cuota.pagado && fCuota && fCuota <= fechaCorte) {
        intDevengado += (cuota.interes || 0);
      }
    }
    return s + intDevengado;
  }, 0);

  var totalCobrado = pagosCorte.reduce(function(s, p) { return s + p.monto; }, 0);
  var totalColocado = creditos.filter(function(c) { return c.fechaInicio && c.fechaInicio <= fechaCorte; }).reduce(function(s, c) { return s + c.monto; }, 0);
  var totalFondeoRecibido = fondeos.filter(function(f) { return f.fechaInicio && f.fechaInicio <= fechaCorte; }).reduce(function(s, f) { return s + f.monto; }, 0);
  var totalPagadoFondeos = contabCorte.filter(function(r) { return r.tipo === 'pago_fondeo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalGastosOp = contabCorte.filter(function(r) { return r.tipo === 'gasto_operativo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var comisionesApertura = contabCorte.filter(function(r) { return r.tipo === 'comision' && r.concepto && r.concepto.indexOf('apertura') >= 0; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var ivaComisionesApertura = contabCorte.filter(function(r) { return r.tipo === 'iva_trasladado' && r.concepto && r.concepto.indexOf('comisión apertura') >= 0; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var efectivo = totalFondeoRecibido + totalCobrado - totalColocado + comisionesApertura + ivaComisionesApertura - totalPagadoFondeos - totalGastosOp;

  // Pasivos
  var saldoFondeos = fondeos.filter(function(f) { return f.estado !== 'liquidado'; }).reduce(function(s, f) { return s + f.saldo; }, 0);
  // Intereses por pagar: usar saldo real × tasa diaria × días desde último pago
  var intPorPagar = fondeos.filter(function(f) { return f.estado === 'vigente'; }).reduce(function(s, f) {
    var pagosF = pagosCorte.filter(function(p) { return p.fondeoId === f.id; });
    var fechaRef = pagosF.length > 0 ? pagosF[pagosF.length - 1].fecha : (f.fechaInicio || fechaCorte);
    var dias = Math.max(0, Math.floor((new Date(fechaCorte) - new Date(fechaRef)) / 86400000));
    return s + ((f.saldo || 0) * (f.tasa || 0) / 360 * dias);
  }, 0);
  // IVA Trasladado por pagar
  var ivaPorPagar = contabCorte.filter(function(r) { return r.tipo === 'iva_trasladado'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalPasivos = saldoFondeos + intPorPagar + ivaPorPagar;

  var totalActivos = efectivo + carteraVigente + carteraVencida + intPorCobrar - provisionEstimada;
  var capital = totalActivos - totalPasivos;

  var html = '<div class="card"><div class="card-header"><span class="card-title">Balance General al ' + fmtDate(fechaCorte) + '</span></div>';
  html += '<table style="width:100%"><thead><tr><th colspan="2" style="background:var(--navy);color:white">ACTIVOS</th><th colspan="2" style="background:var(--navy);color:white">PASIVOS Y CAPITAL</th></tr></thead><tbody>';
  html += '<tr><td style="font-weight:600;color:var(--navy)">Activo Circulante</td><td></td><td style="font-weight:600;color:var(--navy)">Pasivo Circulante</td><td></td></tr>';
  html += '<tr><td style="padding-left:16px">Caja y Bancos</td><td style="text-align:right">' + fmt(efectivo) + '</td><td style="padding-left:16px">Fondeos por Pagar</td><td style="text-align:right">' + fmt(saldoFondeos) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Cartera Vigente</td><td style="text-align:right">' + fmt(carteraVigente) + '</td><td style="padding-left:16px">Intereses por Pagar</td><td style="text-align:right">' + fmt(intPorPagar) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Cartera Vencida</td><td style="text-align:right;color:var(--red)">' + fmt(carteraVencida) + '</td><td style="padding-left:16px">IVA Trasladado por Pagar</td><td style="text-align:right">' + fmt(ivaPorPagar) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Intereses por Cobrar</td><td style="text-align:right">' + fmt(intPorCobrar) + '</td><td style="font-weight:bold;border-top:2px solid var(--gray-300)">Total Pasivos</td><td style="text-align:right;font-weight:bold;border-top:2px solid var(--gray-300)">' + fmt(totalPasivos) + '</td></tr>';
  html += '<tr><td style="padding-left:16px;color:var(--red)">(-) Estimación Preventiva</td><td style="text-align:right;color:var(--red)">(' + fmt(provisionEstimada) + ')</td><td></td><td></td></tr>';
  html += '<tr><td style="font-weight:bold;border-top:2px solid var(--gray-300)">Total Activos</td><td style="text-align:right;font-weight:bold;border-top:2px solid var(--gray-300)">' + fmt(totalActivos) + '</td><td style="font-weight:600;color:var(--navy);border-top:1px solid var(--gray-200);padding-top:8px">Capital Contable</td><td></td></tr>';
  html += '<tr><td></td><td></td><td style="padding-left:16px">Resultado del Ejercicio</td><td style="text-align:right">' + fmt(capital) + '</td></tr>';
  html += '<tr style="background:var(--gray-50)"><td style="font-weight:bold;font-size:15px">TOTAL ACTIVOS</td><td style="text-align:right;font-weight:bold;font-size:15px;color:var(--navy)">' + fmt(totalActivos) + '</td><td style="font-weight:bold;font-size:15px">TOTAL PASIVO + CAPITAL</td><td style="text-align:right;font-weight:bold;font-size:15px;color:var(--navy)">' + fmt(totalPasivos + capital) + '</td></tr>';
  html += '</tbody></table></div>';
  document.getElementById('balanceContent').innerHTML = html;
}

// ===== ESTADO DE RESULTADOS =====
function renderResultados() {
  var mes = document.getElementById('resultadosMes').value || new Date().toISOString().substring(0, 7);
  var contab = getStore('contabilidad').filter(function(r) { return r.fecha && r.fecha.startsWith(mes); });

  var intCobrados = contab.filter(function(r) { return r.tipo === 'ingreso_intereses' || r.tipo === 'ingreso_arrendamiento' || r.tipo === 'devengo_intereses'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var comisiones = contab.filter(function(r) { return r.tipo === 'comision'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var ivaTrasladado = contab.filter(function(r) { return r.tipo === 'iva_trasladado'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalIngresos = intCobrados + comisiones;

  var intPagados = contab.filter(function(r) { return r.tipo === 'pago_fondeo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var gastosOp = contab.filter(function(r) { return r.tipo === 'gasto_operativo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var quitas = contab.filter(function(r) { return r.tipo === 'quita_reestructura'; }).reduce(function(s, r) { return s + Math.abs(r.monto); }, 0);
  var provisiones = contab.filter(function(r) { return r.tipo === 'provision_cartera'; }).reduce(function(s, r) { return s + Math.abs(r.monto); }, 0);
  var totalGastos = intPagados + gastosOp + quitas + provisiones;

  var margenFinanciero = intCobrados - intPagados;
  var utilidadOp = totalIngresos - totalGastos;

  var mNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = mes.split('-');
  var mesLabel = parts.length === 2 ? mNames[parseInt(parts[1]) - 1] + ' ' + parts[0] : mes;

  var html = '<div class="card"><div class="card-header"><span class="card-title">Estado de Resultados — ' + mesLabel + '</span></div>';
  html += '<table style="width:100%;max-width:600px">';
  html += '<thead><tr><th style="background:var(--navy);color:white">Concepto</th><th style="background:var(--navy);color:white;text-align:right">Importe</th></tr></thead><tbody>';
  html += '<tr style="font-weight:600;color:var(--navy)"><td>INGRESOS FINANCIEROS</td><td></td></tr>';
  html += '<tr><td style="padding-left:16px">Intereses Cobrados</td><td style="text-align:right">' + fmt(intCobrados) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Comisiones</td><td style="text-align:right">' + fmt(comisiones) + '</td></tr>';
  if (ivaTrasladado > 0) html += '<tr><td style="padding-left:16px;color:var(--gray-500);font-size:12px">IVA Trasladado (no es ingreso)</td><td style="text-align:right;color:var(--gray-500);font-size:12px">' + fmt(ivaTrasladado) + '</td></tr>';
  html += '<tr style="font-weight:bold;border-top:1px solid var(--gray-300)"><td>Total Ingresos</td><td style="text-align:right;color:var(--green)">' + fmt(totalIngresos) + '</td></tr>';
  html += '<tr><td>&nbsp;</td><td></td></tr>';
  html += '<tr style="font-weight:600;color:var(--navy)"><td>COSTOS Y GASTOS</td><td></td></tr>';
  html += '<tr><td style="padding-left:16px">Intereses Pagados (Fondeos)</td><td style="text-align:right">' + fmt(intPagados) + '</td></tr>';
  if (quitas > 0) html += '<tr><td style="padding-left:16px">Quitas / Estimación Preventiva</td><td style="text-align:right">' + fmt(quitas) + '</td></tr>';
  if (provisiones > 0) html += '<tr><td style="padding-left:16px">Provisiones Cartera</td><td style="text-align:right">' + fmt(provisiones) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Gastos de Operación</td><td style="text-align:right">' + fmt(gastosOp) + '</td></tr>';
  html += '<tr style="font-weight:bold;border-top:1px solid var(--gray-300)"><td>Total Costos y Gastos</td><td style="text-align:right;color:var(--red)">' + fmt(totalGastos) + '</td></tr>';
  html += '<tr><td>&nbsp;</td><td></td></tr>';
  html += '<tr style="background:var(--gray-50);border-top:2px solid var(--gray-400)"><td style="padding-left:16px;font-weight:600">Margen Financiero</td><td style="text-align:right;font-weight:600">' + fmt(margenFinanciero) + '</td></tr>';
  html += '<tr style="background:var(--navy);color:white"><td style="font-weight:bold;font-size:15px;padding:10px">UTILIDAD (PÉRDIDA) DEL PERIODO</td><td style="text-align:right;font-weight:bold;font-size:15px;padding:10px">' + fmt(utilidadOp) + '</td></tr>';
  html += '</tbody></table></div>';
  document.getElementById('resultadosContent').innerHTML = html;
}

// ===== CONCILIACIÓN BANCARIA =====
function renderConciliacion() {
  var mes = document.getElementById('conciliacionMes').value || new Date().toISOString().substring(0, 7);
  var saldoBanco = parseMiles('conciliacionSaldoBanco');

  var contab = getStore('contabilidad').filter(function(r) { return r.fecha && r.fecha.startsWith(mes); });
  var pagos = getStore('pagos').filter(function(p) { return p.fecha && p.fecha.startsWith(mes); });

  // Saldo según sistema
  var tiposConcIngreso = ['ingreso_intereses','ingreso_arrendamiento','pago_recibido','comision'];
  var tiposConcEgreso = ['pago_fondeo','colocacion','gasto_operativo','quita_reestructura','reversa_pago'];
  var ingresos = contab.filter(function(r) { return tiposConcIngreso.includes(r.tipo); }).reduce(function(s, r) { return s + r.monto; }, 0);
  var egresos = contab.filter(function(r) { return tiposConcEgreso.includes(r.tipo); }).reduce(function(s, r) { return s + Math.abs(r.monto); }, 0);
  var saldoSistema = ingresos - egresos;
  var diferencia = saldoBanco - saldoSistema;

  var html = '<div class="kpi-grid" style="margin-bottom:12px">';
  html += '<div class="kpi-card blue"><div class="kpi-label">Saldo Banco</div><div class="kpi-value">' + fmt(saldoBanco) + '</div></div>';
  html += '<div class="kpi-card navy"><div class="kpi-label">Saldo Sistema</div><div class="kpi-value">' + fmt(saldoSistema) + '</div><div class="kpi-sub">Ingresos ' + fmt(ingresos) + ' - Egresos ' + fmt(egresos) + '</div></div>';
  html += '<div class="kpi-card ' + (Math.abs(diferencia) < 0.01 ? 'green' : 'red') + '"><div class="kpi-label">Diferencia</div><div class="kpi-value">' + fmt(diferencia) + '</div><div class="kpi-sub">' + (Math.abs(diferencia) < 0.01 ? 'Conciliado' : 'Pendiente de conciliar') + '</div></div>';
  html += '</div>';

  // Detalle de movimientos del mes
  html += '<div class="card"><div class="card-header"><span class="card-title">Movimientos del Mes</span></div>';
  html += '<table style="width:100%"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th style="text-align:right">Cargo</th><th style="text-align:right">Abono</th></tr></thead><tbody>';
  var movsMes = contab.sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
  var esIngreso;
  movsMes.forEach(function(r) {
    esIngreso = tiposConcIngreso.includes(r.tipo);
    html += '<tr><td>' + fmtDate(r.fecha) + '</td><td>' + (contaTipoLabel[r.tipo] || esc(r.tipo)) + '</td><td>' + esc(r.concepto) + '</td>';
    html += '<td style="text-align:right">' + (esIngreso ? '' : fmt(r.monto)) + '</td>';
    html += '<td style="text-align:right">' + (esIngreso ? fmt(r.monto) : '') + '</td></tr>';
  });
  if (movsMes.length === 0) html += '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px">Sin movimientos en este periodo</td></tr>';
  html += '<tr style="font-weight:bold;border-top:2px solid var(--gray-400)"><td colspan="3">TOTALES</td><td style="text-align:right">' + fmt(egresos) + '</td><td style="text-align:right">' + fmt(ingresos) + '</td></tr>';
  html += '</tbody></table></div>';
  document.getElementById('conciliacionContent').innerHTML = html;
}

// Exportar contabilidad a Excel
function exportarContabilidadExcel() {
  var contab = getStore('contabilidad').sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
  var headers = ['Fecha', 'Tipo', 'Cuenta Debe', 'Cuenta Haber', 'Concepto', 'Debe', 'Haber', 'Referencia'];
  var data = contab.map(function(r) {
    var poliza = POLIZA_MAP[r.tipo] || {};
    return [r.fecha, contaTipoLabel[r.tipo] || r.tipo, getCuentaNombre(r.cuentaDebe || poliza.debe || '-'), getCuentaNombre(r.cuentaHaber || poliza.haber || '-'), r.concepto, r.monto, r.monto, r.referencia || ''];
  });
  exportToExcel(data, headers, 'AP_Contabilidad_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Contabilidad');
}

function guardarContabilidad() {
  if (!hasPermiso('contabilidad', 'crear')) return toast('Sin permiso para crear registros contables', 'error');
  V.clearErrors('modalContabilidad');
  var fecha = document.getElementById('contaFecha').value;
  // Bug #40: No permitir registros en períodos cerrados
  if (fecha) {
    const periodoFecha = fecha.substring(0, 7); // YYYY-MM
    if (isPeriodoCerrado(periodoFecha)) return toast('No se pueden agregar registros al período ' + periodoFecha + ' (cerrado)', 'error');
  }
  var tipo = document.getElementById('contaTipo').value;
  var concepto = document.getElementById('contaConcepto').value.trim();
  var montoVal = String(parseMiles('contaMonto'));

  var ok = true;
  ok = V.check('contaFecha', !!fecha, 'Fecha es obligatoria') && ok;
  ok = V.check('contaConcepto', concepto.length >= 3, 'Concepto obligatorio (mín. 3 caracteres)') && ok;
  ok = V.check('contaMonto', V.positiveNum(montoVal), 'Monto debe ser mayor a 0') && ok;
  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  var poliza = POLIZA_MAP[tipo] || { debe: '-', haber: '-' };
  var reg = {
    id: nextId('contabilidad'),
    fecha: fecha,
    tipo: tipo,
    concepto: concepto,
    monto: parseFloat(montoVal),
    cuentaDebe: poliza.debe,
    cuentaHaber: poliza.haber,
    referencia: document.getElementById('contaRef').value,
    notas: document.getElementById('contaNotas').value,
    createdAt: new Date().toISOString()
  };
  var contab = getStore('contabilidad');
  contab.push(reg);
  setStore('contabilidad', contab);
  addAudit('Crear', 'Contabilidad', reg.concepto);
  closeModal('modalContabilidad');
  toast('Póliza contable registrada', 'success');
  renderContabilidad();
}

// ============================================================
