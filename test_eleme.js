/* Mahalle sokagi elemesi: neyi eledi, geriye ne kaldi?
   Iki bolgede, kutucuk kapali ve acikken. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
const YERLER = [
  { ad: 'Sile',        lat: 41.1755, lon: 29.6122, km: 4 },
  { ad: 'Polonezkoy',  lat: 41.1130, lon: 29.2280, km: 4 }
];
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
  await g('Page.enable'); await g('Runtime.enable');
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  const hata = [];
  for (const yer of YERLER) {
    const r = JSON.parse(await ev(`(async function(){
      var v = await Touge.bolgeVerisi(${yer.lat}, ${yer.lon}, ${yer.km});
      if (v.hata) return JSON.stringify({hata:v.hata});
      var ozet = function(secenek){
        var c = Touge.bul('viraj', 6, v.kaynak, secenek);
        return { toplam: c.toplam, eleme: c.eleme, dar: c.darEle, zincir: c.zincir,
                 liste: (c.sonuc||[]).map(function(y){
                   return { ad:y.ad, tur:y.yolTuru, km:+(y.olcum.uzunluk/1000).toFixed(2),
                            puan:+y.puan.toFixed(2), donus:Math.round(y.olcum.donusPerKm) };
                 })};
      };
      return JSON.stringify({ yol: v.kaynak.yollar.length, bina: v.bina,
                              kapali: ozet({mahalleDahil:false}),
                              acik:   ozet({mahalleDahil:true}) });
    })()`));
    if (r.hata) { console.log(yer.ad + ': ' + r.hata); continue; }
    console.log('\n============ ' + yer.ad + ' (' + yer.km + ' km) — ' +
                r.yol + ' yol, ' + r.bina + ' bina ============');
    for (const [ad, o] of [['KUTUCUK KAPALI (varsayilan)', r.kapali], ['KUTUCUK ACIK', r.acik]]) {
      console.log('\n  ' + ad + ':  ' + o.toplam + ' aday / ' + o.zincir + ' zincir');
      const e = o.eleme || {};
      console.log('    elendi: mahalle=' + (e.mahalle||0) + '  dar=' + (o.dar||0) +
                  '  yuzey=' + (e.yuzey||0) + '  kapali=' + (e.kapali||0));
      for (const y of o.liste) {
        console.log('      ' + y.puan.toFixed(2) + ' ' + String(y.km).padStart(5) + ' km  ' +
                    String(y.donus).padStart(4) + '°/km  ' + y.tur.padEnd(13) + y.ad.slice(0,30));
      }
    }
    /* Eleme sonrasi hic sonuc kalmamasi kabul edilemez */
    if (!r.kapali.toplam) { console.log('    X eleme sonrasi hic aday kalmadi'); hata.push(yer.ad); }
    const mahalleVar = r.kapali.liste.filter(y => y.tur === 'residential' || y.tur === 'living_street');
    if (mahalleVar.length) { console.log('    X mahalle sokagi hala listede'); hata.push(yer.ad + '/sizinti'); }
  }
  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: ' + hata.length + ' hata' : '\nSONUC: gecti');
  process.exit(hata.length ? 1 : 0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
