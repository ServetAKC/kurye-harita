/* Google Maps baglantisi dogru mu?
   Sadece "olustu" yetmez: ara noktalar gercekten yolun uzerinde mi,
   sirali mi, tekrar var mi, Google'in 9 ara nokta sinirini asiyor mu? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9338;
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

  await g('Page.enable'); await g('Runtime.enable');
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.1500&lon=29.6100&olcek=0.45'});
  for(let i=0;i<40;i++){await bekle(500); try{ if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname'))) break;}catch(e){}}
  for(let i=0;i<70;i++){ if((await ev('Touge.yollariTopla().length'))>400) break; await bekle(1000); }

  await ev('Touge.bul("viraj", 5)');
  const veri = JSON.parse(await ev(`JSON.stringify(Touge.sonuc.map(function(y){
    return { ad: y.ad, km: +(y.olcum.uzunluk/1000).toFixed(2),
             url: Touge.mapsBaglantisi(y),
             ilk: y.olcum.ornek[0].lat.toFixed(6)+','+y.olcum.ornek[0].lon.toFixed(6),
             son: y.olcum.ornek[y.olcum.ornek.length-1].lat.toFixed(6)+','+y.olcum.ornek[y.olcum.ornek.length-1].lon.toFixed(6),
             yol: y.olcum.ornek.map(function(p){return [p.lat,p.lon];}) };
  }))`));

  const hata = [];
  const kontrol = (ad, ok, ek) => { console.log((ok?'  ok  ':'  X   ')+ad+(ek?'   '+ek:'')); if(!ok) hata.push(ad); };

  /* Iki nokta arasi metre (kaba, bu enlemde yeterli) */
  const mesafe = (a, b) => Math.hypot((b[0]-a[0])*111132, (b[1]-a[1])*84000);

  console.log('=== ' + veri.length + ' sonuc icin baglanti kontrolu ===\n');
  for (const y of veri) {
    console.log(y.km + ' km  ' + y.ad.slice(0, 40));
    const u = new URL(y.url);
    const q = u.searchParams;

    kontrol('  google.com/maps/dir adresi', u.host === 'www.google.com' && u.pathname === '/maps/dir/');
    kontrol('  api=1 ve travelmode=driving', q.get('api')==='1' && q.get('travelmode')==='driving');
    kontrol('  origin yolun basi', q.get('origin') === y.ilk, q.get('origin'));
    kontrol('  destination yolun sonu', q.get('destination') === y.son, q.get('destination'));

    const w = (q.get('waypoints')||'').split('|').filter(Boolean);
    kontrol('  ara nokta 9 siniri asmiyor', w.length <= 9, w.length + ' ara nokta');
    kontrol('  ara noktalar tekrarsiz', new Set(w).size === w.length);

    /* Her ara nokta gercekten yolun uzerinde mi? En yakin yol noktasina
       25 m'den uzaksa baglanti Google'i baska yere gonderiyor demektir. */
    let enUzak = 0;
    for (const s of w) {
      const p = s.split(',').map(Number);
      let en = Infinity;
      for (const yp of y.yol) en = Math.min(en, mesafe(p, yp));
      enUzak = Math.max(enUzak, en);
    }
    kontrol('  ara noktalar yolun uzerinde', enUzak < 25, 'en uzak sapma ' + enUzak.toFixed(1) + ' m');

    /* Sirali mi: ara noktalar bastan sona dogru ilerlemeli */
    let sirali = true, oncekiIdx = -1;
    for (const s of w) {
      const p = s.split(',').map(Number);
      let en = Infinity, idx = -1;
      y.yol.forEach((yp, i) => { const d = mesafe(p, yp); if (d < en) { en = d; idx = i; } });
      if (idx <= oncekiIdx) sirali = false;
      oncekiIdx = idx;
    }
    kontrol('  ara noktalar sirali', sirali);
    console.log('  ' + y.url.slice(0, 110) + (y.url.length > 110 ? '...' : ''));
    console.log('');
  }

  /* Panelde dugme gercekten cikiyor mu */
  await ev('document.getElementById("tougeTur").value="viraj"; Uyg.tougeBul();');
  await bekle(2500);
  const dugme = await ev('document.querySelectorAll("#tougeSonuc .mapsBtn").length');
  const satir = await ev('document.querySelectorAll("#tougeSonuc .tougeSatir").length');
  kontrol('panelde her satirda maps dugmesi', dugme === satir && dugme > 0, dugme + '/' + satir);
  const href = await ev('(document.querySelector("#tougeSonuc .mapsBtn")||{}).href || ""');
  kontrol('dugmenin href adresi dogru', href.indexOf('google.com/maps/dir') > 0, href.slice(0, 60));
  const hedef = await ev('(document.querySelector("#tougeSonuc .mapsBtn")||{}).target || ""');
  kontrol('yeni sekmede aciliyor', hedef === '_blank');

  await ev('document.getElementById("panel").scrollTop = 2000');
  await bekle(800);
  const ss = await g('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(__dirname + '/ss/maps.png', Buffer.from(ss.result.data, 'base64'));
  console.log('  ss/maps.png');

  ws.close(); cocuk.kill();
  console.log(hata.length ? 'SONUC: ' + hata.length + ' hata' : 'SONUC: hepsi gecti');
  process.exit(hata.length ? 1 : 0);
})().catch(e => { console.log('COKTU: ' + e.message); process.exit(1); });
