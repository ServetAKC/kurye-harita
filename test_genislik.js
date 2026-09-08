/* Genislik bileseni gercekten calisiyor mu?
   1) Kac adayin serit/genislik etiketi var, genisP dagilimi ne?
   2) Bileseni sabitleyince siralama degisiyor mu (atil mi degil mi)?
   3) Kullanicinin isaret ettigi Kavakli Bulvari simdi kac aliyor? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9369;
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
    '  var sirala = function(t){',
    '    return (Touge.bul(t, 9999, v.kaynak, {mahalleDahil:false}).sonuc||[])',
    '      .map(function(y){ return { ad:(y.ad||"(isimsiz)")+"#"+y.id, p:y.puan, g:y.genisP }; });',
    '  };',
    '  var oncesi = { viraj: sirala("viraj"), drag: sirala("drag") };',
    '',
    '  /* Bileseni sabitle: SERIT_PUAN ve genislik yerine hep 0.5 dondur */',
    '  var gercek = Touge.puanla, gercekStil = Ayristirici.stilBul;',
    '  Ayristirici.stilBul = function(){ return { en: 7 }; };',
    '  Touge.puanla = function(m, tur, rakimVar, zincir){',
    '    var z2 = Object.assign({}, zincir || {}, { serit:null, genislik:null });',
    '    return gercek.call(Touge, m, tur, rakimVar, z2);',
    '  };',
    '  Touge._zincirOnbellek = null;',
    '  var sonrasi = { viraj: sirala("viraj"), drag: sirala("drag") };',
    '  Touge.puanla = gercek; Ayristirici.stilBul = gercekStil; Touge._zincirOnbellek = null;',
    '',
    '  /* Kavakli Bulvari: kullanicinin verdigi iki nokta */',
    '  var kav = [Touge.yolDegerlendir(40.986612, 28.648995, v.kaynak, false),',
    '             Touge.yolDegerlendir(40.997693, 28.656375, v.kaynak, false)]',
    '    .map(function(d){',
    '      if (!d) return { yok:"60 m icinde yol yok" };',
    '      if (d.puan == null) return { yok: d.kisa ? "cok kisa" : (d.sorun || "puanlanamadi") , ad:d.ad };',
    '      return { ad:d.ad, tur:d.tur, yolTuru:d.yolTuru, p:+d.puan.toFixed(3),',
    '               harf: Touge.derece(d.puan, d.tur).harf, km:+(d.olcum.uzunluk/1000).toFixed(2),',
    '               g:(d.genisP!=null?+d.genisP.toFixed(2):null), serit:d.serit };',
    '    });',
    '',
    '  /* Etiket kapsami */',
    '  var say = { serit:0, genislik:0, hic:0 };',
    '  v.kaynak.yollar.forEach(function(y){',
    '    if (y.serit != null) say.serit++; else if (y.genislik != null) say.genislik++; else say.hic++;',
    '  });',
    '  return JSON.stringify({ oncesi:oncesi, sonrasi:sonrasi, kavakli:kav, say:say,',
    '                          yol:v.kaynak.yollar.length });',
    '})()'
  ].join('\n')));
  if (r.hata) { console.log(r.hata); process.exit(1); }

  console.log('=== ' + r.yol + ' yol: ' + r.say.serit + ' serit etiketli, ' +
              r.say.genislik + ' genislik etiketli, ' + r.say.hic + ' etiketsiz (sinifa dusuyor) ===');

  for (const tur of ['viraj','drag']) {
    const a = r.oncesi[tur], b = r.sonrasi[tur];
    const yerA = new Map(a.map((y,i)=>[y.ad,i])), yerB = new Map(b.map((y,i)=>[y.ad,i]));
    let kaydi = 0, enCok = 0, enCokAd = '';
    for (const [ad,i] of yerA) if (yerB.has(ad)) {
      const d = Math.abs(i - yerB.get(ad));
      if (d) kaydi++;
      if (d > enCok) { enCok = d; enCokAd = ad.split('#')[0]; }
    }
    const gd = a.map(y=>y.g).filter(x=>x!=null).sort((x,y)=>x-y);
    console.log('\n  ' + tur + ': ' + a.length + ' aday, ' + kaydi + ' tanesi genislik yuzunden yer degistirdi' +
                ' (en buyuk sicrama ' + enCok + ' sira: ' + enCokAd + ')');
    if (gd.length) console.log('    genisP: en dusuk ' + gd[0].toFixed(2) + ', ortanca ' +
      gd[Math.floor(gd.length/2)].toFixed(2) + ', en yuksek ' + gd[gd.length-1].toFixed(2));
    console.log('    ilk bes (yeni): ' + b.slice(0,5).map(y=>y.ad.split('#')[0].slice(0,18)+' '+y.p.toFixed(2)).join(' | '));
    kontrol(tur + ' turunde genislik siralamayi degistiriyor (atil degil)', kaydi > 0, kaydi + ' yol kaydi');
  }

  console.log('\n=== Kavakli Bulvari (kullanicinin isaret ettigi yol) ===');
  r.kavakli.forEach((k,i) => {
    if (k.yok) { console.log('  nokta' + (i+1) + ': ' + (k.ad ? k.ad + ' — ' : '') + k.yok); return; }
    console.log('  nokta' + (i+1) + ': ' + k.ad + '  [' + k.tur + ']  ' + k.p + ' -> ' + k.harf +
                '   ' + k.km + ' km   genisP ' + k.g +
                (k.serit ? '  (' + k.serit + ' serit)' : '  (serit etiketi yok, ' + k.yolTuru + ' sinifindan)'));
  });
  kontrol('tiklanan yol degerlendirilebiliyor', r.kavakli.some(k => !k.yok));

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: ' + hata.length + ' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
