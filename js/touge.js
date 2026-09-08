/* ============================================================
   touge.js  —  Surulecek yol bulucu
   ------------------------------------------------------------
   "Touge" Japonca dag gecidi demek ama burada aranan sey dag
   DEGIL — kullanicinin verdigi yon: "dag gecidi degil, direk
   sehrin icinde kivrimli yol da olur, veya iste sahil yolu gibi".
   Yani rakim bonus, sart degil. Aranan iki sey var:

     VIRAJLI  — cok donen yol (sehir ici de olur)
     DUZ      — uzun, dumduz, onunu gorebildigin yol

   Ikisinin de ortak sarti NIS olmasi: dusuk trafik, az kavsak,
   kenarinda ev olmamasi. Ana arter ne kadar kivrimli olursa
   olsun touge degildir. Su kenarindan gecmek ayrica arti puan —
   sahil yolu duz olsa bile surulecek yoldur.

   ------------------------------------------------------------
   NASIL CALISIYOR

   1) ZINCIRLEME. OSM'de tek bir yol onlarca ayri parcaya
      bolunmus olabilir (koprude boluyor, isim degisince boluyor,
      karo kenarinda boluyor). Parca parca bakmak yaniltir:
      400 m'lik bir parca "dumduz" gorunur ama bagli oldugu yol
      kivrimlidir. O yuzden once uc uca gelen ve ayni yola ait
      parcalar tek zincir yapiliyor.

   2) YENIDEN ORNEKLEME. Donus acisi ham OSM noktalarindan
      hesaplanamaz: bazi yollarda nokta her 3 m'de bir, bazisinda
      her 80 m'de bir. Sik noktali yolda kucuk olcum gurultusu
      sahte viraj uretiyor. Zincir once ORNEK_ARALIK metrede bir
      yeniden ornekleniyor, acilar ondan sonra olculuyor.

   3) PUANLAMA. Her zincire iki ayri puan veriliyor (virajli ve
      duz), bilesenleriyle birlikte saklaniyor. Panelde neden o
      yolun secildigi gorunsun diye bilesenler duruyor.
   ============================================================ */

const Touge = {

  ORNEK_ARALIK: 25,        // metre — aci olcumu icin yeniden ornekleme
  ENAZ_UZUNLUK_VIRAJ: 700,
  ENAZ_UZUNLUK_DUZ: 1200,
  BINA_YARICAP: 70,        // metre — bina aramasinin ust siniri
  /* Bina kosesi bu kadar yakinsa yol bina dibinden geciyor demek.
     12 m: iki sira bina arasindaki tipik sokak genisligi kaldirimla
     birlikte 8-14 m; acik yolda en yakin bina 25 m+ oteye duser. */
  DAR_ESIK: 12,
  /* Yolun bu kadari bina dibindense DAR SOKAK sayilip eleniyor. */
  ENCOK_DARLIK: 0.40,
  /* OSM'de acikca yazan genislik bunun altindaysa dogrudan eleniyor. */
  ENAZ_GENISLIK: 4.5,
  SU_YARICAP: 180,         // metre — bu kadar yakinsa "sahil yolu"
  /* Kus ucusuna oran bunu asarsa yol baslangicina donuyor demektir:
     site ici halka, kavsak dongusu, cikmaz. Surulecek yol degil.
     Olculdu: Buyukcekmece'de kivrim 28.47 cikan "yol" 800 m gidip
     28 m otede bitiyordu. */
  ENCOK_KIVRIM: 3.2,
  ENAZ_KUS_UCUSU: 300,     // metre — bu kadar bile ilerlemiyorsa tur degil
  /* "Duz" demek icin sert esikler. Olculdu: gercek duz yol 17-73
     derece/km, kivrim 1.00-1.02. Bunlarin ustu duz degil. */
  ENCOK_DUZ_DONUS: 110,
  ENCOK_DUZ_KIVRIM: 1.10,

  /* Yol sinifina gore trafik carpani. 1 = issiz, 0 = kalabalik.
     Turkiye'de tertiary ve unclassified tipik ilceler arasi yol. */
  TRAFIK: {
    motorway: 0.02, trunk: 0.05, primary: 0.2, secondary: 0.55,
    tertiary: 0.9, unclassified: 1.0, residential: 0.3,
    living_street: 0.1, track: 0.4, service: 0.15
  },

  /* ------------------------------------------------------------
     MAHALLE SOKAKLARI
     ------------------------------------------------------------
     Kullanici: "evlerin arasinda sokak arasi, ortaya coluk cocuk
     firlicak yerler gosteriyo".

     OSM'de `residential` sinifinin TANIMI zaten "yerlesim icindeki
     yol", `living_street` ise "yayanin oncelikli oldugu, cocugun
     oynadigi sokak". Yani sikayet dogrudan bu iki sinif.

     Olculdu (Sile 4 km): 1138 yolun 936'si residential, 13'u
     living_street. Bu yuzden sonuc listesi bunlarla doluyordu.

     Varsayilan olarak ikisi de eleniyor. Panelde kutucuk var:
     sehir icindeki kivrimli sokaklari gormek isteyen acabiliyor
     (kullanicinin daha onceki istegi "sehrin icinde kivrimli yol
     da olur" bu kutucukla karsilaniyor).
     ------------------------------------------------------------ */
  MAHALLE_SINIFI: { residential: 1, living_street: 1 },

  /* ------------------------------------------------------------
     YUZEY VE ERISIM
     ------------------------------------------------------------
     "camur, asfalt olmayan" ve "kapali" yollari elemek icin.

     ONEMLI SINIR: bu etiketler Turkiye'de neredeyse hic girilmemis.
     Olculdu (Sile 4 km, 1138 yol): surface 21 yolda var (hepsi
     asphalt), access 1 yolda, barrier ve tracktype hic yok. Yani
     bu filtre burada nadiren devreye giriyor — camurlu yolu
     ELEYEMIYORUZ, cunku camurlu oldugu veride yazmiyor.

     Yine de var olan bilgiyi kullanmamak sacma; etiketi olan yol
     eleniyor, olmayan "bilinmiyor" sayilip gecirilıyor. Asil
     koruma sinif elemesi ve yol yogunlugu.
     ------------------------------------------------------------ */
  KOTU_YUZEY: {
    unpaved: 1, gravel: 1, fine_gravel: 1, dirt: 1, earth: 1, ground: 1,
    mud: 1, sand: 1, grass: 1, pebblestone: 1, woodchips: 1, compacted: 1
  },
  KAPALI_ERISIM: { private: 1, no: 1, customers: 1, permit: 1, delivery: 1, agricultural: 1, forestry: 1 },

  /* Yol surulebilir mi? Donen: null (sorun yok) ya da eleme sebebi */
  eleSebebi(y, mahalleDahil) {
    if (!mahalleDahil && this.MAHALLE_SINIFI[y.tur]) return 'mahalle';
    if (y.tur === 'track') return 'toprak';
    if (y.yuzey && this.KOTU_YUZEY[y.yuzey]) return 'yuzey';
    if (y.izTuru && y.izTuru !== 'grade1') return 'yuzey';
    if (y.erisim && this.KAPALI_ERISIM[y.erisim]) return 'kapali';
    if (y.motorlu && this.KAPALI_ERISIM[y.motorlu]) return 'kapali';
    if (y.motorlu === 'no') return 'kapali';
    if (y.bariyer && y.bariyer !== 'no') return 'kapali';
    return null;
  },

  sonuc: [],
  secili: null,

  trafikCarpani(tur) {
    if (this.TRAFIK[tur] !== undefined) return this.TRAFIK[tur];
    if (tur && tur.indexOf('_link') > 0) return 0.1;   // baglanti rampalari
    return 0.6;
  },

  /* ------------------------------------------------------------
     1) Yuklu butun karolardan yollari topla (tekilleyerek)
     ------------------------------------------------------------ */
  yollariTopla() {
    const gorulen = new Set();
    const liste = [];
    for (const k of Karolar.depo.values()) {
      if (!k.blok || !k.blok.sekil) continue;
      for (const y of k.blok.sekil.yollar) {
        if (gorulen.has(y.id)) continue;
        gorulen.add(y.id);
        /* Yaya yollari ve merdivenler arabayla surulmuyor.
           Service (otopark ici, arka bahce) de yol sayilmaz. */
        if (y.sinif === 'yaya' || y.tur === 'service') continue;
        if (!y.nokta || y.nokta.length < 2 || !y.dugum) continue;
        liste.push(y);
      }
    }
    return liste;
  },

  /* Bina KOSE noktalari, merkezleri degil.
     Dar sokakta duvar 3 m otededir ama binanin merkezi 20 m otede
     olabilir; merkeze bakan olcum dar sokagi genis sanir. Kullanici
     "binalarin aralarini, dar sokaklari ele" dedi — ele almak icin
     once dogru mesafeyi olcmek gerekiyor. */
  binalariTopla() {
    const gorulen = new Set();
    const kose = [], merkez = [];
    for (const k of Karolar.depo.values()) {
      if (!k.blok || !k.blok.sekil) continue;
      for (const b of k.blok.sekil.binalar) {
        if (gorulen.has(b.id)) continue;
        gorulen.add(b.id);
        if (!b.nokta || !b.nokta.length) continue;
        let sx = 0, sy = 0;
        for (const p of b.nokta) { kose.push({ x: p.x, y: p.y }); sx += p.x; sy += p.y; }
        /* Merkezler AYRI toplaniyor: yogunluk sayarken kose degil BINA
           saymak lazim, yoksa cok kosesi olan bir bina on ev sayilir. */
        merkez.push({ x: sx / b.nokta.length, y: sy / b.nokta.length });
      }
    }
    return { kose: kose, merkez: merkez };
  },

  /* ------------------------------------------------------------
     IZBELIK — "toplumdan ne kadar uzak"
     ------------------------------------------------------------
     En yakin binaya mesafe bu isi goremiyor: arama 70 m'de kesiliyor,
     yani 70 m otede tek bir kulube olan yol ile 5 km icinde hicbir sey
     olmayan yol ayni puani aliyor. Kullanicinin istegi tam bunun
     tersi: "toplumdan ne kadar uzaksa o kadar puan".

     Cozum: kaba bir YOGUNLUK izgarasi. 200 m'lik hucrelere bina
     sayilari onceden yaziliyor; bir yol noktasi icin 3x3 hucre
     toplaniyor (600x600 m = 0.36 km2). Boylece genis alana tek
     bakista bakiliyor, her nokta icin yuzlerce binayi taramadan.
     ------------------------------------------------------------ */
  IZBE_HUCRE: 200,
  /* Yumusak azalma, sert kesme degil: sert kesmede butun sehir ici
     0 olup birbirinden ayirt edilemez hale geliyordu.
     0 bina/km2 -> 1.00,  150 -> 0.50,  450 -> 0.25,  1500 -> 0.09 */
  IZBE_YARI: 150,

  izbeIzgarasi(merkezler) {
    const H = this.IZBE_HUCRE, g = new Map();
    for (const m of merkezler) {
      const a = Math.floor(m.x / H) + ',' + Math.floor(m.y / H);
      g.set(a, (g.get(a) || 0) + 1);
    }
    return g;
  },

  /* ------------------------------------------------------------
     YOL YOGUNLUGU — izbeligin asil olcusu
     ------------------------------------------------------------
     Bina yogunlugu tek basina yaniltiyor: Turkiye'de kirsal
     yerlesimlerin binalari OSM'e buyuk olcude girilmemis. Olculdu
     (8 Eylul 2026, Sile 4 km): 1138 yolun hepsinde "70 m icinde
     bina yok" cikiyordu — bina OLMADIGI icin degil, bina VERISI
     olmadigi icin. Bu, projedeki eski "yukseklik yoksa 0 donme"
     tuzaginin aynisi: verinin yoklugunu "bos arazi" diye okumak.

     Yollar ise her zaman haritada. Bir koy sokagi baska sokaklarin
     arasindadir; kir yolunun cevresinde yol yoktur. Kilometrekareye
     dusen YOL UZUNLUGU bu ikisini ayiriyor ve bina verisine hic
     bagli degil.
     ------------------------------------------------------------ */
  yolIzgarasi(yollar) {
    const H = this.IZBE_HUCRE, g = new Map();
    for (const y of yollar) {
      const n = y.nokta;
      for (let i = 1; i < n.length; i++) {
        const a = n[i - 1], b = n[i];
        const u = Math.hypot(b.x - a.x, b.y - a.y);
        if (!u) continue;
        /* Parcayi ortasindaki hucreye yaz. Hucre 200 m, yol parcalari
           genelde daha kisa; uzun parcalari bolmek gereksiz hassasiyet. */
        const k = Math.floor((a.x + b.x) / 2 / H) + ',' + Math.floor((a.y + b.y) / 2 / H);
        g.set(k, (g.get(k) || 0) + u);
      }
    }
    return g;
  },

  /* Nokta cevresindeki yol yogunlugu (km yol / km2) */
  yolYogunlugu(g, x, y) {
    const H = this.IZBE_HUCRE;
    const i = Math.floor(x / H), j = Math.floor(y / H);
    let m = 0;
    for (let a = i - 1; a <= i + 1; a++) {
      for (let b = j - 1; b <= j + 1; b++) m += (g.get(a + ',' + b) || 0);
    }
    const km2 = (3 * H) * (3 * H) / 1e6;
    return (m / 1000) / km2;
  },

  /* Nokta cevresindeki bina yogunlugu (bina / km2) */
  yogunluk(g, x, y) {
    const H = this.IZBE_HUCRE;
    const i = Math.floor(x / H), j = Math.floor(y / H);
    let n = 0;
    for (let a = i - 1; a <= i + 1; a++) {
      for (let b = j - 1; b <= j + 1; b++) n += (g.get(a + ',' + b) || 0);
    }
    const km2 = (3 * H) * (3 * H) / 1e6;
    return n / km2;
  },

  /* Noktalari hucrelere at: her ornek nokta icin butun binalari
     taramak yerine birkac hucreye bakmak yetiyor. 50 m hucre, cunku
     sorulan yaricap 12-70 m arasi. */
  binaIzgarasi(merkezler) {
    const H = 50, g = new Map();
    for (const m of merkezler) {
      const a = Math.floor(m.x / H) + ',' + Math.floor(m.y / H);
      let d = g.get(a);
      if (!d) { d = []; g.set(a, d); }
      d.push(m);
    }
    return { H: H, g: g };
  },

  /* Kiyi cizgisi + su alanlarinin noktalari. Sahil yolunu bulmak
     icin: yolun ne kadari suya yakin geciyor. */
  sulariTopla() {
    const gorulen = new Set();
    const nokta = [];
    for (const k of Karolar.depo.values()) {
      if (!k.blok || !k.blok.sekil) continue;
      const s = k.blok.sekil;
      for (const c of s.kiyi) {
        if (gorulen.has('k' + c.id)) continue;
        gorulen.add('k' + c.id);
        for (const p of c.nokta) nokta.push(p);
      }
      for (const a of s.alanlar) {
        if (a.tur !== 'su' || gorulen.has('a' + a.id)) continue;
        gorulen.add('a' + a.id);
        for (const p of a.nokta) nokta.push(p);
      }
    }
    return nokta;
  },

  /* Su noktalari icin de ayni izgara; sadece "var mi yok mu"
     sorduğumuz icin sayim degil ilk bulusta cikiyor. */
  suSay(izgara, x, y, yaricap) {
    const H = izgara.H;
    const i0 = Math.floor((x - yaricap) / H), i1 = Math.floor((x + yaricap) / H);
    const j0 = Math.floor((y - yaricap) / H), j1 = Math.floor((y + yaricap) / H);
    const r2 = yaricap * yaricap;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const d = izgara.g.get(i + ',' + j);
        if (!d) continue;
        for (const m of d) {
          const dx = m.x - x, dy = m.y - y;
          if (dx * dx + dy * dy <= r2) return true;
        }
      }
    }
    return false;
  },

  /* En yakin bina kosesine uzaklik. Bulunamazsa `enCok` donuyor —
     "cok uzakta" ile "hic yok" ayni sey sayiliyor, dogrusu bu. */
  binaMesafesi(izgara, x, y, enCok) {
    const H = izgara.H;
    const i0 = Math.floor((x - enCok) / H), i1 = Math.floor((x + enCok) / H);
    const j0 = Math.floor((y - enCok) / H), j1 = Math.floor((y + enCok) / H);
    let en2 = enCok * enCok;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const d = izgara.g.get(i + ',' + j);
        if (!d) continue;
        for (const m of d) {
          const dx = m.x - x, dy = m.y - y;
          const u = dx * dx + dy * dy;
          if (u < en2) en2 = u;
        }
      }
    }
    return Math.sqrt(en2);
  },

  /* ------------------------------------------------------------
     2) ZINCIRLEME
     Uc uca gelen ve ayni yola ait parcalari birlestir.
     "Ayni yol" = ismi varsa ismi ayni, yoksa turu ayni.
     Ek olarak kavsak noktasinda BIRDEN COK aday varsa
     birlestirme yapilmiyor: hangi kola devam edecegi belirsiz.
     ------------------------------------------------------------ */
  zincirle(yollar, mahalleDahil) {
    const uc = new Map();            // dugum id -> o dugumde biten yollar
    const ekle = (nid, y) => {
      let d = uc.get(nid);
      if (!d) { d = []; uc.set(nid, d); }
      d.push(y);
    };
    for (const y of yollar) {
      ekle(y.dugum[0], y);
      ekle(y.dugum[y.dugum.length - 1], y);
    }

    const ayniYol = (a, b) => {
      if (a.ad && b.ad) return a.ad === b.ad;
      if (a.ad || b.ad) return false;      // biri isimli biri degil: ayri yol
      return a.tur === b.tur;
    };

    /* Bir ucta devam eden TEK aday varsa onu dondur. */
    const devam = (y, nid, kullanilan) => {
      const adaylar = (uc.get(nid) || []).filter(
        (o) => o !== y && !kullanilan.has(o.id) && ayniYol(y, o));
      /* Kavsakta iki farkli devam varsa hangisi oldugu belirsiz:
         birlestirme, cunku yanlis kolu eklemek zinciri uydurur. */
      return adaylar.length === 1 ? adaylar[0] : null;
    };

    const kullanilan = new Set();
    const zincirler = [];

    for (const bas of yollar) {
      if (kullanilan.has(bas.id)) continue;
      kullanilan.add(bas.id);

      let dugum = bas.dugum.slice();
      let nokta = bas.nokta.slice();
      const parcalar = [bas];

      // ileri uc
      for (;;) {
        const son = dugum[dugum.length - 1];
        const o = devam(parcalar[parcalar.length - 1], son, kullanilan);
        if (!o) break;
        kullanilan.add(o.id);
        parcalar.push(o);
        if (o.dugum[0] === son) {
          dugum = dugum.concat(o.dugum.slice(1));
          nokta = nokta.concat(o.nokta.slice(1));
        } else {
          dugum = dugum.concat(o.dugum.slice().reverse().slice(1));
          nokta = nokta.concat(o.nokta.slice().reverse().slice(1));
        }
      }
      // geri uc
      for (;;) {
        const bs = dugum[0];
        const o = devam(parcalar[0], bs, kullanilan);
        if (!o) break;
        kullanilan.add(o.id);
        parcalar.unshift(o);
        if (o.dugum[o.dugum.length - 1] === bs) {
          dugum = o.dugum.slice(0, -1).concat(dugum);
          nokta = o.nokta.slice(0, -1).concat(nokta);
        } else {
          const td = o.dugum.slice().reverse(), tn = o.nokta.slice().reverse();
          dugum = td.slice(0, -1).concat(dugum);
          nokta = tn.slice(0, -1).concat(nokta);
        }
      }

      /* Zincirin genisligi EN DAR parcasi kadardir: yolun bir yeri
         3 m ise oradan gecmek zorundasin. Etiketi olmayan parcalar
         hesaba katilmiyor (null), hepsi etiketsizse sonuc da null. */
      let genislik = null, serit = null;
      for (const p of parcalar) {
        if (p.genislik != null) genislik = (genislik == null) ? p.genislik : Math.min(genislik, p.genislik);
        if (p.serit != null) serit = (serit == null) ? p.serit : Math.min(serit, p.serit);
      }

      /* Zincirin HERHANGI bir parcasi surulemezse zincir surulemez:
         yolun 200 m'si ozel mulkse ya da toprakas o yoldan gecemezsin.
         Ilk bulunan sebep saklaniyor, sayimda o gorunsun diye. */
      let sorun = null;
      for (const p of parcalar) {
        const s = this.eleSebebi(p, mahalleDahil);
        if (s) { sorun = s; break; }
      }

      zincirler.push({
        ad: bas.ad, tur: bas.tur, sinif: bas.sinif, sorun: sorun,
        genislik: genislik, serit: serit,
        parca: parcalar.length, dugum: dugum, nokta: nokta
      });
    }
    return zincirler;
  },

  /* ------------------------------------------------------------
     3) OLCUM
     ------------------------------------------------------------ */
  yenidenOrnekle(nokta, aralik) {
    const cikti = [nokta[0]];
    let birikim = 0;
    for (let i = 1; i < nokta.length; i++) {
      const a = nokta[i - 1], b = nokta[i];
      let d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d === 0) continue;
      let t = 0;
      while (birikim + d - t >= aralik) {
        t += aralik - birikim;
        birikim = 0;
        const o = t / d;
        cikti.push({ x: a.x + (b.x - a.x) * o, y: a.y + (b.y - a.y) * o,
                     lat: a.lat + (b.lat - a.lat) * o, lon: a.lon + (b.lon - a.lon) * o });
      }
      birikim += d - t;
    }
    const son = nokta[nokta.length - 1];
    const sonC = cikti[cikti.length - 1];
    if (Math.hypot(son.x - sonC.x, son.y - sonC.y) > 1) cikti.push(son);
    return cikti;
  },

  olc(z, izgara, kavsakMi, rakimVar) {
    const n = z.nokta;
    let uzunluk = 0;
    for (let i = 1; i < n.length; i++) uzunluk += Math.hypot(n[i].x - n[i - 1].x, n[i].y - n[i - 1].y);
    if (uzunluk < 200) return null;

    const kusUcusu = Math.hypot(n[n.length - 1].x - n[0].x, n[n.length - 1].y - n[0].y);
    const kivrim = uzunluk / Math.max(kusUcusu, 1);

    const o = this.yenidenOrnekle(n, this.ORNEK_ARALIK);

    /* Donus: ardisik iki parca arasindaki yon farkinin toplami.
       Bir tam donus 360 derece; km basina normalize ediliyor ki
       uzun yol otomatik "daha virajli" cikmasin. */
    let donus = 0;
    for (let i = 2; i < o.length; i++) {
      const a1 = Math.atan2(o[i - 1].y - o[i - 2].y, o[i - 1].x - o[i - 2].x);
      const a2 = Math.atan2(o[i].y - o[i - 1].y, o[i].x - o[i - 1].x);
      let f = a2 - a1;
      while (f > Math.PI) f -= 2 * Math.PI;
      while (f < -Math.PI) f += 2 * Math.PI;
      donus += Math.abs(f);
    }
    const donusPerKm = (donus * 180 / Math.PI) / (uzunluk / 1000);

    /* Rakim. Arazi kapaliysa ya da veri inmemisse latLonYukseklik
       0 donuyor — bunu "duz arazi" saymak yanlis olur, bilinmiyor
       sayiliyor ve puanda rakim terimi devre disi kaliyor. */
    let rakimAralik = 0, rakimKazanc = 0;
    if (rakimVar) {
      let enAz = Infinity, enCok = -Infinity, once = null;
      for (const p of o) {
        const h = Arazi.latLonYukseklik(p.lat, p.lon);
        if (h < enAz) enAz = h;
        if (h > enCok) enCok = h;
        if (once !== null && h > once) rakimKazanc += h - once;
        once = h;
      }
      rakimAralik = enCok - enAz;
    }

    /* Kavsak yogunlugu: ic dugumlerin kaci gercek kavsak.
       Cok kavsak = surekli durup kalkmak. */
    let kavsak = 0;
    for (let i = 1; i < z.dugum.length - 1; i++) if (kavsakMi(z.dugum[i])) kavsak++;
    const kavsakPerKm = kavsak / (uzunluk / 1000);

    /* Manzara: yolun ne kadari suya (kiyi, gol, dere) yakin geciyor.
       Sahil yolu virajli olmasa bile surulecek yoldur — kullanicinin
       kendi ornegi. Deniz kenarindaki duz sahil yolu bu terimle
       yukari cikiyor. */
    let suYakin = 0;
    if (this.suIzgara) {
      for (const p of o) if (this.suSay(this.suIzgara, p.x, p.y, this.SU_YARICAP)) suYakin++;
    }
    const manzara = o.length ? suYakin / o.length : 0;

    /* Kenarinda ev var mi — iki ayri sey olculuyor:
       binaMesafe : ortalama olarak binalar kac metre otede
       darlik     : yolun kaci DAR_ESIK icinde bina dibinden geciyor
       Ikisi ayri cunku bir yol yer yer bina dibinden gecip sonra
       acikliga cikabilir; ortalama bunu gizler, darlik gizlemez. */
    let mesafeToplam = 0, dar = 0, yogToplam = 0, yolYogToplam = 0;
    for (const p of o) {
      const u = this.binaMesafesi(izgara, p.x, p.y, this.BINA_YARICAP);
      mesafeToplam += u;
      if (u < this.DAR_ESIK) dar++;
      if (this.izbeG) yogToplam += this.yogunluk(this.izbeG, p.x, p.y);
      if (this.yolG) yolYogToplam += this.yolYogunlugu(this.yolG, p.x, p.y);
    }
    const binaMesafe = o.length ? mesafeToplam / o.length : this.BINA_YARICAP;
    const darlik = o.length ? dar / o.length : 0;
    /* Yol boyunca ortalama bina yogunlugu (bina/km2). Yol sehirden
       cikip kira giriyorsa ortalama ikisinin arasinda kaliyor —
       dogrusu bu, yolun yarisi sehirdeyse yari kirsal sayilmali. */
    const binaYogunluk = o.length ? yogToplam / o.length : 0;
    const yolYogunluk = o.length ? yolYogToplam / o.length : 0;

    return {
      uzunluk: uzunluk, kusUcusu: kusUcusu, kivrim: kivrim,
      donusPerKm: donusPerKm, rakimAralik: rakimAralik, rakimKazanc: rakimKazanc,
      kavsakPerKm: kavsakPerKm, binaMesafe: binaMesafe, darlik: darlik,
      binaYogunluk: binaYogunluk, yolYogunluk: yolYogunluk,
      manzara: manzara, ornek: o
    };
  },

  /* ------------------------------------------------------------
     4) PUANLAMA
     Butun bilesenler 0..1. Carpim degil agirlikli ortalama:
     carpimda tek bir sifir her seyi siliyor, oysa rakimsiz ama
     cok kivrimli issiz bir yol da iyi bir yoldur.
     ------------------------------------------------------------ */
  puanla(m, tur, rakimVar) {
    const kirp = (v) => Math.max(0, Math.min(1, v));

    const trafik = this.trafikCarpani(tur);
    /* Nis olma: az kavsak + binalardan uzak. 12 kavsak/km sehir ici
       demek. Bina terimi artik SAYI degil MESAFE: 40 m ve otesi tam
       puan, 10 m'de sifira yakin. Sayim yaniltiyordu — seyrek ama
       yol dibinde duran birkac bina ile uzakta duran yuzlerce bina
       ayni puani aliyordu. */
    const kavsakP = kirp(1 - m.kavsakPerKm / 12);
    const binaP = kirp((m.binaMesafe - 10) / 30);
    /* IZBELIK: toplumdan uzaklik. binaP sadece 70 m'ye kadar bakiyor
       ve 40 m'de doyuyor — koyun kenari ile bozkirin ortasi ayni
       cikiyordu. izbeP 600 m'lik alandaki bina yogunluguna bakiyor ve
       doymuyor, yumusak azaliyor. Kullanicinin istegi: "toplumdan ne
       kadar uzak o kadar puan". */
    const izbeP = this.IZBE_YARI / (this.IZBE_YARI + m.binaYogunluk);
    const nis = 0.28 * kavsakP + 0.24 * binaP + 0.48 * izbeP;

    /* Halka / cikmaz elemesi: her iki tur icin de gecerli.
       Basladigi yere donen yol surulecek yol degil. */
    if (m.kivrim > this.ENCOK_KIVRIM) return null;
    if (m.kusUcusu < this.ENAZ_KUS_UCUSU) return null;

    /* DAR SOKAK ELEMESI — kullanicinin istegi: "binalarin aralarini,
       dar sokaklari ele". Yolun %40'indan fazlasi bina dibinden
       geciyorsa (en yakin bina 12 m'den yakin) burasi iki sira bina
       arasindaki sokaktir; ne kadar kivrimli olursa olsun surulecek
       yol degil. */
    if (m.darlik > this.ENCOK_DARLIK) return null;

    if (tur === 'viraj') {
      if (m.uzunluk < this.ENAZ_UZUNLUK_VIRAJ) return null;
      /* 600 derece/km = kilometrede birbucuk tam donus kadar donme.
         Olculdu (8 Eylul 2026, Beylikduzu): duz sahil yolu 17-73,
         mahalle arasi 250-330, gercekten kivrimli 500-840. */
      const kivrimP = kirp(m.donusPerKm / 600);
      const rakimP = kirp(m.rakimAralik / 80);
      /* Uzunluk agirligi 0.03'ten 0.12'ye cikti ve doyum 3 km'den
         6 km'ye — kullanicinin istegi "ne kadar uzun o kadar puan".
         Onceden 900 m'lik bir yol ile 5 km'lik yol arasindaki fark
         toplam puanda binde birkactu, yani yoktu. */
      const uzunP = kirp(m.uzunluk / 6000);
      /* RAKIM ARTIK SART DEGIL, BONUS. Kullanicinin verdigi yon:
         "dag gecidi degil, sehrin icinde kivrimli yol da olur".
         Rakim agirligi 0.20'den 0.10'a indi; dusen agirlik
         kivrimliliga ve nis olmaya gitti. */
      const agirlik = rakimVar
        ? [[kivrimP, 0.38], [nis, 0.32], [uzunP, 0.12], [trafik, 0.10], [rakimP, 0.06], [m.manzara, 0.02]]
        : [[kivrimP, 0.42], [nis, 0.34], [uzunP, 0.12], [trafik, 0.10], [m.manzara, 0.02]];
      let p = 0;
      for (const [v, w] of agirlik) p += v * w;
      return { puan: p, kivrimP: kivrimP, rakimP: rakimP, nis: nis, izbeP: izbeP,
               trafik: trafik, manzara: m.manzara, uzunP: uzunP };
    }

    // duz
    if (m.uzunluk < this.ENAZ_UZUNLUK_DUZ) return null;
    /* DUZLUK SERT ESIK. Puanlama tek basina yetmiyordu: duzluk terimi
       sifir olsa bile yol nis + trafik + uzunluk + manzaradan 0.35'i
       gecip "duz" diye listelenebiliyordu. Ormanda test bunu yakaladi —
       Belgrad ve Sile'de "duz" listesinin ortalama kivrimi 1.12-1.18,
       donus 153-205 derece/km cikti; bunlar duz degil, o bolgede uzun
       duz yol OLMADIGI icin en az kotu olanlar. Duz yol yoksa dogru
       cevap "sonuc yok", en az kivrimli virajli yolu duz diye
       gostermek degil. */
    if (m.donusPerKm > this.ENCOK_DUZ_DONUS) return null;
    if (m.kivrim > this.ENCOK_DUZ_KIVRIM) return null;
    /* Duzluk iki olcuyle birden: kus ucusuna oran (genel egrilik)
       ve km basina donus (yerel kivrilma). Ikisi ayri sey: genis
       bir yay kus ucusunu az bozar ama surekli donuyordur. */
    const oranP = kirp(1 - (m.kivrim - 1) * 6);
    const donusP = kirp(1 - m.donusPerKm / 120);
    const duzP = 0.5 * oranP + 0.5 * donusP;
    const uzunP = kirp(m.uzunluk / 8000);
    /* Sahil yolu tam buraya dusuyor: duz, uzun, deniz kenarinda.
       Manzara agirligi duzde daha yuksek — duz bir yolu surulmeye
       deger yapan sey zaten manzarasi. Uzunluk da duzde daha onemli:
       basilacak yolun kisasi olmaz. */
    let p = duzP * 0.32 + nis * 0.28 + uzunP * 0.18 + trafik * 0.12 + m.manzara * 0.10;
    return { puan: p, duzP: duzP, nis: nis, izbeP: izbeP, trafik: trafik,
             manzara: m.manzara, uzunP: uzunP };
  },

  /* Ekranda yuklu olan karolardan kaynak kumesi */
  kaynakTopla() {
    return {
      yollar: this.yollariTopla(),
      binalar: this.binalariTopla(),
      sular: this.sulariTopla()
    };
  },

  /* ============================================================
     BOLGESEL TARAMA — "su ilcenin X km cevresinde ara"
     ------------------------------------------------------------
     Normal tarama sadece o an EKRANDA YUKLU karolara bakiyor, yani
     hep bulundugun yeri tariyor. Baska bir ilceyi taramak icin
     oraya gidip beklemek gerekiyordu.

     Burada veri dogrudan cekiliyor. Seviye MAHALLE olmak zorunda:
     bina verisi sadece o seviyede var (Overpass.DETAY), izbelik ve
     dar sokak elemesi de binalara dayaniyor. Ilce seviyesinde
     tarasak butun yollar "izbelik 1.00" cikardi ve sehir ile kir
     ayirt edilemezdi.

     Karo izgarasi ve parti gruplamasi Karolar'inkinin AYNISI —
     boylece hem diskteki onbellek (Depo) hem osmveri.php onbellegi
     normal gezinmeyle paylasilıyor, ayni yer iki kere inmiyor.
     ============================================================ */
  ENCOK_BLOK: 40,

  /* ------------------------------------------------------------
     PARTI BOYU — 4x4 DENENDI, GERI ALINDI
     ------------------------------------------------------------
     Tarama yavas ve darbogaz Overpass sorgu suresi. Sorgu suresinin
     alandan bagimsiz oldugu izlenimi vardi, oyleyse daha buyuk
     parti = daha az sorgu = daha hizli olurdu. Olculdu ve OYLE
     CIKMADI. Olcumler (8 Eylul 2026):

       tek sorgu, ayni bolge:
         2x2 (3.7 km, 439 KB) 23.0 sn  ->  4x4 (7.4 km, 580 KB) 25.9 sn
       ucdan uca, ayni soguk bolge, 4x4 ONCE:
         4x4  6 blok  128.6 sn
         2x2 12 blok   33.0 sn   (Overpass bolgeyi isittiktan sonra)

     Iki olcum de KIRLI: hangisi once kosarsa Overpass o bolgeyi
     isitiyor ve ikinciyi haksiz hizlandiriyor. Ilk denemede
     "2.6 kat hizlandi" cikmisti ama ikinci bolge neredeyse bostu
     (56 yol) — o da kirliydi.

     Elde kalan: 6 blokluk 4x4 taramasi 5'li es zamanli kumede
     2 turda bitmeliyken 128 sn surdu, yani buyuk sorgular tek tek
     COK daha yavas. Kazanc kanitlanamadi, zarar ihtimali var.
     Parti 2x2'de kaldi.

     Gercekten bilinen: onbellek sicakken ayni tarama 322 ms
     indirme + 81 ms tarama = ~0.4 sn. Yavasligin tamami soguk
     Overpass sorgusu.
     ------------------------------------------------------------ */
  TARAMA_PARTI: [2, 2],

  /* blokGecerli(kutu) verilirse o kutuyu kapsamayan bloklar hic
     indirilmiyor. Ilce taramasinda kritik: ilcenin KUTUSU ilceden
     cok daha buyuk olabiliyor (Buyukcekmece kiyi boyunca uzuyor,
     kutusunun buyuk kismi deniz ve komsu ilce). Olculdu: 42 blok
     gerekiyordu, ilceye gercekten degen blok cok daha az. */
  async bolgeVerisi(lat, lon, km, ilerleme, blokGecerli) {
    const seviye = 'mahalle';
    const z = Overpass.DETAY[seviye].karoZoom;
    const p = this.TARAMA_PARTI;

    /* Yaricapi enlem/boylam farkina cevir. Boylam kutuplara gidildikce
       kisaldigi icin cos(enlem) ile bolunuyor. */
    const dLat = km / 111.132;
    const dLon = km / (111.320 * Math.cos(lat * Math.PI / 180));

    const x0 = Math.floor(Karolar.lonX(lon - dLon, z));
    const x1 = Math.floor(Karolar.lonX(lon + dLon, z));
    const y0 = Math.floor(Karolar.latY(lat + dLat, z));   // karo y'si enlemle TERS
    const y1 = Math.floor(Karolar.latY(lat - dLat, z));

    const gruplar = new Map();
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const gk = Math.floor(x / p[0]) + ',' + Math.floor(y / p[1]);
        let g = gruplar.get(gk);
        if (!g) { g = []; gruplar.set(gk, g); }
        g.push({ z: z, x: x, y: y });
      }
    }
    let bloklar = Array.from(gruplar.values());

    /* Bolgeye gercekten degmeyen bloklari at. Kutu her zaman
       dikdortgen, aranan alan degil. */
    if (blokGecerli) {
      const oncesi = bloklar.length;
      bloklar = bloklar.filter((gr) => {
        let mg = Infinity, mb = Infinity, mk = -Infinity, md = -Infinity;
        for (const t of gr) {
          const kk = Karolar.karoKutusu(t.z, t.x, t.y);
          if (kk[0] < mg) mg = kk[0];
          if (kk[1] < mb) mb = kk[1];
          if (kk[2] > mk) mk = kk[2];
          if (kk[3] > md) md = kk[3];
        }
        return blokGecerli({ g: mg, b: mb, k: mk, d: md });
      });
      this.sonElenenBlok = oncesi - bloklar.length;
    } else {
      this.sonElenenBlok = 0;
    }
    if (!bloklar.length) {
      return { hata: 'Bu alanda inecek blok kalmadi.' };
    }

    if (bloklar.length > this.ENCOK_BLOK) {
      return { hata: 'Bu yaricap icin ' + bloklar.length + ' blok inmesi gerekiyor ' +
                     '(sinir ' + this.ENCOK_BLOK + '). Yaricapi kucult.' };
    }

    /* Merkeze yakin blok once: sonuc listesi dolmaya merkezden basliyor
       ve kullanici erken bir sey goruyor. */
    const om = Proj.metreye(lat, lon);
    bloklar.forEach((g) => {
      let en = Infinity;
      for (const t of g) {
        const mk = Karolar.karoMetreKutusu(t.z, t.x, t.y);
        en = Math.min(en, Math.hypot((mk.minx + mk.maxx) / 2 - om.x,
                                     (mk.miny + mk.maxy) / 2 - om.y));
      }
      g._u = en;
    });
    bloklar.sort((a, b) => a._u - b._u);

    const yolG = new Map(), binaG = new Map(), suG = [];
    const suGorulen = new Set();
    let basarisiz = 0, bitti = 0;

    /* ------------------------------------------------------------
       ISCI HAVUZU — kume degil
       ------------------------------------------------------------
       Onceden bloklar 5'li kumelere bolunup her kume Promise.all ile
       bekleniyordu: kumedeki EN YAVAS blok bitene kadar bosta kalan
       dort slot yeni is almiyordu.

       Olculdu (Sile 4 km, onbellek sicak, 9 blok):
         blok sureleri  192, 188, 185, 105, 104, 78, 77, 76, 40 ms
         toplam is      1045 ms
         kume ile gecen  481 ms
       Ideal (5 slot dolu) max(1045/5, 192) = 209 ms. Fark tamamen
       kumelerin bariyerinden geliyordu.

       Havuzda her isci bitirince siradaki blogu aliyor, kimse
       beklemiyor. Es zamanlilik yine Karolar.ESZAMANLI kadar —
       Overpass'i dovmemek icin.
       ------------------------------------------------------------ */
    const kume = Math.min(Karolar.ESZAMANLI || 5, bloklar.length);
    let siradaki = 0;
    const isciler = [];
    for (let w = 0; w < kume; w++) {
      isciler.push((async () => {
        for (;;) {
          const i = siradaki++;
          if (i >= bloklar.length) return;
          await (async (g) => {
        /* Karo kumesini tek kutuya cevir */
        const kutula = (karolar) => {
          let mg = Infinity, mb = Infinity, mk = -Infinity, md = -Infinity;
          for (const t of karolar) {
            const kk = Karolar.karoKutusu(t.z, t.x, t.y);
            if (kk[0] < mg) mg = kk[0];
            if (kk[1] < mb) mb = kk[1];
            if (kk[2] > mk) mk = kk[2];
            if (kk[3] > md) md = kk[3];
          }
          return [mg, mb, mk, md];
        };

        const topla = (s) => {
          for (const y of s.yollar) if (!yolG.has(y.id)) yolG.set(y.id, y);
          for (const b of s.binalar) if (!binaG.has(b.id)) binaG.set(b.id, b);
          for (const c of s.kiyi) {
            if (suGorulen.has('k' + c.id)) continue;
            suGorulen.add('k' + c.id);
            for (const q of c.nokta) suG.push(q);
          }
          for (const a of s.alanlar) {
            if (a.tur !== 'su' || suGorulen.has('a' + a.id)) continue;
            suGorulen.add('a' + a.id);
            for (const q of a.nokta) suG.push(q);
          }
        };

        try {
          topla(await Ayristirici.ayristirBolerek(
            await Overpass.indirKutu(kutula(g), seviye, null)));
        } catch (e) {
          /* Buyuk parti dustu — yogun sehirde 4x4 sunucuyu zaman
             asimina dusurebiliyor. Blogu 2x2'lere bolup tekrar dene:
             kucuk sorgular geciyor, tarama komple durmuyor. */
          console.warn('[touge] 4x4 blok inmedi, 2x2 bolunuyor:', (e && e.message) || e);
          const alt = new Map();
          for (const t of g) {
            const ak = Math.floor(t.x / 2) + ',' + Math.floor(t.y / 2);
            let d = alt.get(ak);
            if (!d) { d = []; alt.set(ak, d); }
            d.push(t);
          }
          let altHata = 0;
          for (const d of alt.values()) {
            try {
              topla(await Ayristirici.ayristirBolerek(
                await Overpass.indirKutu(kutula(d), seviye, null)));
            } catch (e2) {
              altHata++;
              console.warn('[touge] alt blok da inmedi:', (e2 && e2.message) || e2);
            }
          }
          /* Alt bloklarin HEPSI dustuyse blok gercekten inmedi.
             Bir kismi indiyse veri eksik ama kullanilabilir —
             yine de sayilıyor ki kullanici eksigi bilsin. */
          if (altHata) basarisiz++;
        }
        bitti++;
        if (ilerleme) ilerleme(bitti, bloklar.length, basarisiz);
          })(bloklar[i]);
        }
      })());
    }
    await Promise.all(isciler);

    /* Bina kose ve merkezlerini kaynak bicimine cevir */
    const kose = [], merkez = [];
    for (const b of binaG.values()) {
      if (!b.nokta || !b.nokta.length) continue;
      let sx = 0, sy = 0;
      for (const q of b.nokta) { kose.push({ x: q.x, y: q.y }); sx += q.x; sy += q.y; }
      merkez.push({ x: sx / b.nokta.length, y: sy / b.nokta.length });
    }

    const yollar = [];
    for (const y of yolG.values()) {
      if (y.sinif === 'yaya' || y.tur === 'service') continue;
      if (!y.nokta || y.nokta.length < 2 || !y.dugum) continue;
      yollar.push(y);
    }

    return {
      kaynak: { yollar: yollar, binalar: { kose: kose, merkez: merkez }, sular: suG },
      blok: bloklar.length, basarisiz: basarisiz, bina: binaG.size
    };
  },

  /* ------------------------------------------------------------
     ANA GIRIS
     kaynak verilmezse ekranda yuklu karolardan toplanir.
     ------------------------------------------------------------ */
  bul(tur, enFazla, kaynak, secenek) {
    const mahalleDahil = !!(secenek && secenek.mahalleDahil);
    const t0 = performance.now();
    kaynak = kaynak || this.kaynakTopla();
    const yollar = kaynak.yollar;
    if (!yollar.length) return { hata: 'Once yol verisi insin (haritada biraz gez).' };

    const binalar = kaynak.binalar;
    const izgara = this.binaIzgarasi(binalar.kose);
    this.izbeG = this.izbeIzgarasi(binalar.merkez);
    this.yolG = this.yolIzgarasi(yollar);
    this.suIzgara = this.binaIzgarasi(kaynak.sular);

    /* KAVSAK SAYIMI YOLLARDAN, GRAFIKTEN DEGIL.
       Once Grafik.dugumler'e bakiliyordu; grafik ancak bir rota
       cizilince kuruluyor, o yuzden touge taramasinda hep null
       oluyor ve kavsak yogunlugu HER YOLDA 0 cikiyordu (8 Eylul
       2026'da test bunu yakaladi — "0 kavsak/km" her satirda).
       Kavsak zaten yol verisinden cikarilabilir: bir dugum birden
       fazla yolda geciyorsa orasi kavsaktir. */
    const gecis = new Map();
    for (const y of yollar) {
      for (const nid of y.dugum) gecis.set(nid, (gecis.get(nid) || 0) + 1);
    }
    const kavsakMi = (nid) => (gecis.get(nid) || 0) > 1;

    /* Arazi kapaliysa ya da hic yukseklik karosu inmemisse rakim
       terimi devre disi. Sessizce 0 saymak "her yer duz" demek olurdu. */
    const rakimVar = !!Arazi.hazir;

    const zincirler = this.zincirle(yollar, mahalleDahil);
    const turler = (tur === 'ikisi') ? ['viraj', 'duz'] : [tur];
    const bulunan = [];

    let darEle = 0;
    const eleme = { mahalle: 0, toprak: 0, yuzey: 0, kapali: 0 };
    for (const z of zincirler) {
      /* Surulemez yollar: mahalle sokagi, toprak yol, kapali gecis.
         Zincirin HERHANGI bir parcasi sorunluysa zincir eleniyor —
         yolun 200 m'si ozel mulk ise o yoldan gecemezsin. */
      if (z.sorun) { eleme[z.sorun] = (eleme[z.sorun] || 0) + 1; continue; }

      /* OSM'de genislik acikca yaziyorsa tahmine gerek yok. Bu etiket
         her yolda yok ama varsa en guvenilir sinyal. */
      if (z.genislik != null && z.genislik < this.ENAZ_GENISLIK) { darEle++; continue; }

      const m = this.olc(z, izgara, kavsakMi, rakimVar);
      if (!m) continue;
      if (m.darlik > this.ENCOK_DARLIK) darEle++;
      for (const t of turler) {
        const p = this.puanla(m, t === 'viraj' ? 'viraj' : 'duz', rakimVar);
        if (!p) continue;
        /* Trafik carpani puanin bileseni ama ayrica esik: ana arter
           ne kadar guzel olursa olsun touge degil. */
        if (this.trafikCarpani(z.tur) < 0.3) continue;
        if (p.puan < 0.35) continue;
        bulunan.push({
          tur: t, ad: z.ad || '(isimsiz ' + z.tur + ')', yolTuru: z.tur,
          genislik: z.genislik, serit: z.serit,
          parca: z.parca, nokta: z.nokta, olcum: m, ...p
        });
      }
    }

    bulunan.sort((a, b) => b.puan - a.puan);
    const kesilen = Math.max(0, bulunan.length - (enFazla || 8));
    this.sonuc = bulunan.slice(0, enFazla || 8);
    return {
      sonuc: this.sonuc, toplam: bulunan.length, kesilen: kesilen,
      darEle: darEle, eleme: eleme, zincir: zincirler.length, yol: yollar.length,
      rakimVar: rakimVar, ms: performance.now() - t0
    };
  },

  /* ============================================================
     GOOGLE MAPS BAGLANTISI
     ------------------------------------------------------------
     Bulunan yolu Google Maps'te yol tarifi olarak acar.

     ARA NOKTA SART. Sadece baslangic ve bitis verilirse Google
     kendi tercih ettigi rotayi cizer — genelde otoyoldan dolasir,
     yani bulunan virajli yolu tamamen atlar. Ara noktalar rotayi
     bizim yolumuzdan gecmeye zorluyor.

     Google'in URL arayuzu en fazla 9 ara nokta aliyor; 8 kullanip
     bir pay birakiyoruz. Noktalar esit araliklarla secilmis
     ornekleme dizisinden aliniyor, ham OSM noktalarindan degil:
     ham noktalar yolun bir kisminda kumelenmis olabiliyor ve o
     zaman ara noktalarin hepsi ayni bolgeye dusuyor.

     Universal URL bicimi: telefonda Maps uygulamasini, masaustunde
     tarayiciyi aciyor, ayri bag gerekmiyor.
     ============================================================ */
  ENCOK_ARA_NOKTA: 8,

  mapsBaglantisi(y) {
    const n = (y.olcum && y.olcum.ornek && y.olcum.ornek.length > 1)
      ? y.olcum.ornek : y.nokta;
    const yaz = (p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
    const bas = yaz(n[0]);
    const son = yaz(n[n.length - 1]);

    const ara = [];
    const adet = Math.min(this.ENCOK_ARA_NOKTA, Math.max(0, n.length - 2));
    for (let i = 1; i <= adet; i++) {
      const p = n[Math.round(i * (n.length - 1) / (adet + 1))];
      if (!p) continue;
      const s = yaz(p);
      /* Kisa yolda ayni nokta iki kere secilebiliyor; tekrar eden
         ara nokta Google'da "gecersiz rota" veriyor. */
      if (s !== bas && s !== son && ara.indexOf(s) < 0) ara.push(s);
    }

    let u = 'https://www.google.com/maps/dir/?api=1' +
            '&origin=' + encodeURIComponent(bas) +
            '&destination=' + encodeURIComponent(son) +
            '&travelmode=driving';
    if (ara.length) u += '&waypoints=' + encodeURIComponent(ara.join('|'));
    return u;
  },

  temizle() { this.sonuc = []; this.secili = null; }
};
