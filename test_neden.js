/* Kullanici: "40.986612, 28.648995 - 40.997693, 28.656375 S denilebilecek
   yol, neden burayi secmedin?"
   Boru hattinda nereye takildigini bul: elendi mi, elendiyse neden;
   puanlandiysa kac ve hangi bilesenden dustu. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9359;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

const A = [40.986612, 28.648995];
const B = [40.997693, 28.656375];

const KOD = [
  '(async function(){',
  '  var v = await Touge.bolgeVerisi(' + ((A[0]+B[0])/2) + ', ' + ((A[1]+B[1])/2) + ', 3);',
  '  if (v.hata) return JSON.stringify({hata:v.hata});',
  '  var k = v.kaynak;',
  '',
  '  /* Bir noktaya en yakin yol parcalari */',
  '  var yakin = function(lat, lon, kac){',
  '    var l = k.yollar.map(function(y){',
  '      var en = Infinity;',
  '      y.nokta.forEach(function(p){',
  '        var d = Proj.mesafe(lat, lon, p.lat, p.lon);',
  '        if (d < en) en = d;',
  '      });',
  '      return { y:y, d:en };',
  '    }).filter(function(x){ return x.d < 60; });',
  '    l.sort(function(a,b){ return a.d-b.d; });',
  '    return l.slice(0, kac);',
  '  };',
  '',
  '  var aY = yakin(' + A[0] + ',' + A[1] + ', 4);',
  '  var bY = yakin(' + B[0] + ',' + B[1] + ', 4);',
  '  var ozet = function(x){',
  '    return { ad: x.y.ad || "(isimsiz)", tur: x.y.tur, uzaklik: Math.round(x.d),',
  '             yuzey: x.y.yuzey, erisim: x.y.erisim, id: x.y.id };',
  '  };',
  '',
  '  /* Zincirleri kur, iki noktaya da degen zinciri bul */',
  '  var zincirler = Touge.zincirle(k.yollar, false);',
  '  var zincirDegdi = function(z, lat, lon){',
  '    var en = Infinity;',
  '    z.nokta.forEach(function(p){',
  '      var d = Proj.mesafe(lat, lon, p.lat, p.lon);',
  '      if (d < en) en = d;',
  '    });',
  '    return en;',
  '  };',
  '  var adaylar = zincirler.map(function(z){',
  '    return { z:z, da: zincirDegdi(z, ' + A[0] + ',' + A[1] + '),',
  '                  db: zincirDegdi(z, ' + B[0] + ',' + B[1] + ') };',
  '  }).filter(function(x){ return x.da < 80 || x.db < 80; });',
  '  adaylar.sort(function(p,q){ return (p.da+p.db)-(q.da+q.db); });',
  '',
  '  /* Ilk bes zincirin akibetini cikar */',
  '  var izgara = Touge.binaIzgarasi(k.binalar.kose);',
  '  Touge.izbeG = Touge.izbeIzgarasi(k.binalar.merkez);',
  '  Touge.yolG = Touge.yolIzgarasi(k.yollar);',
  '  Touge.suIzgara = Touge.binaIzgarasi(k.sular);',
  '  var gecis = new Map();',
  '  k.yollar.forEach(function(y){ y.dugum.forEach(function(n){ gecis.set(n,(gecis.get(n)||0)+1); }); });',
  '  var kavsakMi = function(n){ return (gecis.get(n)||0) > 1; };',
  '',
  '  var akibet = adaylar.slice(0,5).map(function(x){',
  '    var z = x.z;',
  '    var o = { ad: z.ad || "(isimsiz)", tur: z.tur, parca: z.parca,',
  '              aUzak: Math.round(x.da), bUzak: Math.round(x.db), sorun: z.sorun };',
  '    if (z.sorun) { o.sonuc = "ELENDI: " + z.sorun; return o; }',
  '    var m = Touge.olc(z, izgara, kavsakMi, true);',
  '    if (!m) { o.sonuc = "ELENDI: 200 m alti"; return o; }',
  '    o.km = +(m.uzunluk/1000).toFixed(2);',
  '    o.donus = Math.round(m.donusPerKm);',
  '    o.kivrim = +m.kivrim.toFixed(2);',
  '    o.kusUcusu = Math.round(m.kusUcusu);',
  '    o.kavsak = Math.round(m.kavsakPerKm);',
  '    o.binaM = Math.round(m.binaMesafe);',
  '    o.darlik = +m.darlik.toFixed(2);',
  '    o.yolYog = +m.yolYogunluk.toFixed(1);',
  '    o.rakim = Math.round(m.rakimAralik);',
  '    var p = Touge.puanla(m, "viraj", true, z.tur);',
  '    var pd = Touge.puanla(m, "duz", true, z.tur);',
  '    if (pd) { o.duzPuan = +pd.puan.toFixed(3); o.duzHarf = Touge.derece(pd.puan).harf; }',
  '    if (!p) {',
  '      var sebep = [];',
  '      if (m.uzunluk < Touge.ENAZ_UZUNLUK_VIRAJ) sebep.push("kisa (" + Math.round(m.uzunluk) + " m < " + Touge.ENAZ_UZUNLUK_VIRAJ + ")");',
  '      if (m.kivrim > Touge.ENCOK_KIVRIM) sebep.push("halka (kivrim " + m.kivrim.toFixed(2) + ")");',
  '      if (m.kusUcusu < Touge.ENAZ_KUS_UCUSU) sebep.push("kus ucusu " + Math.round(m.kusUcusu) + " m < " + Touge.ENAZ_KUS_UCUSU);',
  '      if (m.darlik > Touge.ENCOK_DARLIK) sebep.push("dar sokak (%" + Math.round(m.darlik*100) + ")");',
  '      o.sonuc = "PUANLANMADI: " + (sebep.join(", ") || "bilinmeyen");',
  '      return o;',
  '    }',
  '    o.puan = +p.puan.toFixed(3);',
  '    o.harf = Touge.derece(p.puan).harf;',
  '    o.bilesen = { kivrim: +p.kivrimP.toFixed(2), nis: +p.nis.toFixed(2),',
  '                  izbe: +p.izbeP.toFixed(2), trafik: +p.trafik.toFixed(2),',
  '                  rakim: +p.rakimP.toFixed(2), uzun: +p.uzunP.toFixed(2) };',
  '    o.sonuc = (p.puan < 0.35) ? "ELENDI: puan esigi 0.35 alti" : "PUANLANDI";',
  '    return o;',
  '  });',
  '',
  '  return JSON.stringify({ yolSayi: k.yollar.length, zincir: zincirler.length,',
  '    aYakin: aY.map(ozet), bYakin: bY.map(ozet), akibet: akibet });',
  '})()'
].join('\n');

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
  await g('Page.navigate',{url:'http://localhost/kurye-harita/?lat=40.9922&lon=28.6527&olcek=0.9'});
  for(let i=0;i<40;i++){await bekle(500); try{if(/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname')))break;}catch(e){}}
  for(let i=0;i<60;i++){ if((await ev('Touge.yollariTopla().length'))>300) break; await bekle(1000); }

  const r = JSON.parse(await ev(KOD));
  if (r.hata) { console.log(r.hata); process.exit(1); }

  console.log('=== bolgede ' + r.yolSayi + ' yol, ' + r.zincir + ' zincir ===');
  console.log('\nA noktasina (40.986612, 28.648995) en yakin yollar:');
  for (const y of r.aYakin) console.log('  ' + String(y.uzaklik).padStart(3) + ' m  ' +
    y.tur.padEnd(14) + (y.yuzey||'yuzey-yok').padEnd(11) + y.ad.slice(0,30));
  console.log('\nB noktasina (40.997693, 28.656375) en yakin yollar:');
  for (const y of r.bYakin) console.log('  ' + String(y.uzaklik).padStart(3) + ' m  ' +
    y.tur.padEnd(14) + (y.yuzey||'yuzey-yok').padEnd(11) + y.ad.slice(0,30));

  console.log('\n=== bu noktalara degen zincirlerin akibeti ===');
  for (const z of r.akibet) {
    console.log('\n  ' + z.ad + '  [' + z.tur + ', ' + z.parca + ' parca]');
    console.log('    A\'ya ' + z.aUzak + ' m, B\'ye ' + z.bUzak + ' m');
    if (z.km !== undefined) {
      console.log('    ' + z.km + ' km · ' + z.donus + '°/km · kivrim ' + z.kivrim +
                  ' · kus ucusu ' + z.kusUcusu + ' m · rakim ' + z.rakim + ' m');
      console.log('    ' + z.kavsak + ' kavsak/km · bina ' + z.binaM + ' m · dar %' +
                  Math.round(z.darlik*100) + ' · yol yog ' + z.yolYog + ' km/km2');
    }
    if (z.duzPuan !== undefined) console.log('    DUZ olarak: ' + z.duzPuan + ' -> ' + z.duzHarf);
    if (z.puan !== undefined) {
      console.log('    VIRAJ olarak: ' + z.puan + '  ->  ' + z.harf);
      console.log('    bilesenler: ' + JSON.stringify(z.bilesen));
    }
    console.log('    >>> ' + z.sonuc);
  }

  ws.close(); c.kill();
})().catch(e=>{console.log('COKTU: '+e.message);process.exit(1);});
