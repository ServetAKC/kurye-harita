/* Harf notu esiklerini havadan atmamak icin: puanlar gercekte
   nasil dagiliyor? Dort ayri bolgede TUM adaylarin puanlarina bak. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9356;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

const YERLER = [
  { ad: 'Beylikduzu (sehir)', lat: 41.0011, lon: 28.6417, km: 4 },
  { ad: 'Sile (kiyi/orman)',  lat: 41.1755, lon: 29.6122, km: 4 },
  { ad: 'Belgrad Ormani',     lat: 41.1830, lon: 28.9800, km: 4 },
  { ad: 'Polonezkoy',         lat: 41.1130, lon: 29.2280, km: 4 }
];

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

  const hepsi = [];
  for (const y of YERLER) {
    const r = JSON.parse(await ev([
      '(async function(){',
      '  var v = await Touge.bolgeVerisi(' + y.lat + ', ' + y.lon + ', ' + y.km + ');',
      '  if (v.hata) return JSON.stringify({hata:v.hata});',
      /* enFazla cok buyuk: TUM adaylarin puani lazim, ilk 8 degil */
      '  var c = Touge.bul("ikisi", 9999, v.kaynak, {mahalleDahil:false});',
      '  return JSON.stringify({ puanlar: (c.sonuc||[]).map(function(s){ return +s.puan.toFixed(3); }) });',
      '})()'
    ].join('\n')));
    if (r.hata) { console.log(y.ad + ': ' + r.hata); continue; }
    console.log(y.ad.padEnd(22) + r.puanlar.length + ' aday');
    hepsi.push({ ad: y.ad, p: r.puanlar });
  }

  const tum = hepsi.reduce((s,x)=>s.concat(x.p), []).sort((a,b)=>a-b);
  const yuzde = (q) => tum[Math.min(tum.length-1, Math.floor(tum.length*q))];
  console.log('\n=== ' + tum.length + ' adayin puan dagilimi ===');
  console.log('  en dusuk : ' + tum[0].toFixed(3));
  [0.25,0.5,0.75,0.9,0.95,0.99].forEach(function(q){
    console.log('  %' + String(Math.round(q*100)).padStart(2) + ' dilim: ' + yuzde(q).toFixed(3));
  });
  console.log('  en yuksek: ' + tum[tum.length-1].toFixed(3));

  /* Histogram */
  console.log('\n  histogram (0.05 araliklarla):');
  for (let a = 0.30; a < 0.95; a += 0.05) {
    const n = tum.filter(p => p >= a && p < a + 0.05).length;
    if (!n && a < 0.35) continue;
    console.log('    ' + a.toFixed(2) + '-' + (a+0.05).toFixed(2) + '  ' +
                String(n).padStart(4) + '  ' + '#'.repeat(Math.min(60, Math.round(n * 60 / tum.length * 4))));
  }

  /* Bolge bolge en yuksek */
  console.log('\n  bolge bazinda en yuksek puan:');
  hepsi.forEach(function(x){
    const s = x.p.slice().sort((a,b)=>b-a);
    console.log('    ' + x.ad.padEnd(22) + 'en yuksek ' + (s[0]||0).toFixed(3) +
                '  ilk8 ortalama ' + (s.slice(0,8).reduce((a,b)=>a+b,0)/Math.min(8,s.length)||0).toFixed(3));
  });

  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
