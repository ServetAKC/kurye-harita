/* ============================================================
   render.js  —  Izometrik cizim motoru (akisli, karo bazli)
   ------------------------------------------------------------
   AKICILIK BURADA KAZANILIYOR:

   Duragan katman (arazi + yollar + binalar) ekrandan BUYUK bir
   tampona cizilir (her yandan MARJ kadar fazla). Kaydirirken
   yeniden cizim YAPILMAZ — hazir goruntu kaydirilarak yapistirilir.
   Zoom sirasinda ayni goruntu olceklenerek yapistirilir. Yeniden
   cizim sadece hareket durdugunda, donunce, veya marj tukenince
   olur. Google Maps'in yaptigi is bu.

   Canli katman (marker, rota, kurye) her karede ustune cizilir.
   ============================================================ */

const RENK = {
  gokyuzu:      '#06080b',
  zemin:        '#14181d',
  zeminKenar:   '#22282f',

  deniz:        '#0a1a26',
  denizDerin:   '#06121b',
  kiyiCizgi:    '#33627d',
  esYukselti:   'rgba(200,215,230,0.10)',
  esYukseltiAna:'rgba(210,225,240,0.24)',

  su:           '#0b1f2e',
  suKenar:      '#153a52',
  // Park/orman: gri arazinin uzerinde YESIL okunsun ama doygun olmasin —
  // gece paletini bozmadan ayirt edilebilir tonlar.
  yesil:        '#243528',
  orman:        '#1e2e21',
  saha:         '#2a3d2c',
  yesilKenar:   'rgba(120,170,130,0.22)',

  yolKenar:     { ana: '#181d24', orta: '#161a20', kucuk: '#14171c', servis: '#121519', yaya: '#111418' },
  yolIc:        { ana: '#9fb4cc', orta: '#6f8095', kucuk: '#4a5563', servis: '#3a434e', yaya: '#2f363f' },
  seritCizgi:   '#f2c94c',

  binaCati:     '#2b3138',
  binaDuvarA:   '#1d2228',
  binaDuvarB:   '#15191e',
  binaKenar:    '#0a0d10',

  dugum:        '#2dd4bf',
  yazi:         '#8b9aab',

  sube:         '#22d3ee',
  musteri:      '#fb923c',
  kurye:        '#f43f5e',
  rota:         '#22d3ee'
};


/* ============================================================
   DURAK IKONLARI — her biri 0,0 merkezli, ~14 piksel kutuda
   ============================================================ */
const Ikon = {

  /* Benzin pompasi: govde + hortum + tabanca */
  benzinlik(c, x, y, r) {
    const s = r / 7;
    c.beginPath();
    // pompa govdesi
    c.moveTo(x - 3.2 * s, y - 5 * s);
    c.lineTo(x + 1.4 * s, y - 5 * s);
    c.lineTo(x + 1.4 * s, y + 5 * s);
    c.lineTo(x - 3.2 * s, y + 5 * s);
    c.closePath();
    c.fill();
    // ekran penceresi (koyu)
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath();
    c.rect(x - 2.3 * s, y - 4 * s, 2.8 * s, 2.4 * s);
    c.fill();
    c.restore();
    // hortum kolu
    c.beginPath();
    c.lineWidth = 1.1 * s;
    c.moveTo(x + 1.4 * s, y - 2.6 * s);
    c.quadraticCurveTo(x + 4.2 * s, y - 2.6 * s, x + 4.2 * s, y + 0.6 * s);
    c.lineTo(x + 4.2 * s, y + 4.4 * s);
    c.stroke();
  },

  /* Otopark: mavi levha uzerinde beyaz P (gercek trafik levhasi gibi) */
  otopark(c, x, y, r) {
    const s = r * 1.06;
    c.save();
    c.beginPath();
    const k = s * 0.28;
    c.moveTo(x - s + k, y - s);
    c.lineTo(x + s - k, y - s);
    c.quadraticCurveTo(x + s, y - s, x + s, y - s + k);
    c.lineTo(x + s, y + s - k);
    c.quadraticCurveTo(x + s, y + s, x + s - k, y + s);
    c.lineTo(x - s + k, y + s);
    c.quadraticCurveTo(x - s, y + s, x - s, y + s - k);
    c.lineTo(x - s, y - s + k);
    c.quadraticCurveTo(x - s, y - s, x - s + k, y - s);
    c.closePath();
    c.fillStyle = '#1d4ed8';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = Math.max(0.6, s * 0.13);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = 'bold ' + (s * 1.5).toFixed(1) + 'px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('P', x, y + s * 0.06);
    c.restore();
  },

  /* Sarj: yildirim */
  sarj(c, x, y, r) {
    const s = r / 6;
    c.beginPath();
    c.moveTo(x + 1.2 * s, y - 5.5 * s);
    c.lineTo(x - 3.4 * s, y + 0.6 * s);
    c.lineTo(x - 0.4 * s, y + 0.6 * s);
    c.lineTo(x - 1.6 * s, y + 5.5 * s);
    c.lineTo(x + 3.4 * s, y - 0.9 * s);
    c.lineTo(x + 0.3 * s, y - 0.9 * s);
    c.closePath();
    c.fill();
  },

  /* Eczane / hastane: kalin arti */
  arti(c, x, y, r) {
    const s = r / 6, k = 1.7 * s, u = 5 * s;
    c.beginPath();
    c.rect(x - k, y - u, 2 * k, 2 * u);
    c.rect(x - u, y - k, 2 * u, 2 * k);
    c.fill();
  },
  eczane(c, x, y, r) { Ikon.arti(c, x, y, r); },
  hastane(c, x, y, r) { Ikon.arti(c, x, y, r); },

  /* Market: alisveris sepeti */
  market(c, x, y, r) {
    const s = r / 6;
    c.beginPath();
    c.moveTo(x - 4.4 * s, y - 1.2 * s);
    c.lineTo(x + 4.4 * s, y - 1.2 * s);
    c.lineTo(x + 3.1 * s, y + 4.2 * s);
    c.lineTo(x - 3.1 * s, y + 4.2 * s);
    c.closePath();
    c.fill();
    c.beginPath();
    c.lineWidth = 1.1 * s;
    c.moveTo(x - 2.4 * s, y - 1.2 * s);
    c.quadraticCurveTo(x - 2.1 * s, y - 5.2 * s, x + 0.6 * s, y - 5.2 * s);
    c.quadraticCurveTo(x + 3.1 * s, y - 5.2 * s, x + 2.8 * s, y - 1.2 * s);
    c.stroke();
  },

  /* Restoran: catal + bicak */
  yemek(c, x, y, r) {
    const s = r / 6;
    c.beginPath();
    c.lineWidth = 1.15 * s;
    // catal sapi
    c.moveTo(x - 2.2 * s, y - 5 * s); c.lineTo(x - 2.2 * s, y + 5 * s);
    // catal dislari
    c.moveTo(x - 3.6 * s, y - 5 * s); c.lineTo(x - 3.6 * s, y - 1.6 * s);
    c.moveTo(x - 0.8 * s, y - 5 * s); c.lineTo(x - 0.8 * s, y - 1.6 * s);
    c.moveTo(x - 3.6 * s, y - 1.6 * s); c.lineTo(x - 0.8 * s, y - 1.6 * s);
    // bicak
    c.moveTo(x + 2.4 * s, y - 5 * s); c.lineTo(x + 2.4 * s, y + 5 * s);
    c.stroke();
    c.beginPath();
    c.moveTo(x + 1.5 * s, y - 5 * s);
    c.lineTo(x + 3.3 * s, y - 5 * s);
    c.lineTo(x + 2.4 * s, y - 0.6 * s);
    c.closePath();
    c.fill();
  },

  /* Banka: banknot */
  banka(c, x, y, r) {
    const s = r / 6;
    c.beginPath();
    c.rect(x - 4.6 * s, y - 3 * s, 9.2 * s, 6 * s);
    c.fill();
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath();
    c.arc(x, y, 1.7 * s, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
};


const Cizer = {

  tuval: null, ctx: null,
  duragan: null, dctx: null,
  onceki: null, octx: null,  // gecis icin bir onceki goruntu
  MARJ: 200,                 // tamponun ekrandan ne kadar tasmasi (CSS piksel)
  dpr: 1,
  offGen: 0, offYuk: 0,

  /* Yumusak gecis: yeni karo indiginde, detay seviyesi degistiginde veya
     yukseklik verisi geldiginde goruntu bir anda degisiyordu ("pop").
     Simdi eski goruntu saklanip yenisi uzerine erimeli olarak biniyor. */
  gecis: { aktif: false, bas: 0, sure: 260, cizim: null },

  /* Tampon hangi kamera durumuyla cizildi */
  cizim: { panX: 0, panY: 0, olcek: 1, aci: 0, surum: -1, seviye: '', katmanSurum: -1, gecerli: false },
  katmanSurum: 0,            // katman ayarlari degisince artar
  hareketli: false,          // su an surukleme/zoom suruyor mu
  sonSure: 0,
  kabaMod: false,

  _toplam: null, _toplamaSurum: -1, _toplamaSeviye: '',

  katman: {
    arazi: true,
    esYukselti: true,
    kiyi: true,
    alanlar: true,
    binalar: true,
    yolAdlari: false,
    grafikDugum: false,
    poi: { benzinlik: true, otopark: true, sarj: true, yemek: false,
           market: false, eczane: false, hastane: false, banka: false }
  },

  baslat(tuval) {
    this.tuval = tuval;
    this.ctx = tuval.getContext('2d');
    this.duragan = document.createElement('canvas');
    this.dctx = this.duragan.getContext('2d');
    this.olcuAyarla();
  },

  olcuAyarla() {
    // 8 GB'lik makinede tampon bellegi onemli: dpr 1.5'te tutuluyor.
    // 1400x900 ekran + 200 marj -> 1800x1300 @1.5 = 2700x1950 = ~21 MB
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const g = this.tuval.clientWidth, y = this.tuval.clientHeight;
    this.tuval.width = Math.round(g * this.dpr);
    this.tuval.height = Math.round(y * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.offGen = g + this.MARJ * 2;
    this.offYuk = y + this.MARJ * 2;
    this.duragan.width = Math.round(this.offGen * this.dpr);
    this.duragan.height = Math.round(this.offYuk * this.dpr);
    // tampon koordinatlari: (0,0) = ekranin (-MARJ,-MARJ) noktasi
    this.dctx.setTransform(this.dpr, 0, 0, this.dpr, this.MARJ * this.dpr, this.MARJ * this.dpr);

    // gecis tamponu tembel olusur; olcu degisince atilir (yeniden kurulur)
    this.onceki = null; this.octx = null;
    this.gecis.aktif = false;

    Kamera.genislik = g;
    Kamera.yukseklik = y;
    this.cizim.gecerli = false;
  },

  /* Gecis tamponunu ilk gerektiginde olustur — hic gecis olmazsa
     ikinci bir 21 MB'lik tuval bosuna ayrilmasin. */
  gecisTamponuHazirla() {
    if (this.onceki) return true;
    try {
      this.onceki = document.createElement('canvas');
      this.onceki.width = this.duragan.width;
      this.onceki.height = this.duragan.height;
      this.octx = this.onceki.getContext('2d');
      return !!this.octx;
    } catch (e) {
      this.onceki = null; this.octx = null;
      return false;
    }
  },

  katmanDegisti() { this.katmanSurum++; this.cizim.gecerli = false; },
  kirlet() { this.cizim.gecerli = false; },

  /* ------------------------------------------------------------
     Karo hazirligi: sekillerin sinir kutusu + yukseklik damgasi.
     Karo indigi anda ve arazi verisi degistiginde cagrilir.
     ------------------------------------------------------------ */
  /* blokHazirla'nin bolunebilir surumu — cikti birebir ayni.
     Yukseklik damgalama nokta basina bir arazi ornegi demek (olculdu:
     buyuk blokta 36 bin nokta), yani blok inince hissedilen donmanin
     buyuk kismi burada. Sekil kumeleri arasinda tarayiciya kare cizme
     firsati veriliyor. */
  async blokHazirlaBolerek(blok) {
    const s = blok && blok.sekil;
    if (!s) return;
    for (const kume of [s.yollar, s.binalar, s.alanlar, s.kiyi]) {
      for (const o of kume) for (const p of o.nokta) p.z = Arazi.latLonYukseklik(p.lat, p.lon);
      await Nefes.ver();
    }
    this._blokHazirlaKalan(blok, s);
  },

  blokHazirla(blok) {
    const s = blok && blok.sekil;
    if (!s) return;
    // yukseklik damgala
    for (const kume of [s.yollar, s.binalar, s.alanlar, s.kiyi]) {
      for (const o of kume) for (const p of o.nokta) p.z = Arazi.latLonYukseklik(p.lat, p.lon);
    }
    this._blokHazirlaKalan(blok, s);
  },

  /* Damgalamadan sonraki kisim — her iki surum de bunu kullaniyor. */
  _blokHazirlaKalan(blok, s) {
    for (const p of s.poiler) p.z = Arazi.latLonYukseklik(p.lat, p.lon);
    for (const b of s.binalar) {
      let en = Infinity;
      for (const p of b.nokta) if (p.z < en) en = p.z;
      b.taban = en === Infinity ? 0 : en;
    }
    // sinir kutulari
    for (const kume of [s.yollar, s.binalar, s.alanlar, s.kiyi]) {
      for (const o of kume) {
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, zEnCok = 0;
        for (const p of o.nokta) {
          if (p.x < minx) minx = p.x;
          if (p.x > maxx) maxx = p.x;
          if (p.y < miny) miny = p.y;
          if (p.y > maxy) maxy = p.y;
          if (p.z > zEnCok) zEnCok = p.z;
        }
        o._kutu = { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
        o._zEnCok = zEnCok;
      }
    }
    // Karonun kendi en yuksek noktasi. Eleme payi icin haritanin genel
    // en yuksegini kullanmak yakinlasinca payi ekran boyundan buyuk yapip
    // elemeyi tamamen devre disi birakiyordu.
    let zc = 0;
    for (const kume of [s.yollar, s.binalar, s.alanlar, s.kiyi]) {
      for (const o of kume) if (o._zEnCok > zc) zc = o._zEnCok;
    }
    blok.zEnCok = zc;
    blok.araziSurum = Arazi.surum;
  },

  /* Gorunen karolardaki sekilleri tek listede topla (id'ye gore tekilleyerek —
     bir yol iki karoda gorunuyorsa iki kere cizilmesin). */
  /* ------------------------------------------------------------
     Cizilecek sekilleri topla.

     Iki onemli kural:

     1) HER SEVIYEDEN karo alinir, sadece o anki seviyeden degil.
        Yakinlasinca seviye degisiyor ve yeni karolar inene kadar
        ekran bombos kaliyordu; simdi eldeki kaba veri gorunmeye
        devam ediyor, ince veri gelince uzerine biniyor.

     2) Once KARO kutusu elenir, sonra sekiller. Ekranda olmayan bir
        karonun binlerce yolunu tek tek elemek bosa is.
     ------------------------------------------------------------ */
  _damgaNo: 0,

  sekilleriTopla() {
    let gorunenKarolar = [];
    for (const v of Karolar.depo.values()) {
      if (v.durum !== 'hazir' || !v.metreKutu || !v.blok) continue;
      if (!this.gorunur(v.metreKutu, 0, Arazi.cz(v.blok.zEnCok || 0) + 130)) continue;
      gorunenKarolar.push(v);
    }

    /* Kaba karolar, ince karolar gelene kadar bosluk olmasin diye duruyor.
       Onlari ancak bu seviye gorunen alanin TAMAMINI kapladiginda dusuruyoruz.
       Sadece "yukleme bitti" demek yetmez: cok uzaktaysak (ENFAZLA_GORUNEN)
       hic karo istenmemis olabilir, o zaman ekranin yarisi bosalirdi. */
    if (Karolar.seviyeTamMi()) {
      const suSeviye = gorunenKarolar.filter(v => v.seviye === Karolar.seviye);
      if (suSeviye.length) gorunenKarolar = suSeviye;
    }

    /* Ayni blok birden cok karo tarafindan paylasilir; damgalama ve
       toplama blok basina BIR KERE yapilmali. */
    const bloklar = [];
    for (const k of gorunenKarolar) {
      const b = k.blok;
      if (bloklar.indexOf(b) >= 0) continue;
      bloklar.push(b);
      if (b.araziSurum !== Arazi.surum) this.blokHazirla(b);
    }

    // tekilleme: Set + metin anahtar yerine sayisal damga (cok daha hizli)
    const d = ++this._damgaNo;
    const t = { yollar: [], binalar: [], alanlar: [], kiyi: [], poiler: [], poiSay: {} };
    for (const b of bloklar) {
      const s = b.sekil;
      for (const y of s.yollar)  { if (y._d === d) continue; y._d = d; t.yollar.push(y); }
      for (const b of s.binalar) { if (b._d === d) continue; b._d = d; t.binalar.push(b); }
      for (const a of s.alanlar) { if (a._d === d) continue; a._d = d; t.alanlar.push(a); }
      for (const c of s.kiyi)    { if (c._d === d) continue; c._d = d; t.kiyi.push(c); }
      for (const p of s.poiler)  { if (p._d === d) continue; p._d = d; t.poiler.push(p);
                                   t.poiSay[p.tur] = (t.poiSay[p.tur] || 0) + 1; }
    }

    /* BINALAR AKTIF SEVIYEDEN BAGIMSIZ.
       Bina yalnizca mahalle seviyesinde iniyor. Eskiden bir tik uzaklasip
       seviye ilce'ye dusunce elde duran bina verisi cizimden de dusuyor,
       geri yakinlasinca yeniden inmesi bekleniyordu. Veri zaten bellekte —
       aktif seviyede bina yoksa elde kalan mahalle bloklarindan aliyoruz.
       Boylece bir kere yuklenen bina bir daha bekletmiyor; sadece
       BINA_ENAZ_OLCEK'in altina inince (cok uzaklasinca) birakiyorlar,
       cunku o olcekte hem secilmiyorlar hem de bosuna maliyet. */
    if (!Overpass.DETAY[Karolar.seviye].bina && Kamera.olcek >= this.BINA_ENAZ_OLCEK) {
      for (const blok of Karolar.binaliBloklar()) {
        // arazi guncellendiyse yukseklik damgasi tazelensin
        if (blok.araziSurum !== Arazi.surum) this.blokHazirla(blok);
        for (const b of blok.sekil.binalar) {
          if (b._d === d) continue;
          b._d = d;
          t.binalar.push(b);
        }
      }
    }

    this._toplam = t;
    this._binaSiraAci = null;
    return t;
  },

  binaSirala(binalar) {
    if (this._binaSiraAci === Kamera.aci) return;
    const c = Math.cos(Kamera.aci), s = Math.sin(Kamera.aci);
    for (const b of binalar) {
      const k = b._kutu;
      const mx = (k.minx + k.maxx) / 2, my = (k.miny + k.maxy) / 2;
      b._sira = (mx * c - my * s) + (mx * s + my * c);
    }
    binalar.sort(function (a, b) { return b._sira - a._sira; });
    this._binaSiraAci = Kamera.aci;
  },

  /* Tamponun kapsadigi ekran alani (marj dahil) icinde mi? */
  gorunur(kutu, pay, dikeyMetre) {
    pay = (pay || 0) + this.MARJ;
    const k = kutu;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const koseler = [[k.minx, k.miny], [k.maxx, k.miny], [k.minx, k.maxy], [k.maxx, k.maxy]];
    for (const c of koseler) {
      const p = Kamera.ekrana(c[0], c[1], 0);
      if (p.sx < minx) minx = p.sx;
      if (p.sx > maxx) maxx = p.sx;
      if (p.sy < miny) miny = p.sy;
      if (p.sy > maxy) maxy = p.sy;
    }
    const dikeyPiksel = (dikeyMetre || 0) * IZO_Z * Kamera.olcek;
    return !(maxx < -pay || minx > Kamera.genislik + pay ||
             maxy < -pay || miny > Kamera.yukseklik + pay + dikeyPiksel);
  },

  dikeyi(o, ekstra) { return Arazi.cz(o._zEnCok || 0) + (ekstra || 0); },

  /* Ekranda (marj dahil) gorunen dunya bolgesi, metre */
  gorunenBolge(payMetre) {
    const m = this.MARJ;
    const k = [
      Kamera.dunyaya(-m, -m),
      Kamera.dunyaya(Kamera.genislik + m, -m),
      Kamera.dunyaya(-m, Kamera.yukseklik + m),
      Kamera.dunyaya(Kamera.genislik + m, Kamera.yukseklik + m)
    ];
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of k) {
      if (p.x < minx) minx = p.x;
      if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y;
      if (p.y > maxy) maxy = p.y;
    }
    const pay = payMetre || 0;
    return { minx: minx - pay, miny: miny - pay, maxx: maxx + pay, maxy: maxy + pay };
  },

  /* ------------------------------------------------------------
     Tampon gecerli mi? Gecersizse yeniden cizim gerekir.
     ------------------------------------------------------------ */
  tamponGecerli() {
    const c = this.cizim;
    if (!c.gecerli) return false;
    if (c.aci !== Kamera.aci) return false;
    if (c.surum !== Karolar.surum || c.seviye !== Karolar.seviye) return false;
    if (c.katmanSurum !== this.katmanSurum) return false;
    if (c.araziSurum !== Arazi.surum || c.abartma !== Arazi.abartma) return false;
    // olcek degisimi: %0.5'ten fazlaysa netlik bozulur
    if (Math.abs(Kamera.olcek / c.olcek - 1) > 0.005) return false;
    // kaydirma marji tuketti mi
    if (Math.abs(Kamera.panX - c.panX) > this.MARJ * 0.8) return false;
    if (Math.abs(Kamera.panY - c.panY) > this.MARJ * 0.8) return false;
    return true;
  },

  /* Hareket halindeyken bulanik da olsa akici kalmak icin
     tampon ne kadar bozulabilir (daha gevsek esikler) */
  tamponKabulEdilir() {
    const c = this.cizim;
    if (!c.gecerli) return false;
    if (c.aci !== Kamera.aci) return false;
    if (c.katmanSurum !== this.katmanSurum) return false;
    if (Kamera.olcek / c.olcek > 2.5 || Kamera.olcek / c.olcek < 0.4) return false;
    if (Math.abs(Kamera.panX - c.panX) > this.MARJ * 0.98) return false;
    if (Math.abs(Kamera.panY - c.panY) > this.MARJ * 0.98) return false;
    return true;
  },

  /* ---------------- DURAGAN KATMAN ---------------- */

  duraganCiz() {
    const t0 = performance.now();
    const c = this.dctx;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = RENK.gokyuzu;
    c.fillRect(0, 0, this.offGen, this.offYuk);
    c.restore();

    const t = this.sekilleriTopla();
    const kaba = this.kabaMod;

    /* Asama asama sure. Bir yavaslikta neyin pahali oldugunu tahmin etmek
       yerine konsoldan `Cizer.sureler` ile bakilabilir (arazi/yollar/binalar
       ayri ayri, ms). Maliyeti birkac performance.now cagrisi. */
    const s0 = performance.now();
    if (this.katman.arazi && Arazi.hazir) this.araziCiz(c, kaba);
    const s1 = performance.now();
    if (this.katman.kiyi) this.kiyiCiz(c, t.kiyi);
    if (this.katman.alanlar) this.alanlarCiz(c, t.alanlar);
    const s2 = performance.now();
    this.yollarCiz(c, t.yollar, kaba);
    const s3 = performance.now();
    /* Olcek esigi BURADA da kontrol ediliyor: sekilleriTopla onbellekli ve
       yeni seviyenin karolari daha inmemisken eski (binali) liste elde
       kalabiliyor. Cizim aninda bakinca "cok uzaklasinca birak" kurali
       onbellek durumundan bagimsiz kesinlesiyor. */
    if (this.katman.binalar && t.binalar.length && Kamera.olcek >= this.BINA_ENAZ_OLCEK)
      this.binalarCiz(c, t.binalar, kaba);
    const s4 = performance.now();
    if (!kaba) this.poilerCiz(c, t.poiler);
    if (this.katman.grafikDugum) this.dugumlerCiz(c);
    if (this.katman.yolAdlari && !kaba) this.yolAdlariCiz(c, t.yollar);
    const s5 = performance.now();
    this.sureler = {
      arazi: Math.round(s1 - s0), alanKiyi: Math.round(s2 - s1),
      yollar: Math.round(s3 - s2), binalar: Math.round(s4 - s3),
      poiAd: Math.round(s5 - s4)
    };

    this.cizim.panX = Kamera.panX;
    this.cizim.panY = Kamera.panY;
    this.cizim.olcek = Kamera.olcek;
    this.cizim.aci = Kamera.aci;
    this.cizim.surum = Karolar.surum;
    this.cizim.seviye = Karolar.seviye;
    this.cizim.katmanSurum = this.katmanSurum;
    this.cizim.araziSurum = Arazi.surum;
    this.cizim.abartma = Arazi.abartma;
    this.cizim.gecerli = true;
    this.sonSure = performance.now() - t0;
    /* Tek cizimin suresi cok gurultulu (JIT isinmasi, veri akisi). Normal
       (kaba olmayan) cizimlerin ortalamasini tutuyoruz. */
    if (!kaba) { this._nSure = (this._nSure || 0) + this.sonSure; this._nSay = (this._nSay || 0) + 1; }
  },

  /* ------------------------------------------------------------
     ARAZI — gri tonlu, egim golgelemeli izometrik yuzey.
     Deniz ve kara AYNI agda: geometride yukseklik 0'in altina
     inmez (deniz duz), renk gercek kota gore secilir -> kiyida
     catlak olusmaz.
     ------------------------------------------------------------ */
  araziCiz(c, kaba) {
    /* YUKSEKLIK TELAFISI.
       Arazi hucreleri z ile ekranda YUKARI kayiyor (Kamera.ekrana'da z
       yalnizca sy'yi azaltiyor). gorunenBolge ise z=0 duzleminde
       hesaplaniyor — yani "ekranin altinda" saydigi hucreler, kendi
       yukseklikleriyle birlikte aslinda ekrana giriyor. O hucreler
       izgaraya hic girmedigi icin ekranin alt kismi tamamen bos
       kaliyor, arka plan rengi gorunuyordu. Olculdu: olcek 5'te
       goruntunun %41'i gokyuzu rengindeydi (rgb(6,8,11)).
       Kayma = yukseklik * abartma * IZO_Z * olcek piksel oldugu icin
       YAKINLASTIKCA buyuyor; "zoom yapinca zemin kayboluyor /
       kare sinirlari cikiyor" sikayetinin sebebi buydu.
       Cozum: bolgeyi hesaplarken ekranin ALT kenarini, en yuksek
       noktanin yapacagi kayma kadar asagi tasiyoruz. Tavan koyuyoruz,
       yoksa cok abartilmis yukseklikte izgara gereksiz buyuyor. */
    /* Bolgeyi BUYUTMEK degil KAYDIRMAK gerekiyor.
       Kamera.dunyaya z=0 duzleminde calisiyor; arazi ise z=yukseklik*abartma
       duzleminde duruyor. Olculdu: yerel yukseklik 154 m, abartma 6 -> arazi
       ekranda 3762 piksel yukari kaymis. Buyuterek yakalamaya calismak
       bolgeyi ve hucre sayisini patlatiyor (denendi: arazi tek duz renge
       indi). Dogrusu ekran koselerini ARAZI DUZLEMINE goturmek: sy'ye kayma
       eklemek tam olarak bu (bkz. Kamera.ekrana, z yalnizca sy terimine
       giriyor). Boylece ALAN AYNI KALIR, hucre sayisi ve maliyet degismez.
       Ustune yerel yukseklik FARKI kadar pay — yamaclarda hucreler farkli
       miktarda kayiyor. */
    const om = Kamera.dunyaya(Kamera.genislik / 2, Kamera.yukseklik / 2);
    const yYerel = Math.max(0, Arazi.metreYukseklik(om.x, om.y));
    const dikey = Arazi.abartma * IZO_Z * Kamera.olcek;
    const kay = yYerel * dikey;

    /* Yamac payi YEREL yukseklik farkindan. Onceden Arazi.enCok-enAz
       kullaniliyordu — bu bellekteki BUTUN karolarin araligi (olcumde
       208 m). Ekranda 580 m'lik duz bir alan varken bile bolgeyi 2834 m
       yapiyor, yani 81 bin hucre geziliyor ve buyuk kismi ekran disinda
       elenmek uzere bosuna hesaplaniyordu (olculdu: arazi cizimin en
       pahali kalemi, yakin zoomda 13/17 ms). Ekranin dort kosesi + merkez
       yeterli bir yerel tahmin veriyor; ustune %25 emniyet payi. */
    const ornek = [om,
      Kamera.dunyaya(0, 0), Kamera.dunyaya(Kamera.genislik, 0),
      Kamera.dunyaya(0, Kamera.yukseklik), Kamera.dunyaya(Kamera.genislik, Kamera.yukseklik)];
    let yAz = Infinity, yCok = -Infinity;
    for (const p of ornek) {
      const v = Arazi.metreYukseklik(p.x, p.y);
      if (v === v) { if (v < yAz) yAz = v; if (v > yCok) yCok = v; }
    }
    let fark = (yCok >= yAz) ? (yCok - yAz) * 1.25 : 0;
    // yerel tahmin tutmazsa (tek nokta, hepsi esit) genel araliga sinirli pay
    if (fark < 20 && isFinite(Arazi.enCok) && isFinite(Arazi.enAz)) {
      fark = Math.min(20, Math.max(0, Arazi.enCok - Arazi.enAz));
    }
    /* Pay ASIMETRIK. Arazi yukseklikle hep YUKARI kayiyor; ekranin altini
       dolduracak hucreler bu yuzden asagida kaliyor ve asil pay oraya
       gerekiyor. Ustte ayni payi vermek bolgeyi bosuna buyutuyordu:
       olculdu, yakin zoomda bolge 1864 m iken ekran 581 m — hucrelerin
       buyuk kismi hesaplanip sonra eleniyordu. Ust pay 0.45 katsayili;
       yamacin ters yonde sapmasi icin yeterli, kapsama olculerek
       dogrulandi (cizilmemis alan %0). */
    const payAlt = Math.min(fark * dikey, Kamera.yukseklik * 3);
    const payUst = payAlt * 0.7;   // 0.45 denendi: kazanc gurultuye karisti, guvenli tarafta kaliyoruz
    const mj = this.MARJ;
    const koseler = [
      Kamera.dunyaya(-mj, -mj + kay - payUst),
      Kamera.dunyaya(Kamera.genislik + mj, -mj + kay - payUst),
      Kamera.dunyaya(-mj, Kamera.yukseklik + mj + kay + payAlt),
      Kamera.dunyaya(Kamera.genislik + mj, Kamera.yukseklik + mj + kay + payAlt)
    ];
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of koseler) {
      if (p.x < minx) minx = p.x;
      if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y;
      if (p.y > maxy) maxy = p.y;
    }
    if (maxx <= minx || maxy <= miny) return;

    /* Hucre boyu: ekranda ~19 piksel.

       enInce, orneklemenin inebilecegi ALT SINIR. Eskiden 8 m / veri
       cozunurluguydu: "verinin tasimadigi detayi ornekleme" mantigi dogru
       ama sonucu kotuydu — YAKINLASINCA hucre metre olarak sabit kaldigi
       icin ekranda buyuyor, arazi 50+ piksellik DUZ RENKLI eskenar
       dortgenlere donusuyordu. Her hucre tek renkle doldugu icin (duz
       golgeleme) aralarinda keskin sinirlar goruluyordu; zoom yapinca
       ortaya cikan "kare sinirlari / uzun duz cizgiler" buydu.

       Ara degerli ornekleme (Arazi._ornekle iki yonlu interpolasyon
       yapiyor) daha ince izgarada YENI detay uretmez ama yumusak bir
       gecis verir — yani hucreler ekranda hep ~21 piksel kalir ve
       basamaklar kaybolur. Hucre SAYISI degismedigi icin (adim'i
       hedefPiksel belirliyor) maliyet de artmiyor; asagidaki ENFAZLA
       tavani zaten koruyor. */
    const enInce = Math.max(2, Arazi.cozunurlukMetre() * 0.25);
    const hedefPiksel = kaba ? 30 : 17;
    let adim = Math.max(enInce, hedefPiksel / Math.max(Kamera.olcek, 1e-6));
    /* Bolge yukseklik telafisiyle buyudugu icin tavan da yukseltildi;
       yoksa adim buyuyup hucreler yeniden irilesiyor. */
    /* Kose tablosu Kamera.ekrana cagrilarini dortte bire indirdigi icin
       tavan yukseltilebiliyor: daha cok ama daha KUCUK hucre = yumusak
       arazi, kabaca ayni maliyet. */
    const ENFAZLA = kaba ? 22000 : 60000;
    const kabaSayi = ((maxx - minx) / adim) * ((maxy - miny) / adim);
    if (kabaSayi > ENFAZLA) adim *= Math.sqrt(kabaSayi / ENFAZLA);
    // adim'i "duzgun" bir sayiya yuvarla -> izgara onbellegi daha sik tutar
    const basamak = Math.pow(10, Math.floor(Math.log10(adim))) / 2;
    adim = Math.max(enInce, Math.round(adim / basamak) * basamak);

    /* Son arazi ciziminin sayilari — konsoldan `Cizer._tes` ile bakilabilir:
       izgara adimi, yukseklik telafisi (kay/pay), bolge boyu, hucre ve
       fill sayisi. Arazi cizimin en pahali kalemi oldugu icin duruyor. */
    this._tes = { adim: adim, kay: Math.round(kay), pay: Math.round(payAlt), yYerel: Math.round(yYerel),
                  genM: Math.round(maxx - minx), yukM: Math.round(maxy - miny) };
    const iz = Arazi.izgaraIste(minx, miny, maxx, maxy, adim);
    const h = iz.h, x0 = iz.x0, y0 = iz.y0, nx = iz.nx, ny = iz.ny;
    if (nx < 1 || ny < 1) return;

    // izgara gorunen bolgeden genis; sadece gerekli hucreleri dolas
    const iA = Math.max(0, Math.floor((minx - x0) / adim));
    const iB = Math.min(nx - 1, Math.ceil((maxx - x0) / adim));
    const jA = Math.max(0, Math.floor((miny - y0) / adim));
    const jB = Math.min(ny - 1, Math.ceil((maxy - y0) / adim));
    if (iB < iA || jB < jA) return;

    const LX = -0.55, LY = -0.55, LZ = 0.63;
    const ex = Arazi.abartma;
    const deniz = Arazi.denizSeviyesi;
    const ca = Math.cos(Kamera.aci), sa = Math.sin(Kamera.aci);
    const ddx = ca + sa, ddy = ca - sa;
    const iBas = ddx > 0 ? iB : iA, iSon = ddx > 0 ? iA - 1 : iB + 1, iAdim = ddx > 0 ? -1 : 1;
    const jBas = ddy > 0 ? jB : jA, jSon = ddy > 0 ? jA - 1 : jB + 1, jAdim = ddy > 0 ? -1 : 1;
    const gen = nx + 1;
    const sinirL = -this.MARJ - 4, sinirR = Kamera.genislik + this.MARJ + 4;
    const sinirU = -this.MARJ - 4, sinirD = Kamera.yukseklik + this.MARJ + 4;

    /* Kose ekran konumlarini BIR KERE hesapla.
       Her ic kose dort komsu hucrenin ortak kosesi; eskiden hucre basina
       dort ayri Kamera.ekrana cagrisi yapiliyordu, yani her nokta dort kez
       yansitiliyordu. Tabloya alinca bu is dortte bire iniyor — kazanilan
       payi izgarayi INCELTMEK icin harciyoruz, ki hucreler kucultsun ve
       arazi yumusasin. */
    const kw = iB - iA + 2, kh = jB - jA + 2;
    if (!this._kSX || this._kSX.length < kw * kh) {
      this._kSX = new Float64Array(kw * kh);
      this._kSY = new Float64Array(kw * kh);
    }
    const KSX = this._kSX, KSY = this._kSY;
    /* Projeksiyon burada ELDE yapiliyor, Kamera.ekrana cagrilmiyor: o her
       cagrida {sx, sy} nesnesi dondurdugu icin kose basina bir tahsis
       demekti — olculdu, yakin zoomda 62.500 kose. Ayni matematik, sifir
       tahsis. (Kamera.ekrana'nin kendisi baska yerlerde okunakli oldugu
       icin duruyor; burasi dongunün en sicak noktasi.) */
    Kamera._trig();
    const kc = Kamera._c, ks = Kamera._s;
    const kol = Kamera.olcek, kpx = Kamera.panX, kpy = Kamera.panY;
    const fx = IZO_X * kol, fy = IZO_Y * kol, fz = IZO_Z * kol;
    for (let jj = 0; jj < kh; jj++) {
      const cy = y0 + (jA + jj) * adim;
      const sat = jj * kw, hsat = (jA + jj) * gen + iA;
      for (let ii = 0; ii < kw; ii++) {
        const hv = h[hsat + ii];
        const cx = x0 + (iA + ii) * adim;
        const rx = cx * kc - cy * ks;
        const ry = cx * ks + cy * kc;
        KSX[sat + ii] = (rx - ry) * fx + kpx;
        KSY[sat + ii] = -(rx + ry) * fy - (hv > 0 ? hv : 0) * ex * fz + kpy;
      }
    }

    /* Renk onbellegi cizimler arasinda korunuyor: palet sabit, ayni
       kuantalanmis anahtar hep ayni rengi verir. */
    const RT = this._araziRT || (this._araziRT = new Map());
    let aktifRenk = null, acikPath = false, araziFill = 0, araziHucre = 0;
    for (let i = iBas; i !== iSon; i += iAdim) {
      for (let j = jBas; j !== jSon; j += jAdim) {
        araziHucre++;
        const h00 = h[j * gen + i],       h10 = h[j * gen + i + 1];
        const h01 = h[(j + 1) * gen + i], h11 = h[(j + 1) * gen + i + 1];
        const m00 = h00 > 0 ? h00 : 0, m10 = h10 > 0 ? h10 : 0;
        const m01 = h01 > 0 ? h01 : 0, m11 = h11 > 0 ? h11 : 0;

        const a = (j - jA) * kw + (i - iA), b = a + kw;
        const p00sx = KSX[a],      p00sy = KSY[a];
        const p10sx = KSX[a + 1],  p10sy = KSY[a + 1];
        const p01sx = KSX[b],      p01sy = KSY[b];
        const p11sx = KSX[b + 1],  p11sy = KSY[b + 1];

        if ((p00sx < sinirL && p10sx < sinirL && p11sx < sinirL && p01sx < sinirL) ||
            (p00sx > sinirR && p10sx > sinirR && p11sx > sinirR && p01sx > sinirR) ||
            (p00sy < sinirU && p10sy < sinirU && p11sy < sinirU && p01sy < sinirU) ||
            (p00sy > sinirD && p10sy > sinirD && p11sy > sinirD && p01sy > sinirD)) continue;

        const ort = (h00 + h10 + h01 + h11) * 0.25;
        let renk;
        if (ort !== ort) {
          /* Yukseklik verisi henuz gelmemis (NaN). Eskiden bu durumda 0 metre
             donuyordu, 0 metre de "deniz" demek oldugu icin yakinlasinca
             rastgele kareler koyu maviye boyaniyordu. Artik notr zemin tonu
             kullaniyoruz; karo inince kendiliginden duzeliyor. */
          renk = RENK.zemin;
        } else if (ort <= deniz) {
          renk = ort < -12 ? RENK.denizDerin : RENK.deniz;
        } else {
          /* Egim YALNIZ hucrenin kendi dort kosesinden hesaplaninca yukseklik
             verisindeki kucuk gurultu dogrudan golgeye yansiyip izgara deseni
             uretiyor: komsu hucreler birbirinden bagimsiz aydinlandigi icin
             arazi eskenar dortgenlere ayrilmis gibi gorunuyor. Tabani bir
             hucre genisletip komsu koseleri de katiyoruz — ayni egim bilgisi,
             belirgin sekilde daha az desen. Kenarda komsu yoksa hucrenin
             kendi kosesine duseriz. */
          const iL = i > 1 ? i - 2 : (i > 0 ? i - 1 : i);
          const iR = (i + 3 <= nx) ? i + 3 : ((i + 2 <= nx) ? i + 2 : i + 1);
          const jU = j > 1 ? j - 2 : (j > 0 ? j - 1 : j);
          const jD = (j + 3 <= ny) ? j + 3 : ((j + 2 <= ny) ? j + 2 : j + 1);
          const sol = (h[j * gen + iL] + h[(j + 1) * gen + iL]) * 0.5;
          const sag = (h[j * gen + iR] + h[(j + 1) * gen + iR]) * 0.5;
          const ust = (h[jU * gen + i] + h[jU * gen + i + 1]) * 0.5;
          const alt = (h[jD * gen + i] + h[jD * gen + i + 1]) * 0.5;
          const dzdx = (sol === sol && sag === sag && iR > iL)
            ? (sag - sol) / ((iR - iL) * adim) * ex
            : ((m10 + m11) - (m00 + m01)) / (2 * adim) * ex;
          const dzdy = (ust === ust && alt === alt && jD > jU)
            ? (alt - ust) / ((jD - jU) * adim) * ex
            : ((m01 + m11) - (m00 + m10)) / (2 * adim) * ex;
          const uz = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
          const nokta = (-dzdx * LX - dzdy * LY + LZ) * uz;
          let isik = 0.5 + 0.9 * nokta;
          isik = isik < 0.38 ? 0.38 : isik > 1.6 ? 1.6 : isik;
          /* Renk uretimi kuantalanip onbellege aliniyor. Arazi.renk her
             cagrisinda "rgb(...)" stringi birlestiriyordu — on binlerce
             hucrede tek basina ciddi yuk. 4 m yukseklik ve 1/16 isik adimi
             gozle secilmiyor, ama tablo birkac yuz girdiye iniyor. */
          const ank = (((ort * 0.25) | 0) * 64) + ((isik * 16) | 0);
          renk = RT.get(ank);
          if (renk === undefined) { renk = Arazi.renk(ort, isik); RT.set(ank, renk); }
        }

        /* Komsu hucreler ayni koseleri paylassa bile tarayicinin kenar
           yumusatmasi aralarinda sac teli kadar bosluk birakiyor. Eskiden
           bunu her hucreyi ayrica CIZEREK kapatiyorduk — cizim islemi
           dolgudan pahali oldugu icin arazi maliyeti iki katina cikiyordu.
           Onun yerine hucreyi merkezine gore %6 buyutuyoruz: komsular
           birbirinin uzerine biniyor, bosluk kalmiyor, tek dolgu yetiyor. */
        const mx = (p00sx + p10sx + p11sx + p01sx) * 0.25;
        const my = (p00sy + p10sy + p11sy + p01sy) * 0.25;
        const B = 1.06;

        /* ARDISIK AYNI RENKLI HUCRELER TEK PATH'TE.
           Eskiden hucre basina beginPath + fill vardi; yakin zoomda bu on
           binlerce fill demekti ve arazi cizimin en pahali parcasiydi.
           Arazi yumusatildigi icin komsu hucreler ayni kuantalanmis renge
           dusuyor, yani gruplar uzun cikiyor. Gruplar ARDISIK oldugu icin
           cizim sirasi — dolayisiyla derinlik sirasi — bozulmuyor. */
        if (renk !== aktifRenk) {
          if (acikPath) { c.fill(); araziFill++; }
          c.beginPath();
          c.fillStyle = renk;
          aktifRenk = renk;
          acikPath = true;
        }
        c.moveTo(mx + (p00sx - mx) * B, my + (p00sy - my) * B);
        c.lineTo(mx + (p10sx - mx) * B, my + (p10sy - my) * B);
        c.lineTo(mx + (p11sx - mx) * B, my + (p11sy - my) * B);
        c.lineTo(mx + (p01sx - mx) * B, my + (p01sy - my) * B);
        c.closePath();
      }
    }
    if (acikPath) { c.fill(); araziFill++; }
    if (this._tes) { this._tes.araziFill = araziFill; this._tes.araziHucre = araziHucre; }

    if (this.katman.esYukselti && !kaba)
      this.esYukseltiCiz(c, h, x0, y0, adim, nx, iA, iB, jA, jB);
  },

  /* Es yukselti egrileri (marching squares) */
  esYukseltiCiz(c, h, x0, y0, adim, nx, iA, iB, jA, jB) {
    if (Arazi.enCok - Arazi.enAz < 15) return;
    let kot = 25;
    const ekran = function (k) { return k * Arazi.abartma * IZO_Z * Kamera.olcek; };
    if (ekran(kot) < 9) kot = 50;
    if (ekran(kot) < 9) kot = 100;
    if (ekran(kot) < 6) return;

    const ex = Arazi.abartma, gen = nx + 1;
    const ara = function (xa, ya, ha, xb, yb, hb, L) {
      const t = (L - ha) / (hb - ha);
      return Kamera.ekrana(xa + (xb - xa) * t, ya + (yb - ya) * t, L * ex);
    };

    for (const anaEgri of [false, true]) {
      c.beginPath();
      let cizim = false;
      for (let i = iA; i <= iB; i++) {
        const cx0 = x0 + i * adim, cx1 = cx0 + adim;
        for (let j = jA; j <= jB; j++) {
          const cy0 = y0 + j * adim, cy1 = cy0 + adim;
          const a = h[j * gen + i], b = h[j * gen + i + 1];
          const d = h[(j + 1) * gen + i + 1], e = h[(j + 1) * gen + i];
          const eAz = Math.min(a, b, d, e), eCok = Math.max(a, b, d, e);
          if (eCok <= 0) continue;
          let L = Math.ceil(eAz / kot) * kot;
          for (; L <= eCok; L += kot) {
            if (L <= 0) continue;
            const kalin = (L % (kot * 4) === 0);
            if (kalin !== anaEgri) continue;
            const kod = (a >= L ? 1 : 0) | (b >= L ? 2 : 0) | (d >= L ? 4 : 0) | (e >= L ? 8 : 0);
            if (kod === 0 || kod === 15) continue;
            let p1 = null, p2 = null;
            switch (kod) {
              case 1: case 14: case 5: case 10:
                p1 = ara(cx0, cy0, a, cx0, cy1, e, L); p2 = ara(cx0, cy0, a, cx1, cy0, b, L); break;
              case 2: case 13:
                p1 = ara(cx0, cy0, a, cx1, cy0, b, L); p2 = ara(cx1, cy0, b, cx1, cy1, d, L); break;
              case 3: case 12:
                p1 = ara(cx0, cy0, a, cx0, cy1, e, L); p2 = ara(cx1, cy0, b, cx1, cy1, d, L); break;
              case 4: case 11:
                p1 = ara(cx1, cy0, b, cx1, cy1, d, L); p2 = ara(cx0, cy1, e, cx1, cy1, d, L); break;
              case 6: case 9:
                p1 = ara(cx0, cy0, a, cx1, cy0, b, L); p2 = ara(cx0, cy1, e, cx1, cy1, d, L); break;
              case 7: case 8:
                p1 = ara(cx0, cy0, a, cx0, cy1, e, L); p2 = ara(cx0, cy1, e, cx1, cy1, d, L); break;
            }
            if (p1 && p2) { c.moveTo(p1.sx, p1.sy); c.lineTo(p2.sx, p2.sy); cizim = true; }
          }
        }
      }
      if (cizim) {
        c.strokeStyle = anaEgri ? RENK.esYukseltiAna : RENK.esYukselti;
        c.lineWidth = anaEgri ? 1.1 : 0.7;
        c.stroke();
      }
    }
  },

  kiyiCiz(c, kiyi) {
    if (!kiyi.length) return;
    c.strokeStyle = RENK.kiyiCizgi;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.6;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    /* Yollardaki ile ayni kirpma: bir kiyi cizgisi on kilometrelerce
       surebiliyor ve kutusu ekrani kestigi icin butun noktalariyla
       ciziliyordu. Yakinlasinca ekran disindaki katbekat buyuyen
       koordinatlar cizimi bozuyordu. */
    const M = this.MARJ + 40;
    const sL = -M, sR = Kamera.genislik + M, sU = -M, sD = Kamera.yukseklik + M;
    for (const k of kiyi) {
      if (!this.gorunur(k._kutu, 0, this.dikeyi(k))) continue;
      c.beginPath();
      let ox = 0, oy = 0, kalem = false, ilk = true;
      for (let i = 0; i < k.nokta.length; i++) {
        const p = k.nokta[i];
        const e = Kamera.ekrana(p.x, p.y, Arazi.cz(p.z > 0 ? p.z : 0) + 0.5);
        if (ilk) { ox = e.sx; oy = e.sy; ilk = false; continue; }
        const disarida = (ox < sL && e.sx < sL) || (ox > sR && e.sx > sR) ||
                         (oy < sU && e.sy < sU) || (oy > sD && e.sy > sD);
        if (disarida) {
          kalem = false;
        } else {
          if (!kalem) { c.moveTo(ox, oy); kalem = true; }
          c.lineTo(e.sx, e.sy);
        }
        ox = e.sx; oy = e.sy;
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  },

  alanlarCiz(c, alanlar) {
    for (const a of alanlar) {
      if (!this.gorunur(a._kutu, 0, this.dikeyi(a))) continue;
      c.beginPath();
      for (let i = 0; i < a.nokta.length; i++) {
        const n = a.nokta[i];
        const p = Kamera.ekrana(n.x, n.y, Arazi.cz(n.z) + 0.4);
        if (i === 0) c.moveTo(p.sx, p.sy); else c.lineTo(p.sx, p.sy);
      }
      if (a.cizgi) {
        c.strokeStyle = RENK.su;
        c.lineWidth = Math.max(1.5, 6 * Kamera.olcek);
        c.lineCap = 'round';
        c.stroke();
      } else {
        c.closePath();
        c.fillStyle = a.tur === 'su' ? RENK.su
                    : a.tur === 'orman' ? RENK.orman
                    : a.tur === 'saha' ? RENK.saha : RENK.yesil;
        c.fill();
        c.strokeStyle = (a.tur === 'su') ? RENK.suKenar : RENK.yesilKenar;
        c.lineWidth = 1;
        c.stroke();
      }
    }
  },

  /* Yollar: kenarlik gecisi + ic gecis. NFS hissi icin ana yollar parlak. */
  yollarCiz(c, yollar, kaba) {
    const gorunen = [];
    for (const y of yollar) {
      if (kaba && (y.sinif === 'yaya' || y.sinif === 'servis')) continue;
      if (this.gorunur(y._kutu, 0, this.dikeyi(y, 8))) gorunen.push(y);
    }
    const oncelik = { yaya: 0, servis: 1, kucuk: 2, orta: 3, ana: 4 };
    /* Ikincil olcut `en`: toplu cizimde ardisik ayni renk+kalinliktakiler tek
       path'te birlesiyor. Sadece sinifa gore sirali oldugunda ayni sinifin
       farkli genislikleri (otoyol 20 m, ana yol 13 m) birbirine karisip grubu
       her seferinde bolüyordu. Ayni sinif ayni renkte cizildigi icin bu ek
       siralamanin gorsel etkisi yok. */
    gorunen.sort(function (a, b) {
      const d = oncelik[a.sinif] - oncelik[b.sinif];
      return d !== 0 ? d : a.en - b.en;
    });

    c.lineCap = 'round';
    c.lineJoin = 'round';

    /* Her yol iki (bazen uc) gecisde ciziliyor: kenarlik, ic, serit cizgisi.
       Noktalari her gecisde yeniden yansitmak isin yarisini bosa harciyordu.
       Bir kere yansitip duz bir dizide saklayip tekrar oynatiyoruz. */
    let ucSayisi = 0;
    for (const y of gorunen) ucSayisi += y.nokta.length;
    if (!this._yolTampon || this._yolTampon.length < ucSayisi * 2) {
      this._yolTampon = new Float64Array(Math.max(4096, ucSayisi * 2));
    }
    const T = this._yolTampon;
    let yaz = 0;
    for (const y of gorunen) {
      y._bas = yaz;
      const n = y.nokta, ek = 1 + (y.kopru ? 6 : 0);
      for (let i = 0; i < n.length; i++) {
        const p = Kamera.ekrana(n[i].x, n[i].y, Arazi.cz(n[i].z) + ek);
        T[yaz++] = p.sx; T[yaz++] = p.sy;
      }
    }

    /* Yolu ACIK path'e ekler (beginPath cagirmaz) — toplu cizim icin.

       Ekran disina tasan parcalar KIRPILIYOR. Sebebi: bir otoyol on
       kilometrelerce surebiliyor ve kutusu ekrani kestigi icin butun
       noktalariyla path'e giriyordu. Yakinlastikca o uzak uclar yuz
       binlerce piksellik koordinatlara ciktigi icin canvas cizimi
       bozuluyor (uzun nesnelerde gorunen artifact bundandi) — ustelik
       hicbiri ekranda gorunmuyor. Iki ucu da ayni kenarin disinda kalan
       parcayi atlayip path'i koparıyoruz: hem goruntu duzeliyor hem is
       azaliyor. Kismen goruntudeki parca oldugu gibi ciziliyor, yani
       cizgi yonu ve baglantilar bozulmuyor. */
    const M = this.MARJ + 40;
    const sL = -M, sR = Kamera.genislik + M, sU = -M, sD = Kamera.yukseklik + M;
    const yolEkle = function (y) {
      let k = y._bas;
      const son = k + y.nokta.length * 2;
      let ox = T[k], oy = T[k + 1];
      let kalem = false;
      for (k += 2; k < son; k += 2) {
        const x = T[k], yy = T[k + 1];
        const disarida = (ox < sL && x < sL) || (ox > sR && x > sR) ||
                         (oy < sU && yy < sU) || (oy > sD && yy > sD);
        if (disarida) {
          kalem = false;
        } else {
          if (!kalem) { c.moveTo(ox, oy); kalem = true; }
          c.lineTo(x, yy);
        }
        ox = x; oy = yy;
      }
    };

    /* Uzak olcekte gercek genislik 0.5 piksele duser ve otoyolla ara sokak
       ayni kalinliga inip harita lapa gibi gorunur. Her sinifin alt siniri var. */
    const ENAZ = { ana: 2.3, orta: 1.5, kucuk: 0.85, servis: 0.6, yaya: 0.5 };

    /* Eskiden her yol icin ayri stroke() vardi — ucu gecisle birlikte yol
       sayisinin uc kati stroke. Ardisik AYNI renk+kalinliktaki yollari tek
       path'te topluyoruz; liste zaten sinifa gore sirali oldugu icin gruplar
       buyuk cikiyor, binlerce stroke onlarcaya iniyor. Ayni stille cizilen
       cizgiler oldugu icin gorunum birebir ayni. */
    let sRenk = null, sKal = -1, acik = false, biriken = 0;
    /* Tek path'i sinirsiz buyutmuyoruz: cok buyuk path'ler bazi tarayicilarda
       cizim hatasina yol aciyor. 8000 nokta hala binlerce stroke yerine birkac
       stroke demek, yani kazanci koruyor. */
    const PATH_SINIR = 8000;
    const bosalt = function () { if (acik) { c.stroke(); acik = false; biriken = 0; } };
    const grup = function (renk, kal) {
      if (acik && renk === sRenk && kal === sKal && biriken < PATH_SINIR) return;
      bosalt();
      c.beginPath();
      c.strokeStyle = renk;
      c.lineWidth = kal;
      sRenk = renk; sKal = kal; acik = true;
    };

    // 1. gecis: kenarlik
    for (const y of gorunen) {
      if (y.tunel) continue;
      grup(RENK.yolKenar[y.sinif],
           Math.max(ENAZ[y.sinif] + 1.4, (y.en + 2.8) * Kamera.olcek));
      yolEkle(y);
      biriken += y.nokta.length;
    }
    bosalt();

    // 2. gecis: ic dolgu (tuneller kesikli oldugu icin tek tek)
    sRenk = null; sKal = -1;
    for (const y of gorunen) {
      const kal = Math.max(ENAZ[y.sinif], y.en * Kamera.olcek);
      if (y.tunel) {
        bosalt(); sRenk = null; sKal = -1;
        c.beginPath();
        yolEkle(y);
        c.setLineDash([6, 6]);
        c.strokeStyle = RENK.yolKenar[y.sinif];
        c.lineWidth = kal;
        c.stroke();
        c.setLineDash([]);
        continue;
      }
      grup(RENK.yolIc[y.sinif], kal);
      yolEkle(y);
      biriken += y.nokta.length;
    }
    bosalt();

    // 3. gecis: serit cizgileri — hepsi ayni stil, tek path yeter
    if (!kaba && Kamera.olcek > 0.9) {
      c.setLineDash([9, 11]);
      c.lineWidth = Math.max(0.6, 0.5 * Kamera.olcek);
      c.strokeStyle = RENK.seritCizgi;
      c.globalAlpha = 0.32;
      c.beginPath();
      let varmi = false;
      for (const y of gorunen) {
        if ((y.sinif !== 'ana' && y.sinif !== 'orta') || y.tunel) continue;
        yolEkle(y);
        varmi = true;
      }
      if (varmi) c.stroke();
      c.globalAlpha = 1;
      c.setLineDash([]);
    }
  },

  binaTabanCiz(c, b) {
    const n = b.nokta;
    if (n.length < 3) return;
    const z = Arazi.cz(b.taban) + b.yukseklik * 0.5;
    c.beginPath();
    for (let i = 0; i < n.length; i++) {
      const p = Kamera.ekrana(n[i].x, n[i].y, z);
      if (i === 0) c.moveTo(p.sx, p.sy); else c.lineTo(p.sx, p.sy);
    }
    c.closePath();
    c.fillStyle = RENK.binaCati;
    c.fill();
  },

  binaCiz(c, b, kenarYol) {
    const zTaban = Arazi.cz(b.taban);
    const zTavan = zTaban + b.yukseklik;

    /* Nokta listesi hazirligi bina basina BIR KERE yapiliyor. Eskiden her
       cizimde kapanis noktasi icin slice() ve sarim icin slice().reverse()
       cagriliyordu — bina basina bir-iki yeni dizi, on binlerce bina ile
       her yeniden cizimde on binlerce tahsis. Geometri degismiyor (blokHazirla
       sadece ayni nokta nesnelerinin z'sini guncelliyor), yani onbelleklenebilir. */
    let pts = b._cizPts;
    if (pts === undefined) {
      pts = b.nokta;
      if (pts.length > 2) {
        const ilk = pts[0], son = pts[pts.length - 1];
        if (Math.abs(ilk.x - son.x) < 0.01 && Math.abs(ilk.y - son.y) < 0.01) pts = pts.slice(0, -1);
      }
      if (pts.length < 3) { b._cizPts = null; return; }
      let alan = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], d = pts[(i + 1) % pts.length];
        alan += a.x * d.y - d.x * a.y;
      }
      if (alan < 0) pts = pts.slice().reverse();
      b._cizPts = pts;
    }
    if (pts === null) return;

    const n = pts.length;
    /* Tamponlar bina basina yeniden ayrilmiyordu: mahalle seviyesinde on
       binlerce bina x 4 dizi = on binlerce gereksiz tahsis. Bir kere buyut,
       hep ayni diziyi kullan. (binaCiz kendi icinde baska cizim cagirmiyor,
       yani paylasim guvenli.) */
    if (!this._btx || this._btx.length < n) {
      this._btx = new Float64Array(n + 64);
      this._bty = new Float64Array(n + 64);
      this._buy = new Float64Array(n + 64);
    }
    const tx = this._btx, ty = this._bty, uy = this._buy;
    /* Catinin sx'i tabanla AYNI — yukseklik sadece sy'yi kaydiriyor
       (bkz. Kamera.ekrana: z yalnizca sy teriminde geciyor). Nokta basina
       ikinci donusum cagrisi bosunaydi; yerine tek cikarma. */
    const dy = (zTavan - zTaban) * IZO_Z * Kamera.olcek;
    for (let i = 0; i < n; i++) {
      const a = Kamera.ekrana(pts[i].x, pts[i].y, zTaban);
      tx[i] = a.sx; ty[i] = a.sy; uy[i] = a.sy - dy;
    }

    /* Duvarlar: eskiden kenar basina ayri beginPath+fill vardi (bina basina
       kenar sayisi kadar fill). Canvas'ta pahali olan sey path ve state
       degisimi, cizilen alan degil. Ayni renkteki duvarlari tek path'te
       toplayip iki fill'e indiriyoruz — alti kenarli tipik bir binada
       6 fill yerine 2. Gorunum birebir ayni: renk zaten kenarin yonune
       bagli, cizim sirasina degil. */
    let varA = false, varB = false;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = tx[j] - tx[i];
      if (!(dx > 0 || (dx === 0 && ty[j] - ty[i] > 0))) continue;   // arka yuz
      if (!((ty[j] - ty[i]) > 0)) continue;                          // bu tur A degil
      varA = true;
      c.moveTo(tx[i], ty[i]);
      c.lineTo(tx[j], ty[j]);
      c.lineTo(tx[j], uy[j]);
      c.lineTo(tx[i], uy[i]);
      c.closePath();
    }
    if (varA) { c.fillStyle = RENK.binaDuvarA; c.fill(); }

    c.beginPath();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = tx[j] - tx[i];
      if (!(dx > 0 || (dx === 0 && ty[j] - ty[i] > 0))) continue;   // arka yuz
      if ((ty[j] - ty[i]) > 0) continue;                             // A'yi atla
      varB = true;
      c.moveTo(tx[i], ty[i]);
      c.lineTo(tx[j], ty[j]);
      c.lineTo(tx[j], uy[j]);
      c.lineTo(tx[i], uy[i]);
      c.closePath();
    }
    if (varB) { c.fillStyle = RENK.binaDuvarB; c.fill(); }

    c.beginPath();
    c.moveTo(tx[0], uy[0]);
    for (let i = 1; i < n; i++) c.lineTo(tx[i], uy[i]);
    c.closePath();
    const ton = (b.id % 7) - 3;
    c.fillStyle = 'rgb(' + (43 + ton) + ',' + (49 + ton) + ',' + (56 + ton * 2) + ')';
    c.fill();

    /* Cati kenari: bina basina stroke() cagirmak yerine hepsi tek Path2D'de
       birikiyor, binalarCiz sonunda TEK stroke ile ciziliyor. Kenar rengi ve
       kalinligi butun binalarda ayni oldugu icin gorunum degismiyor. */
    if (kenarYol) {
      kenarYol.moveTo(tx[0], uy[0]);
      for (let i = 1; i < n; i++) kenarYol.lineTo(tx[i], uy[i]);
      kenarYol.closePath();
    } else {
      c.strokeStyle = RENK.binaKenar;
      c.lineWidth = 0.7;
      c.stroke();
    }
  },

  /* Ekranda bu kadar pikselden kucuk kalan bina icin duvar cizmenin anlami
     yok — birkac piksellik lekede 3B goruntu zaten secilmiyor, ama duvarlar
     bina basina kenar sayisi kadar path demek. Sadece tabani cizmek ayni
     goruntuyu cok daha ucuza veriyor. */
  KUCUK_BINA_PIKSEL: 5,

  /* Bir kere inen binalar bu olcegin ustunde cizilmeye devam eder — aktif
     detay seviyesi bina cekmiyor olsa bile (bkz. sekilleriTopla). Altinda
     birakiyorlar: o olcekte bina zaten birkac piksel, secilmiyor.
     0.28 = bolge/ilce sinirinin ta kendisi, yani ilce seviyesinde binalar
     duruyor, bolgeye cikinca kayboluyor. */
  BINA_ENAZ_OLCEK: 0.28,

  binalarCiz(c, binalar, kaba) {
    this.binaSirala(binalar);
    if (kaba) {
      for (const b of binalar) {
        if (!this.gorunur(b._kutu, 0, Arazi.cz(b.taban) + b.yukseklik)) continue;
        this.binaTabanCiz(c, b);
      }
      return;
    }
    const kucukEsik = this.KUCUK_BINA_PIKSEL / (IZO_X * Kamera.olcek);  // metre karsiligi
    const kenarYol = (typeof Path2D !== 'undefined') ? new Path2D() : null;
    for (const b of binalar) {
      if (!this.gorunur(b._kutu, 0, Arazi.cz(b.taban) + b.yukseklik)) continue;
      const k = b._kutu;
      if ((k.maxx - k.minx) < kucukEsik && (k.maxy - k.miny) < kucukEsik) {
        this.binaTabanCiz(c, b);
        continue;
      }
      this.binaCiz(c, b, kenarYol);
    }
    if (kenarYol) {
      c.strokeStyle = RENK.binaKenar;
      c.lineWidth = 0.7;
      c.stroke(kenarYol);
    }
  },

  /* ---------------- DURAKLAR (ikonlu) ---------------- */
  poilerCiz(c, poiler) {
    if (!poiler.length) return;
    const boy = Math.max(6, Math.min(30, 16 / Math.max(Kamera.olcek, 0.03)));
    const r = 7;
    const sinirL = -this.MARJ - 20, sinirR = Kamera.genislik + this.MARJ + 20;
    const sinirU = -this.MARJ - 40, sinirD = Kamera.yukseklik + this.MARJ + 20;

    for (const p of poiler) {
      if (!this.katman.poi[p.tur]) continue;
      const z = Arazi.cz(p.z);
      const taban = Kamera.ekrana(p.x, p.y, z);
      if (taban.sx < sinirL || taban.sx > sinirR ||
          taban.sy < sinirU || taban.sy > sinirD) continue;
      const tepe = Kamera.ekrana(p.x, p.y, z + boy);
      const st = Overpass.POI[p.tur];

      // direk
      c.beginPath();
      c.moveTo(taban.sx, taban.sy);
      c.lineTo(tepe.sx, tepe.sy);
      c.strokeStyle = st.renk;
      c.globalAlpha = 0.7;
      c.lineWidth = 1.3;
      c.stroke();
      c.globalAlpha = 1;

      if (p.tur === 'otopark') {
        // otopark: dogrudan mavi levha (rozet gerekmiyor)
        Ikon.otopark(c, tepe.sx, tepe.sy, r * 0.82);
      } else {
        // rozet
        c.beginPath();
        c.arc(tepe.sx, tepe.sy, r, 0, Math.PI * 2);
        c.fillStyle = st.renk;
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 1;
        c.stroke();
        // ikon (rozetin uzerine koyu)
        c.fillStyle = 'rgba(8,11,16,0.92)';
        c.strokeStyle = 'rgba(8,11,16,0.92)';
        c.lineCap = 'round';
        const ciz = Ikon[p.tur];
        if (ciz) ciz(c, tepe.sx, tepe.sy, r);
      }
    }
  },

  dugumlerCiz(c) {
    if (!Grafik.dugumler) return;
    c.fillStyle = RENK.dugum;
    c.globalAlpha = 0.85;
    const r = Math.max(1.2, 1.8 * Kamera.olcek);
    for (const d of Grafik.dugumler.values()) {
      if (!d.kavsak) continue;
      const p = Kamera.ekrana(d.x, d.y, Arazi.cz(Arazi.latLonYukseklik(d.lat, d.lon)) + 1.5);
      if (p.sx < -20 || p.sx > Kamera.genislik + 20 ||
          p.sy < -20 || p.sy > Kamera.yukseklik + 20) continue;
      c.beginPath();
      c.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  },

  yolAdlariCiz(c, yollar) {
    if (Kamera.olcek < 0.55) return;
    c.font = '11px system-ui, sans-serif';
    c.fillStyle = RENK.yazi;
    c.textAlign = 'center';
    const yazilan = new Set();
    for (const y of yollar) {
      if (!y.ad || yazilan.has(y.ad)) continue;
      if (!this.gorunur(y._kutu, 0, this.dikeyi(y, 4))) continue;
      const orta = y.nokta[Math.floor(y.nokta.length / 2)];
      const p = Kamera.ekrana(orta.x, orta.y, Arazi.cz(orta.z) + 2);
      if (p.sx < 40 || p.sx > Kamera.genislik - 40 ||
          p.sy < 20 || p.sy > Kamera.yukseklik - 20) continue;
      c.fillText(y.ad, p.sx, p.sy - 4);
      yazilan.add(y.ad);
    }
    c.textAlign = 'left';
  },

  /* ---------------- CANLI KATMAN ---------------- */

  isaretciCiz(c, x, y, z, renk, etiket, yukseklik) {
    yukseklik = yukseklik || 26;
    const taban = Kamera.ekrana(x, y, z);
    const tepe = Kamera.ekrana(x, y, z + yukseklik);

    c.beginPath();
    c.ellipse(taban.sx, taban.sy, 9, 4.5, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fill();
    c.strokeStyle = renk;
    c.globalAlpha = 0.6;
    c.lineWidth = 1.5;
    c.stroke();
    c.globalAlpha = 1;

    c.beginPath();
    c.moveTo(taban.sx, taban.sy);
    c.lineTo(tepe.sx, tepe.sy);
    c.strokeStyle = renk;
    c.lineWidth = 2;
    c.stroke();

    c.beginPath();
    c.arc(tepe.sx, tepe.sy, 5.5, 0, Math.PI * 2);
    c.fillStyle = renk;
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    c.stroke();

    if (etiket) {
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      const w = c.measureText(etiket).width + 10;
      c.fillStyle = 'rgba(6,8,11,0.85)';
      c.fillRect(tepe.sx - w / 2, tepe.sy - 24, w, 15);
      c.fillStyle = renk;
      c.fillText(etiket, tepe.sx, tepe.sy - 13);
      c.textAlign = 'left';
    }
  },

  rotaCiz(c, noktalar, renk, kalinlik) {
    if (!noktalar || noktalar.length < 2) return;
    c.beginPath();
    for (let i = 0; i < noktalar.length; i++) {
      const n = noktalar[i];
      const p = Kamera.ekrana(n.x, n.y, Arazi.cz(n.z || 0) + 2.5);
      if (i === 0) c.moveTo(p.sx, p.sy); else c.lineTo(p.sx, p.sy);
    }
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = (kalinlik || 4) + 3;
    c.stroke();
    c.strokeStyle = renk || RENK.rota;
    c.lineWidth = kalinlik || 4;
    c.stroke();
  },

  /* Kurye araci. Gittigi yonu gostermesi icin ok seklinde ciziliyor;
     ok metre dunyasinda dondurulup oyle yansitiliyor, yani izometrik
     goruntude yol boyunca dogru yone bakiyor (ekran uzerinde dondurmek
     bunu vermez, egik kamerada ok yanlis yone kayar).
     Govde zemine degil, kucuk bir yuksekliğe cizilip altina golge
     konuyor — arazinin uzerinde durdugu boylece belli oluyor. */
  kuryeCiz(c, x, y, z, aci, paket) {
    const BOY = 9, EN = 5.5;                 // metre
    const ileri = { x: Math.cos(aci), y: Math.sin(aci) };
    const yan = { x: -ileri.y, y: ileri.x };

    // ucgen: burun + iki arka kose (metre dunyasinda)
    const nokta = [
      { x: x + ileri.x * BOY,        y: y + ileri.y * BOY },
      { x: x - ileri.x * BOY * 0.55 + yan.x * EN, y: y - ileri.y * BOY * 0.55 + yan.y * EN },
      { x: x - ileri.x * BOY * 0.15,              y: y - ileri.y * BOY * 0.15 },
      { x: x - ileri.x * BOY * 0.55 - yan.x * EN, y: y - ileri.y * BOY * 0.55 - yan.y * EN }
    ];

    // golge (zeminde, saydam)
    c.beginPath();
    for (let i = 0; i < nokta.length; i++) {
      const p = Kamera.ekrana(nokta[i].x, nokta[i].y, z);
      if (i === 0) c.moveTo(p.sx, p.sy); else c.lineTo(p.sx, p.sy);
    }
    c.closePath();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fill();

    // govde (biraz yukarida)
    const YUKSEK = 6;
    c.beginPath();
    for (let i = 0; i < nokta.length; i++) {
      const p = Kamera.ekrana(nokta[i].x, nokta[i].y, z + YUKSEK);
      if (i === 0) c.moveTo(p.sx, p.sy); else c.lineTo(p.sx, p.sy);
    }
    c.closePath();
    c.fillStyle = RENK.kurye;
    c.fill();
    c.strokeStyle = 'rgba(8,11,16,0.85)';
    c.lineWidth = 1.2;
    c.stroke();

    // direk: govdeyi zemine bagla, yukseklik hissi versin
    const alt = Kamera.ekrana(x, y, z);
    const ust = Kamera.ekrana(x, y, z + YUKSEK);
    c.beginPath();
    c.moveTo(alt.sx, alt.sy);
    c.lineTo(ust.sx, ust.sy);
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 1.4;
    c.stroke();

    /* Elindeki paket sayisi: kapasite kisiti gorunur olsun diye govdenin
       ustunde kucuk bir rozet. 0 ise (subeye donuyor) yazilmiyor. */
    if (paket > 0) {
      const r = Kamera.ekrana(x, y, z + YUKSEK + 9);
      c.beginPath();
      c.arc(r.sx, r.sy, 8, 0, Math.PI * 2);
      c.fillStyle = 'rgba(8,11,16,0.85)';
      c.fill();
      c.strokeStyle = RENK.kurye;
      c.lineWidth = 1.4;
      c.stroke();
      c.fillStyle = '#e6edf5';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(paket), r.sx, r.sy + 0.5);
      c.textAlign = 'start';
      c.textBaseline = 'alphabetic';
    }
  },

  /* Rota uzerine gidis yonu oklari. Ok METRE dunyasinda kuruluyor
     (kuryedeki gibi): ekran uzerinde dondurmek egik kamerada oku
     yanlis yone baktirir. Oklar esit ARALIKLA degil esit MESAFEDE
     konuyor — yoksa kisa parcalarda ok yigilip uzun duz yollarda
     hic ok kalmiyor. */
  rotaOklariCiz(c, noktalar, renk) {
    if (!noktalar || noktalar.length < 2) return;
    const ARALIK = Math.max(40, 90 / Math.max(Kamera.olcek, 0.05));   // metre
    const BOY = ARALIK * 0.18, EN = BOY * 0.5;
    let birikim = ARALIK * 0.5;

    c.fillStyle = renk;
    for (let i = 0; i + 1 < noktalar.length; i++) {
      const a = noktalar[i], b = noktalar[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const uz = Math.hypot(dx, dy);
      if (uz < 1e-6) continue;
      const ix = dx / uz, iy = dy / uz;      // ileri birim vektor
      const yx = -iy, yy = ix;               // yan birim vektor

      let m = birikim;
      while (m < uz) {
        const az = a.z || 0, bz = b.z || 0;
        const px = a.x + ix * m, py = a.y + iy * m;
        const pz = Arazi.cz(az + (bz - az) * (m / uz)) + 3.5;
        const u  = Kamera.ekrana(px + ix * BOY, py + iy * BOY, pz);
        const s1 = Kamera.ekrana(px - ix * BOY * 0.3 + yx * EN, py - iy * BOY * 0.3 + yy * EN, pz);
        const s2 = Kamera.ekrana(px - ix * BOY * 0.3 - yx * EN, py - iy * BOY * 0.3 - yy * EN, pz);
        c.beginPath();
        c.moveTo(u.sx, u.sy);
        c.lineTo(s1.sx, s1.sy);
        c.lineTo(s2.sx, s2.sy);
        c.closePath();
        c.fill();
        m += ARALIK;
      }
      birikim = m - uz;
    }
  },

  /* ---------------- ANA CIZIM ---------------- */

  /* Tamponu ekrana yapistir. Olcek degistiyse olcekleyerek yapistirir
     (bulanik ama akici) — hareket bitince net cizim gelir. */
  /* Bir tamponu, cizildigi kamera durumuna gore ekrana yapistir.
     Matematik birebir dogru olmali (test edildi: 0.000000000 px sapma),
     yoksa kaydirirken goruntu kayar. */
  tamponuYapistirGenel(tampon, ci, saydamlik) {
    const c = this.ctx;
    const k = Kamera.olcek / ci.olcek;
    const hx = (-this.MARJ - ci.panX) * k + Kamera.panX;
    const hy = (-this.MARJ - ci.panY) * k + Kamera.panY;
    c.imageSmoothingEnabled = (k !== 1);
    if (saydamlik !== undefined && saydamlik < 1) c.globalAlpha = saydamlik;
    c.drawImage(tampon, 0, 0, tampon.width, tampon.height,
                hx, hy, this.offGen * k, this.offYuk * k);
    c.globalAlpha = 1;
  },

  tamponuYapistir() {
    this.tamponuYapistirGenel(this.duragan, this.cizim, 1);
  },

  /* Verilen kamera durumuyla cizilmis tampon, su anki ekrani TAM kapsiyor mu?
     Yumusak gecisin sarti bu: kapsamiyorsa eski goruntuyu gostermek kenarlarda
     karanlik bant birakir. Yakinlasirken eski goruntu buyudugu icin kapsar
     (gecis olur), uzaklasirken kucuklur ve kapsamaz (aninda gecis). */
  tamponKapsiyor(ci) {
    if (!ci || ci.aci !== Kamera.aci) return false;   // donme yansitilamaz
    const k = Kamera.olcek / ci.olcek;
    const hx = (-this.MARJ - ci.panX) * k + Kamera.panX;
    const hy = (-this.MARJ - ci.panY) * k + Kamera.panY;
    return hx <= 0.5 && hy <= 0.5 &&
           hx + this.offGen * k >= Kamera.genislik - 0.5 &&
           hy + this.offYuk * k >= Kamera.yukseklik - 0.5;
  },

  sonCizimZamani: 0,

  ciz(canliCizim) {
    const c = this.ctx;
    let yenidenCiz;
    if (this.hareketli) {
      // hareket halindeyken: kabul edilebilir tamponu kullan, cizmeye kalkma
      yenidenCiz = !this.tamponKabulEdilir();
      this.kabaMod = yenidenCiz && this.sonSure > 26;
    } else {
      yenidenCiz = !this.tamponGecerli();
      this.kabaMod = false;
    }

    /* Karolar akarken her gelen karo icin tam cizim yapmak ilk yuklemede
       saniyelerce takilmaya yol aciyor (16 karo x ~30 ms, ustune arazi).
       Kamera oynamadiysa — yani tek degisen VERI ise — cizimi saniyede
       4'e sinirla. Kamera oynadiysa beklemeden ciz, yoksa kenarlar bos kalir. */
    let veriDegisimi = false;
    if (yenidenCiz && this.cizim.gecerli) {
      const ci = this.cizim;
      // Kamera hic oynamadiysa yeniden cizimin sebebi VERI (yeni karo, yeni
      // yukseklik, seviye degisimi). Bu durumda hem cizimi kisitliyoruz
      // hem de yumusak gecis uyguluyoruz.
      veriDegisimi = (ci.panX === Kamera.panX && ci.panY === Kamera.panY &&
                      ci.olcek === Kamera.olcek && ci.aci === Kamera.aci);
      const akiyor = Karolar.yukleniyor > 0 || Karolar.sira.length > 0 ||
                     Arazi.yukleniyor > 0;
      if (veriDegisimi && akiyor && performance.now() - this.sonCizimZamani < 380) {
        yenidenCiz = false;
      }
    }

    if (yenidenCiz) {
      /* Yumusak gecis, eski goruntu ekrani TAM kapsiyorsa yapilir.
         Boylece sadece yeni karo geldiginde degil, zoom bittiginde de
         (bulanik buyutulmus goruntuden net goruntuye) yumusak gecilir. */
      if (this.cizim.gecerli && this.tamponKapsiyor(this.cizim) &&
          this.gecisTamponuHazirla()) {
        this.octx.setTransform(1, 0, 0, 1, 0, 0);
        this.octx.clearRect(0, 0, this.onceki.width, this.onceki.height);
        this.octx.drawImage(this.duragan, 0, 0);
        this.gecis.cizim = {
          panX: this.cizim.panX, panY: this.cizim.panY,
          olcek: this.cizim.olcek, aci: this.cizim.aci
        };
        this.gecis.aktif = true;
        this.gecis.bas = performance.now();
      }
      this.duraganCiz();
      this.sonCizimZamani = performance.now();
    }

    c.clearRect(0, 0, Kamera.genislik, Kamera.yukseklik);

    if (this.gecis.aktif) {
      // Donme sirasinda eski goruntu dogru yansitilamaz (kaydir+olcekle
      // yetmez), o yuzden gecisi kes.
      if (!this.tamponKapsiyor(this.gecis.cizim)) {
        this.gecis.aktif = false;   // eski goruntu artik ekrani kapsamiyor
      } else {
        let t = (performance.now() - this.gecis.bas) / this.gecis.sure;
        if (t >= 1) { this.gecis.aktif = false; t = 1; }
        else {
          this.tamponuYapistirGenel(this.onceki, this.gecis.cizim, 1);
          this.tamponuYapistirGenel(this.duragan, this.cizim, t * t * (3 - 2 * t));
        }
      }
    }
    if (!this.gecis.aktif) this.tamponuYapistir();

    if (canliCizim) canliCizim(c);
    return yenidenCiz;
  },

  /* Gecis suruyor mu — ana dongu bu sirada kare atlamamali */
  gecisteMi() { return this.gecis.aktif; }
};
