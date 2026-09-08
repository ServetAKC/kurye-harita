/* Trafik bileseni olu iken sabit 0.6'ydi. Duzelttikten sonra
   siralama gercekten degisti mi? Ayni bolgede once/sonra. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9360;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
const KOD = [
  '(async function(){',
  '  var v = await Touge.bolgeVerisi(41.1755, 29.6122, 4);',
  '  var k = v.kaynak;',
  '  /* SONRA: dogru hali */',
  '  var sonra = Touge.bul("viraj", 8, k, {mahalleDahil:false}).sonuc.map(function(y){',
  '    return { ad:y.ad, tur:y.yolTuru, p:+y.puan.toFixed(3), h:Touge.derece(y.puan).harf, tr:+y.trafik.toFixed(2) }; });',
  '  /* ONCE: trafigi yeniden sabit 0.6 yapip tekrar puanla */',
  '  var asil = Touge.trafikCarpani;',
  '  Touge.trafikCarpani = function(t){',
  '    /* eleme yine dogru sinifla calissin, sadece PUAN bileseni sabitlensin */',
  '    if (t === "viraj" || t === "duz" || t === undefined) return 0.6;',
  '    return asil.call(Touge, t);',
  '  };',
  '  var eskiPuanla = Touge.puanla;',
  '  Touge.puanla = function(m, tur, rakimVar, yolTuru){ return eskiPuanla.call(Touge, m, tur, rakimVar, tur); };',
  '  var once = Touge.bul("viraj", 8, k, {mahalleDahil:false}).sonuc.map(function(y){',
  '    return { ad:y.ad, tur:y.yolTuru, p:+y.puan.toFixed(3), h:Touge.derece(y.puan).harf, tr:+y.trafik.toFixed(2) }; });',
  '  Touge.trafikCarpani = asil; Touge.puanla = eskiPuanla;',
  '  return JSON.stringify({once:once, sonra:sonra});',
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }
  const r = JSON.parse(await ev(KOD));
  const yaz = (ad, l) => {
    console.log('\n  ' + ad);
    l.forEach(function(y,i){ console.log('    ' + (i+1) + '. ' + y.h + ' ' + y.p.toFixed(3) +
      '  trafik ' + y.tr.toFixed(2) + '  ' + y.tur.padEnd(13) + y.ad.slice(0,28)); });
  };
  console.log('=== Sile, virajli, ilk 8 ===');
  yaz('ONCE (trafik sabit 0.6 — hatali):', r.once);
  yaz('SONRA (trafik yol sinifindan):', r.sonra);
  const a = r.once.map(y=>y.ad).join('|'), b = r.sonra.map(y=>y.ad).join('|');
  console.log('\n  siralama degisti mi: ' + (a !== b ? 'EVET' : 'hayir'));
  const trFark = r.sonra.filter(y=>Math.abs(y.tr-0.6)>0.01).length;
  console.log('  trafik degeri artik yola gore degisiyor: ' + trFark + '/' + r.sonra.length + ' yolda 0.6 disinda');
  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
