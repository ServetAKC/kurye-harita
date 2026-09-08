/* Bolgesel touge aramasi: Beylikduzu'nde acilip SILE aratiliyor.
   Iddia: baska bir ilcenin verisini kendi indirip tariyor, sonuclar
   gercekten orada cikiyor. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const cocuk = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + process.env.TEMP + '/edge-e2e',
    '--window-size=1400,900','about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 40; i++) {
    await bekle(300);
    try { t = (await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json()).filter(x=>x.type==='page'); if (t.length) break; } catch (e) {}
  }
  const ws = new WebSocket(t[0].webSocketDebuggerUrl);
  await new Promise((r,x)=>{ws.onopen=r;ws.onerror=x;});
  let no=0; const bek=new Map();
  ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&bek.has(m.id)){bek.get(m.id)(m);bek.delete(m.id);}};
  const g=(me,pa)=>new Promise(z=>{const id=++no;bek.set(id,z);ws.send(JSON.stringify({id,method:me,params:pa||{}}));});
  const ev=async(k)=>{const r=await g('Runtime.evaluate',{expression:k,awaitPromise:true,returnByValue:true});
    if(r.result&&r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception));
    return r.result&&r.result.result?r.result.result.value:undefined;};

  const hata = [];
  const kontrol = (ad, ok, ek) => { console.log((ok?'  ok  ':'  X   ')+ad+(ek?'   '+ek:'')); if(!ok) hata.push(ad); };

  await g('Page.enable'); await g('Runtime.enable');
  /* BEYLIKDUZU'nde ac — varsayilan konum */
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{ if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname'))) break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  const bas = await ev('Proj.lat0.toFixed(3)+", "+Proj.lon0.toFixed(3)');
  console.log('=== acilis konumu: ' + bas + ' (Beylikduzu) ===\n');

  /* SILE aratiliyor */
  await ev('document.getElementById("tougeYer").value = "Sile, Istanbul"');
  await ev('document.getElementById("tougeKm").value = "4"');
  await ev('document.getElementById("tougeTur").value = "viraj"');
  console.log('Sile araniyor, 4 km yaricap...');
  await ev('Uyg.tougeYerdeAra()');

  /* Bolge taramasi uzun surebiliyor; durum satiri "aday" yazana kadar bekle */
  let durum = '';
  for (let i = 0; i < 120; i++) {
    await bekle(1000);
    durum = await ev('document.getElementById("durum").textContent');
    if (/aday|bulunamadi|hata|inmedi|sinir/i.test(durum)) break;
  }
  console.log('durum: ' + durum + '\n');

  const sonuc = JSON.parse(await ev(`JSON.stringify(Touge.sonuc.map(function(y){
    var p = y.olcum.ornek[0];
    return { ad: y.ad, km: +(y.olcum.uzunluk/1000).toFixed(2), puan: +y.puan.toFixed(2),
             donus: Math.round(y.olcum.donusPerKm), izbe: +y.izbeP.toFixed(2),
             lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) };
  }))`));

  console.log('=== ' + sonuc.length + ' sonuc ===');
  for (const y of sonuc) {
    console.log('  ' + y.puan.toFixed(2) + '  ' + y.km + ' km  ' +
                String(y.donus).padStart(4) + '°/km  izbe ' + y.izbe.toFixed(2) +
                '  @ ' + y.lat + ',' + y.lon + '  ' + y.ad.slice(0, 32));
  }
  console.log('');

  kontrol('sonuc bulundu', sonuc.length > 0, sonuc.length + ' yol');
  /* Sile 41.17, 29.61 civari. Sonuclar Beylikduzu'nde (28.6) DEGIL
     Sile'de olmali — asil kanit bu. */
  const disarida = sonuc.filter(y => y.lon < 29.3 || y.lat < 40.9 || y.lat > 41.5);
  kontrol('sonuclar Sile bolgesinde', disarida.length === 0,
          disarida.length ? disarida.length + ' sonuc bolge disinda' : 'hepsi 29.3-29.9 boylaminda');
  const kmOrt = sonuc.reduce((s,y)=>s+y.km,0) / (sonuc.length||1);
  kontrol('sonuclar anlamli uzunlukta', kmOrt > 0.6, 'ortalama ' + kmOrt.toFixed(2) + ' km');
  kontrol('kamera oraya gitti', (await ev('Proj.lon0')) > 29.3,
          (await ev('Proj.lat0.toFixed(3)+", "+Proj.lon0.toFixed(3)')));
  kontrol('panelde satirlar var',
          (await ev('document.querySelectorAll("#tougeSonuc .tougeSatir").length')) === sonuc.length);

  /* Ilk sonuca ucup yesil vurgu gercekten ciziliyor mu bak */
  await ev('(function(){var y=Touge.sonuc[0]; Touge.secili=y;' +
           'var o=y.nokta[Math.floor(y.nokta.length/2)];' +
           'Uyg.gitKonuma(o.lat,o.lon,1.6); return 1;})()');
  await bekle(9000);
  await ev('Cizer.kirlet()');
  await bekle(1500);
  await ev('document.getElementById("panel").scrollTop = 2600');
  await bekle(1200);
  const ss = await g('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(__dirname + '/ss/bolge.png', Buffer.from(ss.result.data, 'base64'));
  console.log('  ss/bolge.png');

  ws.close(); cocuk.kill();
  console.log(hata.length ? '\nSONUC: ' + hata.length + ' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length ? 1 : 0);
})().catch(e => { console.log('COKTU: ' + e.message); process.exit(1); });
