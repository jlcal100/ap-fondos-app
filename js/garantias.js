// ====== MODULE: garantias.js ======
// abrirModalGarantia(), guardarGarantia(), eliminarGarantia(), liberarGarantia(), getGarantiasCredito(), getCoberturaGarantias()

// ============================================================
//  SPRINT P: GESTIÓN DE GARANTÍAS Y COLATERAL
// ============================================================
var GARANTIA_TIPOS = {
  hipotecaria: 'Hipotecaria',
  prendaria: 'Prendaria',
  fiduciaria: 'Fiduciaria',
  personal: 'Personal / Aval',
  deposito: 'Depósito en Garantía',
  pagare: 'Pagaré',
  vehiculo: 'Vehículo',
  equipo: 'Equipo / Maquinaria',
  otra: 'Otra'
};

function abrirModalGarantia(creditoId) {
  document.getElementById('garCreditoId').value = creditoId;
  document.getElementById('garTipo').value = 'hipotecaria';
  document.getElementById('garEstado').value = 'vigente';
  document.getElementById('garDescripcion').value = '';
  document.getElementById('garValor').value = '';
  document.getElementById('garFechaAvaluo').value = new Date().toISOString().split('T')[0];
  document.getElementById('garUbicacion').value = '';
  document.getElementById('garDocumento').value = '';
  document.getElementById('garNotas').value = '';
  openModal('modalGarantia');
}

function guardarGarantia() {
  V.clearErrors('modalGarantia');
  var creditoId = parseInt(document.getElementById('garCreditoId').value);
  var tipo = document.getElementById('garTipo').value;
  var descripcion = document.getElementById('garDescripcion').value.trim();
  var valorStr = String(parseMiles('garValor'));
  var fechaAvaluo = document.getElementById('garFechaAvaluo').value;
  var estado = document.getElementById('garEstado').value;

  var ok = true;
  ok = V.check('garDescripcion', descripcion.length > 0, 'Descripción es obligatoria') && ok;
  ok = V.check('garValor', V.positiveNum(valorStr), 'Valor debe ser mayor a 0') && ok;
  if (!ok) return toast('Corrige los errores marcados en rojo', 'error');

  var valor = parseFloat(valorStr);
  var garantia = {
    id: nextId('garantias'),
    creditoId: creditoId,
    tipo: tipo,
    estado: estado,
    descripcion: descripcion,
    valor: valor,
    fechaAvaluo: fechaAvaluo,
    ubicacion: document.getElementById('garUbicacion').value.trim(),
    documento: document.getElementById('garDocumento').value.trim(),
    notas: document.getElementById('garNotas').value.trim(),
    createdAt: new Date().toISOString()
  };

  var garantias = getStore('garantias');
  garantias.push(garantia);
  setStore('garantias', garantias);

  var credito = getStore('creditos').find(function(c) { return c.id === creditoId; });
  addAudit('Crear', 'Garantías', 'Garantía ' + GARANTIA_TIPOS[tipo] + ' por ' + fmt(valor) + ' — Crédito ' + (credito ? credito.numero : '#' + creditoId));
  closeModal('modalGarantia');
  toast('Garantía registrada exitosamente', 'success');

  // Refrescar detalle del crédito si está visible
  if (currentCreditoId === creditoId) verCredito(creditoId);
}

function eliminarGarantia(id) {
  if (!confirm('¿Eliminar esta garantía?')) return;
  var garantias = getStore('garantias');
  var gar = garantias.find(function(g) { return g.id === id; });
  if (!gar) return;
  garantias = garantias.filter(function(g) { return g.id !== id; });
  setStore('garantias', garantias);
  addAudit('Eliminar', 'Garantías', 'Garantía #' + id + ' eliminada');
  toast('Garantía eliminada', 'success');
  if (currentCreditoId === gar.creditoId) verCredito(gar.creditoId);
}

function liberarGarantia(id) {
  var garantias = getStore('garantias');
  var gar = garantias.find(function(g) { return g.id === id; });
  if (!gar) return;
  gar.estado = 'liberada';
  gar.fechaLiberacion = new Date().toISOString();
  setStore('garantias', garantias);
  addAudit('Liberar', 'Garantías', 'Garantía #' + id + ' liberada');
  toast('Garantía liberada', 'success');
  if (currentCreditoId === gar.creditoId) verCredito(gar.creditoId);
}

function getGarantiasCredito(creditoId) {
  return getStore('garantias').filter(function(g) { return g.creditoId === creditoId; });
}

function getCoberturaGarantias(creditoId) {
  var credito = getStore('creditos').find(function(c) { return c.id === creditoId; });
  if (!credito) return { total: 0, vigente: 0, cobertura: 0 };
  var garantias = getGarantiasCredito(creditoId);
  var totalGar = garantias.reduce(function(s, g) { return s + g.valor; }, 0);
  var vigenteGar = garantias.filter(function(g) { return g.estado === 'vigente'; }).reduce(function(s, g) { return s + g.valor; }, 0);
  var saldo = credito.saldo || credito.monto;
  return {
    total: totalGar,
    vigente: vigenteGar,
    cobertura: saldo > 0 ? (vigenteGar / saldo * 100) : 0,
    count: garantias.length,
    countVigente: garantias.filter(function(g) { return g.estado === 'vigente'; }).length
  };
}

function renderGarantiasHTML(creditoId) {
  var garantias = getGarantiasCredito(creditoId);
  var cob = getCoberturaGarantias(creditoId);
  var cobColor = cob.cobertura >= 100 ? 'green' : cob.cobertura >= 50 ? 'yellow' : 'red';

  var html = '<div style="margin-top:16px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
    '<h4 style="margin:0">Garantías y Colateral</h4>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    '<span class="badge badge-' + cobColor + '" style="font-size:12px">Cobertura: ' + cob.cobertura.toFixed(1) + '% (' + fmt(cob.vigente) + ')</span>' +
    '<button class="btn btn-primary btn-sm" onclick="abrirModalGarantia(' + creditoId + ')">+ Garantía</button>' +
    '</div></div>';

  if (garantias.length === 0) {
    html += '<div style="text-align:center;padding:20px;color:var(--gray);background:var(--light-bg);border-radius:8px">Sin garantías registradas. <a style="color:var(--primary);cursor:pointer" onclick="abrirModalGarantia(' + creditoId + ')">Agregar una</a></div>';
  } else {
    html += '<div class="table-wrapper"><table class="table"><thead><tr><th>Tipo</th><th>Descripción</th><th>Valor Avalúo</th><th>Fecha Avalúo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
    garantias.forEach(function(g) {
      var estadoBadge = g.estado === 'vigente' ? 'badge-green' : g.estado === 'en_tramite' ? 'badge-yellow' : g.estado === 'vencida' ? 'badge-orange' : 'badge-gray';
      html += '<tr>' +
        '<td><span class="badge badge-blue">' + esc(GARANTIA_TIPOS[g.tipo] || g.tipo) + '</span></td>' +
        '<td>' + esc(g.descripcion) + (g.documento ? '<br><small style="color:var(--gray)">Doc: ' + esc(g.documento) + '</small>' : '') + '</td>' +
        '<td><strong>' + fmt(g.valor) + '</strong></td>' +
        '<td>' + (g.fechaAvaluo ? fmtDate(g.fechaAvaluo) : '-') + '</td>' +
        '<td><span class="badge ' + estadoBadge + '">' + esc(g.estado) + '</span></td>' +
        '<td>';
      if (g.estado === 'vigente') {
        html += '<button class="btn btn-outline btn-sm" onclick="liberarGarantia(' + g.id + ')" title="Liberar">🔓</button> ';
      }
      html += '<button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="eliminarGarantia(' + g.id + ')" title="Eliminar">🗑</button>';
      html += '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';
  return html;
}

