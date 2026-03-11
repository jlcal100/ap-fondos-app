// ====== MODULE: notificaciones.js ======
// generateNotifications(), notification management, panel toggle, real-time updates

// ============================================================
//  SPRINT I — NOTIFICACIONES INTELIGENTES
// ============================================================

// Generar todas las notificaciones del sistema
function generateNotifications() {
  var creditos = getStore('creditos');
  var fondeos = getStore('fondeos');
  var clientes = getStore('clientes');
  var hoy = new Date();
  var hoyMs = hoy.getTime();
  var notifs = [];

  // 1. Créditos morosos
  creditos.forEach(function(c) {
    if (c.estado === 'liquidado') return;
    if ((c.diasMora || 0) > 0) {
      var nivel = c.diasMora > 90 ? 'critico' : c.diasMora > 30 ? 'alto' : 'medio';
      var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
      notifs.push({
        id: 'mora_' + c.id,
        tipo: 'morosidad',
        nivel: nivel,
        icono: '🔴',
        titulo: 'Crédito en mora',
        detalle: esc(c.numero) + (cli ? ' (' + esc(cli.nombre) + ')' : '') + ' — ' + c.diasMora + ' días de mora — Saldo: ' + fmt(c.saldo),
        fecha: hoy.toISOString(),
        accion: function() { showPage('creditos'); }
      });
    }
  });

  // 2. Créditos próximos a vencer (30 días)
  creditos.forEach(function(c) {
    if (c.estado !== 'vigente' || !c.fechaVencimiento) return;
    var diasVenc = Math.floor((new Date(c.fechaVencimiento) - hoy) / 86400000);
    if (diasVenc > 0 && diasVenc <= 30) {
      var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
      notifs.push({
        id: 'venc_' + c.id,
        tipo: 'vencimiento',
        nivel: diasVenc <= 7 ? 'alto' : 'medio',
        icono: '⏰',
        titulo: 'Crédito próximo a vencer',
        detalle: esc(c.numero) + (cli ? ' (' + esc(cli.nombre) + ')' : '') + ' vence en ' + diasVenc + ' días (' + fmtDate(c.fechaVencimiento) + ')',
        fecha: hoy.toISOString(),
        accion: function() { showPage('creditos'); }
      });
    }
  });

  // 3. Próximos pagos esperados (créditos vigentes con tabla de amortización)
  creditos.forEach(function(c) {
    if (c.estado !== 'vigente' || !c.tablaAmortizacion) return;
    var cli = clientes.find(function(cl) { return cl.id === c.clienteId; });
    var pagosRealizados = getStore('pagos').filter(function(p) { return p.creditoId === c.id; });
    for (var i = 0; i < c.tablaAmortizacion.length; i++) {
      var cuota = c.tablaAmortizacion[i];
      if (!cuota.fechaPago) continue;
      var fPago = new Date(cuota.fechaPago);
      var diasHasta = Math.floor((fPago - hoy) / 86400000);
      // Verificar si ya fue pagada
      var yaPagada = pagosRealizados.some(function(p) { return p.numeroPago === cuota.numero; });
      if (yaPagada) continue;
      if (diasHasta >= 0 && diasHasta <= 7) {
        notifs.push({
          id: 'pago_' + c.id + '_' + cuota.numero,
          tipo: 'cobro',
          nivel: diasHasta <= 2 ? 'alto' : 'medio',
          icono: '💰',
          titulo: 'Cobro próximo',
          detalle: esc(c.numero) + (cli ? ' (' + esc(cli.nombre) + ')' : '') + ' — Cuota #' + cuota.numero + ' de ' + fmt(cuota.pagoTotal || cuota.cuota || 0) + ' vence ' + (diasHasta === 0 ? 'HOY' : 'en ' + diasHasta + ' días'),
          fecha: hoy.toISOString(),
          accion: function() { showPage('pagos'); }
        });
        break; // Solo la próxima cuota pendiente
      }
      if (diasHasta < 0 && diasHasta >= -15) {
        notifs.push({
          id: 'pago_atraso_' + c.id + '_' + cuota.numero,
          tipo: 'cobro',
          nivel: 'critico',
          icono: '🚨',
          titulo: 'Pago atrasado',
          detalle: esc(c.numero) + (cli ? ' (' + esc(cli.nombre) + ')' : '') + ' — Cuota #' + cuota.numero + ' atrasada ' + Math.abs(diasHasta) + ' días — ' + fmt(cuota.pagoTotal || cuota.cuota || 0),
          fecha: hoy.toISOString(),
          accion: function() { showPage('pagos'); }
        });
        break;
      }
    }
  });

  // 4. Fondeos por vencer
  fondeos.forEach(function(f) {
    if (f.estado === 'liquidado') return;
    if (!f.fechaVencimiento) return;
    var diasVenc = Math.floor((new Date(f.fechaVencimiento) - hoy) / 86400000);
    if (diasVenc <= 30) {
      var nivel = diasVenc <= 0 ? 'critico' : diasVenc <= 7 ? 'alto' : 'medio';
      notifs.push({
        id: 'fondeo_' + f.id,
        tipo: 'fondeo',
        nivel: nivel,
        icono: diasVenc <= 0 ? '🔴' : '🏦',
        titulo: diasVenc <= 0 ? 'Fondeo VENCIDO' : 'Fondeo por vencer',
        detalle: esc(f.numero) + ' (' + esc(f.fondeador) + ') — ' + (diasVenc <= 0 ? 'VENCIDO hace ' + Math.abs(diasVenc) + ' días' : 'Vence en ' + diasVenc + ' días') + ' — Saldo: ' + fmt(f.saldo),
        fecha: hoy.toISOString(),
        accion: function() { showPage('fondeos'); }
      });
    }
  });

  // 5. Expedientes incompletos y documentos vencidos
  clientes.forEach(function(cl) {
    var tieneCredito = creditos.some(function(c) { return c.clienteId === cl.id && c.estado === 'vigente'; });
    if (!tieneCredito) return;
    var docAlertas = getDocAlertasCliente(cl.id);
    docAlertas.forEach(function(da, idx) {
      notifs.push({
        id: 'doc_' + cl.id + '_' + idx,
        tipo: 'expediente',
        nivel: da.nivel,
        icono: da.nivel === 'critico' ? '📛' : da.nivel === 'alto' ? '📋' : '📄',
        titulo: 'Expediente: ' + esc(cl.nombre),
        detalle: da.texto,
        fecha: hoy.toISOString(),
        accion: function() { verCliente(cl.id); }
      });
    });
  });

  // 6. Aprobaciones pendientes
  var aprobaciones = getStore('aprobaciones');
  aprobaciones.forEach(function(a) {
    if (a.estado !== 'pendiente') return;
    notifs.push({
      id: 'aprob_' + a.id,
      tipo: 'aprobacion',
      nivel: a.monto >= 1000000 ? 'critico' : 'alto',
      icono: '📋',
      titulo: 'Aprobación pendiente',
      detalle: (a.tipo === 'credito_nuevo' ? 'Crédito' : 'Pago') + ' por ' + fmt(a.monto) + ' — Solicitado por ' + esc(a.solicitante),
      fecha: a.fechaSolicitud,
      accion: function() { showPage('aprobaciones'); }
    });
  });

  // Ordenar: crítico > alto > medio
  var nivelOrden = { critico: 0, alto: 1, medio: 2 };
  notifs.sort(function(a, b) { return (nivelOrden[a.nivel] || 3) - (nivelOrden[b.nivel] || 3); });

  return notifs;
}

// Obtener estado de lectura de notificaciones
function getNotifLeidas() {
  try {
    return JSON.parse(localStorage.getItem('ap_notif_leidas') || '{}');
  } catch(e) { return {}; }
}

function setNotifLeida(notifId) {
  var leidas = getNotifLeidas();
  leidas[notifId] = Date.now();
  localStorage.setItem('ap_notif_leidas', JSON.stringify(leidas));
}

function marcarNotifLeidas() {
  var notifs = generateNotifications();
  var leidas = getNotifLeidas();
  notifs.forEach(function(n) { leidas[n.id] = Date.now(); });
  localStorage.setItem('ap_notif_leidas', JSON.stringify(leidas));
  updateNotifBadge();
  renderNotifications();
  toast('Todas las notificaciones marcadas como leídas', 'success');
}

// Limpiar notificaciones leídas antiguas (>7 días)
function limpiarNotifAntiguas() {
  var leidas = getNotifLeidas();
  var ahora = Date.now();
  var limpias = {};
  Object.keys(leidas).forEach(function(k) {
    if (ahora - leidas[k] < 7 * 86400000) limpias[k] = leidas[k];
  });
  localStorage.setItem('ap_notif_leidas', JSON.stringify(limpias));
}

// Actualizar badge contador
function updateNotifBadge() {
  var notifs = generateNotifications();
  var leidas = getNotifLeidas();
  var noLeidas = notifs.filter(function(n) { return !leidas[n.id]; }).length;
  var badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (noLeidas > 0) {
    badge.style.display = 'flex';
    badge.textContent = noLeidas > 99 ? '99+' : noLeidas;
  } else {
    badge.style.display = 'none';
  }
}

// Toggle panel de notificaciones
function toggleNotifPanel() {
  var panel = document.getElementById('notifPanel');
  if (!panel) return;
  var isVisible = panel.style.display !== 'none';
  if (isVisible) {
    panel.style.display = 'none';
  } else {
    renderNotifications();
    panel.style.display = 'block';
  }
}

// Cerrar panel al hacer click fuera
document.addEventListener('click', function(e) {
  var panel = document.getElementById('notifPanel');
  if (!panel || panel.style.display === 'none') return;
  var bellBtn = e.target.closest('[onclick="toggleNotifPanel()"]');
  var isInsidePanel = e.target.closest('#notifPanel');
  if (!bellBtn && !isInsidePanel) {
    panel.style.display = 'none';
  }
});

// Renderizar lista de notificaciones en el panel
function renderNotifications() {
  var notifs = generateNotifications();
  var leidas = getNotifLeidas();
  var container = document.getElementById('notifList');
  if (!container) return;

  if (notifs.length === 0) {
    container.innerHTML = '<div style="padding:32px 16px;text-align:center;color:var(--gray-400)">' +
      '<div style="font-size:32px;margin-bottom:8px">✅</div>' +
      '<p style="font-size:13px;margin:0">Sin notificaciones pendientes</p></div>';
    return;
  }

  var nivelColors = {
    critico: { bg: '#FEE2E2', border: 'var(--red)', dot: '#DC2626' },
    alto: { bg: '#FEF3C7', border: 'var(--orange)', dot: '#F59E0B' },
    medio: { bg: '#EFF6FF', border: 'var(--blue)', dot: '#3B82F6' }
  };

  var tipoLabels = {
    morosidad: 'Mora',
    vencimiento: 'Vencimiento',
    cobro: 'Cobro',
    fondeo: 'Fondeo',
    expediente: 'Expediente'
  };

  container.innerHTML = notifs.map(function(n) {
    var esLeida = !!leidas[n.id];
    var colors = nivelColors[n.nivel] || nivelColors.medio;
    var opacity = esLeida ? '0.55' : '1';
    var fontWeight = esLeida ? '400' : '500';
    return '<div class="notif-item" data-notif-id="' + n.id + '" style="padding:10px 14px;border-bottom:1px solid var(--gray-100);cursor:pointer;opacity:' + opacity + ';transition:all 0.15s" ' +
      'onmouseenter="this.style.background=\'var(--gray-50)\'" onmouseleave="this.style.background=\'transparent\'" ' +
      'onclick="handleNotifClick(\'' + n.id + '\',' + (n.tipo === 'morosidad' || n.tipo === 'vencimiento' ? '\'creditos\'' : n.tipo === 'cobro' ? '\'pagos\'' : n.tipo === 'fondeo' ? '\'fondeos\'' : '\'clientes\'') + ')">' +
      '<div style="display:flex;align-items:flex-start;gap:10px">' +
        '<div style="flex-shrink:0;margin-top:2px">' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colors.dot + (esLeida ? ';opacity:0.3' : '') + '"></span>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
            '<span style="font-size:12px;font-weight:700;color:' + colors.dot + ';text-transform:uppercase;letter-spacing:0.5px">' + (tipoLabels[n.tipo] || n.tipo) + '</span>' +
            '<span style="font-size:10px;color:var(--gray-400)">' + n.icono + '</span>' +
          '</div>' +
          '<p style="font-size:12px;font-weight:' + fontWeight + ';color:var(--gray-600);margin:0;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + n.detalle + '</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// Manejar click en notificación
function handleNotifClick(notifId, pagina) {
  setNotifLeida(notifId);
  updateNotifBadge();
  document.getElementById('notifPanel').style.display = 'none';
  if (pagina) showPage(pagina);
}

// Refrescar notificaciones (llamar después de cambios en datos)
function refreshNotifications() {
  limpiarNotifAntiguas();
  updateNotifBadge();
  updateApprovalsBadge();
}

