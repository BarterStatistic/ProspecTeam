// Prueba en navegador del cargador del catálogo de los cotizadores (fase 4).
// Simula la respuesta de Supabase; no necesita red.
//   node dinamo-catalogo/navegador/prueba-cotizador.mjs <ruta/index.html> <nuevo|viejo>
// "nuevo" = plantilla de PT y Diana; "viejo" = Cintya, Alan y Fernanda.
// Requiere Playwright (npm i -g playwright) con Chromium.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium }=await import('playwright').catch(()=>
  createRequire(execSync('npm root -g').toString().trim()+'/')('playwright'));
const [file,tpl]=process.argv.slice(2);
const T=tpl==='nuevo'
  ? {card:'.moto', search:'#search', meta:'.sc[data-k="motonomina"] .sc-meta', sc:k=>`.sc[data-k="${k}"]`}
  : {card:'.moto-card', search:'#motoSearch', meta:'.sc-card[data-sc="motonomina"] .sc-meta', sc:k=>`.sc-card[data-sc="${k}"]`};
const real=JSON.parse(fs.readFileSync(new URL('./catalogo-ejemplo.json',import.meta.url),'utf8'));
const URL_CAT='https://ehyqexzaauvjoioafqdz.supabase.co/rest/v1/rpc/catalogo';
const browser=await chromium.launch();
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type','access-control-allow-methods':'POST'};

async function abrir(handler){
  const page=await browser.newPage();
  const errores=[], avisos=[], pedidos=[];
  page.on('pageerror',e=>errores.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error'&&!m.text().startsWith('Failed to load resource')) errores.push(m.text()); if(m.type()==='warning') avisos.push(m.text()); });
  await page.route('**/*',async r=>{
    const u=r.request().url();
    if(u.startsWith('file:')) return r.continue();
    if(u===URL_CAT){
      if(r.request().method()==='OPTIONS') return r.fulfill({status:204,headers:cors});
      pedidos.push({headers:r.request().headers(),body:r.request().postData()});
      return handler(r);
    }
    return r.abort();
  });
  await page.addInitScript(()=>{ try{ ['pt_intro','dm_intro'].forEach(k=>sessionStorage.setItem(k,'1')); }catch(e){} });
  await page.goto('file://'+path.resolve(file));
  return {page,errores,avisos,pedidos};
}
const json=(obj,delay=0)=>async r=>{ if(delay) await new Promise(s=>setTimeout(s,delay)); return r.fulfill({status:200,headers:{...cors,'content-type':'application/json'},body:JSON.stringify(obj)}); };
const espera=ms=>new Promise(s=>setTimeout(s,ms));
const nModelos=p=>p.evaluate(`MODELS.length`);
const nTarjetas=(p)=>p.locator(T.card).count();
const datos=p=>p.evaluate(`JSON.stringify([MODELS,SCHEMES])`);
const datosOrig=JSON.parse(await (async()=>{ const {page}=await abrir(r=>r.abort()); await espera(300); const d=await datos(page); await page.close(); return JSON.stringify(d); })());
const sinCambio=d=>assert.equal(d,datosOrig);

// 1. Red caída → respaldo
{ const {page,errores,avisos,pedidos}=await abrir(r=>r.abort());
  await espera(500);
  sinCambio(await datos(page));
  assert.equal(await nTarjetas(page),await nModelos(page));
  assert.deepEqual(errores.filter(e=>!/ERR_FAILED|net::/.test(e)),[]);
  assert.ok(avisos.some(a=>a.includes('respaldo')),'aviso de respaldo');
  assert.equal(pedidos.length,1);
  assert.equal(pedidos[0].headers.apikey,'sb_publishable_wHca_29_5WG40UG0w9TSlg_D6UnWHnP');
  assert.equal(pedidos[0].body,'{}');
  console.log('ok 1 respaldo sin red'); await page.close(); }

// 2. HTTP 500 → respaldo
{ const {page,errores}=await abrir(r=>r.fulfill({status:500,headers:cors,body:'x'}));
  await espera(500); sinCambio(await datos(page));
  assert.deepEqual(errores.filter(e=>!/500|Failed to load/.test(e)),[]);
  console.log('ok 2 respaldo con HTTP 500'); await page.close(); }

// 3. Forma inválida → respaldo
for(const malo of [{modelos:[]}, {...real,modelos:[['U2','21945',2287]]}, {...real,esquemas:{...real.esquemas,motonomina:{...real.esquemas.motonomina,levels:[{range:[0,100],m:{12:.1}}]}}}, null, []]){
  const {page,errores}=await abrir(json(malo));
  await espera(500); sinCambio(await datos(page)); assert.deepEqual(errores,[]); await page.close(); }
console.log('ok 3 respaldo con forma inválida');

// 4. Tarda más de 3 s → respaldo, y la respuesta tardía no se aplica
{ const mod=structuredClone(real); mod.modelos[0][1]=11111;
  const {page,avisos}=await abrir(json(mod,4500));
  await espera(5200); sinCambio(await datos(page));
  assert.ok(avisos.some(a=>a.includes('respaldo')));
  console.log('ok 4 respaldo por tiempo'); await page.close(); }

// 5. Catálogo real → igual a la copia embebida o la reemplaza
{ const {page,errores}=await abrir(json(real));
  await espera(600);
  const [M,S]=JSON.parse(await datos(page));
  assert.deepEqual(M,real.modelos);
  for(const k of Object.keys(S)){ const e=real.esquemas[k]; assert.ok(e,`esquema ${k} en catálogo`);
    assert.equal(S[k].min,e.min); assert.equal(S[k].max,e.max); assert.deepEqual(S[k].terms,e.terms);
    assert.deepEqual(S[k].levels.map(l=>l.range),e.levels.map(l=>l.range));
    S[k].levels.forEach((l,i)=>e.terms.forEach(t=>assert.equal(l.m[t],e.levels[i].m[t]))); }
  assert.equal(await nTarjetas(page),real.modelos.length);
  assert.deepEqual(errores,[]);
  console.log('ok 5 catálogo real aplicado ('+(JSON.stringify([M,S])===datosOrig?'sin cambios':'con cambios')+')'); await page.close(); }

// 6. Catálogo con cambios llega después de elegir moto y esquema
{ const mod=structuredClone(real);
  mod.modelos.reverse(); const r4=mod.modelos.find(m=>m[0]==='R4'); r4[1]=60000; r4[2]=3000;
  mod.modelos=mod.modelos.filter(m=>m[0]!=='U2');
  mod.esquemas.motonomina.min=7;
  const {page,errores}=await abrir(json(mod,2600));
  await page.waitForTimeout(300);
  await page.fill(T.search,'R4');
  await page.locator(T.card).filter({hasText:/^\s*R4\b/}).first().click();
  if(tpl!=='nuevo') await page.click('#btn0Next');
  await page.locator(T.sc('motonomina')).click();
  assert.equal(await nModelos(page),real.modelos.length,'la selección ocurre antes del catálogo');
  await espera(3000);
  const st=await page.evaluate(tpl==='nuevo'
    ? `({nombre:selModel===null?null:MODELS[selModel][0],precio:priceOf(),esquema:selScheme,dp})`
    : `({nombre:selModelIdx===null||selModelIdx<0?null:MODELS[selModelIdx][0],esquema:selScheme})`);
  assert.equal(st.nombre,'R4'); assert.equal(st.esquema,'motonomina');
  if(tpl==='nuevo'){ assert.equal(st.precio,63000); assert.equal(st.dp,7); }
  else assert.match(await page.locator('#downHint').innerText(),/7%/);
  assert.equal(await nModelos(page),mod.modelos.length);
  assert.equal(await nTarjetas(page),mod.modelos.length);
  assert.match(await page.locator(T.meta).innerText(),/7%/);
  const visibles=await page.locator(`${T.card}:not(.hidden)`).count();
  assert.ok(visibles>=1 && visibles<mod.modelos.length,'el filtro de búsqueda se conserva');
  const html=await page.content();
  assert.ok(html.includes('60,000')||html.includes('60 000'),'precio nuevo visible');
  assert.deepEqual(errores,[]);
  console.log('ok 6 cambios aplicados conservando selección'); await page.close(); }

// 7. La moto elegida desaparece del catálogo
{ const mod=structuredClone(real); mod.modelos=mod.modelos.filter(m=>m[0]!=='R4');
  const {page,errores}=await abrir(json(mod,2600));
  await page.waitForTimeout(300);
  await page.fill(T.search,'R4');
  await page.locator(T.card).filter({hasText:/^\s*R4\b/}).first().click();
  await espera(3000);
  const sel=await page.evaluate(tpl==='nuevo'?`selModel`:`selModelIdx`);
  assert.ok(sel===null||sel<0,'selección limpiada: '+sel);
  assert.deepEqual(errores,[]);
  console.log('ok 7 moto retirada se deselecciona'); await page.close(); }

await browser.close();
console.log('TODO OK');
