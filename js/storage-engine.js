// ====== MODULE: storage-engine.js ======
// Enhanced localStorage engine with compression, archival, and quota management

var StorageEngine = (function() {
  'use strict';

  var PREFIX = 'apf_';
  var ARCHIVE_PREFIX = 'apf_arch_';
  var META_KEY = 'apf__meta';
  var COMPRESSION_ENABLED = true;
  var WARN_THRESHOLD = 0.80; // Warn at 80% usage
  var CRITICAL_THRESHOLD = 0.95; // Critical at 95%

  // ===== Simple compression using LZW variant =====
  function compress(str) {
    if (!str || str.length === 0) return str;
    try {
      var dict = {};
      var data = (str + '').split('');
      var out = [];
      var currChar;
      var phrase = data[0];
      var code = 256;
      for (var i = 1; i < data.length; i++) {
        currChar = data[i];
        if (dict[phrase + currChar] != null) {
          phrase += currChar;
        } else {
          out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
          dict[phrase + currChar] = code;
          code++;
          phrase = currChar;
        }
      }
      out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
      // Encode as string
      var result = '';
      for (var j = 0; j < out.length; j++) {
        result += String.fromCharCode(out[j]);
      }
      return result;
    } catch (e) {
      console.warn('Compression failed, storing raw:', e);
      return str;
    }
  }

  function decompress(str) {
    if (!str || str.length === 0) return str;
    try {
      var dict = {};
      var data = str.split('');
      var currChar = data[0];
      var oldPhrase = currChar;
      var out = [currChar];
      var code = 256;
      var phrase;
      for (var i = 1; i < data.length; i++) {
        var currCode = data[i].charCodeAt(0);
        if (currCode < 256) {
          phrase = data[i];
        } else {
          phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
        }
        out.push(phrase);
        currChar = phrase.charAt(0);
        dict[code] = oldPhrase + currChar;
        code++;
        oldPhrase = phrase;
      }
      return out.join('');
    } catch (e) {
      console.warn('Decompression failed, returning raw:', e);
      return str;
    }
  }

  // ===== Storage size utilities =====
  function getStorageUsedBytes() {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      var val = localStorage.getItem(key);
      total += (key.length + val.length) * 2; // UTF-16 = 2 bytes per char
    }
    return total;
  }

  function getStorageQuota() {
    // Most browsers allow 5-10MB; we estimate 5MB as safe minimum
    return 5 * 1024 * 1024;
  }

  function getUsagePercent() {
    return getStorageUsedBytes() / getStorageQuota();
  }

  function getDetailedUsage() {
    var usage = {};
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.indexOf(PREFIX) === 0) {
        var val = localStorage.getItem(key);
        var bytes = (key.length + val.length) * 2;
        usage[key] = {
          bytes: bytes,
          kb: +(bytes / 1024).toFixed(2),
          records: 0
        };
        total += bytes;
        // Try to count records
        try {
          var parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            usage[key].records = parsed.length;
          }
        } catch(e) {}
      }
    }
    usage._total = { bytes: total, kb: +(total / 1024).toFixed(2), mb: +(total / (1024*1024)).toFixed(3) };
    usage._percent = +(getUsagePercent() * 100).toFixed(1);
    usage._quota = { bytes: getStorageQuota(), mb: +(getStorageQuota() / (1024*1024)).toFixed(1) };
    return usage;
  }

  // ===== Core read/write with compression =====
  function read(key) {
    var fullKey = PREFIX + key;
    var raw = localStorage.getItem(fullKey);
    if (raw === null) return [];

    try {
      // Try direct JSON parse first (uncompressed / backward compat)
      return JSON.parse(raw);
    } catch(e) {
      // Try decompress
      try {
        var decompressed = decompress(raw);
        return JSON.parse(decompressed);
      } catch(e2) {
        console.error('Failed to read store:', key, e2);
        return [];
      }
    }
  }

  function write(key, data) {
    var fullKey = PREFIX + key;
    var json = JSON.stringify(data);

    try {
      if (COMPRESSION_ENABLED && json.length > 1024) {
        // Only compress if data is > 1KB (compression overhead not worth it for small data)
        var compressed = compress(json);
        // Only use compressed if it's actually smaller
        if (compressed.length < json.length * 0.9) {
          localStorage.setItem(fullKey, compressed);
        } else {
          localStorage.setItem(fullKey, json);
        }
      } else {
        localStorage.setItem(fullKey, json);
      }
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
        console.error('localStorage QUOTA EXCEEDED for key:', key);
        // Try to auto-archive old data
        var archived = autoArchive();
        if (archived) {
          // Retry after archival
          try {
            localStorage.setItem(fullKey, json);
          } catch(e2) {
            throw new Error('STORAGE_FULL: No se pudo guardar ' + key + ' incluso después de archivar datos. Exporte un backup y limpie datos antiguos.');
          }
        } else {
          throw new Error('STORAGE_FULL: localStorage lleno. Exporte un backup y elimine datos antiguos.');
        }
      } else {
        throw e;
      }
    }

    // Check usage after write
    var usage = getUsagePercent();
    if (usage >= CRITICAL_THRESHOLD) {
      console.warn('CRITICAL: localStorage usage at ' + (usage * 100).toFixed(1) + '%');
      if (typeof toast === 'function') {
        toast('ALERTA CRÍTICA: Almacenamiento al ' + (usage * 100).toFixed(0) + '%. Archive datos antiguos o exporte un backup.', 'error', 10000);
      }
    } else if (usage >= WARN_THRESHOLD) {
      console.warn('WARNING: localStorage usage at ' + (usage * 100).toFixed(1) + '%');
    }
  }

  // ===== Archival system =====
  function archiveKey(key, filterFn) {
    var data = read(key);
    if (!Array.isArray(data) || data.length === 0) return 0;

    var toArchive = data.filter(filterFn);
    var toKeep = data.filter(function(item) { return !filterFn(item); });

    if (toArchive.length === 0) return 0;

    // Read existing archive
    var archKey = ARCHIVE_PREFIX + key;
    var existing = [];
    try {
      var raw = localStorage.getItem(archKey);
      if (raw) existing = JSON.parse(raw);
    } catch(e) {}

    // Append to archive
    var archived = existing.concat(toArchive);
    try {
      localStorage.setItem(archKey, JSON.stringify(archived));
    } catch(e) {
      // If archive itself is too big, just discard oldest archived items
      archived = archived.slice(-500); // Keep last 500
      localStorage.setItem(archKey, JSON.stringify(archived));
    }

    // Write back only active data
    write(key, toKeep);

    return toArchive.length;
  }

  function autoArchive() {
    var totalArchived = 0;
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    var cutoff = sixMonthsAgo.toISOString().slice(0, 10);

    // Archive old audit records (> 6 months)
    totalArchived += archiveKey('auditoria', function(a) {
      return a.fecha && a.fecha < cutoff;
    });

    // Archive old contabilidad from closed periods
    totalArchived += archiveKey('contabilidad', function(c) {
      return c.fecha && c.fecha < cutoff;
    });

    // Archive liquidated credits older than 6 months
    totalArchived += archiveKey('creditos', function(c) {
      return (c.estado === 'liquidado' || c.estado === 'castigado') && c.fechaInicio && c.fechaInicio < cutoff;
    });

    // Archive old payments for archived credits
    totalArchived += archiveKey('pagos', function(p) {
      return p.fecha && p.fecha < cutoff;
    });

    // Archive old conciliaciones
    totalArchived += archiveKey('conciliaciones', function(c) {
      return c.createdAt && c.createdAt < cutoff;
    });

    // Archive old bitacora entries
    totalArchived += archiveKey('bitacora', function(b) {
      return b.fecha && b.fecha < cutoff;
    });

    if (totalArchived > 0) {
      console.log('Auto-archived ' + totalArchived + ' old records to free space');
    }

    return totalArchived;
  }

  function getArchived(key) {
    var archKey = ARCHIVE_PREFIX + key;
    try {
      var raw = localStorage.getItem(archKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  }

  function clearArchive(key) {
    localStorage.removeItem(ARCHIVE_PREFIX + key);
  }

  function clearAllArchives() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf(ARCHIVE_PREFIX) === 0) keys.push(k);
    }
    keys.forEach(function(k) { localStorage.removeItem(k); });
    return keys.length;
  }

  // ===== Stress test utility =====
  function stressTest(options) {
    options = options || {};
    var numClientes = options.clientes || 100;
    var numCreditos = options.creditos || 500;
    var numPagos = options.pagos || 2000;
    var numContab = options.contabilidad || 3000;
    var numAudit = options.auditoria || 5000;

    var results = { before: getDetailedUsage(), generated: {}, after: null, duration: 0 };
    var start = Date.now();

    // Generate fake clients
    var clientes = read('clientes');
    var baseClienteId = clientes.length > 0 ? Math.max.apply(null, clientes.map(function(c){return c.id||0})) + 1 : 1;
    for (var i = 0; i < numClientes; i++) {
      clientes.push({
        id: baseClienteId + i,
        tipo: i % 3 === 0 ? 'moral' : 'fisica',
        nombre: 'Cliente Stress Test #' + (baseClienteId + i),
        rfc: 'XAXX' + String(100000 + i) + 'XX' + (i % 10),
        email: 'stress' + i + '@test.com',
        telefono: '55' + String(10000000 + i),
        ingresos: Math.round(Math.random() * 5000000),
        score: Math.round(300 + Math.random() * 600),
        sector: ['comercio','servicios','manufactura','agro'][i % 4],
        _version: 1
      });
    }
    write('clientes', clientes);
    results.generated.clientes = numClientes;

    // Generate fake credits with amortization tables
    var creditos = read('creditos');
    var baseCreditoId = creditos.length > 0 ? Math.max.apply(null, creditos.map(function(c){return c.id||0})) + 1 : 1;
    for (var i = 0; i < numCreditos; i++) {
      var monto = Math.round(100000 + Math.random() * 9900000);
      var plazo = [6, 12, 18, 24, 36][i % 5];
      var tasa = +(0.12 + Math.random() * 0.24).toFixed(4);
      var amort = [];
      var saldoTemp = monto;
      var pagoMensual = monto * (tasa/12) / (1 - Math.pow(1 + tasa/12, -plazo));
      for (var j = 0; j < plazo; j++) {
        var interes = +(saldoTemp * tasa / 12).toFixed(2);
        var capital = +(pagoMensual - interes).toFixed(2);
        saldoTemp = +(saldoTemp - capital).toFixed(2);
        if (saldoTemp < 0) saldoTemp = 0;
        amort.push({
          numero: j + 1,
          fecha: '2025-' + String(1 + (j % 12)).padStart(2,'0') + '-15',
          capital: capital,
          interes: interes,
          iva: +(interes * 0.16).toFixed(2),
          total: +(capital + interes + interes * 0.16).toFixed(2),
          saldo: saldoTemp,
          pagado: j < plazo - 6 ? true : false
        });
      }
      creditos.push({
        id: baseCreditoId + i,
        numero: 'ST-' + String(baseCreditoId + i).padStart(4, '0'),
        clienteId: baseClienteId + (i % numClientes),
        tipo: ['credito_simple','arrendamiento','nomina','cuenta_corriente'][i % 4],
        monto: monto,
        saldo: saldoTemp,
        saldoActual: saldoTemp,
        tasa: tasa,
        tasaMora: +(tasa * 1.5).toFixed(4),
        plazo: plazo,
        periodicidad: 'mensual',
        fechaInicio: '2024-' + String(1 + (i % 12)).padStart(2,'0') + '-01',
        estado: ['vigente','vigente','vigente','vencido','liquidado'][i % 5],
        diasMora: i % 5 === 3 ? Math.round(Math.random() * 180) : 0,
        comision: +(monto * 0.02).toFixed(2),
        pago: +pagoMensual.toFixed(2),
        amortizacion: amort,
        moneda: 'MXN',
        _version: 1
      });
    }
    write('creditos', creditos);
    results.generated.creditos = numCreditos;

    // Generate fake payments
    var pagos = read('pagos');
    var basePagoId = pagos.length > 0 ? Math.max.apply(null, pagos.map(function(p){return p.id||0})) + 1 : 1;
    for (var i = 0; i < numPagos; i++) {
      var creditoIdx = i % numCreditos;
      var credRef = creditos[creditos.length - numCreditos + creditoIdx];
      pagos.push({
        id: basePagoId + i,
        creditoId: credRef ? credRef.id : 1,
        numero: 'PST-' + String(basePagoId + i).padStart(5, '0'),
        fecha: '2025-' + String(1 + (i % 12)).padStart(2,'0') + '-' + String(1 + (i % 28)).padStart(2,'0'),
        monto: Math.round(5000 + Math.random() * 50000),
        capital: Math.round(3000 + Math.random() * 30000),
        interes: Math.round(1000 + Math.random() * 15000),
        iva: Math.round(100 + Math.random() * 2000),
        mora: i % 10 === 0 ? Math.round(Math.random() * 5000) : 0,
        metodo: ['transferencia','cheque','efectivo','tarjeta'][i % 4],
        referencia: 'REF-' + String(100000 + i),
        _version: 1
      });
    }
    write('pagos', pagos);
    results.generated.pagos = numPagos;

    // Generate fake contabilidad
    var contab = read('contabilidad');
    var baseContabId = contab.length > 0 ? Math.max.apply(null, contab.map(function(c){return c.id||0})) + 1 : 1;
    for (var i = 0; i < numContab; i++) {
      contab.push({
        id: baseContabId + i,
        fecha: '2025-' + String(1 + (i % 12)).padStart(2,'0') + '-' + String(1 + (i % 28)).padStart(2,'0'),
        periodo: '2025-' + String(1 + (i % 12)).padStart(2,'0'),
        concepto: 'Registro stress test #' + i,
        tipo: ['ingreso_intereses','pago_recibido','colocacion','comision','gasto_operativo'][i % 5],
        monto: Math.round(1000 + Math.random() * 100000),
        cuentaDebe: ['1101','1201','1301','2101'][i % 4],
        cuentaHaber: ['4101','1101','1201','1101'][i % 4],
        referencia: 'CONT-' + i
      });
    }
    write('contabilidad', contab);
    results.generated.contabilidad = numContab;

    // Generate fake auditoria
    var audit = read('auditoria');
    var baseAuditId = audit.length > 0 ? Math.max.apply(null, audit.map(function(a){return a.id||0})) + 1 : 1;
    for (var i = 0; i < numAudit; i++) {
      audit.push({
        id: baseAuditId + i,
        fecha: new Date(2024, i % 12, 1 + (i % 28)).toISOString(),
        usuario: 'StressTest',
        accion: ['Crear','Actualizar','Eliminar','Exportar'][i % 4],
        modulo: ['Clientes','Créditos','Pagos','Contabilidad','Fondeos'][i % 5],
        detalle: 'Operación stress test #' + i
      });
    }
    write('auditoria', audit);
    results.generated.auditoria = numAudit;

    results.after = getDetailedUsage();
    results.duration = Date.now() - start;

    return results;
  }

  function cleanStressTest() {
    // Remove all stress test data
    var keys = ['clientes','creditos','pagos','contabilidad','auditoria'];
    var removed = 0;
    keys.forEach(function(key) {
      var data = read(key);
      var before = data.length;
      data = data.filter(function(item) {
        if (key === 'clientes') return !item.nombre || item.nombre.indexOf('Stress Test') === -1;
        if (key === 'creditos') return !item.numero || item.numero.indexOf('ST-') === -1;
        if (key === 'pagos') return !item.numero || item.numero.indexOf('PST-') === -1;
        if (key === 'contabilidad') return !item.concepto || item.concepto.indexOf('stress test') === -1;
        if (key === 'auditoria') return !item.usuario || item.usuario !== 'StressTest';
        return true;
      });
      removed += before - data.length;
      write(key, data);
    });
    clearAllArchives();
    return removed;
  }

  // ===== Public API =====
  return {
    read: read,
    write: write,
    compress: compress,
    decompress: decompress,
    getUsage: getDetailedUsage,
    getUsagePercent: getUsagePercent,
    archive: archiveKey,
    autoArchive: autoArchive,
    getArchived: getArchived,
    clearArchive: clearArchive,
    clearAllArchives: clearAllArchives,
    stressTest: stressTest,
    cleanStressTest: cleanStressTest,
    setCompression: function(enabled) { COMPRESSION_ENABLED = enabled; },
    isCompressed: function(key) {
      var raw = localStorage.getItem(PREFIX + key);
      if (!raw) return false;
      try { JSON.parse(raw); return false; } catch(e) { return true; }
    }
  };
})();
