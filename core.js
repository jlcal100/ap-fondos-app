// ====== MODULE: core.js ======
// Logo setup, validation (V object), pagination, data store (getStore/setStore/nextId/guardSave/withTransaction/addAudit/checkVersion/bumpVersion), initial data seeding
// Includes STORE_KEYS, TIPO_CAMBIO, MONEDA_SIMBOLO, MONEDA_LABEL constants, EMPRESA config

// ============================================================
//  CONFIGURACIÓN DE EMPRESA (personalizar aquí para cada cliente)
// ============================================================
const EMPRESA = {
  nombre: 'AP Operadora de Fondos, S.A. de C.V.',
  nombreCorto: 'AP Operadora',
  subtitulo: 'de Fondos',
  razonSocial: 'AP Operadora de Fondos, S.A. de C.V., SOFOM E.N.R.',
  sistemaLabel: 'Sistema Financiero',
  version: 'v1.0',
  copyright: '\u00a9 2026 AP Operadora de Fondos',
  emailAdmin: 'admin@apfondos.com',
  storagePrefix: 'apf_',
  sessionPrefix: 'ap_',
  backupLabel: 'AP Fondos',
  colores: {
    navy: '#1E3050',
    navyDark: '#152238',
    navyLight: '#2B4570',
    red: '#C8102E',
    redDark: '#A00D24',
    redLight: '#E8304A',
  },
  logo: null, // se asigna abajo después de LOGO_DATA
  pldMarco: 'LFPIORPI Art. 17 Fracc. IV (Actividades Vulnerables)',
};

// LOGO (single source of truth)
const LOGO_DATA = "data:image/png;base64,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";
window.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('#sidebarLogo, #topbarLogo, .ap-logo').forEach(function(img) {
    img.src = LOGO_DATA;
  });
});
const LOGO_URL = LOGO_DATA;
EMPRESA.logo = LOGO_DATA;

// ============================================================
//  SPRINT 1 — VALIDACIONES Y UTILIDADES
// ============================================================

const V = {
  // Patrones
  rfcFisica: /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/i,
  rfcMoral:  /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/i,
  curp:      /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]{2}$/i,
  email:     /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  telefono:  /^[\d\s\-\+\(\)]{7,15}$/,
  cp:        /^\d{5}$/,

  // Validar campo y mostrar error visual
  check(id, condition, msg) {
    const el = document.getElementById(id);
    if (!el) return true;
    const parent = el.closest('.form-group') || el.parentElement;
    const existing = parent.querySelector('.field-error');
    if (existing) existing.remove();
    el.style.borderColor = '';
    if (!condition) {
      el.style.borderColor = 'var(--red)';
      const errEl = document.createElement('span');
      errEl.className = 'field-error';
      errEl.textContent = msg;
      parent.appendChild(errEl);
      return false;
    }
    return true;
  },

  // Limpiar todos los errores de un modal
  clearErrors(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.querySelectorAll('.field-error').forEach(e => e.remove());
    modal.querySelectorAll('[style*="border-color"]').forEach(e => e.style.borderColor = '');
  },

  // Validar RFC según tipo persona
  validRFC(rfc, tipo) {
    if (!rfc || rfc.trim() === '') return false;
    return tipo === 'moral' ? V.rfcMoral.test(rfc.trim()) : V.rfcFisica.test(rfc.trim());
  },

  // Validar email (vacío es OK, si tiene valor debe ser válido)
  validEmail(email) {
    if (!email || email.trim() === '') return true;
    return V.email.test(email.trim());
  },

  // Validar teléfono
  validTel(tel) {
    if (!tel || tel.trim() === '') return true;
    return V.telefono.test(tel.trim());
  },

  // Validar CP
  validCP(cp) {
    if (!cp || cp.trim() === '') return true;
    return V.cp.test(cp.trim());
  },

  // Validar CURP
  validCURP(curp) {
    if (!curp || curp.trim() === '') return true;
    return V.curp.test(curp.trim());
  },

  // Verificar duplicados
  duplicateRFC(rfc, excludeId) {
    return getStore('clientes').some(c => c.rfc.toUpperCase() === rfc.toUpperCase() && c.id !== excludeId);
  },

  // Bug #9: Validar política de contraseñas (mín 12 chars, 1 mayúscula, 1 número, 1 especial)
  validPassword(pwd) {
    if (!pwd || pwd.length < 12) return { ok: false, msg: 'Mínimo 12 caracteres' };
    if (!/[A-Z]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos una mayúscula' };
    if (!/[a-z]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos una minúscula' };
    if (!/[0-9]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos un número' };
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) return { ok: false, msg: 'Debe incluir al menos un carácter especial (!@#$%...)' };
    return { ok: true, msg: '' };
  },

  // Número positivo
  positiveNum(val) {
    const n = parseFloat(val);
    return !isNaN(n) && n > 0;
  },

  // Número no negativo
  nonNegNum(val) {
    const n = parseFloat(val);
    return !isNaN(n) && n >= 0;
  }
};

// ============================================================
//  SPRINT 1 — PAGINACIÓN
// ============================================================

const PAGE_SIZE = 15;
const pageState = { clientes: 1, creditos: 1, fondeos: 1, pagos: 1, contabilidad: 1, auditoria: 1 };

// Mejora 8: Filtros persistentes entre páginas
var _FILTROS_PERSISTENTES = ['searchClientes', 'filterTipoCliente', 'searchCreditos', 'filterTipoCredito', 'filterEstadoCredito', 'searchFondeos', 'filterEstadoFondeo', 'filterContaTipo'];

function guardarFiltros() {
  var data = {};
  _FILTROS_PERSISTENTES.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  data._pageState = JSON.parse(JSON.stringify(pageState));
  sessionStorage.setItem('apf_filtros', JSON.stringify(data));
}

function restaurarFiltros() {
  try {
    var data = JSON.parse(sessionStorage.getItem('apf_filtros') || '{}');
    _FILTROS_PERSISTENTES.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && data[id] !== undefined) el.value = data[id];
    });
    if (data._pageState) {
      Object.keys(data._pageState).forEach(function(k) {
        if (pageState.hasOwnProperty(k)) pageState[k] = data._pageState[k];
      });
    }
  } catch(e) {}
}

// Auto-guardar filtros cada vez que cambian
document.addEventListener('input', function(e) {
  if (_FILTROS_PERSISTENTES.indexOf(e.target.id) !== -1) guardarFiltros();
});
document.addEventListener('change', function(e) {
  if (_FILTROS_PERSISTENTES.indexOf(e.target.id) !== -1) guardarFiltros();
});

function paginate(items, module) {
  const page = pageState[module] || 1;
  const total = Math.ceil(items.length / PAGE_SIZE) || 1;
  if (page > total) pageState[module] = total;
  const start = (pageState[module] - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    page: pageState[module],
    total,
    count: items.length
  };
}

function renderPagination(module, totalPages, currentPage, totalItems) {
  const containerId = 'pag' + module.charAt(0).toUpperCase() + module.slice(1);
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = '<span style="color:var(--gray-400);font-size:12px">' + totalItems + ' registro(s)</span>'; return; }
  let html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;font-size:13px">';
  html += '<span style="color:var(--gray-500)">' + totalItems + ' registros — Página ' + currentPage + ' de ' + totalPages + '</span>';
  html += '<div style="display:flex;gap:4px">';
  var renderFn = 'render' + module.charAt(0).toUpperCase() + module.slice(1);
  html += '<button class="btn btn-outline btn-sm" ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="pageState[\'' + module + '\']=' + (currentPage - 1) + ';guardarFiltros();' + renderFn + '()">← Anterior</button>';

  // Números de página (max 5 visibles)
  let startP = Math.max(1, currentPage - 2);
  let endP = Math.min(totalPages, startP + 4);
  if (endP - startP < 4) startP = Math.max(1, endP - 4);
  for (let p = startP; p <= endP; p++) {
    html += '<button class="btn btn-sm ' + (p === currentPage ? 'btn-primary' : 'btn-outline') + '" onclick="pageState[\'' + module + '\']=' + p + ';guardarFiltros();' + renderFn + '()">' + p + '</button>';
  }

  html += '<button class="btn btn-outline btn-sm" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="pageState[\'' + module + '\']=' + (currentPage + 1) + ';guardarFiltros();' + renderFn + '()">Siguiente →</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

// ============================================================
//  DATA STORE (localStorage)
// ============================================================

const STORE_KEYS = ['clientes','creditos','pagos','fondeos','contabilidad','usuarios','auditoria','cotizaciones','valuaciones','aprobaciones','garantias','conciliaciones','bitacora'];

// Bug #6: Sanitización XSS — escapar HTML en datos de usuario
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Sprint Z: Multi-moneda
var TIPO_CAMBIO = { MXN: 1, USD: 17.25, UDI: 8.15 };
var MONEDA_SIMBOLO = { MXN: '$', USD: 'US$', UDI: 'UDI ' };
var MONEDA_LABEL = { MXN: 'MXN', USD: 'USD', UDI: 'UDI' };

function fmtMoneda(monto, moneda) {
  moneda = moneda || 'MXN';
  var sym = MONEDA_SIMBOLO[moneda] || '$';
  if (moneda === 'MXN') return fmt(monto);
  return sym + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto);
}
function toMXN(monto, moneda) {
  monto = parseFloat(monto) || 0;
  moneda = moneda || 'MXN';
  return monto * (TIPO_CAMBIO[moneda] || 1);
}
function editarTipoCambio() {
  var html = '<p style="margin-bottom:12px;color:var(--text-muted)">Configura los tipos de cambio vigentes para conversión a MXN.</p>';
  html += '<div class="form-row-3">';
  html += '<div class="form-group"><label class="form-label">USD → MXN</label><input type="number" class="form-input" id="tcUSD" value="' + TIPO_CAMBIO.USD + '" step="0.01" min="0"></div>';
  html += '<div class="form-group"><label class="form-label">UDI → MXN</label><input type="number" class="form-input" id="tcUDI" value="' + TIPO_CAMBIO.UDI + '" step="0.01" min="0"></div>';
  html += '<div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-red btn-sm" onclick="guardarTipoCambio()" style="width:100%">Guardar</button></div>';
  html += '</div>';
  openModal('modalGenerico');
  document.getElementById('modalGenericoTitle').textContent = '💱 Tipos de Cambio';
  document.getElementById('modalGenericoBody').innerHTML = html;
}
function guardarTipoCambio() {
  TIPO_CAMBIO.USD = parseFloat(document.getElementById('tcUSD').value) || 17.25;
  TIPO_CAMBIO.UDI = parseFloat(document.getElementById('tcUDI').value) || 8.15;
  localStorage.setItem('ap_tipo_cambio', JSON.stringify(TIPO_CAMBIO));
  _forceCloseModal('modalGenerico');
  toast('Tipos de cambio actualizados: USD=' + TIPO_CAMBIO.USD + ', UDI=' + TIPO_CAMBIO.UDI, 'success');
  addAudit('Actualizar', 'Sistema', 'Tipos de cambio: USD=' + TIPO_CAMBIO.USD + ', UDI=' + TIPO_CAMBIO.UDI);
}
// Cargar tipo de cambio guardado
(function() {
  try { var tc = JSON.parse(localStorage.getItem('ap_tipo_cambio')); if (tc) { TIPO_CAMBIO.USD = tc.USD || 17.25; TIPO_CAMBIO.UDI = tc.UDI || 8.15; } } catch(e) {}
})();

function getStore(key) {
  // Use API client if available and logged in
  if (typeof ApiClient !== 'undefined' && ApiClient.isLoggedIn()) {
    return ApiClient.read(key);
  }
  // Fallback to localStorage
  try { return JSON.parse(localStorage.getItem('apf_' + key)) || []; } catch(e) { return []; }
}
function setStore(key, data) {
  // Use API client if available and logged in
  if (typeof ApiClient !== 'undefined' && ApiClient.isLoggedIn()) {
    ApiClient.write(key, data);
    return;
  }
  // Fallback to localStorage
  try {
    localStorage.setItem('apf_' + key, JSON.stringify(data));
    checkStorageUsage();
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      toast('⚠️ Almacenamiento lleno. Exporta un backup y limpia datos antiguos.', 'error');
    } else { throw e; }
  }
}

// Bug #31: Monitor de uso de localStorage
function checkStorageUsage() {
  let total = 0;
  for (let k in localStorage) {
    if (localStorage.hasOwnProperty(k) && k.startsWith('apf_')) {
      total += localStorage.getItem(k).length * 2; // UTF-16
    }
  }
  const maxBytes = 5 * 1024 * 1024; // 5MB estimado
  const pct = (total / maxBytes * 100).toFixed(1);
  const el = document.getElementById('storageIndicator');
  if (el) {
    el.textContent = pct + '%';
    el.style.color = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)';
    el.title = 'Uso de almacenamiento: ' + (total / 1024).toFixed(0) + 'KB de ~5MB';
  }
  if (pct > 80) toast('⚠️ Almacenamiento al ' + pct + '%. Considera exportar un backup.', 'warning');
}

// Bug #33: Transacción atómica simulada
function withTransaction(operations) {
  // Guardar snapshot antes de las operaciones
  const snapshot = {};
  const keys = ['clientes', 'creditos', 'pagos', 'fondeos', 'contabilidad', 'usuarios', 'auditoria'];
  keys.forEach(k => { snapshot[k] = localStorage.getItem('apf_' + k); });
  try {
    operations();
    return true;
  } catch (e) {
    // Rollback: restaurar snapshot
    keys.forEach(k => {
      if (snapshot[k] !== null) localStorage.setItem('apf_' + k, snapshot[k]);
      else localStorage.removeItem('apf_' + k);
    });
    toast('Error en la operación. Datos restaurados.', 'error');
    console.error('Transaction rollback:', e);
    return false;
  }
}

// Bug #37: IDs con timestamp para menos predecibilidad
function nextId(key) {
  const items = getStore(key);
  const maxId = items.length > 0 ? Math.max(...items.map(i => i.id || 0)) : 0;
  return maxId + 1;
}

// Guard contra doble-click en botones de guardar
var _guardSaving = {};
function guardSave(key) {
  if (_guardSaving[key]) return false;
  _guardSaving[key] = true;
  setTimeout(function() { _guardSaving[key] = false; }, 1500);
  return true;
}

// Bug #38: Auditoría mejorada con datos antes/después y usuario actual
function addAudit(accion, modulo, detalle, datosAntes, datosNuevos) {
  const logs = getStore('auditoria');
  const entry = {
    id: logs.length + 1,
    fecha: new Date().toISOString(),
    usuario: currentUser ? currentUser.nombre : 'Sistema',
    accion,
    modulo,
    detalle: detalle || ''
  };
  // Bug #35: Versionado — guardar datos anteriores y nuevos
  if (datosAntes !== undefined) entry.datosAntes = datosAntes;
  if (datosNuevos !== undefined) entry.datosNuevos = datosNuevos;
  logs.push(entry);
  // Limitar auditoría a últimos 500 registros para no saturar storage
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  setStore('auditoria', logs);
}

// Bug #36: Bloqueo optimista — verificar versión antes de guardar
function checkVersion(key, id, expectedVersion) {
  const item = getStore(key).find(x => x.id === id);
  if (!item) return true; // nuevo registro
  return (item._version || 0) === (expectedVersion || 0);
}
function bumpVersion(obj) {
  obj._version = (obj._version || 0) + 1;
  return obj;
}

// Init default data if empty
function initData() {
  if (getStore('usuarios').length === 0) {
    setStore('usuarios', [
      { id: 1, nombre: 'Administrador', email: 'admin@apfondos.com', rol: 'admin', activo: true, ultimoAcceso: new Date().toISOString() }
    ]);
  }
  // Seed data
  if (getStore('clientes').length === 0) {
    setStore('clientes', [
      { id: 1, tipo: 'fisica', nombre: 'Juan Pérez López', rfc: 'PELJ850101ABC', curp: 'PELJ850101HDFRPN09', telefono: '5551234567', email: 'juan@empresa.com', direccion: 'Av. Reforma 123, Col. Centro', ciudad: 'CDMX', estado: 'CDMX', cp: '06600', ingresos: 45000, score: 720, sector: 'Comercio', notas: 'Cliente referido' },
      { id: 2, tipo: 'moral', nombre: 'Comercializadora ABC, S.A. de C.V.', rfc: 'CAB200315XX0', curp: '', telefono: '8112345678', email: 'contacto@abc.com.mx', direccion: 'Blvd. Insurgentes 456', ciudad: 'Monterrey', estado: 'Nuevo León', cp: '64000', ingresos: 350000, score: 680, sector: 'Manufactura', notas: '' },
      { id: 3, tipo: 'fisica', nombre: 'XOCHIL MERARI MARAVILLA DE LA ROSA', rfc: 'MARX940201DA1', curp: 'MARX940201MMCRSC03', telefono: '7222691304', email: 'xochitlmaravilla44@gmail.com', direccion: 'SAN ANTONIO 8 COL.RIO HONDITO', ciudad: 'OCOYOACAC', estado: 'Estado de México', cp: '52740', ingresos: 9500, score: 0, sector: 'Comercio', notas: 'Oficial Gasolinero' },
      { id: 4, tipo: 'moral', nombre: 'CORPORATIVO AP SA DE CV', rfc: 'CAP1506113H1', curp: '', telefono: '7222321614', email: 'apfondos@corporativoap.com.mx', direccion: 'AV.TECNOLOGICO 1131 NORTE COL.BELLAVISTA', ciudad: 'METEPEC', estado: 'Estado de México', cp: '52172', ingresos: 10000000, score: 0, sector: 'Comercio', notas: 'Compra Venta Gasolina y Diesel' },
      { id: 5, tipo: 'fisica', nombre: 'ANDREA MARIN GASCA', rfc: 'MAGA9412158J1', curp: 'MAGA941215MDFRSN09', telefono: '7223819790', email: 'andyadriel041518@gmail.com', direccion: 'FRANCISCO VILLA S/N COL.GUADALUPE', ciudad: 'LERMA', estado: 'Estado de México', cp: '52000', ingresos: 9500, score: 0, sector: 'Comercio', notas: 'Oficial Gasolinero' },
      { id: 6, tipo: 'moral', nombre: 'ENERGETICOS ENCINOS SA DE CV', rfc: 'EEN110211JN3', curp: '', telefono: '7222105606', email: 'encinos179@corporativoap.com.mx', direccion: 'AV. 5 DE MAYO 718 COL.LAS AMERICAS', ciudad: 'TOLUCA', estado: 'Estado de México', cp: '50130', ingresos: 4000000, score: 0, sector: 'Comercio', notas: 'Compra Venta Gasolina y Diesel' }
    ]);
  }
  if (getStore('creditos').length === 0) {
    // clienteId mapping: PELJ=1, CAB=2, MARX=3, CAP=4, MAGA=5, EEN=6
    const cred1 = crearCreditoObj(1, 'CS-001', 1, 'credito_simple', 1500000, 0.24, 0.36, 24, 'mensual', '2025-01-15', 0, 0, 15000);
    cred1.pagosRealizados = 14; cred1.saldo = 662500; cred1.notas = 'Capital de trabajo - 14 de 24 pagos';
    const cred2 = crearCreditoObj(2, 'AR-001', 2, 'arrendamiento', 2000000, 0.22, 0.33, 36, 'mensual', '2025-03-01', 10, 2000000, 20000);
    cred2.pagosRealizados = 12; cred2.saldo = 1425000; cred2.notas = 'Maquinaria CNC - 12 de 36 pagos';
    const cred3 = crearCreditoObj(3, 'NM-001', 1, 'nomina', 50000, 0.28, 0.42, 12, 'quincenal', '2025-06-01', 0, 0, 500);
    cred3.pagosRealizados = 15; cred3.saldo = 18750; cred3.notas = 'Préstamo nómina - 15 de 24 periodos';
    const cred4 = crearCreditoObj(4, 'NM-002', 5, 'nomina', 12348, 0.40, 0.76, 24, 'quincenal', '2026-04-15', 0, 0, 348);
    cred4.pagosRealizados = 0; cred4.saldo = 12348; cred4.notas = 'Prestamo nómina 24 quincenas';
    const cred5 = crearCreditoObj(5, 'CS-002', 6, 'credito_simple', 602262, 0.15, 0.30, 35, 'mensual', '2025-12-16', 0, 0, 0);
    cred5.pagosRealizados = 3; cred5.saldo = 561687.30; cred5.notas = 'Mutuo 35 meses';
    const cred6 = crearCreditoObj(6, 'NM-003', 3, 'nomina', 40464, 0.36, 0.60, 24, 'mensual', '2026-03-31', 0, 0, 464);
    cred6.pagosRealizados = 4; cred6.saldo = 40464; cred6.notas = 'Préstamo nómina - 24 meses';
    const cred7 = crearCreditoObj(7, 'AR-002', 4, 'arrendamiento', 263754.20, 0.26, 0.48, 12, 'mensual', '2026-03-25', 5, 305954.87, 0);
    cred7.pagosRealizados = 1; cred7.saldo = 315663.95; cred7.notas = 'Camry refinanciamiento';
    setStore('creditos', [cred1, cred2, cred3, cred4, cred5, cred6, cred7]);
  }
  if (getStore('fondeos').length === 0) {
    setStore('fondeos', [
      { id: 1, numero: 'FD-001', fondeador: 'Banco Nacional de México', tipo: 'linea_credito', monto: 5000000, saldo: 5000000, tasa: 0.12, plazo: 36, periodicidad: 'mensual', fechaInicio: '2025-01-01', fechaVencimiento: addMonths(new Date('2025-01-01'), 36), estado: 'vigente', garantia: 'Cartera crediticia', moneda: 'MXN', notas: 'Línea revolvente' },
      { id: 2, numero: 'FD-002', fondeador: 'Inversionista Privado A', tipo: 'prestamo', monto: 2000000, saldo: 2000000, tasa: 0.15, plazo: 24, periodicidad: 'mensual', fechaInicio: '2025-02-01', fechaVencimiento: addMonths(new Date('2025-02-01'), 24), estado: 'vigente', garantia: 'Pagaré', moneda: 'MXN', notas: '' },
      { id: 3, numero: 'FD-003', fondeador: 'Banco Mercantil del Norte', tipo: 'linea_credito', monto: 1000000, saldo: 1000000, tasa: 0.1475, plazo: 60, periodicidad: 'mensual', fechaInicio: '2023-07-15', fechaVencimiento: addMonths(new Date('2023-07-15'), 60), estado: 'vigente', garantia: 'Pagaré', moneda: 'MXN', notas: 'Amortizable tasa fija' },
      { id: 4, numero: 'FD-004', fondeador: 'MULTISERVICIOS DUAL SA DE CV', tipo: 'cuenta_corriente', monto: 2900000, saldo: 2900000, tasa: 0.12, plazo: 24, periodicidad: 'mensual', fechaInicio: '2025-05-05', fechaVencimiento: addMonths(new Date('2025-05-05'), 24), estado: 'vigente', garantia: 'Pagaré', moneda: 'MXN', notas: 'Revolvente tasa fija' }
    ]);
  }
  if (getStore('tiie_historico').length === 0) {
    setStore('tiie_historico', [
      { id: 1, fecha: '2025-01-09', tasa: 0.1025, fuente: 'Banxico' },
      { id: 2, fecha: '2025-03-28', tasa: 0.0950, fuente: 'Banxico' },
      { id: 3, fecha: '2025-06-27', tasa: 0.0875, fuente: 'Banxico' },
      { id: 4, fecha: '2025-09-26', tasa: 0.0800, fuente: 'Banxico' },
      { id: 5, fecha: '2025-12-19', tasa: 0.0750, fuente: 'Banxico' },
      { id: 6, fecha: '2026-03-27', tasa: 0.0701, fuente: 'Banxico' }
    ]);
  }
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

// Get the current (most recent) TIIE rate
function getTIIEVigente() {
  const tiieHist = getStore('tiie_historico') || [];
  if (tiieHist.length === 0) return 0.0701; // fallback TIIE ~7.01%
  // Sort by date descending and return most recent
  const sorted = tiieHist.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return sorted[0].tasa || 0.0701;
}

// Recalculate effective rates for all variable-rate credits/fondeos when TIIE changes
function actualizarTasasVariables() {
  const tiieVigente = getTIIEVigente();
  const hoy = new Date().toISOString().split('T')[0];

  // Update credits — new TIIE applies from NEXT unpaid period (anticipación de 1 periodo)
  let creditos = getStore('creditos') || [];
  creditos = creditos.map(c => {
    if (c.tipoTasa === 'variable') {
      const tasaEfectivaNueva = +(tiieVigente + c.spread).toFixed(4);
      const tasaEfectivaAnterior = c.tasa;
      if (Math.abs(tasaEfectivaNueva - tasaEfectivaAnterior) > 0.00001) {
        if (!c.historialTasas) c.historialTasas = [];
        c.historialTasas.push({
          fecha: hoy,
          tiie: tiieVigente,
          spread: c.spread,
          tasaEfectiva: tasaEfectivaNueva,
          aplicaDesde: null
        });

        if (c.amortizacion && c.amortizacion.length > 0) {
          const periodoActual = c.amortizacion.findIndex(p => !p.pagado);
          if (periodoActual >= 0) {
            // New rate applies from NEXT period, not current
            const periodoAplica = periodoActual + 1;
            c.historialTasas[c.historialTasas.length - 1].aplicaDesde =
              periodoAplica < c.amortizacion.length ? c.amortizacion[periodoAplica].fecha : hoy;

            if (periodoAplica < c.amortizacion.length) {
              c.tasaReferencia = tiieVigente;
              c.tasaPendiente = tasaEfectivaNueva;
              c.tasaPendienteDesde = c.amortizacion[periodoAplica].fecha;
              const saldoEnPeriodo = c.amortizacion[periodoAplica].saldoInicial;
              const periodosRestantes = c.amortizacion.length - periodoAplica;
              const amortNueva = generarAmortizacion(saldoEnPeriodo, tasaEfectivaNueva, periodosRestantes, c.periodicidad, c.amortizacion[periodoAplica].fecha, 0, 0, c.tipo);
              c.amortizacion = c.amortizacion.slice(0, periodoAplica).concat(
                amortNueva.map((p, idx) => ({ ...p, numero: periodoAplica + idx + 1 }))
              );
              c.tasa = tasaEfectivaNueva;
            }
          }
        } else {
          c.tasa = tasaEfectivaNueva;
          c.tasaReferencia = tiieVigente;
        }
      }
    }
    return c;
  });
  setStore('creditos', creditos);

  // Update fondeos — new TIIE applies from next interest period
  let fondeos = getStore('fondeos') || [];
  fondeos = fondeos.map(f => {
    if (f.tipoTasa === 'variable') {
      const tasaEfectivaNueva = +(tiieVigente + f.spread).toFixed(4);
      const tasaEfectivaAnterior = f.tasa;
      if (Math.abs(tasaEfectivaNueva - tasaEfectivaAnterior) > 0.00001) {
        if (!f.historialTasas) f.historialTasas = [];
        var proximoPeriodo = hoy;
        if (f.periodicidad) {
          var mesesPeriodo = f.periodicidad === 'mensual' ? 1 : f.periodicidad === 'trimestral' ? 3 : f.periodicidad === 'semestral' ? 6 : 12;
          proximoPeriodo = addMonths(hoy, mesesPeriodo);
        }
        f.historialTasas.push({
          fecha: hoy,
          tiie: tiieVigente,
          spread: f.spread,
          tasaEfectiva: tasaEfectivaNueva,
          aplicaDesde: proximoPeriodo
        });
        f.tasaReferencia = tiieVigente;
        f.tasaPendiente = tasaEfectivaNueva;
        f.tasaPendienteDesde = proximoPeriodo;
        f.tasa = tasaEfectivaNueva;
      }
    }
    return f;
  });
  setStore('fondeos', fondeos);
}
