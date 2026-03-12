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

function setReporteTab(tab) {
  ['reporteCartera','reporteMorosidad','reporteColocacion','reporteFlujo','reporteResultados','reporteGarantias','reporteRiesgo','reporteAlertas','reporteSemaforo','reporteEjecutivo'].forEach(function(id) {
    document.getElementById(id).style.display = 'none';
  });
  document.querySelectorAll('#page-reportes .tab').forEach(function(t) { t.classList.remove('active'); });
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');
  var tabMap = { cartera: 'reporteCartera', morosidad: 'reporteMorosidad', colocacion: 'reporteColocacion', flujo: 'reporteFlujo', resultados: 'reporteResultados', garantias: 'reporteGarantias', riesgo: 'reporteRiesgo', alertas: 'reporteAlertas', semaforo: 'reporteSemaforo', ejecutivo: 'reporteEjecutivo' };
  document.getElementById(tabMap[tab]).style.display = 'block';
  if (tab === 'cartera') renderReporteCartera();
  else if (tab === 'morosidad') renderReporteMorosidad();
  else if (tab === 'colocacion') renderReporteColocacion();
  else if (tab === 'flujo') renderReporteFlujoEfectivo();
  else if (tab === 'resultados') renderReporteResultados();
  else if (tab === 'garantias') renderReporteGarantias();
  else if (tab === 'riesgo') renderReporteRiesgo();
  else if (tab === 'alertas') renderReporteAlertas();
  else if (tab === 'semaforo') renderReporteSemaforo();
  else if (tab === 'ejecutivo') renderReporteEjecutivo();
}

function renderReporteCartera() {
  var creditos = getStore('creditos');
  var clientes = getStore('clientes');
  var vigentes = creditos.filter(function(c) { return c.estado === 'vigente'; });
  var vencidos = creditos.filter(function(c) { return c.estado === 'vencido'; });
  var liquidados = creditos.filter(function(c) { return c.estado === 'liquidado'; });
  var carteraVigente = vigentes.reduce(function(s, c) { return s + c.saldo; }, 0);
  var carteraVencida = vencidos.reduce(function(s, c) { return s + c.saldo; }, 0);
  var carteraTotal = carteraVigente + carteraVencida;
  var tasaProm = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.tasa; }, 0) / (creditos.length - liquidados.length || 1) * 100;
  var plazoProm = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.plazo; }, 0) / (creditos.length - liquidados.length || 1);

  document.getElementById('rptCarteraKpis').innerHTML =
    '<div class="kpi-card navy"><div class="kpi-label">Cartera Total</div><div class="kpi-value">' + fmt(carteraTotal) + '</div><div class="kpi-sub">' + (vigentes.length + vencidos.length) + ' créditos activos</div></div>' +
    '<div class="kpi-card green"><div class="kpi-label">Cartera Vigente</div><div class="kpi-value">' + fmt(carteraVigente) + '</div><div class="kpi-sub">' + vigentes.length + ' créditos</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">Cartera Vencida</div><div class="kpi-value">' + fmt(carteraVencida) + '</div><div class="kpi-sub">' + vencidos.length + ' créditos</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Índice Morosidad</div><div class="kpi-value">' + (carteraTotal > 0 ? (carteraVencida / carteraTotal * 100).toFixed(2) : 0) + '%</div><div class="kpi-sub">Vencida / Total</div></div>' +
    '<div class="kpi-card orange"><div class="kpi-label">Tasa Promedio</div><div class="kpi-value">' + tasaProm.toFixed(2) + '%</div></div>' +
    '<div class="kpi-card yellow"><div class="kpi-label">Plazo Promedio</div><div class="kpi-value">' + plazoProm.toFixed(1) + 'm</div></div>';

  // Tabla detallada
  var activos = creditos.filter(function(c) { return c.estado !== 'liquidado'; });
  document.getElementById('tbRptCartera').innerHTML = activos.map(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var diasMora = c.diasMora || 0;
    var badgeMora = diasMora === 0 ? 'badge-green' : diasMora <= 30 ? 'badge-yellow' : diasMora <= 90 ? 'badge-orange' : 'badge-red';
    return '<tr><td><strong>' + esc(c.numero) + '</strong></td><td>' + (cli ? esc(cli.nombre) : '-') + '</td>' +
      '<td><span class="badge badge-blue">' + (tipoLabel[c.tipo] || c.tipo) + '</span></td>' +
      '<td>' + fmt(c.monto) + '</td><td>' + fmt(c.saldo) + '</td><td>' + (c.tasa * 100).toFixed(2) + '%</td>' +
      '<td><span class="badge ' + estadoBadge[c.estado] + '">' + c.estado + '</span></td>' +
      '<td><span class="badge ' + badgeMora + '">' + diasMora + ' días</span></td></tr>';
  }).join('');

  // Charts
  if (chartRptTipo) chartRptTipo.destroy();
  if (chartRptEstado) chartRptEstado.destroy();
  var porTipo = {};
  activos.forEach(function(c) { var t = tipoLabel[c.tipo] || c.tipo; porTipo[t] = (porTipo[t] || 0) + c.saldo; });
  chartRptTipo = new Chart(document.getElementById('chartRptTipo'), {
    type: 'doughnut',
    data: { labels: Object.keys(porTipo), datasets: [{ data: Object.values(porTipo), backgroundColor: ['#1E3050','#C8102E','#3B82F6','#F59E0B'], borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cartera por Tipo de Crédito' }, legend: { position: 'bottom' } } }
  });
  chartRptEstado = new Chart(document.getElementById('chartRptEstado'), {
    type: 'doughnut',
    data: { labels: ['Vigente', 'Vencido', 'Liquidado'], datasets: [{ data: [carteraVigente, carteraVencida, liquidados.reduce(function(s,c){return s+c.monto;},0)], backgroundColor: ['#0D9F6E','#C8102E','#9CA3AF'], borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cartera por Estado' }, legend: { position: 'bottom' } } }
  });
}

function renderReporteMorosidad() {
  var creditos = getStore('creditos');
  var clientes = getStore('clientes');
  var morosos = creditos.filter(function(c) { return (c.diasMora || 0) > 0 && c.estado !== 'liquidado'; });
  morosos.sort(function(a, b) { return (b.diasMora || 0) - (a.diasMora || 0); });

  var rango1_30 = morosos.filter(function(c) { return c.diasMora <= 30; });
  var rango31_60 = morosos.filter(function(c) { return c.diasMora > 30 && c.diasMora <= 60; });
  var rango61_90 = morosos.filter(function(c) { return c.diasMora > 60 && c.diasMora <= 90; });
  var rango90plus = morosos.filter(function(c) { return c.diasMora > 90; });

  var saldoMoroso = morosos.reduce(function(s, c) { return s + c.saldo; }, 0);
  var carteraTotal = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.saldo; }, 0);

  document.getElementById('rptMorosidadKpis').innerHTML =
    '<div class="kpi-card red"><div class="kpi-label">Total Cartera Morosa</div><div class="kpi-value">' + fmt(saldoMoroso) + '</div><div class="kpi-sub">' + morosos.length + ' créditos</div></div>' +
    '<div class="kpi-card yellow"><div class="kpi-label">1-30 días</div><div class="kpi-value">' + fmt(rango1_30.reduce(function(s,c){return s+c.saldo;},0)) + '</div><div class="kpi-sub">' + rango1_30.length + ' créditos</div></div>' +
    '<div class="kpi-card orange"><div class="kpi-label">31-60 días</div><div class="kpi-value">' + fmt(rango31_60.reduce(function(s,c){return s+c.saldo;},0)) + '</div><div class="kpi-sub">' + rango31_60.length + ' créditos</div></div>' +
    '<div class="kpi-card red"><div class="kpi-label">61-90 días</div><div class="kpi-value">' + fmt(rango61_90.reduce(function(s,c){return s+c.saldo;},0)) + '</div><div class="kpi-sub">' + rango61_90.length + ' créditos</div></div>' +
    '<div class="kpi-card navy"><div class="kpi-label">>90 días (Irrecuperable)</div><div class="kpi-value">' + fmt(rango90plus.reduce(function(s,c){return s+c.saldo;},0)) + '</div><div class="kpi-sub">' + rango90plus.length + ' créditos</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">% Morosidad</div><div class="kpi-value">' + (carteraTotal > 0 ? (saldoMoroso / carteraTotal * 100).toFixed(2) : 0) + '%</div></div>';

  document.getElementById('tbRptMorosidad').innerHTML = morosos.length === 0 ?
    '<tr><td colspan="8" style="text-align:center;color:#999;padding:20px">Sin créditos morosos. ¡Excelente!</td></tr>' :
    morosos.map(function(c) {
      var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
      var rango = c.diasMora <= 30 ? '1-30' : c.diasMora <= 60 ? '31-60' : c.diasMora <= 90 ? '61-90' : '>90';
      var rangoBadge = c.diasMora <= 30 ? 'badge-yellow' : c.diasMora <= 60 ? 'badge-orange' : 'badge-red';
      var moratorioEst = c.saldo * (c.tasaMora || c.tasa * 1.5) / 360 * c.diasMora;
      return '<tr><td><strong>' + esc(c.numero) + '</strong></td><td>' + (cli ? esc(cli.nombre) : '-') + '</td>' +
        '<td>' + (tipoLabel[c.tipo] || c.tipo) + '</td><td>' + fmt(c.saldo) + '</td><td>' + fmt(c.pago) + '</td>' +
        '<td style="font-weight:600;color:var(--red)">' + c.diasMora + '</td>' +
        '<td><span class="badge ' + rangoBadge + '">' + rango + '</span></td>' +
        '<td style="color:var(--red)">' + fmt(moratorioEst) + '</td></tr>';
    }).join('');
}

function renderReporteColocacion() {
  var creditos = getStore('creditos');
  var colocPorMes = {};
  creditos.forEach(function(c) {
    var mes = c.fechaInicio ? c.fechaInicio.substring(0, 7) : 'N/A';
    if (!colocPorMes[mes]) colocPorMes[mes] = { count: 0, monto: 0, tasaSum: 0, plazoSum: 0, tipos: {} };
    colocPorMes[mes].count++;
    colocPorMes[mes].monto += c.monto;
    colocPorMes[mes].tasaSum += c.tasa * 100;
    colocPorMes[mes].plazoSum += c.plazo;
    var t = tipoLabel[c.tipo] || c.tipo;
    colocPorMes[mes].tipos[t] = (colocPorMes[mes].tipos[t] || 0) + 1;
  });

  var periodos = Object.keys(colocPorMes).sort();
  var totalColocado = creditos.reduce(function(s, c) { return s + c.monto; }, 0);
  var mesActual = new Date().toISOString().substring(0, 7);
  var colocMesActual = colocPorMes[mesActual] ? colocPorMes[mesActual].monto : 0;
  var promMensual = periodos.length > 0 ? totalColocado / periodos.length : 0;

  document.getElementById('rptColocacionKpis').innerHTML =
    '<div class="kpi-card navy"><div class="kpi-label">Total Histórico Colocado</div><div class="kpi-value">' + fmt(totalColocado) + '</div><div class="kpi-sub">' + creditos.length + ' créditos</div></div>' +
    '<div class="kpi-card green"><div class="kpi-label">Colocación Mes Actual</div><div class="kpi-value">' + fmt(colocMesActual) + '</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Promedio Mensual</div><div class="kpi-value">' + fmt(promMensual) + '</div><div class="kpi-sub">' + periodos.length + ' meses</div></div>' +
    '<div class="kpi-card orange"><div class="kpi-label">Total Créditos</div><div class="kpi-value">' + creditos.length + '</div></div>';

  // Tabla
  document.getElementById('tbRptColocacion').innerHTML = periodos.slice().reverse().map(function(mes) {
    var d = colocPorMes[mes];
    var tipoPred = Object.entries(d.tipos).sort(function(a, b) { return b[1] - a[1]; })[0];
    return '<tr><td><strong>' + esc(mes) + '</strong></td><td>' + d.count + '</td><td>' + fmt(d.monto) + '</td>' +
      '<td>' + (d.tasaSum / d.count).toFixed(2) + '%</td><td>' + Math.round(d.plazoSum / d.count) + 'm</td>' +
      '<td><span class="badge badge-blue">' + (tipoPred ? esc(tipoPred[0]) : '-') + '</span></td></tr>';
  }).join('');

  // Chart
  if (chartRptColocacion) chartRptColocacion.destroy();
  var last12 = periodos.slice(-12);
  var mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  chartRptColocacion = new Chart(document.getElementById('chartRptColocacion'), {
    type: 'bar',
    data: {
      labels: last12.map(function(m) { var p = m.split('-'); return p.length === 2 ? mNames[parseInt(p[1])-1] + ' ' + p[0].slice(2) : m; }),
      datasets: [{
        label: 'Monto Colocado',
        data: last12.map(function(m) { return colocPorMes[m].monto; }),
        backgroundColor: '#1E3050', borderRadius: 4
      }, {
        label: 'Créditos',
        data: last12.map(function(m) { return colocPorMes[m].count; }),
        backgroundColor: '#3B82F6', borderRadius: 4, yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Colocación Mensual (últimos 12 meses)' }, legend: { position: 'bottom' } },
      scales: { y: { ticks: { callback: function(v) { return fmt(v); } } }, y1: { position: 'right', grid: { display: false }, title: { display: true, text: '# Créditos' } } }
    }
  });
}

function renderReporteAlertas() {
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var hoy = new Date();
  var alertas = [];

  // Créditos vencidos
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    if ((c.diasMora || 0) > 0) {
      var nivel = c.diasMora > 90 ? 'critico' : c.diasMora > 30 ? 'alto' : 'medio';
      alertas.push({ nivel: nivel, tipo: 'Morosidad', detalle: 'Crédito ' + esc(c.numero) + ' — ' + c.diasMora + ' días de mora — Saldo: ' + fmt(c.saldo), fecha: hoy.toISOString() });
    }
    // Próximo a vencer (30 días)
    if (c.fechaVencimiento) {
      var diasVenc = Math.floor((new Date(c.fechaVencimiento) - hoy) / 86400000);
      if (diasVenc > 0 && diasVenc <= 30 && c.estado === 'vigente') {
        alertas.push({ nivel: 'medio', tipo: 'Vencimiento Próximo', detalle: 'Crédito ' + esc(c.numero) + ' vence en ' + diasVenc + ' días (' + fmtDate(c.fechaVencimiento) + ')', fecha: hoy.toISOString() });
      }
    }
  });

  // Fondeos próximos a vencer
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    if (f.fechaVencimiento) {
      var diasVenc = Math.floor((new Date(f.fechaVencimiento) - hoy) / 86400000);
      if (diasVenc <= 30) {
        var nivel = diasVenc <= 0 ? 'critico' : diasVenc <= 7 ? 'alto' : 'medio';
        alertas.push({ nivel: nivel, tipo: 'Fondeo Vence', detalle: 'Fondeo ' + esc(f.numero) + ' (' + esc(f.fondeador) + ') vence ' + (diasVenc <= 0 ? 'VENCIDO hace ' + Math.abs(diasVenc) + ' días' : 'en ' + diasVenc + ' días') + ' — Saldo: ' + fmt(f.saldo), fecha: hoy.toISOString() });
      }
    }
  });

  // Concentración alta
  var carteraTotal = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.saldo; }, 0);
  if (carteraTotal > 0) {
    var saldosPorCliente = {};
    var clientes = getStore('clientes');
    creditos.forEach(function(c) {
      if (c.estado === 'liquidado') return;
      saldosPorCliente[c.clienteId] = (saldosPorCliente[c.clienteId] || 0) + c.saldo;
    });
    Object.entries(saldosPorCliente).forEach(function(e) {
      var pct = e[1] / carteraTotal * 100;
      if (pct > 25) {
        var cli = clientes.find(function(cl) { return cl.id === parseInt(e[0]); });
        alertas.push({ nivel: 'alto', tipo: 'Concentración', detalle: 'Cliente ' + (cli ? esc(cli.nombre) : e[0]) + ' concentra ' + pct.toFixed(1) + '% de la cartera (' + fmt(e[1]) + ')', fecha: hoy.toISOString() });
      }
    });
  }

  // Sprint H: Alertas de expedientes incompletos y documentos vencidos
  var clientes2 = getStore('clientes');
  clientes2.forEach(function(cl) {
    var tieneCredito = creditos.some(function(c) { return c.clienteId === cl.id && c.estado === 'vigente'; });
    if (!tieneCredito) return;
    var docAlertas = getDocAlertasCliente(cl.id);
    docAlertas.forEach(function(da) {
      alertas.push({ nivel: da.nivel, tipo: 'Expediente', detalle: esc(cl.nombre) + ': ' + da.texto, fecha: hoy.toISOString() });
    });
  });

  // Ordenar: crítico primero
  var nivelOrden = { critico: 0, alto: 1, medio: 2 };
  alertas.sort(function(a, b) { return (nivelOrden[a.nivel] || 3) - (nivelOrden[b.nivel] || 3); });

  var nivelStyles = {
    critico: 'background:#FEE2E2;border-left:4px solid var(--red);color:#991B1B',
    alto: 'background:#FEF3C7;border-left:4px solid var(--orange);color:#92400E',
    medio: 'background:#DBEAFE;border-left:4px solid var(--blue);color:#1E40AF'
  };
  var nivelLabels = { critico: '🔴 CRÍTICO', alto: '🟠 ALTO', medio: '🔵 MEDIO' };

  document.getElementById('rptAlertasContent').innerHTML = alertas.length === 0 ?
    '<div class="empty-state" style="padding:40px;text-align:center"><h3 style="color:var(--green)">✅ Sin alertas activas</h3><p>Todos los indicadores están dentro de parámetros normales.</p></div>' :
    '<p style="color:var(--gray-400);margin-bottom:12px">' + alertas.length + ' alerta(s) activa(s)</p>' +
    alertas.map(function(a) {
      return '<div style="' + nivelStyles[a.nivel] + ';padding:12px 16px;border-radius:8px;margin-bottom:8px">' +
        '<strong>' + nivelLabels[a.nivel] + '</strong> — <span style="font-weight:600">' + a.tipo + '</span>: ' + a.detalle + '</div>';
    }).join('');
}

function renderReporteEjecutivo() {
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var pagos = getStore('pagos');
  var clientes = getStore('clientes');
  var v = calcularValuacion();
  var hoy = new Date();
  var hoyStr = hoy.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  var vigentes = creditos.filter(function(c) { return c.estado === 'vigente'; });
  var vencidos = creditos.filter(function(c) { return c.estado === 'vencido'; });
  var liquidados = creditos.filter(function(c) { return c.estado === 'liquidado'; });
  var saldoVig = vigentes.reduce(function(s, c) { return s + (c.saldo || 0); }, 0);
  var saldoVenc = vencidos.reduce(function(s, c) { return s + (c.saldo || 0); }, 0);
  var morosidad = (saldoVig + saldoVenc) > 0 ? (saldoVenc / (saldoVig + saldoVenc) * 100) : 0;
  var fondeoVig = fondeos.filter(function(f) { return f.estado === 'vigente'; });
  var saldoFondeo = fondeoVig.reduce(function(s, f) { return s + (f.saldo || 0); }, 0);

  // Ingresos últimos 3 meses
  var hace3m = new Date(); hace3m.setMonth(hace3m.getMonth() - 3);
  var pagos3m = pagos.filter(function(p) { return new Date(p.fecha) >= hace3m; });
  var ingreso3m = pagos3m.reduce(function(s, p) { return s + (p.interes || 0); }, 0);
  var cobrado3m = pagos3m.reduce(function(s, p) { return s + (p.monto || 0); }, 0);

  // Reestructurados
  var reestructurados = creditos.filter(function(c) { return c.reestructurado; }).length;

  // Semáforo resumen
  var semRojo = 0, semAmarillo = 0, semVerde = 0;
  vigentes.concat(vencidos).forEach(function(c) {
    var ev = evaluarSemaforoCredito(c);
    if (ev.semaforo === 'rojo') semRojo++;
    else if (ev.semaforo === 'amarillo') semAmarillo++;
    else semVerde++;
  });

  var html = '<div style="text-align:center;margin-bottom:16px;padding:16px;background:linear-gradient(135deg,var(--navy),#2563EB);border-radius:12px;color:white">';
  html += '<h2 style="margin:0;font-size:22px">' + EMPRESA.nombre + '</h2>';
  html += '<p style="margin:4px 0 0;opacity:0.8;font-size:13px">Reporte Ejecutivo — ' + hoyStr + '</p></div>';

  // Fila 1: Indicadores financieros principales
  html += '<div class="kpi-grid" style="margin-bottom:16px">';
  html += '<div class="kpi-card navy"><div class="kpi-label">Valor Empresa</div><div class="kpi-value">' + fmt(v.valorEmpresa) + '</div></div>';
  html += '<div class="kpi-card green"><div class="kpi-label">Cartera Total</div><div class="kpi-value">' + fmt(saldoVig + saldoVenc) + '</div><div class="kpi-sub">' + vigentes.length + ' vigentes / ' + vencidos.length + ' vencidos</div></div>';
  html += '<div class="kpi-card blue"><div class="kpi-label">Fondeo Total</div><div class="kpi-value">' + fmt(saldoFondeo) + '</div><div class="kpi-sub">' + fondeoVig.length + ' líneas activas</div></div>';
  html += '<div class="kpi-card ' + (morosidad > 10 ? 'red' : morosidad > 5 ? 'yellow' : 'green') + '"><div class="kpi-label">Morosidad</div><div class="kpi-value">' + morosidad.toFixed(2) + '%</div><div class="kpi-sub">' + fmt(saldoVenc) + ' vencido</div></div>';
  html += '</div>';

  // Fila 2: Rentabilidad y operación
  html += '<div class="kpi-grid" style="margin-bottom:16px">';
  html += '<div class="kpi-card green"><div class="kpi-label">Yield Cartera</div><div class="kpi-value">' + fmtPct(v.yieldCartera) + '</div></div>';
  html += '<div class="kpi-card orange"><div class="kpi-label">Costo Fondeo</div><div class="kpi-value">' + fmtPct(v.costoFondeo) + '</div></div>';
  html += '<div class="kpi-card blue"><div class="kpi-label">Spread</div><div class="kpi-value">' + fmtPct(v.spread) + '</div></div>';
  html += '<div class="kpi-card green"><div class="kpi-label">Ingreso Int. 3M</div><div class="kpi-value">' + fmt(ingreso3m) + '</div><div class="kpi-sub">Cobrado: ' + fmt(cobrado3m) + '</div></div>';
  html += '</div>';

  // Fila 3: Riesgo y operación
  html += '<div class="kpi-grid" style="margin-bottom:20px">';
  html += '<div class="kpi-card"><div class="kpi-label">Clientes Activos</div><div class="kpi-value">' + new Set(vigentes.map(function(c) { return c.clienteId; })).size + '</div><div class="kpi-sub">de ' + clientes.length + ' totales</div></div>';
  html += '<div class="kpi-card"><div class="kpi-label">Créditos Liquidados</div><div class="kpi-value">' + liquidados.length + '</div></div>';
  html += '<div class="kpi-card" style="border-left:3px solid #8B5CF6"><div class="kpi-label">Reestructurados</div><div class="kpi-value">' + reestructurados + '</div></div>';
  html += '<div class="kpi-card"><div class="kpi-label">Semáforo</div><div class="kpi-value" style="font-size:14px">🔴 ' + semRojo + ' 🟡 ' + semAmarillo + ' 🟢 ' + semVerde + '</div></div>';
  html += '</div>';

  // Gráficas en grid 3 columnas
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">';
  html += '<div class="card"><div class="card-header"><span class="card-title" style="font-size:13px">Composición Cartera</span></div><div style="height:200px;position:relative"><canvas id="chartEjec1"></canvas></div></div>';
  html += '<div class="card"><div class="card-header"><span class="card-title" style="font-size:13px">Cobranza Mensual (6M)</span></div><div style="height:200px;position:relative"><canvas id="chartEjec2"></canvas></div></div>';
  html += '<div class="card"><div class="card-header"><span class="card-title" style="font-size:13px">Semáforo de Riesgo</span></div><div style="height:200px;position:relative"><canvas id="chartEjec3"></canvas></div></div>';
  html += '</div>';

  // Top 5 créditos por saldo
  html += '<div class="card"><div class="card-header"><span class="card-title">Top 5 Créditos por Saldo</span></div>';
  html += '<div class="table-wrapper"><table class="data-table"><thead><tr><th>Crédito</th><th>Cliente</th><th>Saldo</th><th>Tasa</th><th>Mora</th><th>Estado</th></tr></thead><tbody>';
  var top5 = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).sort(function(a, b) { return (b.saldo || 0) - (a.saldo || 0); }).slice(0, 5);
  top5.forEach(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    html += '<tr><td><strong>' + esc(c.numero) + '</strong></td><td>' + (cli ? esc(cli.nombre) : '—') + '</td><td style="text-align:right">' + fmt(c.saldo || 0) + '</td><td style="text-align:center">' + ((c.tasa || 0) * 100).toFixed(1) + '%</td><td style="text-align:center">' + (c.diasMora || 0) + '</td><td><span class="badge badge-' + (c.estado === 'vigente' ? 'green' : 'red') + '">' + c.estado + '</span></td></tr>';
  });
  html += '</tbody></table></div></div>';

  document.getElementById('ejecutivoContent').innerHTML = html;

  // Renderizar las 3 gráficas
  setTimeout(function() {
    // 1. Composición cartera
    if (chartEjec1) chartEjec1.destroy();
    chartEjec1 = new Chart(document.getElementById('chartEjec1').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Vigente', 'Vencida', 'Liquidada'],
        datasets: [{ data: [saldoVig, saldoVenc, liquidados.reduce(function(s,c){return s+c.monto;},0)], backgroundColor: ['#0D9F6E', '#EF4444', '#6B7280'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });

    // 2. Cobranza mensual últimos 6 meses
    if (chartEjec2) chartEjec2.destroy();
    var meses6 = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(); d.setMonth(d.getMonth() - i);
      var mesKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var mesLabel = d.toLocaleDateString('es-MX', { month: 'short' });
      var mesPagos = pagos.filter(function(p) { return p.fecha && p.fecha.startsWith(mesKey); });
      meses6.push({ label: mesLabel, total: mesPagos.reduce(function(s, p) { return s + (p.monto || 0); }, 0), interes: mesPagos.reduce(function(s, p) { return s + (p.interes || 0); }, 0) });
    }
    chartEjec2 = new Chart(document.getElementById('chartEjec2').getContext('2d'), {
      type: 'bar',
      data: {
        labels: meses6.map(function(m) { return m.label; }),
        datasets: [
          { label: 'Capital', data: meses6.map(function(m) { return m.total - m.interes; }), backgroundColor: '#3B82F6', borderRadius: 3 },
          { label: 'Interés', data: meses6.map(function(m) { return m.interes; }), backgroundColor: '#0D9F6E', borderRadius: 3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: function(v) { return (v/1000).toFixed(0) + 'k'; } } } } }
    });

    // 3. Semáforo doughnut
    if (chartEjec3) chartEjec3.destroy();
    chartEjec3 = new Chart(document.getElementById('chartEjec3').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Crítico', 'Precaución', 'Normal'],
        datasets: [{ data: [semRojo, semAmarillo, semVerde], backgroundColor: ['#EF4444', '#F59E0B', '#0D9F6E'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  }, 100);
}

function exportarEjecutivoPDF() {
  var v = calcularValuacion();
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var pagos = getStore('pagos');
  var clientes = getStore('clientes');
  var hoy = new Date();

  var vigentes = creditos.filter(function(c) { return c.estado === 'vigente'; });
  var vencidos = creditos.filter(function(c) { return c.estado === 'vencido'; });
  var saldoVig = vigentes.reduce(function(s, c) { return s + (c.saldo || 0); }, 0);
  var saldoVenc = vencidos.reduce(function(s, c) { return s + (c.saldo || 0); }, 0);
  var morosidad = (saldoVig + saldoVenc) > 0 ? (saldoVenc / (saldoVig + saldoVenc) * 100) : 0;
  var fondeoVig = fondeos.filter(function(f) { return f.estado === 'vigente'; });
  var saldoFondeo = fondeoVig.reduce(function(s, f) { return s + (f.saldo || 0); }, 0);

  var hace3m = new Date(); hace3m.setMonth(hace3m.getMonth() - 3);
  var pagos3m = pagos.filter(function(p) { return new Date(p.fecha) >= hace3m; });
  var ingreso3m = pagos3m.reduce(function(s, p) { return s + (p.interes || 0); }, 0);

  var semRojo = 0, semAmarillo = 0, semVerde = 0;
  vigentes.concat(vencidos).forEach(function(c) {
    var ev = evaluarSemaforoCredito(c);
    if (ev.semaforo === 'rojo') semRojo++;
    else if (ev.semaforo === 'amarillo') semAmarillo++;
    else semVerde++;
  });

  var doc = new jspdf.jsPDF('p', 'mm', 'letter');

  // Header
  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 216, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(EMPRESA.nombre, 14, 14);
  doc.setFontSize(11);
  doc.text('Reporte Ejecutivo — ' + hoy.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }), 14, 22);
  doc.setTextColor(0);

  // KPIs principales
  var y = 38;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Indicadores Financieros', 14, y);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  y += 6;

  var kpis = [
    ['Valor Empresa', fmt(v.valorEmpresa), 'Cartera Vigente', fmt(saldoVig)],
    ['Cartera Vencida', fmt(saldoVenc), 'Fondeo Total', fmt(saldoFondeo)],
    ['Yield Cartera', fmtPct(v.yieldCartera), 'Costo Fondeo', fmtPct(v.costoFondeo)],
    ['Spread', fmtPct(v.spread), 'Morosidad', morosidad.toFixed(2) + '%'],
    ['Ingreso Int. 3M', fmt(ingreso3m), 'Clientes Activos', new Set(vigentes.map(function(c) { return c.clienteId; })).size + '']
  ];

  kpis.forEach(function(row) {
    doc.setFont(undefined, 'bold');
    doc.text(row[0] + ':', 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(row[1], 70, y);
    doc.setFont(undefined, 'bold');
    doc.text(row[2] + ':', 110, y);
    doc.setFont(undefined, 'normal');
    doc.text(row[3], 170, y);
    y += 5;
  });

  // Semáforo
  y += 4;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Semáforo de Cartera', 14, y);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  y += 6;
  doc.setTextColor(220, 38, 38); doc.text('Crítico: ' + semRojo, 14, y);
  doc.setTextColor(217, 119, 6); doc.text('Precaución: ' + semAmarillo, 60, y);
  doc.setTextColor(13, 159, 110); doc.text('Normal: ' + semVerde, 120, y);
  doc.setTextColor(0);

  // Top créditos
  y += 8;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Top 10 Créditos por Saldo', 14, y);
  doc.setFont(undefined, 'normal');
  y += 3;

  var top10 = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).sort(function(a, b) { return (b.saldo || 0) - (a.saldo || 0); }).slice(0, 10);
  var topRows = top10.map(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return [c.numero, cli ? cli.nombre : '—', fmt(c.saldo || 0), ((c.tasa || 0) * 100).toFixed(1) + '%', (c.diasMora || 0) + ' d', c.estado];
  });

  doc.autoTable({
    startY: y, head: [['Crédito', 'Cliente', 'Saldo', 'Tasa', 'Mora', 'Estado']],
    body: topRows, styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 48, 80] }, margin: { left: 14 }
  });

  // Footer
  var pageH = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Confidencial — ' + EMPRESA.nombre + ' — Generado: ' + hoy.toLocaleString('es-MX'), 14, pageH - 10);

  doc.save('Ejecutivo_AP_Fondos_' + hoy.toISOString().split('T')[0] + '.pdf');
  toast('PDF ejecutivo exportado', 'success');
  addAudit('Exportar', 'Reportes', 'Reporte ejecutivo PDF');
}

function exportarReporteCarteraPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');

  // Header
  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Reporte de Cartera', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy, 14, 20);

  var carteraVig = creditos.filter(function(c){return c.estado==='vigente';}).reduce(function(s,c){return s+c.saldo;},0);
  var carteraVenc = creditos.filter(function(c){return c.estado==='vencido';}).reduce(function(s,c){return s+c.saldo;},0);
  doc.setTextColor(30, 48, 80);
  doc.setFontSize(10);
  doc.text('Cartera Total: ' + fmt(carteraVig + carteraVenc) + '   |   Vigente: ' + fmt(carteraVig) + '   |   Vencida: ' + fmt(carteraVenc) + '   |   Morosidad: ' + (carteraVig + carteraVenc > 0 ? (carteraVenc / (carteraVig + carteraVenc) * 100).toFixed(2) : 0) + '%', 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['Número', 'Cliente', 'Tipo', 'Monto', 'Saldo', 'Tasa', 'Plazo', 'Estado', 'Días Mora']],
    body: creditos.map(function(c) {
      var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
      return [c.numero, cli ? cli.nombre : '-', tipoLabel[c.tipo] || c.tipo, fmt(c.monto), fmt(c.saldo), (c.tasa*100).toFixed(2)+'%', c.plazo+'m', c.estado, c.diasMora || 0];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 48, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] }
  });

  doc.save('AP_Reporte_Cartera_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Reporte de cartera PDF generado', 'success');
}

function exportarMorosidadPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var creditos = getStore('creditos').filter(function(c) { return (c.diasMora || 0) > 0 && c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  creditos.sort(function(a, b) { return (b.diasMora || 0) - (a.diasMora || 0); });

  doc.setFillColor(200, 16, 46);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Reporte de Morosidad', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy, 14, 20);

  var totalMoroso = creditos.reduce(function(s,c){return s+c.saldo;},0);
  doc.setTextColor(30, 48, 80);
  doc.setFontSize(10);
  doc.text('Total Cartera Morosa: ' + fmt(totalMoroso) + '   |   ' + creditos.length + ' créditos en mora', 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['Número', 'Cliente', 'Tipo', 'Saldo', 'Pago', 'Días Mora', 'Rango', 'Int. Moratorio Est.']],
    body: creditos.map(function(c) {
      var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
      var rango = c.diasMora <= 30 ? '1-30' : c.diasMora <= 60 ? '31-60' : c.diasMora <= 90 ? '61-90' : '>90';
      var moratorioEst = c.saldo * (c.tasaMora || c.tasa * 1.5) / 360 * c.diasMora;
      return [c.numero, cli ? cli.nombre : '-', tipoLabel[c.tipo] || c.tipo, fmt(c.saldo), fmt(c.pago), c.diasMora, rango, fmt(moratorioEst)];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [200, 16, 46], textColor: 255 },
    alternateRowStyles: { fillColor: [254, 242, 242] }
  });

  doc.save('AP_Reporte_Morosidad_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Reporte de morosidad PDF generado', 'success');
}

function exportarReporteCarteraExcel() {
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  var headers = ['Número', 'Cliente', 'Tipo', 'Monto Original', 'Saldo', 'Tasa %', 'Plazo', 'Periodicidad', 'Estado', 'Días Mora'];
  var data = creditos.map(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return [c.numero, cli ? cli.nombre : '-', tipoLabel[c.tipo] || c.tipo, c.monto, c.saldo, (c.tasa*100).toFixed(2), c.plazo, c.periodicidad, c.estado, c.diasMora || 0];
  });
  exportToExcel(data, headers, 'AP_Reporte_Cartera_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Cartera');
}

function exportarMorosidadExcel() {
  var creditos = getStore('creditos').filter(function(c) { return (c.diasMora || 0) > 0 && c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');
  creditos.sort(function(a, b) { return (b.diasMora || 0) - (a.diasMora || 0); });
  var headers = ['Número', 'Cliente', 'Tipo', 'Saldo', 'Pago', 'Días Mora', 'Rango', 'Int. Moratorio Est.'];
  var data = creditos.map(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var rango = c.diasMora <= 30 ? '1-30' : c.diasMora <= 60 ? '31-60' : c.diasMora <= 90 ? '61-90' : '>90';
    var moratorioEst = c.saldo * (c.tasaMora || c.tasa * 1.5) / 360 * c.diasMora;
    return [c.numero, cli ? cli.nombre : '-', tipoLabel[c.tipo] || c.tipo, c.saldo, c.pago, c.diasMora, rango, moratorioEst];
  });
  exportToExcel(data, headers, 'AP_Reporte_Morosidad_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Morosidad');
}

function exportarColocacionExcel() {
  var creditos = getStore('creditos');
  var colocPorMes = {};
  creditos.forEach(function(c) {
    var mes = c.fechaInicio ? c.fechaInicio.substring(0, 7) : 'N/A';
    if (!colocPorMes[mes]) colocPorMes[mes] = { count: 0, monto: 0, tasaSum: 0, plazoSum: 0 };
    colocPorMes[mes].count++;
    colocPorMes[mes].monto += c.monto;
    colocPorMes[mes].tasaSum += c.tasa * 100;
    colocPorMes[mes].plazoSum += c.plazo;
  });
  var periodos = Object.keys(colocPorMes).sort().reverse();
  var headers = ['Período', 'Créditos Nuevos', 'Monto Colocado', 'Tasa Promedio %', 'Plazo Promedio'];
  var data = periodos.map(function(mes) {
    var d = colocPorMes[mes];
    return [mes, d.count, d.monto, (d.tasaSum / d.count).toFixed(2), Math.round(d.plazoSum / d.count)];
  });
  exportToExcel(data, headers, 'AP_Reporte_Colocacion_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Colocación');
}

function exportarResultadosPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var periodo = parseInt(document.getElementById('resultadosPeriodo').value);
  var data = calcularEstadoResultados(periodo === 0 ? 0 : periodo === -1 ? -1 : periodo);

  var totIngresos = data.reduce(function(s, d) { return s + d.totalIngresos; }, 0);
  var totEgresos = data.reduce(function(s, d) { return s + d.totalEgresos; }, 0);
  var totUtilidad = totIngresos - totEgresos;
  var margen = totIngresos > 0 ? (totUtilidad / totIngresos * 100).toFixed(1) : '0.0';

  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Estado de Resultados', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy + '   |   Período: ' + (periodo === -1 ? 'Histórico completo' : periodo === 0 ? 'Mes actual' : 'Últimos ' + periodo + ' meses'), 14, 20);

  doc.setTextColor(30, 48, 80);
  doc.setFontSize(10);
  doc.text('Ingresos: ' + fmt(totIngresos) + '   |   Egresos: ' + fmt(totEgresos) + '   |   Utilidad: ' + fmt(totUtilidad) + '   |   Margen: ' + margen + '%', 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['Período', 'Int. Cobrados', 'Comisiones', 'Moratorios', 'Total Ingresos', 'Costo Fondeo', 'Provisiones', 'Utilidad Bruta', 'Margen %']],
    body: data.map(function(d) {
      return [d.label, fmt(d.interes), fmt(d.comision), fmt(d.moratorio), fmt(d.totalIngresos), fmt(d.costoFondeo), fmt(d.provisiones), fmt(d.utilidadBruta), d.margen.toFixed(1) + '%'];
    }).concat([['TOTAL', fmt(data.reduce(function(s,d){return s+d.interes;},0)), fmt(data.reduce(function(s,d){return s+d.comision;},0)), fmt(data.reduce(function(s,d){return s+d.moratorio;},0)), fmt(totIngresos), fmt(data.reduce(function(s,d){return s+d.costoFondeo;},0)), fmt(data.reduce(function(s,d){return s+d.provisiones;},0)), fmt(totUtilidad), margen + '%']]),
    styles: { fontSize: 7, cellPadding: 2, halign: 'right' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    headStyles: { fillColor: [30, 48, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell: function(hookData) {
      // Bold last row (totals)
      if (hookData.section === 'body' && hookData.row.index === data.length) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [230, 235, 245];
      }
    }
  });

  doc.save('AP_Estado_Resultados_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Estado de Resultados PDF generado', 'success');
}

function exportarResultadosExcel() {
  var periodo = parseInt(document.getElementById('resultadosPeriodo').value);
  var data = calcularEstadoResultados(periodo === 0 ? 0 : periodo === -1 ? -1 : periodo);
  var headers = ['Período', 'Intereses', 'Comisiones', 'Moratorios', 'Total Ingresos', 'Costo Fondeo', 'Provisiones', 'Utilidad Bruta', 'Margen %'];
  var rows = data.map(function(d) {
    return [d.label, d.interes, d.comision, d.moratorio, d.totalIngresos, d.costoFondeo, d.provisiones, d.utilidadBruta, +d.margen.toFixed(1)];
  });
  exportToExcel(rows, headers, 'AP_Estado_Resultados_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Estado Resultados');
}

function renderReporteGarantias() {
  var garantias = getStore('garantias');
  var creditos = getStore('creditos').filter(function(c) { return c.estado !== 'liquidado'; });
  var clientes = getStore('clientes');

  var totalGarantias = garantias.length;
  var totalValor = garantias.reduce(function(s, g) { return s + g.valor; }, 0);
  var valorVigente = garantias.filter(function(g) { return g.estado === 'vigente'; }).reduce(function(s, g) { return s + g.valor; }, 0);
  var carteraTotal = creditos.reduce(function(s, c) { return s + c.saldo; }, 0);
  var coberturaGlobal = carteraTotal > 0 ? (valorVigente / carteraTotal * 100) : 0;
  var sinGarantia = creditos.filter(function(c) {
    var gars = garantias.filter(function(g) { return g.creditoId === c.id && g.estado === 'vigente'; });
    return gars.length === 0;
  });
  var subColateral = creditos.filter(function(c) {
    var cob = getCoberturaGarantias(c.id);
    return cob.count > 0 && cob.cobertura < 100;
  });

  // Distribución por tipo
  var porTipo = {};
  garantias.forEach(function(g) {
    var t = GARANTIA_TIPOS[g.tipo] || g.tipo;
    if (!porTipo[t]) porTipo[t] = { count: 0, valor: 0 };
    porTipo[t].count++;
    porTipo[t].valor += g.valor;
  });

  document.getElementById('rptGarantiasKpis').innerHTML =
    '<div class="kpi-card navy"><div class="kpi-label">Total Garantías</div><div class="kpi-value">' + totalGarantias + '</div><div class="kpi-sub">Valor: ' + fmt(totalValor) + '</div></div>' +
    '<div class="kpi-card green"><div class="kpi-label">Valor Vigente</div><div class="kpi-value">' + fmt(valorVigente) + '</div><div class="kpi-sub">' + garantias.filter(function(g){return g.estado==='vigente';}).length + ' vigentes</div></div>' +
    '<div class="kpi-card ' + (coberturaGlobal >= 100 ? 'green' : coberturaGlobal >= 50 ? 'yellow' : 'red') + '"><div class="kpi-label">Cobertura Global</div><div class="kpi-value">' + coberturaGlobal.toFixed(1) + '%</div><div class="kpi-sub">Garantías / Cartera</div></div>' +
    '<div class="kpi-card ' + (sinGarantia.length === 0 ? 'green' : 'red') + '"><div class="kpi-label">Sin Garantía</div><div class="kpi-value">' + sinGarantia.length + '</div><div class="kpi-sub">Créditos sin colateral</div></div>' +
    '<div class="kpi-card ' + (subColateral.length === 0 ? 'green' : 'orange') + '"><div class="kpi-label">Sub-colateralizados</div><div class="kpi-value">' + subColateral.length + '</div><div class="kpi-sub">Cobertura < 100%</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-label">Tipos</div><div class="kpi-value">' + Object.keys(porTipo).length + '</div><div class="kpi-sub">' + Object.entries(porTipo).sort(function(a,b){return b[1].valor-a[1].valor;}).slice(0,2).map(function(e){return e[0];}).join(', ') + '</div></div>';

  // Tabla cobertura por crédito
  document.getElementById('tbGarantiasCobertura').innerHTML = creditos.map(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var cob = getCoberturaGarantias(c.id);
    var cobColor = cob.cobertura >= 100 ? 'badge-green' : cob.cobertura >= 50 ? 'badge-yellow' : cob.count === 0 ? 'badge-gray' : 'badge-red';
    var estadoLabel = cob.count === 0 ? 'Sin garantía' : cob.cobertura >= 100 ? 'Adecuada' : 'Insuficiente';
    return '<tr>' +
      '<td><strong>' + esc(c.numero) + '</strong></td>' +
      '<td>' + (cli ? esc(cli.nombre) : '-') + '</td>' +
      '<td>' + fmt(c.saldo) + '</td>' +
      '<td>' + cob.count + ' (' + cob.countVigente + ' vig.)</td>' +
      '<td>' + fmt(cob.vigente) + '</td>' +
      '<td><span class="badge ' + cobColor + '">' + cob.cobertura.toFixed(1) + '%</span></td>' +
      '<td>' + estadoLabel + '</td>' +
      '</tr>';
  }).join('');

  // Tabla detalle de todas las garantías
  document.getElementById('tbGarantiasDetalle').innerHTML = garantias.length === 0 ?
    '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">Sin garantías registradas</td></tr>' :
    garantias.map(function(g) {
      var credito = creditos.find(function(c) { return c.id === g.creditoId; }) || getStore('creditos').find(function(c) { return c.id === g.creditoId; });
      var estadoBadge = g.estado === 'vigente' ? 'badge-green' : g.estado === 'en_tramite' ? 'badge-yellow' : g.estado === 'vencida' ? 'badge-orange' : 'badge-gray';
      return '<tr>' +
        '<td>' + g.id + '</td>' +
        '<td>' + (credito ? esc(credito.numero) : '#' + g.creditoId) + '</td>' +
        '<td><span class="badge badge-blue">' + esc(GARANTIA_TIPOS[g.tipo] || g.tipo) + '</span></td>' +
        '<td>' + esc(g.descripcion) + '</td>' +
        '<td><strong>' + fmt(g.valor) + '</strong></td>' +
        '<td>' + (g.fechaAvaluo ? fmtDate(g.fechaAvaluo) : '-') + '</td>' +
        '<td><span class="badge ' + estadoBadge + '">' + esc(g.estado) + '</span></td>' +
        '</tr>';
    }).join('');
}

function exportarGarantiasPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var garantias = getStore('garantias');
  var creditos = getStore('creditos');

  var totalValor = garantias.reduce(function(s, g) { return s + g.valor; }, 0);
  var carteraTotal = creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) { return s + c.saldo; }, 0);
  var cobGlobal = carteraTotal > 0 ? (totalValor / carteraTotal * 100).toFixed(1) : '0.0';

  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Reporte de Garantías', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy, 14, 20);

  doc.setTextColor(30, 48, 80);
  doc.setFontSize(10);
  doc.text('Total Garantías: ' + garantias.length + '   |   Valor Total: ' + fmt(totalValor) + '   |   Cobertura Global: ' + cobGlobal + '%', 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['ID', 'Crédito', 'Tipo', 'Descripción', 'Valor Avalúo', 'Fecha', 'Estado']],
    body: garantias.map(function(g) {
      var c = creditos.find(function(cr) { return cr.id === g.creditoId; });
      return [g.id, c ? c.numero : '-', GARANTIA_TIPOS[g.tipo] || g.tipo, g.descripcion, fmt(g.valor), g.fechaAvaluo || '-', g.estado];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 48, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 3: { cellWidth: 80 } }
  });

  doc.save('AP_Reporte_Garantias_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Reporte de garantías PDF generado', 'success');
}

function exportarGarantiasExcel() {
  var garantias = getStore('garantias');
  var creditos = getStore('creditos');
  var headers = ['ID', 'Crédito', 'Tipo', 'Descripción', 'Valor Avalúo', 'Fecha Avalúo', 'Ubicación', 'Documento', 'Estado'];
  var data = garantias.map(function(g) {
    var c = creditos.find(function(cr) { return cr.id === g.creditoId; });
    return [g.id, c ? c.numero : '-', GARANTIA_TIPOS[g.tipo] || g.tipo, g.descripcion, g.valor, g.fechaAvaluo || '', g.ubicacion || '', g.documento || '', g.estado];
  });
  exportToExcel(data, headers, 'AP_Reporte_Garantias_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Garantías');
}

function exportarColocacionPDF() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('l');
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  var creditos = getStore('creditos');
  var colocPorMes = {};
  creditos.forEach(function(c) {
    var mes = c.fechaInicio ? c.fechaInicio.substring(0, 7) : 'N/A';
    if (!colocPorMes[mes]) colocPorMes[mes] = { count: 0, monto: 0, tasaSum: 0, plazoSum: 0, tipos: {} };
    colocPorMes[mes].count++;
    colocPorMes[mes].monto += c.monto;
    colocPorMes[mes].tasaSum += c.tasa * 100;
    colocPorMes[mes].plazoSum += c.plazo;
    var t = tipoLabel[c.tipo] || c.tipo;
    colocPorMes[mes].tipos[t] = (colocPorMes[mes].tipos[t] || 0) + 1;
  });
  var periodos = Object.keys(colocPorMes).sort().reverse();
  var totalColocado = creditos.reduce(function(s, c) { return s + c.monto; }, 0);

  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(EMPRESA.nombre + ' — Reporte de Colocación', 14, 12);
  doc.setFontSize(9);
  doc.text('Generado: ' + hoy, 14, 20);

  doc.setTextColor(30, 48, 80);
  doc.setFontSize(10);
  doc.text('Total Histórico: ' + fmt(totalColocado) + '   |   ' + creditos.length + ' créditos   |   ' + periodos.length + ' períodos', 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['Período', 'Créditos', 'Monto Colocado', 'Tasa Prom.', 'Plazo Prom.', 'Tipo Predominante']],
    body: periodos.map(function(mes) {
      var d = colocPorMes[mes];
      var tipoPred = Object.entries(d.tipos).sort(function(a, b) { return b[1] - a[1]; })[0];
      return [mes, d.count, fmt(d.monto), (d.tasaSum / d.count).toFixed(2) + '%', Math.round(d.plazoSum / d.count) + 'm', tipoPred ? tipoPred[0] : '-'];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [239, 246, 255] }
  });

  doc.save('AP_Reporte_Colocacion_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Reporte de colocación PDF generado', 'success');
}

