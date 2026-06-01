-- ============================================================================
-- ProspecTeam Dashboard — Esquema de Base de Datos
-- Motor: SQLite (sql.js — WebAssembly en navegador)
-- Generado desde: esquema de base de datos.xml
-- ============================================================================

-- Usuarios del sistema (autenticación)
CREATE TABLE IF NOT EXISTS usuarios (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password  TEXT    NOT NULL,
  es_admin  INTEGER DEFAULT 0  -- 0=usuario normal, 1=administrador
);

-- Datos iniciales: cuenta admin
-- INSERT OR IGNORE INTO usuarios (gmail, password, es_admin) VALUES ('braulioacostalong505@gmail.com', '...', 1);

-- Vendedores del equipo de ventas
CREATE TABLE IF NOT EXISTS vendedores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL UNIQUE
);

-- Promotores (generadores de leads externos)
CREATE TABLE IF NOT EXISTS promotores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL UNIQUE
);

-- Catálogo de modelos de moto disponibles
CREATE TABLE IF NOT EXISTS modelos_moto (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL UNIQUE
);

-- Clientes (registro de adquisición)
CREATE TABLE IF NOT EXISTS clientes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre           TEXT,
  paterno          TEXT,
  fecha_adquisicion TEXT   -- ISO date YYYY-MM-DD
);

-- Esquemas de crédito disponibles
CREATE TABLE IF NOT EXISTS credito (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  enganche     REAL    DEFAULT 0,
  parcialidad  REAL    DEFAULT 0,
  plazos       INTEGER DEFAULT 0,
  tipo_credito TEXT    -- 'contado'|'financiado'|'parcialidades'
);

-- Ventas cerradas (tabla principal de transacciones)
CREATE TABLE IF NOT EXISTS ventas (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mes              TEXT    NOT NULL,
  anio             INTEGER NOT NULL,
  vendedor         TEXT    NOT NULL,   -- nombre del vendedor (FK lógica)
  numero_venta     INTEGER,
  cliente          TEXT,               -- nombre del cliente
  moto             TEXT,               -- modelo de moto (texto libre)
  comision_total   REAL    DEFAULT 0,
  fee_bancario     REAL    DEFAULT 0,  -- 0..1 (porcentaje decimal, ej: 0.0425 = 4.25%)
  tasa_vendedor    REAL    DEFAULT 0.20,
  tasa_promotor    REAL    DEFAULT 0.10,
  ajuste_promotor  REAL    DEFAULT 0,
  promotor         TEXT,               -- nombre del promotor (FK lógica)
  fecha_pago       TEXT,               -- ISO date YYYY-MM-DD
  monto_financiado REAL    DEFAULT 0,
  pagado_vendedor  INTEGER DEFAULT 0,  -- 0=pendiente, 1=pagado
  pagado_promotor  INTEGER DEFAULT 0,
  pagado_admin     INTEGER DEFAULT 0,
  adelanto_promotor INTEGER DEFAULT 0  -- 0=sin adelanto, 1=adelanto registrado
);

-- Comisiones calculadas por venta
CREATE TABLE IF NOT EXISTS comisiones (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id             INTEGER REFERENCES ventas(id),
  comision_admin       REAL    DEFAULT 0,
  comision_ventas      REAL    DEFAULT 0,
  comision_promotor    REAL    DEFAULT 0,
  fecha_pago           TEXT
);

-- Prospectos registrados por mes y vendedor
CREATE TABLE IF NOT EXISTS prospectos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  mes      TEXT    NOT NULL,
  anio     INTEGER NOT NULL,
  vendedor TEXT    NOT NULL,
  cantidad INTEGER DEFAULT 0
);

-- Metas de venta mensuales por vendedor
CREATE TABLE IF NOT EXISTS metas_mensuales (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_anio TEXT    NOT NULL, -- Ej: 'Enero-2026'
  vendedor TEXT    NOT NULL,
  meta     INTEGER DEFAULT 0,
  UNIQUE(mes_anio, vendedor)
);

-- Histórico acumulado global por vendedor
CREATE TABLE IF NOT EXISTS historico_global (
  vendedor   TEXT    PRIMARY KEY,
  prospectos INTEGER DEFAULT 0,
  ventas     INTEGER DEFAULT 0
);

-- Retroalimentaciones / evaluaciones del vendedor
CREATE TABLE IF NOT EXISTS retroalimentaciones (
  id          INTEGER PRIMARY KEY,
  vendedor    TEXT    NOT NULL,
  fecha_retro TEXT,
  nivel       TEXT,   -- 'excelente'|'bueno'|'regular'|'bajo'|'critico'
  contenido   TEXT
);

-- Gastos operativos mensuales
CREATE TABLE IF NOT EXISTS gastos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mes              TEXT    NOT NULL,
  anio             INTEGER NOT NULL,
  dias_mes         INTEGER DEFAULT 0,
  monto_x_dia      REAL    DEFAULT 0,
  gasto_servicio   REAL    DEFAULT 0,
  gasto_gasolina   REAL    DEFAULT 0,
  gasto_constancia REAL    DEFAULT 0,
  motos_vendidas   INTEGER DEFAULT 0
);

-- Registro financiero mensual
CREATE TABLE IF NOT EXISTS financiero (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mes           TEXT    NOT NULL,
  anio          INTEGER NOT NULL,
  utilidad_bruta REAL   DEFAULT 0,
  utilidad_neta  REAL   DEFAULT 0,
  gastos_total   REAL   DEFAULT 0,
  publicidad     REAL   DEFAULT 0
);

-- Configuración de guardias semanales (JSON por su estructura dinámica)
CREATE TABLE IF NOT EXISTS guardias_config (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  config_json TEXT    -- JSON con schedule, horarios, metas y reglas
);

-- ============================================================================
-- RELACIONES PRINCIPALES (documentación)
-- ============================================================================
-- ventas.vendedor     → vendedores.nombre
-- ventas.promotor     → promotores.nombre
-- ventas.moto         → modelos_moto.nombre
-- comisiones.venta_id → ventas.id
-- prospectos.vendedor → vendedores.nombre
-- metas_mensuales.vendedor → vendedores.nombre
-- historico_global.vendedor → vendedores.nombre
-- retroalimentaciones.vendedor → vendedores.nombre
