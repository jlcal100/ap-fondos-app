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
    // FIX QA 2026-04-16: mostrar método de cálculo y CAT para transparencia
    const esFlat = c.metodoCalculoInteres === 'flat' || c.tipo === 'arrendamiento' || c.tipo === 'arrendamiento_puro';
    const metodoBadge = esFlat
      ? '<small style="color:#D97706;font-weight:600" title="Interés constante sobre monto original (tasa flat)">flat</small>'
      : '<small style="color:#059669;font-weight:600" title="Interés sobre saldo insoluto (francés)">s/saldo</small>';
    const catStr = c.cat ? '<br><small style="color:#7C3AED" title="Costo Anual Total — Banxico Circular 21/2009">CAT ' + (c.cat * 100).toFixed(1) + '%</small>' : '';
    return `<tr>
      <td><strong>${esc(c.numero)}</strong></td><td>${cli ? esc(cli.nombre) : '-'}</td>
      <td><span class="badge badge-blue">${tipoLabel[c.tipo]}</span></td>
      <td>${esCC ? fmt(c.limite || c.monto) + ' <small style="color:var(--gray-400)">(límite)</small>' : fmt(c.monto)}${c.moneda && c.moneda !== 'MXN' ? '<br><small style="color:#8B5CF6;font-weight:600">'+c.moneda+' ≈'+fmt(toMXN(c.monto,c.moneda))+'</small>' : ''}</td><td>${(c.tasa * 100).toFixed(2)}% ${metodoBadge}${catStr}</td><td>${c.plazo}m</td>
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
  const tipo = document.getElementById('credTipo').value;
  const isArrend = tipo === 'arrendamiento' || tipo === 'arrendamiento_puro';
  const isNomina = tipo === 'nomina';
  document.getElementById('credArrendFields').style.display = isArrend ? 'grid' : 'none';
  // Hide variable rate fields for arrendamiento
  const variableFields = document.getElementById('credVariableRateFields');
  if (variableFields) {
    variableFields.style.display = isArrend ? 'none' : '';
  }
  // Force tipoTasa to 'fija' for arrendamiento
  const tipoTasa = document.getElementById('credTipoTasa');
  if (tipoTasa) {
    tipoTasa.disabled = isArrend;
    if (isArrend) tipoTasa.value = 'fija';
    toggleTasaFields();
  }
  // Comisión: monto ($) para nómina, porcentaje (%) para créditos y arrendamientos
  var comInput = document.getElementById('credComision');
  var comSuffix = document.getElementById('credComisionSuffix');
  var comWrapper = document.getElementById('credComisionWrapper');
  if (comInput && comWrapper) {
    if (isNomina) {
      comWrapper.className = 'input-prefix';
      if (comSuffix) { comSuffix.className = 'prefix'; comSuffix.textContent = '$'; }
      comInput.removeAttribute('max');
      comInput.step = '1';
      comInput.type = 'text';
      comInput.setAttribute('oninput', 'formatMiles(this)');
      comInput.value = '0';
    } else {
      comWrapper.className = 'input-suffix';
      if (comSuffix) { comSuffix.className = 'suffix'; comSuffix.textContent = '%'; }
      comInput.max = '100';
      comInput.step = '0.5';
      comInput.type = 'number';
      comInput.removeAttribute('oninput');
      comInput.value = '0';
    }
  }
  // Periodo de gracia: solo para crédito simple y arrendamiento
  var graciaFields = document.getElementById('credGraciaFields');
  if (graciaFields) {
    var showGracia = (tipo === 'credito_simple' || isArrend);
    graciaFields.style.display = showGracia ? 'grid' : 'none';
    if (!showGracia) {
      document.getElementById('credGraciaMeses').value = '0';
    }
  }
}

function toggleTasaFields() {
  const tipoTasa = document.getElementById('credTipoTasa');
  if (!tipoTasa) return;
  const isVariable = tipoTasa.value === 'variable';
  const credTasa = document.getElementById('credTasa');
  const spreadFields = document.getElementById('credVariableRateFields');

  if (isVariable) {
    // Show spread/revision fields
    if (spreadFields) spreadFields.style.display = '';
    if (credTasa) credTasa.readOnly = true;
    // Calculate and display effective rate
    calcularTasaEfectiva();
  } else {
    // Hide spread/revision fields
    if (spreadFields) spreadFields.style.display = 'none';
    if (credTasa) credTasa.readOnly = false;
  }
}

function calcularTasaEfectiva() {
  const tipoTasa = document.getElementById('credTipoTasa');
  const credTasa = document.getElementById('credTasa');
  const spreadVal = document.getElementById('credSpread');
  const displayElem = document.getElementById('credTasaEfectivaDisplay');

  if (!tipoTasa || tipoTasa.value !== 'variable' || !spreadVal || !displayElem) return;

  const tiieVigente = getTIIEVigente();
  const spread = parseFloat(spreadVal.value) / 100 || 0;
  const tasaEfectiva = tiieVigente + spread;

  if (credTasa) credTasa.value = (tasaEfectiva * 100).toFixed(2);
  displayElem.textContent = `TIIE ${(tiieVigente*100).toFixed(2)}% + Spread ${(spread*100).toFixed(2)}% = Tasa Efectiva ${(tasaEfectiva*100).toFixed(2)}%`;
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
  const esNomina = tipo === 'nomina';
  const comisionRaw = esNomina ? String(parseMiles('credComision')) : document.getElementById('credComision').value;

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
  ok = V.check('credComision', V.nonNegNum(comisionRaw || '0'), 'Comisión no puede ser negativa') && ok;
  if (!esNomina) {
    ok = V.check('credComision', parseFloat(comisionRaw || '0') <= 100, 'Comisión no puede ser mayor a 100%') && ok;
  }

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
  // Nómina: comisión es monto fijo. Créditos/Arrendamientos: comisión es % del monto
  var comision;
  if (esNomina) {
    comision = parseFloat(comisionRaw) || 0;
  } else {
    var comisionPct = parseFloat(comisionRaw) || 0;
    comision = +(monto * comisionPct / 100).toFixed(2);
  }

  const id = nextId('creditos');
  const prefixMap = { credito_simple: 'CS', arrendamiento: 'AR', nomina: 'NM', cuenta_corriente: 'CC' };
  const prefix = prefixMap[tipo] || 'XX';
  const numero = `${prefix}-${String(id).padStart(3, '0')}`;

  // Extract grace period config for credito_simple and arrendamiento
  var graciaConfig = null;
  if (tipo === 'credito_simple' || tipo === 'arrendamiento' || tipo === 'arrendamiento_puro') {
    const graciaMesesElem = document.getElementById('credGraciaMeses');
    const graciaTipoElem = document.getElementById('credGraciaTipo');
    if (graciaMesesElem && graciaTipoElem) {
      const graciaMeses = parseInt(graciaMesesElem.value) || 0;
      const graciaTipo = graciaTipoElem.value || 'capital';
      if (graciaMeses > 0) {
        graciaConfig = { meses: graciaMeses, tipo: graciaTipo };
      }
    }
  }

  var credito;
  if (tipo === 'cuenta_corriente') {
    // Cuenta corriente: línea revolvente sin amortización
    credito = {
      id, numero, clienteId, tipo, monto, tasa, tasaMora, plazo, periodicidad: 'diario',
      fechaInicio, estado: 'vigente', saldo: 0, limite: monto,
      disponible: monto, disposiciones: [], comision,
      fechaVencimiento: addMonths(new Date(fechaInicio), plazo),
      esRevolvente: true,
      tipoTasa: 'fija', tasaReferencia: 0, spread: 0, periodoRevision: '', historialTasas: []
    };
  } else {
    credito = crearCreditoObj(id, numero, clienteId, tipo, monto, tasa, tasaMora, plazo, periodicidad, fechaInicio, vrPct, valorEquipo, comision, graciaConfig);
  }
  const fondeoId = document.getElementById('credFondeo').value;
  if (fondeoId) credito.fondeoId = parseInt(fondeoId);
  credito.notas = document.getElementById('credNotas').value;
  // Sprint Z: Moneda
  credito.moneda = document.getElementById('credMoneda').value || 'MXN';

  // Handle variable rate fields
  if (tipo !== 'arrendamiento') {
    const tipoTasaElem = document.getElementById('credTipoTasa');
    if (tipoTasaElem) {
      credito.tipoTasa = tipoTasaElem.value;
      if (tipoTasaElem.value === 'variable') {
        const spreadVal = document.getElementById('credSpread');
        const periodoRevElem = document.getElementById('credPeriodoRevision');
        const tiieVigente = getTIIEVigente();
        credito.tasaReferencia = tiieVigente;
        credito.spread = parseFloat(spreadVal.value) / 100 || 0;
        credito.periodoRevision = periodoRevElem ? periodoRevElem.value : 'mensual';
        credito.historialTasas = [{
          fecha: fechaInicio,
          tiie: tiieVigente,
          spread: credito.spread,
          tasaEfectiva: tasa
        }];
      }
    }
  }

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

// ============================================================
//  HISTORIAL DE REESTRUCTURAS (para detalle de crédito)
// ============================================================
function renderRestructurasHTML(creditoId) {
  var c = getStore('creditos').find(function(cr) { return cr.id === creditoId; });
  if (!c || !c.reestructuras || c.reestructuras.length === 0) return '';

  var html = '<div class="card" style="margin-top:20px;border-left:4px solid #8B5CF6">';
  html += '<div class="card-header"><span class="card-title">🔄 Historial de Reestructuras (' + c.reestructuras.length + ')</span></div>';
  html += '<div style="max-height:300px;overflow-y:auto">';
  c.reestructuras.slice().reverse().forEach(function(r, idx) {
    var fecha = new Date(r.fecha);
    var fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<strong style="color:#8B5CF6">Reestructura #' + (c.reestructuras.length - idx) + '</strong>';
    html += '<span style="font-size:12px;color:var(--text-muted)">' + fechaStr + ' — ' + esc(r.usuario) + '</span></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;font-size:12px">';
    html += '<div><span style="color:var(--text-muted)">Saldo anterior:</span> ' + fmt(r.saldoAnterior) + '</div>';
    html += '<div><span style="color:var(--text-muted)">Nuevo saldo:</span> <strong>' + fmt(r.nuevoSaldo) + '</strong></div>';
    if (r.quita > 0) html += '<div><span style="color:#EF4444">Quita:</span> <strong style="color:#EF4444">' + fmt(r.quita) + '</strong></div>';
    html += '<div><span style="color:var(--text-muted)">Tasa:</span> ' + (r.tasaAnterior < 1 ? (r.tasaAnterior * 100).toFixed(2) : r.tasaAnterior) + '% → <strong>' + r.nuevaTasa + '%</strong></div>';
    html += '<div><span style="color:var(--text-muted)">Plazo:</span> ' + r.plazoAnterior + ' → <strong>' + r.nuevoPlazo + ' meses</strong></div>';
    html += '<div><span style="color:var(--text-muted)">Mora anterior:</span> ' + r.diasMoraAnterior + ' días</div>';
    html += '</div>';
    html += '<div style="margin-top:8px;font-size:12px;color:var(--text-muted)"><em>Motivo: ' + esc(r.motivo) + '</em></div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

// ============================================================
//  BITÁCORA DE GESTIÓN Y COMENTARIOS
// ============================================================
var BITACORA_CATEGORIAS = {
  seguimiento: { label: 'Seguimiento', icon: '📋', color: '#3B82F6' },
  cobranza: { label: 'Cobranza', icon: '💰', color: '#F59E0B' },
  reestructura: { label: 'Reestructura', icon: '🔄', color: '#8B5CF6' },
  legal: { label: 'Legal', icon: '⚖️', color: '#EF4444' },
  garantia: { label: 'Garantía', icon: '🛡️', color: '#0D9F6E' },
  cliente: { label: 'Cliente', icon: '👤', color: '#EC4899' },
  nota: { label: 'Nota general', icon: '📝', color: '#6B7280' }
};

function renderBitacoraHTML(creditoId) {
  var notas = getStore('bitacora').filter(function(n) { return n.creditoId === creditoId; });
  notas.sort(function(a, b) { return b.createdAt.localeCompare(a.createdAt); });

  var html = '<div class="card" style="margin-top:20px">';
  html += '<div class="card-header"><span class="card-title">📋 Bitácora de Gestión</span>';
  html += '<button class="btn btn-primary btn-sm" onclick="abrirFormBitacora(' + creditoId + ')">+ Nueva Nota</button></div>';

  // Formulario inline (oculto por defecto)
  html += '<div id="formBitacora_' + creditoId + '" style="display:none;padding:16px;background:var(--gray-50);border-radius:8px;margin-bottom:12px">';
  html += '<div class="form-row-3">';
  html += '<div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="bitCat_' + creditoId + '">';
  Object.keys(BITACORA_CATEGORIAS).forEach(function(k) {
    var cat = BITACORA_CATEGORIAS[k];
    html += '<option value="' + k + '">' + cat.icon + ' ' + cat.label + '</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">Prioridad</label><select class="form-select" id="bitPrior_' + creditoId + '"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>';
  html += '<div class="form-group"><label class="form-label">Fecha seguimiento</label><input type="date" class="form-input" id="bitFechaSeg_' + creditoId + '"></div>';
  html += '</div>';
  html += '<div class="form-group" style="margin-bottom:8px"><label class="form-label">Comentario</label><textarea class="form-input" id="bitComentario_' + creditoId + '" rows="3" placeholder="Escribe tu nota o comentario..."></textarea></div>';
  html += '<div style="display:flex;gap:8px"><button class="btn btn-red btn-sm" onclick="guardarNotaBitacora(' + creditoId + ')">Guardar</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'formBitacora_' + creditoId + '\').style.display=\'none\'">Cancelar</button></div>';
  html += '</div>';

  // Lista de notas
  if (notas.length === 0) {
    html += '<p style="text-align:center;color:var(--text-muted);padding:20px">Sin notas registradas en la bitácora</p>';
  } else {
    html += '<div style="max-height:400px;overflow-y:auto">';
    notas.forEach(function(n) {
      var cat = BITACORA_CATEGORIAS[n.categoria] || BITACORA_CATEGORIAS.nota;
      var priorBadge = n.prioridad === 'urgente' ? '<span class="badge" style="background:#EF4444;color:#fff;font-size:9px;margin-left:6px">URGENTE</span>' :
        n.prioridad === 'alta' ? '<span class="badge" style="background:#F59E0B;color:#fff;font-size:9px;margin-left:6px">ALTA</span>' : '';
      var segBadge = n.fechaSeguimiento ? '<span style="color:var(--text-muted);font-size:11px;margin-left:8px">📅 Seguimiento: ' + n.fechaSeguimiento + '</span>' : '';
      var fecha = new Date(n.createdAt);
      var fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

      html += '<div style="padding:12px 16px;border-left:3px solid ' + cat.color + ';margin-bottom:8px;background:var(--gray-50);border-radius:0 8px 8px 0">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
      html += '<div>' + cat.icon + ' <strong style="font-size:13px">' + cat.label + '</strong>' + priorBadge + segBadge + '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--text-muted)">' + fechaStr + ' — ' + esc(n.usuario || 'Sistema') + '</span>';
      html += '<button class="btn btn-outline btn-sm" onclick="eliminarNotaBitacora(' + n.id + ',' + creditoId + ')" style="padding:2px 6px;font-size:11px" title="Eliminar">✕</button></div>';
      html += '</div>';
      html += '<p style="margin:0;font-size:13px;color:var(--text-primary);white-space:pre-wrap">' + esc(n.comentario) + '</p>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '<div style="padding:8px;text-align:right;color:var(--text-muted);font-size:11px">' + notas.length + ' nota(s) registrada(s)</div>';
  html += '</div>';
  return html;
}

function abrirFormBitacora(creditoId) {
  var form = document.getElementById('formBitacora_' + creditoId);
  if (form) {
    form.style.display = form.style.display === 'none' ? '' : 'none';
    if (form.style.display !== 'none') {
      document.getElementById('bitComentario_' + creditoId).value = '';
      document.getElementById('bitCat_' + creditoId).value = 'seguimiento';
      document.getElementById('bitPrior_' + creditoId).value = 'normal';
      document.getElementById('bitFechaSeg_' + creditoId).value = '';
    }
  }
}

function guardarNotaBitacora(creditoId) {
  var comentario = document.getElementById('bitComentario_' + creditoId).value.trim();
  if (!comentario) { toast('Escribe un comentario', 'warning'); return; }
  var categoria = document.getElementById('bitCat_' + creditoId).value;
  var prioridad = document.getElementById('bitPrior_' + creditoId).value;
  var fechaSeg = document.getElementById('bitFechaSeg_' + creditoId).value || null;

  var bitacora = getStore('bitacora');
  var nota = {
    id: nextId('bitacora'),
    creditoId: creditoId,
    categoria: categoria,
    prioridad: prioridad,
    comentario: comentario,
    fechaSeguimiento: fechaSeg,
    usuario: currentUser ? currentUser.nombre : 'Sistema',
    createdAt: new Date().toISOString()
  };
  bitacora.push(nota);
  setStore('bitacora', bitacora);

  var cred = getStore('creditos').find(function(c) { return c.id === creditoId; });
  addAudit('Crear', 'Bitácora', (BITACORA_CATEGORIAS[categoria] || {}).label + ' — Crédito ' + (cred ? cred.numero : creditoId));
  toast('Nota guardada en bitácora', 'success');

  // Re-render la sección de bitácora
  verCredito(creditoId);
}

function eliminarNotaBitacora(notaId, creditoId) {
  if (!confirm('¿Eliminar esta nota de la bitácora?')) return;
  var bitacora = getStore('bitacora');
  bitacora = bitacora.filter(function(n) { return n.id !== notaId; });
  setStore('bitacora', bitacora);
  addAudit('Eliminar', 'Bitácora', 'Nota #' + notaId);
  toast('Nota eliminada', 'success');
  verCredito(creditoId);
}
