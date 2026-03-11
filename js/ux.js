// ====== MODULE: ux.js ======
// Responsive/mobile, global search (openSearch, closeSearch, onGlobalSearch), dark mode, scroll-to-top

// ============================================================
//  SPRINT K — RESPONSIVE & MOBILE
// ============================================================

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('active');
  document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function closeSidebar() {
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.remove('open');
  backdrop.classList.remove('active');
  document.body.style.overflow = '';
}

// Cerrar sidebar al navegar (mobile)
var originalShowPage = showPage;

// Interceptamos la navegación para cerrar sidebar en mobile
(function() {
  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function(item) {
    item.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });
})();

// Cerrar sidebar al redimensionar a desktop
window.addEventListener('resize', function() {
  if (window.innerWidth > 768) {
    closeSidebar();
  }
});

// ============================================================
//  SPRINT J — UX AVANZADA
// ============================================================

// === BÚSQUEDA GLOBAL ===
var searchSelectedIdx = -1;
var searchResultsCache = [];

function openSearch() {
  document.getElementById('searchOverlay').classList.add('active');
  var input = document.getElementById('globalSearchInput');
  input.value = '';
  input.focus();
  searchSelectedIdx = -1;
  searchResultsCache = [];
  document.getElementById('globalSearchResults').innerHTML = '<div class="search-empty">Escribe para buscar clientes, créditos o fondeos...</div>';
}

function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('active');
  searchSelectedIdx = -1;
  searchResultsCache = [];
}

function onGlobalSearch(query) {
  var results = [];
  var q = (query || '').toLowerCase().trim();
  if (!q) {
    document.getElementById('globalSearchResults').innerHTML = '<div class="search-empty">Escribe para buscar clientes, créditos o fondeos...</div>';
    searchResultsCache = [];
    searchSelectedIdx = -1;
    return;
  }

  // Buscar en clientes
  var clientes = getStore('clientes');
  clientes.forEach(function(c) {
    if ((c.nombre || '').toLowerCase().indexOf(q) !== -1 || (c.rfc || '').toLowerCase().indexOf(q) !== -1 || (c.email || '').toLowerCase().indexOf(q) !== -1) {
      results.push({ tipo: 'cliente', icon: '👤', bg: '#DBEAFE', titulo: esc(c.nombre), sub: (c.rfc || '') + ' · ' + (c.tipo === 'moral' ? 'Persona Moral' : 'Persona Física'), accion: function() { closeSearch(); showPage('clientes'); verCliente(c.id); } });
    }
  });

  // Buscar en créditos
  var creditos = getStore('creditos');
  creditos.forEach(function(cr) {
    var cli = clientes.find(function(c) { return c.id === cr.clienteId; });
    var cliName = cli ? cli.nombre : '';
    if ((cr.numero || '').toLowerCase().indexOf(q) !== -1 || cliName.toLowerCase().indexOf(q) !== -1) {
      results.push({ tipo: 'credito', icon: '💳', bg: '#FEF3C7', titulo: esc(cr.numero), sub: esc(cliName) + ' · ' + fmt(cr.saldo) + ' · ' + cr.estado, accion: function() { closeSearch(); showPage('creditos'); verCredito(cr.id); } });
    }
  });

  // Buscar en fondeos
  var fondeos = getStore('fondeos');
  fondeos.forEach(function(f) {
    if ((f.numero || '').toLowerCase().indexOf(q) !== -1 || (f.fondeador || '').toLowerCase().indexOf(q) !== -1) {
      results.push({ tipo: 'fondeo', icon: '🏦', bg: '#DEF7EC', titulo: esc(f.numero), sub: esc(f.fondeador) + ' · ' + fmt(f.saldo) + ' · ' + f.estado, accion: function() { closeSearch(); showPage('fondeos'); verFondeo(f.id); } });
    }
  });

  // Buscar en páginas
  var paginas = [
    { label: 'Dashboard', page: 'dashboard', keys: 'dashboard inicio resumen' },
    { label: 'Clientes', page: 'clientes', keys: 'clientes expediente' },
    { label: 'Créditos', page: 'creditos', keys: 'creditos prestamos' },
    { label: 'Pagos', page: 'pagos', keys: 'pagos cobros cuotas' },
    { label: 'Cotizador', page: 'cotizador', keys: 'cotizador simulador' },
    { label: 'Fondeos', page: 'fondeos', keys: 'fondeos fondeadores' },
    { label: 'Contabilidad', page: 'contabilidad', keys: 'contabilidad polizas' },
    { label: 'Reportes', page: 'reportes', keys: 'reportes cartera morosidad' },
    { label: 'Administración', page: 'admin', keys: 'administracion usuarios permisos' }
  ];
  paginas.forEach(function(p) {
    if (p.label.toLowerCase().indexOf(q) !== -1 || p.keys.indexOf(q) !== -1) {
      results.push({ tipo: 'pagina', icon: '📄', bg: 'var(--gray-100)', titulo: 'Ir a ' + p.label, sub: 'Navegar a la sección', accion: function() { closeSearch(); showPage(p.page); } });
    }
  });

  searchResultsCache = results;
  searchSelectedIdx = -1;
  renderSearchResults(results);
}

function renderSearchResults(results) {
  var container = document.getElementById('globalSearchResults');
  if (results.length === 0) {
    container.innerHTML = '<div class="search-empty">Sin resultados</div>';
    return;
  }
  container.innerHTML = results.slice(0, 12).map(function(r, i) {
    return '<div class="search-result-item' + (i === searchSelectedIdx ? ' selected' : '') + '" data-idx="' + i + '" onclick="searchResultsCache[' + i + '].accion()" onmouseenter="searchSelectedIdx=' + i + ';highlightSearchResult()">' +
      '<div class="sr-icon" style="background:' + r.bg + '">' + r.icon + '</div>' +
      '<div class="sr-info"><div class="sr-title">' + r.titulo + '</div><div class="sr-sub">' + r.sub + '</div></div>' +
    '</div>';
  }).join('');
}

function highlightSearchResult() {
  document.querySelectorAll('.search-result-item').forEach(function(el, i) {
    el.classList.toggle('selected', i === searchSelectedIdx);
  });
}

function handleSearchKeydown(e) {
  if (!document.getElementById('searchOverlay').classList.contains('active')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (searchResultsCache.length > 0) {
      searchSelectedIdx = Math.min(searchSelectedIdx + 1, Math.min(searchResultsCache.length - 1, 11));
      highlightSearchResult();
      var sel = document.querySelector('.search-result-item.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (searchResultsCache.length > 0) {
      searchSelectedIdx = Math.max(searchSelectedIdx - 1, 0);
      highlightSearchResult();
      var sel = document.querySelector('.search-result-item.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchSelectedIdx >= 0 && searchSelectedIdx < searchResultsCache.length) {
      searchResultsCache[searchSelectedIdx].accion();
    }
  }
}

// === DARK MODE ===
function toggleDarkMode() {
  var isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('ap_dark_mode', isDark ? '1' : '0');
  var icon = document.getElementById('darkIcon');
  if (isDark) {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

function initDarkMode() {
  if (localStorage.getItem('ap_dark_mode') === '1') {
    document.body.classList.add('dark-mode');
    var icon = document.getElementById('darkIcon');
    if (icon) icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}

// === SCROLL TO TOP ===
function initScrollTopBtn() {
  var content = document.querySelector('.content');
  if (!content) return;
  content.addEventListener('scroll', function() {
    var btn = document.getElementById('scrollTopBtn');
    if (!btn) return;
    btn.style.display = content.scrollTop > 300 ? 'flex' : 'none';
  });
}

