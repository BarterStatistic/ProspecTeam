# Catálogo Dinamo (Supabase)

Catálogo único de motos y esquemas de financiamiento de Dinamo, en el proyecto
Supabase de Alex (`ehyqexzaauvjoioafqdz`). Diseño:
`docs/superpowers/specs/2026-10-06-dinamo-catalogo-supabase-design.md`.

## Qué hay en la base

- Tablas: `modelos`, `esquemas`, `esquema_niveles`, `multiplicadores`, `parametros`.
  Lectura pública; escritura solo con `service_role`.
- `cotizar(modelo, esquema, enganche, con_servicio)` → una fila por plazo.
- `cotizar_monto(modelo, esquema, enganche_en_pesos)` → JSON con las parcialidades;
  convierte el monto a porcentaje y usa `cotizar()`. Lo llama la herramienta
  "Calculadora de Parcialidades" de Alex (n8n, HTTP con la clave publicable).
- `catalogo()` → JSON con la forma exacta de `MODELS` y `SCHEMES` de los cotizadores.
- Vista `Motos` → lo que lee Alex. La tabla original quedó como `motos_legacy`.

## Pruebas

Desde la raíz del repo:

```bash
node --test 'dinamo-catalogo/test/*.test.mjs'
```

(Con Node 22, `node --test dinamo-catalogo/test/` no funciona: toma la carpeta como módulo.)

`paridad.test.mjs` compara `cotizar()` contra el cálculo de `cotizador-pt` en
todas las combinaciones. Correrla después de cualquier cambio de fórmula o de multiplicadores.

Las pruebas llaman a PostgREST (`https://ehyqexzaauvjoioafqdz.supabase.co`). Si la red
no lo permite, la misma paridad corre desde el SQL Editor de Supabase:

```bash
node dinamo-catalogo/scripts/generar-paridad-sql.mjs > paridad.sql
```

Pegar `paridad.sql` en el SQL Editor. Esperado: `grupos_distintos = 0` y
`parcialidades_js = parcialidades_sql`.

## Quién lee el catálogo

- **Alex (n8n):** vista `Motos` y `cotizar_monto()`.
- **Los 5 cotizadores** (PT, Diana, Cintya, Alan, Fernanda): al abrir llaman a
  `rpc/catalogo` con la clave publicable. Si responde en menos de 3 s con la forma
  esperada, reemplaza sus datos embebidos; si no, usa los embebidos como respaldo.
  Cintya, Alan y Fernanda solo actualizan los 6 esquemas que muestran (no tienen
  Motonomina Flex).
- **Marga** (`marga-1.5/src/lib/catalogoRemoto.js`): mismo criterio, antes de montar la app.

Prueba en navegador del cargador de los cotizadores (simula Supabase, no necesita red):

```bash
node dinamo-catalogo/navegador/prueba-cotizador.mjs cotizador-pt/index.html nuevo
node dinamo-catalogo/navegador/prueba-cotizador.mjs ../dnm-cotizador-cintya-c.github.io/index.html viejo
```

`nuevo` es la plantilla de PT y Diana; `viejo`, la de Cintya, Alan y Fernanda.
`catalogo-ejemplo.json` es una copia de `select public.catalogo()`.

## Cambiar precios o multiplicadores

1. Editar en el Table Editor de Supabase (`modelos`, `multiplicadores`) o con SQL.
2. Actualizar `parametros.lista_vigente` si es una lista nueva.
3. Correr las pruebas; la paridad fallará hasta que `cotizador-pt/index.html`
   tenga los mismos datos, lo cual es intencional mientras el cotizador tenga
   datos embebidos.

## Revertir la vista de Alex

Aplicar `migrations/005_vista_motos.down.sql`. Lleva un `drop view`: el MCP de
Supabase pide confirmación para cualquier `DROP`, así que hay que aprobarla (o
correrla en el SQL Editor).
