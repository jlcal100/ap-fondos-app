// ====== MODULE: expediente.js ======
// Gestión de expediente digital: documentos, checklist, subida, preview

// ============================================================
//  CONSTANTES Y VARIABLES
// ============================================================
const EXPEDIENTE_REQUERIDO = {
  fisica: [
    { tipo: 'ine', label: 'INE / Identificación Oficial', obligatorio: true },
    { tipo: 'csf', label: 'Constancia de Situación Fiscal', obligatorio: true },
    { tipo: 'comprobante_domicilio', label: 'Comprobante de Domicilio', obligatorio: true },
    { tipo: 'estados_financieros', label: 'Estados Financieros', obligatorio: false },
    { tipo: 'contrato', label: 'Contrato Firmado', obligatorio: true },
    { tipo: 'comprobante_ingresos', label: 'Comprobante de Ingresos', obligatorio: false }
  ],
  moral: [
    { tipo: 'ine', label: 'INE del Representante Legal', obligatorio: true },
    { tipo: 'csf', label: 'Constancia de Situación Fiscal', obligatorio: true },
    { tipo: 'comprobante_domicilio', label: 'Comprobante de Domicilio', obligatorio: true },
    { tipo: 'estados_financieros', label: 'Estados Financieros (últimos 2 años)', obligatorio: true },
    { tipo: 'acta_constitutiva', label: 'Acta Constitutiva', obligatorio: true },
    { tipo: 'poder_notarial', label: 'Poder Notarial', obligatorio: true },
    { tipo: 'contrato', label: 'Contrato Firmado', obligatorio: true },
    { tipo: 'opiniones_cumplimiento', label: 'Opinión de Cumplimiento SAT', obligatorio: false }
  ]
};

let pendingDocFiles = [];
let pendingDocClientId = null;
let currentDocFilter = 'todos';

// ============================================================
//  STORAGE DE DOCUMENTOS
// ============================================================
function getDocStore() {
  try { return JSON.parse(localStorage.getItem('apf_documentos')) || []; } catch(e) { return []; }
}

function setDocStore(docs) {
  localStorage.setItem('apf_documentos', JSON.stringify(docs));
}

// ============================================================
//  ESTADO Y CHECKLIST DEL EXPEDIENTE
// ============================================================
function getExpedienteStatus(clienteId) {
  var cliente = getStore('clientes').find(function(c) { return c.id === clienteId; });
  if (!cliente) return { total: 0, cumplidos: 0, pct: 0, items: [] };
  var requeridos = EXPEDIENTE_REQUERIDO[cliente.tipo] || EXPEDIENTE_REQUERIDO.fisica;
  var docs = getDocStore().filter(function(d) { return d.clienteId === clienteId; });
  var hoy = new Date();
  var items = requeridos.map(function(req) {
    var docsTipo = docs.filter(function(d) { return d.tipo === req.tipo; });
    var tieneDoc = docsTipo.length > 0;
    var docMasReciente = tieneDoc ? docsTipo.sort(function(a, b) { return new Date(b.fechaSubida) - new Date(a.fechaSubida); })[0] : null;
    var vencido = false;
    var diasVenc = null;
    if (docMasReciente && docMasReciente.fechaVencimiento) {
      var fv = new Date(docMasReciente.fechaVencimiento);
      diasVenc = Math.floor((fv - hoy) / 86400000);
      vencido = diasVenc < 0;
    }
    return {
      tipo: req.tipo, label: req.label, obligatorio: req.obligatorio,
      cumplido: tieneDoc && !vencido,
      tieneDoc: tieneDoc, vencido: vencido, diasVenc: diasVenc,
      doc: docMasReciente
    };
  });
  var obligatorios = items.filter(function(i) { return i.obligatorio; });
  var cumplidos = obligatorios.filter(function(i) { return i.cumplido; }).length;
  return {
    total: obligatorios.length, cumplidos: cumplidos,
    pct: obligatorios.length > 0 ? Math.round(cumplidos / obligatorios.length * 100) : 100,
    items: items
  };
}

function getExpedienteBadge(clienteId) {
  var status = getExpedienteStatus(clienteId);
  if (status.pct === 100) return '<span class="badge badge-green" title="Expediente completo">✅ ' + status.pct + '%</span>';
  if (status.pct >= 60) return '<span class="badge badge-yellow" title="Expediente incompleto" style="color:#92400E">⚠️ ' + status.pct + '%</span>';
  return '<span class="badge badge-red" title="Expediente incompleto">❌ ' + status.pct + '%</span>';
}

function getClienteDocCount(clienteId) {
  return getDocStore().filter(function(d) { return d.clienteId === clienteId; }).length;
}

function getDocAlertasCliente(clienteId) {
  var status = getExpedienteStatus(clienteId);
  var alertas = [];
  status.items.forEach(function(item) {
    if (item.obligatorio && !item.tieneDoc) {
      alertas.push({ nivel: 'alto', texto: 'Falta: ' + item.label });
    } else if (item.vencido) {
      alertas.push({ nivel: 'critico', texto: 'Vencido: ' + item.label + ' (hace ' + Math.abs(item.diasVenc) + ' días)' });
    } else if (item.diasVenc !== null && item.diasVenc <= 30) {
      alertas.push({ nivel: 'medio', texto: 'Próximo a vencer: ' + item.label + ' (en ' + item.diasVenc + ' días)' });
    }
  });
  return alertas;
}

// ============================================================
//  CHECKLIST UI
// ============================================================
function renderExpedienteChecklist(clienteId) {
  var status = getExpedienteStatus(clienteId);
  var colorBar = status.pct === 100 ? 'var(--green)' : status.pct >= 60 ? 'var(--orange)' : 'var(--red)';

  var html = '<div style="margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
    '<span style="font-weight:600;font-size:13px">Completitud del Expediente</span>' +
    '<span style="font-weight:700;color:' + colorBar + '">' + status.pct + '%</span></div>' +
    '<div class="exp-progress"><div class="exp-progress-bar" style="width:' + status.pct + '%;background:' + colorBar + '"></div></div>' +
    '</div><div class="exp-checklist">';

  status.items.forEach(function(item) {
    var cls = item.cumplido ? 'ok' : item.vencido ? 'expired' : 'missing';
    var icon = item.cumplido ? '✅' : item.vencido ? '⚠️' : '❌';
    var extra = '';
    if (item.vencido) extra = '<span class="doc-venc vencido">Vencido hace ' + Math.abs(item.diasVenc) + ' días</span>';
    else if (item.diasVenc !== null && item.diasVenc <= 30) extra = '<span class="doc-venc proximo">Vence en ' + item.diasVenc + ' días</span>';
    else if (item.tieneDoc && item.diasVenc === null) extra = '<span class="doc-venc vigente">✓</span>';
    html += '<div class="exp-check-item ' + cls + '">' +
      '<span class="exp-check-icon">' + icon + '</span>' +
      '<span>' + esc(item.label) + (item.obligatorio ? ' *' : '') + '</span>' + extra + '</div>';
  });
  html += '</div>';
  return html;
}

function renderExpedienteChecklistUI(clienteId) {
  var el = document.getElementById('expChecklistContainer');
  if (!el) return;
  el.innerHTML = renderExpedienteChecklist(clienteId);
}

// ============================================================
//  SUBIDA DE DOCUMENTOS
// ============================================================
function handleDocUpload(files, clienteId) {
  if (!files || files.length === 0) return;
  pendingDocFiles = Array.from(files);
  pendingDocClientId = clienteId;
  document.getElementById('docSelectType').style.display = 'block';
  var names = pendingDocFiles.map(function(f) { return f.name; }).join(', ');
  toast('Archivo(s) cargados: ' + names + '. Selecciona el tipo.', 'info');
}

function handleDocDrop(event, clienteId) {
  event.preventDefault();
  event.currentTarget.classList.remove('dragover');
  var files = event.dataTransfer.files;
  handleDocUpload(files, clienteId);
}

function assignDocType(tipo) {
  if (!pendingDocFiles.length || !pendingDocClientId) return;
  var docs = getDocStore();
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

  var docNota = (document.getElementById('docNotaInput') && document.getElementById('docNotaInput').value.trim()) || '';
  var docVenc = (document.getElementById('docVencInput') && document.getElementById('docVencInput').value) || '';

  pendingDocFiles.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var doc = {
        id: docs.length > 0 ? Math.max.apply(null, docs.map(function(d) { return d.id; })) + 1 : 1,
        clienteId: pendingDocClientId,
        tipo: tipo,
        tipoLabel: tipoLabels[tipo] || tipo,
        icon: tipoIcons[tipo] || '📎',
        nombre: file.name,
        tamano: file.size,
        mimeType: file.type,
        dataUrl: e.target.result,
        fechaSubida: new Date().toISOString(),
        subidoPor: currentUser ? currentUser.nombre : 'Admin',
        nota: docNota,
        fechaVencimiento: docVenc || null
      };
      docs.push(doc);
      setDocStore(docs);
      addAudit('Subir Doc', 'Documentos', file.name + ' (' + (tipoLabels[tipo]||tipo) + ') → Cliente #' + pendingDocClientId);
      renderDocGrid(pendingDocClientId);
      renderExpedienteChecklistUI(pendingDocClientId);
    };
    reader.readAsDataURL(file);
  });

  toast(pendingDocFiles.length + ' documento(s) guardado(s) como ' + (tipoLabels[tipo]||tipo), 'success');
  refreshNotifications();
  pendingDocFiles = [];
  document.getElementById('docSelectType').style.display = 'none';
  document.getElementById('docFileInput').value = '';
  var notaIn = document.getElementById('docNotaInput'); if (notaIn) notaIn.value = '';
  var vencIn = document.getElementById('docVencInput'); if (vencIn) vencIn.value = '';
}

// ============================================================
//  GRID DE DOCUMENTOS
// ============================================================
function renderDocGrid(clienteId) {
  var docs = getDocStore().filter(function(d) { return d.clienteId === clienteId; });
  var filtered = currentDocFilter === 'todos' ? docs : docs.filter(function(d) { return d.tipo === currentDocFilter; });
  var grid = document.getElementById('docGrid');
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="padding:20px"><p>' + (docs.length === 0 ? 'Sin documentos. Arrastra archivos para subirlos.' : 'Sin documentos de este tipo.') + '</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(function(d) {
    var ext = d.nombre.split('.').pop().toLowerCase();
    var iconClass = ext === 'pdf' ? 'pdf' : ['jpg','jpeg','png'].includes(ext) ? 'img' : 'doc';
    var size = d.tamano < 1024 ? d.tamano + ' B' : d.tamano < 1048576 ? (d.tamano/1024).toFixed(1) + ' KB' : (d.tamano/1048576).toFixed(1) + ' MB';
    var fecha = new Date(d.fechaSubida).toLocaleDateString('es-MX');
    var vencHtml = '';
    if (d.fechaVencimiento) {
      var diasV = Math.floor((new Date(d.fechaVencimiento) - new Date()) / 86400000);
      var vCls = diasV < 0 ? 'vencido' : diasV <= 30 ? 'proximo' : 'vigente';
      var vTxt = diasV < 0 ? 'Vencido' : diasV <= 30 ? 'Vence en ' + diasV + 'd' : 'Vig. hasta ' + fmtDate(d.fechaVencimiento);
      vencHtml = '<span class="doc-venc ' + vCls + '">' + vTxt + '</span>';
    }
    var notaHtml = d.nota ? '<div class="doc-note">📝 ' + esc(d.nota) + '</div>' : '';
    var subidoPor = d.subidoPor ? '<span style="color:var(--gray-400);font-size:10px;margin-left:4px">por ' + esc(d.subidoPor) + '</span>' : '';
    return '<div class="doc-card">' +
      '<div class="doc-icon ' + iconClass + '">' + (d.icon || '📄') + '</div>' +
      '<div class="doc-info"><div class="doc-name">' + esc(d.nombre) + vencHtml + '</div><div class="doc-meta">' + esc(d.tipoLabel||d.tipo) + ' — ' + size + ' — ' + fecha + subidoPor + '</div>' + notaHtml + '</div>' +
      '<div class="doc-actions">' +
        '<button class="btn btn-outline btn-sm" onclick="previewDocInline(' + d.id + ',' + clienteId + ')" title="Vista previa">👁</button>' +
        '<button class="btn btn-outline btn-sm" onclick="editDocMeta(' + d.id + ',' + clienteId + ')" title="Editar">✏️</button>' +
        '<button class="btn btn-outline btn-sm" onclick="descargarDocumento(' + d.id + ')" title="Descargar">⬇</button>' +
        '<button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="eliminarDocumento(' + d.id + ',' + clienteId + ')" title="Eliminar">🗑</button>' +
      '</div></div>';
  }).join('');
}

function filterDocs(el, tipo, clienteId) {
  currentDocFilter = tipo;
  el.parentElement.querySelectorAll('.doc-type-tag').forEach(function(t) { t.classList.remove('selected'); });
  el.classList.add('selected');
  renderDocGrid(clienteId);
}

// ============================================================
//  OPERACIONES SOBRE DOCUMENTOS
// ============================================================
function descargarDocumento(docId) {
  var doc = getDocStore().find(function(d) { return d.id === docId; });
  if (!doc || !doc.dataUrl) return;
  var a = document.createElement('a');
  a.href = doc.dataUrl;
  a.download = doc.nombre;
  a.click();
  toast('Descargando ' + esc(doc.nombre), 'info');
}

function eliminarDocumento(docId, clienteId) {
  var doc = getDocStore().find(function(d) { return d.id === docId; });
  showConfirm('Eliminar documento', 'Eliminar "' + (doc ? esc(doc.nombre) : '') + '"? No se puede deshacer.', 'Sí, eliminar').then(function(ok) {
    if (!ok) return;
    var docs = getDocStore().filter(function(d) { return d.id !== docId; });
    setDocStore(docs);
    addAudit('Eliminar Doc', 'Documentos', doc ? doc.nombre : '');
    toast('Documento eliminado', 'warning');
    renderDocGrid(clienteId);
  });
}

function editDocMeta(docId, clienteId) {
  var doc = getDocStore().find(function(d) { return d.id === docId; });
  if (!doc) return;
  showPrompt('Editar documento: ' + esc(doc.nombre), 'Nota del documento:', doc.nota || '').then(function(nota) {
    if (nota === null) return;
    showPrompt('Fecha de vencimiento', 'Formato YYYY-MM-DD (dejar vacío si no aplica):', doc.fechaVencimiento || '').then(function(venc) {
      if (venc === null) return;
      var docs = getDocStore();
      var d = docs.find(function(x) { return x.id === docId; });
      if (d) {
        d.nota = nota;
        d.fechaVencimiento = venc && /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : null;
        setDocStore(docs);
        addAudit('Editar Doc', 'Documentos', doc.nombre + ' — nota/vencimiento actualizado');
        toast('Documento actualizado', 'success');
        renderDocGrid(clienteId);
        renderExpedienteChecklistUI(clienteId);
      }
    });
  });
}

function verDocumento(docId) {
  var doc = getDocStore().find(function(d) { return d.id === docId; });
  if (!doc || !doc.dataUrl) { toast('No se puede previsualizar este documento', 'error'); return; }
  var w = window.open('', '_blank', 'width=900,height=700');
  var ext = doc.nombre.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    w.document.write('<html><head><title>' + esc(doc.nombre) + '</title></head><body style="margin:0"><embed src="' + doc.dataUrl + '" width="100%" height="100%" type="application/pdf"></body></html>');
  } else if (['jpg','jpeg','png','gif'].includes(ext)) {
    w.document.write('<html><head><title>' + esc(doc.nombre) + '</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5}img{max-width:95%;max-height:95vh;box-shadow:0 4px 20px rgba(0,0,0,0.2);border-radius:8px}</style></head><body><img src="' + doc.dataUrl + '"></body></html>');
  } else {
    w.document.write('<html><head><title>' + esc(doc.nombre) + '</title></head><body><h3>' + esc(doc.nombre) + '</h3><p>Vista previa no disponible para este tipo de archivo.</p><a href="' + doc.dataUrl + '" download="' + esc(doc.nombre) + '">Descargar archivo</a></body></html>');
  }
  w.document.close();
}

function previewDocInline(docId, clienteId) {
  var doc = getDocStore().find(function(d) { return d.id === docId; });
  if (!doc || !doc.dataUrl) { toast('No se puede previsualizar este documento', 'error'); return; }
  var ext = doc.nombre.split('.').pop().toLowerCase();
  var previewEl = document.getElementById('docPreviewInline');
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.id = 'docPreviewInline';
    previewEl.style.cssText = 'margin-top:16px;background:white;border:1px solid var(--gray-200);border-radius:8px;padding:16px;';
    var grid = document.getElementById('docGrid');
    if (grid) grid.parentElement.appendChild(previewEl);
    else return;
  }
  var closeBtn = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><strong>' + esc(doc.nombre) + '</strong><button class="btn btn-outline btn-sm" onclick="document.getElementById(\'docPreviewInline\').style.display=\'none\'">Cerrar ✕</button></div>';
  if (['jpg','jpeg','png','gif'].includes(ext)) {
    previewEl.innerHTML = closeBtn + '<img src="' + doc.dataUrl + '" class="doc-preview-inline" style="max-width:100%;max-height:500px;display:block;margin:0 auto">';
  } else if (ext === 'pdf') {
    previewEl.innerHTML = closeBtn + '<embed src="' + doc.dataUrl + '" type="application/pdf" style="width:100%;height:500px;border-radius:8px">';
  } else {
    previewEl.innerHTML = closeBtn + '<p style="color:var(--gray-400);text-align:center;padding:40px">Vista previa no disponible para este tipo de archivo. <a href="' + doc.dataUrl + '" download="' + esc(doc.nombre) + '">Descargar</a></p>';
  }
  previewEl.style.display = 'block';
  previewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================
//  EXPORTAR EXPEDIENTE A PDF
// ============================================================
function exportarExpedientePDF(clienteId) {
  if (!window.jspdf) return toast('Librería jsPDF no cargada', 'error');
  var jsPDF = window.jspdf.jsPDF;
  var c = getStore('clientes').find(function(cl) { return cl.id === clienteId; });
  if (!c) return;
  var docs = getDocStore().filter(function(d) { return d.clienteId === clienteId; });
  var status = getExpedienteStatus(clienteId);
  var hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  var doc = new jsPDF();

  doc.setFillColor(30, 48, 80);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Índice de Expediente Digital', 14, 12);
  doc.setFontSize(9);
  doc.text(EMPRESA.nombre + ' — ' + hoy, 14, 20);

  doc.setTextColor(30, 48, 80);
  doc.setFontSize(12);
  doc.text('Cliente: ' + c.nombre, 14, 38);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('RFC: ' + c.rfc + '   |   Tipo: ' + (c.tipo === 'fisica' ? 'Persona Física' : 'Persona Moral') + '   |   Completitud: ' + status.pct + '%', 14, 46);

  doc.autoTable({
    startY: 60,
    head: [['Documento', 'Obligatorio', 'Estado', 'Archivo', 'Fecha Subida', 'Vencimiento']],
    body: status.items.map(function(item) {
      return [
        item.label,
        item.obligatorio ? 'Sí' : 'No',
        item.cumplido ? '✅ Completo' : item.vencido ? '⚠️ Vencido' : '❌ Faltante',
        item.doc ? item.doc.nombre : '-',
        item.doc ? new Date(item.doc.fechaSubida).toLocaleDateString('es-MX') : '-',
        item.doc && item.doc.fechaVencimiento ? item.doc.fechaVencimiento : 'N/A'
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 48, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] }
  });

  var yPos = doc.lastAutoTable.finalY + 10;

  if (docs.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(30, 48, 80);
    doc.text('Documentos en Expediente (' + docs.length + ')', 14, yPos);

    doc.autoTable({
      startY: yPos + 4,
      head: [['#', 'Nombre', 'Tipo', 'Tamaño', 'Fecha Subida', 'Subido por', 'Nota', 'Vencimiento']],
      body: docs.map(function(d, i) {
        var size = d.tamano < 1024 ? d.tamano + ' B' : d.tamano < 1048576 ? (d.tamano/1024).toFixed(1) + ' KB' : (d.tamano/1048576).toFixed(1) + ' MB';
        return [i+1, d.nombre, d.tipoLabel || d.tipo, size, new Date(d.fechaSubida).toLocaleDateString('es-MX'), d.subidoPor || '-', d.nota || '-', d.fechaVencimiento || 'N/A'];
      }),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 48, 80], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] }
    });
  }

  doc.save('AP_Expediente_' + c.nombre.replace(/\s+/g, '_') + '_' + new Date().toISOString().split('T')[0] + '.pdf');
  toast('Índice de expediente PDF generado', 'success');
}
