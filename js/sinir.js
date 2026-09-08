/* ============================================================
   sinir.js  —  Ilce sinirlari
   ------------------------------------------------------------
   "Yer sec" modunda ekrandaki ilceler ayri renklerle boyanir,
   birine tiklayinca touge aramasi O ILCENIN ICINDE calisir.

   ------------------------------------------------------------
   VERI: OSM'de idari sinirlar YOL degil ILISKI (relation).
   Turkiye'de admin_level 4 = il, 6 = ilce.

   Iliski, sinirini olusturan yollari "uye" olarak tasir; her uye
   ayri bir yay parcasidir ve SIRALI DEGILDIR. Kapali bir halka
   elde etmek icin uclari eslesen parcalari birlestirmek gerekiyor
   (bkz. halkaKur). Ilce sinirlari komsu ilcelerle ortak yollar
   kullandigi icin parcalar cogu zaman ters yonde geliyor —
   birlestirirken cevirmek sart.

   ------------------------------------------------------------
   NOKTA-POLIGON TESTI cografi koordinatta yapiliyor, metrede
   degil. Sebep: projeksiyon merkezi harita gezindikce tasiniyor
   (Proj.merkeziAyarla), metre koordinatlari o an ki merkeze gore.
   Sinir poligonu bir kere indirilip saklandigi icin merkez
   degisince metre degerleri bayatlardi. Enlem/boylam sabit.
   ============================================================ */

const Sinir = {

  ilceler: [],          // { ad, halkalar: [[{lat,lon}]], kutu, renk, merkez }
  secili: null,
  uzerinde: null,       // farenin uzerinde oldugu ilce
  aktif: false,
  yukleniyor: false,

  /* Ayirt edilebilir renkler. Komsu ilceler ayni rengi almasin diye
     ton adimi 360'in bolen olmayan bir sayisi (137.5, altin aci) —
     kac ilce olursa olsun ardisik olanlar birbirinden uzak dusuyor. */
  renkUret(i) {
    const ton = (i * 137.5) % 360;
    return {
      /* Dolgu %16'ydi ve 21 ilce yan yanayken hangisinin nerede
         bittigi secilmiyordu — kullanici Buyukcekmece sanip
         Esenyurt'a tikliyordu. Dolgu koyulastirildi, kenar
         kalinlastirildi, ustune gelince ve secilince ayri ayri
         belirginlesiyor. */
      dolgu:   'hsla(' + ton.toFixed(0) + ', 70%, 55%, 0.30)',
      uzerine: 'hsla(' + ton.toFixed(0) + ', 85%, 62%, 0.52)',
      secili:  'hsla(' + ton.toFixed(0) + ', 95%, 65%, 0.68)',
      cizgi:   'hsla(' + ton.toFixed(0) + ', 80%, 70%, 0.95)'
    };
  },

  /* ------------------------------------------------------------
     Uye yay parcalarini kapali halkalara dizmek
     ------------------------------------------------------------
     Parcalar sirasiz ve yonleri karisik geliyor. Bir halka
     kurarken: eldeki halkanin SON noktasina ucu degen bir parca
     ara, bulunca ekle (gerekirse ters cevirerek). Halkanin ilk
     noktasina donulunce halka kapanmis olur.

     Anahtar 6 ondaliga yuvarlaniyor (~11 cm): OSM'de ayni dugumu
     paylasan yollar birebir ayni koordinati verir, ama JSON'da
     kayan nokta gosterimi ara sira son basamakta oynuyor.
     ------------------------------------------------------------ */
  halkaKur(parcalar) {
    const an = (p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
    const kalan = parcalar.filter(g => g && g.length > 1);
    const halkalar = [];

    while (kalan.length) {
      let halka = kalan.shift().slice();
      let ilerledi = true;

      while (ilerledi && an(halka[0]) !== an(halka[halka.length - 1])) {
        ilerledi = false;
        const son = an(halka[halka.length - 1]);
        for (let i = 0; i < kalan.length; i++) {
          const g = kalan[i];
          if (an(g[0]) === son) {
            halka = halka.concat(g.slice(1));
            kalan.splice(i, 1); ilerledi = true; break;
          }
          if (an(g[g.length - 1]) === son) {
            halka = halka.concat(g.slice().reverse().slice(1));
            kalan.splice(i, 1); ilerledi = true; break;
          }
        }
      }
      /* Kapanmayan halka: sinirin bir parcasi ekranin disinda kalmis
         olabilir. 3 noktadan fazlaysa yine de kullaniliyor, cunku
         kapanmamis bir sinir bile ilceyi kabaca gosterir; nokta
         testinde ilk-son otomatik birlesmis sayilir. */
      if (halka.length > 3) halkalar.push(halka);
    }
    return halkalar;
  },

  kutuHesapla(halkalar) {
    let g = Infinity, b = Infinity, k = -Infinity, d = -Infinity;
    for (const h of halkalar) {
      for (const p of h) {
        if (p.lat < g) g = p.lat;
        if (p.lon < b) b = p.lon;
        if (p.lat > k) k = p.lat;
        if (p.lon > d) d = p.lon;
      }
    }
    return { g: g, b: b, k: k, d: d };
  },

  /* Isin atma (ray casting). Halkalarin hepsi "dis" sayiliyor;
     ic halkalar (goller, enklavlar) ilce sinirlarinda pratikte yok. */
  icinde(ilce, lat, lon) {
    const kt = ilce.kutu;
    if (lat < kt.g || lat > kt.k || lon < kt.b || lon > kt.d) return false;
    let ic = false;
    for (const h of ilce.halkalar) {
      for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
        const yi = h[i].lat, xi = h[i].lon;
        const yj = h[j].lat, xj = h[j].lon;
        if (((yi > lat) !== (yj > lat)) &&
            (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ic = !ic;
      }
    }
    return ic;
  },

  /* ------------------------------------------------------------
     Ekrandaki bolgenin ilcelerini indir
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     KUTUYU IZGARAYA OTURT
     ------------------------------------------------------------
     Onbellek sorgu METNININ ozetine gore calisiyor. Kutu ekrandaki
     gorunume gore hesaplanirsa her acilista birkac ondalik basamak
     kayiyor, sorgu metni degisiyor ve onbellek HIC tutmuyor.

     Olculdu (8 Eylul 2026, Istanbul Anadolu):
       ayni kutu ikinci kez     ->   80 ms  (onbellekten)
       kutu ~1 km kaymis        -> 7879 ms  (yeniden iniyor)
       soguk                    -> 8084 ms

     Kutu 0.1 derecelik (~11 km) izgaraya disari dogru oturtuluyor:
     kullanici biraz gezinse de ayni sorgu cikiyor ve ikinci acilis
     8 saniye yerine 0.08 saniye suruyor. Bedeli biraz daha genis
     alan inmesi — sorgu suresi alanla dogru orantili olmadigi icin
     bu neredeyse bedava.
     ------------------------------------------------------------ */
  IZGARA: 0.1,

  kutuyuOturt(kutu) {
    const a = this.IZGARA;
    const asagi = (v) => Math.floor(v / a) * a;
    const yukari = (v) => Math.ceil(v / a) * a;
    return [
      +asagi(kutu[0]).toFixed(4), +asagi(kutu[1]).toFixed(4),
      +yukari(kutu[2]).toFixed(4), +yukari(kutu[3]).toFixed(4)
    ];
  },

  async indir(hamKutu) {
    const kutu = this.kutuyuOturt(hamKutu);
    const b = kutu.join(',');
    /* out geom: uye yollarin noktalarini da getirir. Bunsuz sadece
       uye id'leri gelir ve ikinci bir sorgu gerekirdi. */
    const sorgu = '[out:json][timeout:180];' +
                  'rel["boundary"="administrative"]["admin_level"="6"](' + b + ');' +
                  'out geom;';
    const ham = await Overpass.indirKutu(kutu, 'genis', null, sorgu);

    const liste = [];
    for (const e of (ham.elements || [])) {
      if (e.type !== 'relation' || !e.members) continue;
      const ad = (e.tags && (e.tags['name:tr'] || e.tags.name)) || '(isimsiz ilce)';
      const parcalar = [];
      for (const m of e.members) {
        /* Rol bos ya da "outer" olan uyeler sinirin kendisi;
           "admin_centre" / "label" bir DUGUM, geometrisi yok. */
        if (m.type !== 'way') continue;
        if (m.role && m.role !== 'outer') continue;
        if (m.geometry && m.geometry.length > 1) parcalar.push(m.geometry);
      }
      if (!parcalar.length) continue;
      const halkalar = this.halkaKur(parcalar);
      if (!halkalar.length) continue;

      const kt = this.kutuHesapla(halkalar);
      liste.push({
        id: e.id, ad: ad, halkalar: halkalar, kutu: kt,
        merkez: { lat: (kt.g + kt.k) / 2, lon: (kt.b + kt.d) / 2 }
      });
    }

    /* Ada gore sirala ki renkler her acilista ayni ilceye dussun;
       sorgu sirasina birakilirsa ilce renkleri her taramada
       degisiyor ve kullanici hangisinin hangisi oldugunu sasiriyor. */
    liste.sort((x, y) => x.ad.localeCompare(y.ad, 'tr'));
    liste.forEach((o, i) => { o.renk = this.renkUret(i); });

    this.ilceler = liste;
    return liste;
  },

  /* ------------------------------------------------------------
     Bir dikdortgen ilceye degiyor mu?
     ------------------------------------------------------------
     Ilcenin KUTUSU ilcenin kendisinden cok daha buyuk olabiliyor:
     Buyukcekmece kiyi boyunca uzuyor, kutusunun buyuk kismi deniz
     ve komsu ilce. O kutuyu bloklara bolup hepsini indirmek hem
     yavas hem gereksiz (olculdu: 42 blok gerekiyordu).

     Kesisim testi uc soruyla: (a) kutunun kosesi ya da ortasi ilce
     icinde mi, (b) ilcenin herhangi bir sinir noktasi kutu icinde
     mi. Ucuncu durum — kutu tamamen ilcenin ortasinda ve hicbir
     sinir noktasi icinde degil — (a) ile zaten yakalaniyor.
     ------------------------------------------------------------ */
  kutuyaDeger(ilce, kt) {
    const i = ilce.kutu;
    if (kt.k < i.g || kt.g > i.k || kt.d < i.b || kt.b > i.d) return false;

    const noktalar = [
      [kt.g, kt.b], [kt.g, kt.d], [kt.k, kt.b], [kt.k, kt.d],
      [(kt.g + kt.k) / 2, (kt.b + kt.d) / 2]
    ];
    for (const [la, lo] of noktalar) if (this.icinde(ilce, la, lo)) return true;

    for (const h of ilce.halkalar) {
      for (const p of h) {
        if (p.lat >= kt.g && p.lat <= kt.k && p.lon >= kt.b && p.lon <= kt.d) return true;
      }
    }
    return false;
  },

  /* ------------------------------------------------------------
     CIZIM ICIN HAZIRLIK — kare basina 33 ms'ten kurtulmak
     ------------------------------------------------------------
     Olculdu (8 Eylul 2026, 26 ilce / 26732 sinir noktasi):
     ilcelerCiz kare basina 33.2 ms yiyordu ve her karede
     Arazi.latLonYukseklik'i 26758 kez cagiriyordu — nokta basina
     bir kez. 60 fps butcesi 16.7 ms, yani tek basina butceyi
     ikiye katliyordu.

     Iki sebep vardi:
       1. Seyreltme ornekten SONRA yapiliyordu: pahali yukseklik
          ornegi alinip sonra "bu nokta zaten yakin" diye atiliyordu.
       2. Yukseklik her karede yeniden orneleniyordu, oysa arazi
          verisi kare kare degismiyor.

     Cozum: halkalar bir kez seyreltilip yukseklikleri saklaniyor.
     Karede sadece yansitma kaliyor. Arazi verisi degisince
     (Arazi.surum artinca) yukseklikler bir kez tazeleniyor.

     Seyreltme COGRAFI: ardisik noktalar 35 m'den yakinsa atiliyor.
     Ilce sinirlari 10-30 km genisliginde, 35 m ekranda bir pikselin
     altinda kaliyor.
     ------------------------------------------------------------ */
  SEYRELT_METRE: 35,

  cizimeHazirla(ilce) {
    const s = this.SEYRELT_METRE;
    /* Enlem derecesi ~111 km; boylam cos(enlem) ile kisaliyor. */
    const dLat = s / 111132;
    const dLon = s / (111320 * Math.cos(ilce.merkez.lat * Math.PI / 180) || 1);

    ilce.cizim = ilce.halkalar.map((h) => {
      const c = [];
      let ox = null, oy = null;
      for (let i = 0; i < h.length; i++) {
        const p = h[i];
        /* Son nokta HER ZAMAN kaliyor, yoksa halka kapanmaz. */
        if (i > 0 && i < h.length - 1 &&
            Math.abs(p.lat - oy) < dLat && Math.abs(p.lon - ox) < dLon) continue;
        c.push({ lat: p.lat, lon: p.lon, z: 0 });
        ox = p.lon; oy = p.lat;
      }
      return c;
    });
    ilce.araziSurum = -1;
    return ilce.cizim;
  },

  /* Yukseklikleri tazele — sadece arazi verisi degisince. */
  yukseklikTazele(ilce) {
    if (!ilce.cizim) this.cizimeHazirla(ilce);
    if (ilce.araziSurum === Arazi.surum) return;
    ilce.araziSurum = Arazi.surum;
    for (const h of ilce.cizim) {
      for (const p of h) p.z = Arazi.latLonYukseklik(p.lat, p.lon);
    }
  },

  /* Tiklanan cografi noktanin hangi ilceye dustugu */
  noktadakiIlce(lat, lon) {
    for (const o of this.ilceler) if (this.icinde(o, lat, lon)) return o;
    return null;
  },

  temizle() { this.ilceler = []; this.secili = null; this.uzerinde = null; this.aktif = false; }
};
