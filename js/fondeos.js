function renderFondeos() {
  const search = (document.getElementById('searchFondeos').value || '').toLowerCase();
  const filterEstadoF = (document.getElementById('filterEstadoFondeo') || {}).value || '';
  const allFondeos = getStore('fondeos').filter(f => {
    if (filterEstadoF && f.estado !== filterEstadoF) return false;
    return f.fondeador.toLowerCase().includes(search) || f.numero.toLowerCase().includes(search);
  });
  const pg = paginate(allFondeos, 'fondeos');
  document.getElementById('tbFondeos').innerHTML = pg.items.map(f => {
    const esCC = f.tipo === 'cuenta_corriente';
    return `<tr>
    <td><strong>${esc(f.numero)}</strong></td><td>${esc(f.fondeador)}</td><td>${esCC ? fmt(f.limite || f.monto) + ' <small style="color:var(--gray-400)">(límite)</small>' : fmt(f.monto)}${f.moneda && f.moneda !== 'MXN' ? '<br><small style="color:#8B5CF6;font-weight:600">'+f.moneda+'</small>' : ''}</td>
    <td>${(f.tasa * 100).toFixed(2)}%</td><td>${f.plazo}m</td><td>${esCC ? fmt(f.saldoDispuesto || 0) + ' <small style="color:var(--green)">/ ' + fmt(f.disponibleFondeo || f.monto) + ' disp.</small>' : fmt(f.saldo)}</td>
    <td><span class="badge ${estadoBadge[f.estado]}">${f.estado}</span></td>
    <td>
      <button class="btn btn-outline btn-sm" onclick="verFondeo(${f.id})">📊 Detalle</button>
      ${esCC ? '<button class="btn btn-outline btn-sm" onclick="openDisposicionFondeo(' + f.id + ')">📤 Disponer</button><button class="btn btn-outline btn-sm" onclick="pagarFondeoCC(' + f.id + ')">💰 Pagar</button>' : ''}
      <button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="eliminarFondeo(${f.id})">🗑</button>
    </td>
  </tr>`}).join('');
  renderPagination('fondeos', pg.total, pg.page, pg.count);
}

var _editandoFondeoId = null;

function abrirNuevoFondeo() {
  _editandoFondeoId = null;
  document.getElementById('fondNombre').value = '';
  document.getElementById('fondTipo').value = 'banco';
  document.getElementById('fondMonto').value = '';
  document.getElementById('fondMoneda').value = 'MXN';
  document.getElementById('fondTasa').value = '';
  document.getElementById('fondPlazo').value = '';
  document.getElementById('fondPeriodicidad').value = 'mensual';
  document.getElementById('fondFechaInicio').value = '';
  document.getElementById('fondGarantia').value = '';
  document.getElementById('fondNotas').value = '';
  document.querySelector('#modalFondeo .modal-header h3').textContent = 'Nuevo Fondeo';
  V.clearErrors('modalFondeo');
  openModal('modalFondeo');
}

function editarFondeo(id) {
  var f = getStore('fondeos').find(function(fo) { return fo.id === id; });
  if (!f) return toast('Fondeo no encontrado', 'error');
  if (!hasPermiso('fondeos', 'editar')) return toast('Sin permiso para editar fondeos', 'error');
  _editandoFondeoId = id;
  document.getElementById('fondNombre').value = f.fondeador || '';
  document.getElementById('fondTipo').value = f.tipo || 'banco';
  document.getElementById('fondMonto').value = (f.monto || 0).toLocaleString('es-MX');
  document.getElementById('fondMoneda').value = f.moneda || 'MXN';
  document.getElementById('fondTasa').value = ((f.tasa || 0) * 100).toFixed(2);
  document.getElementById('fondPlazo').value = f.plazo || '';
  document.getElementById('fondPeriodicidad').value = f.periodicidad || 'mensual';
  document.getElementById('fondFechaInicio').value = f.fechaInicio || '';
  document.getElementById('fondGarantia').value = f.garantia || '';
  document.getElementById('fondNotas').value = f.notas || '';
  document.querySelector('#modalFondeo .modal-header h3').textContent = 'Editar Fondeo — ' + f.numero;
  V.clearErrors('modalFondeo');
  openModal('modalFondeo');
}

function guardarFondeo() {
  if (!guardSave('fondeo')) return;
  if (!hasPermiso('fondeos', _editandoFondeoId ? 'editar' : 'crear')) return toast('Sin permiso', 'error');
  V.clearErrors('modalFondeo');
  var ok = true;
  var fondeador = document.getElementById('fondNombre').value.trim();
  var montoVal = String(parseMiles('fondMonto'));
  var tasaVal = document.getElementById('fondTasa').value;
  var plazoVal = document.getElementById('fondPlazo').value;
  var fechaInicio = document.getElementById('fondFechaInicio').value;

  ok = V.check('fondNombre', fondeador.length >= 2, 'Nombre del fondeador es obligatorio') && ok;
  ok = V.check('fondMonto', V.positiveNum(montoVal), 'Monto debe ser mayor a 0') && ok;
  ok = V.check('fondTasa', V.positiveNum(tasaVal) && parseFloat(tasaVal) <= 100, 'Tasa debe estar entre 0.01% y 100%') && ok;
  ok = V.check('fondPlazo', V.positiveNum(plazoVal) && parseInt(plazoVal) >= 1, 'Plazo debe ser al menos 1 mes') && ok;
  ok = V.check('fondFechaInicio', !!fechaInicio, 'Fecha de inicio es obligatoria') && ok;
  // Bug #7: Validar rango de fechas en fondeos (consistente con créditos)
  if (fechaInicio) {
    var fiFond = new Date(fechaInicio);
    var hoyF = new Date();
    var hace1AnioF = new Date(); hace1AnioF.setFullYear(hace1AnioF.getFullYear() - 1);
    var en30DiasF = new Date(); en30DiasF.setDate(en30DiasF.getDate() + 30);
    ok = V.check('fondFechaInicio', fiFond >= hace1AnioF, 'Fecha no puede ser mayor a 1 año en el pasado') && ok;
    ok = V.check('fondFechaInicio', fiFond <= en30DiasF, 'Fecha no puede ser mayor a 30 días en el futuro') && ok;
  }

  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  var fondeos = getStore('fondeos');

  if (_editandoFondeoId) {
    // Modo edición
    fondeos = fondeos.map(function(f) {
      if (f.id !== _editandoFondeoId) return f;
      var datosAntes = JSON.parse(JSON.stringify(f));
      f.fondeador = fondeador;
      f.tipo = document.getElementById('fondTipo').value;
      // Ajustar saldo proporcionalmente si el monto cambia
      var montoNuevo = parseFloat(montoVal);
      var montoAnterior = f.monto || montoNuevo;
      if (montoAnterior > 0 && Math.abs(montoNuevo - montoAnterior) > 0.01) {
        var proporcion = (f.saldo || 0) / montoAnterior;
        f.saldo = +(montoNuevo * proporcion).toFixed(2);
      }
      f.monto = montoNuevo;
      f.tasa = parseFloat(tasaVal) / 100;
      f.plazo = parseInt(plazoVal);
      f.periodicidad = document.getElementById('fondPeriodicidad').value;
      f.fechaInicio = fechaInicio;
      f.fechaVencimiento = addMonths(new Date(fechaInicio), parseInt(plazoVal));
      f.garantia = document.getElementById('fondGarantia').value;
      f.notas = document.getElementById('fondNotas').value;
      f.moneda = document.getElementById('fondMoneda').value || 'MXN';
      addAudit('Editar', 'Fondeos', f.numero, datosAntes, f);
      return f;
    });
    setStore('fondeos', fondeos);
    _forceCloseModal('modalFondeo');
    toast('Fondeo actualizado exitosamente', 'success');
  } else {
    // Modo creación
    var fondeoId = nextId('fondeos');
    var fondeo = {
      id: fondeoId,
      numero: 'FD-' + String(fondeoId).padStart(3, '0'),
      fondeador: fondeador,
      tipo: document.getElementById('fondTipo').value,
      monto: parseFloat(montoVal),
      saldo: parseFloat(montoVal),
      tasa: parseFloat(tasaVal) / 100,
      plazo: parseInt(plazoVal),
      periodicidad: document.getElementById('fondPeriodicidad').value,
      fechaInicio: fechaInicio,
      fechaVencimiento: addMonths(new Date(fechaInicio), parseInt(plazoVal)),
      estado: 'vigente',
      garantia: document.getElementById('fondGarantia').value,
      notas: document.getElementById('fondNotas').value,
      moneda: document.getElementById('fondMoneda').value || 'MXN'
    };
    if (fondeo.tipo === 'cuenta_corriente') {
      fondeo.limite = fondeo.monto;
      fondeo.saldoDispuesto = 0;
      fondeo.saldo = 0;
      fondeo.disponibleFondeo = fondeo.monto;
      fondeo.disposiciones = [];
      fondeo.esRevolvente = true;
    }
    fondeos.push(fondeo);
    setStore('fondeos', fondeos);
    addAudit('Crear', 'Fondeos', fondeo.numero);
    _forceCloseModal('modalFondeo');
    toast('Fondeo registrado exitosamente', 'success');
  }
  _editandoFondeoId = null;
  renderFondeos();
  refreshNotifications();
}

function verFondeo(id) {
  const f = getStore('fondeos').find(fo => fo.id === id);
  if (!f) return;
  const diasVenc = Math.floor((new Date(f.fechaVencimiento) - new Date()) / (1000*60*60*24));
  const esCC = f.esRevolvente || f.tipo === 'cuenta_corriente';
  const saldoRef = esCC ? (f.saldoDispuesto || 0) : f.saldo;
  // Interés devengado: desde último pago de fondeo (o fecha inicio si no hay pagos)
  var pagosF = getStore('pagos').filter(function(p) { return p.fondeoId === f.id; });
  var fechaRefF = pagosF.length > 0 ? new Date(pagosF[pagosF.length - 1].fecha) : new Date(f.fechaInicio);
  var diasDevFondeo = Math.max(0, Math.floor((new Date() - fechaRefF) / 86400000));
  const intDev = saldoRef * (f.tasa / 360) * diasDevFondeo;

  let panel = document.getElementById('fondeoDetPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'fondeoDetPanel';
    panel.className = 'detail-panel';
    document.getElementById('page-fondeos').appendChild(panel);
  }
  panel.style.display = 'block';

  let kpisHTML = '<div class="kpi-grid">';
  if (esCC) {
    kpisHTML += `
        <div class="kpi-card navy"><div class="kpi-label">Límite</div><div class="kpi-value">${fmt(f.limite)}</div></div>
        <div class="kpi-card red"><div class="kpi-label">Saldo Dispuesto</div><div class="kpi-value">${fmt(f.saldoDispuesto || 0)}</div></div>
        <div class="kpi-card green"><div class="kpi-label">Disponible</div><div class="kpi-value">${fmt(f.disponibleFondeo || 0)}</div></div>
        <div class="kpi-card blue"><div class="kpi-label">Tasa Anual</div><div class="kpi-value">${(f.tasa*100).toFixed(2)}%</div></div>
        <div class="kpi-card orange"><div class="kpi-label">Int. Devengado (est.)</div><div class="kpi-value">${fmt(intDev)}</div></div>
        <div class="kpi-card ${diasVenc < 30 ? 'red' : diasVenc < 90 ? 'yellow' : 'green'}"><div class="kpi-label">Días para Vencimiento</div><div class="kpi-value">${diasVenc > 0 ? diasVenc + ' días' : 'VENCIDO'}</div></div>`;
  } else {
    kpisHTML += `
        <div class="kpi-card navy"><div class="kpi-label">Monto Original</div><div class="kpi-value">${fmt(f.monto)}</div></div>
        <div class="kpi-card red"><div class="kpi-label">Saldo Pendiente</div><div class="kpi-value">${fmt(f.saldo)}</div></div>
        <div class="kpi-card blue"><div class="kpi-label">Tasa Anual</div><div class="kpi-value">${(f.tasa*100).toFixed(2)}%</div></div>
        <div class="kpi-card orange"><div class="kpi-label">Int. Devengado (est.)</div><div class="kpi-value">${fmt(intDev)}</div></div>
        <div class="kpi-card ${diasVenc < 30 ? 'red' : diasVenc < 90 ? 'yellow' : 'green'}"><div class="kpi-label">Días para Vencimiento</div><div class="kpi-value">${diasVenc > 0 ? diasVenc + ' días' : 'VENCIDO'}</div></div>
        <div class="kpi-card green"><div class="kpi-label">Capital Pagado</div><div class="kpi-value">${fmt(f.monto - f.saldo)}</div><div class="kpi-sub">${((1 - f.saldo/f.monto)*100).toFixed(1)}% amortizado</div></div>`;
  }
  kpisHTML += '</div>';

  let dispsHTML = '';
  if (esCC) {
    const disps = f.disposiciones || [];
    dispsHTML = `<h4 style="margin:16px 0 12px">Historial de Disposiciones</h4>
      <div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Monto</th><th>Saldo Después</th><th>Disponible Después</th></tr></thead>
      <tbody>${disps.length ? disps.map(d => `<tr><td>${fmtDate(d.fecha)}</td><td>${fmt(d.monto)}</td><td>${fmt(d.saldoDespues)}</td><td>${fmt(d.disponibleDespues)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#999">Sin disposiciones</td></tr>'}</tbody></table></div>`;
  }

  let toolbarHTML = '<div class="toolbar" style="margin-top:16px">';
  if (esCC) {
    toolbarHTML += `<button class="btn btn-primary btn-sm" onclick="openDisposicionFondeo(${f.id})">💳 Disponer</button>
        <button class="btn btn-success btn-sm" onclick="pagarFondeoCC(${f.id})">💰 Pagar</button>`;
  } else {
    toolbarHTML += `<button class="btn btn-primary btn-sm" onclick="registrarPagoFondeo(${f.id})">Registrar Pago</button>`;
  }
  toolbarHTML += `<button class="btn btn-outline btn-sm" onclick="editarFondeo(${f.id})">Editar</button></div>`;

  panel.innerHTML = `
    <div class="detail-panel-header">
      <h3>Fondeo ${esc(f.numero)} — ${esc(f.fondeador)} ${esCC ? '(Cta. Corriente)' : ''}</h3>
      <button class="btn btn-outline" style="color:white;border-color:rgba(255,255,255,0.3)" onclick="this.closest('.detail-panel').style.display='none'">Cerrar ✕</button>
    </div>
    <div class="detail-panel-body">
      ${kpisHTML}
      <table style="margin-top:16px"><tbody>
        <tr><td><strong>Tipo fondeador:</strong></td><td>${f.tipo ? esc(f.tipo) : '-'}</td><td><strong>Periodicidad:</strong></td><td>${f.periodicidad ? esc(f.periodicidad) : '-'}</td></tr>
        <tr><td><strong>Fecha inicio:</strong></td><td>${fmtDate(f.fechaInicio)}</td><td><strong>Vencimiento:</strong></td><td>${fmtDate(f.fechaVencimiento)}</td></tr>
        <tr><td><strong>Plazo:</strong></td><td>${f.plazo} meses</td><td><strong>Garantía:</strong></td><td>${f.garantia ? esc(f.garantia) : 'Sin garantía'}</td></tr>
        <tr><td><strong>Estado:</strong></td><td><span class="badge ${estadoBadge[f.estado]}">${f.estado}</span></td><td><strong>Notas:</strong></td><td>${f.notas ? esc(f.notas) : '-'}</td></tr>
      </tbody></table>
      ${dispsHTML}
      ${toolbarHTML}
    </div>
  `;
  panel.scrollIntoView({ behavior: 'smooth' });
}

function registrarPagoFondeo(id) {
  if (!hasPermiso('fondeos', 'crear')) return toast('Sin permiso para registrar pagos de fondeo', 'error');
  var fondeos = getStore('fondeos');
  var fondeo = fondeos.find(function(f) { return f.id === id; });
  if (!fondeo) return toast('Fondeo no encontrado', 'error');
  if (fondeo.estado === 'liquidado') return toast('Este fondeo ya está liquidado', 'info');

  // Calcular intereses devengados del fondeo
  var ultimoPago = getStore('pagos').filter(function(p) { return p.fondeoId === id && !p.reversado; }).sort(function(a, b) { return b.fecha > a.fecha ? 1 : -1; })[0];
  var fechaRef = ultimoPago ? ultimoPago.fecha : (fondeo.fechaInicio || new Date().toISOString().split('T')[0]);
  var hoy = new Date().toISOString().split('T')[0];
  var dias = Math.max(0, Math.floor((new Date(hoy) - new Date(fechaRef)) / 86400000));
  var intDevengado = +((fondeo.saldo || 0) * (fondeo.tasa || 0) / 360 * dias).toFixed(2);

  var inputCapital = prompt('PAGO DE FONDEO: ' + (fondeo.fondeador || 'Fondeo #' + id) +
    '\n\nSaldo: ' + fmt(fondeo.saldo) +
    '\nInterés devengado (' + dias + ' días): ' + fmt(intDevengado) +
    '\nTasa: ' + ((fondeo.tasa || 0) * 100).toFixed(2) + '%' +
    '\n\nCapital a pagar (0 para solo intereses):');
  if (inputCapital === null) return;
  var capitalF = parseFloat(inputCapital) || 0;
  if (capitalF < 0) return toast('Capital no puede ser negativo', 'error');
  if (capitalF > fondeo.saldo + 0.01) return toast('Capital no puede exceder el saldo ' + fmt(fondeo.saldo), 'error');

  var inputInteres = prompt('Interés a pagar (sugerido: ' + fmt(intDevengado) + '):');
  if (inputInteres === null) return;
  var interesF = parseFloat(inputInteres) || intDevengado;

  var montoTotal = capitalF + interesF;
  if (montoTotal <= 0) return toast('Monto debe ser mayor a 0', 'error');

  if (!confirm('Confirmar pago de fondeo:\n\nCapital: ' + fmt(capitalF) + '\nIntereses: ' + fmt(interesF) + '\nTotal: ' + fmt(montoTotal) + '\n\nNuevo saldo: ' + fmt(fondeo.saldo - capitalF))) return;

  var txOk = withTransaction(function() {
    var txFondeos = getStore('fondeos');
    var txF = txFondeos.find(function(f) { return f.id === id; });
    if (!txF) throw new Error('Fondeo no encontrado');

    txF.saldo = Math.max(+(txF.saldo - capitalF).toFixed(2), 0);
    if (txF.saldo <= 0.01) txF.estado = 'liquidado';
    setStore('fondeos', txFondeos);

    // Registrar pago
    var txPagos = getStore('pagos');
    txPagos.push({
      id: nextId('pagos'), fondeoId: id, creditoId: null,
      fecha: hoy, monto: montoTotal, capital: capitalF, interes: interesF,
      moratorio: 0, comision: 0, tipo: 'pago_fondeo',
      referencia: 'PF-' + id + '-' + Date.now(),
      notas: 'Pago a fondeador: ' + (fondeo.fondeador || ''),
      createdAt: new Date().toISOString()
    });
    setStore('pagos', txPagos);

    // Contabilidad: Capital → Db Fondeos por Pagar (2101), Cr Banco (1101)
    var txContab = getStore('contabilidad');
    var cid = nextId('contabilidad');
    if (capitalF > 0) {
      txContab.push({ id: cid++, fecha: hoy, tipo: 'pago_fondeo', concepto: 'Pago capital fondeo ' + (fondeo.fondeador || '#' + id),
        monto: capitalF, cuentaDebe: '2101', cuentaHaber: '1101', fondeoId: id, createdAt: new Date().toISOString() });
    }
    // Intereses → Db Intereses Pagados (5101), Cr Banco (1101)
    if (interesF > 0) {
      txContab.push({ id: cid++, fecha: hoy, tipo: 'pago_fondeo', concepto: 'Intereses fondeo ' + (fondeo.fondeador || '#' + id),
        monto: interesF, cuentaDebe: '5101', cuentaHaber: '1101', fondeoId: id, createdAt: new Date().toISOString() });
    }
    setStore('contabilidad', txContab);
  });

  if (!txOk) return;
  addAudit('Pago Fondeo', 'Fondeos', (fondeo.fondeador || '#' + id) + ': ' + fmt(montoTotal) + ' (Cap: ' + fmt(capitalF) + ', Int: ' + fmt(interesF) + ')');
  toast('Pago de fondeo registrado. Nuevo saldo: ' + fmt(Math.max(fondeo.saldo - capitalF, 0)), 'success');
  renderFondeos();
}

// editarFondeo ya definida arriba, antes de guardarFondeo

// ============================================================
//  DUPLICATES REMOVED: setContaTab, getPeriodoActual, isPeriodoCerrado,
//  renderCierres, ejecutarCierreContable, renderContabilidad,
//  renderBalance, renderResultados, renderConciliacion
//  (canonical versions in contabilidad.js)
// ============================================================

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

