/* Touge ayrinti balonu:
   - viraj sayisi / yaricap / egim / hiz degerleri mantikli mi?
   - haritada yola tiklayinca balon aciliyor mu, icerigi dogru mu?
   - bosluga tiklayinca kapaniyor mu? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9355;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const c = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port='+PORT,'--user-data-dir='+process.env.TEMP+'/edge-e2e',
    '--window-size=1400,900','about:blank'], {stdio:'ignore'});
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.1755&lon=29.6122&olcek=0.5'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<70;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  /* Sile'de tara */
  await ev('document.getElementById("tougeTur").value="viraj"; Uyg.tougeBul();');
  for(let i=0;i<90;i++){ await bekle(1000);
    if (await ev('Touge.sonuc.length')) break;
    const d = await ev('document.getElementById("durum").textContent');
    if (/hata|bulunamadi/i.test(d)) break; }
  for(let i=0;i<40;i++){ await bekle(300);
    if (Math.abs(await ev('Uyg.hedefOlcek/Kamera.olcek - 1')) < 0.02) break; }

  console.log('=== 1. ayrinti degerleri ===');
  const ay = JSON.parse(await ev([
    'JSON.stringify(Touge.sonuc.map(function(y){',
    '  var a = Touge.ayrinti(y);',
    '  return { ad:y.ad, tur:y.yolTuru, km:+(y.olcum.uzunluk/1000).toFixed(2),',
    '           donus: Math.round(y.olcum.donusPerKm),',
    '           viraj:a.viraj, yaricap:a.enDarYaricap, virajHiz:a.virajHizKm,',
    '           duz:a.enUzunDuz, enHiz:a.enYuksekHizKm, sinifHiz:a.sinifHizKm,',
    '           egim:a.enDikEgim, tirmanis:a.tirmanis };',
    '}))'
  ].join('\n')));
  console.log('  yol'.padEnd(30) + 'km   °/km  viraj  yaricap  virajHiz  duzluk  enHiz  sinif  egim');
  for (const y of ay) {
    console.log('  ' + y.ad.slice(0,28).padEnd(30) +
      String(y.km).padStart(4) + ' ' + String(y.donus).padStart(5) + ' ' +
      String(y.viraj).padStart(6) + ' ' + String(y.yaricap).padStart(7) + 'm ' +
      String(y.virajHiz).padStart(8) + ' ' + String(y.duz).padStart(6) + 'm ' +
      String(y.enHiz).padStart(6) + ' ' + String(y.sinifHiz).padStart(6) + ' %' + y.egim);
  }

  /* Mantik kontrolleri */
  kontrol('sonuc var', ay.length > 0);
  kontrol('virajli yollarda viraj sayilmis', ay.every(y => y.viraj > 0),
          'en az: ' + Math.min.apply(null, ay.map(y=>y.viraj)));
  /* Sinif hizi artik TAVAN degil, sadece bilgi: YOL_STILI degerleri
     rota suresi icin konmus muhafazakar sehir ici hizlari. */
  kontrol('hicbir hiz genel tavani asmiyor', ay.every(y => y.enHiz <= 130),
          Math.max.apply(null, ay.map(y=>y.enHiz)) + ' km/s en yuksek');
  kontrol('viraj hizi en yuksek hizdan buyuk degil', ay.every(y => y.virajHiz <= y.enHiz));
  kontrol('yaricaplar makul (5-2000 m)', ay.every(y => y.yaricap === null || (y.yaricap >= 5 && y.yaricap <= 2000)));
  const kotuEgim = ay.filter(y => y.egim < 0 || y.egim > 25);
  kontrol('egimler makul (%0-25)', kotuEgim.length === 0,
          kotuEgim.length ? kotuEgim.map(y=>'%'+y.egim).join(', ') : 'en dik %' + Math.max.apply(null, ay.map(y=>y.egim)));
  /* Daha cok donen yolun yaricapi daha kucuk olmali */
  const sirali = ay.slice().sort((a,b)=>b.donus-a.donus);
  console.log('  en cok donen: ' + sirali[0].donus + '°/km, yaricap ' + sirali[0].yaricap + ' m');
  console.log('  en az donen : ' + sirali[sirali.length-1].donus + '°/km, yaricap ' + sirali[sirali.length-1].yaricap + ' m');

  console.log('\n=== 2. haritada yola tikla ===');
  /* Secili yolun ekrandaki bir noktasini bul ve oraya tikla */
  const nokta = JSON.parse(await ev([
    '(function(){',
    '  var y = Touge.sonuc[0]; Touge.cizimeHazirla(y);',
    '  var o = y.olcum.ornek;',
    '  for (var i = 0; i < o.length; i++) {',
    '    var m = Proj.metreye(o[i].lat, o[i].lon);',
    '    var e = Kamera.ekrana(m.x, m.y, Arazi.cz(o[i].z));',
    '    if (e.sx > 40 && e.sy > 40 && e.sx < Kamera.genislik-40 && e.sy < Kamera.yukseklik-40)',
    '      return JSON.stringify({ sx: Math.round(e.sx), sy: Math.round(e.sy), ad: y.ad });',
    '  }',
    '  return JSON.stringify({yok:true});',
    '})()'
  ].join('\n')));
  if (nokta.yok) { console.log('  yol ekranda degil, atlaniyor'); }
  else {
    console.log('  tiklanan: ' + nokta.sx + ',' + nokta.sy + '  (' + nokta.ad.slice(0,26) + ')');
    const vuran = await ev('(function(){var y=Uyg.tougeVur(' + nokta.sx + ',' + nokta.sy + '); return y?y.ad:"";})()');
    kontrol('tiklama yolu buldu', vuran === nokta.ad, vuran || '(bulamadi)');

    await ev('Uyg.tougeBalonAc(Uyg.tougeVur(' + nokta.sx + ',' + nokta.sy + '), ' + nokta.sx + ', ' + nokta.sy + ')');
    await bekle(400);
    const b = JSON.parse(await ev([
      '(function(){ var b = document.getElementById("tougeBalon");',
      '  return JSON.stringify({ gorunur: b.style.display === "block",',
      '    metin: b.textContent, bag: (b.querySelector(".balonBag")||{}).href || "",',
      '    kopya: !!b.querySelector(".kopyaBtn"),',
      '    sol: parseInt(b.style.left), ust: parseInt(b.style.top),',
      '    g: b.offsetWidth, y: b.offsetHeight,',
      '    anaG: document.querySelector("main").clientWidth,',
      '    anaY: document.querySelector("main").clientHeight }); })()'
    ].join('\n')));
    console.log('  balon: ' + b.g + 'x' + b.y + ' @ ' + b.sol + ',' + b.ust);
    console.log('  icerik: ' + b.metin.replace(/\s+/g,' ').slice(0,150));
    kontrol('balon gorundu', b.gorunur);
    kontrol('koordinat var', /\d+\.\d{6}, -?\d+\.\d{6}/.test(b.metin));
    kontrol('hiz yaziyor', /km\/s/.test(b.metin));
    kontrol('viraj ya da duzluk yaziyor', /viraj|duzluk/.test(b.metin));
    kontrol('yokus yaziyor', /Yokus/.test(b.metin));
    kontrol('maps baglantisi var', /google\.com\/maps\/dir/.test(b.bag));
    kontrol('kopyala dugmesi var', b.kopya);
    kontrol('balon ekran icinde', b.sol >= 0 && b.ust >= 0 &&
            b.sol + b.g <= b.anaG && b.ust + b.y <= b.anaY,
            b.sol+'+'+b.g+' / '+b.anaG);
    kontrol('tiklanan yol secildi', await ev('Touge.secili && Touge.secili.ad === ' + JSON.stringify(nokta.ad)));

    /* Bosluga tikla -> kapansin */
    await ev('Uyg.tougeBalonKapat()');
    await bekle(200);
    kontrol('kapaniyor', (await ev('document.getElementById("tougeBalon").style.display')) === 'none');

    /* Ekran goruntusu icin tekrar ac */
    await ev('Uyg.tougeBalonAc(Uyg.tougeVur(' + nokta.sx + ',' + nokta.sy + '), ' + nokta.sx + ', ' + nokta.sy + ')');
    await bekle(600);
    const ss = await g('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(__dirname + '/ss/balon.png', Buffer.from(ss.result.data, 'base64'));
    console.log('  ss/balon.png');
  }

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
