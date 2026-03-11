// ====== MODULE: calendario.js ======
// calNavMes(), generarEventosCalendario(), renderCalendario(), verDiaCal()

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

