//  SPRINT M: FLUJOS DE APROBACIÓN
// ============================================================
var APROB_UMBRAL_CREDITO = 500000;  // Créditos >= $500k requieren aprobación
var APROB_UMBRAL_PAGO = 100000;     // Pagos >= $100k requieren autorización
var currentRechazoId = null;

function crearSolicitudAprobacion(tipo, datos, monto, descripcion) {
  var aprobaciones = getStore('aprobaciones');
  var id = nextId('aprobaciones');
  var solicitud = {
    id: id,
    tipo: tipo,
    estado: 'pendiente',
    monto: monto,
    descripcion: descripcion,
    datos: datos,
    solicitante: currentUser ? currentUser.nombre : 'Sistema',
    solicitanteId: currentUser ? currentUser.id : 0,
    fechaSolicitud: new Date().toISOString(),
    aprobador: null,
    aprobadorId: null,
    fechaResolucion: null,
    motivoRechazo: null
  };
  aprobaciones.push(solicitud);
  setStore('aprobaciones', aprobaciones);
  addAudit('Crear', 'Aprobaciones', 'Solicitud #' + id + ' — ' + tipo + ' por ' + fmt(monto));
  updateApprovalsBadge();
  return solicitud;
}

function aprobarSolicitud(id) {
  if (!hasPermiso('aprobaciones', 'aprobar')) return toast('Sin permiso para aprobar solicitudes', 'error');
  var aprobaciones = getStore('aprobaciones');
  var sol = aprobaciones.find(function(a) { return a.id === id; });
  if (!sol) return toast('Solicitud no encontrada', 'error');
  if (sol.estado !== 'pendiente') return toast('Esta solicitud ya fue resuelta', 'error');

  // No puede aprobar su propia solicitud
  if (currentUser && sol.solicitanteId === currentUser.id) {
    return toast('No puede aprobar su propia solicitud', 'error');
  }

  sol.estado = 'aprobado';
  sol.aprobador = currentUser ? currentUser.nombre : 'Admin';
  sol.aprobadorId = currentUser ? currentUser.id : 0;
  sol.fechaResolucion = new Date().toISOString();
  setStore('aprobaciones', aprobaciones);

  // Ejecutar la acción aprobada
  if (sol.tipo === 'credito_nuevo') {
    ejecutarCreditoAprobado(sol);
  } else if (sol.tipo === 'pago_grande') {
    ejecutarPagoAprobado(sol);
  } else if (sol.tipo === 'reestructura_quita') {
    ejecutarReestructuraAprobada(sol);
  }

  addAudit('Aprobar', 'Aprobaciones', 'Solicitud #' + id + ' aprobada');
  toast('Solicitud #' + id + ' aprobada exitosamente', 'success');
  updateApprovalsBadge();
  renderAprobaciones();
  refreshNotifications();
}

function iniciarRechazo(id) {
  if (!hasPermiso('aprobaciones', 'rechazar')) return toast('Sin permiso para rechazar solicitudes', 'error');
  currentRechazoId = id;
  document.getElementById('rechazoMotivo').value = '';
  openModal('modalRechazo');
}

function confirmarRechazo() {
  var motivo = document.getElementById('rechazoMotivo').value.trim();
  if (!motivo) return toast('Debe indicar un motivo de rechazo', 'error');

  var aprobaciones = getStore('aprobaciones');
  var sol = aprobaciones.find(function(a) { return a.id === currentRechazoId; });
  if (!sol) return toast('Solicitud no encontrada', 'error');
  if (sol.estado !== 'pendiente') return toast('Esta solicitud ya fue resuelta', 'error');

  sol.estado = 'rechazado';
  sol.aprobador = currentUser ? currentUser.nombre : 'Admin';
  sol.aprobadorId = currentUser ? currentUser.id : 0;
  sol.fechaResolucion = new Date().toISOString();
  sol.motivoRechazo = motivo;
  setStore('aprobaciones', aprobaciones);

  addAudit('Rechazar', 'Aprobaciones', 'Solicitud #' + currentRechazoId + ' — ' + motivo);
  closeModal('modalRechazo');
  toast('Solicitud #' + currentRechazoId + ' rechazada', 'info');
  currentRechazoId = null;
  updateApprovalsBadge();
  renderAprobaciones();
  refreshNotifications();
}

function ejecutarCreditoAprobado(sol) {
  var d = sol.datos;
  var cred = d.credito;
  var creditos = getStore('creditos');
  creditos.push(cred);
  setStore('creditos', creditos);

  // Calcular y almacenar CAT
  if (cred.amortizacion && cred.amortizacion.length > 0) {
    var comisionCred = cred.comision || 0;
    var catOpts = { ivaComision: +(comisionCred * 0.16).toFixed(2), ivaIntereses: false };
    cred.cat = calcularCAT(cred.monto, cred.amortizacion, cred.fechaInicio, comisionCred, catOpts);
    cred.catPct = +((cred.cat || 0) * 100).toFixed(1);
    var credUpd = getStore('creditos');
    credUpd = credUpd.map(function(cr) { return cr.id === cred.id ? cred : cr; });
    setStore('creditos', credUpd);
  }

  if (cred.tipo !== 'cuenta_corriente') {
    var contab = getStore('contabilidad');
    var cidAp = nextId('contabilidad');
    // Colocación
    contab.push({
      id: cidAp++,
      fecha: cred.fechaInicio,
      tipo: 'colocacion',
      concepto: 'Colocación ' + esc(cred.numero) + ' (Aprobación #' + sol.id + ')',
      monto: cred.monto,
      cuentaDebe: '1201', cuentaHaber: '1101',
      creditoId: cred.id,
      referencia: cred.numero,
      createdAt: new Date().toISOString()
    });
    // Comisión de apertura
    var comAp = cred.comision || 0;
    if (comAp > 0) {
      contab.push({
        id: cidAp++, fecha: cred.fechaInicio, tipo: 'comision',
        concepto: 'Comisión apertura ' + esc(cred.numero) + ' (Aprob #' + sol.id + ')',
        monto: comAp, cuentaDebe: '1101', cuentaHaber: '4102',
        creditoId: cred.id, referencia: cred.numero, createdAt: new Date().toISOString()
      });
      // IVA sobre comisión
      var ivaComAp = +(comAp * 0.16).toFixed(2);
      if (ivaComAp > 0) {
        contab.push({
          id: cidAp++, fecha: cred.fechaInicio, tipo: 'iva_trasladado',
          concepto: 'IVA s/comisión apertura ' + esc(cred.numero) + ' (Aprob #' + sol.id + ')',
          monto: ivaComAp, cuentaDebe: '1101', cuentaHaber: '2104',
          creditoId: cred.id, referencia: cred.numero, createdAt: new Date().toISOString()
        });
      }
    }
    setStore('contabilidad', contab);
  }
  addAudit('Crear', 'Créditos', cred.numero + ' (post-aprobación)');
}

function ejecutarPagoAprobado(sol) {
  var d = sol.datos;
  var pago = d.pago;
  var capital = pago.capital || 0;
  var interes = pago.interes || 0;
  var moratorio = pago.moratorio || 0;
  var comision = pago.comision || 0;
  var saldoNuevoAp = pago.saldoNuevo;

  // IVA = 16% sobre (intereses + moratorio)
  var ivaAp = +((interes + moratorio) * 0.16).toFixed(2);

  // 1. Insertar pago
  var pagos = getStore('pagos');
  pagos.push(pago);
  setStore('pagos', pagos);

  // 2. Actualizar crédito con lógica completa (marca cuota + recálculo)
  var creditos = getStore('creditos');
  creditos = creditos.map(function(cr) {
    if (cr.id !== pago.creditoId) return cr;
    cr.saldo = saldoNuevoAp;
    if (saldoNuevoAp <= 0.01) {
      cr.estado = 'liquidado';
      var nextU = (cr.amortizacion || []).find(function(a) { return !a.pagado; });
      if (nextU) nextU.pagado = true;
      return cr;
    }

    var esSoloInteresesAp = capital < 0.01 && interes > 0;
    var nextUnpaidAp = (cr.amortizacion || []).find(function(a) { return !a.pagado; });
    var pendientesAp = (cr.amortizacion || []).filter(function(a) { return !a.pagado; });
    var periodosRestAp = pendientesAp.length;

    if (periodosRestAp > 0 && cr.amortizacion && cr.tipo !== 'cuenta_corriente') {
      var tasaPerAp = getTasaPeriodica(cr.tasa, cr.periodicidad);
      var vrMontoAp = cr.monto * ((cr.valorResidual || 0) / 100);
      var pagoEsperadoAp = nextUnpaidAp ? (nextUnpaidAp.capital + nextUnpaidAp.interes) : 0;
      var diffPagoAp = Math.abs(capital + interes - pagoEsperadoAp);
      var esExactoAp = diffPagoAp < 1;
      var esAnticipadoAp = capital > (nextUnpaidAp ? nextUnpaidAp.capital : 0) + 0.01;

      if (esExactoAp) {
        if (nextUnpaidAp) nextUnpaidAp.pagado = true;
      } else if (esSoloInteresesAp) {
        // NO marcar cuota
      } else {
        if (nextUnpaidAp) nextUnpaidAp.pagado = true;
        var pagadosArrAp = cr.amortizacion.filter(function(a) { return a.pagado; });
        var pagadosCountAp = pagadosArrAp.length;
        var pendientesPostAp = cr.amortizacion.filter(function(a) { return !a.pagado; });
        var nuevoPeriodosAp = pendientesPostAp.length;
        var nuevoPagoAp;
        var esArrendRecalcAp = cr.tipo === 'arrendamiento';

        if (!esArrendRecalcAp && esAnticipadoAp && cr.pagoAnticipadoReducePlazo !== false) {
          if (tasaPerAp > 0) {
            var pagoActAp = cr.pago || pagoEsperadoAp;
            if (pagoActAp > 0) {
              var ratioAp = saldoNuevoAp * tasaPerAp / pagoActAp;
              if (ratioAp < 1) {
                nuevoPeriodosAp = Math.ceil(-Math.log(1 - ratioAp) / Math.log(1 + tasaPerAp));
                nuevoPeriodosAp = Math.max(1, Math.min(nuevoPeriodosAp, pendientesPostAp.length));
              }
            }
          }
        }

        if (esArrendRecalcAp) {
          var capFijoArrAp = +((saldoNuevoAp - vrMontoAp) / nuevoPeriodosAp).toFixed(2);
          var intFlatArrAp = +(saldoNuevoAp * tasaPerAp).toFixed(2);
          nuevoPagoAp = capFijoArrAp + intFlatArrAp;
        } else {
          var montoFinAp = saldoNuevoAp - vrMontoAp / Math.pow(1 + tasaPerAp, nuevoPeriodosAp);
          if (tasaPerAp === 0) nuevoPagoAp = montoFinAp / nuevoPeriodosAp;
          else nuevoPagoAp = montoFinAp * (tasaPerAp * Math.pow(1 + tasaPerAp, nuevoPeriodosAp)) / (Math.pow(1 + tasaPerAp, nuevoPeriodosAp) - 1);
        }

        var saldoTempAp = saldoNuevoAp;
        var ultimaPagadaAp = pagadosArrAp.length > 0 ? pagadosArrAp[pagadosArrAp.length - 1] : null;
        var fechaBaseAp = ultimaPagadaAp ? new Date(ultimaPagadaAp.fecha) : new Date(cr.fechaInicio);
        var diaOrigAp = new Date(cr.fechaInicio).getDate();

        var nuevaAmortAp = pagadosArrAp.slice();
        for (var jAp = 1; jAp <= nuevoPeriodosAp; jAp++) {
          fechaBaseAp = avanzarFechaPeriodo(fechaBaseAp, cr.periodicidad, diaOrigAp);
          var intAp2, capAp2;
          if (esArrendRecalcAp) {
            intAp2 = intFlatArrAp;
            capAp2 = (jAp === nuevoPeriodosAp) ? +(saldoTempAp - vrMontoAp).toFixed(2) : capFijoArrAp;
          } else {
            intAp2 = +(saldoTempAp * tasaPerAp).toFixed(2);
            capAp2 = (jAp === nuevoPeriodosAp) ? +(saldoTempAp - vrMontoAp).toFixed(2) : +(nuevoPagoAp - intAp2).toFixed(2);
          }
          var sfAp = +(saldoTempAp - capAp2).toFixed(2);
          var ivaRecAp = +(Math.max(intAp2, 0) * 0.16).toFixed(2);
          nuevaAmortAp.push({
            numero: pagadosCountAp + jAp,
            fecha: fechaBaseAp.toISOString().split('T')[0],
            saldoInicial: Math.max(+saldoTempAp.toFixed(2), 0),
            capital: Math.max(capAp2, 0),
            interes: Math.max(intAp2, 0),
            iva: ivaRecAp,
            pagoTotal: +(capAp2 + intAp2 + ivaRecAp).toFixed(2),
            saldoFinal: Math.max(sfAp, 0),
            pagado: false
          });
          saldoTempAp = sfAp;
        }
        cr.amortizacion = nuevaAmortAp;
        cr.pago = nuevoPagoAp;
        cr.periodosReducidos = (pendientesPostAp.length) - nuevoPeriodosAp;
      }
    } else {
      if (cr.amortizacion) {
        var nxAp = (cr.amortizacion).find(function(a) { return !a.pagado; });
        if (nxAp) nxAp.pagado = true;
      }
    }
    return cr;
  });
  setStore('creditos', creditos);

  // 3. Registro contable completo (con IVA)
  var contab = getStore('contabilidad');
  var _cidApprob = nextId('contabilidad');
  var credApprob = getStore('creditos').find(function(cr) { return cr.id === pago.creditoId; });
  var esArrendApprob = credApprob && credApprob.tipo === 'arrendamiento';
  var ctaCartApprob = esArrendApprob ? '1204' : '1201';
  if (capital > 0) {
    contab.push({ id: _cidApprob++, fecha: pago.fecha, tipo: 'pago_recibido', concepto: 'Pago capital autorizado (Aprob #' + sol.id + ')', monto: capital, cuentaDebe: '1101', cuentaHaber: ctaCartApprob, creditoId: pago.creditoId, referencia: pago.referencia || '', createdAt: new Date().toISOString() });
  }
  if (interes > 0) {
    contab.push({ id: _cidApprob++, fecha: pago.fecha, tipo: esArrendApprob ? 'ingreso_arrendamiento' : 'ingreso_intereses', concepto: 'Intereses autorizados (Aprob #' + sol.id + ')', monto: interes, cuentaDebe: '1101', cuentaHaber: esArrendApprob ? '4103' : '4101', creditoId: pago.creditoId, referencia: pago.referencia || '', createdAt: new Date().toISOString() });
  }
  if (moratorio > 0) {
    contab.push({ id: _cidApprob++, fecha: pago.fecha, tipo: 'ingreso_intereses', concepto: 'Moratorio autorizado (Aprob #' + sol.id + ')', monto: moratorio, cuentaDebe: '1101', cuentaHaber: '4101', creditoId: pago.creditoId, referencia: pago.referencia || '', createdAt: new Date().toISOString() });
  }
  if (comision > 0) {
    contab.push({ id: _cidApprob++, fecha: pago.fecha, tipo: 'comision', concepto: 'Comisión autorizada (Aprob #' + sol.id + ')', monto: comision, cuentaDebe: '1101', cuentaHaber: '4102', creditoId: pago.creditoId, referencia: pago.referencia || '', createdAt: new Date().toISOString() });
  }
  // IVA trasladado — 16% sobre (intereses + moratorio)
  if (ivaAp > 0) {
    contab.push({ id: _cidApprob++, fecha: pago.fecha, tipo: 'iva_trasladado', concepto: 'IVA s/intereses autorizado (Aprob #' + sol.id + ')', monto: ivaAp, cuentaDebe: '1101', cuentaHaber: '2104', creditoId: pago.creditoId, referencia: pago.referencia || '', createdAt: new Date().toISOString() });
  }
  setStore('contabilidad', contab);
  addAudit('Crear', 'Pagos', 'Pago autorizado #' + pago.id + ' (post-aprobación)');
}

// Ejecuta reestructura aprobada (PLD o quita significativa)
function ejecutarReestructuraAprobada(sol) {
  var d = sol.datos;
  var creditoId = d.creditoId;
  var nuevoSaldo = d.nuevoSaldo;
  var quita = d.quita || 0;
  var nuevaTasa = d.nuevaTasa;
  var nuevoPlazo = d.nuevoPlazo;
  var periodicidad = d.periodicidad;
  var fechaInicio = d.fechaInicio;
  var motivo = d.motivo || 'Reestructura aprobada #' + sol.id;

  var creditos = getStore('creditos');
  creditos = creditos.map(function(c) {
    if (c.id !== creditoId) return c;
    var snapshot = {
      fecha: new Date().toISOString(),
      saldoAnterior: c.saldoActual || c.saldo || c.monto,
      tasaAnterior: c.tasa, plazoAnterior: c.plazo,
      estadoAnterior: c.estado, diasMoraAnterior: c.diasMora || 0,
      nuevoSaldo: nuevoSaldo, quita: quita, nuevaTasa: nuevaTasa, nuevoPlazo: nuevoPlazo,
      periodicidad: periodicidad, motivo: motivo + ' (Aprob #' + sol.id + ')',
      usuario: sol.aprobador || 'Sistema'
    };
    if (!c.reestructuras) c.reestructuras = [];
    c.reestructuras.push(snapshot);

    c.saldo = nuevoSaldo; c.saldoActual = nuevoSaldo;
    c.tasa = nuevaTasa / 100; c.plazo = nuevoPlazo;
    c.periodicidad = periodicidad; c.estado = 'vigente';
    c.diasMora = 0; c.reestructurado = true;
    c.numReestructuras = (c.numReestructuras || 0) + 1;

    var nuevaAmort = generarAmortizacion(nuevoSaldo, nuevaTasa / 100, nuevoPlazo, periodicidad, fechaInicio, c.valorResidual || 0, 16, c.tipo);
    c.amortizacion = nuevaAmort;
    c.pago = +calcPago(nuevoSaldo, nuevaTasa / 100, nuevoPlazo, periodicidad, c.valorResidual || 0, c.tipo).toFixed(2);
    c.fechaVencimiento = nuevaAmort[nuevaAmort.length - 1].fecha;
    return c;
  });
  setStore('creditos', creditos);

  if (quita > 0) {
    var contab = getStore('contabilidad');
    var polQuita = POLIZA_MAP['quita_reestructura'];
    contab.push({
      id: nextId('contabilidad'), fecha: fechaInicio, tipo: 'quita_reestructura',
      concepto: 'Quita por reestructura aprobada (Aprob #' + sol.id + ') — Crédito #' + creditoId,
      monto: -quita, cuentaDebe: polQuita.debe, cuentaHaber: polQuita.haber,
      creditoId: creditoId, referencia: 'REST-APR-' + creditoId, createdAt: new Date().toISOString()
    });
    setStore('contabilidad', contab);
  }

  var bitacora = getStore('bitacora');
  bitacora.push({
    id: nextId('bitacora'), creditoId: creditoId, categoria: 'reestructura', prioridad: 'alta',
    comentario: 'Reestructura aprobada (Aprob #' + sol.id + '): Saldo ' + fmt(nuevoSaldo) + (quita > 0 ? ', Quita ' + fmt(quita) : '') + ', Tasa ' + nuevaTasa + '%, Plazo ' + nuevoPlazo + 'm. Motivo: ' + motivo,
    fechaSeguimiento: null, usuario: sol.aprobador || 'Sistema', createdAt: new Date().toISOString()
  });
  setStore('bitacora', bitacora);

  addAudit('Reestructurar', 'Créditos', 'Reestructura aprobada #' + sol.id + ' — Crédito #' + creditoId);
}

function updateApprovalsBadge() {
  var aprobaciones = getStore('aprobaciones');
  var pendientes = aprobaciones.filter(function(a) { return a.estado === 'pendiente'; }).length;
  var badge = document.getElementById('approvalsBadge');
  if (badge) {
    badge.textContent = pendientes;
    badge.style.display = pendientes > 0 ? 'inline-block' : 'none';
  }
}

var currentAprobTab = 'pendientes';
function setAprobTab(tab) {
  currentAprobTab = tab;
  var tabs = ['pendientes', 'aprobadas', 'rechazadas', 'todas'];
  tabs.forEach(function(t) {
    var el = document.getElementById('aprob' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = (t === tab) ? 'block' : 'none';
  });
  // Actualizar tab activa
  var tabEls = document.querySelectorAll('#page-aprobaciones .tab');
  tabEls.forEach(function(te, i) { te.classList.toggle('active', tabs[i] === tab); });
  renderAprobaciones();
}

function renderAprobaciones() {
  var aprobaciones = getStore('aprobaciones');
  var clientes = getStore('clientes');

  function renderTabla(lista, containerId, mostrarAcciones) {
    if (lista.length === 0) {
      document.getElementById(containerId).innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--gray)">No hay solicitudes en esta categoría</div>';
      return;
    }
    var html = '<div class="card"><div class="table-wrapper"><table class="table"><thead><tr>' +
      '<th>#</th><th>Tipo</th><th>Descripción</th><th>Monto</th><th>Solicitante</th><th>Fecha</th><th>Estado</th>' +
      (mostrarAcciones ? '<th>Acciones</th>' : '<th>Resuelto por</th>') +
      '</tr></thead><tbody>';

    lista.forEach(function(a) {
      var estadoClass = a.estado === 'aprobado' ? 'green' : a.estado === 'rechazado' ? 'red' : 'yellow';
      var estadoLabel = a.estado === 'aprobado' ? 'Aprobado' : a.estado === 'rechazado' ? 'Rechazado' : 'Pendiente';
      html += '<tr>' +
        '<td>' + a.id + '</td>' +
        '<td><span class="badge badge-' + (a.tipo === 'credito_nuevo' ? 'blue' : 'orange') + '">' +
          esc(a.tipo === 'credito_nuevo' ? 'Crédito' : 'Pago') + '</span></td>' +
        '<td>' + esc(a.descripcion) + '</td>' +
        '<td><strong>' + fmt(a.monto) + '</strong></td>' +
        '<td>' + esc(a.solicitante) + '</td>' +
        '<td>' + fmtDate(a.fechaSolicitud) + '</td>' +
        '<td><span class="badge badge-' + estadoClass + '">' + estadoLabel + '</span></td>';

      if (mostrarAcciones) {
        html += '<td>' +
          '<button class="btn btn-success btn-sm" onclick="aprobarSolicitud(' + a.id + ')" title="Aprobar">✓ Aprobar</button> ' +
          '<button class="btn btn-danger btn-sm" onclick="iniciarRechazo(' + a.id + ')" title="Rechazar">✗ Rechazar</button>' +
          '</td>';
      } else {
        html += '<td>' + esc(a.aprobador || '—') +
          (a.fechaResolucion ? '<br><small>' + fmtDate(a.fechaResolucion) + '</small>' : '') +
          (a.motivoRechazo ? '<br><small style="color:var(--red)">Motivo: ' + esc(a.motivoRechazo) + '</small>' : '') +
          '</td>';
      }
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    document.getElementById(containerId).innerHTML = html;
  }

  var pendientes = aprobaciones.filter(function(a) { return a.estado === 'pendiente'; });
  var aprobadas = aprobaciones.filter(function(a) { return a.estado === 'aprobado'; });
  var rechazadas = aprobaciones.filter(function(a) { return a.estado === 'rechazado'; });

  // Ordenar por fecha más reciente
  var sortFn = function(a, b) { return new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud); };
  pendientes.sort(sortFn);
  aprobadas.sort(sortFn);
  rechazadas.sort(sortFn);

  renderTabla(pendientes, 'aprobPendientes', true);
  renderTabla(aprobadas, 'aprobAprobadas', false);
  renderTabla(rechazadas, 'aprobRechazadas', false);
  renderTabla(aprobaciones.sort(sortFn), 'aprobTodas', false);

  updateApprovalsBadge();
}
