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
  aktif: false,
  yukleniyor: false,

  /* Ayirt edilebilir renkler. Komsu ilceler ayni rengi almasin diye
     ton adimi 360'in bolen olmayan bir sayisi (137.5, altin aci) —
     kac ilce olursa olsun ardisik olanlar birbirinden uzak dusuyor. */
  renkUret(i) {
    const ton = (i * 137.5) % 360;
    return {
      dolgu: 'hsla(' + ton.toFixed(0) + ', 65%, 55%, 0.16)',
      cizgi: 'hsla(' + ton.toFixed(0) + ', 75%, 62%, 0.85)',
      secili: 'hsla(' + ton.toFixed(0) + ', 80%, 60%, 0.34)'
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
  async indir(kutu) {
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

  /* Tiklanan cografi noktanin hangi ilceye dustugu */
  noktadakiIlce(lat, lon) {
    for (const o of this.ilceler) if (this.icinde(o, lat, lon)) return o;
    return null;
  },

  temizle() { this.ilceler = []; this.secili = null; this.aktif = false; }
};
