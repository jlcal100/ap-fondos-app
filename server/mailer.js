// ============================================================
//  server/mailer.js — Envío de correos (CFDI + REP)
// ============================================================
// Usa nodemailer + SMTP. Las credenciales vienen de variables de
// entorno para que la app sea reusable entre empresas sin tocar código.
//
// Variables:
//   SMTP_HOST      — p.ej. smtp.gmail.com, smtp.office365.com
//   SMTP_PORT      — 587 (STARTTLS) o 465 (SSL)
//   SMTP_SECURE    — 'true' para 465, 'false' (default) para 587
//   SMTP_USER      — usuario SMTP
//   SMTP_PASS      — password o app-password
//   SMTP_FROM      — remitente, p.ej. 'AP Fondos <no-reply@miempresa.com>'
// ============================================================

const nodemailer = require('nodemailer');

let _cachedTransport = null;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (_cachedTransport) return _cachedTransport;
  if (!isConfigured()) {
    throw new Error('SMTP no configurado — define SMTP_HOST, SMTP_USER, SMTP_PASS en variables de entorno');
  }
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = (process.env.SMTP_SECURE === 'true') || port === 465;
  _cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: port,
    secure: secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return _cachedTransport;
}

// Invalida el transport cacheado (útil si cambian las env vars en runtime)
function resetTransport() { _cachedTransport = null; }

// Verifica conexión SMTP (para botón "Probar SMTP")
async function verify() {
  const t = getTransport();
  await t.verify();
  return true;
}

/**
 * Envía un CFDI timbrado por email con PDF y XML adjuntos.
 * @param {Object} opts
 *   opts.to           (string) destinatario
 *   opts.cc           (string[], opcional) copia
 *   opts.asunto       (string, opcional) asunto custom
 *   opts.cuerpoHtml   (string, opcional) cuerpo HTML
 *   opts.xml          (string) contenido XML (texto)
 *   opts.pdfBase64    (string) contenido PDF en base64
 *   opts.uuid         (string) UUID del CFDI (para nombre de archivo)
 *   opts.serie        (string)
 *   opts.folio        (number|string)
 *   opts.razonSocialEmisor  (string)
 *   opts.rfcReceptor  (string)
 * @returns { messageId, accepted, rejected }
 */
async function enviarCFDI(opts) {
  const t = getTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const folioTxt = (opts.serie && opts.folio) ? (opts.serie + '-' + opts.folio) : (opts.uuid || 'CFDI');
  const baseName = folioTxt + '_' + (opts.rfcReceptor || '');

  const asunto = opts.asunto || ('CFDI ' + folioTxt + ' — ' + (opts.razonSocialEmisor || 'AP Fondos'));

  const cuerpo = opts.cuerpoHtml || (
    '<p>Estimado cliente,</p>' +
    '<p>Adjunto encontrará su CFDI <strong>' + folioTxt + '</strong> ' +
    '(UUID: <code style="font-family:monospace;font-size:12px">' + (opts.uuid || '') + '</code>).</p>' +
    '<p>Los archivos adjuntos corresponden al Comprobante Fiscal Digital en formatos PDF y XML.</p>' +
    '<p>Saludos cordiales,<br><strong>' + (opts.razonSocialEmisor || 'AP Fondos') + '</strong></p>' +
    '<hr><p style="color:#999;font-size:11px">Este es un correo automático — no responder.</p>'
  );

  const attachments = [];
  if (opts.xml) {
    attachments.push({
      filename: baseName + '.xml',
      content: opts.xml,
      contentType: 'application/xml'
    });
  }
  if (opts.pdfBase64) {
    attachments.push({
      filename: baseName + '.pdf',
      content: opts.pdfBase64,
      encoding: 'base64',
      contentType: 'application/pdf'
    });
  }

  const mailOpts = {
    from: from,
    to: opts.to,
    subject: asunto,
    html: cuerpo,
    attachments: attachments
  };
  if (opts.cc && opts.cc.length) mailOpts.cc = opts.cc;

  const info = await t.sendMail(mailOpts);
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = {
  isConfigured,
  getTransport,
  resetTransport,
  verify,
  enviarCFDI
};
