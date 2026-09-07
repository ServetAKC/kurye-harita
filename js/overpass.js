/* ============================================================
   overpass.js  —  OpenStreetMap'ten gercek harita verisi cekme
   ------------------------------------------------------------
   Overpass API = OSM'nin sorgu servisi. "Su dikdortgenin icindeki
   yollari, binalari, benzinlikleri ver" diyoruz, JSON donuyor.
   Nominatim  = adres arama servisi ("SushiCo Beylikduzu" -> lat/lon)
   Ikisi de ucretsiz ve anahtar istemiyor.

   DETAY SEVIYESI onemli: Beylikduzu+Buyukcekmece gibi 15 km'lik bir
   alanin butun binalarini indirmek ~100 MB olurdu. O yuzden alan
   buyudukce daha az detay ceker (asagidaki DETAY tablosu).
   ============================================================ */

const Overpass = {

  /* Birden fazla ayna. Bir sunucu cevap vermezse siradaki denenir ve
     CALISAN sunucu basa alinir (bir dahaki sefere once o denensin).
     4 Eylul 2026'da olculdu: overpass-api.de ve kumi.systems bu agdan
     hic cevap vermiyordu (ana sayfalari bile acilmiyordu), maps.mail.ru
     aynasi calisiyordu. Tek sunucuya bagli kalmak "yuklenmiyor" demek.

     Bu liste sadece VEKIL YOKKA kullanilir (sayfa file:// ile acilmissa ya
     da Apache kapaliysa). 7 Eylul 2026 olcumu: z.overpass-api.de ve
     overpass-api.de 443 portuna hic baglanamiyor — ikisi de bastaydi, o
     yuzden vekilsiz durumda konsol bu ikisinin CORS hatasiyla doluyordu.
     Calisabilir olanlar one alindi. */
  SUNUCULAR: [
    'https://overpass.kumi.systems/api/interpreter',      // CORS acik
    'https://overpass.private.coffee/api/interpreter',    // CORS acik
    // mail.ru curl ile calisiyor ama TARAYICIDA engellenebiliyor: bilinen bir
    // takip alan adi oldugu icin koruma eklentisi / Firefox izleme korumasi
    // istegi daha cikmadan kesiyor ("CORS request did not succeed, status null").
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    // 7 Eylul 2026: ikisi de bu agdan erisilemiyor, en sona alindi
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ],
  /* Vekil uzerinden agir bir mahalle blogu (bina dahil) olculdu: ~6-15 sn.
     25 sn cok siki bir tavandi; ilk ayna yavaslarsa istek daha cevap
     donmeden iptal ediliyordu. */
  ZAMAN_ASIMI_MS: 60000,

  /* ------------------------------------------------------------
     YEREL VEKIL
     Tarayici tarafindaki engellenme (izleme korumasi, reklam engelleyici,
     kurumsal ag, antivirus) hicbir aynayla asilamaz: istek daha cikmadan
     kesilir. Cozum: sayfa kendi sunucusuna istek atar, dis baglantiyi
     sunucu kurar. Ayni kaynak oldugu icin ne CORS ne de icerik filtresi
     devreye girer. `osmveri.php` varsa kendiliginden kullanilir.
     Dosya adinda "proxy" GECMEMELI: izleme korumasi ve reklam
     engelleyiciler o kelimeyi iceren yollari kesiyor (bkz. osmveri.php).
     ------------------------------------------------------------ */
  vekil: null,          // null = bakilmadi, '' = yok, aksi halde adres
  _vekilSozu: null,     // suren yoklama; ayni anda gelen cagrilar bunu bekler
  vekilVarsayildi: false, // yoklama engellendi ama vekil yine de denenecek

  /* DIKKAT — burada bir yaris kosulu vardi: `vekil` daha yoklama BITMEDEN
     '' yapiliyordu. Es zamanli iki blok inerken (ESZAMANLI: 2) ikinci
     cagri o '' degerini gorup "vekil yok" sanip dogrudan aynalara
     gidiyordu. Chrome'da bu bazen yutuluyordu; Firefox tabanli
     tarayicilarda (Zen dahil) izleme korumasi aynalari tamamen kestigi
     icin o blok komple bos kaliyordu. Artik yoklama SOZU paylasiliyor:
     ayni anda gelen herkes ayni sonucu bekler. */
  async vekilBul() {
    if (this.vekil !== null) return this.vekil;
    if (this._vekilSozu) return this._vekilSozu;
    this._vekilSozu = (async () => {
      let bulunan = '';
      const sunucudan = (location.protocol === 'http:' || location.protocol === 'https:');
      try {
        const c = await fetch('osmveri.php?ping=1', { cache: 'no-store' });
        if (c.ok) {
          const j = await c.json();
          if (j && j.vekil) bulunan = 'osmveri.php';
          else console.warn('[harita] vekil yoklamasi beklenmedik cevap:', j);
        } else {
          console.warn('[harita] vekil yoklamasi HTTP', c.status);
        }
      } catch (e) {
        /* Yoklamanin kendisi kesilmis olabilir: reklam engelleyici filtreleri
           yolunda "proxy" gecen istekleri sevmiyor, HTTPS-Only kipi istegi
           https'e yukseltip dusurebiliyor, bir eklenti araya girebiliyor.
           Sayfa bir sunucudan geldiyse osmveri.php buyuk ihtimalle YINE DE
           duruyordur — sessizce aynalara dusmek yerine varsayip deniyoruz.
           Varsayim yanlissa aynalar yedek olarak zaten devrede kaliyor. */
        console.warn('[harita] vekil yoklamasi basarisiz:', (e && e.message) || e);
        if (sunucudan) { bulunan = 'osmveri.php'; this.vekilVarsayildi = true; }
      }
      this.vekil = bulunan;
      /* Engellenme sessiz kalmasin: konsola bakmayan biri "yine yuklenmiyor"
         diye kaliyordu. Ekranin ustune ne oldugunu ve ne yapilacagini yaz. */
      if (this.vekilVarsayildi) this.uyariGoster();
      console.log('[harita] vekil:', bulunan || 'YOK — dogrudan aynalar denenecek',
                  this.vekilVarsayildi ? '(yoklama engellendi, varsayildi)' : '');
      return bulunan;
    })();
    return this._vekilSozu;
  },


  /* Izleme korumasi / reklam engelleyici yerel vekil istegini kesmisse
     kullaniciya EKRANDA soyle. Konsol acmayi bilmeyen icin tek cozum yolu. */
  uyariGoster() {
    if (document.getElementById('vekilUyari')) return;
    const d = document.createElement('div');
    d.id = 'vekilUyari';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;' +
      'background:#7c2d12;color:#fed7aa;padding:10px 44px 10px 14px;' +
      'font:13px/1.5 system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.5)';
    d.innerHTML = '<b>Izleme korumasi veri istegini engelliyor.</b> ' +
      'Adres cubugunun solundaki <b>kalkan</b> simgesine tiklayip bu site icin ' +
      'korumayi kapat, sonra sayfayi yenile. (Zen / Firefox: Enhanced Tracking ' +
      'Protection &rarr; kapat)';
    const k = document.createElement('button');
    k.textContent = '×';
    k.style.cssText = 'position:absolute;top:6px;right:10px;background:none;' +
      'border:0;color:#fed7aa;font-size:20px;cursor:pointer;line-height:1';
    k.onclick = function () { d.remove(); };
    d.appendChild(k);
    document.body.appendChild(d);
  },
  /* Her seviye SADECE o olcekte gorunen seyi ceker.
     Olculdu (22x15 km bolge sorgusu, 5.37 MB): tertiary yollar %17,
     landuse+leisure %20 yer kapliyordu — ve o olcekte ikisi de zaten
     gorunmuyor. Seviyeleri gercekten kademelendirince indirilen veri
     ciddi dusuyor, "yuklenmiyor" sikayetinin bir ayagi buydu.

     alan: 'yok' | 'park' (sadece buyuk parklar) | 'hepsi'
     su:   'buyuk' (goller/deniz) | 'hepsi' (dereler dahil)
     poi:  'temel' (benzinlik+sarj) | 'hepsi' */
  DETAY: {
    genis: {
      ad: 'Genis', karoZoom: 11, araziZoom: 11,
      yol: 'motorway|trunk|primary|motorway_link|trunk_link',
      bina: false, alan: 'yok', su: 'buyuk', poi: 'temel', parti: [2, 1]
    },
    bolge: {
      ad: 'Bolge', karoZoom: 12, araziZoom: 12,
      yol: 'motorway|trunk|primary|secondary|' +
           'motorway_link|trunk_link|primary_link',
      bina: false, alan: 'park', su: 'buyuk', poi: 'hepsi', parti: [2, 2]
    },
    ilce: {
      ad: 'Ilce', karoZoom: 13, araziZoom: 13,
      yol: 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|' +
           'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link',
      bina: false, alan: 'hepsi', su: 'hepsi', poi: 'hepsi', parti: [2, 2]
    },
    mahalle: {
      ad: 'Mahalle', karoZoom: 14, araziZoom: 14,
      yol: 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|' +
           'service|pedestrian|footway|path|steps|' +
           'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link',
      bina: true, alan: 'hepsi', su: 'hepsi', poi: 'hepsi', parti: [2, 2]
    }
  },

  /* Kurye isine yarayan duraklar. Anahtar = katman adi. */
  POI: {
    benzinlik: { etiket: 'amenity', deger: 'fuel',                     ad: 'Benzinlik',   renk: '#f59e0b', simge: 'B' },
    sarj:      { etiket: 'amenity', deger: 'charging_station',         ad: 'Sarj',        renk: '#34d399', simge: 'S' },
    yemek:     { etiket: 'amenity', deger: 'restaurant|fast_food',     ad: 'Restoran',    renk: '#f472b6', simge: 'R' },
    market:    { etiket: 'shop',    deger: 'supermarket|convenience',  ad: 'Market',      renk: '#a78bfa', simge: 'M' },
    eczane:    { etiket: 'amenity', deger: 'pharmacy',                 ad: 'Eczane',      renk: '#4ade80', simge: 'E' },
    hastane:   { etiket: 'amenity', deger: 'hospital|clinic',          ad: 'Hastane',     renk: '#f87171', simge: 'H' },
    otopark:   { etiket: 'amenity', deger: 'parking',                  ad: 'Otopark',     renk: '#94a3b8', simge: 'P' },
    banka:     { etiket: 'amenity', deger: 'bank|atm',                 ad: 'Banka/ATM',   renk: '#38bdf8', simge: 'A' }
  },

  /* Merkez + yaricaptan dikdortgen (bbox) hesapla: [guney,bati,kuzey,dogu] */
  kutuHesapla(lat, lon, yaricapMetre) {
    const dLat = yaricapMetre / 110574;
    const dLon = yaricapMetre / (111320 * Math.cos(lat * Math.PI / 180));
    return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
  },

  /* Kenardan kesilen yollar cikmaz sokak gibi gorunuyor; biraz fazla indiriyoruz.
     Kucuk alanda oran buyuk olmali, buyuk alanda gerek yok. */
  tampon(yaricapMetre) {
    return yaricapMetre <= 2000 ? 1.25 : 1.06;
  },

  /* Overpass sorgu metnini uret */
  sorguYaz(kutu, detayAdi, poiAcik) {
    const b = kutu.join(',');
    const d = this.DETAY[detayAdi] || this.DETAY.bolge;
    const s = ['[out:json][timeout:180];', '('];

    s.push('  way["highway"~"^(' + d.yol + ')$"](' + b + ');');
    if (d.bina) s.push('  way["building"](' + b + ');');

    // su ve kiyi — deniz/gol icin. Kiyi cizgisi her seviyede (ucuz, %1).
    s.push('  way["natural"="coastline"](' + b + ');');
    s.push('  way["natural"="water"](' + b + ');');
    if (d.su === 'hepsi') {
      s.push('  way["waterway"~"^(river|stream|canal)$"](' + b + ');');
    }

    // yesil alanlar
    if (d.alan === 'park') {
      s.push('  way["leisure"="park"](' + b + ');');
    } else if (d.alan === 'hepsi') {
      s.push('  way["leisure"~"^(park|garden|pitch|playground)$"](' + b + ');');
      s.push('  way["landuse"~"^(grass|forest|meadow|cemetery)$"](' + b + ');');
    }

    // duraklar (benzinlik vb.) — hem nokta hem alan olarak isaretlenmis olabilirler
    const TEMEL = { benzinlik: 1, sarj: 1 };
    const etiketler = {};
    for (const k of Object.keys(this.POI)) {
      if (poiAcik && !poiAcik[k]) continue;
      if (d.poi === 'temel' && !TEMEL[k]) continue;
      const p = this.POI[k];
      etiketler[p.etiket] = etiketler[p.etiket] ? etiketler[p.etiket] + '|' + p.deger : p.deger;
    }
    for (const et of Object.keys(etiketler)) {
      s.push('  node["' + et + '"~"^(' + etiketler[et] + ')$"](' + b + ');');
      s.push('  way["' + et + '"~"^(' + etiketler[et] + ')$"](' + b + ');');
    }

    s.push(');', 'out body geom;');
    return s.join('\n');
  },

  /* Tek bir karoyu indir. Karo sinirlari [guney,bati,kuzey,dogu].
     iptal: AbortSignal — kullanici baska yere kaydirinca istek iptal edilir. */
  async indirKutu(kutu, detayAdi, poiAcik) {
    const sorgu = this.sorguYaz(kutu, detayAdi, poiAcik);
    let sonHata = null;

    // Vekil varsa once o denenir: tarayici engelini tamamen atlatir.
    const vekil = await this.vekilBul();
    /* Vekil varsa SADECE o kullanilir. Vekil zaten kendi icinde bes aynayi
       sirayla deniyor; ustune bir de tarayicidan dogrudan aynaya dusmek yeni
       bir sans yaratmiyor — sadece Firefox tabanli tarayicilarda izleme
       korumasinin kestigi isteklerle konsolu dolduruyor. */
    // Vekil DOGRULANDIYSA sadece o. Varsayildiysa aynalar yedekte kalsin.
    const hedefler = vekil
      ? (this.vekilVarsayildi ? [vekil].concat(this.SUNUCULAR) : [vekil])
      : this.SUNUCULAR;

    for (let i = 0; i < hedefler.length; i++) {
      const sunucu = hedefler[i];
      // Sunucu hic cevap vermiyorsa sonsuza kadar bekleme; siradakine gec.
      const kesici = new AbortController();
      const saat = setTimeout(function () { kesici.abort(); }, this.ZAMAN_ASIMI_MS);
      try {
        const cevap = await fetch(sunucu, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(sorgu),
          signal: kesici.signal
        });
        clearTimeout(saat);
        if (cevap.status === 429) throw new Error('istek siniri asildi');
        if (cevap.status === 504) throw new Error('sunucu zaman asimi');
        if (!cevap.ok) throw new Error('HTTP ' + cevap.status);
        const json = await cevap.json();
        this.sadelestir(json);
        // Calisan aynayi basa al (vekil listede degil, o hep basta).
        const yeri = this.SUNUCULAR.indexOf(sunucu);
        if (yeri > 0) {
          this.SUNUCULAR.splice(yeri, 1);
          this.SUNUCULAR.unshift(sunucu);
        }
        return json;
      } catch (e) {
        clearTimeout(saat);
        const ad = sunucu.indexOf('http') === 0 ? new URL(sunucu).hostname : sunucu;
        sonHata = (e && e.name === 'AbortError')
          ? new Error('cevap vermedi (' + ad + ')')
          : e;
      }
    }
    throw sonHata || new Error('hicbir sunucuya ulasilamadi');
  },

  /* Cevabi kucult — kullanmadigimiz alanlari at.
     Beylikduzu+Buyukcekmece icin olculdu: 6.75 MB -> 3.95 MB.
       bounds : Overpass'in hazir sinir kutusu; biz kendimizinkini hesapliyoruz
       nodes  : sadece yol grafigi icin lazim; bina/su/park icin gereksiz
       koordinat: 6 haneye yuvarlama = ~11 cm, OSM hassasiyetinin cok altinda
     Onemi: kucuk hali tarayici hafizasina sigiyor, yani sayfa yenilenince
     harita tekrar indirilmiyor. */
  sadelestir(json) {
    const yuv = function (v) { return Math.round(v * 1e6) / 1e6; };
    for (const e of json.elements) {
      delete e.bounds;
      if (!(e.tags && e.tags.highway)) delete e.nodes;
      if (e.geometry) {
        for (const g of e.geometry) { if (g) { g.lat = yuv(g.lat); g.lon = yuv(g.lon); } }
      }
      if (e.lat !== undefined) { e.lat = yuv(e.lat); e.lon = yuv(e.lon); }
    }
    return json;
  },

  /* Isimle yer arama: "SushiCo Beylikduzu" -> koordinat listesi */
  async yerAra(metin) {
    const url = 'https://nominatim.openstreetmap.org/search' +
                '?q=' + encodeURIComponent(metin) +
                '&format=json&limit=8&addressdetails=1';
    const cevap = await fetch(url);
    if (!cevap.ok) throw new Error('Arama servisi cevap vermedi (HTTP ' + cevap.status + ')');
    const liste = await cevap.json();
    return liste.map(function (y) {
      return { ad: y.display_name, lat: parseFloat(y.lat), lon: parseFloat(y.lon) };
    });
  }
};


/* ============================================================
   Ham OSM JSON'unu cizilebilir katmanlara ayir
   Cikti: { yollar, binalar, alanlar, kiyi, poiler, merkez, kutu }
   ============================================================ */
const Ayristirici = {

  YOL_STILI: {
    motorway:      { en: 20,  hiz: 90, sinif: 'ana' },
    trunk:         { en: 17,  hiz: 80, sinif: 'ana' },
    primary:       { en: 13,  hiz: 60, sinif: 'ana' },
    secondary:     { en: 10,  hiz: 50, sinif: 'orta' },
    tertiary:      { en: 8.5, hiz: 40, sinif: 'orta' },
    residential:   { en: 7,   hiz: 30, sinif: 'kucuk' },
    unclassified:  { en: 7,   hiz: 30, sinif: 'kucuk' },
    living_street: { en: 6,   hiz: 20, sinif: 'kucuk' },
    service:       { en: 4.5, hiz: 20, sinif: 'servis' },
    pedestrian:    { en: 4,   hiz: 12, sinif: 'yaya' },
    footway:       { en: 2.5, hiz: 10, sinif: 'yaya' },
    path:          { en: 2.5, hiz: 10, sinif: 'yaya' },
    steps:         { en: 2,   hiz: 5,  sinif: 'yaya' }
  },

  stilBul(tur) {
    if (this.YOL_STILI[tur]) return this.YOL_STILI[tur];
    if (tur && tur.indexOf('_link') > 0) {
      const ana = this.stilBul(tur.replace('_link', ''));
      return { en: ana.en * 0.7, hiz: ana.hiz * 0.6, sinif: ana.sinif };
    }
    return { en: 5, hiz: 25, sinif: 'kucuk' };
  },

  binaYuksekligi(etiket) {
    if (etiket.height) {
      const h = parseFloat(etiket.height);
      if (!isNaN(h) && h > 0) return Math.min(h, 120);
    }
    if (etiket['building:levels']) {
      const k = parseFloat(etiket['building:levels']);
      if (!isNaN(k) && k > 0) return Math.min(k * 3.1 + 1.5, 120);
    }
    const t = etiket.building;
    if (t === 'garage' || t === 'shed' || t === 'hut' || t === 'roof') return 3;
    if (t === 'retail' || t === 'commercial' || t === 'industrial') return 8;
    return 13;
  },

  /* Bir elemanin hangi POI katmanina girdigini bul (yoksa null) */
  poiTuru(t) {
    for (const k of Object.keys(Overpass.POI)) {
      const p = Overpass.POI[k];
      const deger = t[p.etiket];
      if (!deger) continue;
      if (p.deger.split('|').indexOf(deger) >= 0) return k;
    }
    return null;
  },

  /* Ham OSM JSON -> cizilebilir sekiller.
     Projeksiyon merkezini DEGISTIRMEZ; Proj'un o anki merkezini kullanir.
     (Karolar bagimsiz inip ayni dunya koordinat sisteminde bulusmali.) */
  ayristir(osm, ilerleme) {
    const yollar = [], binalar = [], alanlar = [], kiyi = [], poiler = [];

    for (const e of osm.elements) {
      const t = e.tags || {};

      /* --- nokta seklindeki duraklar --- */
      if (e.type === 'node') {
        const tur = this.poiTuru(t);
        if (!tur) continue;
        const m = Proj.metreye(e.lat, e.lon);
        poiler.push({ id: e.id, tur: tur, ad: t.name || t.brand || '',
                      lat: e.lat, lon: e.lon, x: m.x, y: m.y, z: 0 });
        continue;
      }

      if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;

      const nokta = e.geometry.map(function (g) {
        const m = Proj.metreye(g.lat, g.lon);
        return { x: m.x, y: m.y, lat: g.lat, lon: g.lon, z: 0 };
      });

      /* --- alan seklindeki duraklar (benzinlik parseli gibi) --- */
      const poiTur = this.poiTuru(t);
      if (poiTur && !t.highway && !t.building) {
        let sx = 0, sy = 0, slat = 0, slon = 0;
        for (const p of nokta) { sx += p.x; sy += p.y; slat += p.lat; slon += p.lon; }
        const n = nokta.length;
        poiler.push({ id: e.id, tur: poiTur, ad: t.name || t.brand || '',
                      lat: slat / n, lon: slon / n, x: sx / n, y: sy / n, z: 0, alan: nokta });
        continue;
      }

      if (t.highway) {
        const st = this.stilBul(t.highway);
        yollar.push({
          id: e.id, nokta: nokta, dugum: e.nodes,
          tur: t.highway, ad: t.name || '',
          en: st.en, hiz: st.hiz, sinif: st.sinif,
          tekYon: (t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true'),
          tersYon: (t.oneway === '-1'),
          kopru: !!t.bridge, tunel: !!t.tunnel
        });
      } else if (t.building) {
        binalar.push({
          id: e.id, nokta: nokta,
          yukseklik: this.binaYuksekligi(t), taban: 0,
          ad: t.name || t['addr:housename'] || ''
        });
      } else if (t.natural === 'coastline') {
        kiyi.push({ id: e.id, nokta: nokta });
      } else {
        let tur = null;
        if (t.natural === 'water' || t.waterway) tur = 'su';
        else if (t.leisure === 'park' || t.leisure === 'garden' ||
                 t.landuse === 'grass' || t.landuse === 'meadow') tur = 'yesil';
        else if (t.landuse === 'forest') tur = 'orman';
        else if (t.leisure === 'pitch' || t.leisure === 'playground') tur = 'saha';
        else if (t.landuse === 'cemetery') tur = 'yesil';
        if (tur) alanlar.push({ id: e.id, nokta: nokta, tur: tur, cizgi: !!t.waterway });
      }
    }

    const poiSay = {};
    for (const p of poiler) poiSay[p.tur] = (poiSay[p.tur] || 0) + 1;

    ilerleme && ilerleme('Ayristirildi: ' + yollar.length + ' yol, ' + binalar.length +
      ' bina, ' + alanlar.length + ' alan, ' + kiyi.length + ' kiyi parcasi, ' +
      poiler.length + ' durak');

    return { yollar: yollar, binalar: binalar, alanlar: alanlar, kiyi: kiyi,
             poiler: poiler, poiSay: poiSay };
  }
};
