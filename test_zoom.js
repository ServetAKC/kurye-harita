/* Ilce modunda yumusak zoom: acinca uzaklasiyor mu, secince
   yakinlasiyor mu, ve zoom GERCEKTEN yumusak mi (tek karede
   siciramamali). */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9344;
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
  /* YAKIN acilsin ki uzaklasmasi gozlensin */
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=41.02&lon=29.10&olcek=1.2'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  await bekle(3000);

  const bas = await ev('Kamera.olcek');
  console.log('=== acilis olcegi: ' + bas.toFixed(3) + ' (yakin) ===');

  /* Zoom'u kare kare izle: ani sicrama var mi? */
  await ev(`window.__iz = []; (function(){
    var son = Kamera.olcek;
    window.__izle = setInterval(function(){
      if (Kamera.olcek !== son) { window.__iz.push(+Kamera.olcek.toFixed(4)); son = Kamera.olcek; }
    }, 30);
  })()`);
  await ev('Uyg.ilceModuAc()');
  for (let i=0;i<90;i++){ await bekle(1000); if (await ev('Uyg.ilceModu')) break;
    const d = await ev('document.getElementById("durum").textContent');
    if (/bulunamadi|hata/i.test(d)) break; }
  await ev('clearInterval(window.__izle)');

  const iz = await ev('JSON.stringify(window.__iz)');
  const adim = JSON.parse(iz);
  const uzak = await ev('Kamera.olcek');
  console.log('  uzaklasma sonrasi olcek: ' + uzak.toFixed(3));
  console.log('  ara olcekler (' + adim.length + ' adim): ' + adim.slice(0,12).join(' -> ') + (adim.length>12?' ...':''));
  kontrol('uzaklasti', uzak < bas * 0.5, bas.toFixed(3) + ' -> ' + uzak.toFixed(3));
  /* Yumusak = en az birkac ara adim. Aniden set edilseydi 1 adim olurdu. */
  kontrol('zoom YUMUSAK (ara adimlar var)', adim.length >= 5, adim.length + ' ara deger');
  kontrol('ilce modu acildi', await ev('Uyg.ilceModu === true'));
  kontrol('yollar gizlendi', (await ev('Cizer.katman.yollar')) === false);

  console.log('\n=== ilce secimi ===');
  const ad = await ev(`(function(){
    var en=null,enA=Infinity;
    Sinir.ilceler.forEach(function(o){var a=(o.kutu.k-o.kutu.g)*(o.kutu.d-o.kutu.b);
      if(a<enA && Sinir.icinde(o,o.merkez.lat,o.merkez.lon)){enA=a;en=o;}});
    if(!en) return ''; window.__sec=en; return en.ad;})()`);
  console.log('  secilen: ' + ad);
  await ev('window.__iz2=[]; (function(){var son=Kamera.olcek;window.__izle2=setInterval(function(){if(Kamera.olcek!==son){window.__iz2.push(+Kamera.olcek.toFixed(4));son=Kamera.olcek;}},30);})()');
  await ev('Uyg.ilcedeAra(window.__sec)');
  await bekle(4000);
  await ev('clearInterval(window.__izle2)');
  const adim2 = JSON.parse(await ev('JSON.stringify(window.__iz2)'));
  const yakin = await ev('Kamera.olcek');
  console.log('  secim sonrasi olcek: ' + yakin.toFixed(3));
  console.log('  ara olcekler (' + adim2.length + ' adim): ' + adim2.slice(0,12).join(' -> ') + (adim2.length>12?' ...':''));
  kontrol('geri yakinlasti', yakin > uzak * 1.2, uzak.toFixed(3) + ' -> ' + yakin.toFixed(3));
  kontrol('yakinlasma da YUMUSAK', adim2.length >= 5, adim2.length + ' ara deger');
  kontrol('yollar geri geldi', (await ev('Cizer.katman.yollar')) === true);
  kontrol('sinir cizimi duruyor', (await ev('Sinir.aktif')) === true);
  kontrol('mod gez oldu', (await ev('Uyg.mod')) === 'gez');

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
