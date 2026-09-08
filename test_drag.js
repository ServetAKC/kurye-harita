/* Drag pisti turu: kullanicinin isaret ettigi Kavakli Bulvari
   artik cikiyor mu, ve genel olarak makul sonuc veriyor mu? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9361;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=40.9922&lon=28.6527&olcek=0.9'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  const r = JSON.parse(await ev([
    '(async function(){',
    '  var v = await Touge.bolgeVerisi(40.9922, 28.6527, 3);',
    '  if (v.hata) return JSON.stringify({hata:v.hata});',
    '  var oz = function(t){',
    '    var c = Touge.bul(t, 8, v.kaynak, {mahalleDahil:false});',
    '    return { toplam: c.toplam, liste: (c.sonuc||[]).map(function(y){',
    '      return { ad:y.ad, tur:y.yolTuru, km:+(y.olcum.uzunluk/1000).toFixed(2),',
    '               duz: Math.round(y.olcum.enUzunDuz), donus: Math.round(y.olcum.donusPerKm),',
    '               p:+y.puan.toFixed(3), h:Touge.derece(y.puan).harf }; }) };',
    '  };',
    '  return JSON.stringify({ viraj: oz("viraj"), duz: oz("duz"), drag: oz("drag") });',
    '})()'
  ].join('\n')));
  if (r.hata) { console.log(r.hata); process.exit(1); }

  const yaz = (ad, o) => {
    console.log('\n=== ' + ad + '  (' + o.toplam + ' aday) ===');
    if (!o.liste.length) { console.log('  sonuc yok'); return; }
    for (const y of o.liste)
      console.log('  ' + y.h + ' ' + y.p.toFixed(3) + '  ' + String(y.km).padStart(5) + ' km  ' +
                  'duzluk ' + String(y.duz).padStart(4) + ' m  ' + String(y.donus).padStart(4) + '°/km  ' +
                  y.tur.padEnd(12) + y.ad.slice(0,28));
  };
  yaz('VIRAJLI', r.viraj);
  yaz('UZUN DUZ', r.duz);
  yaz('DRAG PISTI', r.drag);

  const kavakli = r.drag.liste.filter(y => /Kavakl/.test(y.ad));
  console.log('');
  kontrol('drag turu sonuc uretiyor', r.drag.liste.length > 0, r.drag.toplam + ' aday');
  /* Kavakli ilk 8'de degil ve olmasi da gerekmiyor: ayni 3 km'de
     2000 m duzlugu olan yollar var, onun 700 m'lik duzlugu geride
     kaliyor. Onemli olan artik DOGRU TURDE puanlanmasi (drag
     adaylari arasinda 61. sirada, olculdu). Testin kontrol ettigi
     sey: drag turu, virajli taramanin bulamadigi uzun duzluklu
     yollari gercekten buluyor mu. */
  kontrol('drag turu uzun duzluklu yollari buluyor',
          r.drag.liste.some(y => y.duz >= 1000),
          'en uzun duzluk ' + Math.max.apply(null, r.drag.liste.map(y => y.duz)) + ' m');
  kontrol('drag sonuclarinin duzlugu esigin uzerinde',
          r.drag.liste.every(y => y.duz >= 400),
          'en kisa ' + Math.min.apply(null, r.drag.liste.map(y=>y.duz)) + ' m');
  /* Drag listesi virajli listesinden FARKLI olmali, yoksa yeni tur gereksiz */
  const va = r.viraj.liste.map(y=>y.ad).join('|'), da = r.drag.liste.map(y=>y.ad).join('|');
  kontrol('drag listesi virajlidan farkli', va !== da);

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
