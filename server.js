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
      'aprobaciones', 'garantias', 'conciliaciones', 'bitacora'
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
