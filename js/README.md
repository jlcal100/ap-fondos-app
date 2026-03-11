# AP Fondos - JavaScript Modules

This directory contains the JavaScript modules extracted from the original monolithic `app.html` file. Each module has been separated into its own file for better organization, maintainability, and modularity.

## Module Structure

### Core Modules
- **core.js** (388 lines) - Logo setup, validation (V object), pagination, data store operations (getStore/setStore/nextId/guardSave/withTransaction/addAudit/checkVersion/bumpVersion), initial data seeding. Contains STORE_KEYS, TIPO_CAMBIO, MONEDA_SIMBOLO, MONEDA_LABEL constants.

### Security & Permissions
- **permisos.js** (247 lines) - SISTEMA DE PERMISOS Y ROLES — PERMISOS_MODULOS, ROL_PERMISOS_DEFAULT, hasPermiso(), getUserPermisos(), loginAs(), logoutUser(), loadSession(), updateUserUI(), showLoginSelector(), openPermisosEditor(), permisosSelAll(), permisosResetRol(), guardarPermisosModal()

### UI & UX
- **ui.js** (70 lines) - Toast notifications, showConfirm, closeConfirm, showLoading, hideLoading, showPrompt, closePrompt, form utilities (clearForm)
- **ux.js** (205 lines) - Responsive/mobile handling, global search (openSearch, closeSearch, onGlobalSearch), dark mode, scroll-to-top functionality
- **modales.js** (309 lines) - Modal management (openModal, closeModal, _forceCloseModal, dirty form tracking, _snapshotModal, _checkDirty), transaction handlers (openDisposicion, patchPagoCC, etc.)

### Data Import/Export
- **export-import.js** (158 lines) - exportarDatos(), exportarBackupExcel(), renderBackupStatus(), importarDatos(), resetDatos(), editarTipoCambio(), guardarTipoCambio()
- **exportaciones.js** (515 lines) - exportToExcel(), generarEdoCuenta(), reporteCarteraVencida(), reporteCobranza(), descargarPlantilla()
- **importacion.js** (411 lines) - Import mass data functions (validarArchivo, readExcelFile, readCSVFile, mapColumns, processImportData, etc.)

### Business Logic - Finance
- **financiero.js** (290 lines) - calcPago(), getTasaPeriodica(), getPeriodos(), getDiasPeriodo(), generarAmortizacion(), crearCreditoObj(), calcInteresDevengadoReal(), calcularValuacion(), CATALOGO_CUENTAS, POLIZA_MAP, getCuentaNombre()
- **contabilidad.js** (293 lines) - setContaTab(), accounting rendering, balance, income statement, period close functions

### Business Logic - Customers & Credits
- **clientes.js** (364 lines) - Clientes module + document management in modal, client CRUD operations
- **creditos.js** (251 lines) - renderCreditos(), openModalCredito(), toggleCreditoFields(), guardarCredito(), verCredito(), editarCredito(), eliminarCredito(), liquidarCredito(), marcarVencido()

### Business Logic - Operations
- **pagos.js** (213 lines) - renderAllPagos(), renderPagosTable(), renderPagosCredito(), openModalPago(), guardarPago(), populatePagoSelect(), irAPagar()
- **fondeos.js** (239 lines) - renderFondeos(), abrirNuevoFondeo(), editarFondeo(), guardarFondeo(), verFondeo(), registrarPagoFondeo(), eliminarFondeo()
- **reestructura.js** (368 lines) - abrirRestructura(), ejecutarRestructura(), renderRestructurasHTML(), bitacora functions
- **conciliacion.js** (390 lines) - renderConciliacion(), bank movement functions, auto-match, manual reconciliation, export functions

### Analytics & Reports
- **dashboard.js** (296 lines) - setDashPeriod(), getDashPagos(), actualizarDiasMora(), renderDashboard(), chart variables, dashboard alertas widget
- **reportes.js** (1,710 lines) - ALL report functions (setReporteTab, cartera, morosidad, colocacion, semaforo, ejecutivo, flujo, resultados, garantias, alertas), all PDF/Excel export for reports
- **cotizador.js** (394 lines) - setCotizadorTab(), calcularCotizacion(), exportCotizacionPDF(), guardarCotizacion(), simularEscenarios(), renderEscenariosResultados(), etc.

### Risk Management
- **riesgo.js** (257 lines) - Risk scoring (calcularRiesgoCredito, renderRiesgoHTML, renderReporteRiesgo, export functions), RIESGO_LABELS, RIESGO_COLORS
- **garantias.js** (155 lines) - abrirModalGarantia(), guardarGarantia(), eliminarGarantia(), liberarGarantia(), getGarantiasCredito(), getCoberturaGarantias()

### System Functions
- **navegacion.js** (39 lines) - showPage() function and navigation logic
- **admin.js** (130 lines) - setAdminTab(), renderUsuarios(), guardarUsuario(), toggleUsuario(), renderAuditoria(), logSecurityEvent(), renderSecurityLog()
- **aprobaciones.js** (243 lines) - Approval workflow functions
- **notificaciones.js** (298 lines) - generateNotifications(), notification management, panel toggle, real-time updates
- **calendario.js** (226 lines) - calNavMes(), generarEventosCalendario(), renderCalendario(), verDiaCal()
- **init.js** (22 lines) - DOMContentLoaded initialization sequence

## Module Dependencies

The modules have the following dependency chain:

1. **core.js** - No dependencies (foundational)
2. **permisos.js** - Depends on: core.js
3. **ui.js** - Depends on: core.js
4. **export-import.js** - Depends on: core.js
5. **financiero.js** - Depends on: core.js
6. **navegacion.js** - Depends on: All modules that have page rendering
7. **dashboard.js** - Depends on: core.js, financiero.js
8. **clientes.js** - Depends on: core.js, ui.js, modales.js
9. **creditos.js** - Depends on: core.js, financiero.js, modales.js
10. **pagos.js** - Depends on: core.js, financiero.js, modales.js
11. **cotizador.js** - Depends on: core.js, financiero.js, exportaciones.js
12. **reestructura.js** - Depends on: core.js, financiero.js, creditos.js
13. **conciliacion.js** - Depends on: core.js, financiero.js, exportaciones.js
14. **fondeos.js** - Depends on: core.js, modales.js
15. **contabilidad.js** - Depends on: core.js, financiero.js, exportaciones.js
16. **admin.js** - Depends on: core.js, permisos.js, notificaciones.js
17. **reportes.js** - Depends on: core.js, financiero.js, exportaciones.js, riesgo.js
18. **modales.js** - Depends on: core.js, ui.js
19. **exportaciones.js** - Depends on: core.js, financiero.js
20. **importacion.js** - Depends on: core.js, financiero.js
21. **ux.js** - Depends on: core.js, ui.js
22. **notificaciones.js** - Depends on: core.js
23. **riesgo.js** - Depends on: core.js, financiero.js, exportaciones.js
24. **calendario.js** - Depends on: core.js
25. **garantias.js** - Depends on: core.js, modales.js
26. **aprobaciones.js** - Depends on: core.js, modales.js
27. **init.js** - Depends on: All modules (initialization)

## Statistics

- **Total Lines**: 8,481 lines of JavaScript
- **Number of Modules**: 27 files
- **Largest Module**: reportes.js (1,710 lines)
- **Smallest Module**: init.js (22 lines)

## Loading Order

To properly load these modules in an HTML file, follow this order (based on dependencies):

```html
<script src="js/core.js"></script>
<script src="js/ui.js"></script>
<script src="js/financiero.js"></script>
<script src="js/permisos.js"></script>
<script src="js/modales.js"></script>
<script src="js/export-import.js"></script>
<script src="js/exportaciones.js"></script>
<script src="js/importacion.js"></script>
<script src="js/ux.js"></script>
<script src="js/notificaciones.js"></script>
<script src="js/dashboard.js"></script>
<script src="js/clientes.js"></script>
<script src="js/creditos.js"></script>
<script src="js/pagos.js"></script>
<script src="js/fondeos.js"></script>
<script src="js/cotizador.js"></script>
<script src="js/reestructura.js"></script>
<script src="js/conciliacion.js"></script>
<script src="js/contabilidad.js"></script>
<script src="js/riesgo.js"></script>
<script src="js/garantias.js"></script>
<script src="js/calendario.js"></script>
<script src="js/reportes.js"></script>
<script src="js/admin.js"></script>
<script src="js/aprobaciones.js"></script>
<script src="js/navegacion.js"></script>
<script src="js/init.js"></script>
```

## Notes

- All modules have been extracted exactly as they appeared in the original HTML file
- Module headers have been added to identify the purpose of each file
- The extraction covers lines 1906-10845 from the original app.html file
- No modifications were made to the actual JavaScript code - it was simply split into separate files
- Each module is self-contained and can be edited independently
