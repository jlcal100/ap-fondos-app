const express = require('express');
const { Pool } = require('pg');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ap-fondos-secret-key-2026';

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/ap_fondos'
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Database initialization
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR NOT NULL,
        nombre VARCHAR,
        rol VARCHAR DEFAULT 'analista',
        email VARCHAR,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create collections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collections (
        id SERIAL PRIMARY KEY,
        key VARCHAR NOT NULL UNIQUE,
        data JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default admin user
    const adminExists = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      ['admin']
    );

    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcryptjs.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, password_hash, nombre, rol, email, activo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['admin', hashedPassword, 'Administrador', 'admin', 'admin@apfondos.com', true]
      );
      console.log('Default admin user created (username: admin, password: admin123)');
    }

    // Initialize collection keys
    const validKeys = [
      'clientes', 'creditos', 'pagos', 'fondeos', 'cotizaciones',
      'contabilidad', 'usuarios', 'auditoria', 'valuaciones',
      'aprobaciones', 'garantias', 'conciliaciones', 'bitacora',
      'tiie_historico'
    ];

    for (const key of validKeys) {
      const exists = await pool.query(
        'SELECT * FROM collections WHERE key = $1',
        [key]
      );
      if (exists.rows.length === 0) {
        await pool.query(
          `INSERT INTO collections (key, data) VALUES ($1, $2)`,
          [key, JSON.stringify([])]
        );
      }
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

// JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Admin middleware
function requireAdmin(req, res, next) {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ============ AUTH ROUTES ============

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    const passwordMatch = await bcryptjs.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol,
        email: user.email,
        activo: user.activo
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, nombre, rol = 'analista', email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, nombre, rol, email, activo)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, username, nombre, rol, email`,
      [username, hashedPassword, nombre, rol, email]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, username, nombre, rol, email, activo FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/auth/users (admin only)
app.get('/api/auth/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, nombre, rol, email, activo, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/auth/users/:id (admin only)
app.put('/api/auth/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, rol, email, activo } = req.body;

    const result = await pool.query(
      `UPDATE users SET nombre = COALESCE($1, nombre),
                        rol = COALESCE($2, rol),
                        email = COALESCE($3, email),
                        activo = COALESCE($4, activo)
       WHERE id = $5
       RETURNING id, username, nombre, rol, email, activo`,
      [nombre, rol, email, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ============ PASSWORD POLICY ============
// Política: mín 12 chars, 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial
function validatePasswordPolicy(pwd) {
  if (!pwd || typeof pwd !== 'string') return 'Contraseña obligatoria';
  if (pwd.length < 12) return 'Mínimo 12 caracteres';
  if (!/[A-Z]/.test(pwd)) return 'Debe incluir al menos una mayúscula';
  if (!/[a-z]/.test(pwd)) return 'Debe incluir al menos una minúscula';
  if (!/[0-9]/.test(pwd)) return 'Debe incluir al menos un número';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) return 'Debe incluir al menos un carácter especial';
  return null;
}

// PUT /api/auth/me/password — Usuario autenticado cambia su propia contraseña
app.put('/api/auth/me/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
    }

    // Obtener usuario actual
    const userResult = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];

    // Validar contraseña actual
    const passwordMatch = await bcryptjs.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Hashear y guardar la nueva
    const newHash = await bcryptjs.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, user.id]
    );

    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Change own password error:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

// PUT /api/auth/users/:id/password — Admin resetea la contraseña de cualquier usuario
app.put('/api/auth/users/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Nueva contraseña obligatoria' });
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const userResult = await pool.query(
      'SELECT id, username, nombre FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const newHash = await bcryptjs.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, id]
    );

    res.json({
      success: true,
      message: 'Contraseña reseteada correctamente',
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: 'Error al resetear la contraseña' });
  }
});

// ============ DATA API ROUTES ============

// GET /api/data/:key (requires auth)
app.get('/api/data/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;

    const result = await pool.query(
      'SELECT data FROM collections WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(result.rows[0].data);
  } catch (error) {
    console.error('Get data error:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// PUT /api/data/:key (requires auth)
app.put('/api/data/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const { data } = req.body;

    if (data === undefined) {
      return res.status(400).json({ error: 'Data field is required' });
    }

    const result = await pool.query(
      `UPDATE collections SET data = $1, updated_at = CURRENT_TIMESTAMP
       WHERE key = $2
       RETURNING data, updated_at`,
      [JSON.stringify(data), key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({
      data: result.rows[0].data,
      updated_at: result.rows[0].updated_at
    });
  } catch (error) {
    console.error('Update data error:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});

// ============ TIIE AUTO-UPDATE FROM BANXICO ============

// GET /api/tiie/actualizar — Fetches latest TIIE from Banxico and updates if changed
app.get('/api/tiie/actualizar', authenticateToken, async (req, res) => {
  const BANXICO_TOKEN = process.env.BANXICO_TOKEN;
  if (!BANXICO_TOKEN) {
    return res.json({ updated: false, message: 'BANXICO_TOKEN no configurado', tasa: null });
  }

  try {
    // TIIE 28 días = serie SF60648
    const response = await fetch(
      'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF60648/datos/oportuno',
      { headers: { 'Bmx-Token': BANXICO_TOKEN } }
    );

    if (!response.ok) {
      return res.json({ updated: false, message: 'Error al consultar Banxico: ' + response.status, tasa: null });
    }

    const json = await response.json();
    const series = json.bmx && json.bmx.series && json.bmx.series[0];
    if (!series || !series.datos || series.datos.length === 0) {
      return res.json({ updated: false, message: 'Sin datos de Banxico', tasa: null });
    }

    const dato = series.datos[series.datos.length - 1];
    // Banxico returns date as "dd/mm/yyyy" and rate as string like "9.2500"
    const partesFecha = dato.fecha.split('/');
    const fechaBanxico = partesFecha[2] + '-' + partesFecha[1] + '-' + partesFecha[0];
    const tasaBanxico = parseFloat(dato.dato) / 100; // Convert percentage to decimal

    if (isNaN(tasaBanxico)) {
      return res.json({ updated: false, message: 'Tasa no válida de Banxico', tasa: null });
    }

    // Get current TIIE history from DB
    const result = await pool.query("SELECT data FROM collections WHERE key = 'tiie_historico'");
    let tiieHist = result.rows.length > 0 ? (result.rows[0].data || []) : [];
    if (typeof tiieHist === 'string') tiieHist = JSON.parse(tiieHist);

    // Check if this date already exists
    const yaExiste = tiieHist.some(t => t.fecha === fechaBanxico);
    if (yaExiste) {
      return res.json({ updated: false, message: 'TIIE ya registrada para ' + fechaBanxico, tasa: tasaBanxico, fecha: fechaBanxico });
    }

    // Add new TIIE entry
    const newId = tiieHist.length > 0 ? Math.max(...tiieHist.map(t => t.id || 0)) + 1 : 1;
    tiieHist.push({ id: newId, fecha: fechaBanxico, tasa: tasaBanxico, fuente: 'Banxico (automático)' });

    // Save to DB
    await pool.query(
      "UPDATE collections SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'tiie_historico'",
      [JSON.stringify(tiieHist)]
    );

    res.json({ updated: true, message: 'TIIE actualizada', tasa: tasaBanxico, fecha: fechaBanxico });
  } catch (error) {
    console.error('TIIE fetch error:', error);
    res.json({ updated: false, message: 'Error: ' + error.message, tasa: null });
  }
});

// ============ STATIC FILES & DEFAULT ROUTE ============

// Remove query strings from requested paths
app.use((req, res, next) => {
  req.url = req.url.split('?')[0];
  next();
});

// Set cache headers for specific file types
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// Static file serving
app.use(express.static(__dirname));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============ SERVER STARTUP ============

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`AP Fondos server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});
