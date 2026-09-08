/* Arama bitince en iyi sonuc secilip oraya uculuyor mu?
   Ilce aramasinda ise SADECE seciliyor, kamera ilcede kaliyor. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9351;
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.0011&lon=28.6417&olcek=0.9'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  console.log('=== "Bu bolgede ara" ===');
  const once = JSON.parse(await ev('JSON.stringify((function(){var m=Uyg.kameraMerkezi();return {olcek:+Kamera.olcek.toFixed(3), lat:+m.lat.toFixed(4), lon:+m.lon.toFixed(4)};})())'));
  console.log('  once: olcek ' + once.olcek + '  merkez ' + once.lat + ',' + once.lon);
  await ev('document.getElementById("tougeTur").value="viraj"; Uyg.tougeBul();');
  await bekle(3000);
  /* yumusak zoom otursun */
  for (let i=0;i<40;i++){ await bekle(300);
    if (Math.abs(await ev('Uyg.hedefOlcek/Kamera.olcek - 1')) < 0.02) break; }
  const sonra = JSON.parse(await ev('JSON.stringify((function(){var m=Uyg.kameraMerkezi();return {olcek:+Kamera.olcek.toFixed(3), lat:+m.lat.toFixed(4), lon:+m.lon.toFixed(4), secili: Touge.secili ? Touge.secili.ad : null, ilk: Touge.sonuc.length ? Touge.sonuc[0].ad : null};})())'));
  console.log('  sonra: olcek ' + sonra.olcek + '  merkez ' + sonra.lat + ',' + sonra.lon);
  console.log('  secili: ' + sonra.secili);
  kontrol('en iyi sonuc secildi', sonra.secili && sonra.secili === sonra.ilk);
  kontrol('kamera hareket etti', sonra.lat !== once.lat || sonra.lon !== once.lon,
          once.lat+','+once.lon+' -> '+sonra.lat+','+sonra.lon);
  kontrol('yola yakinlasti', sonra.olcek > once.olcek, once.olcek + ' -> ' + sonra.olcek);

  /* Secilen yol gercekten ekranda mi? */
  const gorunur = await ev([
    '(function(){',
    '  var y = Touge.secili; if (!y) return 0;',
    '  var n = y.olcum.ornek, ic = 0;',
    '  n.forEach(function(p){',
    '    var m = Proj.metreye(p.lat, p.lon);',
    '    var e = Kamera.ekrana(m.x, m.y, Arazi.cz(Arazi.latLonYukseklik(p.lat,p.lon)));',
    '    if (e.sx>=0 && e.sy>=0 && e.sx<=Kamera.genislik && e.sy<=Kamera.yukseklik) ic++;',
    '  });',
    '  return Math.round(100*ic/n.length);',
    '})()'
  ].join('\n'));
  console.log('  secilen yolun %' + gorunur + "'i ekranda");
  kontrol('secilen yol ekrana sigdi', gorunur >= 85, '%' + gorunur);

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
