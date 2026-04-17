const express = require('express');
const { Pool } = require('pg');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fiscalCrypto = require('./server/crypto');
const facturama = require('./server/facturama');
const mailer = require('./server/mailer');

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

    // NOTA DE SEGURIDAD:
    // Se eliminó el seed del usuario por default `admin / admin123`.
    // Cualquier instalación nueva debe arrancar únicamente con los 5 usuarios
    // nominales de abajo (cada uno con password temporal individual que DEBE
    // cambiarse en el primer login). Para bases ya desplegadas que tengan el
    // usuario `admin` histórico, se deja abajo una sanación opcional que lo
    // desactiva si sigue con la contraseña por default.

    // Seed de los 5 usuarios nominales si no existen.
    // Cada uno trae una contraseña temporal que el usuario DEBE cambiar en su primer acceso.
    // (política: mín 12 chars, upper, lower, num, especial).
    const seedUsers = [
      { username: 'jlca',          tempPassword: 'Jlca2026!Temporal',     nombre: 'JLCA',             rol: 'admin',           email: 'jlcal100@gmail.com' },
      { username: 'administrador', tempPassword: 'Admin2026!Temporal',    nombre: 'Administrador',    rol: 'admin_limitado',  email: 'administrador@apfondos.com' },
      { username: 'operador',      tempPassword: 'Oper2026!Temporal',     nombre: 'Operador',         rol: 'operador',        email: 'operador@apfondos.com' },
      { username: 'adriana',       tempPassword: 'Adri2026!Temporal',     nombre: 'Adriana Martinez', rol: 'admin_limitado',  email: 'adrianamartinez@corporativoap.com.mx' },
      { username: 'aide',          tempPassword: 'Aide2026!Temporal',     nombre: 'Aide Reyes',       rol: 'analista',        email: 'apfondos@corporativoap.com.mx' }
    ];
    for (const u of seedUsers) {
      const exists = await pool.query('SELECT id FROM users WHERE username = $1', [u.username]);
      if (exists.rows.length === 0) {
        const hash = await bcryptjs.hash(u.tempPassword, 10);
        await pool.query(
          `INSERT INTO users (username, password_hash, nombre, rol, email, activo)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [u.username, hash, u.nombre, u.rol, u.email]
        );
        console.log('Seeded user: ' + u.username + ' (nombre: ' + u.nombre + ', rol: ' + u.rol + ')');
      }
    }

    // Sanación: desactivar el usuario histórico `admin` si sigue con la
    // contraseña por default `admin123`. No lo borramos para no perder
    // referencias históricas en bitácora, solo lo marcamos inactivo.
    try {
      const adminRow = await pool.query('SELECT id, password_hash, activo FROM users WHERE username = $1', ['admin']);
      if (adminRow.rows.length > 0) {
        const row = adminRow.rows[0];
        const sigueConDefault = await bcryptjs.compare('admin123', row.password_hash);
        if (sigueConDefault && row.activo) {
          await pool.query('UPDATE users SET activo = false WHERE id = $1', [row.id]);
          console.log('[SECURITY] Usuario por default `admin` desactivado (aún tenía la contraseña admin123).');
        }
      }
    } catch (e) {
      console.warn('No se pudo revisar el usuario admin por default:', e.message);
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

    // Fiscal configuration (emisor + credenciales Facturama cifradas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fiscal_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        razon_social VARCHAR,
        rfc VARCHAR,
        regimen_fiscal VARCHAR,
        cp VARCHAR,
        serie_factura VARCHAR DEFAULT 'A',
        serie_rep VARCHAR DEFAULT 'P',
        folio_factura_inicial INTEGER DEFAULT 1,
        folio_rep_inicial INTEGER DEFAULT 1,
        ambiente VARCHAR DEFAULT 'sandbox',
        api_user_cipher TEXT,
        api_pass_cipher TEXT,
        csd_no_cert VARCHAR,
        csd_vigencia VARCHAR,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR,
        CONSTRAINT fiscal_config_single_row CHECK (id = 1)
      )
    `);

    // Ensure row id=1 exists
    const fcExists = await pool.query('SELECT id FROM fiscal_config WHERE id = 1');
    if (fcExists.rows.length === 0) {
      await pool.query(`INSERT INTO fiscal_config (id) VALUES (1)`);
    }

    // Tabla de CFDIs emitidos (timbrados o en borrador)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fiscal_cfdis (
        id SERIAL PRIMARY KEY,
        cfdi_local_id VARCHAR,               -- id usado por el frontend
        cliente_id INTEGER,
        periodo VARCHAR,
        serie VARCHAR,
        folio INTEGER,
        subtotal NUMERIC(14,2),
        iva NUMERIC(14,2),
        total NUMERIC(14,2),
        estado VARCHAR DEFAULT 'borrador',   -- borrador | timbrado | cancelado | error
        uuid VARCHAR,
        facturama_id VARCHAR,
        fecha_timbrado TIMESTAMP,
        xml_timbrado TEXT,                   -- base64
        pdf_base64 TEXT,
        no_certificado_sat VARCHAR,
        sello_sat TEXT,
        cancelado_en TIMESTAMP,
        motivo_cancelacion VARCHAR,
        error_timbrado TEXT,
        payload JSONB,                       -- datos originales del CFDI local
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR
      )
    `);

    // Migración: agregar columnas para REP (complemento de pagos) si no existen
    await pool.query(`ALTER TABLE fiscal_cfdis ADD COLUMN IF NOT EXISTS tipo_comprobante VARCHAR DEFAULT 'I'`);
    await pool.query(`ALTER TABLE fiscal_cfdis ADD COLUMN IF NOT EXISTS cfdi_relacionado_id INTEGER`);
    await pool.query(`ALTER TABLE fiscal_cfdis ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR DEFAULT 'PPD'`);

    // Tabla de folios consecutivos por serie (single source of truth)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fiscal_folios (
        serie VARCHAR PRIMARY KEY,
        ultimo_folio INTEGER NOT NULL DEFAULT 0
      )
    `);

    console.log('Database initialized successfully');
    if (!fiscalCrypto.isConfigured()) {
      console.warn('⚠️  FISCAL_ENCRYPTION_KEY no configurada — el timbrado fiscal estará deshabilitado hasta que la agregues.');
      console.warn('   Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
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

    // Rechazar usuarios desactivados (p. ej. admin por default sanitizado).
    // Se responde con 401 genérico para no revelar el estado del usuario.
    if (user.activo === false) {
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

// POST /api/auth/register (admin only — crear nuevos usuarios requiere sesión admin activa)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, nombre, rol = 'analista', email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Política mínima de password (misma que en el frontend)
    if (password.length < 12) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, nombre, rol, email, activo)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, username, nombre, rol, email`,
      [username, hashedPassword, nombre, rol, email]
    );

    const user = result.rows[0];

    res.status(201).json({ user });
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

// ============================================================
//  FISCAL / FACTURAMA ENDPOINTS
// ============================================================

// Helper: obtener config fiscal desencriptada (sólo server-side)
async function getFiscalConfigDecrypted() {
  const r = await pool.query('SELECT * FROM fiscal_config WHERE id = 1');
  if (r.rows.length === 0) throw new Error('Fiscal config no inicializada');
  const row = r.rows[0];
  return {
    razonSocial: row.razon_social,
    rfc: row.rfc,
    regimenFiscal: row.regimen_fiscal,
    cp: row.cp,
    serieFactura: row.serie_factura,
    serieREP: row.serie_rep,
    folioFacturaInicial: row.folio_factura_inicial,
    folioREPInicial: row.folio_rep_inicial,
    ambiente: row.ambiente,
    apiUser: row.api_user_cipher ? fiscalCrypto.decrypt(row.api_user_cipher) : null,
    apiPass: row.api_pass_cipher ? fiscalCrypto.decrypt(row.api_pass_cipher) : null,
    csdNoCert: row.csd_no_cert,
    csdVigencia: row.csd_vigencia
  };
}

// GET /api/fiscal/config — Devuelve la config sin credenciales
app.get('/api/fiscal/config', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM fiscal_config WHERE id = 1');
    if (r.rows.length === 0) return res.json(null);
    const row = r.rows[0];
    res.json({
      razonSocial: row.razon_social || '',
      rfc: row.rfc || '',
      regimenFiscal: row.regimen_fiscal || '',
      cp: row.cp || '',
      serieFactura: row.serie_factura || 'A',
      serieREP: row.serie_rep || 'P',
      folioFacturaInicial: row.folio_factura_inicial || 1,
      folioREPInicial: row.folio_rep_inicial || 1,
      ambiente: row.ambiente || 'sandbox',
      apiUserConfigured: !!row.api_user_cipher,
      apiPassConfigured: !!row.api_pass_cipher,
      apiUrl: (row.ambiente === 'produccion') ? 'https://api.facturama.mx' : 'https://apisandbox.facturama.mx',
      csdNoCert: row.csd_no_cert || '',
      csdVigencia: row.csd_vigencia || '',
      encryptionKeyConfigured: fiscalCrypto.isConfigured(),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
    });
  } catch (err) {
    console.error('Fiscal get config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/fiscal/config — Admin guarda config. Si envía apiUser/apiPass, se cifran.
app.put('/api/fiscal/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      razonSocial, rfc, regimenFiscal, cp,
      serieFactura, serieREP, folioFacturaInicial, folioREPInicial,
      ambiente, apiUser, apiPass
    } = req.body || {};

    // Validaciones
    if (!razonSocial || razonSocial.length < 3) return res.status(400).json({ error: 'Razón social inválida' });
    if (!rfc || !/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i.test(rfc)) return res.status(400).json({ error: 'RFC inválido' });
    if (!cp || !/^\d{5}$/.test(cp)) return res.status(400).json({ error: 'C.P. debe tener 5 dígitos' });
    if (!regimenFiscal) return res.status(400).json({ error: 'Régimen fiscal obligatorio' });

    // Cifrar credenciales si vienen (si están vacías, se respeta lo existente)
    let apiUserCipher = undefined;
    let apiPassCipher = undefined;
    if (typeof apiUser === 'string' && apiUser.trim() !== '') {
      if (!fiscalCrypto.isConfigured()) return res.status(400).json({ error: 'FISCAL_ENCRYPTION_KEY no configurada en el servidor. Pídeselo a DevOps.' });
      apiUserCipher = fiscalCrypto.encrypt(apiUser.trim());
    }
    if (typeof apiPass === 'string' && apiPass.trim() !== '') {
      if (!fiscalCrypto.isConfigured()) return res.status(400).json({ error: 'FISCAL_ENCRYPTION_KEY no configurada en el servidor. Pídeselo a DevOps.' });
      apiPassCipher = fiscalCrypto.encrypt(apiPass.trim());
    }

    // Build SET dinámico
    const sets = [
      'razon_social = $1', 'rfc = $2', 'regimen_fiscal = $3', 'cp = $4',
      'serie_factura = $5', 'serie_rep = $6',
      'folio_factura_inicial = $7', 'folio_rep_inicial = $8',
      'ambiente = $9',
      'updated_at = CURRENT_TIMESTAMP', 'updated_by = $10'
    ];
    const params = [
      razonSocial.trim(),
      rfc.toUpperCase().trim(),
      regimenFiscal,
      cp,
      (serieFactura || 'A').trim(),
      (serieREP || 'P').trim(),
      parseInt(folioFacturaInicial) || 1,
      parseInt(folioREPInicial) || 1,
      ambiente === 'produccion' ? 'produccion' : 'sandbox',
      req.user.username
    ];
    if (apiUserCipher !== undefined) { sets.push('api_user_cipher = $' + (params.length + 1)); params.push(apiUserCipher); }
    if (apiPassCipher !== undefined) { sets.push('api_pass_cipher = $' + (params.length + 1)); params.push(apiPassCipher); }

    await pool.query(`UPDATE fiscal_config SET ${sets.join(', ')} WHERE id = 1`, params);

    res.json({ success: true, message: 'Configuración fiscal guardada' });
  } catch (err) {
    console.error('Fiscal put config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fiscal/test — Prueba credenciales con Facturama (admin only)
app.post('/api/fiscal/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!fiscalCrypto.isConfigured()) return res.status(400).json({ error: 'FISCAL_ENCRYPTION_KEY no configurada' });
    const cfg = await getFiscalConfigDecrypted();
    if (!cfg.apiUser || !cfg.apiPass) return res.status(400).json({ error: 'Credenciales de Facturama no configuradas' });
    const csds = await facturama.testCredenciales(cfg);

    // Actualizar el número de certificado y vigencia si viene un CSD activo
    let noCert = '', vigencia = '';
    if (Array.isArray(csds) && csds.length > 0) {
      const activo = csds[0];
      noCert = activo.NoCertificate || activo.Certificate || '';
      vigencia = activo.ExpirationDate || '';
      await pool.query(
        'UPDATE fiscal_config SET csd_no_cert = $1, csd_vigencia = $2 WHERE id = 1',
        [noCert, vigencia]
      );
    }
    res.json({
      success: true,
      ambiente: cfg.ambiente,
      apiUrl: facturama.getBaseUrl(cfg.ambiente),
      csds: (csds || []).map(function(c) {
        return { NoCertificate: c.NoCertificate || c.Certificate, ExpirationDate: c.ExpirationDate, Rfc: c.Rfc };
      })
    });
  } catch (err) {
    console.error('Fiscal test error:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
//  Folios consecutivos (atómico por serie)
// ------------------------------------------------------------
async function reservarFolio(serie) {
  const cfgR = await pool.query('SELECT serie_factura, serie_rep, folio_factura_inicial, folio_rep_inicial FROM fiscal_config WHERE id = 1');
  const cfg = cfgR.rows[0] || {};
  const inicial = (serie === cfg.serie_rep) ? (cfg.folio_rep_inicial || 1) : (cfg.folio_factura_inicial || 1);
  // UPSERT atómico; si folio < inicial, se sube al inicial
  const result = await pool.query(`
    INSERT INTO fiscal_folios (serie, ultimo_folio)
    VALUES ($1, $2)
    ON CONFLICT (serie) DO UPDATE
      SET ultimo_folio = GREATEST(fiscal_folios.ultimo_folio, $2 - 1) + 1
    RETURNING ultimo_folio
  `, [serie, inicial]);
  return result.rows[0].ultimo_folio;
}

async function revertirFolio(serie) {
  await pool.query('UPDATE fiscal_folios SET ultimo_folio = GREATEST(ultimo_folio - 1, 0) WHERE serie = $1', [serie]);
}

// ------------------------------------------------------------
//  POST /api/fiscal/cfdi/timbrar — Timbra un CFDI con Facturama
// ------------------------------------------------------------
// Body: { cfdi: {...todo el objeto CFDI del frontend, incluyendo cliente} }
app.post('/api/fiscal/cfdi/timbrar', authenticateToken, async (req, res) => {
  let folioReservado = null;
  let serieUsada = null;
  try {
    if (!fiscalCrypto.isConfigured()) return res.status(400).json({ error: 'FISCAL_ENCRYPTION_KEY no configurada en el servidor' });
    const cfg = await getFiscalConfigDecrypted();
    if (!cfg.apiUser || !cfg.apiPass) return res.status(400).json({ error: 'Credenciales Facturama no configuradas (Admin → Fiscal)' });
    if (!cfg.rfc || !cfg.razonSocial || !cfg.regimenFiscal || !cfg.cp) {
      return res.status(400).json({ error: 'Datos fiscales del emisor incompletos (Admin → Fiscal)' });
    }

    const cfdi = req.body.cfdi;
    if (!cfdi || !cfdi.cliente) return res.status(400).json({ error: 'Falta objeto CFDI o cliente' });

    // Checar que no esté ya timbrado
    if (cfdi.cfdi_local_id || cfdi.id) {
      const existing = await pool.query(
        'SELECT id, estado, uuid FROM fiscal_cfdis WHERE cfdi_local_id = $1 AND estado = $2',
        [String(cfdi.id || cfdi.cfdi_local_id), 'timbrado']
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Este CFDI ya está timbrado (UUID ' + existing.rows[0].uuid + ')' });
      }
    }

    // Reservar folio atómicamente
    serieUsada = cfg.serieFactura || 'A';
    folioReservado = await reservarFolio(serieUsada);
    cfdi.serie = serieUsada;
    cfdi.folio = folioReservado;

    // Llamada a Facturama
    const stamped = await facturama.timbrarCFDI(cfdi, cfg);

    // Descargar XML y PDF
    let xmlB64 = null, pdfB64 = null;
    try {
      const xmlRes = await facturama.descargarXML(stamped.facturamaId, cfg);
      xmlB64 = xmlRes && xmlRes.Content;
    } catch (e) { console.warn('No pudo descargar XML:', e.message); }
    try {
      const pdfRes = await facturama.descargarPDF(stamped.facturamaId, cfg);
      pdfB64 = pdfRes && pdfRes.Content;
    } catch (e) { console.warn('No pudo descargar PDF:', e.message); }

    // Guardar en BD
    const insert = await pool.query(`
      INSERT INTO fiscal_cfdis
        (cfdi_local_id, cliente_id, periodo, serie, folio,
         subtotal, iva, total, estado, uuid, facturama_id, fecha_timbrado,
         xml_timbrado, pdf_base64, no_certificado_sat, sello_sat, payload, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'timbrado',$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id
    `, [
      String(cfdi.id || ''),
      cfdi.clienteId || (cfdi.cliente && cfdi.cliente.id) || null,
      cfdi.periodo || null,
      serieUsada,
      folioReservado,
      cfdi.subtotal || 0, cfdi.iva || 0, cfdi.total || 0,
      stamped.uuid,
      stamped.facturamaId,
      stamped.fechaTimbrado,
      xmlB64, pdfB64,
      stamped.noCertificadoSAT, stamped.selloSAT,
      JSON.stringify(cfdi),
      req.user.username
    ]);

    res.json({
      success: true,
      uuid: stamped.uuid,
      facturamaId: stamped.facturamaId,
      serie: serieUsada,
      folio: folioReservado,
      fechaTimbrado: stamped.fechaTimbrado,
      noCertificadoSAT: stamped.noCertificadoSAT,
      cfdiDbId: insert.rows[0].id,
      hasPDF: !!pdfB64,
      hasXML: !!xmlB64
    });
  } catch (err) {
    console.error('Fiscal timbrar error:', err);
    // Revertir folio si falló el timbrado
    if (folioReservado && serieUsada) {
      try { await revertirFolio(serieUsada); } catch (e) { console.error('Revert folio failed:', e); }
    }
    // Guardar CFDI en estado 'error' para auditoría
    try {
      await pool.query(`
        INSERT INTO fiscal_cfdis
          (cfdi_local_id, cliente_id, periodo, serie, folio, subtotal, iva, total, estado, error_timbrado, payload, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'error',$9,$10,$11)
      `, [
        String((req.body.cfdi && req.body.cfdi.id) || ''),
        (req.body.cfdi && req.body.cfdi.clienteId) || null,
        (req.body.cfdi && req.body.cfdi.periodo) || null,
        serieUsada, folioReservado,
        (req.body.cfdi && req.body.cfdi.subtotal) || 0,
        (req.body.cfdi && req.body.cfdi.iva) || 0,
        (req.body.cfdi && req.body.cfdi.total) || 0,
        err.message,
        JSON.stringify(req.body.cfdi || {}),
        req.user.username
      ]);
    } catch (e) { console.error('No se pudo guardar CFDI en error:', e); }

    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST /api/fiscal/cfdi/:id/cancelar
app.post('/api/fiscal/cfdi/:id/cancelar', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, uuidReemplazo } = req.body || {};
    if (!['01', '02', '03', '04'].includes(String(motivo))) {
      return res.status(400).json({ error: 'Motivo SAT inválido (debe ser 01, 02, 03 o 04)' });
    }
    if (motivo === '01' && !uuidReemplazo) {
      return res.status(400).json({ error: 'Motivo 01 requiere uuidReemplazo' });
    }

    const r = await pool.query('SELECT * FROM fiscal_cfdis WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'CFDI no encontrado' });
    const row = r.rows[0];
    if (row.estado !== 'timbrado') return res.status(400).json({ error: 'Sólo se pueden cancelar CFDI timbrados (estado actual: ' + row.estado + ')' });

    const cfg = await getFiscalConfigDecrypted();
    const resCancel = await facturama.cancelarCFDI(row.facturama_id, motivo, uuidReemplazo, cfg);

    await pool.query(
      `UPDATE fiscal_cfdis SET estado = 'cancelado', cancelado_en = CURRENT_TIMESTAMP, motivo_cancelacion = $1 WHERE id = $2`,
      [motivo, id]
    );

    res.json({ success: true, motivo, resultado: resCancel });
  } catch (err) {
    console.error('Fiscal cancelar error:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/fiscal/cfdi — listar CFDIs timbrados
app.get('/api/fiscal/cfdi', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, cfdi_local_id, cliente_id, periodo, serie, folio, subtotal, iva, total,
             estado, uuid, facturama_id, fecha_timbrado, cancelado_en, motivo_cancelacion,
             error_timbrado, tipo_comprobante, cfdi_relacionado_id, metodo_pago,
             created_at, created_by
      FROM fiscal_cfdis
      ORDER BY created_at DESC
    `);
    res.json(r.rows);
  } catch (err) {
    console.error('Fiscal list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiscal/cfdi/:id/pdf — Descarga PDF (base64)
app.get('/api/fiscal/cfdi/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT pdf_base64, facturama_id, uuid FROM fiscal_cfdis WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'CFDI no encontrado' });
    let pdf = r.rows[0].pdf_base64;
    if (!pdf && r.rows[0].facturama_id) {
      const cfg = await getFiscalConfigDecrypted();
      const pdfRes = await facturama.descargarPDF(r.rows[0].facturama_id, cfg);
      pdf = pdfRes && pdfRes.Content;
      if (pdf) await pool.query('UPDATE fiscal_cfdis SET pdf_base64 = $1 WHERE id = $2', [pdf, req.params.id]);
    }
    if (!pdf) return res.status(404).json({ error: 'PDF no disponible' });
    res.json({ contentType: 'application/pdf', uuid: r.rows[0].uuid, base64: pdf });
  } catch (err) {
    console.error('Fiscal pdf error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiscal/cfdi/:id/xml — Descarga XML timbrado
app.get('/api/fiscal/cfdi/:id/xml', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT xml_timbrado, facturama_id, uuid FROM fiscal_cfdis WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'CFDI no encontrado' });
    let xml = r.rows[0].xml_timbrado;
    if (!xml && r.rows[0].facturama_id) {
      const cfg = await getFiscalConfigDecrypted();
      const xmlRes = await facturama.descargarXML(r.rows[0].facturama_id, cfg);
      xml = xmlRes && xmlRes.Content;
      if (xml) await pool.query('UPDATE fiscal_cfdis SET xml_timbrado = $1 WHERE id = $2', [xml, req.params.id]);
    }
    if (!xml) return res.status(404).json({ error: 'XML no disponible' });
    res.json({ contentType: 'application/xml', uuid: r.rows[0].uuid, base64: xml });
  } catch (err) {
    console.error('Fiscal xml error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  POST /api/fiscal/rep/timbrar — Timbra un REP (Complemento de Pagos)
//  Asociado a un CFDI de tipo Ingreso previamente timbrado con MetodoPago=PPD
//  Body: {
//    cfdi_relacionado_id: number,           // id en fiscal_cfdis de la factura original
//    fecha: 'YYYY-MM-DDTHH:mm:ss',          // fecha de pago
//    forma_pago: '03',                      // catálogo SAT c_FormaPago (03=transferencia)
//    monto: 1160.00,                        // monto pagado
//    num_operacion: 'REF12345',             // referencia bancaria (opcional)
//    moneda: 'MXN',
//    tipo_cambio: 1,
//    num_parcialidad: 1,
//    imp_saldo_anterior: 1160.00,           // saldo antes del pago
//    imp_saldo_insoluto: 0.00               // saldo después del pago (0 si se liquida)
//  }
// ============================================================
app.post('/api/fiscal/rep/timbrar', authenticateToken, async (req, res) => {
  try {
    if (!fiscalCrypto.isConfigured()) return res.status(400).json({ error: 'FISCAL_ENCRYPTION_KEY no configurada' });
    const cfg = await getFiscalConfigDecrypted();
    if (!cfg) return res.status(400).json({ error: 'Configuración fiscal no inicializada' });
    if (!cfg.apiUser || !cfg.apiPass) return res.status(400).json({ error: 'Credenciales de Facturama no configuradas' });

    const b = req.body || {};
    if (!b.cfdi_relacionado_id) return res.status(400).json({ error: 'Falta cfdi_relacionado_id' });
    if (!b.monto || Number(b.monto) <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!b.forma_pago) return res.status(400).json({ error: 'Falta forma_pago (catálogo SAT)' });
    if (!b.fecha) return res.status(400).json({ error: 'Falta fecha de pago' });

    // Traer la factura original
    const origRes = await pool.query(
      'SELECT * FROM fiscal_cfdis WHERE id = $1',
      [b.cfdi_relacionado_id]
    );
    if (origRes.rows.length === 0) return res.status(404).json({ error: 'CFDI original no encontrado' });
    const orig = origRes.rows[0];
    if (orig.estado !== 'timbrado') return res.status(400).json({ error: 'La factura original no está timbrada (estado: ' + orig.estado + ')' });
    if (!orig.uuid) return res.status(400).json({ error: 'La factura original no tiene UUID' });
    if (orig.tipo_comprobante && orig.tipo_comprobante !== 'I') return res.status(400).json({ error: 'Solo se puede hacer REP de facturas tipo Ingreso' });

    // Reconstruir datos del receptor desde el payload original
    const payloadOrig = orig.payload || {};
    const clienteOrig = payloadOrig.cliente || {};

    // Reservar folio para la serie REP
    const serieREP = cfg.serieREP || 'P';
    const folio = await reservarFolio(serieREP);

    // Calcular proporción de IVA si aplica: si la factura original tenía IVA (iva > 0),
    // entonces el pago se distribuye proporcionalmente.
    const totalOriginal = Number(orig.total) || 0;
    const subtotalOriginal = Number(orig.subtotal) || 0;
    const ivaOriginal = Number(orig.iva) || 0;
    const monto = Number(b.monto);
    let baseIVA16 = 0, importeIVA16 = 0;
    if (ivaOriginal > 0 && totalOriginal > 0) {
      // El pago lleva IVA proporcional
      const factor = monto / totalOriginal;
      baseIVA16 = round2(subtotalOriginal * factor);
      importeIVA16 = round2(ivaOriginal * factor);
    }

    const repPayload = {
      folio: folio,
      serie: serieREP,
      cfdiRelacionado: {
        uuid: orig.uuid,
        serie: orig.serie,
        folio: orig.folio,
        moneda: b.moneda || 'MXN',
        tipoCambioDR: b.tipo_cambio || 1,
        total: totalOriginal,
        metodoPago: 'PPD',
        objetoImp: ivaOriginal > 0 ? '02' : '01'
      },
      receptor: {
        rfc: clienteOrig.rfc || 'XAXX010101000',
        nombre: clienteOrig.razonSocialFiscal || clienteOrig.nombre || '',
        cp: clienteOrig.cpFiscal || clienteOrig.cp || cfg.cp,
        regimenFiscal: clienteOrig.regimenFiscal || '601'
      },
      pago: {
        fecha: b.fecha,
        formaPago: b.forma_pago,
        monedaP: b.moneda || 'MXN',
        tipoCambio: b.tipo_cambio || 1,
        monto: monto,
        numOperacion: b.num_operacion || ''
      },
      parcialidad: {
        numParcialidad: b.num_parcialidad || 1,
        impSaldoAnterior: Number(b.imp_saldo_anterior) || totalOriginal,
        impPagado: monto,
        impSaldoInsoluto: (b.imp_saldo_insoluto != null) ? Number(b.imp_saldo_insoluto) : Math.max(0, (Number(b.imp_saldo_anterior) || totalOriginal) - monto)
      },
      impuestos: { baseIVA16: baseIVA16, importeIVA16: importeIVA16 }
    };

    let resultado;
    try {
      resultado = await facturama.timbrarREP(repPayload, cfg);
    } catch (err) {
      await revertirFolio(serieREP);
      // Guardar error para auditoría
      try {
        await pool.query(
          `INSERT INTO fiscal_cfdis
            (cfdi_local_id, cliente_id, serie, folio, subtotal, iva, total, estado, error_timbrado, payload, tipo_comprobante, cfdi_relacionado_id, metodo_pago, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'error', $8, $9, 'P', $10, 'PUE', $11)`,
          [null, orig.cliente_id, serieREP, folio, 0, 0, monto,
           String(err.message || err).slice(0, 2000), JSON.stringify(repPayload),
           b.cfdi_relacionado_id, req.user.username || String(req.user.id)]
        );
      } catch (e) { /* no-block */ }
      return res.status(502).json({ error: 'Facturama: ' + (err.message || err) });
    }

    const insertRes = await pool.query(
      `INSERT INTO fiscal_cfdis
        (cliente_id, serie, folio, subtotal, iva, total, estado, uuid, facturama_id,
         fecha_timbrado, no_certificado_sat, sello_sat, payload, tipo_comprobante,
         cfdi_relacionado_id, metodo_pago, created_by)
       VALUES ($1, $2, $3, 0, 0, $4, 'timbrado', $5, $6, $7, $8, $9, $10, 'P', $11, 'PUE', $12)
       RETURNING id`,
      [orig.cliente_id, serieREP, folio, monto,
       resultado.uuid, resultado.facturamaId, resultado.fechaTimbrado,
       resultado.noCertificadoSAT, resultado.selloSAT,
       JSON.stringify(repPayload), b.cfdi_relacionado_id,
       req.user.username || String(req.user.id)]
    );

    // Actualizar saldo insoluto del CFDI original si se liquidó
    if (repPayload.parcialidad.impSaldoInsoluto <= 0) {
      // Podríamos marcar la factura como "pagada" aquí si tuviéramos columna
    }

    res.json({
      id: insertRes.rows[0].id,
      uuid: resultado.uuid,
      facturamaId: resultado.facturamaId,
      serie: serieREP,
      folio: folio,
      fechaTimbrado: resultado.fechaTimbrado,
      monto: monto,
      cfdi_relacionado_id: b.cfdi_relacionado_id,
      saldo_insoluto: repPayload.parcialidad.impSaldoInsoluto
    });
  } catch (err) {
    console.error('Fiscal REP error:', err);
    res.status(500).json({ error: err.message });
  }
});

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ============================================================
//  POST /api/fiscal/cfdi/:id/email — Envía CFDI timbrado por email
// ============================================================
app.post('/api/fiscal/cfdi/:id/email', authenticateToken, async (req, res) => {
  try {
    if (!mailer.isConfigured()) {
      return res.status(400).json({ error: 'SMTP no configurado. Define SMTP_HOST, SMTP_USER, SMTP_PASS en variables de entorno.' });
    }
    const to = (req.body && req.body.to || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: 'Email destinatario inválido' });
    }
    const cc = Array.isArray(req.body && req.body.cc) ? req.body.cc : [];

    const r = await pool.query(
      `SELECT id, uuid, serie, folio, pdf_base64, xml_timbrado, facturama_id, estado
       FROM fiscal_cfdis WHERE id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'CFDI no encontrado' });
    const row = r.rows[0];
    if (row.estado !== 'timbrado') {
      return res.status(400).json({ error: 'Solo se pueden enviar CFDIs timbrados (estado actual: ' + row.estado + ')' });
    }

    // Asegurar que tenemos XML y PDF — traerlos de Facturama si falta alguno
    let xmlB64 = row.xml_timbrado;
    let pdfB64 = row.pdf_base64;
    if ((!xmlB64 || !pdfB64) && row.facturama_id) {
      const cfg = await getFiscalConfigDecrypted();
      if (!xmlB64) {
        try {
          const xmlRes = await facturama.descargarXML(row.facturama_id, cfg);
          xmlB64 = xmlRes && xmlRes.Content;
          if (xmlB64) await pool.query('UPDATE fiscal_cfdis SET xml_timbrado = $1 WHERE id = $2', [xmlB64, row.id]);
        } catch (e) { console.warn('No se pudo descargar XML:', e.message); }
      }
      if (!pdfB64) {
        try {
          const pdfRes = await facturama.descargarPDF(row.facturama_id, cfg);
          pdfB64 = pdfRes && pdfRes.Content;
          if (pdfB64) await pool.query('UPDATE fiscal_cfdis SET pdf_base64 = $1 WHERE id = $2', [pdfB64, row.id]);
        } catch (e) { console.warn('No se pudo descargar PDF:', e.message); }
      }
    }
    if (!xmlB64 && !pdfB64) {
      return res.status(400).json({ error: 'No hay PDF ni XML disponibles para adjuntar' });
    }

    // Obtener emisor y rfcReceptor para nombre de archivos y asunto
    const cfgRow = await pool.query('SELECT razon_social FROM fiscal_config WHERE id = 1');
    const razonSocialEmisor = (cfgRow.rows[0] && cfgRow.rows[0].razon_social) || 'AP Fondos';

    // XML viene en base64 de Facturama — decodificar para adjuntar como texto legible
    let xmlTexto = null;
    if (xmlB64) {
      try { xmlTexto = Buffer.from(xmlB64, 'base64').toString('utf8'); }
      catch (e) { xmlTexto = null; }
    }

    const result = await mailer.enviarCFDI({
      to: to,
      cc: cc,
      xml: xmlTexto,
      pdfBase64: pdfB64 || null,
      uuid: row.uuid,
      serie: row.serie,
      folio: row.folio,
      razonSocialEmisor: razonSocialEmisor,
      rfcReceptor: ''  // opcional
    });

    // Auditoría
    try {
      await pool.query(
        `INSERT INTO auditoria (usuario, accion, modulo, detalle, fecha)
         VALUES ($1, $2, $3, $4, NOW())`,
        [req.user.username || req.user.id, 'Enviar Email', 'CFDI',
         'UUID ' + row.uuid + ' → ' + to + (cc.length ? ' (cc: ' + cc.join(',') + ')' : '')]
      );
    } catch (e) { /* tabla de auditoría puede no existir con ese schema */ }

    res.json({ ok: true, messageId: result.messageId, accepted: result.accepted, rejected: result.rejected });
  } catch (err) {
    console.error('Fiscal email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fiscal/smtp/test — Prueba de conexión SMTP (admin)
app.post('/api/fiscal/smtp/test', authenticateToken, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    if (!mailer.isConfigured()) return res.status(400).json({ error: 'SMTP no configurado' });
    mailer.resetTransport();
    await mailer.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'SMTP verify falló: ' + err.message });
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
