/* Iki suphe:
   1) Ilce modunda sinir cizimi kare basina ne kadar yiyor?
      (24 bin nokta, her biri icin arazi ornekleme + izometrik)
   2) Indirmede Promise.all kumeleri: her tur en YAVAS bloku bekliyor.
      Blok sureleri ne kadar dagilik? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9352;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

const SINIR_OLC = [
  '(async function(){',
  '  await Sinir.indir([40.90, 28.40, 41.15, 28.95]);',
  '  Sinir.aktif = true;',
  '  var c = Cizer.ctx;',
  '  var nokta = Sinir.ilceler.reduce(function(s,o){',
  '    return s + o.halkalar.reduce(function(a,h){return a+h.length;},0); }, 0);',
  '  /* isinma */',
  '  Cizer.ilcelerCiz(c, Sinir.ilceler, null, null);',
  '  var t0 = performance.now();',
  '  for (var i=0;i<5;i++) Cizer.ilcelerCiz(c, Sinir.ilceler, null, null);',
  '  var ms = (performance.now()-t0)/5;',
  '  /* Arazi ornekleme kac kere cagriliyor? */',
  '  var sayac = 0, asil = Arazi.latLonYukseklik;',
  '  Arazi.latLonYukseklik = function(a,b){ sayac++; return asil.call(Arazi,a,b); };',
  '  Cizer.ilcelerCiz(c, Sinir.ilceler, null, null);',
  '  Arazi.latLonYukseklik = asil;',
  '  return JSON.stringify({ ilce: Sinir.ilceler.length, nokta: nokta,',
  '                          kareMs: +ms.toFixed(1), araziCagri: sayac });',
  '})()'
].join('\n');

const BLOK_OLC = [
  '(async function(){',
  '  /* Sile 4 km, onbellek sicak: blok sureleri ne kadar dagilik? */',
  '  var sureler = [];',
  '  var asil = Overpass.indirKutu.bind(Overpass);',
  '  Overpass.indirKutu = async function(k, s, p, h){',
  '    var t0 = performance.now();',
  '    var r = await asil(k, s, p, h);',
  '    sureler.push(Math.round(performance.now()-t0));',
  '    return r;',
  '  };',
  '  var t0 = performance.now();',
  '  await Touge.bolgeVerisi(41.1755, 29.6122, 4);',
  '  var toplam = performance.now() - t0;',
  '  Overpass.indirKutu = asil;',
  '  sureler.sort(function(a,b){return b-a;});',
  '  var enYavas = sureler[0] || 0;',
  '  var top = sureler.reduce(function(a,b){return a+b;},0);',
  '  return JSON.stringify({ blok: sureler.length, sureler: sureler,',
  '    toplamMs: Math.round(toplam), blokToplam: top, enYavas: enYavas });',
  '})()'
].join('\n');

(async () => {
  const c = spawn(EDGE, ['--headless=new','--disable-gpu','--remote-debugging-port='+PORT,
    '--user-data-dir='+process.env.TEMP+'/edge-e2e','--window-size=1400,900','about:blank'], {stdio:'ignore'});
  let t=null;
  for(let i=0;i<40;i++){await bekle(300); try{t=(await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json()).filter(x=>x.type==='page'); if(t.length)break;}catch(e){}}
  const ws=new WebSocket(t[0].webSocketDebuggerUrl);
  await new Promise((r,x)=>{ws.onopen=r;ws.onerror=x;});
  let no=0; const bek=new Map();
  ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&bek.has(m.id)){bek.get(m.id)(m);bek.delete(m.id);}};
  const g=(me,pa)=>new Promise(z=>{const id=++no;bek.set(id,z);ws.send(JSON.stringify({id,method:me,params:pa||{}}));});
  const ev=async(k)=>{const r=await g('Runtime.evaluate',{expression:k,awaitPromise:true,returnByValue:true});
    if(r.result&&r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception));
    return r.result&&r.result.result?r.result.result.value:undefined;};

  await g('Page.enable'); await g('Runtime.enable');
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.02&lon=28.65&olcek=0.08'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  await bekle(3000);

  console.log('=== 1. ilce siniri cizimi (kare basina) ===');
  const s = JSON.parse(await ev(SINIR_OLC));
  console.log('  ' + s.ilce + ' ilce, ' + s.nokta + ' sinir noktasi');
  console.log('  kare basina: ' + s.kareMs + ' ms');
  console.log('  arazi ornekleme cagrisi: ' + s.araziCagri + '  (nokta sayisinin ' +
              (s.araziCagri/s.nokta).toFixed(1) + ' katı)');
  console.log('  -> 60 fps icin butun kare 16.7 ms; sadece sinir ' + s.kareMs + ' ms');

  console.log('\n=== 2. indirme: blok sureleri ne kadar dagilik? ===');
  const b = JSON.parse(await ev(BLOK_OLC));
  console.log('  ' + b.blok + ' blok, sureler (buyukten kucuge): ' + b.sureler.join(', ') + ' ms');
  console.log('  bloklarin toplami: ' + b.blokToplam + ' ms');
  console.log('  gercek gecen sure : ' + b.toplamMs + ' ms');
  console.log('  en yavas blok     : ' + b.enYavas + ' ms');
  const tur = Math.ceil(b.blok / 5);
  console.log('  ' + tur + ' tur x 5 blok; her tur en yavasini bekliyor');

  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
