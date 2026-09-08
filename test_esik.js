/* Ture gore esikler: her turde S orani makul mu (%2-6 arasi)? */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9363;
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
  const hata=[]; const kontrol=(a,ok,ek)=>{console.log((ok?'  ok  ':'  X   ')+a+(ek?'   '+ek:'')); if(!ok)hata.push(a);};
  await g('Page.enable'); await g('Runtime.enable');
  await g('Page.navigate',{url:'http://localhost/kurye-harita/'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  const say = { viraj:{S:0,A:0,B:0,C:0}, duz:{S:0,A:0,B:0,C:0}, drag:{S:0,A:0,B:0,C:0} };
  for (const [la,lo,ad] of YERLER) {
    const r = JSON.parse(await ev([
      '(async function(){',
      '  var v = await Touge.bolgeVerisi(' + la + ',' + lo + ',4);',
      '  if (v.hata) return JSON.stringify({hata:1});',
      '  var s = {};',
      '  ["viraj","duz","drag"].forEach(function(t){',
      '    var o = {S:0,A:0,B:0,C:0};',
      '    (Touge.bul(t, 9999, v.kaynak, {mahalleDahil:false}).sonuc||[]).forEach(function(y){',
      '      o[Touge.derece(y.puan, t).harf]++; });',
      '    s[t] = o;',
      '  });',
      '  return JSON.stringify(s);',
      '})()'
    ].join('\n')));
    if (r.hata) continue;
    ['viraj','duz','drag'].forEach(t => Object.keys(say[t]).forEach(h => say[t][h] += r[t][h]));
  }
  console.log('=== ture gore esiklerle harf dagilimi ===');
  for (const t of ['viraj','duz','drag']) {
    const o = say[t], n = o.S+o.A+o.B+o.C;
    console.log('  ' + t.padEnd(6) + String(n).padStart(4) + ' aday   S:' + o.S + ' A:' + o.A +
                ' B:' + o.B + ' C:' + o.C + '   S orani %' + (n ? (100*o.S/n).toFixed(1) : '0'));
  }
  for (const t of ['viraj','drag']) {
    const o = say[t], n = o.S+o.A+o.B+o.C;
    kontrol(t + ': S nadir ama var (%1-7)', n === 0 || (o.S/n <= 0.07 && o.S > 0),
            '%' + (n ? (100*o.S/n).toFixed(1) : '0'));
  }
  const d = say.duz, dn = d.S+d.A+d.B+d.C;
  kontrol('duz: S artik ulasilabilir', dn === 0 || d.S > 0, d.S + '/' + dn);

  ws.close(); c.kill();
  console.log(hata.length ? '\nSONUC: '+hata.length+' hata' : '\nSONUC: hepsi gecti');
  process.exit(hata.length?1:0);
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
