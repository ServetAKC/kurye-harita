/* Harf notu: esikler gercekten ayirt ediyor mu, listede/haritada
   /balonda dogru gorunuyor mu? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9357;
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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  console.log('=== esik tablosu (ture gore) ===');
  const t2 = JSON.parse(await ev('JSON.stringify(Touge.ESIKLER)'));
  for (const tur of Object.keys(t2))
    console.log('  ' + tur.padEnd(6) + 'S >= ' + t2[tur].S.toFixed(2) +
                '   A >= ' + t2[tur].A.toFixed(2) + '   B >= ' + t2[tur].B.toFixed(2) + '   altisi C');

  console.log('');
  console.log('=== sinir degerleri dogru harfi veriyor mu ===');
  /* Her turun kendi esikleri var. Beklenen tabloyu ESIKLER'den
     uretiyoruz ki esikler yeniden ayarlandiginda test kendiliginden
     guncellensin, elle bakim gerektirmesin. */
  const ornekler = [];
  for (const tur of Object.keys(t2)) {
    const e = t2[tur];
    ornekler.push([tur, +(e.B - 0.01).toFixed(2), 'C'], [tur, e.B, 'B'],
                  [tur, +(e.A - 0.01).toFixed(2), 'B'], [tur, e.A, 'A'],
                  [tur, +(e.S - 0.01).toFixed(2), 'A'], [tur, e.S, 'S']);
  }
  const dn = JSON.parse(await ev('JSON.stringify(' + JSON.stringify(ornekler) +
    '.map(function(o){ return { tur:o[0], p:o[1], bek:o[2], h:Touge.derece(o[1],o[0]).harf }; }))'));
  for (const x of dn)
    console.log('    ' + x.tur.padEnd(6) + x.p.toFixed(2) + ' -> ' + x.h +
                (x.h === x.bek ? '' : '   BEKLENEN ' + x.bek));
  kontrol('esikler ture gore dogru calisiyor', dn.every(x => x.h === x.bek),
          dn.filter(x => x.h !== x.bek).map(x => x.tur + ' ' + x.p + '->' + x.h).join(', ') || 'hepsi dogru');

  console.log('\n=== dort bolgede harf dagilimi ===');
  const yerler = [[41.0011,28.6417,'Beylikduzu'],[41.1755,29.6122,'Sile'],
                  [41.1830,28.9800,'Belgrad'],[41.1130,29.2280,'Polonezkoy']];
  const toplam = {S:0,A:0,B:0,C:0};
  for (const [la,lo,ad] of yerler) {
    const r = JSON.parse(await ev([
      '(async function(){',
      '  var v = await Touge.bolgeVerisi(' + la + ',' + lo + ',4);',
      '  if (v.hata) return JSON.stringify({hata:v.hata});',
      '  var c = Touge.bul("ikisi", 9999, v.kaynak, {mahalleDahil:false});',
      '  var s = {S:0,A:0,B:0,C:0};',
      '  (c.sonuc||[]).forEach(function(y){ s[Touge.derece(y.puan, y.tur).harf]++; });',
      '  var ilk = (c.sonuc||[]).slice(0,3).map(function(y){',
      '    return Touge.derece(y.puan, y.tur).harf + " " + y.puan.toFixed(2); });',
      '  return JSON.stringify({say:s, ilk:ilk});',
      '})()'
    ].join('\n')));
    if (r.hata) { console.log('  ' + ad + ': ' + r.hata); continue; }
    Object.keys(toplam).forEach(k => toplam[k] += r.say[k]);
    console.log('  ' + ad.padEnd(12) + 'S:' + r.say.S + ' A:' + r.say.A + ' B:' + r.say.B + ' C:' + r.say.C +
                '   ilk3: ' + r.ilk.join(', '));
  }
  const tp = toplam.S+toplam.A+toplam.B+toplam.C;
  console.log('  TOPLAM      S:' + toplam.S + ' A:' + toplam.A + ' B:' + toplam.B + ' C:' + toplam.C + '  (' + tp + ' aday)');
  kontrol('S nadir (%5 altinda)', toplam.S / tp < 0.05, '%' + (100*toplam.S/tp).toFixed(1));
  kontrol('her harf kullaniliyor', toplam.A > 0 && toplam.B > 0 && toplam.C > 0);

  console.log('\n=== panelde gorunuyor mu ===');
  await ev('document.getElementById("tougeTur").value="viraj"; Uyg.tougeBul();');
  for(let i=0;i<60;i++){ await bekle(1000); if (await ev('Touge.sonuc.length')) break; }
  await bekle(1500);
  const rozet = JSON.parse(await ev([
    'JSON.stringify(Array.from(document.querySelectorAll("#tougeSonuc .derece")).map(function(e){',
    '  return { harf: e.textContent, renk: e.style.color }; }))'
  ].join('\n')));
  console.log('  rozetler: ' + rozet.map(r=>r.harf).join(' '));
  kontrol('her satirda harf rozeti var', rozet.length === (await ev('Touge.sonuc.length')),
          rozet.length + '/' + (await ev('Touge.sonuc.length')));
  kontrol('rozetler renkli', rozet.every(r => r.renk && r.renk !== ''), rozet[0] ? rozet[0].renk : '-');

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
