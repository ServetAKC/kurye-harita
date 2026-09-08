/* 1) Ilce modunda arazi de kapaniyor mu, kare suresi ne kadar dustu?
   2) Tarama bitince ilce vurgusu kalkiyor mu, arama hala o ilceye
      kilitli mi? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9358;
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

  const kareOlc = async () => {
    await ev('Cizer.kirlet()'); await bekle(700);
    const s = JSON.parse(await ev('JSON.stringify(Cizer.sureler||{})'));
    const t = Object.keys(s).reduce((a,k)=>a+(s[k]||0),0);
    return { s: s, toplam: Math.round(t) };
  };

  console.log('=== 1. mod ACILMADAN kare suresi ===');
  const once = await kareOlc();
  console.log('  ' + JSON.stringify(once.s) + '  toplam ~' + once.toplam + ' ms');

  await ev('Uyg.ilceModuAc()');
  for(let i=0;i<90;i++){ await bekle(500); if (await ev('Uyg.ilceModu')) break;
    const d = await ev('document.getElementById("durum").textContent');
    if (/bulunamadi|hata/i.test(d)) break; }

  console.log('\n=== 2. mod ACIKKEN ===');
  const kat = JSON.parse(await ev('JSON.stringify({yollar:Cizer.katman.yollar,binalar:Cizer.katman.binalar,alanlar:Cizer.katman.alanlar,poiler:Cizer.katman.poiler,arazi:Cizer.katman.arazi,esYukselti:Cizer.katman.esYukselti,araziEtkin:Arazi.etkin})'));
  console.log('  katmanlar: ' + JSON.stringify(kat));
  kontrol('arazi cizimi kapandi', kat.arazi === false);
  kontrol('es yukselti kapandi', kat.esYukselti === false);
  kontrol('yol/bina/alan/durak kapali', !kat.yollar && !kat.binalar && !kat.alanlar && !kat.poiler);
  kontrol('arazi VERISI acik kaldi (sinirlar araziye otursun)', kat.araziEtkin === true);
  const sonra = await kareOlc();
  console.log('  ' + JSON.stringify(sonra.s) + '  toplam ~' + sonra.toplam + ' ms');
  kontrol('kare suresi dustu', sonra.toplam < once.toplam,
          once.toplam + ' ms -> ' + sonra.toplam + ' ms');

  console.log('\n=== 3. ilce sec ve tara ===');
  const ad = await ev('(function(){var en=null,enA=Infinity;Sinir.ilceler.forEach(function(o){var a=(o.kutu.k-o.kutu.g)*(o.kutu.d-o.kutu.b);if(a<enA&&Sinir.icinde(o,o.merkez.lat,o.merkez.lon)){enA=a;en=o;}});if(!en)return "";window.__s=en;Uyg.ilceSec(en);return en.ad;})()');
  console.log('  secildi: ' + ad);
  await bekle(600);
  kontrol('secimden sonra sinir HALA cizili', (await ev('Sinir.aktif')) === true);
  kontrol('katmanlar geri geldi', (await ev('Cizer.katman.arazi')) === true);

  await ev('document.getElementById("tougeBtn").click()');
  let d='';
  for(let i=0;i<200;i++){ await bekle(1000);
    d = await ev('document.getElementById("durum").textContent');
    if (/aday|hata|buyuk|inmedi/i.test(d)) break; }
  console.log('  durum: ' + d.slice(0,90));
  await bekle(600);
  kontrol('tarama sonrasi ilce vurgusu KALKTI', (await ev('Sinir.aktif')) === false);
  kontrol('arama hala o ilceye kilitli', /' + '/.test('') || (await ev('Sinir.secili ? Sinir.secili.ad : ""')) === ad,
          await ev('document.getElementById("tougeBtn").textContent'));

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
