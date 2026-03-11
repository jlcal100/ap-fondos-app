//  FINANCIAL ENGINE
// ============================================================
// tipoCredito: opcional, si es 'arrendamiento' usa interés flat sobre monto total
function calcPago(monto, tasaAnual, plazoMeses, periodicidad, valorResidualPct = 0, tipoCredito = '') {
  const periodos = getPeriodos(plazoMeses, periodicidad);
  const tasaPeriodica = getTasaPeriodica(tasaAnual, periodicidad);
  const vr = monto * (valorResidualPct / 100);

  // ARRENDAMIENTO FINANCIERO: interés flat sobre monto total (no sobre saldo insoluto)
  // Renta = amortización_capital + interés_flat
  // amortización_capital = (monto - VR) / periodos
  // interés_flat = monto * tasa_periódica (constante cada periodo)
  if (tipoCredito === 'arrendamiento') {
    const amortCapital = (monto - vr) / periodos;
    const interesFlat = monto * tasaPeriodica;
    return amortCapital + interesFlat;
  }

  // CRÉDITO ESTÁNDAR: interés sobre saldo insoluto (fórmula francesa)
  const montoFinanciar = monto - vr / Math.pow(1 + tasaPeriodica, periodos);
  if (tasaPeriodica === 0) return montoFinanciar / periodos;
  return montoFinanciar * (tasaPeriodica * Math.pow(1 + tasaPeriodica, periodos)) / (Math.pow(1 + tasaPeriodica, periodos) - 1);
}

function getTasaPeriodica(tasaAnual, periodicidad) {
  switch (periodicidad) {
    case 'quincenal': return tasaAnual / 24;
    case 'semanal': return tasaAnual / 52;
    default: return tasaAnual / 12;
  }
}

function getPeriodos(plazoMeses, periodicidad) {
  switch (periodicidad) {
    case 'quincenal': return plazoMeses * 2;
    case 'semanal': return Math.round(plazoMeses * 52 / 12);
    default: return plazoMeses;
  }
}

function getDiasPeriodo(periodicidad) {
  switch (periodicidad) {
    case 'quincenal': return 15;
    case 'semanal': return 7;
    default: return 30;
  }
}

// Avanzar fecha por periodo evitando el bug de JS Date con días 29-31
// Ej: 31 enero + 1 mes = 28 febrero (no 3 marzo)
function avanzarFechaPeriodo(fecha, periodicidad, diaOriginal) {
  fecha = new Date(fecha);
  if (periodicidad === 'mensual') {
    fecha.setMonth(fecha.getMonth() + 1);
    // Si el día cambió (overflow de mes), ajustar al último día del mes correcto
    if (diaOriginal && fecha.getDate() !== diaOriginal) {
      fecha.setDate(0); // Último día del mes anterior al overflow
    }
  } else if (periodicidad === 'quincenal') {
    fecha.setDate(fecha.getDate() + 15);
  } else {
    fecha.setDate(fecha.getDate() + 7);
  }
  return fecha;
}

// tipoCredito: opcional, si es 'arrendamiento' usa lógica flat
function generarAmortizacion(monto, tasaAnual, plazoMeses, periodicidad, fechaInicio, valorResidualPct = 0, ivaPct = 0, tipoCredito = '') {
  const periodos = getPeriodos(plazoMeses, periodicidad);
  const tasaPeriodica = getTasaPeriodica(tasaAnual, periodicidad);
  const vr = monto * (valorResidualPct / 100);
  const diasPeriodo = getDiasPeriodo(periodicidad);

  let saldo = monto;
  const tabla = [];
  let fecha = new Date(fechaInicio);
  const diaOriginal = fecha.getDate(); // Preservar día original para meses cortos

  // ARRENDAMIENTO FINANCIERO:
  // - Interés FLAT: se calcula sobre el monto total original, NO sobre saldo insoluto
  // - Capital: distribución lineal de (monto - VR) entre todos los periodos
  // - Renta fija: capital_fijo + interés_flat + IVA_interés
  if (tipoCredito === 'arrendamiento') {
    const interesFlat = +(monto * tasaPeriodica).toFixed(2);
    const capitalFijo = +((monto - vr) / periodos).toFixed(2);

    for (let i = 1; i <= periodos; i++) {
      fecha = avanzarFechaPeriodo(fecha, periodicidad, diaOriginal);

      let capital;
      if (i === periodos) {
        // Último pago: ajustar capital para cerrar exacto al VR
        capital = +(saldo - vr).toFixed(2);
      } else {
        capital = capitalFijo;
      }
      const ivaInteres = +(interesFlat * (ivaPct / 100)).toFixed(2);
      const pagoTotal = +(capital + interesFlat + ivaInteres).toFixed(2);
      const saldoFinal = +(saldo - capital).toFixed(2);

      tabla.push({
        numero: i,
        fecha: fecha.toISOString().split('T')[0],
        saldoInicial: Math.max(+saldo.toFixed(2), 0),
        capital: Math.max(capital, 0),
        interes: interesFlat,
        iva: ivaInteres,
        pagoTotal: Math.max(pagoTotal, 0),
        saldoFinal: Math.max(saldoFinal, 0),
        pagado: false
      });
      saldo = saldoFinal;
    }
    return tabla;
  }

  // CRÉDITO ESTÁNDAR: interés sobre saldo insoluto (sistema francés)
  const pago = calcPago(monto, tasaAnual, plazoMeses, periodicidad, valorResidualPct);

  for (let i = 1; i <= periodos; i++) {
    fecha = avanzarFechaPeriodo(fecha, periodicidad, diaOriginal);

    const interes = +(saldo * tasaPeriodica).toFixed(2);
    let capital;
    if (i === periodos) {
      capital = +(saldo - vr).toFixed(2);
    } else {
      capital = +(pago - interes).toFixed(2);
    }
    const ivaInteres = +(interes * (ivaPct / 100)).toFixed(2);
    const pagoTotal = +(capital + interes + ivaInteres).toFixed(2);
    const saldoFinal = +(saldo - capital).toFixed(2);

    tabla.push({
      numero: i,
      fecha: fecha.toISOString().split('T')[0],
      saldoInicial: Math.max(+saldo.toFixed(2), 0),
      capital: Math.max(capital, 0),
      interes: Math.max(interes, 0),
      iva: ivaInteres,
      pagoTotal: Math.max(pagoTotal, 0),
      saldoFinal: Math.max(saldoFinal, 0),
      pagado: false
    });
    saldo = saldoFinal;
  }
  return tabla;
}

function crearCreditoObj(id, numero, clienteId, tipo, monto, tasa, tasaMora, plazo, periodicidad, fechaInicio, vrPct, valorEquipo, comision) {
  const amort = generarAmortizacion(monto, tasa, plazo, periodicidad, fechaInicio, vrPct, 0, tipo);
  const fechaVenc = amort.length > 0 ? amort[amort.length - 1].fecha : fechaInicio;
  return {
    id, numero, clienteId, tipo, monto, saldo: monto, tasa, tasaMoratoria: tasaMora,
    plazo, periodicidad, fechaInicio, fechaVencimiento: fechaVenc,
    pago: calcPago(monto, tasa, plazo, periodicidad, vrPct, tipo),
    estado: 'vigente', diasMora: 0, valorResidual: vrPct, valorEquipo, comision,
    fondeoId: null, notas: '', amortizacion: amort,
    createdAt: new Date().toISOString()
  };
}

// ============================================================
//  CAT — COSTO ANUAL TOTAL (Banxico Circular 21/2009)
// ============================================================
// Calcula el CAT como la TIR anualizada de los flujos del acreditado.
// Metodología: Banxico Circular 21/2009 — base 365 días, fechas exactas.
//
// Flujo 0 = monto recibido neto por el acreditado:
//   montoNeto - comisiónApertura - IVA_comisión - seguro - otros costos iniciales
// Flujos 1..n = pagos totales del acreditado (capital + interés + IVA + seguros + comisiones)
//
// Para S.A. de C.V.: los intereses de préstamos causan IVA al 16%.
// La comisión de apertura también causa IVA.
// Todos estos costos deben incluirse en el CAT conforme a la norma.
//
// Se resuelve: MontoRecibido = Σ(Flujo_j / (1+i)^(dias_j/365))  →  i = CAT
//
// Parámetros:
//   montoNeto:        monto del crédito (principal)
//   tabla:            tabla de amortización (cada fila tiene .fecha, .pagoTotal, .iva)
//   fechaInicio:      fecha de disposición
//   comisionApertura: monto de comisión de apertura (sin IVA)
//   opciones:         { ivaComision, seguro, otrosCostosIniciales, costosRecurrentes[] }
function calcularCAT(montoNeto, tabla, fechaInicio, comisionApertura, opciones) {
  if (!tabla || tabla.length === 0 || montoNeto <= 0) return 0;
  comisionApertura = comisionApertura || 0;
  opciones = opciones || {};

  // Costos iniciales descontados del monto recibido por el acreditado
  var ivaComision = opciones.ivaComision || +(comisionApertura * 0.16).toFixed(2);  // IVA 16% sobre comisión
  var seguroInicial = opciones.seguro || 0;
  var otrosCostos = opciones.otrosCostosIniciales || 0;
  var montoRecibido = montoNeto - comisionApertura - ivaComision - seguroInicial - otrosCostos;
  if (montoRecibido <= 0) return 0;

  var f0 = new Date(fechaInicio);

  // Construir flujos: cada pago total que realiza el acreditado
  // Incluye: capital + interés + IVA sobre interés + seguros periódicos + comisiones
  var flujos = tabla.map(function(r, idx) {
    var fechaPago = new Date(r.fecha);
    var dias = Math.max(1, Math.round((fechaPago - f0) / 86400000));
    // pagoTotal ya incluye IVA si la tabla fue generada con ivaPct > 0
    // Solo agregar IVA si la cuota NO lo trae incluido (iva === 0)
    var montoFlujo = r.pagoTotal;
    if ((r.iva || 0) < 0.01 && r.interes > 0 && opciones.ivaIntereses !== false) {
      // Tabla sin IVA: agregar 16% sobre intereses (Art. 1-A fracc. III LIVA)
      montoFlujo += +(r.interes * 0.16).toFixed(2);
    }
    // Si la tabla YA tiene IVA (r.iva > 0), NO agregar nada extra — ya está en pagoTotal
    // Costos recurrentes (seguro mensual, comisiones periódicas)
    if (opciones.costosRecurrentes && opciones.costosRecurrentes[idx]) {
      montoFlujo += opciones.costosRecurrentes[idx];
    }
    return { dias: dias, monto: montoFlujo };
  });

  // Newton-Raphson para resolver TIR (base 365 días — Banxico Circular 21/2009)
  // f(i) = -montoRecibido + Σ(flujo_j / (1+i)^(dias_j/365)) = 0
  var cat = 0.30; // semilla inicial 30%
  for (var iter = 0; iter < 200; iter++) {
    var fVal = -montoRecibido;
    var fDeriv = 0;
    for (var j = 0; j < flujos.length; j++) {
      var t = flujos[j].dias / 365;
      var denom = Math.pow(1 + cat, t);
      fVal += flujos[j].monto / denom;
      fDeriv -= flujos[j].monto * t / Math.pow(1 + cat, t + 1);
    }
    if (Math.abs(fDeriv) < 1e-14) break;
    var delta = fVal / fDeriv;
    cat -= delta;
    // Limitar a rango razonable
    if (cat < -0.5) cat = 0.01;
    if (cat > 10) cat = 5;
    if (Math.abs(delta) < 1e-10) break;
  }
  return Math.max(0, cat); // retorna como decimal (0.35 = 35%)
}

// ============================================================
//  MEJORA 6: CÁLCULO REAL DE INTERESES DEVENGADOS (DÍA A DÍA)
// ============================================================
// Calcula intereses devengados reales de un crédito desde la última fecha de corte
// Usa la tabla de amortización para determinar periodos vencidos no pagados
// y calcula intereses acumulados entre la fecha de referencia y hoy
function calcInteresDevengadoReal(credito, allPagos) {
  if (!credito || credito.estado === 'liquidado' || credito.estado === 'castigado') return 0;
  var hoy = new Date();
  var saldo = credito.saldoActual || credito.saldo || credito.monto;
  var tasa = credito.tasa || 0; // decimal: 0.24 para 24%
  if (tasa <= 0 || saldo <= 0) return 0;

  // Buscar pagos del crédito ordenados por fecha
  var pagosC = (allPagos || getStore('pagos')).filter(function(p) { return p.creditoId === credito.id; });
  pagosC.sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
  var ultimoPago = pagosC.length > 0 ? pagosC[pagosC.length - 1] : null;

  // Fecha de referencia: último pago o fecha de inicio del crédito
  var fechaRef = ultimoPago ? new Date(ultimoPago.fecha) : new Date(credito.fechaInicio);
  if (isNaN(fechaRef.getTime())) fechaRef = new Date(credito.fechaInicio);
  if (isNaN(fechaRef.getTime())) return 0;

  // Días transcurridos desde la referencia
  var diasDesde = Math.max(0, Math.floor((hoy - fechaRef) / 86400000));
  if (diasDesde === 0) return 0;

  // Método mejorado: Si hay amortización, usar periodos vencidos no pagados
  var intDevengado = 0;
  var amort = credito.amortizacion;
  if (amort && amort.length > 0) {
    // Sumar intereses de periodos vencidos no pagados
    var intVencidoNoPagado = 0;
    var ultimoPeriodoPagado = 0;
    amort.forEach(function(a) {
      if (a.pagado) { ultimoPeriodoPagado = a.numero || 0; return; }
      var fechaAmort = new Date(a.fecha);
      if (fechaAmort <= hoy) {
        // Periodo vencido no pagado: sumar interés completo del periodo
        intVencidoNoPagado += (a.interes || 0);
      }
    });

    // Interés proporcional del periodo corriente (no vencido aún)
    var periodoActual = amort.find(function(a) {
      return !a.pagado && new Date(a.fecha) > hoy;
    });
    var intProporcional = 0;
    if (periodoActual) {
      // Calcular días desde inicio del periodo hasta hoy
      var idxActual = (periodoActual.numero || 1) - 1; // índice base 0
      var periodoAnterior = idxActual >= 1 ? amort[idxActual - 1] : null; // periodo previo
      var inicioP = periodoAnterior ? new Date(periodoAnterior.fecha) : fechaRef;
      var finP = new Date(periodoActual.fecha);
      var diasPeriodo = Math.max(1, Math.floor((finP - inicioP) / 86400000));
      var diasTranscurridos = Math.max(0, Math.floor((hoy - inicioP) / 86400000));
      intProporcional = (periodoActual.interes || 0) * Math.min(1, diasTranscurridos / diasPeriodo);
    }
    intDevengado = intVencidoNoPagado + intProporcional;
  } else {
    // Sin amortización: cálculo lineal simple (saldo * tasa diaria * días)
    intDevengado = saldo * (tasa / 360) * diasDesde;
  }

  return Math.max(0, +intDevengado.toFixed(2));
}

// ============================================================
//  FIX #6: DEVENGO AUTOMÁTICO DE INTERÉS MORATORIO
// ============================================================
// Calcula el interés moratorio devengado de un crédito con pagos vencidos.
// Tasa moratoria = tasaMoratoria del crédito (o 1.5x tasa ordinaria por defecto)
// Se calcula sobre el capital vencido (parcialidades cuya fecha ya pasó y no se han pagado)
// Resultado: monto de moratorio devengado a la fecha
function calcMoratorioDevengado(credito, allPagos) {
  if (!credito || credito.estado === 'liquidado' || credito.estado === 'castigado') return { monto: 0, saldoVencido: 0, diasMora: 0, detalle: [] };

  var hoy = new Date();
  var tasaMora = credito.tasaMoratoria || (credito.tasa || 0) * 1.5; // Default: 1.5x la tasa ordinaria
  // Protección: si tasaMora > 1 asumir que se pasó como porcentaje entero (36 → 0.36)
  if (tasaMora > 1) tasaMora = tasaMora / 100;
  if (tasaMora <= 0) return { monto: 0, saldoVencido: 0, diasMora: 0, detalle: [] };

  var amort = credito.amortizacion || [];
  if (amort.length === 0) {
    // Sin amortización: usar fecha de vencimiento general
    var fechaVenc = credito.fechaVencimiento ? new Date(credito.fechaVencimiento) : null;
    if (!fechaVenc || fechaVenc >= hoy) return { monto: 0, saldoVencido: 0, diasMora: 0, detalle: [] };
    var diasM = Math.max(0, Math.floor((hoy - fechaVenc) / 86400000));
    var moraMonto = +((credito.saldo || 0) * (tasaMora / 360) * diasM).toFixed(2);
    return { monto: moraMonto, saldoVencido: credito.saldo || 0, diasMora: diasM, detalle: [{ periodo: 0, capital: credito.saldo, dias: diasM, moratorio: moraMonto }] };
  }

  // Pagos ya aplicados como moratorio (evitar doble conteo)
  var pagosCredito = (allPagos || getStore('pagos')).filter(function(p) { return p.creditoId === credito.id; });
  var moratorioYaPagado = pagosCredito.reduce(function(s, p) { return s + (p.moratorio || 0); }, 0);

  // Calcular moratorio periodo por periodo (capital vencido × tasa diaria × días mora)
  var totalMoratorio = 0;
  var totalSaldoVencido = 0;
  var diasMoraMax = 0;
  var detalle = [];

  amort.forEach(function(a) {
    if (a.pagado) return;
    var fechaAmort = new Date(a.fecha);
    if (fechaAmort >= hoy) return; // No vencido aún

    var diasVencido = Math.max(0, Math.floor((hoy - fechaAmort) / 86400000));
    var capitalVencido = a.capital || 0;
    var moraPeriodo = +(capitalVencido * (tasaMora / 360) * diasVencido).toFixed(2);

    totalMoratorio += moraPeriodo;
    totalSaldoVencido += capitalVencido;
    if (diasVencido > diasMoraMax) diasMoraMax = diasVencido;

    detalle.push({
      periodo: a.numero || 0,
      capital: capitalVencido,
      dias: diasVencido,
      moratorio: moraPeriodo,
      fechaVencimiento: a.fecha
    });
  });

  // Descontar moratorio ya pagado
  var moratorioNeto = Math.max(0, +(totalMoratorio - moratorioYaPagado).toFixed(2));

  return {
    monto: moratorioNeto,
    saldoVencido: +totalSaldoVencido.toFixed(2),
    diasMora: diasMoraMax,
    detalle: detalle,
    tasaMoratoria: tasaMora,
    moratorioYaPagado: moratorioYaPagado,
    moratorioBruto: +totalMoratorio.toFixed(2)
  };
}

// Actualiza campos de moratorio en un crédito (para uso en dashboard y reportes)
function actualizarMoratorioCredito(credito, allPagos) {
  var mora = calcMoratorioDevengado(credito, allPagos);
  credito.diasMora = mora.diasMora;
  credito.moratorioDevengado = mora.monto;
  credito.saldoVencido = mora.saldoVencido;
  // Auto-cambiar estado a vencido si hay mora > 0 días y está vigente
  if (mora.diasMora > 0 && credito.estado === 'vigente') {
    credito.estado = 'vencido';
    addAudit('Cambio estado automático', 'Créditos', credito.numero + ': vigente → vencido (' + mora.diasMora + ' días mora, saldo vencido: ' + (mora.saldoVencido || 0).toFixed(2) + ')');
  }
  // Regresar a vigente si ya no tiene mora (se puso al corriente)
  if (mora.diasMora === 0 && credito.estado === 'vencido') {
    credito.estado = 'vigente';
    addAudit('Cambio estado automático', 'Créditos', credito.numero + ': vencido → vigente (mora regularizada)');
  }
  return mora;
}

// ============================================================
//  FIX #7: EFECTIVO CALCULADO (no editable directo)
// ============================================================
// El efectivo disponible se calcula como:
//   + Fondeos recibidos (capital fondeado)
//   + Pagos cobrados (capital + interés + moratorio + comisión)
//   - Créditos desembolsados (monto original)
//   - Gastos operativos registrados en contabilidad
// Ajustes manuales requieren autorización y dejan auditoría
function calcularEfectivoDisponible(creditos, fondeos, pagos) {
  var contab = getStore('contabilidad');

  // Entradas de efectivo
  var fondeoRecibido = fondeos.reduce(function(s, f) {
    return s + (f.monto || 0);
  }, 0);
  var pagosRecibidos = pagos.filter(function(p) { return !p.reversado; }).reduce(function(s, p) {
    return s + (p.monto || 0);
  }, 0);

  // Salidas de efectivo
  var creditosDesembolsados = creditos.reduce(function(s, c) {
    return s + (c.monto || 0);
  }, 0);
  var pagosAFondeos = contab.filter(function(c) {
    return c.tipo === 'pago_fondeo';
  }).reduce(function(s, c) { return s + (c.monto || 0); }, 0);
  var gastos = contab.filter(function(c) {
    return c.tipo === 'gasto' || c.tipo === 'gasto_operativo';
  }).reduce(function(s, c) { return s + (c.monto || 0); }, 0);
  var comisionesAp = contab.filter(function(c) { return c.tipo === 'comision' && c.concepto && c.concepto.indexOf('apertura') >= 0; }).reduce(function(s, c) { return s + (c.monto || 0); }, 0);
  var ivaComisionesAp = contab.filter(function(c) { return c.tipo === 'iva_trasladado' && c.concepto && c.concepto.indexOf('comisión apertura') >= 0; }).reduce(function(s, c) { return s + (c.monto || 0); }, 0);

  return +(fondeoRecibido + pagosRecibidos - creditosDesembolsados + comisionesAp + ivaComisionesAp - pagosAFondeos - gastos).toFixed(2);
}

// Guardar ajuste de efectivo con auditoría (requiere justificación)
function guardarAjusteEfectivo() {
  var ajusteInput = document.getElementById('dashEfectivoAjuste');
  if (!ajusteInput) return;
  var nuevoAjuste = parseFloat((ajusteInput.value || '0').replace(/,/g, '')) || 0;
  var ajusteAnterior = parseFloat(localStorage.getItem('ap_efectivo_ajuste') || '0');
  var razon = (document.getElementById('dashEfectivoRazon') || {}).value || '';

  if (Math.abs(nuevoAjuste - ajusteAnterior) < 0.01) return toast('Sin cambios en el ajuste', 'info');
  if (!razon.trim()) return toast('Debe proporcionar una justificación para el ajuste de efectivo', 'error');

  // Requiere aprobación si el ajuste es grande (> 50,000)
  if (Math.abs(nuevoAjuste - ajusteAnterior) >= 50000 && typeof crearSolicitudAprobacion === 'function') {
    crearSolicitudAprobacion('ajuste_efectivo', { ajusteAnterior: ajusteAnterior, nuevoAjuste: nuevoAjuste, razon: razon }, Math.abs(nuevoAjuste - ajusteAnterior), 'Ajuste de efectivo: ' + fmt(ajusteAnterior) + ' → ' + fmt(nuevoAjuste) + ' — ' + razon);
    toast('Ajuste de efectivo enviado a autorización', 'info');
    return;
  }

  localStorage.setItem('ap_efectivo_ajuste', nuevoAjuste.toString());
  addAudit('Ajuste Efectivo', 'Dashboard', 'Ajuste: ' + fmt(ajusteAnterior) + ' → ' + fmt(nuevoAjuste) + ' — ' + razon, { ajusteAnterior: ajusteAnterior }, { nuevoAjuste: nuevoAjuste });
  toast('Ajuste de efectivo registrado con auditoría', 'success');
  if (typeof renderDashboard === 'function') renderDashboard();
}

// ============================================================
//  VALUATION ENGINE
// ============================================================
function calcularValuacion() {
  const creditos = getStore('creditos');
  const fondeos = getStore('fondeos');
  const pagos = getStore('pagos');
  const hoy = new Date();

  let carteraSimple = 0, carteraArrend = 0, cartNomina = 0, carteraCC = 0;
  let intDevCartera = 0, carteraVigente = 0, carteraVencida = 0;
  let moratorioTotal = 0; // Fix #6: moratorio devengado total

  creditos.forEach(c => {
    if (c.estado === 'liquidado' || c.estado === 'castigado') return;
    const saldo = c.saldo;
    if (c.tipo === 'cuenta_corriente') carteraCC += saldo;
    else if (c.tipo === 'credito_simple') carteraSimple += saldo;
    else if (c.tipo === 'arrendamiento') carteraArrend += saldo;
    else cartNomina += saldo;

    // Interés devengado (cálculo real día a día)
    intDevCartera += calcInteresDevengadoReal(c, pagos);

    // Fix #6: Actualizar moratorio y estado de cada crédito
    var moraInfo = actualizarMoratorioCredito(c, pagos);
    // Solo sumar moratorio como activo si mora < 180 días (prudencia financiera)
    // Créditos con mora > 180 días: moratorio no es recuperable, no inflar activos
    if (moraInfo.diasMora <= 180) {
      moratorioTotal += moraInfo.monto;
    }

    // Vigente vs vencida
    if (c.estado === 'vencido' || c.diasMora > 0) carteraVencida += saldo;
    else carteraVigente += saldo;
  });

  let saldoFondeos = 0, intDevFondeos = 0;
  fondeos.forEach(f => {
    if (f.estado !== 'vigente') return;
    const saldoF = f.esRevolvente ? (f.saldoDispuesto || 0) : f.saldo;
    saldoFondeos += saldoF;
    const diasDesde = Math.max(0, Math.floor((hoy - new Date(f.fechaInicio)) / (1000 * 60 * 60 * 24)));
    // Devengado real: tasa diaria * días desde último corte (sin cap artificial)
    var ultimoPagoF = pagos.filter(function(p) { return p.fondeoId === f.id; });
    var fechaRefF = ultimoPagoF.length > 0 ? new Date(ultimoPagoF[ultimoPagoF.length - 1].fecha) : new Date(f.fechaInicio);
    var diasDevF = Math.max(0, Math.floor((hoy - fechaRefF) / 86400000));
    intDevFondeos += saldoF * (f.tasa / 360) * diasDevF;
  });

  // Fix #7: Efectivo calculado = fondeos recibidos - créditos desembolsados - gastos + pagos recibidos
  // Con respaldo de ajuste manual auditado
  var efectivoCalculado = calcularEfectivoDisponible(creditos, fondeos, pagos);
  var ajusteEfectivo = parseFloat(localStorage.getItem('ap_efectivo_ajuste') || '0');
  const efectivo = efectivoCalculado + ajusteEfectivo;
  const totalActivos = carteraSimple + carteraArrend + cartNomina + carteraCC + intDevCartera + moratorioTotal + efectivo;
  const totalPasivos = saldoFondeos + intDevFondeos;
  const valorEmpresa = totalActivos - totalPasivos;

  // Métricas
  const carteraTotal = carteraSimple + carteraArrend + cartNomina + carteraCC;

  // Bug #14: Yield con cartera promedio del período y días reales
  const interesesCobrados = pagos.reduce((s, p) => s + (p.interes || 0), 0);
  const primerPago = pagos.length > 0 ? pagos.reduce((min, p) => new Date(p.fecha) < new Date(min.fecha) ? p : min, pagos[0]) : null;
  const diasPeriodoReal = primerPago ? Math.max(1, Math.floor((hoy - new Date(primerPago.fecha)) / (1000 * 60 * 60 * 24))) : 30;
  // Aproximar cartera promedio: (cartera actual + suma de montos originales) / 2
  const sumaOriginal = creditos.filter(c => c.estado !== 'liquidado' && c.estado !== 'castigado').reduce((s, c) => s + c.monto, 0);
  const carteraPromedio = (carteraTotal + sumaOriginal) / 2;
  const yieldCartera = carteraPromedio > 0 ? (interesesCobrados / carteraPromedio) * (360 / diasPeriodoReal) : 0;

  // Bug #15: Costo de fondeo con intereses realmente pagados / fondeo promedio
  const interesPagadosFondeos = getStore('contabilidad').filter(c => c.tipo === 'pago_fondeo').reduce((s, c) => s + (c.monto || 0), 0);
  const fondeoPromedio = fondeos.filter(f => f.estado === 'vigente').reduce((s, f) => {
    var montoOriginal = f.monto || 0;
    var saldoActual = f.saldo || f.monto || 0;
    return s + (montoOriginal + saldoActual) / 2;
  }, 0);
  const costoFondeo = fondeoPromedio > 0 ? (interesPagadosFondeos / fondeoPromedio) * (360 / Math.max(diasPeriodoReal, 1)) :
    (saldoFondeos > 0 ? fondeos.filter(f => f.estado === 'vigente').reduce((s, f) => s + f.tasa * (f.saldo || 0), 0) / saldoFondeos : 0);

  const spread = yieldCartera - costoFondeo;
  const morosidad = carteraTotal > 0 ? (carteraVencida / carteraTotal) * 100 : 0;

  return {
    carteraSimple, carteraArrend, cartNomina, carteraTotal,
    intDevCartera, moratorioTotal, efectivo, totalActivos,
    saldoFondeos, intDevFondeos, totalPasivos,
    valorEmpresa, carteraVigente, carteraVencida,
    yieldCartera, costoFondeo, spread, morosidad
  };
}

// ============================================================
//  FORMATTING
// ============================================================
const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);
const fmtPct = n => (n * 100).toFixed(2) + '%';
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '-';
const tipoLabel = { credito_simple: 'Crédito Simple', arrendamiento: 'Arrendamiento', nomina: 'Nómina', cuenta_corriente: 'Cta. Corriente' };
const estadoBadge = { vigente: 'badge-green', vencido: 'badge-red', liquidado: 'badge-gray', castigado: 'badge-red', reestructurado: 'badge-yellow' };
const contaTipoLabel = { ingreso_intereses: 'Ingreso Intereses', ingreso_arrendamiento: 'Ingreso Arrendamiento', pago_recibido: 'Pago Recibido', colocacion: 'Colocación', pago_fondeo: 'Pago Fondeo', comision: 'Comisión', gasto_operativo: 'Gasto Operativo', quita_reestructura: 'Quita Reestructura', reversa_pago: 'Reversa Pago', liquidacion_credito: 'Liquidación Crédito', iva_trasladado: 'IVA Trasladado', devengo_intereses: 'Devengo Intereses', cobro_devengo: 'Cobro Devengo', provision_cartera: 'Provisión Cartera', otro: 'Otro' };

// Catálogo de cuentas contables
const CATALOGO_CUENTAS = {
  // Activos
  '1101': { nombre: 'Caja y Bancos', tipo: 'activo', grupo: 'Activo Circulante' },
  '1201': { nombre: 'Cartera de Crédito Vigente', tipo: 'activo', grupo: 'Activo Circulante' },
  '1202': { nombre: 'Cartera de Crédito Vencida', tipo: 'activo', grupo: 'Activo Circulante' },
  '1203': { nombre: 'Intereses por Cobrar', tipo: 'activo', grupo: 'Activo Circulante' },
  '1204': { nombre: 'Arrendamientos por Cobrar', tipo: 'activo', grupo: 'Activo Circulante' },
  '1205': { nombre: 'Estimación Preventiva para Riesgos Crediticios', tipo: 'activo', grupo: 'Activo Circulante' },
  // Pasivos
  '2101': { nombre: 'Fondeos por Pagar', tipo: 'pasivo', grupo: 'Pasivo Circulante' },
  '2102': { nombre: 'Intereses por Pagar (Fondeos)', tipo: 'pasivo', grupo: 'Pasivo Circulante' },
  '2103': { nombre: 'Proveedores', tipo: 'pasivo', grupo: 'Pasivo Circulante' },
  '2104': { nombre: 'IVA Trasladado por Pagar', tipo: 'pasivo', grupo: 'Pasivo Circulante' },
  // Capital
  '3101': { nombre: 'Capital Social', tipo: 'capital', grupo: 'Capital Contable' },
  '3201': { nombre: 'Resultado del Ejercicio', tipo: 'capital', grupo: 'Capital Contable' },
  '3202': { nombre: 'Resultados de Ejercicios Anteriores', tipo: 'capital', grupo: 'Capital Contable' },
  // Ingresos
  '4101': { nombre: 'Ingresos por Intereses', tipo: 'ingreso', grupo: 'Ingresos' },
  '4102': { nombre: 'Comisiones Cobradas', tipo: 'ingreso', grupo: 'Ingresos' },
  '4103': { nombre: 'Ingresos por Arrendamiento', tipo: 'ingreso', grupo: 'Ingresos' },
  // Gastos
  '5101': { nombre: 'Intereses Pagados (Fondeos)', tipo: 'gasto', grupo: 'Costos Financieros' },
  '5201': { nombre: 'Gastos de Operación', tipo: 'gasto', grupo: 'Gastos Operativos' },
  '5202': { nombre: 'Estimación Preventiva', tipo: 'gasto', grupo: 'Gastos Operativos' }
};

// Mapeo automático de tipo de movimiento a cuentas (partida doble)
const POLIZA_MAP = {
  colocacion:            { debe: '1201', haber: '1101', desc: 'Colocación de crédito' },
  pago_recibido:         { debe: '1101', haber: '1201', desc: 'Pago recibido (capital)' },
  ingreso_intereses:     { debe: '1101', haber: '4101', desc: 'Cobro de intereses' },
  comision:              { debe: '1101', haber: '4102', desc: 'Comisión cobrada' },
  pago_fondeo:           { debe: '2101', haber: '1101', desc: 'Pago a fondeador' },
  gasto_operativo:       { debe: '5201', haber: '1101', desc: 'Gasto operativo' },
  quita_reestructura:    { debe: '5202', haber: '1201', desc: 'Quita por reestructura (estimación preventiva)' },
  reversa_pago:          { debe: '1201', haber: '1101', desc: 'Reversión de pago (restaura cartera)' },
  ingreso_arrendamiento: { debe: '1101', haber: '4103', desc: 'Cobro de renta arrendamiento' },
  liquidacion_credito:   { debe: '5202', haber: '1201', desc: 'Castigo/liquidación de crédito irrecuperable' },
  iva_trasladado:        { debe: '1101', haber: '2104', desc: 'IVA trasladado cobrado sobre intereses' },
  devengo_intereses:     { debe: '1203', haber: '4101', desc: 'Devengo de intereses por cobrar (accrual)' },
  cobro_devengo:         { debe: '1101', haber: '1203', desc: 'Cobro de intereses previamente devengados' },
  provision_cartera:     { debe: '5202', haber: '1205', desc: 'Estimación preventiva para riesgos crediticios' }
};

function getCuentaNombre(codigo) {
  return CATALOGO_CUENTAS[codigo] ? CATALOGO_CUENTAS[codigo].nombre : codigo;
}

// ============================================================
//  NAVIGATION
// ============================================================
function showPage(page) {
  // Mejora 9: Verificar formularios abiertos con cambios sin guardar
  for (var mi = 0; mi < _MODALES_RASTREADOS.length; mi++) {
    var mid = _MODALES_RASTREADOS[mi];
    var mel = document.getElementById(mid);
    if (mel && mel.classList.contains('active') && _checkDirty(mid)) {
      if (!confirm('Tienes un formulario con cambios sin guardar. ¿Seguro que deseas cambiar de página?')) return;
      _forceCloseModal(mid);
      break;
    }
  }
  // Soporte solo puede ver Admin (diagnóstico/errores)
  if (currentUser && currentUser.rol === 'soporte' && page !== 'admin') {
    return toast('Acceso restringido — Solo módulo de Administración disponible para Soporte Técnico', 'error');
  }
  if (!hasPermiso(page, 'ver')) return toast('Sin permiso para acceder a ' + (PERMISOS_MODULOS[page]?.label || page), 'error');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  const titles = { dashboard: 'Dashboard — Valuación Diaria', clientes: 'Expediente de Clientes', creditos: 'Gestión de Créditos', pagos: 'Registro de Pagos', cotizador: 'Cotizador Financiero', fondeos: 'Control de Fondeos', contabilidad: 'Contabilidad', reportes: 'Reportes Avanzados', calendario: 'Calendario de Cobranza', aprobaciones: 'Flujos de Aprobación', conciliacion: 'Conciliación Bancaria', pld: 'PLD/FT — Prevención de Lavado de Dinero (LFPIORPI)', admin: 'Administración' };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  if (page === 'dashboard') renderDashboard();
  else if (page === 'clientes') renderClientes();
  else if (page === 'creditos') renderCreditos();
  else if (page === 'pagos') { populatePagoSelect(); renderAllPagos(); }
  else if (page === 'fondeos') renderFondeos();
  else if (page === 'contabilidad') renderContabilidad();
  else if (page === 'reportes') renderReporteCartera();
  else if (page === 'calendario') renderCalendario();
  else if (page === 'aprobaciones') renderAprobaciones();
  else if (page === 'conciliacion') renderConciliacion();
  else if (page === 'pld') renderPLD();
  else if (page === 'admin') { renderUsuarios(); renderAuditoria(); }
}

// ============================================================
//  DASHBOARD
// ============================================================
let chartCartera, chartIngresosMensual, chartConcentracion, chartVigVenc;
var dashPeriodDays = 0; // 0=hoy, 30, 90, 365, -1=todo

function setDashPeriod(btn, days) {
  document.querySelectorAll('.dash-period').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  dashPeriodDays = days;
  renderDashboard();
}

function getDashPagos() {
  var pagos = getStore('pagos');
  if (dashPeriodDays === 0 || dashPeriodDays === -1) return pagos;
  var desde = new Date();
  desde.setDate(desde.getDate() - dashPeriodDays);
  return pagos.filter(function(p) { return new Date(p.fecha) >= desde; });
}

// Bug #16: Cálculo automático de días mora
function actualizarDiasMora() {
  const hoy = new Date();
  let creditos = getStore('creditos');
  let changed = false;
  creditos = creditos.map(c => {
    if (c.estado === 'liquidado' || c.estado === 'castigado' || c.tipo === 'cuenta_corriente') return c;
    // Buscar el primer pago vencido no pagado en la amortización
    const primerVencido = (c.amortizacion || []).find(a => !a.pagado && new Date(a.fecha) < hoy);
    if (primerVencido) {
      const diasMora = Math.floor((hoy - new Date(primerVencido.fecha)) / (1000 * 60 * 60 * 24));
      if (diasMora !== c.diasMora) {
        c.diasMora = diasMora;
        changed = true;
      }
      // Auto-marcar como vencido si tiene más de 1 día de mora
      if (diasMora > 0 && c.estado === 'vigente') {
        c.estado = 'vencido';
        changed = true;
      }
    } else {
      // Sin pagos vencidos — asegurar 0 días mora
      if (c.diasMora !== 0) {
        c.diasMora = 0;
        changed = true;
      }
      if (c.estado === 'vencido') {
        c.estado = 'vigente';
        changed = true;
      }
    }
    return c;
  });
  if (changed) setStore('creditos', creditos);
}

function renderDashboard() {
  actualizarDiasMora();
  cargarEfectivo();
  const v = calcularValuacion();
  const creditos = getStore('creditos');
  const clientes = getStore('clientes');
  const pagos = getStore('pagos');
  const pagosPeriodo = getDashPagos();
  const fondeos = getStore('fondeos');

  // Métricas adicionales
  const totalColocado = creditos.reduce(function(s, c) { return s + c.monto; }, 0);
  const cobradoPeriodo = pagosPeriodo.reduce(function(s, p) { return s + p.monto; }, 0);
  const interesCobrado = pagosPeriodo.reduce(function(s, p) { return s + (p.interes || 0); }, 0);
  const numClientesActivos = new Set(creditos.filter(function(c) { return c.estado === 'vigente'; }).map(function(c) { return c.clienteId; })).size;

  // Concentración: % del mayor cliente sobre cartera total
  var concentracionMax = 0;
  if (v.carteraTotal > 0) {
    var saldosPorCliente = {};
    creditos.forEach(function(c) {
      if (c.estado !== 'liquidado') saldosPorCliente[c.clienteId] = (saldosPorCliente[c.clienteId] || 0) + c.saldo;
    });
    concentracionMax = Math.max.apply(null, Object.values(saldosPorCliente).concat([0])) / v.carteraTotal * 100;
  }

  // Cobertura fondeo
  var coberturaFondeo = 0;
  var saldoFondeos = fondeos.reduce(function(s, f) { return s + (f.estado !== 'liquidado' ? (f.esRevolvente ? (f.saldoDispuesto || 0) : f.saldo) : 0); }, 0);
  if (saldoFondeos > 0) coberturaFondeo = v.carteraTotal / saldoFondeos * 100;

  // Tasa Promedio Ponderada Activa (cartera colocada)
  var sumTasaActiva = 0, sumSaldoActivo = 0;
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || c.estado === 'castigado') return;
    var saldo = c.saldoActual || c.saldo || 0;
    sumTasaActiva += (c.tasa || 0) * saldo;
    sumSaldoActivo += saldo;
  });
  var tasaPondActiva = sumSaldoActivo > 0 ? (sumTasaActiva / sumSaldoActivo) * 100 : 0;

  // Tasa Promedio Ponderada Pasiva (fondeos)
  var sumTasaPasiva = 0, sumSaldoPasivo = 0;
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    var saldoF = f.esRevolvente ? (f.saldoDispuesto || 0) : (f.saldo || 0);
    sumTasaPasiva += (f.tasa || 0) * saldoF;
    sumSaldoPasivo += saldoF;
  });
  var tasaPondPasiva = sumSaldoPasivo > 0 ? (sumTasaPasiva / sumSaldoPasivo) * 100 : 0;

  // Margen (spread) real ponderado
  var spreadPonderado = tasaPondActiva - tasaPondPasiva;

  // KPIs Fila 1: Financieros principales
  document.getElementById('dashKpis').innerHTML = `
    <div class="kpi-card navy"><div class="kpi-label">Valor de la Empresa</div><div class="kpi-value">${fmt(v.valorEmpresa)}</div><div class="kpi-sub">Activos - Pasivos</div></div>
    <div class="kpi-card green"><div class="kpi-label">Total Activos</div><div class="kpi-value">${fmt(v.totalActivos)}</div><div class="kpi-sub">Cartera + Intereses + Efectivo</div></div>
    <div class="kpi-card red"><div class="kpi-label">Total Pasivos</div><div class="kpi-value">${fmt(v.totalPasivos)}</div><div class="kpi-sub">Fondeos + Int. Devengados</div></div>
    <div class="kpi-card blue"><div class="kpi-label">Yield Cartera</div><div class="kpi-value">${fmtPct(v.yieldCartera)}</div><div class="kpi-sub">Rendimiento anualizado</div></div>
    <div class="kpi-card orange"><div class="kpi-label">Costo Fondeo</div><div class="kpi-value">${fmtPct(v.costoFondeo)}</div><div class="kpi-sub">Costo promedio ponderado</div></div>
    <div class="kpi-card green"><div class="kpi-label">Spread Financiero</div><div class="kpi-value">${fmtPct(v.spread)}</div><div class="kpi-sub">Yield - Costo Fondeo</div></div>
    <div class="kpi-card yellow"><div class="kpi-label">Índice Morosidad</div><div class="kpi-value">${v.morosidad.toFixed(2)}%</div><div class="kpi-sub">Cart. Vencida / Cart. Total</div></div>
    <div class="kpi-card navy"><div class="kpi-label">Cartera Total</div><div class="kpi-value">${fmt(v.carteraTotal)}</div><div class="kpi-sub">${creditos.filter(function(c){return c.estado==='vigente'}).length} créditos vigentes</div></div>
  `;

  // KPIs Fila 2: Operativos
  document.getElementById('dashKpis2').innerHTML = `
    <div class="kpi-card blue"><div class="kpi-label">Cobrado en Periodo</div><div class="kpi-value">${fmt(cobradoPeriodo)}</div><div class="kpi-sub">${pagosPeriodo.length} pagos</div></div>
    <div class="kpi-card green"><div class="kpi-label">Interés Cobrado</div><div class="kpi-value">${fmt(interesCobrado)}</div><div class="kpi-sub">Ingreso financiero</div></div>
    <div class="kpi-card navy"><div class="kpi-label">Clientes Activos</div><div class="kpi-value">${numClientesActivos}</div><div class="kpi-sub">de ${clientes.length} totales</div></div>
    <div class="kpi-card ${concentracionMax > 25 ? 'red' : concentracionMax > 15 ? 'yellow' : 'green'}"><div class="kpi-label">Concentración Máx.</div><div class="kpi-value">${concentracionMax.toFixed(1)}%</div><div class="kpi-sub">${concentracionMax > 25 ? 'Riesgo alto' : concentracionMax > 15 ? 'Moderado' : 'Diversificada'}</div></div>
    <div class="kpi-card ${coberturaFondeo > 120 ? 'green' : coberturaFondeo > 100 ? 'yellow' : 'red'}"><div class="kpi-label">Cobertura Fondeo</div><div class="kpi-value">${coberturaFondeo.toFixed(0)}%</div><div class="kpi-sub">Cartera / Fondeos</div></div>
    <div class="kpi-card green"><div class="kpi-label">Tasa Activa Pond.</div><div class="kpi-value">${tasaPondActiva.toFixed(2)}%</div><div class="kpi-sub">Colocación — ${fmt(sumSaldoActivo)}</div></div>
    <div class="kpi-card red"><div class="kpi-label">Tasa Pasiva Pond.</div><div class="kpi-value">${tasaPondPasiva.toFixed(2)}%</div><div class="kpi-sub">Fondeo — ${fmt(sumSaldoPasivo)}</div></div>
    <div class="kpi-card ${spreadPonderado > 5 ? 'green' : spreadPonderado > 2 ? 'yellow' : 'red'}"><div class="kpi-label">Spread Ponderado</div><div class="kpi-value">${spreadPonderado.toFixed(2)}%</div><div class="kpi-sub">Activa - Pasiva</div></div>
    ${(function() { var ap = getStore('aprobaciones').filter(function(a) { return a.estado === 'pendiente'; }); return ap.length > 0 ? '<div class="kpi-card ' + (ap.length > 3 ? 'red' : 'yellow') + '" style="cursor:pointer" onclick="showPage(\'aprobaciones\')"><div class="kpi-label">Aprobaciones Pend.</div><div class="kpi-value">' + ap.length + '</div><div class="kpi-sub">Por ' + fmt(ap.reduce(function(s, a) { return s + a.monto; }, 0)) + '</div></div>' : ''; })()}
  `;

  // Charts — destruir anteriores
  if (chartCartera) chartCartera.destroy();
  if (chartIngresosMensual) chartIngresosMensual.destroy();
  if (chartConcentracion) chartConcentracion.destroy();
  if (chartVigVenc) chartVigVenc.destroy();

  // 1. Composición de Cartera (dona)
  chartCartera = new Chart(document.getElementById('chartCartera'), {
    type: 'doughnut',
    data: {
      labels: ['Crédito Simple', 'Arrendamiento', 'Nómina'],
      datasets: [{ data: [v.carteraSimple, v.carteraArrend, v.cartNomina], backgroundColor: ['#1E3050', '#C8102E', '#3B82F6'], borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // 2. Ingresos Mensuales (barras — datos REALES de pagos)
  var mesData = {};
  pagos.forEach(function(p) {
    var key = p.fecha ? p.fecha.substring(0, 7) : 'N/A';
    if (!mesData[key]) mesData[key] = { capital: 0, interes: 0, total: 0 };
    mesData[key].capital += p.capital || 0;
    mesData[key].interes += p.interes || 0;
    mesData[key].total += p.monto || 0;
  });
  var meses = Object.keys(mesData).sort().slice(-12);
  var mesLabels = meses.map(function(m) {
    var parts = m.split('-');
    var mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return parts.length === 2 ? mNames[parseInt(parts[1])-1] + ' ' + parts[0].slice(2) : m;
  });
  chartIngresosMensual = new Chart(document.getElementById('chartIngresosMensual'), {
    type: 'bar',
    data: {
      labels: mesLabels,
      datasets: [
        { label: 'Capital', data: meses.map(function(m) { return mesData[m].capital; }), backgroundColor: '#1E3050' },
        { label: 'Interés', data: meses.map(function(m) { return mesData[m].interes; }), backgroundColor: '#0D9F6E' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: function(val) { return fmt(val); } } } }, plugins: { legend: { position: 'bottom' } } }
  });

  // 3. Concentración por Cliente (Top 5)
  var saldoPorCliente = {};
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var nombre = cli ? cli.nombre : 'Desconocido';
    saldoPorCliente[nombre] = (saldoPorCliente[nombre] || 0) + c.saldo;
  });
  var top5 = Object.entries(saldoPorCliente).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);
  var otrosSum = Object.entries(saldoPorCliente).sort(function(a, b) { return b[1] - a[1]; }).slice(5).reduce(function(s, e) { return s + e[1]; }, 0);
  if (otrosSum > 0) top5.push(['Otros', otrosSum]);
  var concColors = ['#1E3050', '#C8102E', '#3B82F6', '#F59E0B', '#0D9F6E', '#9CA3AF'];
  chartConcentracion = new Chart(document.getElementById('chartConcentracion'), {
    type: 'pie',
    data: {
      labels: top5.map(function(e) { return e[0].length > 20 ? e[0].substring(0,18) + '...' : e[0]; }),
      datasets: [{ data: top5.map(function(e) { return e[1]; }), backgroundColor: concColors.slice(0, top5.length), borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });

  // 4. Cartera Vigente vs Vencida (barras horizontal)
  chartVigVenc = new Chart(document.getElementById('chartVigVenc'), {
    type: 'bar',
    data: {
      labels: ['Cartera'],
      datasets: [
        { label: 'Vigente', data: [v.carteraVigente], backgroundColor: '#0D9F6E' },
        { label: 'Vencida', data: [v.carteraVencida], backgroundColor: '#C8102E' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true, ticks: { callback: function(val) { return fmt(val); } } }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } }
  });

  // ===== ALERTAS MEJORADAS =====
  var alertas = [];
  var hoy = new Date();

  // Créditos vencidos
  creditos.forEach(function(c) {
    if (c.estado === 'vencido') alertas.push({ type: 'danger', text: 'Crédito ' + c.numero + ' VENCIDO — Saldo: ' + fmt(c.saldo), priority: 1 });
  });

  // Pagos de amortización atrasados
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || !c.amortizacion) return;
    var atrasados = c.amortizacion.filter(function(a) { return !a.pagado && a.fecha && new Date(a.fecha) < hoy; });
    if (atrasados.length > 0) {
      var dias = Math.floor((hoy - new Date(atrasados[0].fecha)) / 86400000);
      alertas.push({ type: 'danger', text: 'Crédito ' + esc(c.numero) + ': ' + atrasados.length + ' pago(s) atrasado(s), ' + dias + ' días de mora', priority: 2 });
    }
  });

  // Próximos pagos (7 días)
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || !c.amortizacion) return;
    var proximo = c.amortizacion.find(function(a) { if (a.pagado) return false; var d = a.fecha ? Math.floor((new Date(a.fecha) - hoy) / 86400000) : 999; return d >= 0 && d <= 7; });
    if (proximo) alertas.push({ type: 'warning', text: 'Crédito ' + esc(c.numero) + ': pago de ' + fmt(proximo.pago) + ' vence el ' + (proximo.fecha || '-'), priority: 3 });
  });

  // Fondeos por vencer
  fondeos.forEach(function(f) {
    if (f.estado !== 'vigente') return;
    var dias = Math.floor((new Date(f.fechaVencimiento) - hoy) / 86400000);
    if (dias > 0 && dias <= 60) alertas.push({ type: 'info', text: 'Fondeo ' + esc(f.numero) + ' (' + esc(f.fondeador) + ') vence en ' + dias + ' días', priority: 4 });
  });

  // Concentración alta
  if (concentracionMax > 25) alertas.push({ type: 'warning', text: 'Concentración alta: un solo cliente representa el ' + concentracionMax.toFixed(1) + '% de la cartera', priority: 5 });

  // Sprint H: Expedientes incompletos y documentos vencidos
  var cliExpIncompleto = [];
  var docsVencidos = 0;
  clientes.forEach(function(cl) {
    var tieneCredito = creditos.some(function(c) { return c.clienteId === cl.id && c.estado === 'vigente'; });
    if (!tieneCredito) return;
    var expStatus = getExpedienteStatus(cl.id);
    if (expStatus.pct < 100) cliExpIncompleto.push({ nombre: cl.nombre, pct: expStatus.pct });
    var docAlertas = getDocAlertasCliente(cl.id);
    docsVencidos += docAlertas.filter(function(a) { return a.nivel === 'critico'; }).length;
  });
  if (cliExpIncompleto.length > 0) {
    alertas.push({ type: 'warning', text: cliExpIncompleto.length + ' expediente(s) incompleto(s): ' + cliExpIncompleto.slice(0, 3).map(function(c) { return esc(c.nombre) + ' (' + c.pct + '%)'; }).join(', '), priority: 6 });
  }
  if (docsVencidos > 0) {
    alertas.push({ type: 'danger', text: docsVencidos + ' documento(s) vencido(s) requieren renovación urgente', priority: 2 });
  }

  alertas.sort(function(a, b) { return a.priority - b.priority; });
  if (alertas.length === 0) alertas.push({ type: 'info', text: 'Sin alertas pendientes. Todo en orden.' });

  var alertCountEl = document.getElementById('alertCount');
  var urgentes = alertas.filter(function(a) { return a.type === 'danger'; }).length;
  if (alertCountEl) { alertCountEl.textContent = urgentes || alertas.length; alertCountEl.className = 'badge ' + (urgentes > 0 ? 'badge-red' : 'badge-green'); }
  document.getElementById('alertList').innerHTML = alertas.map(function(a) { return '<div class="alert-item ' + a.type + '">' + a.text + '</div>'; }).join('');

  // Valuation detail
  document.getElementById('valuacionDetalle').innerHTML = `
    <table><thead><tr><th colspan="2">ACTIVOS</th><th colspan="2">PASIVOS</th></tr></thead>
    <tbody>
      <tr><td>Cartera Crédito Simple</td><td style="text-align:right">${fmt(v.carteraSimple)}</td><td>Saldo Fondeos</td><td style="text-align:right">${fmt(v.saldoFondeos)}</td></tr>
      <tr><td>Cartera Arrendamiento</td><td style="text-align:right">${fmt(v.carteraArrend)}</td><td>Int. Devengados Fondeos</td><td style="text-align:right">${fmt(v.intDevFondeos)}</td></tr>
      <tr><td>Cartera Nómina</td><td style="text-align:right">${fmt(v.cartNomina)}</td><td><strong>Total Pasivos</strong></td><td style="text-align:right"><strong>${fmt(v.totalPasivos)}</strong></td></tr>
      <tr><td>Intereses Devengados</td><td style="text-align:right">${fmt(v.intDevCartera)}</td><td></td><td></td></tr>
      <tr><td>Efectivo Disponible</td><td style="text-align:right">${fmt(v.efectivo)}</td><td></td><td></td></tr>
      <tr><td><strong>Total Activos</strong></td><td style="text-align:right"><strong>${fmt(v.totalActivos)}</strong></td><td><strong>VALOR EMPRESA</strong></td><td style="text-align:right;color:var(--navy);font-size:18px"><strong>${fmt(v.valorEmpresa)}</strong></td></tr>
    </tbody></table>
  `;

  // Sprint V: Actividad reciente de bitácora
  var actDiv = document.getElementById('dashActividadReciente');
  if (actDiv) actDiv.innerHTML = renderActividadRecienteHTML();
}

// ============================================================
//  CLIENTES
// ============================================================
// === Documentos en modal de cliente ===
var modalPendingFiles = []; // archivos pendientes [{file, dataUrl, tipo, tipoLabel, icon}]
var modalCurrentFiles = []; // files esperando asignación de tipo

function nuevoCliente() {
  document.getElementById('clienteEditId').value = '';
  document.getElementById('modalClienteTitle').textContent = 'Nuevo Cliente';
  clearForm(['cliTipo','cliNombre','cliRFC','cliCURP','cliTel','cliEmail','cliDir','cliCiudad','cliEstado','cliCP','cliIngresos','cliScore','cliSector','cliNotas']);
  modalPendingFiles = [];
  modalCurrentFiles = [];
  renderModalPendingDocs();
  document.getElementById('modalDocTypeSelect').style.display = 'none';
  openModal('modalCliente');
}
function renderClientes() {
  const search = (document.getElementById('searchClientes').value || '').toLowerCase();
  const filterTipo = (document.getElementById('filterTipoCliente') || {}).value || '';
  const allClientes = getStore('clientes').filter(c => {
    if (filterTipo && c.tipo !== filterTipo) return false;
    return c.nombre.toLowerCase().includes(search) || c.rfc.toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search) || (c.telefono || '').includes(search);
  });
  const pg = paginate(allClientes, 'clientes');
  const creditos = getStore('creditos');
  document.getElementById('tbClientes').innerHTML = pg.items.map(c => {
    const numCred = creditos.filter(cr => cr.clienteId === c.id).length;
    const numDocs = getClienteDocCount(c.id);
    return `<tr>
      <td>${c.id}</td><td><strong>${esc(c.nombre)}</strong></td><td>${esc(c.rfc)}</td>
      <td><span class="badge badge-blue">${c.tipo === 'fisica' ? 'Física' : 'Moral'}</span></td>
      <td>${esc(c.telefono)}</td><td>${esc(c.email)}</td><td>${numCred}</td>
      <td>${getExpedienteBadge(c.id)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="verCliente(${c.id})">📋 Expediente</button> <button class="btn btn-outline btn-sm" onclick="editarCliente(${c.id})">✏️ Editar</button> <button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="eliminarCliente(${c.id})">🗑</button></td>
    </tr>`;
  }).join('');
  renderPagination('clientes', pg.total, pg.page, pg.count);
}

function handleModalDocSelect(files) {
  if (!files || files.length === 0) return;
  modalCurrentFiles = Array.from(files);
  document.getElementById('modalDocTypeSelect').style.display = 'block';
  var names = modalCurrentFiles.map(function(f){ return f.name; }).join(', ');
  toast('Archivo(s): ' + names + '. Selecciona el tipo.', 'info');
}

function handleModalDocDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('dragover');
  handleModalDocSelect(event.dataTransfer.files);
}

function assignModalDocType(tipo) {
  if (!modalCurrentFiles.length) return;
  var tipoLabels = {
    contrato: 'Contrato', ine: 'INE / Identificación', csf: 'Constancia de Situación Fiscal',
    estados_financieros: 'Estados Financieros', comprobante_domicilio: 'Comprobante de Domicilio',
    acta_constitutiva: 'Acta Constitutiva', poder_notarial: 'Poder Notarial',
    comprobante_ingresos: 'Comprobante de Ingresos', opiniones_cumplimiento: 'Opinión de Cumplimiento SAT',
    otro: 'Otro Documento'
  };
  var tipoIcons = {
    contrato: '📄', ine: '🪪', csf: '📋', estados_financieros: '📊',
    comprobante_domicilio: '🏠', acta_constitutiva: '📑', poder_notarial: '⚖️',
    comprobante_ingresos: '💰', opiniones_cumplimiento: '📜', otro: '📎'
  };
  modalCurrentFiles.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      modalPendingFiles.push({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        dataUrl: e.target.result,
        tipo: tipo,
        tipoLabel: tipoLabels[tipo] || tipo,
        icon: tipoIcons[tipo] || '📎'
      });
      renderModalPendingDocs();
    };
    reader.readAsDataURL(file);
  });
  toast(modalCurrentFiles.length + ' doc(s) como ' + (tipoLabels[tipo]||tipo), 'success');
  modalCurrentFiles = [];
  document.getElementById('modalDocTypeSelect').style.display = 'none';
  document.getElementById('modalDocFileInput').value = '';
}

function removeModalPendingDoc(idx) {
  modalPendingFiles.splice(idx, 1);
  renderModalPendingDocs();
}

function renderModalPendingDocs() {
  var container = document.getElementById('modalPendingDocs');
  if (!container) return;
  if (modalPendingFiles.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<p style="font-size:12px;color:var(--gray-500);margin-bottom:4px">Documentos a guardar (' + modalPendingFiles.length + '):</p>' +
    modalPendingFiles.map(function(d, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--green-light);border-radius:6px;margin-bottom:4px;font-size:13px">' +
        '<span>' + d.icon + '</span>' +
        '<span style="flex:1"><strong>' + d.fileName + '</strong> <span style="color:var(--gray-400)">(' + d.tipoLabel + ' — ' + formatBytes(d.fileSize) + ')</span></span>' +
        '<button class="btn btn-sm" style="padding:2px 6px;color:var(--red);font-size:14px" onclick="removeModalPendingDoc(' + i + ')">✕</button>' +
      '</div>';
    }).join('');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function guardarCliente() {
  if (!guardSave('cliente')) return;
  const editId_ = document.getElementById('clienteEditId').value;
  if (editId_ && !hasPermiso('clientes', 'editar')) return toast('Sin permiso para editar clientes', 'error');
  if (!editId_ && !hasPermiso('clientes', 'crear')) return toast('Sin permiso para crear clientes', 'error');
  V.clearErrors('modalCliente');
  var editId = document.getElementById('clienteEditId').value;
  var tipo = document.getElementById('cliTipo').value;
  var nombre = document.getElementById('cliNombre').value.trim();
  var rfc = document.getElementById('cliRFC').value.trim().toUpperCase();
  var curp = document.getElementById('cliCURP').value.trim().toUpperCase();
  var telefono = document.getElementById('cliTel').value.trim();
  var email = document.getElementById('cliEmail').value.trim();
  var cp = document.getElementById('cliCP').value.trim();
  var scoreVal = document.getElementById('cliScore').value;

  // Validaciones
  var ok = true;
  ok = V.check('cliNombre', nombre.length >= 3, 'Nombre obligatorio (mín. 3 caracteres)') && ok;
  ok = V.check('cliRFC', V.validRFC(rfc, tipo), tipo === 'moral' ? 'RFC inválido (12 caracteres para P. Moral)' : 'RFC inválido (13 caracteres para P. Física)') && ok;
  ok = V.check('cliCURP', V.validCURP(curp), 'CURP inválido (18 caracteres)') && ok;
  ok = V.check('cliEmail', V.validEmail(email), 'Email inválido') && ok;
  ok = V.check('cliTel', V.validTel(telefono), 'Teléfono inválido') && ok;
  ok = V.check('cliCP', V.validCP(cp), 'C.P. debe tener 5 dígitos') && ok;
  ok = V.check('cliScore', !scoreVal || (parseInt(scoreVal) >= 0 && parseInt(scoreVal) <= 850), 'Score debe estar entre 0 y 850') && ok;

  // Duplicado de RFC
  var excludeId = editId ? parseInt(editId) : -1;
  if (rfc && V.duplicateRFC(rfc, excludeId)) {
    ok = V.check('cliRFC', false, 'Ya existe un cliente con este RFC') && ok;
  }

  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  var cliente = {
    id: editId ? parseInt(editId) : nextId('clientes'),
    tipo: tipo,
    nombre: nombre,
    rfc: rfc,
    curp: curp,
    telefono: telefono,
    email: email,
    direccion: document.getElementById('cliDir').value.trim(),
    ciudad: document.getElementById('cliCiudad').value.trim(),
    estado: document.getElementById('cliEstado').value.trim(),
    cp: cp,
    ingresos: parseMiles('cliIngresos'),
    score: parseInt(document.getElementById('cliScore').value) || 0,
    sector: document.getElementById('cliSector').value.trim(),
    notas: document.getElementById('cliNotas').value.trim()
  };

  var clientes = getStore('clientes');
  if (editId) clientes = clientes.map(function(c){ return c.id === cliente.id ? cliente : c; });
  else clientes.push(cliente);
  setStore('clientes', clientes);
  addAudit(editId ? 'Editar' : 'Crear', 'Clientes', cliente.nombre);

  // Guardar documentos pendientes del modal
  if (modalPendingFiles.length > 0) {
    var docs = getDocStore();
    modalPendingFiles.forEach(function(pd) {
      var newId = docs.length > 0 ? Math.max.apply(null, docs.map(function(d){return d.id;})) + 1 : 1;
      docs.push({
        id: newId,
        clienteId: cliente.id,
        tipo: pd.tipo,
        tipoLabel: pd.tipoLabel,
        icon: pd.icon,
        nombre: pd.fileName,
        tamano: pd.fileSize,
        mimeType: pd.mimeType,
        dataUrl: pd.dataUrl,
        fechaSubida: new Date().toISOString(),
        subidoPor: 'Admin'
      });
    });
    setDocStore(docs);
    addAudit('Subir Doc', 'Documentos', modalPendingFiles.length + ' documento(s) → Cliente ' + cliente.nombre);
    toast(modalPendingFiles.length + ' documento(s) guardado(s)', 'success');
    modalPendingFiles = [];
  }

  _forceCloseModal('modalCliente');
  toast(editId ? 'Cliente actualizado' : 'Cliente creado exitosamente', 'success');
  renderClientes();
  refreshNotifications();
}

function editarCliente(id) {
  var c = getStore('clientes').find(function(c){ return c.id === id; });
  if (!c) return;
  document.getElementById('clienteEditId').value = c.id;
  document.getElementById('modalClienteTitle').textContent = 'Editar Cliente';
  document.getElementById('cliTipo').value = c.tipo;
  document.getElementById('cliNombre').value = c.nombre;
  document.getElementById('cliRFC').value = c.rfc;
  document.getElementById('cliCURP').value = c.curp;
  document.getElementById('cliTel').value = c.telefono;
  document.getElementById('cliEmail').value = c.email;
  document.getElementById('cliDir').value = c.direccion;
  document.getElementById('cliCiudad').value = c.ciudad;
  document.getElementById('cliEstado').value = c.estado;
  document.getElementById('cliCP').value = c.cp;
  setInputMiles('cliIngresos', c.ingresos);
  document.getElementById('cliScore').value = c.score;
  document.getElementById('cliSector').value = c.sector;
  document.getElementById('cliNotas').value = c.notas;
  // Reset document upload area
  modalPendingFiles = [];
  modalCurrentFiles = [];
  renderModalPendingDocs();
  document.getElementById('modalDocTypeSelect').style.display = 'none';
  openModal('modalCliente');
}

function verCliente(id) {
  const c = getStore('clientes').find(c => c.id === id);
  if (!c) return;
  const creds = getStore('creditos').filter(cr => cr.clienteId === id);
  const pagosCliente = getStore('pagos').filter(p => creds.some(cr => cr.id === p.creditoId));
  const totalCartera = creds.reduce((s, cr) => s + (cr.estado !== 'liquidado' ? cr.saldo : 0), 0);

  // Build expediente panel inline
  let panel = document.getElementById('expedientePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'expedientePanel';
    panel.className = 'detail-panel';
    document.getElementById('page-clientes').appendChild(panel);
  }
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="detail-panel-header">
      <h3>Expediente: ${esc(c.nombre)}</h3>
      <button class="btn btn-outline btn-sm" style="color:white;border-color:rgba(255,255,255,0.3)" onclick="generarEdoCuenta(${c.id})">📄 Estado de Cuenta</button>
      <button class="btn btn-outline" style="color:white;border-color:rgba(255,255,255,0.3)" onclick="document.getElementById('expedientePanel').style.display='none'">Cerrar ✕</button>
    </div>
    <div class="detail-panel-body">
      <div class="exp-tabs">
        <div class="exp-tab active" onclick="switchExpTab(this,'exp-datos')">Datos Personales</div>
        <div class="exp-tab" onclick="switchExpTab(this,'exp-financiero')">Datos Financieros</div>
        <div class="exp-tab" onclick="switchExpTab(this,'exp-creditos')">Créditos (${creds.length})</div>
        <div class="exp-tab" onclick="switchExpTab(this,'exp-pagos')">Pagos (${pagosCliente.length})</div>
        <div class="exp-tab" onclick="switchExpTab(this,'exp-docs')">Documentos (${getClienteDocCount(id)})</div>
      </div>

      <div class="exp-content active" id="exp-datos">
        <div class="form-row" style="gap:24px">
          <div>
            <p><strong>Tipo Persona:</strong> ${c.tipo === 'fisica' ? 'Persona Física' : 'Persona Moral'}</p>
            <p style="margin-top:8px"><strong>RFC:</strong> ${esc(c.rfc)}</p>
            <p style="margin-top:8px"><strong>CURP:</strong> ${c.curp ? esc(c.curp) : 'N/A'}</p>
            <p style="margin-top:8px"><strong>Teléfono:</strong> ${c.telefono ? esc(c.telefono) : 'N/A'}</p>
            <p style="margin-top:8px"><strong>Email:</strong> ${c.email ? esc(c.email) : 'N/A'}</p>
          </div>
          <div>
            <p><strong>Dirección:</strong> ${c.direccion ? esc(c.direccion) : 'N/A'}</p>
            <p style="margin-top:8px"><strong>Ciudad:</strong> ${c.ciudad ? esc(c.ciudad) : 'N/A'}, ${c.estado ? esc(c.estado) : ''} ${c.cp ? esc(c.cp) : ''}</p>
            <p style="margin-top:8px"><strong>Sector:</strong> ${c.sector ? esc(c.sector) : 'N/A'}</p>
            <p style="margin-top:8px"><strong>Notas:</strong> ${c.notas ? esc(c.notas) : 'Sin notas'}</p>
          </div>
        </div>
      </div>

      <div class="exp-content" id="exp-financiero">
        <div class="kpi-grid">
          <div class="kpi-card navy"><div class="kpi-label">Cartera Activa</div><div class="kpi-value">${fmt(totalCartera)}</div></div>
          <div class="kpi-card blue"><div class="kpi-label">Ingresos Mensuales</div><div class="kpi-value">${fmt(c.ingresos)}</div></div>
          <div class="kpi-card green"><div class="kpi-label">Score Crediticio</div><div class="kpi-value">${c.score || 'N/A'}</div></div>
          <div class="kpi-card orange"><div class="kpi-label">Total Créditos</div><div class="kpi-value">${creds.length}</div></div>
        </div>
      </div>

      <div class="exp-content" id="exp-creditos">
        ${creds.length > 0 ? '<div class="table-wrapper"><table><thead><tr><th>No.</th><th>Tipo</th><th>Monto</th><th>Saldo</th><th>Tasa</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
        creds.map(cr => '<tr><td>' + cr.numero + '</td><td>' + (tipoLabel[cr.tipo]||cr.tipo) + '</td><td>' + fmt(cr.monto) + '</td><td>' + fmt(cr.saldo) + '</td><td>' + (cr.tasa*100).toFixed(2) + '%</td><td><span class="badge ' + (estadoBadge[cr.estado]||'') + '">' + cr.estado + '</span></td><td><button class="btn btn-outline btn-sm" onclick="showPage(\'creditos\');verCredito(' + cr.id + ')">Ver detalle</button></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty-state"><p>Sin créditos registrados</p></div>'}
      </div>

      <div class="exp-content" id="exp-pagos">
        ${pagosCliente.length > 0 ? '<div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Crédito</th><th>Capital</th><th>Interés</th><th>Total</th><th>Saldo</th></tr></thead><tbody>' +
        pagosCliente.map(p => { const cr = creds.find(x=>x.id===p.creditoId); return '<tr><td>' + fmtDate(p.fecha) + '</td><td>' + (cr?cr.numero:'-') + '</td><td>' + fmt(p.capital) + '</td><td>' + fmt(p.interes) + '</td><td>' + fmt(p.monto) + '</td><td>' + fmt(p.saldoNuevo) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="empty-state"><p>Sin pagos registrados</p></div>'}
      </div>

      <div class="exp-content" id="exp-docs">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h4>Expediente Digital</h4>
          <button class="btn btn-primary btn-sm" onclick="exportarExpedientePDF(${c.id})">📄 Exportar Índice PDF</button>
        </div>
        <div id="expChecklistContainer">${renderExpedienteChecklist(c.id)}</div>
        <h4 style="margin:16px 0 8px">Documentos Cargados (${getClienteDocCount(c.id)})</h4>
        <div class="doc-type-tags" id="docTypeTags">
          <span class="doc-type-tag selected" data-type="todos" onclick="filterDocs(this,'todos',${c.id})">Todos</span>
          <span class="doc-type-tag" data-type="contrato" onclick="filterDocs(this,'contrato',${c.id})">Contratos</span>
          <span class="doc-type-tag" data-type="ine" onclick="filterDocs(this,'ine',${c.id})">INE / ID</span>
          <span class="doc-type-tag" data-type="csf" onclick="filterDocs(this,'csf',${c.id})">CSF</span>
          <span class="doc-type-tag" data-type="estados_financieros" onclick="filterDocs(this,'estados_financieros',${c.id})">Estados Financieros</span>
          <span class="doc-type-tag" data-type="comprobante_domicilio" onclick="filterDocs(this,'comprobante_domicilio',${c.id})">Comp. Domicilio</span>
          <span class="doc-type-tag" data-type="otro" onclick="filterDocs(this,'otro',${c.id})">Otros</span>
        </div>
        <div class="doc-upload-zone" id="docUploadZone" onclick="document.getElementById('docFileInput').click()" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="handleDocDrop(event,${c.id})">
          <div class="upload-icon">📁</div>
          <p><strong>Arrastra archivos aquí</strong> o haz clic para seleccionar</p>
          <p style="margin-top:4px;font-size:11px">PDF, JPG, PNG — Contratos, INE, CSF, Estados Financieros</p>
          <input type="file" id="docFileInput" style="display:none" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple onchange="handleDocUpload(this.files,${c.id})">
        </div>
        <div id="docSelectType" style="display:none;margin-top:12px;padding:16px;background:var(--gray-50);border-radius:var(--radius)">
          <p style="font-size:13px;font-weight:600;margin-bottom:8px">Tipo de documento:</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <button class="btn btn-sm btn-outline" onclick="assignDocType('contrato')">📄 Contrato</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('ine')">🪪 INE / ID</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('csf')">📋 CSF</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('estados_financieros')">📊 Estados Financieros</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('comprobante_domicilio')">🏠 Comp. Domicilio</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('acta_constitutiva')">📑 Acta Constitutiva</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('poder_notarial')">⚖️ Poder Notarial</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('comprobante_ingresos')">💰 Comp. Ingresos</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('opiniones_cumplimiento')">📜 Opinión Cumplimiento</button>
            <button class="btn btn-sm btn-outline" onclick="assignDocType('otro')">📎 Otro</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label class="form-label" style="font-size:11px">Nota (opcional)</label><input type="text" class="form-input" id="docNotaInput" placeholder="Ej: Copia certificada ante notario"></div>
            <div class="form-group"><label class="form-label" style="font-size:11px">Fecha de vencimiento (opcional)</label><input type="date" class="form-input" id="docVencInput"></div>
          </div>
        </div>
        <div class="doc-grid" id="docGrid"></div>
      </div>
    </div>
  `;
  renderDocGrid(id);
  panel.scrollIntoView({ behavior: 'smooth' });
}

function switchExpTab(el, tabId) {
  el.parentElement.querySelectorAll('.exp-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  el.closest('.detail-panel-body').querySelectorAll('.exp-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

// ===== FIX 3: PROVISIONES CNBV ESCALONADAS =====
// Tabla de porcentajes de provisión según días de mora (criterios CNBV simplificados)
var PROVISION_CNBV = [
  { minDias: 0, maxDias: 0, pct: 0.005 },      // Vigente sin mora: 0.5%
  { minDias: 1, maxDias: 30, pct: 0.05 },       // 1-30 días: 5%
  { minDias: 31, maxDias: 60, pct: 0.15 },      // 31-60 días: 15%
  { minDias: 61, maxDias: 90, pct: 0.30 },      // 61-90 días: 30%
  { minDias: 91, maxDias: 120, pct: 0.50 },     // 91-120 días: 50%
  { minDias: 121, maxDias: 180, pct: 0.75 },    // 121-180 días: 75%
  { minDias: 181, maxDias: 99999, pct: 1.00 }   // 181+ días: 100%
];

function calcProvisionCNBV(saldo, diasMora) {
  if (!saldo || saldo <= 0) return 0;
  var dm = Math.max(diasMora || 0, 0);
  for (var i = 0; i < PROVISION_CNBV.length; i++) {
    if (dm >= PROVISION_CNBV[i].minDias && dm <= PROVISION_CNBV[i].maxDias) {
      return +(saldo * PROVISION_CNBV[i].pct).toFixed(2);
    }
  }
  return +(saldo * 1.0).toFixed(2); // fallback 100%
}

function calcProvisionTotal(creditos) {
  return creditos.filter(function(c) { return c.estado !== 'liquidado'; }).reduce(function(s, c) {
    return s + calcProvisionCNBV(c.saldo, c.diasMora || 0);
  }, 0);
}

// ============================================================
