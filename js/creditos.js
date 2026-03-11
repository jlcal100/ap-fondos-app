//  CRÉDITOS
// ============================================================
function renderCreditos() {
  actualizarDiasMora();
  const search = (document.getElementById('searchCreditos').value || '').toLowerCase();
  const filterTipo = document.getElementById('filterTipoCredito').value;
  const filterEstado = document.getElementById('filterEstadoCredito').value;
  if (search !== '' || filterTipo || filterEstado) pageState.creditos = 1;
  const allCreditos = getStore('creditos').filter(c => {
    if (filterTipo && c.tipo !== filterTipo) return false;
    if (filterEstado && c.estado !== filterEstado) return false;
    const cli = getStore('clientes').find(cl => cl.id === c.clienteId);
    const cliNombre = cli ? cli.nombre.toLowerCase() : '';
    return c.numero.toLowerCase().includes(search) || cliNombre.includes(search);
  });
  const pg = paginate(allCreditos, 'creditos');
  document.getElementById('tbCreditos').innerHTML = pg.items.map(c => {
    const cli = getStore('clientes').find(cl => cl.id === c.clienteId);
    const esCC = c.esRevolvente || c.tipo === 'cuenta_corriente';
    return `<tr>
      <td><strong>${esc(c.numero)}</strong></td><td>${cli ? esc(cli.nombre) : '-'}</td>
      <td><span class="badge badge-blue">${tipoLabel[c.tipo]}</span></td>
      <td>${esCC ? fmt(c.limite || c.monto) + ' <small style="color:var(--gray-400)">(límite)</small>' : fmt(c.monto)}${c.moneda && c.moneda !== 'MXN' ? '<br><small style="color:#8B5CF6;font-weight:600">'+c.moneda+' ≈'+fmt(toMXN(c.monto,c.moneda))+'</small>' : ''}</td><td>${(c.tasa * 100).toFixed(2)}%</td><td>${c.plazo}m</td>
      <td>${esCC ? fmt(c.saldo) + ' <small style="color:var(--green)">/ ' + fmt(c.disponible || 0) + ' disp.</small>' : fmt(c.saldo)}</td>
      <td><span class="badge ${estadoBadge[c.estado]}">${c.estado}</span>${c.reestructurado?'<br><small style="color:#8B5CF6;font-weight:600">🔄 REST×'+(c.numReestructuras||1)+'</small>':''}${(function(){var gc=getCoberturaGarantias(c.id);return gc.count>0?'<br><small style="color:'+(gc.cobertura>=100?'var(--green)':gc.cobertura>=50?'var(--orange)':'var(--red)')+'">🛡 '+gc.cobertura.toFixed(0)+'%</small>':'';})()}${(function(){var rc=calcularRiesgoCredito(c.id);return '<br><small style="color:'+RIESGO_COLORS[rc.calificacion]+'">⬤ '+rc.calificacion+'</small>';})()}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="verCredito(${c.id})">📊 Detalle</button>
        ${esCC ? '<button class="btn btn-outline btn-sm" onclick="openDisposicion(' + c.id + ')">📤 Disponer</button>' : ''}
        <button class="btn btn-outline btn-sm" onclick="irAPagar(${c.id})">💰 Pagar</button>
      </td>
    </tr>`;
  }).join('');
  renderPagination('creditos', pg.total, pg.page, pg.count);
}

function openModalCredito() {
  // Bug #21: Limpiar campos al abrir modal para nuevo crédito
  V.clearErrors('modalCredito');
  clearForm(['credMonto','credTasa','credTasaMora','credPlazo','credVR','credValorEquipo','credComision','credNotas']);
  document.getElementById('credMoneda').value = 'MXN';
  document.getElementById('credTipo').selectedIndex = 0;
  document.getElementById('credPeriodicidad').selectedIndex = 0;
  toggleCreditoFields();
  const clientes = getStore('clientes');
  document.getElementById('credCliente').innerHTML = clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  const fondeos = getStore('fondeos').filter(f => f.estado === 'vigente');
  document.getElementById('credFondeo').innerHTML = '<option value="">Ninguno</option>' + fondeos.map(f => `<option value="${f.id}">${esc(f.numero)} - ${esc(f.fondeador)}</option>`).join('');
  document.getElementById('credFechaInicio').value = new Date().toISOString().split('T')[0];
  openModal('modalCredito');
}

function toggleCreditoFields() {
  const isArrend = document.getElementById('credTipo').value === 'arrendamiento';
  document.getElementById('credArrendFields').style.display = isArrend ? 'grid' : 'none';
}

function guardarCredito() {
  if (!guardSave('credito')) return;
  if (!hasPermiso('creditos', 'crear')) return toast('Sin permiso para crear créditos', 'error');
  V.clearErrors('modalCredito');
  const clienteId = parseInt(document.getElementById('credCliente').value);
  const tipo = document.getElementById('credTipo').value;
  const montoVal = String(parseMiles('credMonto'));
  const tasaVal = document.getElementById('credTasa').value;
  const tasaMoraVal = document.getElementById('credTasaMora').value;
  const plazoVal = document.getElementById('credPlazo').value;
  const periodicidad = document.getElementById('credPeriodicidad').value;
  const fechaInicio = document.getElementById('credFechaInicio').value;
  const vrPctVal = tipo === 'arrendamiento' ? document.getElementById('credVR').value : '0';
  const valorEquipoVal = tipo === 'arrendamiento' ? String(parseMiles('credValorEquipo')) : '0';
  const comisionVal = String(parseMiles('credComision'));

  // Validaciones
  var ok = true;
  ok = V.check('credCliente', clienteId > 0, 'Seleccione un cliente') && ok;
  ok = V.check('credMonto', V.positiveNum(montoVal), 'Monto debe ser mayor a 0') && ok;
  ok = V.check('credTasa', V.positiveNum(tasaVal) && parseFloat(tasaVal) <= 100, 'Tasa debe estar entre 0.01% y 100%') && ok;
  ok = V.check('credPlazo', V.positiveNum(plazoVal) && parseInt(plazoVal) >= 1 && parseInt(plazoVal) <= 360, 'Plazo debe ser entre 1 y 360 periodos') && ok;
  ok = V.check('credFechaInicio', !!fechaInicio, 'Fecha de inicio es obligatoria') && ok;
  // Bug #19: Validar rango razonable de fechas
  if (fechaInicio) {
    const fi = new Date(fechaInicio);
    const hoy = new Date();
    const hace1Anio = new Date(); hace1Anio.setFullYear(hace1Anio.getFullYear() - 1);
    const en30Dias = new Date(); en30Dias.setDate(en30Dias.getDate() + 30);
    ok = V.check('credFechaInicio', fi >= hace1Anio, 'La fecha no puede ser mayor a 1 año en el pasado') && ok;
    ok = V.check('credFechaInicio', fi <= en30Dias, 'La fecha no puede ser mayor a 30 días en el futuro') && ok;
  }
  if (tipo === 'arrendamiento') {
    ok = V.check('credValorEquipo', V.positiveNum(valorEquipoVal), 'Valor del equipo obligatorio para arrendamiento') && ok;
  }
  ok = V.check('credComision', V.nonNegNum(comisionVal || '0'), 'Comisión no puede ser negativa') && ok;

  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  // Mejora 7: Validación de duplicados
  const monto = parseFloat(montoVal);
  var existentes = getStore('creditos');
  var posibleDup = existentes.find(function(cr) {
    return cr.clienteId === clienteId && cr.tipo === tipo && Math.abs(cr.monto - monto) < 0.01 && cr.fechaInicio === fechaInicio && cr.estado !== 'liquidado';
  });
  if (posibleDup) {
    if (!confirm('⚠️ Ya existe un crédito similar:\n\n• ' + posibleDup.numero + ' — ' + fmt(posibleDup.monto) + ' — ' + posibleDup.estado + '\n\nMismo cliente, tipo, monto y fecha de inicio.\n¿Seguro que deseas crear otro?')) return;
  }

  const tasa = parseFloat(tasaVal) / 100;
  const tasaMora = parseFloat(tasaMoraVal) / 100 || 0;
  const plazo = parseInt(plazoVal);
  const vrPct = parseFloat(vrPctVal) || 0;
  const valorEquipo = parseFloat(valorEquipoVal) || 0;
  const comision = parseFloat(comisionVal) || 0;

  const id = nextId('creditos');
  const prefixMap = { credito_simple: 'CS', arrendamiento: 'AR', nomina: 'NM', cuenta_corriente: 'CC' };
  const prefix = prefixMap[tipo] || 'XX';
  const numero = `${prefix}-${String(id).padStart(3, '0')}`;

  var credito;
  if (tipo === 'cuenta_corriente') {
    // Cuenta corriente: línea revolvente sin amortización
    credito = {
      id, numero, clienteId, tipo, monto, tasa, tasaMora, plazo, periodicidad: 'diario',
      fechaInicio, estado: 'vigente', saldo: 0, limite: monto,
      disponible: monto, disposiciones: [], comision,
      fechaVencimiento: addMonths(new Date(fechaInicio), plazo),
      esRevolvente: true
    };
  } else {
    credito = crearCreditoObj(id, numero, clienteId, tipo, monto, tasa, tasaMora, plazo, periodicidad, fechaInicio, vrPct, valorEquipo, comision);
  }
  const fondeoId = document.getElementById('credFondeo').value;
  if (fondeoId) credito.fondeoId = parseInt(fondeoId);
  credito.notas = document.getElementById('credNotas').value;
  // Sprint Z: Moneda
  credito.moneda = document.getElementById('credMoneda').value || 'MXN';

  // PLD: Verificar si el cliente tiene alertas pendientes de revisión
  var pldStore = getStore('pld') || [];
  var alertasPendientes = pldStore.filter(function(a) {
    return a.clienteId === clienteId && a.estado !== 'revisado' && a.estado !== 'descartado';
  });
  if (alertasPendientes.length > 0) {
    if (!confirm('⚠️ ALERTA PLD/AML\n\nEl cliente tiene ' + alertasPendientes.length + ' alerta(s) PLD pendientes de revisión.\n\nCategoria: ' + alertasPendientes.map(function(a) { return a.categoria || 'N/A'; }).join(', ') + '\n\n¿Desea continuar con la creación del crédito?\n\nNOTA: Este crédito será enviado a aprobación obligatoria por alerta PLD.')) return;
    // Forzar aprobación para créditos con alerta PLD
    var cliNombrePLD = getStore('clientes').find(function(c) { return c.id === clienteId; });
    var descPLD = numero + ' — ' + (cliNombrePLD ? cliNombrePLD.nombre : 'Cliente #' + clienteId) + ' — ' + fmt(monto) + ' [ALERTA PLD]';
    crearSolicitudAprobacion('credito_nuevo', { credito: credito, alertaPLD: true }, monto, descPLD);
    _forceCloseModal('modalCredito');
    toast('Crédito enviado a aprobación obligatoria por alerta PLD del cliente', 'warning');
    addAudit('Crédito bloqueado por PLD', 'PLD', numero + ': ' + alertasPendientes.length + ' alertas pendientes');
    refreshNotifications();
    return;
  }

  // Sprint M: Verificar si requiere aprobación por monto
  if (monto >= APROB_UMBRAL_CREDITO) {
    var cliNombre = getStore('clientes').find(function(c) { return c.id === clienteId; });
    var desc = numero + ' — ' + (cliNombre ? cliNombre.nombre : 'Cliente #' + clienteId) + ' — ' + fmt(monto);
    crearSolicitudAprobacion('credito_nuevo', { credito: credito }, monto, desc);
    _forceCloseModal('modalCredito');
    toast('Crédito por ' + fmt(monto) + ' enviado a aprobación (requiere autorización para montos >= ' + fmt(APROB_UMBRAL_CREDITO) + ')', 'info');
    refreshNotifications();
    return;
  }

  const creditos = getStore('creditos');
  creditos.push(credito);
  setStore('creditos', creditos);

  // Calcular y almacenar CAT en el crédito
  if (credito.amortizacion && credito.amortizacion.length > 0) {
    var catOpts = { ivaComision: +(comision * 0.16).toFixed(2), ivaIntereses: false }; // tabla ya tiene IVA
    credito.cat = calcularCAT(monto, credito.amortizacion, fechaInicio, comision, catOpts);
    credito.catPct = +((credito.cat || 0) * 100).toFixed(1);
    // Actualizar en store
    var credsUpd = getStore('creditos');
    var cUpd = credsUpd.find(function(cr) { return cr.id === id; });
    if (cUpd) { cUpd.cat = credito.cat; cUpd.catPct = credito.catPct; setStore('creditos', credsUpd); }
  }

  // Registro contable (solo si no es cuenta corriente, porque la CC registra al disponer)
  if (tipo !== 'cuenta_corriente') {
    const contab = getStore('contabilidad');
    var cidC = nextId('contabilidad');
    var cliNombreC = getStore('clientes').find(c => c.id === clienteId);
    // Asiento 1: Colocación (monto íntegro va a Cartera)
    contab.push({ id: cidC++, fecha: fechaInicio, tipo: 'colocacion', concepto: `Colocación ${numero} - ${cliNombreC?.nombre || ''}`, monto, cuentaDebe: '1201', cuentaHaber: '1101', creditoId: id, referencia: numero, createdAt: new Date().toISOString() });
    // Asiento 2: Comisión de apertura (se cobra al cliente, es ingreso)
    if (comision > 0) {
      contab.push({ id: cidC++, fecha: fechaInicio, tipo: 'comision', concepto: `Comisión apertura ${numero}`, monto: comision, cuentaDebe: '1101', cuentaHaber: '4102', creditoId: id, referencia: numero, createdAt: new Date().toISOString() });
      // IVA sobre comisión de apertura
      var ivaComAp = +(comision * 0.16).toFixed(2);
      if (ivaComAp > 0) {
        contab.push({ id: cidC++, fecha: fechaInicio, tipo: 'iva_trasladado', concepto: `IVA s/comisión apertura ${numero}`, monto: ivaComAp, cuentaDebe: '1101', cuentaHaber: '2104', creditoId: id, referencia: numero, createdAt: new Date().toISOString() });
      }
    }
    setStore('contabilidad', contab);
  }

  addAudit('Crear', 'Créditos', numero);
  _forceCloseModal('modalCredito');
  toast(tipo === 'cuenta_corriente' ? 'Línea de crédito revolvente creada — Límite: ' + fmt(monto) : 'Crédito creado con tabla de amortización', 'success');
  renderCreditos();
  refreshNotifications();
}

let currentCreditoId = null;
function verCredito(id) {
  currentCreditoId = id;
  const c = getStore('creditos').find(cr => cr.id === id);
  if (!c) return;
  const cli = getStore('clientes').find(cl => cl.id === c.clienteId);
  const pagos = getStore('pagos').filter(p => p.creditoId === id);

  // Bug #28: Breadcrumbs
  document.getElementById('creditoDetalleTitulo').innerHTML = `<div class="breadcrumbs"><a onclick="showPage('creditos')">Créditos</a><span class="sep">›</span><span>${esc(c.numero)}</span>${cli ? '<span class="sep">›</span><span>' + esc(cli.nombre) + '</span>' : ''}</div>Crédito ${esc(c.numero)}`;
  document.getElementById('creditoDetalle').style.display = 'block';

  const esCC = c.esRevolvente || c.tipo === 'cuenta_corriente';

  let kpisHTML = `
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card navy"><div class="kpi-label">Cliente</div><div class="kpi-value" style="font-size:16px">${cli ? esc(cli.nombre) : '-'}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">Tipo</div><div class="kpi-value" style="font-size:16px">${tipoLabel[c.tipo]}</div></div>`;
  if (esCC) {
    kpisHTML += `
      <div class="kpi-card green"><div class="kpi-label">Límite</div><div class="kpi-value" style="font-size:16px">${fmt(c.limite)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Saldo Dispuesto</div><div class="kpi-value" style="font-size:16px">${fmt(c.saldo)}</div></div>
      <div class="kpi-card orange"><div class="kpi-label">Disponible</div><div class="kpi-value" style="font-size:16px">${fmt(c.disponible)}</div></div>
      <div class="kpi-card yellow"><div class="kpi-label">Tasa</div><div class="kpi-value" style="font-size:16px">${(c.tasa * 100).toFixed(2)}%</div></div>`;
  } else {
    kpisHTML += `
      <div class="kpi-card green"><div class="kpi-label">Monto Original</div><div class="kpi-value" style="font-size:16px">${fmt(c.monto)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">Saldo Actual</div><div class="kpi-value" style="font-size:16px">${fmt(c.saldo)}</div></div>
      <div class="kpi-card orange"><div class="kpi-label">Tasa</div><div class="kpi-value" style="font-size:16px">${(c.tasa * 100).toFixed(2)}%</div></div>
      <div class="kpi-card yellow"><div class="kpi-label">Pago Periódico</div><div class="kpi-value" style="font-size:16px">${fmt(c.pago)}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">Int. Devengado</div><div class="kpi-value" style="font-size:16px">${fmt(calcInteresDevengadoReal(c))}</div></div>`;
  }
  kpisHTML += `</div>`;

  let toolbarHTML = `<div class="toolbar">`;
  if (esCC) {
    toolbarHTML += `<button class="btn btn-primary btn-sm" onclick="openDisposicion(${c.id})">💳 Disponer</button>`;
  }
  toolbarHTML += `
        <button class="btn btn-success btn-sm" onclick="irAPagar(${c.id})">💰 Registrar Pago</button>
        <button class="btn btn-outline btn-sm" onclick="liquidarCredito(${c.id})">✅ Liquidar</button>
        ${c.estado === 'vigente' || c.estado === 'vencido' ? '<button class="btn btn-outline btn-sm" style="color:var(--purple,#8B5CF6)" onclick="abrirRestructura(' + c.id + ')">🔄 Reestructurar</button>' : ''}
        ${c.estado === 'vigente' ? '<button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="marcarVencido(' + c.id + ')">⚠️ Marcar Vencido</button>' : ''}
        <button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="eliminarCredito(${c.id})">🗑 Eliminar</button>
      </div>`;

  let tableHTML = '';
  if (esCC) {
    const disps = c.disposiciones || [];
    tableHTML = `<h4 style="margin-bottom:12px;margin-top:16px">Historial de Disposiciones</h4>
    <div class="table-wrapper">
      <table><thead><tr><th>Fecha</th><th>Monto</th><th>Saldo Después</th><th>Disponible Después</th></tr></thead>
      <tbody>${disps.length ? disps.map(d => `<tr><td>${fmtDate(d.fecha)}</td><td>${fmt(d.monto)}</td><td>${fmt(d.saldoDespues)}</td><td>${fmt(d.disponibleDespues)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#999">Sin disposiciones registradas</td></tr>'}</tbody></table>
    </div>`;
  } else {
    tableHTML = `<h4 style="margin-bottom:12px;margin-top:16px">Tabla de Amortización</h4>
    <div class="table-wrapper">
      <table class="amort-table"><thead><tr><th>#</th><th>Fecha</th><th>Saldo Inicial</th><th>Capital</th><th>Interés</th><th>Pago Total</th><th>Saldo Final</th><th>Estado</th></tr></thead>
      <tbody>${(c.amortizacion || []).map(a => `<tr class="${a.pagado ? 'paid' : ''}">
        <td>${a.numero}</td><td>${fmtDate(a.fecha)}</td><td>${fmt(a.saldoInicial)}</td>
        <td>${fmt(a.capital)}</td><td>${fmt(a.interes)}</td><td>${fmt(a.pagoTotal)}</td>
        <td>${fmt(a.saldoFinal)}</td><td>${a.pagado ? '<span class="badge badge-green">Pagado</span>' : '<span class="badge badge-yellow">Pendiente</span>'}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
  }

  let pagosHTML = pagos.length > 0 ? `<h4 style="margin:16px 0 12px">Historial de Pagos</h4>
    <div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Capital</th><th>Interés</th><th>Moratorio</th><th>Total</th><th>Saldo</th></tr></thead>
    <tbody>${pagos.map(p => `<tr><td>${fmtDate(p.fecha)}</td><td>${fmt(p.capital)}</td><td>${fmt(p.interes)}</td><td>${fmt(p.moratorio)}</td><td>${fmt(p.monto)}</td><td>${fmt(p.saldoNuevo)}</td></tr>`).join('')}</tbody></table></div>` : '';

  // Sprint P: Garantías
  let garantiasHTML = renderGarantiasHTML(id);
  // Sprint R: Scoring de riesgo
  let riesgoHTML = renderRiesgoHTML(id);
  // Sprint X: Historial de reestructuras
  let restructHTML = renderRestructurasHTML(id);
  // Sprint V: Bitácora
  let bitacoraHTML = renderBitacoraHTML(id);
  document.getElementById('creditoDetalleBody').innerHTML = kpisHTML + toolbarHTML + tableHTML + pagosHTML + garantiasHTML + riesgoHTML + restructHTML + bitacoraHTML;
  document.getElementById('creditoDetalle').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
function eliminarCredito(id) {
  if (!hasPermiso('creditos', 'eliminar')) return toast('Sin permiso para eliminar créditos', 'error');
  const c = getStore('creditos').find(x => x.id === id);
  const pagos = getStore('pagos').filter(p => p.creditoId === id);
  if (pagos.length > 0) { toast('No se puede eliminar: tiene ' + pagos.length + ' pago(s) registrado(s)', 'error'); return; }
  showConfirm('Eliminar crédito', '¿Eliminar crédito ' + (c ? esc(c.numero) : '') + '?', 'Sí, eliminar').then(ok => {
    if (!ok) return;
    const datosAntes = c ? JSON.parse(JSON.stringify(c)) : null;
    let creditos = getStore('creditos').filter(x => x.id !== id);
    setStore('creditos', creditos);
    // Limpiar contabilidad asociada
    let contab = getStore('contabilidad').filter(function(e) { return e.creditoId !== id; });
    setStore('contabilidad', contab);
    // Limpiar garantías asociadas
    let garant = getStore('garantias').filter(function(g) { return g.creditoId !== id; });
    setStore('garantias', garant);
    // Limpiar bitácora asociada
    let bitac = getStore('bitacora').filter(function(b) { return b.creditoId !== id; });
    setStore('bitacora', bitac);
    addAudit('Eliminar', 'Créditos', c ? c.numero : '', datosAntes, null);
    toast('Crédito eliminado', 'warning');
    renderCreditos();
    document.getElementById('creditoDetalle').style.display = 'none';
  });
}

function liquidarCredito(id) {
  if (!hasPermiso('creditos', 'editar')) return toast('Sin permiso', 'error');
  const c = getStore('creditos').find(x => x.id === id);
  if (!c) return;
  if (c.estado === 'liquidado') return toast('Crédito ya está liquidado', 'info');
  showConfirm('Liquidar crédito', '¿Marcar ' + esc(c.numero) + ' como liquidado? Saldo actual: ' + fmt(c.saldo), 'Sí, liquidar').then(ok => {
    if (!ok) return;
    var saldoAnterior = c.saldo;
    let creditos = getStore('creditos').map(x => {
      if (x.id === id) { x.estado = 'liquidado'; x.saldo = 0; x.saldoActual = 0; }
      return x;
    });
    setStore('creditos', creditos);
    // Reversal contable
    if (saldoAnterior > 0) {
      var contab = getStore('contabilidad');
      contab.push({ id: nextId('contabilidad'), fecha: new Date().toISOString().split('T')[0], tipo: 'liquidacion_credito', concepto: 'Liquidación ' + c.numero + ' — Saldo: ' + fmt(saldoAnterior), monto: -saldoAnterior, cuentaDebe: '5202', cuentaHaber: '1201', creditoId: id, referencia: c.numero, createdAt: new Date().toISOString() });
      setStore('contabilidad', contab);
    }
    addAudit('Liquidar', 'Créditos', c.numero);
    toast('Crédito ' + c.numero + ' liquidado', 'success');
    renderCreditos();
    refreshNotifications();
    verCredito(id);
  });
}

function marcarVencido(id) {
  if (!hasPermiso('creditos', 'editar')) return toast('Sin permiso para modificar créditos', 'error');
  var c = getStore('creditos').find(function(x) { return x.id === id; });
  if (!c) return;
  if (c.estado === 'liquidado' || c.estado === 'castigado') return toast('No se puede marcar como vencido un crédito ' + c.estado, 'error');
  let creditos = getStore('creditos').map(x => {
    if (x.id === id) { x.estado = 'vencido'; }
    return x;
  });
  setStore('creditos', creditos);
  addAudit('Marcar Vencido', 'Créditos', c.numero);
  toast('Crédito ' + c.numero + ' marcado como vencido', 'warning');
  renderCreditos();
  verCredito(id);
}


