/* Touge bulucuyu gercek OSM verisiyle sina.
   Iddia: "virajli" dedigi yollar gercekten kivrimli, "duz" dedigi
   gercekten duz olmali. Ikisinin olculerini karsilastirarak bak. */
const { spawn } = require('child_process');
const EDGE = process.env.TARAYICI || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336;
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

/* Nerede arayalim: adres cubugundan konum verilebiliyor */
const YERLER = [
  { ad: 'Beylikduzu (sehir ici)',       lat: 41.0011, lon: 28.6417, olcek: 0.9 },
  { ad: 'Buyukcekmece kuzeyi (kirsal)', lat: 41.0850, lon: 28.5600, olcek: 0.55 },
  /* Gercek orman/dag yolu: bulucunun asil ise yaramasi gereken yer.
     Kirsalda calismadigi supheye dusunce eklendi. */
  { ad: 'Belgrad Ormani (orman)',       lat: 41.1830, lon: 28.9800, olcek: 0.55 },
  { ad: 'Sile-Agva yolu (kiyi+orman)',  lat: 41.1500, lon: 29.6100, olcek: 0.45 }
];

(async () => {
  const cocuk = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + process.env.TEMP + '/edge-e2e',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });

  let t = null;
  for (let i = 0; i < 40; i++) {
    await bekle(300);
    try {
      t = (await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json())
            .filter(x => x.type === 'page');
      if (t.length) break;
    } catch (e) {}
  }
  const ws = new WebSocket(t[0].webSocketDebuggerUrl);
  await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
  let no = 0; const bek = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bek.has(m.id)) { bek.get(m.id)(m); bek.delete(m.id); } };
  const g = (me, pa) => new Promise(z => { const id = ++no; bek.set(id, z); ws.send(JSON.stringify({ id, method: me, params: pa || {} })); });
  const ev = async (k) => {
    const r = await g('Runtime.evaluate', { expression: k, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await g('Page.enable'); await g('Runtime.enable');
  const hata = [];

  for (const yer of YERLER) {
    const url = 'http://localhost/kurye-harita/?lat=' + yer.lat + '&lon=' + yer.lon + '&olcek=' + yer.olcek;
    await g('Page.navigate', { url: url });
    for (let i = 0; i < 40; i++) {
      await bekle(500);
      try { if (/complete.*kurye/.test(await ev('document.readyState+" "+location.pathname'))) break; } catch (e) {}
    }
    /* Yol verisi insin */
    let yolSayi = 0;
    for (let i = 0; i < 70; i++) {
      yolSayi = await ev('Touge.yollariTopla().length');
      if (yolSayi > 400) break;
      await bekle(1000);
    }

    console.log('\n============================================');
    console.log(yer.ad + '   (' + yolSayi + ' yol parcasi, arazi: ' +
                (await ev('Arazi.hazir ? "var" : "yok"')) + ')');
    console.log('============================================');
    if (yolSayi < 100) { console.log('  yeterli veri inmedi, atlaniyor'); continue; }

    for (const tur of ['viraj', 'duz']) {
      const c = await ev('JSON.stringify((function(){var c=Touge.bul("' + tur + '",5);' +
        'var hepsi=Touge.bul("' + tur + '",9999).sonuc||[];' +
        'var d=hepsi.map(function(y){return y.olcum.donusPerKm;}).sort(function(a,b){return a-b;});' +
        'var ortancaDonus=d.length?Math.round(d[Math.floor(d.length/2)]):0;' +
        'return {toplam:c.toplam,ms:c.ms,zincir:c.zincir,darEle:c.darEle,rakimVar:c.rakimVar,' +
        'ortancaDonus:ortancaDonus,' +
        'liste:(c.sonuc||[]).map(function(y){return {ad:y.ad,tur:y.yolTuru,parca:y.parca,' +
        'km:+(y.olcum.uzunluk/1000).toFixed(2),donus:Math.round(y.olcum.donusPerKm),' +
        'kivrim:+y.olcum.kivrim.toFixed(3),rakim:Math.round(y.olcum.rakimAralik),' +
        'kavsak:Math.round(y.olcum.kavsakPerKm),bina:Math.round(y.olcum.binaMesafe),' +
        'darlik:+y.olcum.darlik.toFixed(2),gen:y.genislik,' +
        'izbe:+y.izbeP.toFixed(2),yog:Math.round(y.olcum.binaYogunluk),' +
        'manzara:+y.olcum.manzara.toFixed(2),' +
        'puan:+y.puan.toFixed(3)};})};})())');
      const r = JSON.parse(c);
      console.log('\n--- ' + tur.toUpperCase() + '  (' + r.toplam + ' aday, ' +
                  r.zincir + ' zincir, ' + r.darEle + ' dar elendi, ' + Math.round(r.ms) + ' ms)');
      if (!r.liste.length) { console.log('    sonuc yok'); continue; }
      for (const y of r.liste) {
        console.log('  ' + y.puan.toFixed(2) + '  ' + y.km + ' km  ' +
                    String(y.donus).padStart(4) + '°/km  kivrim ' + y.kivrim.toFixed(2) +
                    '  rakim ' + String(y.rakim).padStart(3) + ' m  ' +
                    String(y.kavsak).padStart(2) + ' kavsak/km  ' +
                    String(y.bina).padStart(2) + ' m bina  izbe ' + y.izbe.toFixed(2) + '  ' + String(y.yog).padStart(4) + ' bina/km2  su ' + y.manzara.toFixed(2) + '  ' +
                    y.tur + '  ' + y.ad.slice(0, 34));
      }
      /* Dar sokak elemesi: sonuclarin HICBIRI bina dibinden gecmemeli.
         Ayrica sehir icinde filtrenin gercekten calismasi lazim —
         0 eleme, filtrenin bagli olmadigi anlamina gelir. */
      const dib = r.liste.filter(y => y.darlik > 0.40);
      if (dib.length) { console.log('    X ' + dib.length + ' sonuc bina dibinden geciyor'); hata.push(yer.ad + '/' + tur + '/dar'); }
      if (/sehir ici/.test(yer.ad) && r.darEle === 0) {
        console.log('    X sehir icinde hic dar sokak elenmedi — filtre calismiyor olabilir');
        hata.push(yer.ad + '/' + tur + '/eleme-yok');
      }

      /* Bu tur icin beklenen ozellik gercekten saglaniyor mu? */
      if (tur === 'viraj') {
        const ort = r.liste.reduce((s, y) => s + y.donus, 0) / r.liste.length;
        console.log('    ortalama donus: ' + Math.round(ort) + '°/km');
        console.log('    bolgenin ortanca adayi: ' + r.ortancaDonus + '°/km');
        if (ort < r.ortancaDonus * 1.3) {
          console.log('    X virajli denilen yollar bolge ortancasindan yeterince donmuyor');
          hata.push(yer.ad + '/viraj');
        }
      } else {
        const ort = r.liste.reduce((s, y) => s + y.kivrim, 0) / r.liste.length;
        const ortD = r.liste.reduce((s, y) => s + y.donus, 0) / r.liste.length;
        console.log('    ortalama kivrim: ' + ort.toFixed(3) + ' · donus ' + Math.round(ortD) + '°/km');
        if (ort > 1.12) { console.log('    X duz denilen yollar duz degil'); hata.push(yer.ad + '/duz'); }
      }
    }

    /* Ikisi birden + ekran goruntusu */
    await ev('document.getElementById("tougeTur").value="viraj"; Uyg.tougeBul();');
    await bekle(2500);
    const listeYazi = await ev(
      'document.querySelectorAll("#tougeSonuc .tougeSatir").length');
    console.log('\n  panelde ' + listeYazi + ' satir gorunuyor');
    if (!listeYazi) hata.push(yer.ad + '/panel');
  }

  await bekle(2000);
  const ss = await g('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(__dirname + '/ss/touge.png', Buffer.from(ss.result.data, 'base64'));
  console.log('\n  ss/touge.png');

  ws.close(); cocuk.kill();
  console.log(hata.length ? '\nSONUC: ' + hata.length + ' hata -> ' + hata.join(', ')
                          : '\nSONUC: hepsi gecti');
  process.exit(hata.length ? 1 : 0);
})().catch(e => { console.log('COKTU: ' + e.message); process.exit(1); });
