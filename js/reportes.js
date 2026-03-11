var chartFlujoEfectivo;

function calcularFlujoEfectivo() {
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var hoy = new Date();
  var meses = [];
  var mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Generar 12 meses hacia adelante
  for (var i = 0; i < 12; i++) {
    var fecha = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    var mesKey = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
    meses.push({
      key: mesKey,
      label: mNames[fecha.getMonth()] + ' ' + fecha.getFullYear(),
      entradas: 0,
      salidas: 0,
      neto: 0,
      acumulado: 0,
      detalleEntradas: [],
      detalleSalidas: []
    });
  }

  // ENTRADAS: cuotas esperadas de créditos vigentes (amortización)
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || c.estado === 'castigado') return;
    var amort = c.amortizacion || c.tablaAmortizacion || [];
    amort.forEach(function(cuota) {
      if (cuota.pagado) return;
      var fPago = cuota.fecha || cuota.fechaPago;
      if (!fPago) return;
      var mesKey = fPago.substring(0, 7);
      var mesObj = meses.find(function(m) { return m.key === mesKey; });
      if (mesObj) {
        var montoCuota = cuota.pagoTotal || cuota.cuota || cuota.total || 0;
        mesObj.entradas += montoCuota;
        mesObj.detalleEntradas.push({ credito: c.numero, monto: montoCuota });
      }
    });
  });

  // SALIDAS: pagos a fondeadores (estimar basado en tasa y plazo del fondeo)
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    var saldo = f.saldo || 0;
    if (saldo <= 0) return;
    var tasa = f.tasa || 0;
    var periodicidad = f.periodicidad || 'mensual';
    var pagoMensualInteres = saldo * tasa / 12;

    // Si tiene fecha de vencimiento, calcular pagos de capital restantes
    var fechaVenc = f.fechaVencimiento ? new Date(f.fechaVencimiento) : null;

    meses.forEach(function(mesObj) {
      var mesFin = new Date(mesObj.key + '-28');
      // Intereses mensuales
      mesObj.salidas += pagoMensualInteres;
      mesObj.detalleSalidas.push({ fondeo: f.numero || f.fondeador, monto: pagoMensualInteres, tipo: 'interes' });

      // Capital al vencimiento
      if (fechaVenc) {
        var vencKey = fechaVenc.getFullYear() + '-' + String(fechaVenc.getMonth() + 1).padStart(2, '0');
        if (mesObj.key === vencKey) {
          mesObj.salidas += saldo;
          mesObj.detalleSalidas.push({ fondeo: f.numero || f.fondeador, monto: saldo, tipo: 'capital' });
        }
      }
    });
  });

  // Calcular neto y acumulado
  var acumulado = 0;
  meses.forEach(function(m) {
    m.neto = m.entradas - m.salidas;
    acumulado += m.neto;
    m.acumulado = acumulado;
    m.cobertura = m.salidas > 0 ? (m.entradas / m.salidas * 100) : (m.entradas > 0 ? 999 : 0);
  });

  return meses;
}

function renderReporteFlujoEfectivo() {
  var flujo = calcularFlujoEfectivo();

  var totalEntradas = flujo.reduce(function(s, m) { return s + m.entradas; }, 0);
  var totalSalidas = flujo.reduce(function(s, m) { return s + m.salidas; }, 0);
  var totalNeto = totalEntradas - totalSalidas;
  var coberturaGlobal = totalSalidas > 0 ? (totalEntradas / totalSalidas * 100) : 0;

  // Detectar meses con flujo negativo
  var mesesNegativos = flujo.filter(function(m) { return m.neto < 0; });
  var mesesPositivos = flujo.filter(function(m) { return m.neto > 0; });
  var peorMes = flujo.reduce(function(prev, curr) { return curr.neto < prev.neto ? curr : prev; }, flujo[0]);

  // KPIs
  document.getElementById('rptFlujoKpis').innerHTML =
    '<div class="kpi-card green"><div class="kpi-label">Cobranza Esperada (12m)</div><div class="kpi-value">' + fmt(totalEntradas) + '</div><div class="kpi-sub">Cuotas por cobrar</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">Pagos a Fondeo (12m)</div><div class="kpi-value">' + fmt(totalSalidas) + '</div><div class="kpi-sub">Intereses + Capital</div></div>' +
    '<div class="kpi-card ' + (totalNeto >= 0 ? 'navy' : 'red') + '"><div class="kpi-label">Flujo Neto Proyectado</div><div class="kpi-value">' + fmt(totalNeto) + '</div><div class="kpi-sub">' + (totalNeto >= 0 ? 'Superávit' : 'Déficit') + '</div></div>' +
    '<div class="kpi-card ' + (coberturaGlobal >= 120 ? 'green' : coberturaGlobal >= 100 ? 'yellow' : 'red') + '"><div class="kpi-label">Cobertura Global</div><div class="kpi-value">' + coberturaGlobal.toFixed(1) + '%</div><div class="kpi-sub">' + (coberturaGlobal >= 120 ? 'Holgada' : coberturaGlobal >= 100 ? 'Ajustada' : 'Insuficiente') + '</div></div>' +
    '<div class="kpi-card ' + (mesesNegativos.length === 0 ? 'green' : 'red') + '"><div class="kpi-label">Meses en Déficit</div><div class="kpi-value">' + mesesNegativos.length + ' de 12</div><div class="kpi-sub">' + (mesesNegativos.length === 0 ? 'Sin alertas' : 'Atención requerida') + '</div></div>' +
    '<div class="kpi-card orange"><div class="kpi-label">Peor Mes</div><div class="kpi-value">' + (peorMes ? peorMes.label : '-') + '</div><div class="kpi-sub">' + (peorMes ? fmt(peorMes.neto) : '-') + '</div></div>';

  // Tabla detallada
  document.getElementById('tbFlujoEfectivo').innerHTML = flujo.map(function(m) {
    var cobColor = m.cobertura >= 120 ? 'color:var(--green)' : m.cobertura >= 100 ? 'color:var(--orange)' : 'color:var(--red);font-weight:700';
    var netoColor = m.neto >= 0 ? 'color:var(--green)' : 'color:var(--red);font-weight:700';
    var acumColor = m.acumulado >= 0 ? '' : 'color:var(--red);font-weight:700';
    return '<tr>' +
      '<td><strong>' + esc(m.label) + '</strong></td>' +
      '<td style="color:var(--green)">' + fmt(m.entradas) + '</td>' +
      '<td style="color:var(--red)">' + fmt(m.salidas) + '</td>' +
      '<td style="' + netoColor + '">' + fmt(m.neto) + '</td>' +
      '<td style="' + acumColor + '">' + fmt(m.acumulado) + '</td>' +
      '<td style="' + cobColor + '">' + (m.cobertura > 900 ? '∞' : m.cobertura.toFixed(1) + '%') + '</td>' +
      '</tr>';
  }).join('');

  // Gráfica
  if (chartFlujoEfectivo) chartFlujoEfectivo.destroy();
  chartFlujoEfectivo = new Chart(document.getElementById('chartFlujoEfectivo'), {
    type: 'bar',
    data: {
      labels: flujo.map(function(m) { return m.label; }),
      datasets: [
        {
          label: 'Cobranza Esperada',
          data: flujo.map(function(m) { return m.entradas; }),
          backgroundColor: 'rgba(13,159,110,0.7)',
          borderColor: '#0D9F6E',
          borderWidth: 1,
          borderRadius: 3,
          order: 2
        },
        {
          label: 'Pagos a Fondeo',
          data: flujo.map(function(m) { return -m.salidas; }),
          backgroundColor: 'rgba(200,16,46,0.7)',
          borderColor: '#C8102E',
          borderWidth: 1,
          borderRadius: 3,
          order: 3
        },
        {
          label: 'Flujo Neto Acumulado',
          data: flujo.map(function(m) { return m.acumulado; }),
          type: 'line',
          borderColor: '#1E3050',
          backgroundColor: 'rgba(30,48,80,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#1E3050',
          borderWidth: 2,
          order: 1,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Flujo de Efectivo Proyectado — Próximos 12 Meses', font: { size: 14 } },
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmt(Math.abs(ctx.raw)); } } }
      },
      scales: {
        y: {
          title: { display: true, text: 'Entradas / Salidas' },
          ticks: { callback: function(v) { return fmt(Math.abs(v)); } }
        },
        y1: {
          position: 'right',
          grid: { display: false },
          title: { display: true, text: 'Flujo Acumulado' },
          ticks: { callback: function(v) { return fmt(v); } }
        }
      }
    }
  });
}

// ===== EXPORTAR FLUJO DE EFECTIVO PDF =====
function exportarFlujoPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var flujo = calcularFlujoEfectivo();
  var totalEntradas = flujo.reduce(function(s, m) { return s + m.entradas; }, 0);
  var totalSalidas = flujo.reduce(function(s, m) { return s + m.salidas; }, 0);
  var totalNeto = totalEntradas - totalSalidas;

  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Flujo de Efectivo Proyectado', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy + '   |   Proyección: 12 meses', 14, 20);

  doc.setTextColor(30, 48, 80);
  doc.setFontSize(10);
  doc.text('Cobranza Esperada: ' + fmt(totalEntradas) + '   |   Pagos a Fondeo: ' + fmt(totalSalidas) + '   |   Flujo Neto: ' + fmt(totalNeto), 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['Mes', 'Cobranza Esperada', 'Pagos a Fondeo', 'Flujo Neto', 'Flujo Acumulado', 'Cobertura']],
    body: flujo.map(function(m) {
      return [m.label, fmt(m.entradas), fmt(m.salidas), fmt(m.neto), fmt(m.acumulado), (m.cobertura > 900 ? '∞' : m.cobertura.toFixed(1) + '%')];
    }),
    styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: [30, 48, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 3) {
        var val = flujo[data.row.index] ? flujo[data.row.index].neto : 0;
        if (val < 0) data.cell.styles.textColor = [200, 16, 46];
      }
    }
  });

  // Resumen final
  var finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  var mesesDef = flujo.filter(function(m) { return m.neto < 0; });
  doc.text('Meses en déficit: ' + mesesDef.length + '/12' + (mesesDef.length > 0 ? ' — ' + mesesDef.map(function(m) { return m.label; }).join(', ') : ' — Sin alertas'), 14, finalY);

  doc.save('AP_Flujo_Efectivo_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Reporte de flujo de efectivo PDF generado', 'success');
}

// ===== EXPORTAR FLUJO DE EFECTIVO EXCEL =====
function exportarFlujoExcel() {
  var flujo = calcularFlujoEfectivo();
  var headers = ['Mes', 'Cobranza Esperada', 'Pagos a Fondeo', 'Flujo Neto', 'Flujo Acumulado', 'Cobertura %'];
  var data = flujo.map(function(m) {
    return [m.label, m.entradas, m.salidas, m.neto, m.acumulado, m.cobertura > 900 ? 999 : +m.cobertura.toFixed(1)];
  });
  exportToExcel(data, headers, 'AP_Flujo_Efectivo_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Flujo de Efectivo');
}

// ===== SPRINT O: ESTADO DE RESULTADOS Y RENTABILIDAD =====
var chartResultados, chartMargen;

function calcularEstadoResultados(mesesAtras) {
  var pagos = getStore('pagos');
  var fondeos = getStore('fondeos');
  var creditos = getStore('creditos');
  var contabilidad = getStore('contabilidad');
  var hoy = new Date();

  // Determinar rango de meses
  var periodos = {};

  // Construir lista de meses
  if (mesesAtras === 0) {
    // Solo mes actual
    var k = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
    periodos[k] = { interes: 0, comision: 0, moratorio: 0, costoFondeo: 0, provisiones: 0 };
  } else if (mesesAtras === -1) {
    // Todo el historial — derivar de pagos
    pagos.forEach(function(p) {
      if (!p.fecha) return;
      var k = p.fecha.substring(0, 7);
      if (!periodos[k]) periodos[k] = { interes: 0, comision: 0, moratorio: 0, costoFondeo: 0, provisiones: 0 };
    });
    contabilidad.forEach(function(c) {
      if (!c.fecha) return;
      var k = c.fecha.substring(0, 7);
      if (!periodos[k]) periodos[k] = { interes: 0, comision: 0, moratorio: 0, costoFondeo: 0, provisiones: 0 };
    });
  } else {
    for (var i = mesesAtras - 1; i >= 0; i--) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      periodos[k] = { interes: 0, comision: 0, moratorio: 0, costoFondeo: 0, provisiones: 0 };
    }
  }

  // INGRESOS: de pagos recibidos
  pagos.forEach(function(p) {
    if (!p.fecha) return;
    var k = p.fecha.substring(0, 7);
    if (!periodos[k]) return;
    periodos[k].interes += (p.interes || 0);
    periodos[k].comision += (p.comision || 0);
    periodos[k].moratorio += (p.moratorio || 0);
  });

  // EGRESOS: Costo de fondeo — primero usar registros reales de contabilidad
  var costoFondeoReal = {};
  contabilidad.forEach(function(c) {
    if (!c.fecha) return;
    var k = c.fecha.substring(0, 7);
    if (!periodos[k]) return;
    if (c.tipo === 'pago_fondeo_interes' || c.tipo === 'pago_fondeo') {
      if (!costoFondeoReal[k]) costoFondeoReal[k] = 0;
      costoFondeoReal[k] += (c.monto || 0);
    }
  });

  // Para meses sin registros contables de fondeo, estimar con saldo y tasa actual
  var saldoFondeoTotal = fondeos.reduce(function(s, f) { return s + (f.estado !== 'liquidado' ? f.saldo || 0 : 0); }, 0);
  var tasaPromFondeo = 0;
  var fondeoCount = 0;
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    tasaPromFondeo += (f.tasa || 0);
    fondeoCount++;
  });
  if (fondeoCount > 0) tasaPromFondeo = tasaPromFondeo / fondeoCount;
  var costoMensualEstimado = saldoFondeoTotal * tasaPromFondeo / 12;

  Object.keys(periodos).forEach(function(k) {
    periodos[k].costoFondeo = costoFondeoReal[k] !== undefined ? costoFondeoReal[k] : costoMensualEstimado;
  });

  // PROVISIONES: calcular por mes usando CNBV escalonadas
  // Para cada mes, reconstruir la cartera morosa de ese mes basándonos en los pagos
  var mesesOrdenadosProv = Object.keys(periodos).sort();
  mesesOrdenadosProv.forEach(function(k) {
    // Último día del mes k
    var parts = k.split('-');
    var y = parseInt(parts[0]), m = parseInt(parts[1]);
    var ultimoDia = new Date(y, m, 0).getDate();
    var fechaFinMes = k + '-' + String(ultimoDia).padStart(2, '0');

    var provMes = 0;
    creditos.forEach(function(c) {
      if (c.estado === 'liquidado') {
        // Check if liquidated after this month
        var pagosC = pagos.filter(function(p) { return p.creditoId === c.id && p.fecha && p.fecha <= fechaFinMes && !p.reversado; });
        var totalCapPag = pagosC.reduce(function(s, p) { return s + (p.capital || 0); }, 0);
        var saldoMes = Math.max(c.monto - totalCapPag, 0);
        if (saldoMes <= 0.01) return;
        // Still had balance, calc provision
        var diasMoraMes = 0;
        var amort = c.amortizacion || [];
        for (var i = 0; i < amort.length; i++) {
          if (!amort[i].pagado && amort[i].fecha && amort[i].fecha <= fechaFinMes) {
            var dd = Math.floor((new Date(fechaFinMes) - new Date(amort[i].fecha)) / 86400000);
            if (dd > diasMoraMes) diasMoraMes = dd;
          }
        }
        provMes += calcProvisionCNBV(saldoMes, diasMoraMes);
        return;
      }
      if (!c.fechaInicio || c.fechaInicio > fechaFinMes) return;
      // Reconstruir saldo al fin del mes
      var pagosC = pagos.filter(function(p) { return p.creditoId === c.id && p.fecha && p.fecha <= fechaFinMes && !p.reversado; });
      var totalCapPag = pagosC.reduce(function(s, p) { return s + (p.capital || 0); }, 0);
      var saldoMes = Math.max(c.monto - totalCapPag, 0);
      if (saldoMes <= 0.01) return;
      // Calcular días de mora al fin de ese mes
      var diasMoraMes = 0;
      var amort = c.amortizacion || [];
      for (var i = 0; i < amort.length; i++) {
        if (!amort[i].pagado && amort[i].fecha && amort[i].fecha <= fechaFinMes) {
          var dd = Math.floor((new Date(fechaFinMes) - new Date(amort[i].fecha)) / 86400000);
          if (dd > diasMoraMes) diasMoraMes = dd;
        }
      }
      provMes += calcProvisionCNBV(saldoMes, diasMoraMes);
    });
    periodos[k].provisiones = provMes;
  });

  // Ordenar y calcular totales
  var mesesOrdenados = Object.keys(periodos).sort();
  var resultado = mesesOrdenados.map(function(k) {
    var p = periodos[k];
    var totalIngresos = p.interes + p.comision + p.moratorio;
    var totalEgresos = p.costoFondeo + p.provisiones;
    var utilidadBruta = totalIngresos - totalEgresos;
    var margen = totalIngresos > 0 ? (utilidadBruta / totalIngresos * 100) : 0;
    var mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var parts = k.split('-');
    var label = mNames[parseInt(parts[1]) - 1] + ' ' + parts[0];
    return {
      key: k,
      label: label,
      interes: p.interes,
      comision: p.comision,
      moratorio: p.moratorio,
      totalIngresos: totalIngresos,
      costoFondeo: p.costoFondeo,
      provisiones: p.provisiones,
      totalEgresos: totalEgresos,
      utilidadBruta: utilidadBruta,
      margen: margen
    };
  });

  return resultado;
}

function renderReporteResultados() {
  var periodo = parseInt(document.getElementById('resultadosPeriodo').value);
  var data = calcularEstadoResultados(periodo === 0 ? 0 : periodo === -1 ? -1 : periodo);

  // Totales
  var totInteres = data.reduce(function(s, d) { return s + d.interes; }, 0);
  var totComision = data.reduce(function(s, d) { return s + d.comision; }, 0);
  var totMoratorio = data.reduce(function(s, d) { return s + d.moratorio; }, 0);
  var totIngresos = data.reduce(function(s, d) { return s + d.totalIngresos; }, 0);
  var totCostoFondeo = data.reduce(function(s, d) { return s + d.costoFondeo; }, 0);
  var totProvisiones = data.reduce(function(s, d) { return s + d.provisiones; }, 0);
  var totEgresos = totCostoFondeo + totProvisiones;
  var totUtilidad = totIngresos - totEgresos;
  var margenGlobal = totIngresos > 0 ? (totUtilidad / totIngresos * 100) : 0;

  // Ratios de rentabilidad
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var carteraTotal = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.saldo; }, 0);
  var saldoFondeos = fondeos.reduce(function(s, f) { return s + (f.estado !== 'liquidado' ? f.saldo || 0 : 0); }, 0);
  var capitalPropio = carteraTotal - saldoFondeos;

  var roaAnual = carteraTotal > 0 ? (totUtilidad * 12 / data.length / carteraTotal * 100) : 0;
  var roeAnual = capitalPropio > 0 ? (totUtilidad * 12 / data.length / capitalPropio * 100) : 0;
  var eficiencia = totIngresos > 0 ? (totEgresos / totIngresos * 100) : 0;
  var spreadNeto = 0;
  if (carteraTotal > 0 && saldoFondeos > 0) {
    var yieldAnual = totInteres * 12 / data.length / carteraTotal * 100;
    var costoAnual = totCostoFondeo * 12 / data.length / saldoFondeos * 100;
    spreadNeto = yieldAnual - costoAnual;
  }

  // KPIs principales
  document.getElementById('rptResultadosKpis').innerHTML =
    '<div class="kpi-card green"><div class="kpi-label">Total Ingresos</div><div class="kpi-value">' + fmt(totIngresos) + '</div><div class="kpi-sub">Intereses + Comisiones + Moratorios</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">Total Egresos</div><div class="kpi-value">' + fmt(totEgresos) + '</div><div class="kpi-sub">Costo Fondeo + Provisiones</div></div>' +
    '<div class="kpi-card ' + (totUtilidad >= 0 ? 'navy' : 'red') + '"><div class="kpi-label">Utilidad Bruta</div><div class="kpi-value">' + fmt(totUtilidad) + '</div><div class="kpi-sub">' + (totUtilidad >= 0 ? 'Rentable' : 'En pérdida') + '</div></div>' +
    '<div class="kpi-card ' + (margenGlobal >= 40 ? 'green' : margenGlobal >= 20 ? 'yellow' : 'red') + '"><div class="kpi-label">Margen Bruto</div><div class="kpi-value">' + margenGlobal.toFixed(1) + '%</div><div class="kpi-sub">' + (margenGlobal >= 40 ? 'Excelente' : margenGlobal >= 20 ? 'Aceptable' : 'Bajo') + '</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Ingreso Promedio/Mes</div><div class="kpi-value">' + fmt(data.length > 0 ? totIngresos / data.length : 0) + '</div></div>' +
    '<div class="kpi-card orange"><div class="kpi-label">Utilidad Prom./Mes</div><div class="kpi-value">' + fmt(data.length > 0 ? totUtilidad / data.length : 0) + '</div></div>';

  // Tabla detallada
  document.getElementById('tbResultados').innerHTML = data.map(function(d) {
    var margenColor = d.margen >= 40 ? 'color:var(--green)' : d.margen >= 20 ? 'color:var(--orange)' : 'color:var(--red)';
    var utilColor = d.utilidadBruta >= 0 ? '' : 'color:var(--red);font-weight:700';
    return '<tr>' +
      '<td><strong>' + esc(d.label) + '</strong></td>' +
      '<td>' + fmt(d.interes) + '</td>' +
      '<td>' + fmt(d.comision) + '</td>' +
      '<td>' + fmt(d.moratorio) + '</td>' +
      '<td style="font-weight:600;color:var(--green)">' + fmt(d.totalIngresos) + '</td>' +
      '<td style="color:var(--red)">' + fmt(d.costoFondeo) + '</td>' +
      '<td style="color:var(--red)">' + fmt(d.provisiones) + '</td>' +
      '<td style="font-weight:600;' + utilColor + '">' + fmt(d.utilidadBruta) + '</td>' +
      '<td style="' + margenColor + ';font-weight:600">' + d.margen.toFixed(1) + '%</td>' +
      '</tr>';
  }).join('');

  // Fila de totales
  document.getElementById('tfResultados').innerHTML =
    '<tr style="font-weight:700;background:var(--light-bg)">' +
    '<td>TOTAL</td>' +
    '<td>' + fmt(totInteres) + '</td>' +
    '<td>' + fmt(totComision) + '</td>' +
    '<td>' + fmt(totMoratorio) + '</td>' +
    '<td style="color:var(--green)">' + fmt(totIngresos) + '</td>' +
    '<td style="color:var(--red)">' + fmt(totCostoFondeo) + '</td>' +
    '<td style="color:var(--red)">' + fmt(totProvisiones) + '</td>' +
    '<td style="' + (totUtilidad >= 0 ? '' : 'color:var(--red)') + '">' + fmt(totUtilidad) + '</td>' +
    '<td>' + margenGlobal.toFixed(1) + '%</td>' +
    '</tr>';

  // Ratios de rentabilidad
  document.getElementById('rptRatios').innerHTML =
    '<div class="kpi-card ' + (roeAnual > 15 ? 'green' : roeAnual > 8 ? 'yellow' : 'red') + '"><div class="kpi-label">ROE (anualizado)</div><div class="kpi-value">' + roeAnual.toFixed(2) + '%</div><div class="kpi-sub">Retorno sobre Capital</div></div>' +
    '<div class="kpi-card ' + (roaAnual > 3 ? 'green' : roaAnual > 1.5 ? 'yellow' : 'red') + '"><div class="kpi-label">ROA (anualizado)</div><div class="kpi-value">' + roaAnual.toFixed(2) + '%</div><div class="kpi-sub">Retorno sobre Activos</div></div>' +
    '<div class="kpi-card ' + (spreadNeto > 5 ? 'green' : spreadNeto > 2 ? 'yellow' : 'red') + '"><div class="kpi-label">Spread Neto</div><div class="kpi-value">' + spreadNeto.toFixed(2) + '%</div><div class="kpi-sub">Yield Cartera - Costo Fondeo</div></div>' +
    '<div class="kpi-card ' + (eficiencia < 50 ? 'green' : eficiencia < 70 ? 'yellow' : 'red') + '"><div class="kpi-label">Índice Eficiencia</div><div class="kpi-value">' + eficiencia.toFixed(1) + '%</div><div class="kpi-sub">' + (eficiencia < 50 ? 'Eficiente' : eficiencia < 70 ? 'Aceptable' : 'Mejorable') + '</div></div>' +
    '<div class="kpi-card navy"><div class="kpi-label">Capital Propio</div><div class="kpi-value">' + fmt(capitalPropio) + '</div><div class="kpi-sub">Cartera - Fondeos</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Apalancamiento</div><div class="kpi-value">' + (capitalPropio > 0 ? (saldoFondeos / capitalPropio).toFixed(2) : '∞') + 'x</div><div class="kpi-sub">Fondeos / Capital</div></div>';

  // Chart 1: Ingresos vs Egresos (barras)
  if (chartResultados) chartResultados.destroy();
  chartResultados = new Chart(document.getElementById('chartResultados'), {
    type: 'bar',
    data: {
      labels: data.map(function(d) { return d.label; }),
      datasets: [
        { label: 'Intereses', data: data.map(function(d) { return d.interes; }), backgroundColor: '#0D9F6E', borderRadius: 2, stack: 'ingresos' },
        { label: 'Comisiones', data: data.map(function(d) { return d.comision; }), backgroundColor: '#3B82F6', borderRadius: 2, stack: 'ingresos' },
        { label: 'Moratorios', data: data.map(function(d) { return d.moratorio; }), backgroundColor: '#F59E0B', borderRadius: 2, stack: 'ingresos' },
        { label: 'Costo Fondeo', data: data.map(function(d) { return -d.costoFondeo; }), backgroundColor: '#C8102E', borderRadius: 2, stack: 'egresos' },
        { label: 'Provisiones', data: data.map(function(d) { return -d.provisiones; }), backgroundColor: '#9CA3AF', borderRadius: 2, stack: 'egresos' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Ingresos vs Egresos por Período' }, legend: { position: 'bottom' },
        tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmt(Math.abs(ctx.raw)); } } }
      },
      scales: { y: { ticks: { callback: function(v) { return fmt(Math.abs(v)); } } } }
    }
  });

  // Chart 2: Margen bruto (línea)
  if (chartMargen) chartMargen.destroy();
  chartMargen = new Chart(document.getElementById('chartMargen'), {
    type: 'line',
    data: {
      labels: data.map(function(d) { return d.label; }),
      datasets: [
        {
          label: 'Margen Bruto %',
          data: data.map(function(d) { return d.margen; }),
          borderColor: '#1E3050',
          backgroundColor: 'rgba(30,48,80,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: data.map(function(d) { return d.margen >= 40 ? '#0D9F6E' : d.margen >= 20 ? '#F59E0B' : '#C8102E'; }),
          borderWidth: 2
        },
        {
          label: 'Utilidad Bruta',
          data: data.map(function(d) { return d.utilidadBruta; }),
          borderColor: '#0D9F6E',
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          borderWidth: 1.5,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Margen Bruto y Utilidad' }, legend: { position: 'bottom' } },
      scales: {
        y: { title: { display: true, text: 'Margen %' }, ticks: { callback: function(v) { return v.toFixed(0) + '%'; } } },
        y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'Utilidad' }, ticks: { callback: function(v) { return fmt(v); } } }
      }
    }
  });
}
