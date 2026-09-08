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
     Turkiye'de tertiary ve unclassified tipik dag yolu; residential
     issiz gorunur ama kenari ev doludur, o yuzden ortada. */
  TRAFIK: {
    motorway: 0.02, trunk: 0.05, primary: 0.2, secondary: 0.55,
    tertiary: 0.9, unclassified: 1.0, residential: 0.5,
    living_street: 0.35, track: 0.85, service: 0.15
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
    const kose = [];
    for (const k of Karolar.depo.values()) {
      if (!k.blok || !k.blok.sekil) continue;
      for (const b of k.blok.sekil.binalar) {
        if (gorulen.has(b.id)) continue;
        gorulen.add(b.id);
        if (!b.nokta || !b.nokta.length) continue;
        for (const p of b.nokta) kose.push({ x: p.x, y: p.y });
      }
    }
    return kose;
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
  zincirle(yollar) {
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

      zincirler.push({
        ad: bas.ad, tur: bas.tur, sinif: bas.sinif,
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
    let mesafeToplam = 0, dar = 0;
    for (const p of o) {
      const u = this.binaMesafesi(izgara, p.x, p.y, this.BINA_YARICAP);
      mesafeToplam += u;
      if (u < this.DAR_ESIK) dar++;
    }
    const binaMesafe = o.length ? mesafeToplam / o.length : this.BINA_YARICAP;
    const darlik = o.length ? dar / o.length : 0;

    return {
      uzunluk: uzunluk, kusUcusu: kusUcusu, kivrim: kivrim,
      donusPerKm: donusPerKm, rakimAralik: rakimAralik, rakimKazanc: rakimKazanc,
      kavsakPerKm: kavsakPerKm, binaMesafe: binaMesafe, darlik: darlik,
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
    const nis = 0.45 * kavsakP + 0.55 * binaP;

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
      const uzunP = kirp(m.uzunluk / 3000);
      /* RAKIM ARTIK SART DEGIL, BONUS. Kullanicinin verdigi yon:
         "dag gecidi degil, sehrin icinde kivrimli yol da olur".
         Rakim agirligi 0.20'den 0.10'a indi; dusen agirlik
         kivrimliliga ve nis olmaya gitti. */
      const agirlik = rakimVar
        ? [[kivrimP, 0.46], [nis, 0.24], [trafik, 0.14], [rakimP, 0.10], [m.manzara, 0.03], [uzunP, 0.03]]
        : [[kivrimP, 0.52], [nis, 0.27], [trafik, 0.15], [m.manzara, 0.03], [uzunP, 0.03]];
      let p = 0;
      for (const [v, w] of agirlik) p += v * w;
      return { puan: p, kivrimP: kivrimP, rakimP: rakimP, nis: nis,
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
    const uzunP = kirp(m.uzunluk / 4000);
    /* Sahil yolu tam buraya dusuyor: duz, uzun, deniz kenarinda.
       Manzara agirligi duzde daha yuksek — duz bir yolu surulmeye
       deger yapan sey zaten manzarasi. */
    let p = duzP * 0.40 + nis * 0.21 + trafik * 0.16 + uzunP * 0.11 + m.manzara * 0.12;
    return { puan: p, duzP: duzP, nis: nis, trafik: trafik,
             manzara: m.manzara, uzunP: uzunP };
  },

  /* ------------------------------------------------------------
     ANA GIRIS
     ------------------------------------------------------------ */
  bul(tur, enFazla) {
    const t0 = performance.now();
    const yollar = this.yollariTopla();
    if (!yollar.length) return { hata: 'Once yol verisi insin (haritada biraz gez).' };

    const izgara = this.binaIzgarasi(this.binalariTopla());
    this.suIzgara = this.binaIzgarasi(this.sulariTopla());

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

    const zincirler = this.zincirle(yollar);
    const turler = (tur === 'ikisi') ? ['viraj', 'duz'] : [tur];
    const bulunan = [];

    let darEle = 0;
    for (const z of zincirler) {
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
      darEle: darEle, zincir: zincirler.length, yol: yollar.length,
      rakimVar: rakimVar, ms: performance.now() - t0
    };
  },

  temizle() { this.sonuc = []; this.secili = null; }
};
