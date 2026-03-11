//  FIX #10: ANÁLISIS DE ESCENARIOS PARA REFINANCIAMIENTO
// ============================================================
// Simula escenarios de reestructura para un crédito específico:
//  - Replazo de plazo (36m vs 48m vs 60m)
//  - Quita parcial (descuento sobre saldo)
//  - Periodo de gracia (moratoria: meses sin pagar capital)
//  - Cambio de tasa
// Genera tabla comparativa con flujo de caja del acreditado y costo para la empresa
function simularReestructuraCredito(creditoId) {
  var creditos = getStore('creditos');
  var cred = creditos.find(function(c) { return c.id === creditoId; });
  if (!cred) return toast('Crédito no encontrado', 'error');

  var saldo = cred.saldoActual || cred.saldo || cred.monto;
  var tasaActual = cred.tasa || 0;
  var tasaMora = cred.tasaMoratoria || tasaActual * 1.5;
  var periodicidadCred = cred.periodicidad || 'mensual';
  var moraInfo = calcMoratorioDevengado(cred);

  // Escenarios predefinidos
  var escenarios = [];

  // 0. Base: estado actual (sin cambio)
  var pagadosCount = (cred.amortizacion || []).filter(function(a) { return a.pagado; }).length;
  var periodosRestantes = Math.max(1, (cred.amortizacion || []).length - pagadosCount);
  var pagoActual = cred.pago || 0;
  escenarios.push({
    nombre: 'Actual (sin cambio)',
    tipo: 'base',
    saldo: saldo,
    tasa: tasaActual,
    plazoMeses: periodosRestantes,
    pagoMensual: pagoActual,
    totalPagos: pagoActual * periodosRestantes,
    costoMora: moraInfo.monto,
    quita: 0,
    gracia: 0,
    costoEmpresa: 0 // sin costo adicional
  });

  // 1. Replazo: extender plazo +50%
  var plazoExtendido = Math.ceil(periodosRestantes * 1.5);
  var pagoExtendido = calcPagoSimple(saldo, tasaActual, plazoExtendido, periodicidadCred);
  escenarios.push({
    nombre: 'Extender plazo (' + plazoExtendido + ' meses)',
    tipo: 'replazo',
    saldo: saldo,
    tasa: tasaActual,
    plazoMeses: plazoExtendido,
    pagoMensual: pagoExtendido,
    totalPagos: +(pagoExtendido * plazoExtendido).toFixed(2),
    costoMora: 0,
    quita: 0,
    gracia: 0,
    costoEmpresa: +((pagoExtendido * plazoExtendido) - saldo - (pagoActual * periodosRestantes - saldo)).toFixed(2)
  });

  // 2. Quita 20% + replazo
  var saldoConQuita = +(saldo * 0.8).toFixed(2);
  var pagoConQuita = calcPagoSimple(saldoConQuita, tasaActual, periodosRestantes, periodicidadCred);
  escenarios.push({
    nombre: 'Quita 20% ($' + fmt(saldo - saldoConQuita) + ')',
    tipo: 'quita',
    saldo: saldoConQuita,
    tasa: tasaActual,
    plazoMeses: periodosRestantes,
    pagoMensual: pagoConQuita,
    totalPagos: +(pagoConQuita * periodosRestantes).toFixed(2),
    costoMora: 0,
    quita: +(saldo - saldoConQuita).toFixed(2),
    gracia: 0,
    costoEmpresa: +(saldo - saldoConQuita).toFixed(2) // pérdida directa
  });

  // 3. Periodo de gracia (3 periodos sin capital, solo intereses)
  var periodosGracia = 3;
  var divisorGracia = periodicidadCred === 'quincenal' ? 24 : periodicidadCred === 'semanal' ? 52 : 12;
  var intGracia = +(saldo * (tasaActual / divisorGracia) * periodosGracia).toFixed(2);
  var pagoPostGracia = calcPagoSimple(saldo, tasaActual, periodosRestantes, periodicidadCred);
  escenarios.push({
    nombre: 'Gracia ' + periodosGracia + ' periodos (solo intereses)',
    tipo: 'gracia',
    saldo: saldo,
    tasa: tasaActual,
    plazoMeses: periodosRestantes + periodosGracia,
    pagoMensual: pagoPostGracia,
    totalPagos: +(pagoPostGracia * periodosRestantes + intGracia).toFixed(2),
    costoMora: 0,
    quita: 0,
    gracia: periodosGracia,
    costoEmpresa: +intGracia.toFixed(2) // costo oportunidad del capital detenido
  });

  // 4. Reducción de tasa 25% + extensión
  var tasaReducida = +(tasaActual * 0.75).toFixed(4);
  var pagoTasaRed = calcPagoSimple(saldo, tasaReducida, plazoExtendido, periodicidadCred);
  escenarios.push({
    nombre: 'Tasa -25% (' + (tasaReducida * 100).toFixed(1) + '%) + plazo',
    tipo: 'tasa_reducida',
    saldo: saldo,
    tasa: tasaReducida,
    plazoMeses: plazoExtendido,
    pagoMensual: pagoTasaRed,
    totalPagos: +(pagoTasaRed * plazoExtendido).toFixed(2),
    costoMora: 0,
    quita: 0,
    gracia: 0,
    costoEmpresa: +((tasaActual - tasaReducida) * saldo * (plazoExtendido / 12)).toFixed(2)
  });

  // Renderizar resultados
  renderEscenariosReestructura(cred, escenarios, moraInfo);
}

function calcPagoSimple(saldo, tasaAnual, periodos, periodicidad) {
  // Usar tasa periódica correcta según periodicidad (igual que getTasaPeriodica)
  var divisor = 12; // mensual por defecto
  if (periodicidad === 'quincenal') divisor = 24;
  else if (periodicidad === 'semanal') divisor = 52;
  var r = tasaAnual / divisor;
  if (r === 0) return +(saldo / periodos).toFixed(2);
  return +(saldo * (r * Math.pow(1 + r, periodos)) / (Math.pow(1 + r, periodos) - 1)).toFixed(2);
}

function renderEscenariosReestructura(cred, escenarios, moraInfo) {
  var html = '<div style="margin-bottom:16px;padding:12px;background:var(--gray-50);border-radius:8px">';
  html += '<strong>Crédito:</strong> ' + esc(cred.numero) + ' | <strong>Saldo:</strong> ' + fmt(cred.saldo) + ' | <strong>Mora:</strong> ' + moraInfo.diasMora + ' días (' + fmt(moraInfo.monto) + ')';
  html += '</div>';

  // Tabla comparativa
  html += '<table class="data-table"><thead><tr>';
  html += '<th>Escenario</th><th>Saldo</th><th>Tasa</th><th>Plazo</th><th>Pago mensual</th><th>Total pagos</th><th>Quita</th><th>Costo empresa</th><th>Ahorro cliente</th>';
  html += '</tr></thead><tbody>';

  var base = escenarios[0];
  escenarios.forEach(function(e) {
    var ahorroCliente = base.pagoMensual - e.pagoMensual;
    var pctAhorro = base.pagoMensual > 0 ? ((ahorroCliente / base.pagoMensual) * 100).toFixed(1) : '0.0';
    var esBase = e.tipo === 'base';
    var rowStyle = esBase ? 'background:rgba(59,130,246,0.08);font-weight:600' : '';
    html += '<tr style="' + rowStyle + '">';
    html += '<td>' + esc(e.nombre) + '</td>';
    html += '<td style="text-align:right">' + fmt(e.saldo) + '</td>';
    html += '<td style="text-align:center">' + (e.tasa * 100).toFixed(1) + '%</td>';
    html += '<td style="text-align:center">' + e.plazoMeses + ' m</td>';
    html += '<td style="text-align:right;font-weight:600">' + fmt(e.pagoMensual) + '</td>';
    html += '<td style="text-align:right">' + fmt(e.totalPagos) + '</td>';
    html += '<td style="text-align:right;color:#EF4444">' + (e.quita > 0 ? fmt(e.quita) : '—') + '</td>';
    html += '<td style="text-align:right;color:#F59E0B">' + (e.costoEmpresa > 0 ? fmt(e.costoEmpresa) : '—') + '</td>';
    html += '<td style="text-align:right;color:' + (ahorroCliente > 0 ? '#0D9F6E' : 'var(--text-primary)') + '">' + (esBase ? '—' : fmt(ahorroCliente) + '/mes (' + pctAhorro + '%)') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  // Recomendación
  var mejorRel = escenarios.slice(1).reduce(function(best, e) {
    var ratio = e.costoEmpresa > 0 ? ((base.pagoMensual - e.pagoMensual) / e.costoEmpresa) : 0;
    return ratio > best.ratio ? { esc: e, ratio: ratio } : best;
  }, { esc: null, ratio: -Infinity });

  if (mejorRel.esc) {
    html += '<div style="margin-top:16px;padding:12px;background:#F0FDF4;border-left:4px solid #0D9F6E;border-radius:4px">';
    html += '<strong style="color:#0D9F6E">Recomendación:</strong> ' + esc(mejorRel.esc.nombre);
    html += ' — Reduce pago mensual en ' + fmt(base.pagoMensual - mejorRel.esc.pagoMensual) + ' con costo empresa de ' + fmt(mejorRel.esc.costoEmpresa);
    html += '</div>';
  }

  openModal('modalGenerico');
  document.getElementById('modalGenericoTitle').textContent = 'Análisis de Escenarios de Reestructura';
  document.getElementById('modalGenericoBody').innerHTML = html;
  addAudit('Simulación', 'Reestructura', 'Análisis de ' + escenarios.length + ' escenarios para crédito ' + cred.numero);
}

