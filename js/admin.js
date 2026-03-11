// ====== MODULE: admin.js ======
// setAdminTab(), renderUsuarios(), guardarUsuario(), toggleUsuario(), renderAuditoria(), logSecurityEvent(), renderSecurityLog()

// ============================================================
//  ADMIN
// ============================================================
function setAdminTab(tab) {
  document.querySelectorAll('#page-admin .tab').forEach(t => t.classList.remove('active'));
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');
  document.getElementById('adminUsuarios').style.display = tab === 'usuarios' ? 'block' : 'none';
  document.getElementById('adminAuditoria').style.display = tab === 'auditoria' ? 'block' : 'none';
  document.getElementById('adminSeguridad').style.display = tab === 'seguridad' ? 'block' : 'none';
  document.getElementById('adminImportar').style.display = tab === 'importar' ? 'block' : 'none';
  if (tab === 'seguridad') renderSecurityLog();
}

// Bug #47: Renderizar log de seguridad
function renderSecurityLog() {
  const logs = getStore('security_log');
  if (logs.length === 0) {
    document.getElementById('tbSecurityLog').innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999">No hay eventos de seguridad registrados</td></tr>';
    return;
  }
  const tipoBadge = { login: 'badge-green', logout: 'badge-blue', sesion_expirada: 'badge-yellow', devtools_abierto: 'badge-red', backup_exportado: 'badge-green', backup_importado: 'badge-blue' };
  document.getElementById('tbSecurityLog').innerHTML = logs.slice().reverse().map(l => `<tr>
    <td style="font-size:12px">${new Date(l.fecha).toLocaleString('es-MX')}</td>
    <td><span class="badge ${tipoBadge[l.tipo] || 'badge-gray'}" style="${!tipoBadge[l.tipo] ? 'background:var(--gray-200);color:var(--gray-600)' : ''}">${l.tipo}</span></td>
    <td>${esc(l.usuario)}</td>
    <td style="font-size:12px">${esc(l.detalle)}</td>
  </tr>`).join('');
}

function renderUsuarios() {
  // Sprint W: Renderizar status de backup
  renderBackupStatus();
  const users = getStore('usuarios');
  document.getElementById('tbUsuarios').innerHTML = users.map(u => {
    const permisos = getUserPermisos(u);
    let permDesc = '';
    if (permisos === 'ALL') {
      permDesc = '<span class="badge badge-green">Todos</span>';
    } else if (u.permisos) {
      const count = Object.values(u.permisos).reduce((s, a) => s + a.length, 0);
      permDesc = '<span class="badge badge-blue">' + count + ' permisos (personalizado)</span>';
    } else {
      permDesc = '<span class="badge badge-gray" style="background:var(--gray-200);color:var(--gray-600)">Por defecto (' + esc(u.rol) + ')</span>';
    }
    return `<tr>
    <td>${u.id}</td><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td>
    <td><span class="badge badge-blue">${esc(u.rol)}</span></td>
    <td>${permDesc}</td>
    <td>${u.activo ? '<span class="badge badge-green">Sí</span>' : '<span class="badge badge-red">No</span>'}</td>
    <td>${u.ultimoAcceso ? new Date(u.ultimoAcceso).toLocaleString('es-MX') : '-'}</td>
    <td>
      ${u.rol !== 'admin' ? '<button class="btn btn-outline btn-sm" onclick="openPermisosEditor(' + u.id + ')" style="margin-right:4px">Permisos</button>' : ''}
      <button class="btn btn-outline btn-sm" onclick="toggleUsuario(${u.id})">${u.activo ? 'Desactivar' : 'Activar'}</button>
    </td>
  </tr>`;
  }).join('');
}

function guardarUsuario() {
  if (!hasPermiso('admin', 'usuarios')) return toast('Sin permiso para gestionar usuarios', 'error');
  V.clearErrors('modalUsuario');
  var ok = true;
  var nombre = document.getElementById('usrNombre').value.trim();
  var email = document.getElementById('usrEmail').value.trim();
  var password = document.getElementById('usrPassword').value;
  var rol = document.getElementById('usrRol').value;

  // Bug #7 & #9: Validaciones reforzadas
  ok = V.check('usrNombre', nombre.length >= 3, 'Nombre obligatorio (mín. 3 caracteres)') && ok;
  ok = V.check('usrEmail', V.validEmail(email) && email.length > 0, 'Email válido obligatorio') && ok;

  // Bug #9: Política de contraseñas
  var pwdResult = V.validPassword(password);
  ok = V.check('usrPassword', pwdResult.ok, pwdResult.msg || 'Contraseña obligatoria') && ok;

  // Verificar email duplicado
  var existingUser = getStore('usuarios').find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    ok = V.check('usrEmail', false, 'Ya existe un usuario con este email') && ok;
  }

  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  const user = {
    id: nextId('usuarios'),
    nombre: nombre,
    email: email,
    rol: rol,
    passwordHash: '***' + password.length + '***', // En producción: bcrypt hash en backend
    activo: true,
    ultimoAcceso: null
  };
  const users = getStore('usuarios');
  users.push(user);
  setStore('usuarios', users);
  addAudit('Crear Usuario', 'Admin', user.nombre);
  closeModal('modalUsuario');
  toast('Usuario creado exitosamente', 'success');
  renderUsuarios();
}

function toggleUsuario(id) {
  // Bug #22: Confirmación antes de desactivar/activar usuario
  const user = getStore('usuarios').find(u => u.id === id);
  const accion = user && user.activo ? 'desactivar' : 'activar';
  showConfirm(accion.charAt(0).toUpperCase() + accion.slice(1) + ' usuario',
    '¿' + accion.charAt(0).toUpperCase() + accion.slice(1) + ' a ' + (user ? user.nombre : '') + '?',
    'Sí, ' + accion
  ).then(ok => {
    if (!ok) return;
    let users = getStore('usuarios');
    users = users.map(u => u.id === id ? { ...u, activo: !u.activo } : u);
    setStore('usuarios', users);
    addAudit(accion.charAt(0).toUpperCase() + accion.slice(1), 'Admin', user ? user.nombre : '');
    toast('Usuario ' + accion + 'do', 'success');
    renderUsuarios();
  });
}

function renderAuditoria() {
  const logs = getStore('auditoria').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  document.getElementById('tbAuditoria').innerHTML = logs.map(l => `<tr>
    <td>${new Date(l.fecha).toLocaleString('es-MX')}</td><td>${esc(l.usuario)}</td>
    <td>${esc(l.accion)}</td><td>${esc(l.modulo)}</td><td>${esc(l.detalle)}</td>
  </tr>`).join('');
}

