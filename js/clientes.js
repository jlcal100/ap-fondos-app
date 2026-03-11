// ====== MODULE: clientes.js ======
// Clientes module + document management in modal

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

