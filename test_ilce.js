/* "Yer sec" modu: ilceler iniyor mu, halkalar kapaniyor mu,
   nokta-poligon testi dogru mu, tiklayinca o ilcede mi ariyor,
   yollar/binalar gizleniyor mu. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9342;
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
  /* Istanbul Anadolu yakasi, ilceler gorunsun diye uzaktan */
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.10&lon=29.30&olcek=0.10'});
  for(let i=0;i<40;i++){await bekle(500); try{ if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname'))) break;}catch(e){}}
  await bekle(4000);

  console.log('=== 1. ilce modu ===');
  await ev('Uyg.ilceModuAc()');
  for (let i = 0; i < 90; i++) {
    await bekle(1000);
    if (await ev('Uyg.ilceModu')) break;
    const d = await ev('document.getElementById("durum").textContent');
    if (/bulunamadi|inmedi|hata/i.test(d)) break;
  }
  const durum1 = await ev('document.getElementById("durum").textContent');
  console.log('  durum: ' + durum1);
  kontrol('mod acildi', await ev('Uyg.ilceModu === true'));

  const ilceler = JSON.parse(await ev(`JSON.stringify(Sinir.ilceler.map(function(o){
    return { ad:o.ad, halka:o.halkalar.length,
             nokta:o.halkalar.reduce(function(s,h){return s+h.length;},0),
             kapali:o.halkalar.every(function(h){
               return h[0].lat.toFixed(6)===h[h.length-1].lat.toFixed(6) &&
                      h[0].lon.toFixed(6)===h[h.length-1].lon.toFixed(6); }),
             merkez:[+o.merkez.lat.toFixed(4), +o.merkez.lon.toFixed(4)] };
  }))`));
  console.log('\n=== ' + ilceler.length + ' ilce ===');
  for (const o of ilceler) {
    console.log('  ' + o.ad.padEnd(18) + o.halka + ' halka  ' +
                String(o.nokta).padStart(5) + ' nokta  kapali=' + (o.kapali?'evet':'HAYIR') +
                '  @ ' + o.merkez.join(','));
  }
  kontrol('ilce bulundu', ilceler.length > 0, ilceler.length + ' ilce');
  const acik = ilceler.filter(o => !o.kapali);
  kontrol('halkalar kapali', acik.length === 0,
          acik.length ? acik.map(o=>o.ad).join(', ') : 'hepsi kapali');

  console.log('\n=== 2. katmanlar gizlendi mi ===');
  const kat = JSON.parse(await ev('JSON.stringify({yollar:Cizer.katman.yollar,binalar:Cizer.katman.binalar,alanlar:Cizer.katman.alanlar,poiler:Cizer.katman.poiler})'));
  kontrol('yollar gizli', kat.yollar === false);
  kontrol('binalar gizli', kat.binalar === false);
  kontrol('alanlar gizli', kat.alanlar === false);
  kontrol('duraklar gizli', kat.poiler === false);

  console.log('\n=== 3. nokta-poligon testi ===');
  /* Her ilcenin KENDI merkezi kendi icinde cikmali; baska ilcenin
     merkezi cikmamali. Sinir cizimi dogru olsa da poligon testi
     ters calisiyorsa tiklama yanlis ilceyi secerdi. */
  const capraz = JSON.parse(await ev(`(function(){
    var yanlis = [], kendi = 0;
    Sinir.ilceler.forEach(function(o){
      if (Sinir.icinde(o, o.merkez.lat, o.merkez.lon)) kendi++;
      Sinir.ilceler.forEach(function(p){
        if (p === o) return;
        if (Sinir.icinde(o, p.merkez.lat, p.merkez.lon)) yanlis.push(p.ad + ' -> ' + o.ad);
      });
    });
    return JSON.stringify({kendi:kendi, toplam:Sinir.ilceler.length, yanlis:yanlis});
  })()`));
  console.log('  kendi merkezini iceren: ' + capraz.kendi + '/' + capraz.toplam);
  if (capraz.yanlis.length) console.log('  baska ilcenin merkezini iceren: ' + capraz.yanlis.join(' | '));
  /* Merkez = kutu ortasi, girintili ilcelerde disari dusebilir; yarisi yeterli */
  kontrol('poligon testi calisiyor', capraz.kendi >= Math.ceil(capraz.toplam * 0.5),
          capraz.kendi + '/' + capraz.toplam);

  console.log('\n=== 4. bir ilceye tikla ===');
  /* En kucuk ilceyi sec: blok siniri asilmasin */
  const secim = await ev(`(function(){
    var en = null, enA = Infinity;
    Sinir.ilceler.forEach(function(o){
      var a = (o.kutu.k-o.kutu.g)*(o.kutu.d-o.kutu.b);
      if (a < enA && Sinir.icinde(o, o.merkez.lat, o.merkez.lon)) { enA = a; en = o; }
    });
    if (!en) return '';
    window.__secilen = en;
    return en.ad;
  })()`);
  console.log('  secilen (en kucuk): ' + secim);
  await ev('Uyg.ilcedeAra(window.__secilen)');
  let durum2 = '';
  for (let i = 0; i < 150; i++) {
    await bekle(1000);
    durum2 = await ev('document.getElementById("durum").textContent');
    if (/aday|hata|buyuk|inmedi/i.test(durum2)) break;
  }
  console.log('  durum: ' + durum2);
  kontrol('ilce secildi', await ev('Sinir.secili && Sinir.secili.ad === window.__secilen.ad'));

  const sonuc = JSON.parse(await ev(`JSON.stringify(Touge.sonuc.map(function(y){
    var p = y.olcum.ornek[0];
    var o = y.olcum.ornek, ic = 0;
    o.forEach(function(q){ if (Sinir.icinde(window.__secilen, q.lat, q.lon)) ic++; });
    return { ad:y.ad, tur:y.yolTuru, km:+(y.olcum.uzunluk/1000).toFixed(2), puan:+y.puan.toFixed(2),
             oran: +(ic/o.length).toFixed(2) };
  }))`));
  console.log('  ' + sonuc.length + ' sonuc:');
  for (const y of sonuc) {
    console.log('    ' + y.puan.toFixed(2) + ' ' + String(y.km).padStart(5) + ' km  ' +
                y.tur.padEnd(13) + '%' + String(Math.round(y.oran*100)).padStart(3) + ' icinde  ' + y.ad.slice(0,28));
  }
  if (sonuc.length) {
    /* Zincir birden cok parcadan olusuyor, filtre parca ORTASINA
       bakiyor; sinirdan gecen yolun ucu disarida kalabilir. Onemli
       olan yolun agirlikli olarak ilce icinde olmasi. */
    const ort = sonuc.reduce((s,y)=>s+y.oran,0)/sonuc.length;
    kontrol('sonuclar agirlikli olarak ilce icinde', ort > 0.7, 'ortalama %' + Math.round(ort*100));
  } else if (/buyuk/i.test(durum2)) {
    console.log('  (ilce cok buyuk uyarisi verildi — bu dogru davranis)');
  } else {
    kontrol('sonuc ya da anlamli uyari var', false, durum2);
  }

  await bekle(2000);
  const ss = await g('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(__dirname + '/ss/ilce.png', Buffer.from(ss.result.data, 'base64'));
  console.log('  ss/ilce.png');

  ws.close(); cocuk.kill();
  console.log(hata.length ? '\nSONUC: ' + hata.length + ' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length ? 1 : 0);
})().catch(e => { console.log('COKTU: ' + e.message); process.exit(1); });
