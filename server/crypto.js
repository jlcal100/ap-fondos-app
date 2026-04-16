// ============================================================
//  server/crypto.js — Cifrado AES-256-GCM para credenciales
// ============================================================
// Cifra/descifra las credenciales de Facturama (y futuros PACs)
// usando una llave maestra almacenada en variable de entorno.
//
// Generación de llave (una sola vez por deployment):
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// En Railway: agregar variable FISCAL_ENCRYPTION_KEY con el valor hex.
// ============================================================

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;   // GCM recommended
const TAG_LEN = 16;
const KEY_LEN = 32;  // 256 bits

function getKey() {
  const hex = process.env.FISCAL_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'FISCAL_ENCRYPTION_KEY no configurada. Genera una con: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LEN) {
    throw new Error('FISCAL_ENCRYPTION_KEY debe ser 32 bytes (64 chars hex)');
  }
  return key;
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Formato: iv(12) + tag(16) + ciphertext  -> base64
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64) {
  if (b64 == null || b64 === '') return null;
  const key = getKey();
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('Ciphertext inválido');
  const iv = buf.slice(0, IV_LEN);
  const tag = buf.slice(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.slice(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

function isConfigured() {
  return !!process.env.FISCAL_ENCRYPTION_KEY;
}

module.exports = { encrypt, decrypt, isConfigured };
