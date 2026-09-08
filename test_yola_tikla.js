/* Kullanicinin bulvarina haritada tiklayinca degerlendiriliyor mu? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9366;
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
  /* Kullanicinin verdigi noktanin ustune odaklan */
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=40.9922&lon=28.6527&olcek=1.2'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<70;i++){ if((await ev('Touge.yollariTopla().length'))>400) break; await bekle(1000); }

  console.log('=== TARAMA YAPMADAN, dogrudan yola tikla ===');
  /* Kullanicinin A noktasi: 40.986612, 28.648995 */
  const r = JSON.parse(await ev([
    '(function(){',
    '  var y = Touge.yolDegerlendir(40.986612, 28.648995, null, false);',
    '  if (!y) return JSON.stringify({yok:true});',
    '  if (y.kisa || y.puansiz) return JSON.stringify({ad:y.ad, tur:y.yolTuru, puansiz:true, sorun:y.sorun});',
    '  var a = Touge.ayrinti(y);',
    '  return JSON.stringify({ ad:y.ad, yolTuru:y.yolTuru, tur:y.tur,',
    '    p:+y.puan.toFixed(3), h:Touge.derece(y.puan,y.tur).harf,',
    '    km:+(y.olcum.uzunluk/1000).toFixed(2), duz:Math.round(y.olcum.enUzunDuz),',
    '    viraj:a.viraj, enHiz:a.enYuksekHizKm, egim:a.enDikEgim });',
    '})()'
  ].join('\n')));
  if (r.yok) { console.log('  o noktada yol bulunamadi'); hata.push('yol yok'); }
  else if (r.puansiz) { console.log('  ' + r.ad + ' [' + r.tur + '] puanlanamadi: ' + r.sorun); }
  else {
    console.log('  ' + r.ad + ' [' + r.yolTuru + ']');
    console.log('  en iyi tur: ' + r.tur + '  ->  ' + r.h + ' ' + r.p);
    console.log('  ' + r.km + ' km, icinde ' + r.duz + ' m duzluk, ' + r.viraj +
                ' viraj, ~' + r.enHiz + ' km/s, en dik %' + r.egim);
    kontrol('kullanicinin yolunu buldu', /Kavakl/.test(r.ad), r.ad);
    kontrol('bir harf notu verdi', ['S','A','B','C'].indexOf(r.h) >= 0, r.h);
    kontrol('en uygun turu secti', r.tur === 'drag', r.tur);
    kontrol('egim makul (%0-25)', r.egim >= 0 && r.egim <= 25, '%' + r.egim);
  }

  console.log('\n=== balon aciliyor mu ===');
  const nokta = JSON.parse(await ev([
    '(function(){ var m = Proj.metreye(40.986612, 28.648995);',
    '  var e = Kamera.ekrana(m.x, m.y, Arazi.cz(Arazi.latLonYukseklik(40.986612,28.648995)));',
    '  return JSON.stringify({sx:Math.round(e.sx), sy:Math.round(e.sy),',
    '    g:Kamera.genislik, y:Kamera.yukseklik}); })()'
  ].join('\n')));
  console.log('  ekran noktasi: ' + nokta.sx + ',' + nokta.sy + ' (ekran ' + nokta.g + 'x' + nokta.y + ')');
  if (nokta.sx > 0 && nokta.sy > 0 && nokta.sx < nokta.g && nokta.sy < nokta.y) {
    await ev('Uyg.yolaTikla(' + nokta.sx + ',' + nokta.sy + ')');
    await bekle(600);
    const b = JSON.parse(await ev([
      '(function(){ var b=document.getElementById("tougeBalon");',
      '  return JSON.stringify({ acik: b.style.display==="block", metin: b.textContent,',
      '    durum: document.getElementById("durum").textContent }); })()'
    ].join('\n')));
    console.log('  balon acik: ' + b.acik);
    console.log('  icerik: ' + (b.metin||'').replace(/\s+/g,' ').slice(0,130));
    if (!b.acik) console.log('  durum: ' + b.durum);
    kontrol('tiklayinca balon acildi', b.acik, b.durum.slice(0,60));
    if (b.acik) kontrol('balonda Kavakli yaziyor', /Kavakl/.test(b.metin));
  } else { console.log('  nokta ekran disinda, atlandi'); }

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
