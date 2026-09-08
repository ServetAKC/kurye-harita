/* Kavakli Bulvari neden dort ayri zincir kaliyor?
   Zincirlerin uc dugumleri ortak mi? Ortaksa devam() neden
   birlestirmedi — kac aday vardi, adlari ne? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9364;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

const KOD = [
  '(async function(){',
  '  var v = await Touge.bolgeVerisi(40.9922, 28.6527, 3);',
  '  if (v.hata) return JSON.stringify({hata:v.hata});',
  '  var k = v.kaynak;',
  '',
  '  /* Kavakli adini tasiyan HAM yol parcalari */',
  '  var ham = k.yollar.filter(function(y){ return /Kavakl/.test(y.ad || ""); });',
  '',
  '  /* Uc dugum -> o dugumde biten parcalar (zincirle ile ayni mantik) */',
  '  var uc = new Map();',
  '  k.yollar.forEach(function(y){',
  '    [y.dugum[0], y.dugum[y.dugum.length-1]].forEach(function(n){',
  '      if (!uc.has(n)) uc.set(n, []);',
  '      uc.get(n).push(y);',
  '    });',
  '  });',
  '',
  '  var parcaOzet = function(y){',
  '    var uz = 0;',
  '    for (var i=1;i<y.nokta.length;i++) uz += Math.hypot(y.nokta[i].x-y.nokta[i-1].x, y.nokta[i].y-y.nokta[i-1].y);',
  '    return { id:y.id, ad:y.ad||"(isimsiz)", tur:y.tur, m:Math.round(uz),',
  '             bas:y.dugum[0], son:y.dugum[y.dugum.length-1], tekYon:!!y.tekYon };',
  '  };',
  '',
  '  /* Her Kavakli parcasinin uclarinda kimler var? */',
  '  var ayrinti = ham.map(function(y){',
  '    var o = parcaOzet(y);',
  '    o.uclar = [y.dugum[0], y.dugum[y.dugum.length-1]].map(function(n){',
  '      var komsu = (uc.get(n)||[]).filter(function(x){ return x !== y; });',
  '      return { dugum:n, komsuSayi: komsu.length,',
  '               komsular: komsu.map(function(x){ return (x.ad||"(isimsiz)") + "/" + x.tur; }) };',
  '    });',
  '    return o;',
  '  });',
  '',
  '  /* Zincirleme sonucu */',
  '  var zincirler = Touge.zincirle(k.yollar, false).filter(function(z){ return /Kavakl/.test(z.ad||""); });',
  '  var zOzet = zincirler.map(function(z){',
  '    var uz = 0;',
  '    for (var i=1;i<z.nokta.length;i++) uz += Math.hypot(z.nokta[i].x-z.nokta[i-1].x, z.nokta[i].y-z.nokta[i-1].y);',
  '    return { ad:z.ad, parca:z.parca, m:Math.round(uz),',
  '             bas:z.dugum[0], son:z.dugum[z.dugum.length-1] };',
  '  });',
  '',
  '  return JSON.stringify({ hamSayi: ham.length, parcalar: ayrinti, zincirler: zOzet });',
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

  console.log('=== "Kavakl" adini tasiyan ' + r.hamSayi + ' ham yol parcasi ===');
  for (const p of r.parcalar) {
    console.log('\n  ' + p.ad + ' [' + p.tur + '] ' + p.m + ' m' + (p.tekYon ? ' TEK YON' : ''));
    console.log('    dugum ' + p.bas + ' -> ' + p.son);
    p.uclar.forEach(function(u, i){
      console.log('    uc' + (i+1) + ' (' + u.dugum + '): ' + u.komsuSayi + ' komsu' +
                  (u.komsular.length ? '  [' + u.komsular.slice(0,6).join(', ') + ']' : ''));
    });
  }

  console.log('\n=== zincirleme sonucu: ' + r.zincirler.length + ' zincir ===');
  for (const z of r.zincirler)
    console.log('  ' + z.m + ' m, ' + z.parca + ' parca   ' + z.bas + ' -> ' + z.son);

  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
