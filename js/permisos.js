// ====== MODULE: permisos.js ======
// SISTEMA DE PERMISOS Y ROLES — PERMISOS_MODULOS, ROL_PERMISOS_DEFAULT, hasPermiso(), getUserPermisos(), loginAs(), logoutUser(), loadSession(), updateUserUI(), showLoginSelector(), openPermisosEditor(), permisosSelAll(), permisosResetRol(), guardarPermisosModal()

// ============================================================
//  SISTEMA DE PERMISOS Y ROLES
// ============================================================
const PERMISOS_MODULOS = {
  dashboard:     { label: 'Dashboard',     acciones: ['ver'] },
  clientes:      { label: 'Clientes',      acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  creditos:      { label: 'Créditos',      acciones: ['ver', 'crear', 'editar', 'eliminar', 'liquidar'] },
  pagos:         { label: 'Pagos',         acciones: ['ver', 'crear'] },
  cotizador:     { label: 'Cotizador',     acciones: ['ver', 'crear', 'exportar'] },
  fondeos:       { label: 'Fondeos',       acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  contabilidad:  { label: 'Contabilidad',  acciones: ['ver', 'crear', 'exportar'] },
  reportes:      { label: 'Reportes',      acciones: ['ver', 'exportar'] },
  calendario:    { label: 'Calendario',    acciones: ['ver'] },
  aprobaciones:  { label: 'Aprobaciones',  acciones: ['ver', 'aprobar', 'rechazar'] },
  conciliacion:  { label: 'Conciliación',  acciones: ['ver', 'crear', 'exportar'] },
  admin:         { label: 'Administración', acciones: ['ver', 'usuarios', 'permisos', 'backup'] }
};

const ACCION_LABELS = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar',
  liquidar: 'Liquidar', exportar: 'Exportar', aprobar: 'Aprobar', rechazar: 'Rechazar',
  usuarios: 'Gestionar Usuarios', permisos: 'Dar/Quitar Permisos', backup: 'Backup/Restaurar'
};

// Permisos predeterminados por rol
const ROL_PERMISOS_DEFAULT = {
  admin: 'ALL', // Admin tiene todo
  analista: {
    dashboard: ['ver'], clientes: ['ver', 'crear', 'editar'], creditos: ['ver', 'crear', 'editar'],
    pagos: ['ver', 'crear'], cotizador: ['ver', 'crear', 'exportar'], fondeos: ['ver'],
    contabilidad: ['ver', 'exportar'], reportes: ['ver', 'exportar'], calendario: ['ver'], aprobaciones: ['ver', 'aprobar', 'rechazar'], conciliacion: ['ver', 'crear', 'exportar'], admin: []
  },
  capturista: {
    dashboard: ['ver'], clientes: ['ver', 'crear'], creditos: ['ver'],
    pagos: ['ver', 'crear'], cotizador: ['ver', 'crear'], fondeos: ['ver'],
    contabilidad: ['ver'], reportes: ['ver'], calendario: ['ver'], aprobaciones: ['ver'], conciliacion: ['ver'], admin: []
  },
  operador: {
    dashboard: ['ver'], clientes: ['ver', 'crear', 'editar'], creditos: ['ver', 'crear', 'editar'],
    pagos: ['ver', 'crear'], cotizador: ['ver', 'crear', 'exportar'], fondeos: ['ver', 'crear'],
    contabilidad: ['ver'], reportes: ['ver', 'exportar'], calendario: ['ver'], aprobaciones: ['ver'], conciliacion: ['ver', 'crear'], admin: []
  },
  viewer: {
    dashboard: ['ver'], clientes: ['ver'], creditos: ['ver'],
    pagos: ['ver'], cotizador: ['ver'], fondeos: ['ver'],
    contabilidad: ['ver'], reportes: ['ver'], calendario: ['ver'], aprobaciones: ['ver'], conciliacion: ['ver'], admin: []
  }
};

// Usuario actual (sesión simulada)
let currentUser = null;

function loginAs(userId) {
  const users = getStore('usuarios');
  const prevUser = currentUser ? currentUser.nombre : null;
  currentUser = users.find(u => u.id === userId) || users[0] || null;
  if (currentUser) {
    localStorage.setItem('ap_currentUser', JSON.stringify(currentUser.id));
    // Actualizar último acceso
    let us = getStore('usuarios');
    us = us.map(u => u.id === currentUser.id ? { ...u, ultimoAcceso: new Date().toISOString() } : u);
    setStore('usuarios', us);
    updateUserUI();
    resetActivityTimer();
    // Bug #47: Log de seguridad
    logSecurityEvent('login', 'Inicio de sesión: ' + currentUser.nombre + (prevUser ? ' (antes: ' + prevUser + ')' : ''));
    addAudit('Login', 'Seguridad', currentUser.nombre);
  }
}

function logoutUser() {
  // Bug #47: Log de seguridad
  if (currentUser) {
    logSecurityEvent('logout', 'Cierre de sesión: ' + currentUser.nombre);
    addAudit('Logout', 'Seguridad', currentUser.nombre);
  }
  currentUser = null;
  localStorage.removeItem('ap_currentUser');
  showLoginSelector();
}

function loadSession() {
  const savedId = JSON.parse(localStorage.getItem('ap_currentUser') || 'null');
  const users = getStore('usuarios');
  if (savedId) {
    currentUser = users.find(u => u.id === savedId && u.activo);
  }
  if (!currentUser && users.length > 0) {
    // Auto-login como primer admin activo
    currentUser = users.find(u => u.rol === 'admin' && u.activo) || users[0];
    if (currentUser) localStorage.setItem('ap_currentUser', JSON.stringify(currentUser.id));
  }
  updateUserUI();
}

function updateUserUI() {
  const el = document.getElementById('currentUserName');
  const avatar = document.getElementById('currentUserAvatar');
  if (currentUser && el) {
    el.textContent = currentUser.nombre;
    if (avatar) avatar.textContent = currentUser.nombre.substring(0, 2).toUpperCase();
  }
  // Ocultar sidebar items sin permiso de 'ver'
  document.querySelectorAll('.nav-item[data-page]').forEach(nav => {
    const page = nav.getAttribute('data-page');
    nav.style.display = hasPermiso(page, 'ver') ? '' : 'none';
  });
}

function showLoginSelector() {
  const users = getStore('usuarios').filter(u => u.activo);
  const html = users.map(u =>
    `<button class="btn btn-outline" style="width:100%;margin-bottom:8px;justify-content:flex-start" onclick="loginAs(${u.id});closeModal('modalLogin')">
      <span class="avatar" style="width:32px;height:32px;background:var(--navy);color:white;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">${esc(u.nombre.substring(0,2).toUpperCase())}</span>
      <span>${esc(u.nombre)} <small style="color:var(--gray-400)">— ${esc(u.rol)}</small></span>
    </button>`
  ).join('');
  document.getElementById('loginUserList').innerHTML = html || '<p style="color:var(--gray-400)">No hay usuarios activos</p>';
  openModal('modalLogin');
}

// Verificar permiso
function hasPermiso(modulo, accion) {
  if (!currentUser) return false;
  if (currentUser.rol === 'admin') return true; // Admin siempre tiene todo

  // Permisos personalizados del usuario (si existen)
  const permisos = currentUser.permisos || ROL_PERMISOS_DEFAULT[currentUser.rol];
  if (!permisos) return false;
  if (permisos === 'ALL') return true;

  const modPermisos = permisos[modulo];
  if (!modPermisos) return false;
  return modPermisos.includes(accion);
}

// Obtener permisos de un usuario
function getUserPermisos(user) {
  if (user.rol === 'admin') return 'ALL';
  return user.permisos || ROL_PERMISOS_DEFAULT[user.rol] || {};
}

// Guardar permisos personalizados para un usuario
function guardarPermisosUsuario(userId, permisos) {
  let users = getStore('usuarios');
  users = users.map(u => {
    if (u.id === userId) u.permisos = permisos;
    return u;
  });
  setStore('usuarios', users);
  // Actualizar currentUser si es el mismo
  if (currentUser && currentUser.id === userId) {
    currentUser.permisos = permisos;
    updateUserUI();
  }
  addAudit('Modificar Permisos', 'Admin', users.find(u => u.id === userId)?.nombre || '');
  toast('Permisos actualizados', 'success');
}

// Variable temporal para el editor de permisos
let _editingPermisosUserId = null;

// Abrir editor de permisos para un usuario
function openPermisosEditor(userId) {
  if (!hasPermiso('admin', 'permisos')) return toast('Sin permiso para editar permisos', 'error');
  const users = getStore('usuarios');
  const user = users.find(u => u.id === userId);
  if (!user) return toast('Usuario no encontrado', 'error');
  if (user.rol === 'admin') return toast('Los administradores tienen todos los permisos por defecto', 'info');

  _editingPermisosUserId = userId;
  document.getElementById('permisosTitle').textContent = 'Permisos de ' + user.nombre + ' (' + user.rol + ')';

  const permisos = user.permisos || ROL_PERMISOS_DEFAULT[user.rol] || {};
  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="background:var(--gray-100)"><th style="text-align:left;padding:8px">Módulo</th>';

  // Obtener todas las acciones únicas
  const allAcciones = ['ver', 'crear', 'editar', 'eliminar', 'liquidar', 'exportar', 'usuarios', 'permisos', 'backup'];
  allAcciones.forEach(a => {
    html += '<th style="text-align:center;padding:8px;font-size:11px;text-transform:capitalize">' + a + '</th>';
  });
  html += '</tr></thead><tbody>';

  Object.keys(PERMISOS_MODULOS).forEach(mod => {
    const cfg = PERMISOS_MODULOS[mod];
    const userModPermisos = permisos[mod] || [];
    html += '<tr style="border-bottom:1px solid var(--gray-200)">';
    html += '<td style="padding:8px;font-weight:500">' + cfg.label + '</td>';
    allAcciones.forEach(a => {
      if (cfg.acciones.includes(a)) {
        const checked = userModPermisos.includes(a) ? 'checked' : '';
        html += '<td style="text-align:center;padding:4px"><input type="checkbox" data-mod="' + mod + '" data-acc="' + a + '" ' + checked + ' style="cursor:pointer;width:16px;height:16px"></td>';
      } else {
        html += '<td style="text-align:center;color:var(--gray-300)">—</td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  html += '<div style="margin-top:12px;display:flex;gap:8px">';
  html += '<button class="btn btn-outline btn-sm" onclick="permisosSelAll(true)">Seleccionar Todo</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="permisosSelAll(false)">Deseleccionar Todo</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="permisosResetRol()">Restaurar por Rol</button>';
  html += '</div>';

  document.getElementById('permisosGrid').innerHTML = html;
  openModal('modalPermisos');
}

function permisosSelAll(val) {
  document.querySelectorAll('#permisosGrid input[type=checkbox]').forEach(cb => cb.checked = val);
}

function permisosResetRol() {
  const users = getStore('usuarios');
  const user = users.find(u => u.id === _editingPermisosUserId);
  if (!user) return;
  const defaults = ROL_PERMISOS_DEFAULT[user.rol] || {};
  document.querySelectorAll('#permisosGrid input[type=checkbox]').forEach(cb => {
    const mod = cb.getAttribute('data-mod');
    const acc = cb.getAttribute('data-acc');
    cb.checked = defaults[mod] ? defaults[mod].includes(acc) : false;
  });
  toast('Permisos restaurados a valores por defecto del rol', 'info');
}

function guardarPermisosModal() {
  if (!_editingPermisosUserId) return;
  const permisos = {};
  Object.keys(PERMISOS_MODULOS).forEach(mod => permisos[mod] = []);
  document.querySelectorAll('#permisosGrid input[type=checkbox]:checked').forEach(cb => {
    const mod = cb.getAttribute('data-mod');
    const acc = cb.getAttribute('data-acc');
    if (!permisos[mod]) permisos[mod] = [];
    permisos[mod].push(acc);
  });
  guardarPermisosUsuario(_editingPermisosUserId, permisos);
  closeModal('modalPermisos');
  renderUsuarios();
}


