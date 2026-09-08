/* Yesil touge cizgileri haritayi boydan boya kesen duz cizgilere
   donusuyordu (kullanicinin ekran goruntusu).

   Suphe: cizim, OLCUM sirasinda hesaplanmis metre koordinatlarini
   kullaniyordu. Proj merkezi 25 km'den uzaga gidilince tasiniyor
   (Uyg.merkezTasi) ve o metre degerleri bayatliyor.

   Test: merkezi tasi, sonra IKI YONTEMI AYNI ANDA karsilastir.
   Once/sonra degil, cunku gidip gelmek etkiyi iptal ediyor. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9354;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

const KOD = [
  '(async function(){',
  '  var v = await Touge.bolgeVerisi(41.1755, 29.6122, 4);',
  '  var c = Touge.bul("viraj", 3, v.kaynak, {mahalleDahil:false});',
  '  if (!c.sonuc || !c.sonuc.length) return JSON.stringify({yok:true});',
  '  Touge.sonuc = c.sonuc;',
  '  var y = c.sonuc[0];',
  '  Touge.cizimeHazirla(y);',
  '  var o = y.olcum.ornek;',
  '',
  '  var fark = function(){',
  '    var en = 0;',
  '    o.forEach(function(p){',
  '      var m = Proj.metreye(p.lat, p.lon);',
  '      var a = Kamera.ekrana(m.x, m.y, Arazi.cz(p.z));   // YENI',
  '      var b = Kamera.ekrana(p.x, p.y, Arazi.cz(p.z));   // ESKI',
  '      en = Math.max(en, Math.hypot(a.sx-b.sx, a.sy-b.sy));',
  '    });',
  '    return Math.round(en);',
  '  };',
  '',
  '  var oncekiMerkez = [+Proj.lat0.toFixed(4), +Proj.lon0.toFixed(4)];',
  '  var farkOnce = fark();',
  '',
  '  /* Sayfa Beylikduzu merkeziyle acildi ama tarama SILE de yapildi:',
  '     yollarin x/y si Beylikduzu merkezine gore. Kullanici Sile ye',
  '     gidince merkez oraya tasiniyor (90 km, esik 25 km) ve o metre',
  '     degerleri bayatliyor. Gercek senaryo bu. */',
  '  var tasindi = Uyg.merkezTasi(41.1755, 29.6122);',
  '  var farkSonra = fark();',
  '',
  '  return JSON.stringify({',
  '    ad: y.ad, km: +(y.olcum.uzunluk/1000).toFixed(2), nokta: o.length,',
  '    oncekiMerkez: oncekiMerkez,',
  '    sonrakiMerkez: [+Proj.lat0.toFixed(4), +Proj.lon0.toFixed(4)],',
  '    tasindi: tasindi, farkOnce: farkOnce, farkSonra: farkSonra,',
  '    ekran: { g: Kamera.genislik, y: Kamera.yukseklik }',
  '  });',
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
  const hata=[]; const kontrol=(a,ok,ek)=>{console.log((ok?'  ok  ':'  X   ')+a+(ek?'   '+ek:'')); if(!ok)hata.push(a);};

  await g('Page.enable'); await g('Runtime.enable');
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  const r = JSON.parse(await ev(KOD));
  if (r.yok) { console.log('sonuc bulunamadi'); process.exit(1); }

  console.log('=== ' + r.ad + '  ' + r.km + ' km, ' + r.nokta + ' nokta ===');
  console.log('  ekran: ' + r.ekran.g + 'x' + r.ekran.y);
  console.log('  projeksiyon merkezi: ' + r.oncekiMerkez.join(',') + '  ->  ' + r.sonrakiMerkez.join(','));
  console.log('  merkez tasindi mi: ' + (r.tasindi ? 'EVET' : 'hayir'));
  console.log('');
  console.log('  Iki yontemin ekranda verdigi fark (en buyuk nokta sapmasi):');
  console.log('    merkez tasinmadan once : ' + r.farkOnce + ' px');
  console.log('    merkez tasindiktan sonra: ' + r.farkSonra + ' px');

  kontrol('merkez gercekten tasindi', r.tasindi === true);
  kontrol('tasinmadan once iki yontem ayni', r.farkOnce <= 1, r.farkOnce + ' px');
  kontrol('tasinca ESKI yontem bozuluyor (hata dogrulandi)',
          r.farkSonra > r.ekran.g, r.farkSonra + ' px  (ekran genisligi ' + r.ekran.g + ')');

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
