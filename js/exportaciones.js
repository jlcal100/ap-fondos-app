// ====== MODULE: exportaciones.js ======
// exportToExcel(), generarEdoCuenta(), reporteCarteraVencida(), reporteCobranza(), descargarPlantilla()

// ============================================================
//  SPRINT 2 — EXPORTACIÓN A EXCEL
// ============================================================

function exportToExcel(data, headers, fileName, sheetName) {
  if (!window.XLSX) return toast('Librería XLSX no cargada. Revisa tu conexión a internet.', 'error');
  var ws = XLSX.utils.aoa_to_sheet([headers].concat(data));
  // Auto-ancho de columnas
  ws['!cols'] = headers.map(function(h, i) {
    var maxLen = h.length;
    data.forEach(function(row) { if (row[i] && String(row[i]).length > maxLen) maxLen = String(row[i]).length; });
    return { wch: Math.min(maxLen + 2, 40) };
  });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Datos');
  XLSX.writeFile(wb, fileName);
  toast('Archivo Excel descargado: ' + fileName, 'success');
}

function exportarClientesExcel() {
  var clientes = getStore('clientes');
  var creditos = getStore('creditos');
  var headers = ['ID', 'Tipo', 'Nombre', 'RFC', 'CURP', 'Teléfono', 'Email', 'Dirección', 'Ciudad', 'Estado', 'C.P.', 'Ingresos', 'Score', 'Sector', 'Créditos', 'Documentos'];
  var data = clientes.map(function(c) {
    return [c.id, c.tipo === 'fisica' ? 'Física' : 'Moral', c.nombre, c.rfc, c.curp, c.telefono, c.email, c.direccion, c.ciudad, c.estado, c.cp, c.ingresos, c.score, c.sector, creditos.filter(function(cr) { return cr.clienteId === c.id; }).length, getClienteDocCount(c.id)];
  });
  exportToExcel(data, headers, 'AP_Clientes_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Clientes');
}

function exportarCreditosExcel() {
  var creditos = getStore('creditos');
  var clientes = getStore('clientes');
  var headers = ['Número', 'Cliente', 'Tipo', 'Monto', 'Tasa Anual %', 'Plazo', 'Periodicidad', 'Fecha Inicio', 'Saldo', 'Estado', 'Comisión'];
  var data = creditos.map(function(c) {
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    return [c.numero, cli ? cli.nombre : '-', tipoLabel[c.tipo] || c.tipo, c.monto, (c.tasa * 100).toFixed(2), c.plazo, c.periodicidad, c.fechaInicio, c.saldo, c.estado, c.comision || 0];
  });
  exportToExcel(data, headers, 'AP_Creditos_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Créditos');
}

function exportarPagosExcel() {
  var pagos = getStore('pagos');
  var creditos = getStore('creditos');
  var headers = ['Fecha', 'Crédito', 'Capital', 'Interés', 'Moratorio', 'Comisión', 'Total', 'Saldo Nuevo', 'Método', 'Referencia'];
  var data = pagos.map(function(p) {
    var c = creditos.find(function(cr) { return cr.id === p.creditoId; });
    return [p.fecha, c ? c.numero : '-', p.capital, p.interes, p.moratorio, p.comision, p.monto, p.saldoNuevo, p.metodo, p.referencia];
  });
  exportToExcel(data, headers, 'AP_Pagos_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Pagos');
}

function exportarFondeosExcel() {
  var fondeos = getStore('fondeos');
  var headers = ['Número', 'Fondeador', 'Tipo', 'Monto', 'Tasa %', 'Plazo', 'Fecha Inicio', 'Saldo', 'Estado', 'Garantía'];
  var data = fondeos.map(function(f) {
    return [f.numero, f.fondeador, f.tipo, f.monto, (f.tasa * 100).toFixed(2), f.plazo, f.fechaInicio, f.saldo, f.estado, f.garantia];
  });
  exportToExcel(data, headers, 'AP_Fondeos_' + fmtDate(new Date().toISOString()) + '.xlsx', 'Fondeos');
}

// ============================================================
//  SPRINT 2 — ESTADO DE CUENTA PDF
// ============================================================

function generarEdoCuenta(clienteId) {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var c = getStore('clientes').find(function(cl) { return cl.id === clienteId; });
  if (!c) return toast('Cliente no encontrado', 'error');
  var creds = getStore('creditos').filter(function(cr) { return cr.clienteId === clienteId; });
  var allPagos = getStore('pagos');
  var doc = new jsPDF();
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // Header
  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('AP Operadora de Fondos', 14, 14);
  doc.setFontSize(10);
  doc.text('Estado de Cuenta', 14, 22);
  doc.text(hoy, 196, 14, { align: 'right' });

  // Datos del cliente
  doc.setTextColor(30, 48, 80);
  doc.setFontSize(12);
  doc.text('Datos del Cliente', 14, 42);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  var yPos = 50;
  var datosCliente = [
    ['Nombre:', c.nombre], ['RFC:', c.rfc], ['Tipo:', c.tipo === 'fisica' ? 'Persona Física' : 'Persona Moral'],
    ['Teléfono:', c.telefono || '-'], ['Email:', c.email || '-'], ['Dirección:', (c.direccion || '') + ' ' + (c.ciudad || '') + ', ' + (c.estado || '')]
  ];
  datosCliente.forEach(function(d) {
    doc.setFont(undefined, 'bold'); doc.text(d[0], 14, yPos);
    doc.setFont(undefined, 'normal'); doc.text(d[1] || '-', 50, yPos);
    yPos += 6;
  });

  // Resumen de cartera
  yPos += 4;
  doc.setTextColor(30, 48, 80);
  doc.setFontSize(12);
  doc.text('Resumen de Cartera', 14, yPos);
  yPos += 8;
  var totalSaldo = creds.reduce(function(s, cr) { return s + (cr.estado !== 'liquidado' ? cr.saldo : 0); }, 0);
  var totalOriginal = creds.reduce(function(s, cr) { return s + cr.monto; }, 0);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  var totalIntDev = 0;
  creds.forEach(function(cr) {
    if (cr.estado === 'liquidado') return;
    cr._intDevengado = calcInteresDevengadoReal(cr, allPagos);
    totalIntDev += cr._intDevengado;
  });
  doc.text('Créditos activos: ' + creds.filter(function(cr) { return cr.estado === 'vigente'; }).length + '   |   Liquidados: ' + creds.filter(function(cr) { return cr.estado === 'liquidado'; }).length + '   |   Monto total otorgado: ' + fmt(totalOriginal) + '   |   Saldo total: ' + fmt(totalSaldo) + '   |   Int. devengado: ' + fmt(totalIntDev), 14, yPos);
  yPos += 8;

  // Tabla de créditos
  if (creds.length > 0) {
    doc.setTextColor(30, 48, 80);
    doc.setFontSize(11);
    doc.text('Detalle de Créditos', 14, yPos);
    yPos += 2;
    doc.autoTable({
      startY: yPos,
      head: [['Número', 'Tipo', 'Monto', 'Tasa', 'Plazo', 'Saldo', 'Int.Dev.', 'Estado']],
      body: creds.map(function(cr) {
        return [cr.numero, tipoLabel[cr.tipo] || cr.tipo, fmt(cr.monto), (cr.tasa * 100).toFixed(2) + '%', cr.plazo + 'm', fmt(cr.saldo), fmt(cr._intDevengado || 0), cr.estado];
      }),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 48, 80], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 8;
  }

  // Tabla de pagos recientes
  creds.forEach(function(cr) {
    var pagosC = allPagos.filter(function(p) { return p.creditoId === cr.id; });
    if (pagosC.length === 0) return;
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    doc.setTextColor(30, 48, 80);
    doc.setFontSize(10);
    doc.text('Pagos — ' + cr.numero, 14, yPos);
    yPos += 2;
    doc.autoTable({
      startY: yPos,
      head: [['Fecha', 'Capital', 'Interés', 'Moratorio', 'Total', 'Saldo']],
      body: pagosC.map(function(p) {
        return [fmtDate(p.fecha), fmt(p.capital), fmt(p.interes), fmt(p.moratorio), fmt(p.monto), fmt(p.saldoNuevo)];
      }),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 48, 80], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 8;
  });

  // Amortización pendiente del primer crédito vigente
  var credVig = creds.find(function(cr) { return cr.estado === 'vigente' && cr.amortizacion; });
  if (credVig && credVig.amortizacion) {
    var pendientes = credVig.amortizacion.filter(function(a) { return !a.pagado; });
    if (pendientes.length > 0) {
      if (yPos > 230) { doc.addPage(); yPos = 20; }
      doc.setTextColor(30, 48, 80);
      doc.setFontSize(10);
      doc.text('Próximos Pagos — ' + credVig.numero, 14, yPos);
      yPos += 2;
      doc.autoTable({
        startY: yPos,
        head: [['#', 'Fecha', 'Capital', 'Interés', 'Pago Total', 'Saldo Final']],
        body: pendientes.slice(0, 6).map(function(a) {
          return [a.periodo, a.fecha || '-', fmt(a.capital), fmt(a.interes), fmt(a.pago), fmt(a.saldoFinal)];
        }),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [200, 16, 46], textColor: 255 },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        margin: { left: 14, right: 14 }
      });
    }
  }

  // Footer
  var pageCount = doc.internal.getNumberOfPages();
  for (var i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('AP Operadora de Fondos — Estado de Cuenta — ' + hoy + ' — Página ' + i + '/' + pageCount, 105, 290, { align: 'center' });
  }

  doc.save('EdoCuenta_' + c.nombre.replace(/\s+/g, '_') + '.pdf');
  toast('Estado de cuenta generado', 'success');
}

// ============================================================
//  SPRINT 2 — REPORTE CARTERA VENCIDA (PDF)
// ============================================================

function reporteCarteraVencida() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var creditos = getStore('creditos');
  var clientes = getStore('clientes');
  var hoy = new Date();
  var hoyStr = hoy.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // Créditos vencidos + con pagos atrasados
  var carteraVencida = creditos.filter(function(c) {
    if (c.estado === 'liquidado') return false;
    if (c.estado === 'vencido') return true;
    // Verificar si tiene pagos atrasados en amortización
    if (c.amortizacion) {
      return c.amortizacion.some(function(a) {
        return !a.pagado && a.fecha && new Date(a.fecha) < hoy;
      });
    }
    return false;
  });

  var doc = new jsPDF('landscape');

  // Header
  doc.setFillColor(200, 16, 46);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Reporte de Cartera Vencida', 14, 12);
  doc.setFontSize(9);
  doc.text('AP Operadora de Fondos — ' + hoyStr, 14, 20);
  doc.text('Total créditos en cartera vencida: ' + carteraVencida.length, 283, 12, { align: 'right' });

  var totalVencido = carteraVencida.reduce(function(s, c) { return s + c.saldo; }, 0);
  doc.text('Saldo total vencido: ' + fmt(totalVencido), 283, 20, { align: 'right' });

  if (carteraVencida.length === 0) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(14);
    doc.text('No hay créditos en cartera vencida. La cartera está sana.', 148.5, 80, { align: 'center' });
  } else {
    // Tabla
    doc.autoTable({
      startY: 34,
      head: [['Número', 'Cliente', 'Tipo', 'Monto Original', 'Saldo', 'Tasa', 'Fecha Inicio', 'Días Atraso', 'Estado']],
      body: carteraVencida.map(function(c) {
        var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
        var diasAtraso = 0;
        if (c.amortizacion) {
          var primerAtraso = c.amortizacion.find(function(a) { return !a.pagado && a.fecha && new Date(a.fecha) < hoy; });
          if (primerAtraso) diasAtraso = Math.floor((hoy - new Date(primerAtraso.fecha)) / 86400000);
        }
        return [c.numero, cli ? cli.nombre : '-', tipoLabel[c.tipo] || c.tipo, fmt(c.monto), fmt(c.saldo), (c.tasa * 100).toFixed(2) + '%', c.fechaInicio, diasAtraso, c.estado];
      }),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [200, 16, 46], textColor: 255 },
      alternateRowStyles: { fillColor: [255, 245, 245] },
      columnStyles: { 4: { fontStyle: 'bold' }, 7: { halign: 'center' } },
      margin: { left: 14, right: 14 }
    });
  }

  // Footer
  var pageCount = doc.internal.getNumberOfPages();
  for (var i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('AP Operadora de Fondos — Cartera Vencida — ' + hoyStr + ' — Pág ' + i + '/' + pageCount, 148.5, 205, { align: 'center' });
  }

  doc.save('CarteraVencida_' + fmtDate(hoy.toISOString()) + '.pdf');
  toast('Reporte de cartera vencida generado', 'success');
}

// ============================================================
//  SPRINT 2 — REPORTE DE COBRANZA (PDF)
// ============================================================

function reporteCobranza() {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var creditos = getStore('creditos');
  var clientes = getStore('clientes');
  var pagos = getStore('pagos');
  var hoy = new Date();
  var hoyStr = hoy.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // Próximos pagos de todos los créditos vigentes
  var proximosPagos = [];
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado' || !c.amortizacion) return;
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    c.amortizacion.forEach(function(a) {
      if (a.pagado) return;
      var fechaPago = a.fecha ? new Date(a.fecha) : null;
      var diasPara = fechaPago ? Math.floor((fechaPago - hoy) / 86400000) : 999;
      var estatus = diasPara < 0 ? 'VENCIDO' : diasPara <= 7 ? 'URGENTE' : diasPara <= 30 ? 'PRÓXIMO' : 'PROGRAMADO';
      proximosPagos.push({
        numero: c.numero,
        cliente: cli ? cli.nombre : '-',
        telefono: cli ? cli.telefono : '-',
        periodo: a.periodo,
        fecha: a.fecha || '-',
        pago: a.pago,
        capital: a.capital,
        interes: a.interes,
        diasPara: diasPara,
        estatus: estatus
      });
    });
  });
  proximosPagos.sort(function(a, b) { return a.diasPara - b.diasPara; });

  var doc = new jsPDF('landscape');

  // Header
  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Reporte de Cobranza', 14, 12);
  doc.setFontSize(9);
  doc.text('AP Operadora de Fondos — ' + hoyStr, 14, 20);

  var vencidos = proximosPagos.filter(function(p) { return p.estatus === 'VENCIDO'; });
  var urgentes = proximosPagos.filter(function(p) { return p.estatus === 'URGENTE'; });
  doc.text('Vencidos: ' + vencidos.length + '   |   Urgentes (7 días): ' + urgentes.length + '   |   Total cuotas pendientes: ' + proximosPagos.length, 283, 12, { align: 'right' });
  var totalPorCobrar = proximosPagos.reduce(function(s, p) { return s + p.pago; }, 0);
  doc.text('Total por cobrar: ' + fmt(totalPorCobrar), 283, 20, { align: 'right' });

  if (proximosPagos.length === 0) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(14);
    doc.text('No hay pagos pendientes de cobro.', 148.5, 80, { align: 'center' });
  } else {
    doc.autoTable({
      startY: 34,
      head: [['Estatus', 'Crédito', 'Cliente', 'Teléfono', 'Periodo', 'Fecha Pago', 'Capital', 'Interés', 'Pago Total', 'Días']],
      body: proximosPagos.slice(0, 100).map(function(p) {
        return [p.estatus, p.numero, p.cliente, p.telefono, p.periodo, p.fecha, fmt(p.capital), fmt(p.interes), fmt(p.pago), p.diasPara < 0 ? p.diasPara : '+' + p.diasPara];
      }),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 48, 80], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 0) {
          var val = data.cell.raw;
          if (val === 'VENCIDO') { data.cell.styles.textColor = [200, 16, 46]; data.cell.styles.fontStyle = 'bold'; }
          else if (val === 'URGENTE') { data.cell.styles.textColor = [230, 126, 34]; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      margin: { left: 10, right: 10 }
    });
  }

  // Footer
  var pageCount = doc.internal.getNumberOfPages();
  for (var i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('AP Operadora de Fondos — Reporte de Cobranza — ' + hoyStr + ' — Pág ' + i + '/' + pageCount, 148.5, 205, { align: 'center' });
  }

  doc.save('Cobranza_' + fmtDate(hoy.toISOString()) + '.pdf');
  toast('Reporte de cobranza generado', 'success');
}

// ============================================================
//  Bug #44: Anti-clickjacking (protección en iframe)
// ============================================================
if (window.top !== window.self) {
  document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:40vh">⚠️ Esta aplicación no puede ejecutarse en un iframe</h1>';
  throw new Error('Clickjacking protection: app cannot run in iframe');
}

// ============================================================
//  Bug #45: Timeout de sesión por inactividad
// ============================================================
const SESSION_TIMEOUT_MIN = 30; // minutos de inactividad
let _lastActivity = Date.now();

function resetActivityTimer() { _lastActivity = Date.now(); }

['click', 'keypress', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, resetActivityTimer, { passive: true });
});

setInterval(function() {
  if (!currentUser) return;
  const inactiveMin = (Date.now() - _lastActivity) / 60000;
  if (inactiveMin >= SESSION_TIMEOUT_MIN) {
    addAudit('Sesión Expirada', 'Seguridad', 'Inactividad de ' + Math.round(inactiveMin) + ' min — ' + currentUser.nombre);
    logoutUser();
    toast('Sesión cerrada por inactividad (' + SESSION_TIMEOUT_MIN + ' min)', 'warning');
  } else if (inactiveMin >= SESSION_TIMEOUT_MIN - 5) {
    // Advertir 5 min antes
    toast('⏰ Sesión se cerrará en ' + Math.round(SESSION_TIMEOUT_MIN - inactiveMin) + ' minutos por inactividad', 'info');
  }
}, 60000); // revisar cada minuto

// ============================================================
//  Bug #47: Logging de seguridad
// ============================================================
function logSecurityEvent(tipo, detalle) {
  const logs = getStore('security_log');
  logs.push({
    id: logs.length + 1,
    fecha: new Date().toISOString(),
    tipo: tipo,
    usuario: currentUser ? currentUser.nombre : 'Anónimo',
    detalle: detalle,
    userAgent: navigator.userAgent.substring(0, 100)
  });
  // Mantener últimos 200 eventos de seguridad
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  setStore('security_log', logs);
}

// Monitorear intentos de acceso a DevTools (detección básica)
let _devtoolsOpen = false;
const _devtoolsCheck = setInterval(function() {
  const threshold = 160;
  if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
    if (!_devtoolsOpen) {
      _devtoolsOpen = true;
      logSecurityEvent('devtools_abierto', 'Se detectó apertura de DevTools');
    }
  } else {
    _devtoolsOpen = false;
  }
}, 5000);

// ============================================================
//  Bug #48: Política de retención de datos (purgar datos antiguos)
// ============================================================
function purgarDatosAntiguos() {
  if (!hasPermiso('admin', 'backup')) return toast('Sin permiso para purgar datos', 'error');
  const hace6meses = new Date();
  hace6meses.setMonth(hace6meses.getMonth() - 6);
  const fechaLimite = hace6meses.toISOString();

  // Contar registros a purgar
  const auditoria = getStore('auditoria');
  const secLog = getStore('security_log');
  const cotizaciones = getStore('cotizaciones');

  const auditAntiguos = auditoria.filter(r => r.fecha < fechaLimite).length;
  const secAntiguos = secLog.filter(r => r.fecha < fechaLimite).length;
  const cotAntiguos = cotizaciones.filter(r => r.createdAt && r.createdAt < fechaLimite).length;
  const total = auditAntiguos + secAntiguos + cotAntiguos;

  if (total === 0) return toast('No hay datos antiguos para purgar (> 6 meses)', 'info');

  showConfirm('Purgar datos antiguos',
    'Se eliminarán registros con más de 6 meses:\n\n' +
    '• Auditoría: ' + auditAntiguos + ' registros\n' +
    '• Log de seguridad: ' + secAntiguos + ' registros\n' +
    '• Cotizaciones: ' + cotAntiguos + ' registros\n\n' +
    'Total: ' + total + ' registros. Esta acción no se puede deshacer.',
    'Sí, purgar').then(ok => {
    if (!ok) return;
    setStore('auditoria', auditoria.filter(r => r.fecha >= fechaLimite));
    setStore('security_log', secLog.filter(r => r.fecha >= fechaLimite));
    setStore('cotizaciones', cotizaciones.filter(r => !r.createdAt || r.createdAt >= fechaLimite));
    addAudit('Purgar Datos', 'Sistema', total + ' registros eliminados (> 6 meses)');
    toast(total + ' registros antiguos eliminados', 'success');
    checkStorageUsage();
  });
}

// ============================================================
//  Bug #49: Validación de archivos subidos (para importación)
// ============================================================
const ALLOWED_FILE_TYPES = {
  backup: { exts: ['.json'], maxMB: 10, mimes: ['application/json'] },
  documento: { exts: ['.pdf', '.jpg', '.jpeg', '.png'], maxMB: 5, mimes: ['application/pdf', 'image/jpeg', 'image/png'] }
};

function validarArchivo(file, tipo) {
  const rules = ALLOWED_FILE_TYPES[tipo];
  if (!rules) return { ok: false, error: 'Tipo de archivo no configurado' };
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!rules.exts.includes(ext)) return { ok: false, error: 'Extensión no permitida. Permitidas: ' + rules.exts.join(', ') };
  if (file.size > rules.maxMB * 1024 * 1024) return { ok: false, error: 'Archivo excede ' + rules.maxMB + 'MB' };
  if (rules.mimes.length > 0 && file.type && !rules.mimes.includes(file.type)) {
    return { ok: false, error: 'Tipo MIME no permitido: ' + file.type };
  }
  return { ok: true };
}

// ============================================================
//  Bug #50: Auto-backup reminder y recuperación
// ============================================================
function checkAutoBackupReminder() {
  const lastBackup = localStorage.getItem('ap_last_backup_date');
  if (!lastBackup) {
    // Nunca se ha hecho backup
    toast('💾 No se ha realizado ningún respaldo. Ve a Admin > Exportar Backup', 'warning');
    return;
  }
  const daysSince = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 7) {
    toast('💾 Último respaldo hace ' + Math.round(daysSince) + ' días. Considera exportar un backup.', 'warning');
  }
}

