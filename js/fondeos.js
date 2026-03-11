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
  const tiposIngreso = ['ingreso_intereses', 'pago_recibido', 'comision'];
  const ingresos = registros.filter(r => tiposIngreso.includes(r.tipo)).reduce((s, r) => s + r.monto, 0);
  const egresos = registros.filter(r => !tiposIngreso.includes(r.tipo)).reduce((s, r) => s + r.monto, 0);
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

  var ingresos = allRegistros.filter(function(r) { return ['ingreso_intereses', 'pago_recibido', 'comision'].includes(r.tipo); }).reduce(function(s, r) { return s + r.monto; }, 0);
  var egresos = allRegistros.filter(function(r) { return ['pago_fondeo', 'colocacion', 'gasto_operativo'].includes(r.tipo); }).reduce(function(s, r) { return s + r.monto; }, 0);
  var utilidad = ingresos - egresos;

  document.getElementById('contaResumen').innerHTML =
    '<div class="kpi-card green"><div class="kpi-label">Ingresos</div><div class="kpi-value">' + fmt(ingresos) + '</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">Egresos</div><div class="kpi-value">' + fmt(egresos) + '</div></div>' +
    '<div class="kpi-card ' + (utilidad >= 0 ? 'navy' : 'red') + '"><div class="kpi-label">Resultado</div><div class="kpi-value">' + fmt(utilidad) + '</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Registros</div><div class="kpi-value">' + allRegistros.length + '</div></div>';

  var pg = paginate(allRegistros, 'contabilidad');
  document.getElementById('tbContabilidad').innerHTML = pg.items.map(function(r) {
    var poliza = POLIZA_MAP[r.tipo] || {};
    var esIngreso = ['ingreso_intereses', 'pago_recibido', 'comision'].includes(r.tipo);
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

  // Activos
  var carteraVigente = creditos.filter(function(c) { return c.estado === 'vigente'; }).reduce(function(s, c) { return s + c.saldo; }, 0);
  var carteraVencida = creditos.filter(function(c) { return c.estado === 'vencido'; }).reduce(function(s, c) { return s + c.saldo; }, 0);
  var intPorCobrar = creditos.filter(function(c) { return c.estado !== 'liquidado' && c.amortizacion; }).reduce(function(s, c) {
    var proxPago = (c.amortizacion || []).find(function(a) { return !a.pagado; });
    return s + (proxPago ? proxPago.interes : 0);
  }, 0);
  var totalCobrado = pagos.reduce(function(s, p) { return s + p.monto; }, 0);
  var totalColocado = creditos.reduce(function(s, c) { return s + c.monto; }, 0);
  var totalFondeoRecibido = fondeos.reduce(function(s, f) { return s + f.monto; }, 0);
  var totalPagadoFondeos = contab.filter(function(r) { return r.tipo === 'pago_fondeo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var efectivo = totalFondeoRecibido + totalCobrado - totalColocado - totalPagadoFondeos;
  var totalActivos = efectivo + carteraVigente + carteraVencida + intPorCobrar;

  // Pasivos
  var saldoFondeos = fondeos.filter(function(f) { return f.estado !== 'liquidado'; }).reduce(function(s, f) { return s + f.saldo; }, 0);
  var intPorPagar = fondeos.filter(function(f) { return f.estado === 'vigente'; }).reduce(function(s, f) { return s + (f.monto * f.tasa / 12); }, 0);
  var totalPasivos = saldoFondeos + intPorPagar;

  var capital = totalActivos - totalPasivos;

  var html = '<div class="card"><div class="card-header"><span class="card-title">Balance General al ' + fmtDate(fechaCorte) + '</span></div>';
  html += '<table style="width:100%"><thead><tr><th colspan="2" style="background:var(--navy);color:white">ACTIVOS</th><th colspan="2" style="background:var(--navy);color:white">PASIVOS Y CAPITAL</th></tr></thead><tbody>';
  html += '<tr><td style="font-weight:600;color:var(--navy)">Activo Circulante</td><td></td><td style="font-weight:600;color:var(--navy)">Pasivo Circulante</td><td></td></tr>';
  html += '<tr><td style="padding-left:16px">Caja y Bancos</td><td style="text-align:right">' + fmt(efectivo) + '</td><td style="padding-left:16px">Fondeos por Pagar</td><td style="text-align:right">' + fmt(saldoFondeos) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Cartera Vigente</td><td style="text-align:right">' + fmt(carteraVigente) + '</td><td style="padding-left:16px">Intereses por Pagar</td><td style="text-align:right">' + fmt(intPorPagar) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Cartera Vencida</td><td style="text-align:right;color:var(--red)">' + fmt(carteraVencida) + '</td><td style="font-weight:bold;border-top:2px solid var(--gray-300)">Total Pasivos</td><td style="text-align:right;font-weight:bold;border-top:2px solid var(--gray-300)">' + fmt(totalPasivos) + '</td></tr>';
  html += '<tr><td style="padding-left:16px">Intereses por Cobrar</td><td style="text-align:right">' + fmt(intPorCobrar) + '</td><td></td><td></td></tr>';
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

  var intCobrados = contab.filter(function(r) { return r.tipo === 'ingreso_intereses'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var comisiones = contab.filter(function(r) { return r.tipo === 'comision'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var otrosIngresos = contab.filter(function(r) { return r.tipo === 'pago_recibido'; }).reduce(function(s, r) { return s + (r.interes || 0); }, 0);
  var totalIngresos = intCobrados + comisiones;

  var intPagados = contab.filter(function(r) { return r.tipo === 'pago_fondeo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var gastosOp = contab.filter(function(r) { return r.tipo === 'gasto_operativo'; }).reduce(function(s, r) { return s + r.monto; }, 0);
  var totalGastos = intPagados + gastosOp;

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
  html += '<tr style="font-weight:bold;border-top:1px solid var(--gray-300)"><td>Total Ingresos</td><td style="text-align:right;color:var(--green)">' + fmt(totalIngresos) + '</td></tr>';
  html += '<tr><td>&nbsp;</td><td></td></tr>';
  html += '<tr style="font-weight:600;color:var(--navy)"><td>COSTOS Y GASTOS</td><td></td></tr>';
  html += '<tr><td style="padding-left:16px">Intereses Pagados (Fondeos)</td><td style="text-align:right">' + fmt(intPagados) + '</td></tr>';
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
  var ingresos = contab.filter(function(r) { return ['ingreso_intereses','pago_recibido','comision'].includes(r.tipo); }).reduce(function(s, r) { return s + r.monto; }, 0);
  var egresos = contab.filter(function(r) { return ['pago_fondeo','colocacion','gasto_operativo'].includes(r.tipo); }).reduce(function(s, r) { return s + r.monto; }, 0);
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
    esIngreso = ['ingreso_intereses','pago_recibido','comision'].includes(r.tipo);
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

