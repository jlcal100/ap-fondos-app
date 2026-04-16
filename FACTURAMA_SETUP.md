# Bloque B — Facturama PAC · Guía de Despliegue

Esta guía explica cómo desplegar AP Fondos para **una nueva empresa** (reusabilidad: un deploy por empresa). Cubre configuración de Facturama, variables de entorno y validación de timbrado.

---

## 1. Requisitos previos

Antes de desplegar:

1. **Cuenta de Facturama** — crear en <https://www.facturama.mx> (plan con timbres suficientes)
2. **CSD (Certificado de Sello Digital)** — tramitado en el portal del SAT, se necesita:
   - Archivo `.cer`
   - Archivo `.key`
   - Contraseña de la llave privada
3. **Datos fiscales del emisor**: Razón social, RFC, régimen fiscal, CP del lugar de expedición
4. **Base de datos PostgreSQL** — provisionada (Railway, Neon, RDS, etc.)

---

## 2. Cargar CSD en Facturama

> El CSD NO se sube a este sistema. Vive solo en Facturama.

1. Entrar al panel de Facturama → Configuración → Certificados (CSD)
2. Subir `.cer`, `.key` y contraseña
3. Facturama valida y lo deja activo. A partir de aquí ya puede timbrar.

---

## 3. Generar la llave de cifrado

Las credenciales de Facturama se guardan en BD cifradas con AES-256-GCM. Generar la llave UNA SOLA VEZ por deployment:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copiar el resultado (64 caracteres hex).

> ⚠️ **Si se pierde esta llave, se pierden las credenciales cifradas.** Guárdala en un password manager.

---

## 4. Variables de entorno

Configurar en el proveedor (Railway, Heroku, etc.):

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Connection string de Postgres (ej. `postgres://user:pass@host:5432/db`) |
| `JWT_SECRET` | Sí | Secreto para firmar JWT (≥32 chars aleatorios) |
| `FISCAL_ENCRYPTION_KEY` | Sí (para Bloque B) | Hex de 64 chars del paso 3 |
| `PORT` | No | Default 3000 |
| `NODE_ENV` | No | `production` en deploys reales |

### Railway

```
railway variables set FISCAL_ENCRYPTION_KEY=<hex>
railway variables set JWT_SECRET=<secret>
```

### `.env` local para desarrollo

```env
DATABASE_URL=postgres://postgres:password@localhost:5432/ap_fondos_dev
JWT_SECRET=dev_secret_change_me_min_32_chars
FISCAL_ENCRYPTION_KEY=     # pega aquí el hex generado
PORT=3000
```

---

## 5. Primer arranque

```bash
npm install
npm start
```

En consola debe aparecer:

```
✓ PostgreSQL conectado
✓ Tablas inicializadas
✓ FISCAL_ENCRYPTION_KEY configurada   ← debe salir
Server listening on :3000
```

Si sale `⚠ FISCAL_ENCRYPTION_KEY no configurada`, el timbrado estará deshabilitado hasta que se defina la variable.

---

## 6. Configurar la empresa desde la UI

1. Login con **admin / admin123** (cambiar password inmediatamente en Admin → Usuarios → tu usuario → Cambiar contraseña)
2. Ir a **Admin → Fiscal**
3. Llenar **Datos del Emisor**:
   - Razón social *(debe coincidir EXACTO con el RFC en el SAT)*
   - RFC (12 dígitos persona moral / 13 persona física)
   - C.P. Lugar de Expedición
   - Régimen Fiscal (ej. 601 = General de Ley Personas Morales)
   - Serie default Factura (ej. `A`)
   - Serie default Pagos/REP (ej. `P`)
   - Folio inicial de cada serie
4. **Configuración Facturama**:
   - Ambiente: `Sandbox` (pruebas) o `Producción` (timbrado real)
   - Usuario API: el usuario de tu cuenta Facturama
   - Password API: el password
5. Click en **💾 Guardar Configuración Fiscal**
6. Click en **🔌 Probar Credenciales** — si todo está bien, aparece *"Credenciales Facturama OK — CSD detectado"* y los campos No. Certificado / Vigencia se llenan automáticamente.

---

## 7. Primer CFDI de prueba (sandbox)

1. Registrar un cliente con datos fiscales completos (Razón social fiscal, RFC, CP fiscal, Régimen, Uso CFDI)
2. Generar movimientos del período (intereses o rentas)
3. Ir a **Fiscal → CFDI 4.0**
4. Seleccionar el período y click en **📄 Generar Borradores del Período**
5. En la tabla, click en **⚡ Timbrar** sobre la fila del cliente
6. Aparece *"CFDI timbrado — UUID xxxxxxx-xxxxx-xxxx-xxxx-xxxxxxxxx"*
7. Click en **📄** (PDF) o **XML** para descargarlo

---

## 8. Paso a Producción

1. Asegurarse que el CSD está cargado en la **cuenta de producción** de Facturama (no sandbox)
2. En Admin → Fiscal:
   - Cambiar **Ambiente** a `Producción`
   - Ingresar Usuario/Password API de producción
   - Guardar y Probar Credenciales
3. Timbrar un CFDI real de bajo monto y verificar:
   - El UUID aparece en la tabla
   - El PDF/XML descargan correctamente
   - El CFDI es visible en el portal SAT del contribuyente

---

## 9. Envío por email del CFDI

Cada CFDI timbrado tiene un botón **✉** en la tabla. Al clickearlo:

1. Pide email destinatario (lo rellena con `emailFactura` del cliente si existe)
2. Backend descarga PDF y XML de Facturama (si no están cacheados)
3. Envía el correo con ambos archivos adjuntos

**Configuración SMTP** — variables de entorno (ver `.env.example`):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mi_usuario@gmail.com
SMTP_PASS=app_password_de_16_letras
SMTP_FROM="Mi Empresa <no-reply@mi-dominio.com>"
```

> Para Gmail: activar "Contraseñas de aplicación" en la cuenta Google y usar ese password (no el normal).
> Para Office365: activar SMTP AUTH en Exchange Admin.
> Alternativas: SendGrid, Mailgun, Amazon SES — cualquier proveedor SMTP estándar funciona.

---

## 10. REP — Complemento de Pagos (PPD)

Las facturas con **MétodoPago=PPD** (Pago en Parcialidades o Diferido) requieren emitir un **REP** (Recibo Electrónico de Pago) cada vez que se cobra parcial o totalmente.

**Flujo:**

1. En la tabla CFDI, sobre una factura timbrada, click en **💰 REP**
2. Se abre un modal pidiendo:
   - Fecha de pago
   - Forma de pago SAT (03 = transferencia, 01 = efectivo, 02 = cheque, 04 = tarjeta crédito, 28 = tarjeta débito, 99 = por definir)
   - Monto pagado
   - Referencia bancaria / No. de operación
   - No. de parcialidad (1 si es primer pago)
   - Saldo anterior (prellenado con total de la factura)
3. Backend reserva folio serie `P` (o la que hayas configurado en Admin → Fiscal)
4. Construye el CFDI tipo `P` con Complemento Pagos 2.0 referenciando el UUID original
5. Envía a Facturama → SAT → UUID devuelto
6. El REP aparece en la misma tabla con badge **TIMBRADO** y prefijo serie `P-`

Cada REP se guarda como un nuevo row en `fiscal_cfdis` con `tipo_comprobante='P'` y `cfdi_relacionado_id` apuntando a la factura original.

---

## 11. Cancelaciones

Solo admin puede cancelar. Click en **✗** en la fila de un CFDI timbrado:

- **01** — Emitido con errores con relación (requiere UUID de reemplazo)
- **02** — Emitido con errores sin relación
- **03** — No se llevó a cabo la operación
- **04** — Operación nominativa relacionada en factura global

> Cancelar es fiscal e irreversible. Para motivo `01` hay que timbrar primero el CFDI de reemplazo y copiar su UUID.

---

## 12. Reusabilidad — desplegar para otra empresa

Para levantar una copia totalmente independiente para otra SA de CV:

1. Fork / clonar el repo
2. Crear nueva BD PostgreSQL
3. Crear nueva cuenta Facturama y cargar su CSD
4. Generar **nueva** `FISCAL_ENCRYPTION_KEY`
5. Desplegar con las variables del paso 4
6. Entrar como admin y configurar los datos fiscales de esa empresa en Admin → Fiscal

Nada está hardcodeado al RFC o razón social — todo es parámetro.

---

## 13. Solución de problemas

| Síntoma | Diagnóstico |
|---|---|
| `FISCAL_ENCRYPTION_KEY no configurada` | Falta variable de entorno (ver sección 4) |
| `Credenciales Facturama no configuradas` | No se ha guardado user/pass en Admin → Fiscal |
| Error 401 de Facturama | User/pass incorrectos — revisar en panel Facturama |
| Error `CFDI40108: RegimenFiscal del Emisor no coincide` | Régimen del emisor en AP Fondos no coincide con el dado de alta en el SAT |
| Error `CFDI40147: RfcReceptor no existe en la lista de RFC` | RFC del cliente no está en lista SAT — verificar o usar RFC genérico `XAXX010101000` para público general |
| Folios fuera de orden / salteados | Ver `fiscal_folios` en BD; un timbrado fallido revierte el folio automáticamente |
| El CSD caducó | Renovar en SAT → subir nuevo a Facturama → Probar Credenciales (resincroniza No.Cert/Vigencia) |

---

## 14. Arquitectura del Bloque B

```
┌───────────────────┐           ┌──────────────────┐           ┌─────────────┐
│  Frontend (HTML)  │ ──HTTPS── │  Backend Node    │ ──HTTPS── │  Facturama  │
│  Admin → Fiscal   │   JWT     │  server.js       │   Basic   │  PAC        │
│  Timbrar / XML    │           │  AES-256-GCM     │   Auth    │  (SAT)      │
└───────────────────┘           └────────┬─────────┘           └─────────────┘
                                         │
                                    ┌────┴─────┐
                                    │ Postgres │
                                    │ fiscal_* │
                                    └──────────┘
```

**Flujo de timbrado:**

1. UI envía `POST /api/fiscal/cfdi/timbrar` con los datos del CFDI
2. Backend reserva folio atómicamente (UPSERT con GREATEST)
3. Descifra credenciales Facturama (AES-256-GCM)
4. Construye JSON CFDI 4.0 y llama a `POST /3/cfdis` de Facturama
5. Facturama firma con el CSD, timbra con el SAT y devuelve UUID
6. Backend guarda UUID + XML timbrado + PDF en `fiscal_cfdis`
7. UI actualiza la tabla con el UUID y los botones PDF/XML

**Seguridad:**

- Credenciales Facturama **nunca** salen del backend — el frontend solo ve booleanos `apiUserConfigured / apiPassConfigured`
- La llave maestra `FISCAL_ENCRYPTION_KEY` vive solo en variables de entorno (no en BD, no en código)
- Solo `admin` puede modificar `fiscal_config` o cancelar CFDIs
- Todo cambio queda registrado en `auditoria`
