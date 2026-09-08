/* ============================================================
   graph.js  —  Yol agini "grafige" cevirir
   ------------------------------------------------------------
   Harita ekranda cizim, ama algoritma icin GRAFIK lazim:
       dugum (node)  = kavsak / yol ucu
       kenar (edge)  = iki dugum arasindaki yol parcasi + maliyeti

   Bu dosya ciziim yapmaz. Sadece "algoritmanin gordugu sehri" kurar.
   Kurye algoritmasi (A*, rota birlestirme) buraya baglanacak.
   ============================================================ */

/* ------------------------------------------------------------
   En kucuk yigin (binary min-heap)
   A* her adimda "en dusuk maliyetli bekleyen dugum"u ister.
   Diziyi bastan tarayarak bulmak dugum sayisiyla dogru orantili;
   yigin ile log(n). 40 bin dugumluk grafikte fark buyuk.
   ------------------------------------------------------------ */
function EnKucukYigin() {
  this.id = [];        // dugum id'leri
  this.f = [];         // oncelik degerleri
  this.uzunluk = 0;
}
EnKucukYigin.prototype.koy = function (id, f) {
  let i = this.uzunluk++;
  this.id[i] = id; this.f[i] = f;
  while (i > 0) {
    const ust = (i - 1) >> 1;
    if (this.f[ust] <= this.f[i]) break;
    const ti = this.id[ust], tf = this.f[ust];
    this.id[ust] = this.id[i]; this.f[ust] = this.f[i];
    this.id[i] = ti; this.f[i] = tf;
    i = ust;
  }
};
EnKucukYigin.prototype.al = function () {
  const tepe = this.id[0];
  const son = --this.uzunluk;
  this.id[0] = this.id[son]; this.f[0] = this.f[son];
  let i = 0;
  for (;;) {
    const sol = 2 * i + 1, sag = sol + 1;
    let en = i;
    if (sol < son && this.f[sol] < this.f[en]) en = sol;
    if (sag < son && this.f[sag] < this.f[en]) en = sag;
    if (en === i) break;
    const ti = this.id[en], tf = this.f[en];
    this.id[en] = this.id[i]; this.f[en] = this.f[i];
    this.id[i] = ti; this.f[i] = tf;
    i = en;
  }
  return tepe;
};


const Grafik = {

  dugumler: null,   // Map: osmId -> { id, x, y, lat, lon, komsu:[] }
  kenarSayisi: 0,
  gecersiz: true,   // karo kumesi degistiginde true olur
  sonIst: null,
  secenek: { tekYon: true },

  /* ------------------------------------------------------------
     Yuklu KAROLARDAN grafigi kur. Gezinirken degil, gerektiginde
     cagrilir (marker konarken / rota istenirken) — cunku kaydirirken
     her yeni karoda grafigi bastan kurmak bosa is olur.
     Butun seviyelerin karolari kullanilir: elde ne kadar yol varsa
     rota o kadar iyi olur. Ayni yol iki karoda varsa id'ye gore
     tekillenir, yoksa kenarlar iki kere eklenirdi.
     ------------------------------------------------------------ */
  hazirla(zorla) {
    if (!this.gecersiz && !zorla && this.dugumler) return this.sonIst;
    const gorulen = new Set();
    const yollar = [];
    for (const blok of Karolar.hazirBloklar()) {
      for (const y of blok.sekil.yollar) {
        if (gorulen.has(y.id)) continue;
        gorulen.add(y.id);
        yollar.push(y);
      }
    }
    this.sonIst = this.kur(yollar, null, this.secenek);
    this.gecersiz = false;
    return this.sonIst;
  },

  /* Yol listesinden grafigi kur.
     secenek.tekYon = false ise tek yon kurallari yok sayilir (her yol cift yonlu).
     Motorlu kurye dar sokaklarda ters yone girebiliyor; ayrica harita kenarindan
     kesilen tek yonlu sokaklar cikmaz gibi gorundugu icin bu secenek isi kurtarir. */
  kur(yollar, ilerleme, secenek) {
    const tekYonUygula = !secenek || secenek.tekYon !== false;
    const dugumler = new Map();

    // 1) Bir dugum kac ayri yolda geciyor? Kavsaklari bulmak icin sayiyoruz.
    const gecisSayisi = new Map();
    for (const y of yollar) {
      if (!y.dugum) continue;
      for (const nid of y.dugum) {
        gecisSayisi.set(nid, (gecisSayisi.get(nid) || 0) + 1);
      }
    }

    const dugumAl = function (nid, p) {
      let d = dugumler.get(nid);
      if (!d) {
        d = { id: nid, x: p.x, y: p.y, lat: p.lat, lon: p.lon, komsu: [] };
        dugumler.set(nid, d);
      }
      return d;
    };

    // 2) Her yolun ardisik nokta ciftini bir kenar yap.
    let kenar = 0;
    for (const y of yollar) {
      if (!y.dugum || y.dugum.length !== y.nokta.length) continue;  // veri bozuksa atla

      for (let i = 0; i < y.nokta.length - 1; i++) {
        const a = dugumAl(y.dugum[i], y.nokta[i]);
        const b = dugumAl(y.dugum[i + 1], y.nokta[i + 1]);
        if (a === b) continue;

        const uzunluk = Math.hypot(b.x - a.x, b.y - a.y);       // metre
        if (uzunluk === 0) continue;
        const sure = uzunluk / (y.hiz * 1000 / 3600);            // saniye

        // ileri yon
        if (!tekYonUygula || !y.tersYon) {
          a.komsu.push({ hedef: b.id, uzunluk: uzunluk, sure: sure, yolId: y.id, tur: y.tur });
          kenar++;
        }
        // geri yon (tek yonlu degilse)
        if (!tekYonUygula || !y.tekYon) {
          b.komsu.push({ hedef: a.id, uzunluk: uzunluk, sure: sure, yolId: y.id, tur: y.tur });
          kenar++;
        }
      }
    }

    this.dugumler = dugumler;
    this.kenarSayisi = kenar;

    // 3) Kavsaklari isaretle (3 ve uzeri baglantisi olan dugumler)
    let kavsak = 0;
    for (const d of dugumler.values()) {
      d.kavsak = d.komsu.length >= 3;
      if (d.kavsak) kavsak++;
    }

    ilerleme && ilerleme('Grafik kuruldu: ' + dugumler.size + ' dugum, ' +
                         kenar + ' kenar, ' + kavsak + ' kavsak');
    return { dugum: dugumler.size, kenar: kenar, kavsak: kavsak };
  },

  /* Verilen metre koordinatina en yakin dugumu bul.
     Haritaya tiklanan sube/musteri noktasini yola "yapistirmak" icin. */
  enYakinDugum(x, y) {
    if (!this.dugumler) return null;
    let enIyi = null, enIyiUzaklik = Infinity;
    for (const d of this.dugumler.values()) {
      const u = (d.x - x) * (d.x - x) + (d.y - y) * (d.y - y);
      if (u < enIyiUzaklik) { enIyiUzaklik = u; enIyi = d; }
    }
    return enIyi ? { dugum: enIyi, uzaklik: Math.sqrt(enIyiUzaklik) } : null;
  },

  /* Kavsak noktalarinin listesi — hata ayiklama katmaninda cizilir. */
  kavsakListesi() {
    if (!this.dugumler) return [];
    const liste = [];
    for (const d of this.dugumler.values()) if (d.kavsak) liste.push(d);
    return liste;
  },

  /* ----------------------------------------------------------
     BURASI ALGORITMANIN GIRIS KAPISI
     ----------------------------------------------------------
     Asagidaki A* hazir duruyor; kurye avatari eklenince
     "sube -> musteri" rotasini bununla cizecegiz.
     olcut: 'uzunluk' (en kisa yol) veya 'sure' (en hizli yol)
     Donen: dugum id dizisi, yoksa null
     ---------------------------------------------------------- */
  rotaBul(baslangicId, bitisId, olcut) {
    olcut = olcut || 'uzunluk';
    const D = this.dugumler;
    if (!D || !D.has(baslangicId) || !D.has(bitisId)) return null;

    const hedef = D.get(bitisId);
    // tahmini kalan maliyet (kus ucusu). 'sure' icin en yuksek hiza bolunur.
    const tahmin = function (d) {
      const m = Math.hypot(hedef.x - d.x, hedef.y - d.y);
      return olcut === 'sure' ? m / (90 * 1000 / 3600) : m;
    };

    const gelen = new Map();     // dugum -> geldigi dugum
    const skor = new Map();      // dugum -> baslangictan buraya gercek maliyet
    const kapali = new Set();
    skor.set(baslangicId, 0);

    const yigin = new EnKucukYigin();
    yigin.koy(baslangicId, tahmin(D.get(baslangicId)));

    while (yigin.uzunluk) {
      const su = yigin.al();

      if (su === bitisId) {
        const yol = [su];
        let g = gelen.get(su);
        while (g !== undefined) { yol.unshift(g); g = gelen.get(g); }
        return { yol: yol, maliyet: skor.get(bitisId) };
      }
      if (kapali.has(su)) continue;
      kapali.add(su);

      const d = D.get(su);
      const suSkor = skor.get(su);
      for (const k of d.komsu) {
        if (kapali.has(k.hedef)) continue;
        const yeni = suSkor + k[olcut];
        const eski = skor.get(k.hedef);
        if (eski !== undefined && eski <= yeni) continue;
        skor.set(k.hedef, yeni);
        gelen.set(k.hedef, su);
        yigin.koy(k.hedef, yeni + tahmin(D.get(k.hedef)));
      }
    }
    return null;   // ulasilamiyor
  },

  /* ----------------------------------------------------------
     TEK KAYNAKTAN COK HEDEFE MALIYET  (Dijkstra)
     ----------------------------------------------------------
     Teslimat sirasini kus ucusuna gore secmek Buyukcekmece gibi
     yerlerde yaniltiyor: golun iki yakasi kus ucusu 1 km, yoldan
     9 km. Sira GERCEK yol maliyetine gore kurulmali.

     n durak icin n^2 A* yerine durak basina TEK tarama yetiyor:
     bir Dijkstra o duraktan butun hedeflere olan maliyeti birden
     verir. Butun hedefler kapaninca tarama biter, yani grafigin
     tamami gezilmez — pratikte duraklari cevreleyen bolge kadar.

     A* degil Dijkstra: A*'in kus ucusu tahmini TEK hedefe gore
     kurulur, cok hedefte hepsini birden yonlendiremez.
     ---------------------------------------------------------- */
  maliyetler(baslangicId, hedefIdler, olcut) {
    olcut = olcut || 'uzunluk';
    const D = this.dugumler;
    const sonuc = new Map();
    if (!D || !D.has(baslangicId)) return sonuc;

    const bekleyen = new Set();
    for (const h of hedefIdler) if (D.has(h)) bekleyen.add(h);
    if (bekleyen.has(baslangicId)) { sonuc.set(baslangicId, 0); bekleyen.delete(baslangicId); }
    if (!bekleyen.size) return sonuc;

    const skor = new Map([[baslangicId, 0]]);
    const kapali = new Set();
    const yigin = new EnKucukYigin();
    yigin.koy(baslangicId, 0);

    while (yigin.uzunluk && bekleyen.size) {
      const su = yigin.al();
      if (kapali.has(su)) continue;
      kapali.add(su);

      const suSkor = skor.get(su);
      if (bekleyen.has(su)) { sonuc.set(su, suSkor); bekleyen.delete(su); }

      for (const k of D.get(su).komsu) {
        if (kapali.has(k.hedef)) continue;
        const yeni = suSkor + k[olcut];
        const eski = skor.get(k.hedef);
        if (eski !== undefined && eski <= yeni) continue;
        skor.set(k.hedef, yeni);
        yigin.koy(k.hedef, yeni);
      }
    }
    return sonuc;
  },

  /* Dugum id dizisini cizim icin noktalara cevir (yukseklik dahil). */
  rotaNoktalari(yol) {
    const D = this.dugumler;
    return yol.map(function (id) {
      const d = D.get(id);
      return { x: d.x, y: d.y, z: Arazi.latLonYukseklik(d.lat, d.lon) };
    });
  }
};
