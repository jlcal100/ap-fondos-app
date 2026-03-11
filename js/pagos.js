//  PAGOS
// ============================================================
function populatePagoSelect() {
  const creditos = getStore('creditos').filter(c => c.estado === 'vigente' || c.estado === 'vencido');
  const clientes = getStore('clientes');
  document.getElementById('pagoCredito').innerHTML = '<option value="">Seleccionar crédito...</option>' +
    creditos.map(c => {
      const cli = clientes.find(cl => cl.id === c.clienteId);
      return `<option value="${c.id}">${esc(c.numero)} — ${cli ? esc(cli.nombre) : ''} — Saldo: ${fmt(c.saldo)}</option>`;
    }).join('');
}

function renderPagosCredito() {
  const credId = parseInt(document.getElementById('pagoCredito').value);
  document.getElementById('btnNuevoPago').disabled = !credId;
  if (!credId) { document.getElementById('pagosInfo').style.display = 'none'; return; }
  const c = getStore('creditos').find(cr => cr.id === credId);
  document.getElementById('pagosInfo').style.display = 'block';
  document.getElementById('pagosInfoBody').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card navy"><div class="kpi-label">Crédito</div><div class="kpi-value" style="font-size:16px">${esc(c.numero)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Saldo Capital</div><div class="kpi-value" style="font-size:16px">${fmt(c.saldo)}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">Pago Periódico</div><div class="kpi-value" style="font-size:16px">${fmt(c.pago)}</div></div>
      <div class="kpi-card green"><div class="kpi-label">Tasa</div><div class="kpi-value" style="font-size:16px">${(c.tasa * 100).toFixed(2)}%</div></div>
    </div>
  `;
  renderPagosTable(credId);
}

function renderPagosTable(creditoId) {
  const allPagos = getStore('pagos').filter(p => !creditoId || p.creditoId === creditoId)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const pg = paginate(allPagos, 'pagos');
  document.getElementById('tbPagos').innerHTML = pg.items.map(p => {
    const c = getStore('creditos').find(cr => cr.id === p.creditoId);
    var revBadge = p.reversado ? ' <span class="badge badge-red" style="font-size:10px">Reversado</span>' : (p.tipo === 'reversa' ? ' <span class="badge badge-yellow" style="font-size:10px">Reversa</span>' : '');
    var trStyle = p.reversado ? 'style="opacity:0.5;text-decoration:line-through"' : (p.tipo === 'reversa' ? 'style="background:#FEF3C7"' : '');
    return `<tr ${trStyle}><td>${fmtDate(p.fecha)}${revBadge}</td><td>${c ? esc(c.numero) : '-'}</td><td>${fmt(p.capital)}</td><td>${fmt(p.interes)}</td><td>${fmt(p.moratorio)}</td><td>${fmt(p.comision)}</td><td><strong>${fmt(p.monto)}</strong></td><td>${fmt(p.saldoNuevo)}</td></tr>`;
  }).join('');
  renderPagination('pagos', pg.total, pg.page, pg.count);
}

function renderAllPagos() {
  renderPagosTable(null);
}

function openModalPago() {
  const credId = parseInt(document.getElementById('pagoCredito').value);
  if (!credId) return;
  const c = getStore('creditos').find(cr => cr.id === credId);
  document.getElementById('pagoInfoCredito').innerHTML = `<strong>${esc(c.numero)}</strong> — Saldo: ${fmt(c.saldo)} — Pago sugerido: ${fmt(c.pago)}`;
  document.getElementById('pagoFecha').value = new Date().toISOString().split('T')[0];

  // Sugerir desglose del próximo pago
  const nextPago = (c.amortizacion || []).find(a => !a.pagado);
  if (nextPago) {
    setInputMiles('pagoCapital', nextPago.capital);
    setInputMiles('pagoInteres', nextPago.interes);
  }

  // Fix #6: Auto-calcular interés moratorio con función mejorada
  var moraInfo = calcMoratorioDevengado(c);
  if (moraInfo.monto > 0) {
    setInputMiles('pagoMoratorio', moraInfo.monto);
    // Mostrar detalle de mora al usuario
    var moraHint = document.getElementById('pagoMoraHint');
    if (moraHint) moraHint.innerHTML = '<small style="color:#F59E0B">Mora: ' + moraInfo.diasMora + ' días, saldo vencido: ' + fmt(moraInfo.saldoVencido) + ', tasa mora: ' + ((moraInfo.tasaMoratoria || 0) * 100).toFixed(1) + '%</small>';
  } else {
    document.getElementById('pagoMoratorio').value = '';
    var moraHint = document.getElementById('pagoMoraHint');
    if (moraHint) moraHint.innerHTML = '';
  }

  // Auto-calcular IVA sobre intereses (16%)
  var ivaAuto = +((nextPago ? nextPago.interes : 0) * 0.16).toFixed(2);
  if (moraInfo && moraInfo.monto > 0) ivaAuto = +((( nextPago ? nextPago.interes : 0) + moraInfo.monto) * 0.16).toFixed(2);
  setInputMiles('pagoIVA', ivaAuto);

  openModal('modalPago');
}

function guardarPago() {
  if (!guardSave('pago')) return;
  if (!hasPermiso('pagos', 'crear')) return toast('Sin permiso para registrar pagos', 'error');
  V.clearErrors('modalPago');
  const credId = parseInt(document.getElementById('pagoCredito').value);
  const c = getStore('creditos').find(cr => cr.id === credId);

  var ok = true;
  ok = V.check('pagoCredito', !!c, 'Seleccione un crédito válido') && ok;
  if (!c) return toast('Seleccione un crédito válido', 'error');

  const capital = parseMiles('pagoCapital');
  const interes = parseMiles('pagoInteres');
  const moratorio = parseMiles('pagoMoratorio');
  const comision = parseMiles('pagoComision');
  const iva = +((interes + moratorio) * 0.16).toFixed(2);
  setInputMiles('pagoIVA', iva);
  const monto = capital + interes + moratorio + comision + iva;
  const fecha = document.getElementById('pagoFecha').value;

  ok = V.check('pagoCapital', V.nonNegNum(capital), 'Capital no puede ser negativo') && ok;
  ok = V.check('pagoCapital', capital <= c.saldo + 0.01, 'Capital no puede exceder el saldo pendiente ' + fmt(c.saldo)) && ok;
  ok = V.check('pagoInteres', V.nonNegNum(interes), 'Interés no puede ser negativo') && ok;
  ok = V.check('pagoFecha', !!fecha, 'Fecha es obligatoria') && ok;
  ok = V.check('pagoCapital', monto > 0, 'El monto total del pago debe ser mayor a 0') && ok;

  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  // PLD: Verificar alertas pendientes del cliente antes de registrar pago
  var pldPagos = getStore('pld') || [];
  var alertasPagoPLD = pldPagos.filter(function(a) {
    return a.clienteId === c.clienteId && a.estado !== 'revisado' && a.estado !== 'descartado' && (a.riesgo === 'alto' || a.riesgo === 'critico');
  });
  if (alertasPagoPLD.length > 0) {
    var clientePLD = getStore('clientes').find(function(cl) { return cl.id === c.clienteId; });
    var riesgosStr = alertasPagoPLD.map(function(a) { return (a.categoria || 'N/A') + ' (' + a.riesgo + ')'; }).join(', ');
    if (monto >= (getPLDConfig().umbralAviso || 800000)) {
      toast('🚫 BLOQUEADO POR PLD: No se puede registrar un pago >= umbral PLD para un cliente con alertas de alto riesgo sin resolución previa.\n\nAlertas: ' + riesgosStr, 'error');
      addAudit('Pago bloqueado por PLD', 'PLD', 'Crédito ' + c.numero + ': pago de ' + fmt(monto) + ' bloqueado — ' + alertasPagoPLD.length + ' alertas de alto riesgo');
      return;
    }
    if (!confirm('⚠️ ALERTA PLD/AML\n\nEl cliente ' + (clientePLD ? clientePLD.nombre : '#' + c.clienteId) + ' tiene ' + alertasPagoPLD.length + ' alerta(s) PLD de alto riesgo:\n' + riesgosStr + '\n\nMonto del pago: ' + fmt(monto) + '\n\n¿Confirma registrar este pago?\nEsto quedará documentado en la bitácora de auditoría.')) return;
    addAudit('Pago con alerta PLD', 'PLD', 'Crédito ' + c.numero + ': pago de ' + fmt(monto) + ' autorizado manualmente con ' + alertasPagoPLD.length + ' alertas pendientes');
  }

  // Mejora 7: Validación de duplicados de pagos
  var pagosExist = getStore('pagos');
  var pagoDup = pagosExist.find(function(p) {
    return p.creditoId === credId && p.fecha === fecha && Math.abs(p.monto - monto) < 0.01;
  });
  if (pagoDup) {
    if (!confirm('⚠️ Ya existe un pago similar:\n\n• ' + fmtDate(pagoDup.fecha) + ' — ' + fmt(pagoDup.monto) + '\n\nMismo crédito, fecha y monto.\n¿Seguro que deseas registrar otro?')) return;
  }

  // Fix #8: Confirmación para pagos que representan >50% del saldo
  if (capital > c.saldo * 0.5 && capital < c.saldo - 0.01) {
    if (!confirm('⚠️ Este pago de capital (' + fmt(capital) + ') representa más del 50% del saldo actual (' + fmt(c.saldo) + ').\n\n¿Confirmar el registro?')) return;
  }

  // Validar que componentes del pago sean razonables vs tabla de amortización
  var nextCuota = (c.amortizacion || []).find(function(a) { return !a.pagado; });
  if (nextCuota && c.tipo !== 'cuenta_corriente') {
    var diffInt = Math.abs(interes - (nextCuota.interes || 0));
    var diffCap = Math.abs(capital - (nextCuota.capital || 0));
    // Advertir si el interés difiere >20% de lo esperado (posible error de captura)
    if (nextCuota.interes > 0 && diffInt > nextCuota.interes * 0.2 && interes > 0) {
      if (!confirm('⚠️ El interés capturado (' + fmt(interes) + ') difiere del esperado según tabla (' + fmt(nextCuota.interes) + ').\n\nDiferencia: ' + fmt(diffInt) + '\n\n¿Confirmar estos montos?')) return;
    }
    // Advertir si no se cobra interés y hay interés pendiente
    if (interes < 0.01 && capital > 0 && (nextCuota.interes || 0) > 1) {
      if (!confirm('⚠️ No se está cobrando interés ordinario.\n\nLa cuota pendiente tiene ' + fmt(nextCuota.interes) + ' de interés.\n\nEn México, los pagos deben aplicarse primero a interés y luego a capital.\n\n¿Continuar sin cobrar interés?')) return;
    }
  }

  const saldoAnterior = c.saldo;
  // Bug #13: Proteger contra saldos negativos por decimales
  const saldoNuevo = Math.max(+(saldoAnterior - capital).toFixed(2), 0);

  // Arrendamiento: advertir si el pago liquida el crédito y hay VR pendiente
  var vrPactado = c.monto * ((c.valorResidual || 0) / 100);
  if (c.tipo === 'arrendamiento' && vrPactado > 1 && saldoNuevo <= 0.01) {
    if (!confirm('⚠️ ARRENDAMIENTO — VALOR RESIDUAL\n\nEste pago liquida el contrato. El Valor Residual pactado es ' + fmt(vrPactado) + ' (' + (c.valorResidual || 0) + '% del monto original).\n\n¿Confirma que el VR está incluido en este pago o fue cobrado por separado?')) return;
  }

  const pago = {
    id: nextId('pagos'), creditoId: credId, fecha, monto, capital, interes, moratorio, comision, iva,
    saldoAnterior, saldoNuevo, metodo: document.getElementById('pagoMetodo').value,
    referencia: document.getElementById('pagoRef').value, notas: document.getElementById('pagoNotas').value,
    createdAt: new Date().toISOString()
  };

  // Sprint M: Verificar si requiere autorización para pagos grandes
  if (monto >= APROB_UMBRAL_PAGO) {
    var desc = c.numero + ' — Pago por ' + fmt(monto) + ' (Capital: ' + fmt(capital) + ', Interés: ' + fmt(interes) + ')';
    crearSolicitudAprobacion('pago_grande', { pago: pago }, monto, desc);
    _forceCloseModal('modalPago');
    toast('Pago por ' + fmt(monto) + ' enviado a autorización (requiere aprobación para montos >= ' + fmt(APROB_UMBRAL_PAGO) + ')', 'info');
    refreshNotifications();
    return;
  }

  // TRANSACCIÓN ATÓMICA: pagos + créditos + contabilidad en una sola operación
  // Protege contra race conditions si el usuario tiene múltiples pestañas abiertas
  var txOk = withTransaction(function() {
    // Re-leer datos frescos DENTRO de la transacción para evitar sobreescrituras
    var txPagos = getStore('pagos');
    // Verificar que el saldo del crédito no haya cambiado desde la validación
    var txCreditos = getStore('creditos');
    var txCred = txCreditos.find(function(cr) { return cr.id === credId; });
    if (!txCred) throw new Error('Crédito no encontrado');
    if (Math.abs(txCred.saldo - saldoAnterior) > 0.01) {
      throw new Error('El saldo del crédito cambió desde otra pestaña (era ' + fmt(saldoAnterior) + ', ahora es ' + fmt(txCred.saldo) + '). Cierra este diálogo y reintenta.');
    }

    // 1. Registrar pago
    pago.id = nextId('pagos'); // Recalcular ID dentro de la transacción
    txPagos.push(pago);
    setStore('pagos', txPagos);

    // 2. Actualizar crédito
    txCreditos = txCreditos.map(cr => {
      if (cr.id !== credId) return cr;
      cr.saldo = saldoNuevo;
      if (saldoNuevo <= 0.01) cr.estado = 'liquidado';
      // Arrendamiento: verificar que el Valor Residual fue cobrado
      var vrPactado = cr.monto * ((cr.valorResidual || 0) / 100);
      if (cr.tipo === 'arrendamiento' && vrPactado > 1) {
        cr.vrCobrado = true;
        cr.vrMonto = vrPactado;
        cr.vrFechaCobro = fecha;
      }
      // Fix #5: Recálculo inteligente de amortización para pagos parciales, anticipados y sobre-pagos
      // IMPORTANTE: Detectar tipo de pago ANTES de marcar cuota como pagada
      const nextUnpaid = (cr.amortizacion || []).find(a => !a.pagado);
      var esSoloIntereses = capital < 0.01 && interes > 0;

      if (saldoNuevo > 0.01 && cr.amortizacion && cr.tipo !== 'cuenta_corriente') {
        const pendientes = cr.amortizacion.filter(a => !a.pagado);
        const periodosRestantes = pendientes.length;

        if (periodosRestantes > 0) {
          const tasaPeriodica = getTasaPeriodica(cr.tasa, cr.periodicidad);
          const vrMonto = cr.monto * ((cr.valorResidual || 0) / 100);

          var nextAmort = pendientes[0];
          var pagoEsperado = nextAmort ? (nextAmort.capital + nextAmort.interes) : 0;
          var diffPago = Math.abs(capital + interes - pagoEsperado);
          var esExacto = diffPago < 1;
          var esAnticipado = capital > (nextAmort ? nextAmort.capital : 0) + 0.01;

          if (esExacto) {
            if (nextUnpaid) nextUnpaid.pagado = true;
          } else if (esSoloIntereses) {
            // Pago solo de intereses: NO marcar cuota como pagada
          } else {
            if (nextUnpaid) nextUnpaid.pagado = true;
            const pagadosArr = cr.amortizacion.filter(a => a.pagado);
            const pagadosCount = pagadosArr.length;
            const pendientesPost = cr.amortizacion.filter(a => !a.pagado);
            var nuevoPeriodos = pendientesPost.length;
            var nuevoPago;

            var esArrendRecalc = cr.tipo === 'arrendamiento';

            if (!esArrendRecalc && esAnticipado && cr.pagoAnticipadoReducePlazo !== false) {
              if (tasaPeriodica > 0) {
                var pagoActual = cr.pago || pagoEsperado;
                if (pagoActual > 0) {
                  var ratio = saldoNuevo * tasaPeriodica / pagoActual;
                  if (ratio < 1) {
                    nuevoPeriodos = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + tasaPeriodica));
                    nuevoPeriodos = Math.max(1, Math.min(nuevoPeriodos, pendientesPost.length));
                  }
                }
              }
            }

            if (esArrendRecalc) {
              var capitalFijoArr = +((saldoNuevo - vrMonto) / nuevoPeriodos).toFixed(2);
              var interesFlatArr = +(saldoNuevo * tasaPeriodica).toFixed(2);
              nuevoPago = capitalFijoArr + interesFlatArr;
            } else {
              const montoFinanciar = saldoNuevo - vrMonto / Math.pow(1 + tasaPeriodica, nuevoPeriodos);
              if (tasaPeriodica === 0) nuevoPago = montoFinanciar / nuevoPeriodos;
              else nuevoPago = montoFinanciar * (tasaPeriodica * Math.pow(1 + tasaPeriodica, nuevoPeriodos)) / (Math.pow(1 + tasaPeriodica, nuevoPeriodos) - 1);
            }

            let saldoTemp = saldoNuevo;
            let ultimaFechaPagada = pagadosArr.length > 0 ? pagadosArr[pagadosArr.length - 1] : null;
            let fechaBase = ultimaFechaPagada ? new Date(ultimaFechaPagada.fecha) : new Date(cr.fechaInicio);
            const diaOrigRecalc = new Date(cr.fechaInicio).getDate();

            const nuevaAmort = pagadosArr.slice();
            for (let j = 1; j <= nuevoPeriodos; j++) {
              fechaBase = avanzarFechaPeriodo(fechaBase, cr.periodicidad, diaOrigRecalc);

              let int, cap;
              if (esArrendRecalc) {
                int = interesFlatArr;
                cap = (j === nuevoPeriodos) ? +(saldoTemp - vrMonto).toFixed(2) : capitalFijoArr;
              } else {
                int = +(saldoTemp * tasaPeriodica).toFixed(2);
                cap = (j === nuevoPeriodos) ? +(saldoTemp - vrMonto).toFixed(2) : +(nuevoPago - int).toFixed(2);
              }
              const sf = +(saldoTemp - cap).toFixed(2);
              const ivaRecalc = +(Math.max(int, 0) * 0.16).toFixed(2);

              nuevaAmort.push({
                numero: pagadosCount + j,
                fecha: fechaBase.toISOString().split('T')[0],
                saldoInicial: Math.max(+saldoTemp.toFixed(2), 0),
                capital: Math.max(cap, 0),
                interes: Math.max(int, 0),
                iva: ivaRecalc,
                pagoTotal: +(cap + int + ivaRecalc).toFixed(2),
                saldoFinal: Math.max(sf, 0),
                pagado: false
              });
              saldoTemp = sf;
            }
            cr.amortizacion = nuevaAmort;
            cr.pago = nuevoPago;
            cr.periodosReducidos = (pendientesPost.length) - nuevoPeriodos;
          }
        }
      } else {
        if (nextUnpaid) nextUnpaid.pagado = true;
      }
      return cr;
    });
    setStore('creditos', txCreditos);

    // 3. Registro contable (cuenta diferenciada: 1204 para arrendamiento, 1201 para créditos)
    var txContab = getStore('contabilidad');
    var _cid1 = nextId('contabilidad');
    var esArrend = c.tipo === 'arrendamiento';
    var ctaCartera = esArrend ? '1204' : '1201';
    var tipoIngInt = esArrend ? 'ingreso_arrendamiento' : 'ingreso_intereses';
    // Asiento 1: Capital — Banco (debe) → Cartera (haber) — solo la porción de capital
    var _cidSeq = _cid1;
    if (capital > 0) {
      txContab.push({ id: _cidSeq++, fecha, tipo: 'pago_recibido', concepto: `Pago capital ${c.numero}`, monto: capital, cuentaDebe: '1101', cuentaHaber: ctaCartera, creditoId: credId, referencia: pago.referencia, createdAt: new Date().toISOString() });
    }
    // Asiento 2: Intereses — Banco (debe) → Ingresos Intereses (haber)
    if (interes > 0) {
      txContab.push({ id: _cidSeq++, fecha, tipo: tipoIngInt, concepto: `${esArrend ? 'Renta' : 'Intereses'} ${c.numero}`, monto: interes, cuentaDebe: '1101', cuentaHaber: esArrend ? '4103' : '4101', creditoId: credId, referencia: pago.referencia, createdAt: new Date().toISOString() });
    }
    // Asiento 3: Moratorio — Banco (debe) → Ingresos Moratorios (haber)
    if (moratorio > 0) {
      txContab.push({ id: _cidSeq++, fecha, tipo: 'ingreso_intereses', concepto: `Interés moratorio ${c.numero}`, monto: moratorio, cuentaDebe: '1101', cuentaHaber: '4101', creditoId: credId, referencia: pago.referencia, createdAt: new Date().toISOString() });
    }
    // Asiento 4: Comisión — Banco (debe) → Comisiones Cobradas (haber)
    if (comision > 0) {
      txContab.push({ id: _cidSeq++, fecha, tipo: 'comision', concepto: `Comisión ${c.numero}`, monto: comision, cuentaDebe: '1101', cuentaHaber: '4102', creditoId: credId, referencia: pago.referencia, createdAt: new Date().toISOString() });
    }
    // Asiento 5: IVA Trasladado — Banco (debe) → IVA por Pagar (haber)
    if (iva > 0) {
      txContab.push({ id: _cidSeq++, fecha, tipo: 'iva_trasladado', concepto: `IVA s/intereses ${c.numero}`, monto: iva, cuentaDebe: '1101', cuentaHaber: '2104', creditoId: credId, referencia: pago.referencia, createdAt: new Date().toISOString() });
    }
    setStore('contabilidad', txContab);
  });

  if (!txOk) return; // Transacción falló, datos ya restaurados por withTransaction

  addAudit('Registrar Pago', 'Pagos', `${c.numero}: ${fmt(monto)}`);
  _forceCloseModal('modalPago');
  toast('Pago registrado — Saldo actualizado', 'success');
  patchPagoCC(); // Actualizar disponible si es cuenta corriente
  renderPagosCredito();
  refreshNotifications();
}

// ============================================================
//  FIX #8: REVERSIÓN / CANCELACIÓN DE PAGOS
// ============================================================
// Crea un asiento de reversa (no elimina el pago original, crea uno compensatorio)
// Mantiene trazabilidad completa en auditoría
function revertirPago(pagoId) {
  if (!hasPermiso('pagos', 'eliminar')) return toast('Sin permiso para revertir pagos', 'error');

  var pagos = getStore('pagos');
  var pagoOriginal = pagos.find(function(p) { return p.id === pagoId; });
  if (!pagoOriginal) return toast('Pago no encontrado', 'error');
  if (pagoOriginal.reversado) return toast('Este pago ya fue reversado', 'error');
  if (pagoOriginal.tipo === 'reversa') return toast('No se puede reversar una reversa', 'error');

  var creditos = getStore('creditos');
  var cred = creditos.find(function(c) { return c.id === pagoOriginal.creditoId; });
  var numCred = cred ? cred.numero : '#' + pagoOriginal.creditoId;

  // Validar que solo se reversen pagos en orden cronológico inverso
  // (el pago a reversar debe ser el último no-reversado del crédito)
  var pagosCredito = pagos.filter(function(p) {
    return p.creditoId === pagoOriginal.creditoId && !p.reversado && p.tipo !== 'reversa';
  }).sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha) || b.id - a.id; });
  if (pagosCredito.length > 0 && pagosCredito[0].id !== pagoId) {
    return toast('Solo se puede reversar el último pago del crédito (' + fmtDate(pagosCredito[0].fecha) + ' por ' + fmt(pagosCredito[0].monto) + '). Reverse en orden cronológico inverso.', 'error');
  }

  showConfirm(
    'Reversar Pago',
    '¿Reversar el pago del ' + fmtDate(pagoOriginal.fecha) + ' por ' + fmt(pagoOriginal.monto) + ' del crédito ' + numCred + '?\n\nEsta acción restaurará el saldo anterior del crédito y creará un asiento contable de reversa.',
    'Sí, reversar pago'
  ).then(function(ok) {
    if (!ok) return;

    var razon = prompt('Motivo de la reversión:');
    if (!razon || !razon.trim()) return toast('Debe proporcionar un motivo', 'error');

    var txOk = withTransaction(function() {
      var txPagos = getStore('pagos');
      var txCreditos = getStore('creditos');
      var txContab = getStore('contabilidad');

      // Marcar pago original como reversado
      var txPagoOrig = txPagos.find(function(p) { return p.id === pagoId; });
      if (!txPagoOrig) throw new Error('Pago no encontrado');
      if (txPagoOrig.reversado) throw new Error('Ya reversado');
      txPagoOrig.reversado = true;
      txPagoOrig.fechaReversa = new Date().toISOString();
      txPagoOrig.motivoReversa = razon;

      // Crear pago de reversa (montos negativos)
      var reversaId = nextId('pagos');
      txPagos.push({
        id: reversaId,
        creditoId: pagoOriginal.creditoId,
        fecha: new Date().toISOString().split('T')[0],
        monto: -pagoOriginal.monto,
        capital: -(pagoOriginal.capital || 0),
        interes: -(pagoOriginal.interes || 0),
        moratorio: -(pagoOriginal.moratorio || 0),
        comision: -(pagoOriginal.comision || 0),
        iva: -(pagoOriginal.iva || 0),
        saldoAnterior: pagoOriginal.saldoNuevo,
        saldoNuevo: pagoOriginal.saldoAnterior,
        metodo: 'reversa',
        referencia: 'REV-' + pagoId,
        notas: 'Reversión de pago #' + pagoId + ': ' + razon,
        tipo: 'reversa',
        pagoOriginalId: pagoId,
        createdAt: new Date().toISOString()
      });
      setStore('pagos', txPagos);

      // Restaurar saldo del crédito y RECALCULAR amortización
      var txCred = txCreditos.find(function(c) { return c.id === pagoOriginal.creditoId; });
      if (txCred) {
        txCred.saldo = pagoOriginal.saldoAnterior;
        if (txCred.estado === 'liquidado' && pagoOriginal.saldoAnterior > 0.01) {
          txCred.estado = 'vigente';
        }
        // Desmarcar último pago en amortización
        var ultimoPagado = (txCred.amortizacion || []).filter(function(a) { return a.pagado; }).pop();
        if (ultimoPagado) ultimoPagado.pagado = false;

        // RECALCULAR tabla de amortización completa desde el saldo restaurado
        // Esto corrige el caso donde el pago original disparó un recálculo
        if (txCred.amortizacion && txCred.tipo !== 'cuenta_corriente') {
          var pagadosRev = txCred.amortizacion.filter(function(a) { return a.pagado; });
          var pendientesRev = txCred.amortizacion.filter(function(a) { return !a.pagado; });
          var periodosRestRev = pendientesRev.length;
          if (periodosRestRev > 0 && pagoOriginal.saldoAnterior > 0.01) {
            var tasaPerRev = getTasaPeriodica(txCred.tasa, txCred.periodicidad);
            var vrMontoRev = txCred.monto * ((txCred.valorResidual || 0) / 100);
            var saldoRev = pagoOriginal.saldoAnterior;
            var montoFinRev = saldoRev - vrMontoRev / Math.pow(1 + tasaPerRev, periodosRestRev);
            var nuevoPayRev;
            if (tasaPerRev === 0) nuevoPayRev = montoFinRev / periodosRestRev;
            else nuevoPayRev = montoFinRev * (tasaPerRev * Math.pow(1 + tasaPerRev, periodosRestRev)) / (Math.pow(1 + tasaPerRev, periodosRestRev) - 1);

            var fechaBaseRev = pagadosRev.length > 0 ? new Date(pagadosRev[pagadosRev.length - 1].fecha) : new Date(txCred.fechaInicio);
            var diaOrigRev = new Date(txCred.fechaInicio).getDate();
            var nuevaAmortRev = pagadosRev.slice();
            var saldoTempRev = saldoRev;
            for (var jr = 1; jr <= periodosRestRev; jr++) {
              fechaBaseRev = avanzarFechaPeriodo(fechaBaseRev, txCred.periodicidad, diaOrigRev);
              var intRev = +(saldoTempRev * tasaPerRev).toFixed(2);
              var capRev;
              if (jr === periodosRestRev) capRev = +(saldoTempRev - vrMontoRev).toFixed(2);
              else capRev = +(nuevoPayRev - intRev).toFixed(2);
              var ivaRev = +(Math.max(intRev, 0) * 0.16).toFixed(2);
              var sfRev = +(saldoTempRev - capRev).toFixed(2);
              nuevaAmortRev.push({
                numero: pagadosRev.length + jr,
                fecha: fechaBaseRev.toISOString().split('T')[0],
                saldoInicial: Math.max(+saldoTempRev.toFixed(2), 0),
                capital: Math.max(capRev, 0),
                interes: Math.max(intRev, 0),
                iva: ivaRev,
                pagoTotal: +(Math.max(capRev, 0) + Math.max(intRev, 0) + ivaRev).toFixed(2),
                saldoFinal: Math.max(sfRev, 0),
                pagado: false
              });
              saldoTempRev = sfRev;
            }
            txCred.amortizacion = nuevaAmortRev;
            txCred.pago = nuevoPayRev;
          }
        }
      }
      setStore('creditos', txCreditos);

      // Asientos contables de reversa — revertir cada componente del pago original
      var cid = nextId('contabilidad');
      var fechaRev = new Date().toISOString().split('T')[0];
      var refRev = 'REV-' + pagoId;
      var conceptoBase = 'REVERSA: Pago #' + pagoId + ' — ' + numCred + ' — ' + razon;
      var esArrendRev = cred && cred.tipo === 'arrendamiento';
      var ctaCarteraRev = esArrendRev ? '1204' : '1201';
      // Reversa capital: Cartera (debe) → Banco (haber)
      if ((pagoOriginal.capital || 0) > 0) {
        txContab.push({ id: cid++, fecha: fechaRev, tipo: 'reversa_pago', concepto: conceptoBase + ' (capital)',
          monto: -(pagoOriginal.capital || 0), cuentaDebe: ctaCarteraRev, cuentaHaber: '1101',
          creditoId: pagoOriginal.creditoId, referencia: refRev, createdAt: new Date().toISOString() });
      }
      // Reversa intereses: Ingresos Int (debe) → Banco (haber)
      if ((pagoOriginal.interes || 0) > 0) {
        var ctaIngRev = esArrendRev ? '4103' : '4101';
        txContab.push({ id: cid++, fecha: fechaRev, tipo: 'reversa_pago', concepto: conceptoBase + ' (intereses)',
          monto: -(pagoOriginal.interes || 0), cuentaDebe: ctaIngRev, cuentaHaber: '1101',
          creditoId: pagoOriginal.creditoId, referencia: refRev, createdAt: new Date().toISOString() });
      }
      // Reversa moratorio
      if ((pagoOriginal.moratorio || 0) > 0) {
        txContab.push({ id: cid++, fecha: fechaRev, tipo: 'reversa_pago', concepto: conceptoBase + ' (moratorio)',
          monto: -(pagoOriginal.moratorio || 0), cuentaDebe: '4101', cuentaHaber: '1101',
          creditoId: pagoOriginal.creditoId, referencia: refRev, createdAt: new Date().toISOString() });
      }
      // Reversa comisión
      if ((pagoOriginal.comision || 0) > 0) {
        txContab.push({ id: cid++, fecha: fechaRev, tipo: 'reversa_pago', concepto: conceptoBase + ' (comisión)',
          monto: -(pagoOriginal.comision || 0), cuentaDebe: '4102', cuentaHaber: '1101',
          creditoId: pagoOriginal.creditoId, referencia: refRev, createdAt: new Date().toISOString() });
      }
      // Reversa IVA
      if ((pagoOriginal.iva || 0) > 0) {
        txContab.push({ id: cid++, fecha: fechaRev, tipo: 'reversa_pago', concepto: conceptoBase + ' (IVA)',
          monto: -(pagoOriginal.iva || 0), cuentaDebe: '2104', cuentaHaber: '1101',
          creditoId: pagoOriginal.creditoId, referencia: refRev, createdAt: new Date().toISOString() });
      }
      setStore('contabilidad', txContab);
    });

    if (!txOk) return;
    addAudit('Reversar Pago', 'Pagos', numCred + ': Pago #' + pagoId + ' por ' + fmt(pagoOriginal.monto) + ' — ' + razon,
      { pago: pagoOriginal }, { estado: 'reversado' });
    toast('Pago reversado exitosamente. Saldo restaurado a ' + fmt(pagoOriginal.saldoAnterior), 'success');
    renderPagosCredito();
    refreshNotifications();
  });
}

// Fix #8: Confirmación adicional para operaciones de alto impacto
function confirmarOperacionRiesgosa(titulo, mensaje, callback) {
  showConfirm(titulo, mensaje, 'Sí, confirmar').then(function(ok) {
    if (ok) callback();
  });
}

// ============================================================
