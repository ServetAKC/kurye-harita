/* Kullanici: "Beylikduzu seciyorum Esenyurt Avcilar geliyo,
   ben sadece o bolgeyi istiyorum."
   Iddia: tiklamak SECER + ortalar, "... icinde ara" SADECE o ilceyi tarar. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9353;
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.02&lon=28.65&olcek=0.09'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  await bekle(4000);

  console.log('=== 1. ilce modunu ac ===');
  await ev('Uyg.ilceModuAc()');
  for(let i=0;i<90;i++){ await bekle(500); if (await ev('Uyg.ilceModu')) break;
    const d = await ev('document.getElementById("durum").textContent');
    if (/bulunamadi|hata/i.test(d)) break; }
  const adlar = JSON.parse(await ev('JSON.stringify(Sinir.ilceler.map(function(o){return o.ad;}))'));
  console.log('  ' + adlar.length + ' ilce: ' + adlar.join(', '));
  kontrol('Beylikduzu listede', adlar.some(a=>/Beylikdüzü/.test(a)));

  console.log('\n=== 2. Beylikduzu SEC (aramamali) ===');
  const oncekiOlcek = await ev('Kamera.olcek');
  await ev('(function(){ window.__bd = Sinir.ilceler.find(function(o){return /Beylikdüzü/.test(o.ad);}); Uyg.ilceSec(window.__bd); })()');
  await bekle(500);
  kontrol('secildi', /Beylikdüzü/.test(await ev('Sinir.secili ? Sinir.secili.ad : ""')));
  kontrol('secme modundan cikti', (await ev('Uyg.ilceModu')) === false);
  kontrol('mod gez', (await ev('Uyg.mod')) === 'gez');
  kontrol('yollar geri geldi', (await ev('Cizer.katman.yollar')) === true);
  kontrol('sinir cizimi duruyor', (await ev('Sinir.aktif')) === true);
  kontrol('ARAMA BASLAMADI', (await ev('Touge.sonuc.length')) === 0);
  console.log('  dugme yazisi: "' + (await ev('document.getElementById("tougeBtn").textContent')) + '"');
  kontrol('dugme ilceye kilitli', /Beylikdüzü/.test(await ev('document.getElementById("tougeBtn").textContent')));

  /* Ortalandi mi: ilce merkezi ekranin ortasina yakin mi? */
  for(let i=0;i<40;i++){ await bekle(300);
    if (Math.abs(await ev('Uyg.hedefOlcek/Kamera.olcek - 1')) < 0.02) break; }
  const ort = JSON.parse(await ev([
    '(function(){',
    '  var m = Proj.metreye(window.__bd.merkez.lat, window.__bd.merkez.lon);',
    '  var e = Kamera.ekrana(m.x, m.y, 0);',
    '  return JSON.stringify({ sx:Math.round(e.sx), sy:Math.round(e.sy),',
    '                          g:Kamera.genislik, y:Kamera.yukseklik, olcek:+Kamera.olcek.toFixed(3) });',
    '})()'
  ].join('\n')));
  const sapmaX = Math.abs(ort.sx - ort.g/2) / ort.g;
  const sapmaY = Math.abs(ort.sy - ort.y/2) / ort.y;
  console.log('  ilce merkezi ekranda: ' + ort.sx + ',' + ort.sy + '  (ekran ' + ort.g + 'x' + ort.y + ')');
  kontrol('ilce ekranda ortalandi', sapmaX < 0.12 && sapmaY < 0.12,
          'sapma %' + Math.round(sapmaX*100) + ' / %' + Math.round(sapmaY*100));

  console.log('\n=== 3. "Beylikduzu icinde ara" ===');
  await ev('document.getElementById("tougeTur").value="viraj"; document.getElementById("tougeBtn").click();');
  let d='';
  for(let i=0;i<200;i++){ await bekle(1000);
    d = await ev('document.getElementById("durum").textContent');
    if (/aday|hata|buyuk|inmedi/i.test(d)) break; }
  console.log('  durum: ' + d);

  /* ASIL KONTROL: her sonuc hangi ilcede? */
  const nerede = JSON.parse(await ev([
    'JSON.stringify(Touge.sonuc.map(function(y){',
    '  var o = y.olcum.ornek, sayim = {};',
    '  o.forEach(function(p){',
    '    var bulundu = null;',
    '    Sinir.ilceler.forEach(function(x){ if (!bulundu && Sinir.icinde(x, p.lat, p.lon)) bulundu = x.ad; });',
    '    var k = bulundu || "(ilce disi)";',
    '    sayim[k] = (sayim[k]||0)+1;',
    '  });',
    '  var en = null, enN = 0, bd = sayim["Beylikdüzü"] || 0;',
    '  Object.keys(sayim).forEach(function(k){ if (sayim[k] > enN) { enN = sayim[k]; en = k; } });',
    '  return { ad:y.ad, km:+(y.olcum.uzunluk/1000).toFixed(2), agirlikli:en,',
    '           bdOran:+(bd/o.length).toFixed(2), dagilim:sayim };',
    '}))'
  ].join('\n')));
  console.log('  ' + nerede.length + ' sonuc:');
  for (const y of nerede) {
    console.log('    %' + String(Math.round(y.bdOran*100)).padStart(3) + ' Beylikduzu   ' +
                String(y.km).padStart(5) + ' km   agirlikli: ' + String(y.agirlikli).padEnd(14) + y.ad.slice(0,26));
  }
  if (nerede.length) {
    kontrol('HICBIR sonuc baska ilcede degil',
            nerede.every(y => y.agirlikli === 'Beylikdüzü'),
            nerede.filter(y=>y.agirlikli!=='Beylikdüzü').map(y=>y.agirlikli).join(', ') || 'hepsi Beylikduzu');
    const o = nerede.reduce((s,y)=>s+y.bdOran,0)/nerede.length;
    kontrol('sonuclar agirlikli olarak Beylikduzu icinde', o > 0.85, 'ortalama %' + Math.round(o*100));
  } else {
    kontrol('sonuc uretildi', false, d);
  }

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
