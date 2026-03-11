// ====== MODULE: importacion.js ======
// Import mass data functions (validarArchivo, readExcelFile, readCSVFile, mapColumns, processImportData, etc.)

// ============================================================
//  SPRINT L — IMPORTACIÓN MASIVA DE DATOS
// ============================================================

var importParsedData = [];
var importValidationResults = [];

// Definición de columnas esperadas por tipo
var IMPORT_COLUMNS = {
  clientes: {
    required: ['nombre', 'rfc', 'tipo'],
    optional: ['curp', 'telefono', 'email', 'direccion', 'ciudad', 'estado', 'cp', 'ingresos', 'score', 'sector', 'notas'],
    aliases: {
      'nombre': ['nombre', 'name', 'razon_social', 'razon social', 'cliente'],
      'rfc': ['rfc'],
      'tipo': ['tipo', 'tipo_persona', 'tipo persona', 'persona'],
      'curp': ['curp'],
      'telefono': ['telefono', 'tel', 'phone', 'teléfono', 'celular'],
      'email': ['email', 'correo', 'e-mail', 'mail'],
      'direccion': ['direccion', 'dirección', 'domicilio', 'address'],
      'ciudad': ['ciudad', 'city', 'municipio'],
      'estado': ['estado', 'state', 'entidad'],
      'cp': ['cp', 'codigo_postal', 'codigo postal', 'zip'],
      'ingresos': ['ingresos', 'income', 'ingreso_mensual'],
      'score': ['score', 'puntaje', 'calificacion'],
      'sector': ['sector', 'giro', 'industria', 'actividad'],
      'notas': ['notas', 'notes', 'observaciones', 'comentarios']
    }
  },
  fondeos: {
    required: ['fondeador', 'monto', 'tasa', 'plazo', 'fecha_inicio'],
    optional: ['tipo', 'periodicidad', 'garantia', 'notas'],
    aliases: {
      'fondeador': ['fondeador', 'nombre', 'institucion', 'institución', 'banco'],
      'monto': ['monto', 'amount', 'importe', 'capital'],
      'tasa': ['tasa', 'tasa_anual', 'rate', 'interes', 'interés', 'tasa_interes'],
      'plazo': ['plazo', 'term', 'meses', 'periodos'],
      'fecha_inicio': ['fecha_inicio', 'fecha', 'date', 'inicio', 'fecha inicio'],
      'tipo': ['tipo', 'type', 'fuente'],
      'periodicidad': ['periodicidad', 'frecuencia', 'frequency'],
      'garantia': ['garantia', 'garantía', 'collateral'],
      'notas': ['notas', 'notes', 'observaciones']
    }
  }
};

function onImportTipoChange() {
  cancelarImport();
  document.getElementById('importFile').value = '';
}

// Leer archivo Excel/CSV
function onImportFileSelected(input) {
  var file = input.files[0];
  if (!file) return;
  var tipo = document.getElementById('importTipo').value;
  var ext = file.name.split('.').pop().toLowerCase();

  if (['xlsx', 'xls'].indexOf(ext) !== -1) {
    readExcelFile(file, tipo);
  } else if (['csv', 'tsv'].indexOf(ext) !== -1) {
    readCSVFile(file, tipo, ext === 'tsv' ? '\t' : ',');
  } else {
    toast('Formato no soportado. Usa .xlsx, .csv o .tsv', 'error');
  }
}

function readExcelFile(file, tipo) {
  if (!window.XLSX) return toast('Librería XLSX no cargada', 'error');
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (rawData.length === 0) return toast('El archivo está vacío', 'error');
      processImportData(rawData, tipo);
    } catch (err) {
      toast('Error al leer el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function readCSVFile(file, tipo, delimiter) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var text = e.target.result;
      var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
      if (lines.length < 2) return toast('El archivo necesita al menos una fila de encabezado y una de datos', 'error');
      var headers = lines[0].split(delimiter).map(function(h) { return h.trim().replace(/^"|"$/g, ''); });
      var rawData = [];
      for (var i = 1; i < lines.length; i++) {
        var vals = lines[i].split(delimiter).map(function(v) { return v.trim().replace(/^"|"$/g, ''); });
        var row = {};
        headers.forEach(function(h, idx) { row[h] = vals[idx] || ''; });
        rawData.push(row);
      }
      processImportData(rawData, tipo);
    } catch (err) {
      toast('Error al leer CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// Mapear columnas del archivo a campos del sistema
function mapColumns(rawHeaders, tipo) {
  var config = IMPORT_COLUMNS[tipo];
  var allFields = config.required.concat(config.optional);
  var mapping = {};

  allFields.forEach(function(field) {
    var aliases = config.aliases[field] || [field];
    var found = null;
    rawHeaders.forEach(function(h) {
      var hLower = h.toLowerCase().trim().replace(/[_\-\s]+/g, '_');
      aliases.forEach(function(a) {
        if (hLower === a.toLowerCase().replace(/[_\-\s]+/g, '_') || hLower.indexOf(a.toLowerCase()) !== -1) {
          found = h;
        }
      });
    });
    mapping[field] = found;
  });
  return mapping;
}

// Procesar datos importados
function processImportData(rawData, tipo) {
  var rawHeaders = Object.keys(rawData[0]);
  var mapping = mapColumns(rawHeaders, tipo);
  var config = IMPORT_COLUMNS[tipo];

  // Verificar columnas requeridas
  var missingRequired = config.required.filter(function(f) { return !mapping[f]; });
  if (missingRequired.length > 0) {
    toast('Faltan columnas requeridas: ' + missingRequired.join(', ') + '. Descarga la plantilla para ver el formato.', 'error');
    return;
  }

  // Mapear y validar cada fila
  importParsedData = [];
  importValidationResults = [];

  rawData.forEach(function(raw, idx) {
    var row = {};
    var errors = [];

    Object.keys(mapping).forEach(function(field) {
      var col = mapping[field];
      row[field] = col ? String(raw[col] || '').trim() : '';
    });

    // Validaciones por tipo
    if (tipo === 'clientes') {
      if (!row.nombre || row.nombre.length < 3) errors.push('Nombre inválido (mín. 3 caracteres)');
      if (!row.rfc || (row.rfc.length !== 12 && row.rfc.length !== 13)) errors.push('RFC inválido (' + row.rfc.length + ' chars)');
      row.rfc = (row.rfc || '').toUpperCase();
      row.curp = (row.curp || '').toUpperCase();
      if (!row.tipo || ['fisica', 'moral', 'física'].indexOf(row.tipo.toLowerCase()) === -1) {
        if (row.rfc && row.rfc.length === 12) row.tipo = 'moral';
        else if (row.rfc && row.rfc.length === 13) row.tipo = 'fisica';
        else errors.push('Tipo persona inválido (fisica/moral)');
      } else {
        row.tipo = row.tipo.toLowerCase() === 'física' ? 'fisica' : row.tipo.toLowerCase();
      }
      if (row.email && !V.validEmail(row.email)) errors.push('Email inválido');
      if (row.cp && !V.validCP(row.cp)) errors.push('C.P. inválido');
      row.ingresos = parseFloat(String(row.ingresos).replace(/[,$\s]/g, '')) || 0;
      row.score = parseInt(row.score) || 0;
      // Verificar duplicado RFC
      var existentes = getStore('clientes');
      var prevImported = importParsedData.map(function(r) { return r.rfc; });
      if (row.rfc && (existentes.some(function(c) { return c.rfc === row.rfc; }) || prevImported.indexOf(row.rfc) !== -1)) {
        errors.push('RFC duplicado: ' + row.rfc);
      }
    } else if (tipo === 'fondeos') {
      if (!row.fondeador || row.fondeador.length < 2) errors.push('Fondeador inválido');
      row.monto = parseFloat(String(row.monto).replace(/[,$\s]/g, '')) || 0;
      if (row.monto <= 0) errors.push('Monto debe ser > 0');
      row.tasa = parseFloat(String(row.tasa).replace(/[%,\s]/g, '')) || 0;
      if (row.tasa <= 0 || row.tasa > 100) errors.push('Tasa inválida (0-100%)');
      row.plazo = parseInt(row.plazo) || 0;
      if (row.plazo < 1) errors.push('Plazo debe ser >= 1');
      if (!row.fecha_inicio) errors.push('Fecha inicio obligatoria');
      if (!row.tipo) row.tipo = 'banco';
      if (!row.periodicidad) row.periodicidad = 'mensual';
    }

    row._rowNum = idx + 2; // +2 porque fila 1 es encabezado, y humanos cuentan desde 1
    row._errors = errors;
    importParsedData.push(row);
    importValidationResults.push({ row: idx + 2, errors: errors });
  });

  renderImportPreview(tipo, mapping);
}

// Renderizar preview de importación
function renderImportPreview(tipo, mapping) {
  var card = document.getElementById('importPreviewCard');
  card.style.display = 'block';
  document.getElementById('importResultCard').style.display = 'none';

  var totalRows = importParsedData.length;
  var errorRows = importParsedData.filter(function(r) { return r._errors.length > 0; }).length;
  var validRows = totalRows - errorRows;

  document.getElementById('importStats').textContent = totalRows + ' filas · ' + validRows + ' válidas · ' + errorRows + ' con errores';

  // Mapeo visual
  var config = IMPORT_COLUMNS[tipo];
  var allFields = config.required.concat(config.optional);
  document.getElementById('importMapeo').innerHTML = '<p style="font-size:12px;color:var(--gray-400);margin-bottom:8px">Mapeo de columnas detectado:</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
    allFields.map(function(f) {
      var mapped = mapping[f];
      var isReq = config.required.indexOf(f) !== -1;
      var color = mapped ? 'var(--green)' : (isReq ? 'var(--red)' : 'var(--gray-300)');
      return '<span style="font-size:11px;padding:3px 8px;border-radius:12px;background:' + (mapped ? 'var(--green-light)' : (isReq ? '#FEE2E2' : 'var(--gray-100)')) + ';color:' + color + ';border:1px solid ' + color + '">' +
        f + (mapped ? ' ✓' : (isReq ? ' ✗' : ' —')) + '</span>';
    }).join('') + '</div>';

  // Tabla preview (primeras 20 filas)
  var displayFields = allFields.filter(function(f) { return mapping[f]; });
  displayFields.push('_estado');

  document.getElementById('importPreviewHead').innerHTML = '<tr>' +
    '<th style="width:40px">#</th>' +
    displayFields.map(function(f) { return f === '_estado' ? '<th>Estado</th>' : '<th>' + esc(f) + '</th>'; }).join('') + '</tr>';

  var previewRows = importParsedData.slice(0, 20);
  document.getElementById('importPreviewBody').innerHTML = previewRows.map(function(row) {
    var hasError = row._errors.length > 0;
    return '<tr style="' + (hasError ? 'background:#FEF2F2' : '') + '">' +
      '<td style="font-size:11px;color:var(--gray-400)">' + row._rowNum + '</td>' +
      displayFields.map(function(f) {
        if (f === '_estado') {
          return '<td>' + (hasError ?
            '<span style="color:var(--red);font-size:11px" title="' + esc(row._errors.join('; ')) + '">❌ ' + row._errors.length + ' error(es)</span>' :
            '<span style="color:var(--green);font-size:11px">✅ OK</span>') + '</td>';
        }
        var val = row[f];
        if (typeof val === 'number') val = val.toLocaleString('es-MX');
        return '<td style="font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(String(val || '')) + '</td>';
      }).join('') + '</tr>';
  }).join('') +
  (importParsedData.length > 20 ? '<tr><td colspan="' + (displayFields.length + 1) + '" style="text-align:center;color:var(--gray-400);font-size:12px;padding:12px">... y ' + (importParsedData.length - 20) + ' filas más</td></tr>' : '');

  // Resumen de errores
  if (errorRows > 0) {
    var errorSummary = {};
    importParsedData.forEach(function(r) {
      r._errors.forEach(function(e) { errorSummary[e] = (errorSummary[e] || 0) + 1; });
    });
    document.getElementById('importErrors').innerHTML =
      '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px">' +
      '<strong style="color:var(--red);font-size:13px">⚠️ ' + errorRows + ' fila(s) con errores serán omitidas:</strong>' +
      '<ul style="margin:8px 0 0 16px;font-size:12px;color:#991B1B">' +
      Object.keys(errorSummary).map(function(e) { return '<li>' + esc(e) + ' (' + errorSummary[e] + ')</li>'; }).join('') +
      '</ul></div>';
  } else {
    document.getElementById('importErrors').innerHTML =
      '<div style="background:var(--green-light);border:1px solid var(--green);border-radius:8px;padding:12px;color:#065F46;font-size:13px">✅ Todas las filas son válidas y se importarán correctamente.</div>';
  }

  // Deshabilitar botón si no hay filas válidas
  document.getElementById('btnConfirmImport').disabled = validRows === 0;
  if (validRows === 0) {
    document.getElementById('btnConfirmImport').style.opacity = '0.5';
  } else {
    document.getElementById('btnConfirmImport').style.opacity = '1';
  }
}

function cancelarImport() {
  importParsedData = [];
  importValidationResults = [];
  document.getElementById('importPreviewCard').style.display = 'none';
  document.getElementById('importResultCard').style.display = 'none';
}

// Ejecutar importación
function ejecutarImport() {
  var tipo = document.getElementById('importTipo').value;
  var validRows = importParsedData.filter(function(r) { return r._errors.length === 0; });
  if (validRows.length === 0) return toast('No hay filas válidas para importar', 'error');

  var imported = 0;
  var skipped = importParsedData.length - validRows.length;

  if (tipo === 'clientes') {
    var clientes = getStore('clientes');
    validRows.forEach(function(row) {
      var cliente = {
        id: nextId('clientes'),
        tipo: row.tipo,
        nombre: row.nombre,
        rfc: row.rfc,
        curp: row.curp || '',
        telefono: row.telefono || '',
        email: row.email || '',
        direccion: row.direccion || '',
        ciudad: row.ciudad || '',
        estado: row.estado || '',
        cp: row.cp || '',
        ingresos: row.ingresos || 0,
        score: row.score || 0,
        sector: row.sector || '',
        notas: row.notas || ''
      };
      clientes.push(cliente);
      // Update store after each to ensure nextId works
      setStore('clientes', clientes);
      imported++;
    });
    addAudit('Importar', 'Clientes', imported + ' clientes importados');

  } else if (tipo === 'fondeos') {
    var fondeos = getStore('fondeos');
    validRows.forEach(function(row) {
      var id = nextId('fondeos');
      var fechaInicio = row.fecha_inicio;
      // Intentar parsear fecha
      if (fechaInicio instanceof Date) fechaInicio = fechaInicio.toISOString().split('T')[0];
      else if (typeof fechaInicio === 'string' && fechaInicio.indexOf('/') !== -1) {
        var parts = fechaInicio.split('/');
        if (parts.length === 3) fechaInicio = parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
      }
      var fondeo = {
        id: id,
        numero: 'FD-' + String(id).padStart(3, '0'),
        fondeador: row.fondeador,
        tipo: row.tipo || 'banco',
        monto: row.monto,
        saldo: row.monto,
        tasa: row.tasa / 100,
        plazo: row.plazo,
        periodicidad: row.periodicidad || 'mensual',
        fechaInicio: fechaInicio,
        fechaVencimiento: addMonths(new Date(fechaInicio), row.plazo),
        estado: 'vigente',
        garantia: row.garantia || '',
        notas: row.notas || ''
      };
      fondeos.push(fondeo);
      setStore('fondeos', fondeos);
      imported++;
    });
    addAudit('Importar', 'Fondeos', imported + ' fondeos importados');
  }

  // Mostrar resultado
  document.getElementById('importPreviewCard').style.display = 'none';
  document.getElementById('importResultCard').style.display = 'block';
  document.getElementById('importResultContent').innerHTML =
    '<div style="text-align:center;padding:24px">' +
    '<div style="font-size:48px;margin-bottom:12px">✅</div>' +
    '<h3 style="margin-bottom:8px;color:var(--green)">Importación Completada</h3>' +
    '<p style="font-size:14px;color:var(--gray-600);margin-bottom:16px">' +
    '<strong>' + imported + '</strong> registro(s) importado(s) exitosamente' +
    (skipped > 0 ? '<br><span style="color:var(--orange)">' + skipped + ' fila(s) omitida(s) por errores</span>' : '') +
    '</p>' +
    '<div style="display:flex;gap:10px;justify-content:center">' +
    '<button class="btn btn-primary" onclick="showPage(\'admin\');setAdminTab(\'' + tipo + '\' === \'clientes\' ? \'usuarios\' : \'usuarios\');showPage(\'' + tipo + '\')">Ver ' + (tipo === 'clientes' ? 'Clientes' : 'Fondeos') + '</button>' +
    '<button class="btn btn-outline" onclick="cancelarImport();document.getElementById(\'importFile\').value=\'\'">Nueva Importación</button>' +
    '</div></div>';

  // Limpiar datos
  importParsedData = [];
  importValidationResults = [];
  document.getElementById('importFile').value = '';
  refreshNotifications();
  toast(imported + ' ' + tipo + ' importado(s) exitosamente', 'success');
}

// Descargar plantilla de ejemplo
function descargarPlantilla(tipo) {
  if (!window.XLSX) return toast('Librería XLSX no cargada', 'error');

  var headers, sampleData, sheetName;

  if (tipo === 'clientes') {
    headers = ['nombre', 'rfc', 'tipo', 'curp', 'telefono', 'email', 'direccion', 'ciudad', 'estado', 'cp', 'ingresos', 'score', 'sector', 'notas'];
    sampleData = [
      ['Grupo Industrial del Norte SA de CV', 'GIN200101ABC', 'moral', '', '8112345678', 'contacto@gin.com', 'Av. Constitución 456', 'Monterrey', 'Nuevo León', '64000', 2500000, 720, 'Manufactura', ''],
      ['María López Hernández', 'LOHM850315ABC', 'fisica', 'LOHM850315MNLLRR01', '5523456789', 'maria.lopez@gmail.com', 'Col. Roma Norte #123', 'CDMX', 'CDMX', '06700', 45000, 680, 'Servicios', 'Cliente referido']
    ];
    sheetName = 'Clientes';
  } else if (tipo === 'fondeos') {
    headers = ['fondeador', 'monto', 'tasa', 'plazo', 'fecha_inicio', 'tipo', 'periodicidad', 'garantia', 'notas'];
    sampleData = [
      ['Banco Nacional', 5000000, 12, 36, '2025-01-15', 'banco', 'mensual', 'Cartera de créditos', ''],
      ['Fondo de Inversión Alpha', 2000000, 14, 24, '2025-06-01', 'fondo', 'trimestral', '', 'Renovable']
    ];
    sheetName = 'Fondeos';
  }

  var ws = XLSX.utils.aoa_to_sheet([headers].concat(sampleData));
  ws['!cols'] = headers.map(function(h) { return { wch: Math.max(h.length + 4, 15) }; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, 'AP_Plantilla_' + sheetName + '.xlsx');
  toast('Plantilla ' + sheetName + ' descargada', 'success');
}

