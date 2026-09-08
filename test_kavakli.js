/* Butun "Kavakli" zincirlerinin drag/viraj/duz puanlari ve siralari */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9365;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
const KOD = [
  '(async function(){',
  '  var v = await Touge.bolgeVerisi(40.9922, 28.6527, 3);',
  '  if (v.hata) return JSON.stringify({hata:v.hata});',
  '  var out = {};',
  '  ["viraj","duz","drag"].forEach(function(t){',
  '    var c = Touge.bul(t, 9999, v.kaynak, {mahalleDahil:false});',
  '    var l = c.sonuc || [];',
  '    out[t] = { toplam: l.length, kavakli: [] };',
  '    l.forEach(function(y,i){ if (/Kavakl/.test(y.ad)) out[t].kavakli.push({',
  '      sira:i+1, ad:y.ad, tur:y.yolTuru, km:+(y.olcum.uzunluk/1000).toFixed(2),',
  '      duz:Math.round(y.olcum.enUzunDuz), donus:Math.round(y.olcum.donusPerKm),',
  '      p:+y.puan.toFixed(3), h:Touge.derece(y.puan,t).harf, tr:+y.trafik.toFixed(2) }); });',
  '  });',
  '  return JSON.stringify(out);',
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=40.9922&lon=28.6527&olcek=0.9'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }
  const r = JSON.parse(await ev(KOD));
  if (r.hata) { console.log(r.hata); process.exit(1); }
  for (const t of ['viraj','duz','drag']) {
    console.log('\n=== ' + t.toUpperCase() + '  (' + r[t].toplam + ' aday) ===');
    if (!r[t].kavakli.length) { console.log('  Kavakli aday degil'); continue; }
    for (const k of r[t].kavakli)
      console.log('  ' + String(k.sira).padStart(3) + '. ' + k.h + ' ' + k.p.toFixed(3) +
        '  ' + String(k.km).padStart(5) + ' km  duzluk ' + String(k.duz).padStart(4) + ' m  ' +
        String(k.donus).padStart(3) + '°/km  trafik ' + k.tr.toFixed(2) + '  ' +
        k.tur.padEnd(10) + k.ad);
  }
  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
