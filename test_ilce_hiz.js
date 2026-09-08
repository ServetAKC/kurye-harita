/* Ilce modu iyilestirmeleri:
   1) kutu izgaraya oturunca ikinci acilis onbellekten mi geliyor?
   2) indirme zoom ile paralel mi basliyor?
   3) uzerine gelince vurgu ve ad calisiyor mu?
   4) Buyukcekmece'ye tiklayinca GERCEKTEN Buyukcekmece mi araniyor? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9350;
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
  /* Beylikduzu civari, YAKIN acilsin ki uzaklasma da olculsun */
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.02&lon=28.62&olcek=1.0'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  await bekle(3000);

  const ac = async () => {
    const t0 = Date.now();
    await ev('Uyg.ilceModuAc()');
    for (let i=0;i<90;i++){
      await bekle(200);
      if (await ev('Uyg.ilceModu')) break;
      const d = await ev('document.getElementById("durum").textContent');
      if (/bulunamadi|hata/i.test(d)) break;
    }
    return Date.now() - t0;
  };

  console.log('=== 1. ilk acilis (soguk) ===');
  const ms1 = await ac();
  console.log('  ' + (ms1/1000).toFixed(1) + ' sn   ' + (await ev('Sinir.ilceler.length')) + ' ilce');
  const kutu1 = await ev('JSON.stringify(Sinir.kutuyuOturt([41.0,28.5,41.1,28.7]))');
  console.log('  izgaraya oturmus kutu ornegi: ' + kutu1);

  console.log('\n=== 2. kapat, biraz gezin, tekrar ac (onbellek tutmali) ===');
  await ev('Uyg.ilceModuKapat(); Uyg.gitKonuma(41.03, 28.63, 1.0);');
  await bekle(1500);
  const ms2 = await ac();
  console.log('  ' + (ms2/1000).toFixed(1) + ' sn   ' + (await ev('Sinir.ilceler.length')) + ' ilce');
  console.log('  (not: kutu izgaraya oturuyor, ilk kosumda da onbellekte olabilir)');

  console.log('\n=== 3. uzerine gelme vurgusu ===');
  const uz = JSON.parse(await ev([
    '(function(){',
    '  var o = Sinir.ilceler.find(function(x){ return /Büyükçekmece/.test(x.ad); });',
    '  if (!o) return JSON.stringify({yok:true, adlar: Sinir.ilceler.map(function(x){return x.ad;})});',
    '  Sinir.uzerinde = o;',
    '  return JSON.stringify({ ad:o.ad, dolgu:o.renk.dolgu, uzerine:o.renk.uzerine, secili:o.renk.secili });',
    '})()'
  ].join('\n')));
  if (uz.yok) { console.log('  Buyukcekmece yok. Gelen ilceler: ' + uz.adlar.join(', ')); }
  else {
    console.log('  ' + uz.ad);
    console.log('    normal : ' + uz.dolgu);
    console.log('    uzerine: ' + uz.uzerine);
    console.log('    secili : ' + uz.secili);
    const alfa = (s) => parseFloat(s.split(',').pop().replace(')',''));
    kontrol('uzerine gelince belirginlesiyor', alfa(uz.uzerine) > alfa(uz.dolgu));
    kontrol('secilince daha da belirginlesiyor', alfa(uz.secili) > alfa(uz.uzerine));
  }

  console.log('\n=== 4. Buyukcekmece tiklaninca ne araniyor? ===');
  const bc = JSON.parse(await ev([
    '(function(){',
    '  var o = Sinir.ilceler.find(function(x){ return /Büyükçekmece/.test(x.ad); });',
    '  if (!o) return JSON.stringify({yok:true});',
    '  window.__bc = o;',
    '  var kt = o.kutu;',
    '  /* Kutu ortasi ve merkez KIMIN icinde? */',
    '  var kimde = [];',
    '  Sinir.ilceler.forEach(function(p){ if (Sinir.icinde(p, o.merkez.lat, o.merkez.lon)) kimde.push(p.ad); });',
    '  return JSON.stringify({ ad:o.ad, merkez:[+o.merkez.lat.toFixed(4), +o.merkez.lon.toFixed(4)],',
    '                          merkezKimde: kimde, kutu: [+kt.g.toFixed(3),+kt.b.toFixed(3),+kt.k.toFixed(3),+kt.d.toFixed(3)] });',
    '})()'
  ].join('\n')));
  if (bc.yok) { console.log('  Buyukcekmece bulunamadi'); }
  else {
    console.log('  merkez: ' + bc.merkez.join(', ') + '   -> icinde oldugu ilce(ler): ' + bc.merkezKimde.join(', '));
    kontrol('merkez Buyukcekmece icinde', bc.merkezKimde.length === 1 && /Büyükçekmece/.test(bc.merkezKimde[0]));

    await ev('Uyg.ilcedeAra(window.__bc)');
    let d = '';
    for (let i=0;i<180;i++){ await bekle(1000);
      d = await ev('document.getElementById("durum").textContent');
      if (/aday|hata|buyuk|inmedi/i.test(d)) break; }
    console.log('  durum: ' + d);
    kontrol('secili ilce Buyukcekmece', /Büyükçekmece/.test(await ev('Sinir.secili ? Sinir.secili.ad : ""')));
    kontrol('durum satirinda Buyukcekmece yaziyor', /Büyükçekmece/.test(d), d.slice(0,40));

    /* Zincirler birden cok yol parcasindan olusuyor ve filtre PARCA
       ortasina bakiyor; zincirin uclari sinirin disina tasabilir.
       Onemli olan yolun NE KADARININ ilce icinde oldugu. */
    const son = JSON.parse(await ev([
      'JSON.stringify(Touge.sonuc.map(function(y){',
      '  var o = y.olcum.ornek, ic = 0;',
      '  o.forEach(function(p){ if (Sinir.icinde(window.__bc, p.lat, p.lon)) ic++; });',
      '  return { ad:y.ad, km:+(y.olcum.uzunluk/1000).toFixed(2),',
      '           oran: +(ic/o.length).toFixed(2) };',
      '}))'
    ].join('\n')));
    console.log('  ' + son.length + ' sonuc — yolun yuzde kaci ilce icinde:');
    for (const y of son) console.log('    %' + String(Math.round(y.oran*100)).padStart(3) + '  ' + String(y.km).padStart(5) + ' km  ' + y.ad.slice(0,30));
    if (son.length) {
      const ort = son.reduce((s,y)=>s+y.oran,0)/son.length;
      kontrol('sonuclar agirlikli olarak ilce icinde', ort > 0.8, 'ortalama %' + Math.round(ort*100));
      kontrol('hicbir sonuc tamamen disarida degil', son.every(y=>y.oran > 0.3));
    }
  }

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
