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
function generarAmortizacion(monto, tasaAnual, plazoMeses, periodicidad, fechaInicio, valorResidualPct = 0, ivaPct = 0, tipoCredito = '', graciaConfig = null) {
  // graciaConfig: { meses: N, tipo: 'capital'|'total' } o null
  const periodosGracia = graciaConfig && graciaConfig.meses > 0 ? getPeriodos(graciaConfig.meses, periodicidad) : 0;
  const tipoGracia = graciaConfig ? graciaConfig.tipo : 'capital';

  const periodos = getPeriodos(plazoMeses, periodicidad);
  const totalPeriodos = periodos + periodosGracia;
  const tasaPeriodica = getTasaPeriodica(tasaAnual, periodicidad);
  const vr = monto * (valorResidualPct / 100);
  const diasPeriodo = getDiasPeriodo(periodicidad);

  let saldo = monto;
  const tabla = [];
  let fecha = new Date(fechaInicio);
  const diaOriginal = fecha.getDate();

  // ARRENDAMIENTO FINANCIERO Y PURO:
  if (tipoCredito === 'arrendamiento' || tipoCredito === 'arrendamiento_puro') {
    const interesFlat = +(monto * tasaPeriodica).toFixed(2);
    const capitalFijo = +((monto - vr) / periodos).toFixed(2); // capital solo en periodos normales

    for (let i = 1; i <= totalPeriodos; i++) {
      fecha = avanzarFechaPeriodo(fecha, periodicidad, diaOriginal);
      const esGracia = i <= periodosGracia;

      let capital, interes, ivaInteres, pagoTotal;
      if (esGracia) {
        if (tipoGracia === 'total') {
          // Gracia total: no paga nada, intereses se capitalizan
          interes = +(saldo * tasaPeriodica).toFixed(2);
          capital = 0;
          ivaInteres = 0;
          pagoTotal = 0;
          saldo = +(saldo + interes).toFixed(2); // capitalizar intereses
        } else {
          // Gracia capital: paga solo intereses
          interes = interesFlat;
          capital = 0;
          ivaInteres = +(interes * (ivaPct / 100)).toFixed(2);
          pagoTotal = +(interes + ivaInteres).toFixed(2);
        }
      } else {
        interes = interesFlat;
        if (i === totalPeriodos) {
          capital = +(saldo - vr).toFixed(2);
        } else {
          capital = capitalFijo;
        }
        ivaInteres = +(interes * (ivaPct / 100)).toFixed(2);
        pagoTotal = +(capital + interes + ivaInteres).toFixed(2);
      }
      const saldoFinal = esGracia && tipoGracia === 'total' ? saldo : +(saldo - capital).toFixed(2);

      tabla.push({
        numero: i,
        fecha: fecha.toISOString().split('T')[0],
        saldoInicial: Math.max(+saldo.toFixed(2), 0),
        capital: Math.max(capital, 0),
        interes: Math.max(interes, 0),
        iva: ivaInteres,
        pagoTotal: Math.max(pagoTotal, 0),
        saldoFinal: Math.max(saldoFinal, 0),
        pagado: false,
        esGracia: esGracia || undefined
      });
      if (!(esGracia && tipoGracia === 'total')) saldo = saldoFinal;
    }
    return tabla;
  }

  // CRÉDITO ESTÁNDAR: interés sobre saldo insoluto (sistema francés)
  // Si hay gracia total, recalcular saldo post-gracia antes de generar amortización normal
  let saldoPostGracia = monto;

  // Generar periodos de gracia primero
  for (let i = 1; i <= periodosGracia; i++) {
    fecha = avanzarFechaPeriodo(fecha, periodicidad, diaOriginal);
    const interes = +(saldo * tasaPeriodica).toFixed(2);

    if (tipoGracia === 'total') {
      // No paga nada, intereses se capitalizan
      tabla.push({
        numero: i, fecha: fecha.toISOString().split('T')[0],
        saldoInicial: Math.max(+saldo.toFixed(2), 0), capital: 0, interes: interes, iva: 0,
        pagoTotal: 0, saldoFinal: +(saldo + interes).toFixed(2), pagado: false, esGracia: true
      });
      saldo = +(saldo + interes).toFixed(2);
    } else {
      // Paga solo intereses
      const ivaInteres = +(interes * (ivaPct / 100)).toFixed(2);
      tabla.push({
        numero: i, fecha: fecha.toISOString().split('T')[0],
        saldoInicial: Math.max(+saldo.toFixed(2), 0), capital: 0, interes: interes, iva: ivaInteres,
        pagoTotal: +(interes + ivaInteres).toFixed(2), saldoFinal: +saldo.toFixed(2), pagado: false, esGracia: true
      });
    }
  }

  // Ahora generar periodos normales con el saldo post-gracia
  const pago = calcPago(saldo, tasaAnual, plazoMeses, periodicidad, valorResidualPct);

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
      numero: periodosGracia + i,
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

function crearCreditoObj(id, numero, clienteId, tipo, monto, tasa, tasaMora, plazo, periodicidad, fechaInicio, vrPct, valorEquipo, comision, graciaConfig) {
  // IVA 16% estándar sobre intereses para todos los tipos de crédito en México
  const amort = generarAmortizacion(monto, tasa, plazo, periodicidad, fechaInicio, vrPct, 16, tipo, graciaConfig || null);
  const fechaVenc = amort.length > 0 ? amort[amort.length - 1].fecha : fechaInicio;
  return {
    id, numero, clienteId, tipo, monto, saldo: monto, tasa, tasaMoratoria: tasaMora,
    plazo, periodicidad, fechaInicio, fechaVencimiento: fechaVenc,
    pago: calcPago(monto, tasa, plazo, periodicidad, vrPct, tipo),
    estado: 'vigente', diasMora: 0, valorResidual: vrPct, valorEquipo, comision,
    fondeoId: null, notas: '', amortizacion: amort,
    graciaConfig: graciaConfig || null,
    tipoTasa: 'fija', tasaReferencia: 0, spread: 0, periodoRevision: '', historialTasas: [],
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
//  DUPLICATES REMOVED: showPage, setDashPeriod, getDashPagos,
//  actualizarDiasMora, renderDashboard, nuevoCliente, renderClientes,
//  handleModalDocSelect, handleModalDocDrop, assignModalDocType,
//  removeModalPendingDoc, renderModalPendingDocs, formatBytes,
//  guardarCliente, editarCliente, verCliente, switchExpTab
//  (canonical versions in navegacion.js, dashboard.js, clientes.js)
// ============================================================

// NOTE: The above functions were previously duplicated here but have been
// removed to avoid maintenance confusion. The authoritative versions live in
// their respective modules which are loaded via index.html.

// ===== PLACEHOLDER TO MAINTAIN STRUCTURE =====
// (original lines 616-1306 removed)

var _financiero_duplicates_cleaned = true; // marker

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
