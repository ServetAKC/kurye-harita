/* Payload cikisi ve koordinat kopyalama.
   Iddia: JSON gecerli, koordinatlar dogru, sira teslimat sirasi,
   ve kopyala dugmeleri gercekten panoya yaziyor. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
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
  /* Pano izni: headless'ta varsayilan olarak sorulmuyor, aciktan veriyoruz */
  await g('Browser.grantPermissions', { origin: 'http://localhost',
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await g('Emulation.setFocusEmulationEnabled', { enabled: true });
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{ if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname'))) break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('(Uyg.grafigiHazirla()||{}).dugum||0'))>3000) break; await bekle(1000); }

  console.log('=== 1. bos durumda payload ===');
  kontrol('bos uyarisi yaziyor',
    /once sube/.test(await ev('document.getElementById("payloadKutu").textContent')));

  console.log('\n=== 2. duraklar konuluyor ===');
  const koy = async (m, tip) => {
    await ev('document.getElementById("konumKutu").value = ' + JSON.stringify(m));
    await ev('Uyg.durakEkle("' + tip + '")');
    await bekle(1200);
  };
  await koy('41.0011, 28.6417', 'sube');
  for (const k of ['41.0055, 28.6300', '40.9980, 28.6520', '41.0090, 28.6480', '40.9950, 28.6350']) {
    await koy(k, 'musteri');
  }
  kontrol('4 musteri kondu', (await ev('Uyg.musteriler.length')) === 4);

  let p = JSON.parse(await ev('document.getElementById("payloadKutu").textContent'));
  console.log('  rota CIZILMEDEN: sequence_source = ' + p.options.sequence_source);
  kontrol('rotasiz sira ekleme sirasi', p.options.sequence_source === 'insertion_order');
  kontrol('depot var', !!p.depot && typeof p.depot.lat === 'number', JSON.stringify(p.depot));
  kontrol('4 stop var', p.stops.length === 4);
  kontrol('rota alani yok', p.route === undefined);

  console.log('\n=== 3. rota cizilince ===');
  await ev('document.getElementById("kapasite").value = 3; Uyg.testRota();');
  await bekle(1200);
  p = JSON.parse(await ev('document.getElementById("payloadKutu").textContent'));
  console.log(JSON.stringify(p, null, 1).split('\n').slice(0, 34).join('\n'));

  kontrol('sira optimize', p.options.sequence_source === 'optimized');
  kontrol('route alani geldi', !!p.route, JSON.stringify(p.route));
  /* sequence 1..N ve tekrarsiz olmali */
  const sr = p.stops.map(s => s.sequence).sort((a,b)=>a-b);
  kontrol('sequence 1..4 tekrarsiz', JSON.stringify(sr) === '[1,2,3,4]', JSON.stringify(sr));
  /* payload sirasi Uyg.teslimatSirasi ile birebir mi */
  const ts = JSON.parse(await ev('JSON.stringify(Uyg.teslimatSirasi)'));
  const pi = p.stops.map(s => s.added_index);
  kontrol('sira teslimat sirasiyla ayni', JSON.stringify(pi) === JSON.stringify(ts),
          JSON.stringify(pi) + ' vs ' + JSON.stringify(ts));
  /* koordinatlar gercek duraklarla ayni mi */
  const gercek = JSON.parse(await ev('JSON.stringify(Uyg.musteriler.map(function(m){return [+m.lat.toFixed(6),+m.lon.toFixed(6)];}))'));
  const uyum = p.stops.every(s => {
    const gg = gercek[s.added_index];
    return gg && Math.abs(gg[0]-s.lat) < 1e-9 && Math.abs(gg[1]-s.lon) < 1e-9;
  });
  kontrol('koordinatlar duraklarla ayni', uyum);
  kontrol('osm_node tasiniyor', p.stops.every(s => typeof s.osm_node === 'number'));
  kontrol('crs yazili', p.crs === 'EPSG:4326');

  console.log('\n=== 4. panoya kopyalama ===');
  await ev('document.getElementById("payloadKopyaBtn").click()');
  await bekle(700);
  const pano1 = await ev('navigator.clipboard.readText()');
  let gecerli = false;
  try { JSON.parse(pano1); gecerli = true; } catch (e) {}
  kontrol('payload panoya yazildi ve gecerli JSON', gecerli, (pano1||'').length + ' karakter');

  /* Durak satirindaki koordinat dugmesi */
  const dugmeSayi = await ev('document.querySelectorAll("#duraklarListe .kopyaBtn").length');
  kontrol('her durak satirinda kopya dugmesi', dugmeSayi === 5, dugmeSayi + ' dugme (sube + 4 musteri)');
  await ev('document.querySelectorAll("#duraklarListe .kopyaBtn")[1].click()');
  await bekle(600);
  const pano2 = await ev('navigator.clipboard.readText()');
  console.log('  panodaki: ' + pano2);
  kontrol('koordinat bicimi dogru', /^-?\d+\.\d{6}, -?\d+\.\d{6}$/.test(pano2 || ''));
  /* Kopyalanan koordinat listedeki 1. musteriye ait olmali */
  const ilkMusteri = await ev('(function(){var i=Uyg.teslimatSirasi[0]; var m=Uyg.musteriler[i];' +
                              'return m.lat.toFixed(6)+", "+m.lon.toFixed(6);})()');
  kontrol('kopyalanan 1 numarali musteri', pano2 === ilkMusteri, ilkMusteri);

  await ev('document.getElementById("panel").scrollTop = 700');
  await ev('document.querySelectorAll("details.ekstra")[0].open = true');
  await bekle(800);
  const ss = await g('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(__dirname + '/ss/payload.png', Buffer.from(ss.result.data, 'base64'));
  console.log('  ss/payload.png');

  ws.close(); cocuk.kill();
  console.log(hata.length ? '\nSONUC: ' + hata.length + ' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length ? 1 : 0);
})().catch(e => { console.log('COKTU: ' + e.message); process.exit(1); });
