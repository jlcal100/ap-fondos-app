// ============================================================
//  server/facturama.js — Cliente de la API de Facturama (PAC)
// ============================================================
// Wrap the Facturama REST API v3 + api-lite for:
//   - Timbrado de CFDI 4.0 (Ingreso, Egreso, Pago)
//   - Cancelación con motivo SAT
//   - Descarga de PDF y XML timbrado
//
// Autenticación: HTTP Basic Auth con las credenciales de la cuenta
// Facturama (NO el CSD — el CSD se carga una vez en el panel Facturama).
//
// Docs oficiales: https://apisandbox.facturama.mx/guias
// ============================================================

const BASE_PRODUCCION = 'https://api.facturama.mx';
const BASE_SANDBOX = 'https://apisandbox.facturama.mx';

function getBaseUrl(ambiente) {
  return ambiente === 'produccion' ? BASE_PRODUCCION : BASE_SANDBOX;
}

function authHeader(user, pass) {
  const token = Buffer.from(user + ':' + pass).toString('base64');
  return 'Basic ' + token;
}

// ------------------------------------------------------------
//  Construir payload CFDI 4.0 para POST /3/cfdis
// ------------------------------------------------------------
// cfdi: objeto con datos del comprobante generado por el sistema
// cfg:  fiscal_config desencriptado (razonSocial, rfc, regimenFiscal, cp, serie, folio)
// ------------------------------------------------------------
function buildCfdiPayload(cfdi, cfg) {
  const cliente = cfdi.cliente || {};

  const esArrend = cfdi.movimientos && cfdi.movimientos.some(function(m) {
    return m.tipo === 'ingreso_arrendamiento';
  });
  const claveProducto = esArrend ? '80131500' : '84121700';
  const descripcion = esArrend
    ? 'Renta devengada del período ' + cfdi.periodo
    : 'Intereses devengados del período ' + cfdi.periodo;

  const subtotal = Number(cfdi.subtotal || 0);
  const iva = Number(cfdi.iva || 0);
  const total = Number(cfdi.total || subtotal + iva);

  const rfcReceptor = String(cliente.rfc || 'XAXX010101000').toUpperCase();
  const nombreReceptor = String(cliente.razonSocialFiscal || cliente.nombre || 'Cliente').toUpperCase();
  const cpReceptor = String(cliente.cpFiscal || cliente.cp || cfg.cp);
  const regimenReceptor = String(cliente.regimenFiscal || '601');
  const usoCFDI = String(cliente.usoCFDI || 'G03');
  const formaPago = String(cliente.formaPagoDefault || '99');

  return {
    NameId: 1,                       // 1 = Factura
    CfdiType: 'I',                   // I = Ingreso
    PaymentForm: formaPago,          // c_FormaPago
    PaymentMethod: 'PPD',            // Intereses/arrendamiento devengados = PPD
    ExpeditionPlace: String(cfg.cp),
    Exportation: '01',               // 01 = No aplica (servicios financieros domésticos)
    Serie: String(cfg.serieFactura || cfdi.serie || 'A'),
    Folio: String(cfdi.folio),
    Currency: 'MXN',
    Issuer: {
      FiscalRegime: String(cfg.regimenFiscal),
      Rfc: String(cfg.rfc).toUpperCase(),
      Name: String(cfg.razonSocial).toUpperCase()
    },
    Receiver: {
      Rfc: rfcReceptor,
      Name: nombreReceptor,
      CfdiUse: usoCFDI,
      FiscalRegime: regimenReceptor,
      TaxZipCode: cpReceptor
    },
    Items: [
      {
        ProductCode: claveProducto,
        IdentificationNumber: esArrend ? 'ARREND' : 'INT',
        Description: descripcion,
        UnitCode: 'E48',
        UnitPrice: round2(subtotal),
        Quantity: 1,
        Subtotal: round2(subtotal),
        Total: round2(total),
        TaxObject: '02',
        Taxes: [
          {
            Name: 'IVA',
            Rate: 0.16,
            Total: round2(iva),
            Base: round2(subtotal),
            IsRetention: false
          }
        ]
      }
    ]
  };
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }

// ------------------------------------------------------------
//  HTTP helper con manejo de errores Facturama
// ------------------------------------------------------------
async function facturamaRequest(method, path, cfg, body) {
  if (!cfg.apiUser || !cfg.apiPass) {
    throw new Error('Credenciales Facturama no configuradas (Admin → Fiscal)');
  }
  const url = getBaseUrl(cfg.ambiente) + path;
  const opts = {
    method: method,
    headers: {
      'Authorization': authHeader(cfg.apiUser, cfg.apiPass),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error('Error de red llamando a Facturama: ' + err.message);
  }

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* respuesta no-JSON */ }

  if (!res.ok) {
    // Facturama devuelve { Message: '...', ModelState: {...}, Details: {...} }
    let msg = 'Error HTTP ' + res.status + ' de Facturama';
    if (json) {
      if (json.Message) msg = json.Message;
      if (json.Details && json.Details.Message) msg += ' — ' + json.Details.Message;
      if (json.ModelState) {
        const details = [];
        for (const key in json.ModelState) {
          details.push(key + ': ' + (Array.isArray(json.ModelState[key]) ? json.ModelState[key].join(', ') : json.ModelState[key]));
        }
        if (details.length) msg += ' (' + details.join('; ') + ')';
      }
    } else if (text) {
      msg += ': ' + text.slice(0, 300);
    }
    const err = new Error(msg);
    err.statusCode = res.status;
    err.raw = json || text;
    throw err;
  }

  return json;
}

// ------------------------------------------------------------
//  Timbrar: POST /3/cfdis
// ------------------------------------------------------------
async function timbrarCFDI(cfdi, cfg) {
  const payload = buildCfdiPayload(cfdi, cfg);
  const res = await facturamaRequest('POST', '/3/cfdis', cfg, payload);
  // res: { Id, Folio, Serie, Date, PaymentTerms, CfdiType, Complemento: { TaxStamp: { Uuid, Date, ... } }, ... }
  return {
    facturamaId: res.Id,
    uuid: res.Complemento && res.Complemento.TaxStamp && res.Complemento.TaxStamp.Uuid,
    fechaTimbrado: res.Complemento && res.Complemento.TaxStamp && res.Complemento.TaxStamp.Date,
    noCertificadoSAT: res.Complemento && res.Complemento.TaxStamp && res.Complemento.TaxStamp.SatCertificateNumber,
    selloSAT: res.Complemento && res.Complemento.TaxStamp && res.Complemento.TaxStamp.SatSignature,
    folio: res.Folio,
    serie: res.Serie,
    raw: res
  };
}

// ------------------------------------------------------------
//  Descarga PDF: GET /cfdi/{id}/pdf
// ------------------------------------------------------------
async function descargarPDF(facturamaId, cfg) {
  // Facturama regresa {ContentType, ContentEncoding, Content} con Content en base64
  const res = await facturamaRequest('GET', '/cfdi/1/pdf/issued/' + encodeURIComponent(facturamaId), cfg);
  return res; // { ContentType, ContentEncoding, Content }
}

// ------------------------------------------------------------
//  Descarga XML timbrado: GET /cfdi/{id}/xml
// ------------------------------------------------------------
async function descargarXML(facturamaId, cfg) {
  const res = await facturamaRequest('GET', '/cfdi/1/xml/issued/' + encodeURIComponent(facturamaId), cfg);
  return res; // { ContentType, ContentEncoding, Content }
}

// ------------------------------------------------------------
//  Cancelar: DELETE /cfdi/{id}?motive=XX[&uuidReplacement=YY]
// Motivos SAT:
//   01 - Comprobante emitido con errores con relación
//   02 - Comprobante emitido con errores sin relación
//   03 - No se llevó a cabo la operación
//   04 - Operación nominativa relacionada en factura global
// ------------------------------------------------------------
async function cancelarCFDI(facturamaId, motivo, uuidReemplazo, cfg) {
  let path = '/cfdi/' + encodeURIComponent(facturamaId) +
    '?type=issued&motive=' + encodeURIComponent(motivo);
  if (motivo === '01' && uuidReemplazo) {
    path += '&uuidReplacement=' + encodeURIComponent(uuidReemplazo);
  }
  const res = await facturamaRequest('DELETE', path, cfg);
  return res; // { Status, Message }
}

// ------------------------------------------------------------
//  Test de credenciales (lista CSDs como ping)
// ------------------------------------------------------------
async function testCredenciales(cfg) {
  return await facturamaRequest('GET', '/api-lite/csds', cfg);
}

// ============================================================
//  REP — Complemento de Pagos (CFDI Tipo "P")
// ============================================================
// Construye el payload REP para Facturama v3.
//
// rep:
//   {
//     folio, serie,                           // asignados por el backend
//     cfdiRelacionado: { uuid, serie, folio, moneda, total, metodoPago, objetoImp },
//     receptor: { rfc, nombre, cp, regimenFiscal },
//     pago: { fecha, formaPago, monedaP, tipoCambio, monto, numOperacion },
//     parcialidad: { numParcialidad, impSaldoAnterior, impPagado, impSaldoInsoluto },
//     impuestos: { baseIVA16, importeIVA16 }  // opcional, si el CFDI llevaba IVA
//   }
// cfg: configuración fiscal (emisor)
function buildREPPayload(rep, cfg) {
  if (!cfg || !cfg.rfc) throw new Error('Configuración fiscal incompleta (emisor)');

  const emisor = {
    Rfc: cfg.rfc,
    Name: cfg.razonSocial,
    FiscalRegime: cfg.regimenFiscal || '601'
  };

  const receptor = {
    Rfc: (rep.receptor && rep.receptor.rfc || 'XAXX010101000').toUpperCase(),
    Name: (rep.receptor && rep.receptor.nombre) || '',
    CfdiUse: 'CP01',                 // Pagos - obligatorio en REP
    FiscalRegime: (rep.receptor && rep.receptor.regimenFiscal) || '601',
    TaxZipCode: (rep.receptor && rep.receptor.cp) || cfg.cp
  };

  // En REP el concepto es siempre fijo: "Pago" con valores en cero
  const item = {
    ProductCode: '84111506',
    IdentificationNumber: '',
    Description: 'Pago',
    Unit: 'Actividad',
    UnitCode: 'ACT',
    UnitPrice: 0,
    Quantity: 1,
    Subtotal: 0,
    TaxObject: '01',                 // no objeto de impuesto
    Total: 0
  };

  // Impuestos del documento relacionado (si lleva IVA 16%)
  const impuestosDR = [];
  if (rep.impuestos && rep.impuestos.baseIVA16 > 0) {
    impuestosDR.push({
      Base: round2(rep.impuestos.baseIVA16),
      Tax: 'IVA',
      TaxType: 'Tasa',
      TaxRate: '0.160000',
      Amount: round2(rep.impuestos.importeIVA16),
      TaxFlagType: 'T'
    });
  }

  const doctoRel = {
    Uuid: rep.cfdiRelacionado.uuid,
    Serie: rep.cfdiRelacionado.serie || '',
    Folio: String(rep.cfdiRelacionado.folio || ''),
    Currency: rep.cfdiRelacionado.moneda || 'MXN',
    ExchangeRate: rep.cfdiRelacionado.tipoCambioDR || 1,
    PaymentMethod: rep.cfdiRelacionado.metodoPago || 'PPD',
    PartialityNumber: rep.parcialidad && rep.parcialidad.numParcialidad || 1,
    PreviousBalanceAmount: round2(rep.parcialidad.impSaldoAnterior),
    AmountPaid: round2(rep.parcialidad.impPagado),
    ImpSaldoInsoluto: round2(rep.parcialidad.impSaldoInsoluto),
    TaxObject: rep.cfdiRelacionado.objetoImp || (impuestosDR.length ? '02' : '01')
  };
  if (impuestosDR.length) doctoRel.RelatedDocumentTaxes = impuestosDR;

  const pago = {
    Date: rep.pago.fecha,                          // ISO 'YYYY-MM-DDTHH:mm:ss'
    PaymentForm: rep.pago.formaPago || '03',       // 03 = transferencia
    Currency: rep.pago.monedaP || 'MXN',
    ExchangeRate: rep.pago.tipoCambio || 1,
    Amount: round2(rep.pago.monto),
    RelatedDocuments: [doctoRel]
  };
  if (rep.pago.numOperacion) pago.OperationNumber = String(rep.pago.numOperacion);

  const payload = {
    NameId: '14',                                  // plantilla REP "genérica 14"
    CfdiType: 'P',                                 // CRÍTICO: tipo Pago
    ExpeditionPlace: cfg.cp,
    PaymentConditions: '',
    Folio: String(rep.folio || ''),
    Serie: rep.serie || cfg.serieREP || 'P',
    Date: rep.pago.fecha,
    Currency: 'XXX',                               // REP siempre XXX
    Issuer: emisor,
    Receiver: receptor,
    Items: [item],
    Complemento: {
      TaxStamp: {},                                 // timbra lo hace Facturama
      Payments: [pago]
    }
  };

  return payload;
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

async function timbrarREP(rep, cfg) {
  const payload = buildREPPayload(rep, cfg);
  const result = await facturamaRequest('POST', '/3/cfdis', cfg, payload);
  return {
    facturamaId: result.Id,
    uuid: result.Complemento && result.Complemento.TimbreFiscalDigital && result.Complemento.TimbreFiscalDigital.UUID,
    fechaTimbrado: result.Complemento && result.Complemento.TimbreFiscalDigital && result.Complemento.TimbreFiscalDigital.FechaTimbrado,
    noCertificadoSAT: result.Complemento && result.Complemento.TimbreFiscalDigital && result.Complemento.TimbreFiscalDigital.NoCertificadoSAT,
    selloSAT: result.Complemento && result.Complemento.TimbreFiscalDigital && result.Complemento.TimbreFiscalDigital.SelloSAT,
    folio: result.Folio,
    serie: result.Serie,
    raw: result
  };
}

module.exports = {
  buildCfdiPayload,
  buildREPPayload,
  timbrarCFDI,
  timbrarREP,
  descargarPDF,
  descargarXML,
  cancelarCFDI,
  testCredenciales,
  getBaseUrl
};
