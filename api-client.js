// API Client - handles authentication and data sync with server
var ApiClient = (function() {
  'use strict';

  var TOKEN_KEY = 'ap_auth_token';
  var USER_KEY = 'ap_auth_user';
  var _cache = {};  // in-memory cache of all collections
  var _initialized = false;
  var _syncQueue = []; // pending writes
  var _syncing = false;

  // Valid collection keys
  var VALID_KEYS = ['clientes','creditos','pagos','fondeos','cotizaciones','contabilidad','usuarios','auditoria','valuaciones','aprobaciones','garantias','conciliaciones','bitacora','tiie_historico'];

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch(e) { return null; } }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }

  function isLoggedIn() { return !!getToken(); }

  // Make API request with auth header
  function apiRequest(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    var token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r) {
      if (r.status === 401) {
        clearToken();
        showLoginScreen();
        throw new Error('Sesión expirada');
      }
      return r.json();
    });
  }

  // Login
  function login(username, password) {
    return apiRequest('POST', '/api/auth/login', { username: username, password: password })
      .then(function(res) {
        if (res.token) {
          setToken(res.token);
          setUser(res.user);
          return res.user;
        }
        throw new Error(res.error || 'Login failed');
      });
  }

  function logout() {
    clearToken();
    _cache = {};
    _initialized = false;
    showLoginScreen();
  }

  // Load ALL collections from server into cache
  function loadAllData() {
    var promises = VALID_KEYS.map(function(key) {
      return apiRequest('GET', '/api/data/' + key)
        .then(function(res) {
          _cache[key] = Array.isArray(res) ? res : (res.data || []);
        })
        .catch(function(err) {
          console.warn('Failed to load ' + key + ':', err);
          _cache[key] = [];
        });
    });
    return Promise.all(promises).then(function() {
      _initialized = true;
      console.log('All data loaded from server');
    });
  }

  // Read from cache (synchronous)
  function read(key) {
    if (!_cache[key]) return [];
    // Return a deep copy to prevent accidental mutation
    try {
      return JSON.parse(JSON.stringify(_cache[key]));
    } catch(e) {
      return _cache[key] || [];
    }
  }

  // Write to cache AND queue server sync (synchronous from caller's perspective)
  function write(key, data) {
    _cache[key] = data;
    // Also write to localStorage as fallback
    try {
      localStorage.setItem('apf_' + key, JSON.stringify(data));
    } catch(e) {}
    // Queue async server write
    queueSync(key, data);
  }

  function queueSync(key, data) {
    // Remove any pending sync for same key (only latest matters)
    _syncQueue = _syncQueue.filter(function(item) { return item.key !== key; });
    _syncQueue.push({ key: key, data: data });
    processQueue();
  }

  function processQueue() {
    if (_syncing || _syncQueue.length === 0) return;
    _syncing = true;
    var item = _syncQueue.shift();
    apiRequest('PUT', '/api/data/' + item.key, { data: item.data })
      .then(function() {
        _syncing = false;
        if (_syncQueue.length > 0) processQueue();
      })
      .catch(function(err) {
        console.error('Sync failed for ' + item.key + ':', err);
        _syncing = false;
        // Retry after delay
        setTimeout(function() { processQueue(); }, 3000);
      });
  }

  // Register user (admin only)
  function register(userData) {
    return apiRequest('POST', '/api/auth/register', userData);
  }

  // Get all users (admin only)
  function getUsers() {
    return apiRequest('GET', '/api/auth/users');
  }

  // Update user (admin only)
  function updateUser(id, userData) {
    return apiRequest('PUT', '/api/auth/users/' + id, userData);
  }

  return {
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getToken: getToken,
    getUser: getUser,
    loadAllData: loadAllData,
    read: read,
    write: write,
    register: register,
    getUsers: getUsers,
    updateUser: updateUser,
    VALID_KEYS: VALID_KEYS,
    getCache: function() { return _cache; }
  };
})();

// Show login screen
function showLoginScreen() {
  // Hide main app content
  document.getElementById('appContainer').style.display = 'none';

  // Show or create login screen
  var loginDiv = document.getElementById('loginScreen');
  if (!loginDiv) {
    loginDiv = document.createElement('div');
    loginDiv.id = 'loginScreen';
    loginDiv.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1E3050 0%,#152238 100%)">' +
      '<div style="background:#fff;border-radius:16px;padding:40px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">' +
      '<div style="text-align:center;margin-bottom:30px">' +
      '<div style="font-size:24px;font-weight:700;color:#1E3050">AP Operadora de Fondos</div>' +
      '<div style="color:#888;font-size:13px;margin-top:4px">Sistema Financiero</div>' +
      '</div>' +
      '<div id="loginError" style="display:none;background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:13px"></div>' +
      '<div style="margin-bottom:16px">' +
      '<label style="display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:6px">Usuario</label>' +
      '<input type="text" id="loginUser" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box" placeholder="Ingresa tu usuario">' +
      '</div>' +
      '<div style="margin-bottom:24px">' +
      '<label style="display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:6px">Contraseña</label>' +
      '<input type="password" id="loginPass" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box" placeholder="Ingresa tu contraseña">' +
      '</div>' +
      '<button id="loginBtn" onclick="doLogin()" style="width:100%;padding:12px;background:#C8102E;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Iniciar Sesión</button>' +
      '<div style="text-align:center;margin-top:16px;color:#999;font-size:11px">© 2026 AP Operadora de Fondos, S.A. de C.V.</div>' +
      '</div></div>';
    document.body.appendChild(loginDiv);

    // Handle Enter key on password field
    document.getElementById('loginPass').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') doLogin();
    });
    document.getElementById('loginUser').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') document.getElementById('loginPass').focus();
    });
  }
  loginDiv.style.display = 'block';
}

function doLogin() {
  var user = document.getElementById('loginUser').value.trim();
  var pass = document.getElementById('loginPass').value;
  var errDiv = document.getElementById('loginError');
  var btn = document.getElementById('loginBtn');

  if (!user || !pass) {
    errDiv.textContent = 'Ingresa usuario y contraseña';
    errDiv.style.display = 'block';
    return;
  }

  btn.textContent = 'Ingresando...';
  btn.disabled = true;
  errDiv.style.display = 'none';

  ApiClient.login(user, pass)
    .then(function(userData) {
      // Load all data from server
      return ApiClient.loadAllData().then(function() {
        // Hide login, show app
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = '';
        // Set currentUser for the app
        if (typeof window !== 'undefined') {
          window.currentUser = userData;
        }
        // Initialize full app (initData + dashboard + everything)
        if (typeof initApp === 'function') {
          initApp();
        } else if (typeof renderDashboard === 'function') {
          renderDashboard();
        }
        if (typeof toast === 'function') toast('Bienvenido, ' + userData.nombre, 'success');
      });
    })
    .catch(function(err) {
      errDiv.textContent = err.message || 'Error al iniciar sesión';
      errDiv.style.display = 'block';
      btn.textContent = 'Iniciar Sesión';
      btn.disabled = false;
    });
}
