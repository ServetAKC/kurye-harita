/* Not: dosyanin basindaki bozukluk duzeltildi.
   /* 1) Kavakli Bulvari drag adaylari arasinda mi, kacinci sirada?
   2) Drag puanlari virajli/duzden daha mi yuksek? Oyleyse S notu
      drag'de kolaylasir ve harfin anlami bozulur. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9362;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));
const YERLER = [[40.9922,28.6527,'Beylikduzu'],[41.1755,29.6122,'Sile'],
                [41.1830,28.9800,'Belgrad'],[41.1130,29.2280,'Polonezkoy']];
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

  /* 1) Kavakli */
  const kv = JSON.parse(await ev([
    '(async function(){',
    '  var v = await Touge.bolgeVerisi(40.9922, 28.6527, 3);',
    '  var c = Touge.bul("drag", 9999, v.kaynak, {mahalleDahil:false});',
    '  var l = c.sonuc || [];',
    '  var bul = [];',
    '  l.forEach(function(y,i){ if (/Kavakl/.test(y.ad)) bul.push({',
    '    sira:i+1, ad:y.ad, p:+y.puan.toFixed(3), h:Touge.derece(y.puan).harf,',
    '    duz:Math.round(y.olcum.enUzunDuz), km:+(y.olcum.uzunluk/1000).toFixed(2) }); });',
    '  return JSON.stringify({ toplam:l.length, kavakli:bul });',
    '})()'
  ].join('\n')));
  console.log('=== Kavakli Bulvari, drag adaylari icinde ===');
  console.log('  toplam ' + kv.toplam + ' aday');
  if (!kv.kavakli.length) console.log('  Kavakli hic aday olmamis');
  for (const k of kv.kavakli)
    console.log('  ' + k.sira + '. sira  ' + k.h + ' ' + k.p + '  ' + k.km + ' km, icinde ' + k.duz + ' m duzluk');

  /* 2) Tur bazinda puan dagilimi */
  console.log('\n=== tur bazinda puan dagilimi (dort bolge) ===');
  const topla = { viraj: [], duz: [], drag: [] };
  for (const [la,lo,ad] of YERLER) {
    const r = JSON.parse(await ev([
      '(async function(){',
      '  var v = await Touge.bolgeVerisi(' + la + ',' + lo + ',4);',
      '  if (v.hata) return JSON.stringify({hata:1});',
      '  var al = function(t){ return (Touge.bul(t, 9999, v.kaynak, {mahalleDahil:false}).sonuc||[])',
      '    .map(function(y){ return +y.puan.toFixed(3); }); };',
      '  return JSON.stringify({ viraj:al("viraj"), duz:al("duz"), drag:al("drag") });',
      '})()'
    ].join('\n')));
    if (r.hata) continue;
    ['viraj','duz','drag'].forEach(t => topla[t] = topla[t].concat(r[t]));
  }
  const ist = (a) => {
    if (!a.length) return 'aday yok';
    const s = a.slice().sort((x,y)=>x-y);
    const q = (p) => s[Math.min(s.length-1, Math.floor(s.length*p))];
    return String(a.length).padStart(4) + ' aday   ortanca ' + q(0.5).toFixed(3) +
           '   %90 ' + q(0.9).toFixed(3) + '   en yuksek ' + s[s.length-1].toFixed(3) +
           '   S orani %' + (100*a.filter(p=>p>=0.72).length/a.length).toFixed(1);
  };
  ['viraj','duz','drag'].forEach(t => console.log('  ' + t.padEnd(6) + ist(topla[t])));

  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
