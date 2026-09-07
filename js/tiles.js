/* ============================================================
   tiles.js  —  Karo yoneticisi
   ------------------------------------------------------------
   "Merkez sec, yaricap sec, indir" yok. Gorunen bolge kendiliginden
   iner, ekrandan cikan bellekten atilir.

   ONEMLI TASARIM DEGISIKLIGI — ISTEK BIRLESTIRME:
   Once her karo icin AYRI Overpass sorgusu atiliyordu; tek bir
   gorunum icin 16 istek. Hem yavas hem de sunucuyu kizdiriyor —
   nitekim Overpass istekleri reddetmeye basladi ("yuklenmiyor").
   Artik eksik karolarin ORTAK sinir kutusu icin TEK sorgu atilir,
   gelen veri bir "blok" olarak ayristirilip o bloktaki butun
   karolara ayni nesne verilir. 16 istek -> 1 istek.

   Yani karolar sadece ONBELLEK BIRIMI: neyin elde oldugunu ve neyin
   atilacagini takip ederler. Veri blok halinde paylasilir; cizim
   sirasinda `_d` damgasiyla tekillenir.
   ============================================================ */

const Karolar = {

  /* "seviye/z/x/y" -> {
       durum: 'hazir' | 'iniyor' | 'hata',
       seviye, z, x, y, metreKutu, gorulme, tekrar, hata,
       blok: { sekil, araziSurum, zEnCok }    // birden cok karo paylasir
     } */
  depo: new Map(),

  seviye: 'bolge',
  surum: 0,               // karo kumesi degistikce artar (onbellekleri gecersizler)
  ENFAZLA_KARO: 120,
  ENFAZLA_GORUNEN: 30,

  /* Sunucu nezaketi: Overpass genelde IP basina 2 slot veriyor.
     AMA artik dogrudan Overpass'a degil YEREL VEKILE gidiyoruz; nezaket
     sinirini vekil kendi yonetiyor (bes aynayi sirayla deniyor).
     7 Eylul 2026 olcumu: 6 blok es zamanli istendi, altisi da HTTP 200
     dondu, 1.5-3.5 sn. Mahalle seviyesinde ekrani doldurmak ~7 blok
     gerektiriyor; 2 slot + 500 ms araliktayken bloklar damla damla
     geliyor, gezerken ekran hicbir zaman tamamlanmiyordu — "binalar
     tek tuk" sikayetinin sebebi buydu. */
  ESZAMANLI: 5,
  ENAZ_ARALIK_MS: 120,
  sonIstek: 0,
  yukleniyor: 0,
  sira: [],               // sadece durum gostergesi icin
  poiAcik: null,
  saat: 0,

  /* Hata yonetimi. Eskiden hata alinca karo hemen siliniyor, bir sonraki
     karede tekrar isteniyordu; sunucu cevap vermeyince bu, saniyede
     birkac istekle suren bir dovmeye donusuyordu. Artik ustel geri cekilme. */
  hataSayisi: 0,
  sonHata: '',
  bekleme: 0,             // birikmis geri cekilme (ms)
  tekrarZamani: 0,        // bundan once yeni istek yok
  cokUzak: false,

  /* --- slippy karo matematigi --- */
  nZ(z) { return Math.pow(2, z); },
  lonX(lon, z) { return (lon + 180) / 360 * this.nZ(z); },
  latY(lat, z) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * this.nZ(z);
  },
  xLon(x, z) { return x / this.nZ(z) * 360 - 180; },
  yLat(y, z) {
    const k = Math.PI * (1 - 2 * y / this.nZ(z));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
  },

  /* Karonun cografi sinirlari: [guney, bati, kuzey, dogu] */
  karoKutusu(z, x, y) {
    return [this.yLat(y + 1, z), this.xLon(x, z), this.yLat(y, z), this.xLon(x + 1, z)];
  },

  karoMetreKutusu(z, x, y) {
    const k = this.karoKutusu(z, x, y);
    const a = Proj.metreye(k[0], k[1]);
    const b = Proj.metreye(k[2], k[3]);
    return { minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x),
             miny: Math.min(a.y, b.y), maxy: Math.max(a.y, b.y) };
  },

  /* Zoom -> detay seviyesi. Karo boyu detayla birlikte kuculdugu icin
     her seviyede ekranda kabaca 9-25 karo olur; yani her zoomda inen
     veri benzer kalir. Karo boyu: z11=14.8 km, z12=7.4, z13=3.7, z14=1.85 */
  seviyeSec(olcek) {
    if (olcek < 0.125) return 'genis';
    if (olcek < 0.28) return 'bolge';
    if (olcek < 0.90) return 'ilce';
    return 'mahalle';
  },

  /* gorunenBolge zaten cizim marjini iceriyor; buradaki pay onun uzerine
     "kaydirinca hazir olsun" payi. Genis seviyelerde karo buyuk oldugu icin
     kucuk pay bile cok karo demek — seviyeye gore degisiyor. */
  PAY: { genis: 0.06, bolge: 0.08, ilce: 0.18, mahalle: 0.22 },

  gorunenKarolar(payOran) {
    const d = Overpass.DETAY[this.seviye];
    const z = d.karoZoom;
    const gb = Cizer.gorunenBolge(0);
    const pay = (payOran !== undefined ? payOran : (this.PAY[this.seviye] || 0.15));
    const gx = (gb.maxx - gb.minx) * pay, gy = (gb.maxy - gb.miny) * pay;
    const g1 = Proj.cografiye(gb.minx - gx, gb.miny - gy);
    const g2 = Proj.cografiye(gb.maxx + gx, gb.maxy + gy);

    const x0 = Math.floor(this.lonX(Math.min(g1.lon, g2.lon), z));
    const x1 = Math.floor(this.lonX(Math.max(g1.lon, g2.lon), z));
    // dikkat: karo y'si enlemle TERS gider
    const y0 = Math.floor(this.latY(Math.max(g1.lat, g2.lat), z));
    const y1 = Math.floor(this.latY(Math.min(g1.lat, g2.lat), z));

    const n = this.nZ(z);
    const liste = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue;
        liste.push({ z: z, x: ((x % n) + n) % n, y: y });
      }
    }
    return liste;
  },

  anahtar(k) { return this.seviye + '/' + k.z + '/' + k.x + '/' + k.y; },

  /* ------------------------------------------------------------
     Ana dongu tarafindan cagrilir.
     ------------------------------------------------------------ */
  guncelle(olcek) {
    const yeniSeviye = this.seviyeSec(olcek);
    if (yeniSeviye !== this.seviye) {
      this.seviye = yeniSeviye;
      this.surum++;
    }
    this.saat++;

    const gorunen = this.gorunenKarolar();
    if (gorunen.length > this.ENFAZLA_GORUNEN) { this.cokUzak = true; return; }
    this.cokUzak = false;

    const simdi = performance.now();
    const eksik = [];
    for (const k of gorunen) {
      const a = this.anahtar(k);
      const v = this.depo.get(a);
      if (v) {
        v.gorulme = this.saat;
        // hatali karo: geri cekilme suresi dolduysa tekrar denenebilir
        if (v.durum === 'hata' && simdi >= v.tekrar) eksik.push(k);
        continue;
      }
      eksik.push(k);
    }

    if (eksik.length && this.yukleniyor < this.ESZAMANLI &&
        simdi >= this.tekrarZamani && simdi - this.sonIstek >= this.ENAZ_ARALIK_MS) {
      /* Eksik karolari SABIT bir izgaraya gore partilere ayir (ornegin 2x1).
         Izgaranin sabit olmasi onemli: partilerin kutulari birbiriyle
         cakismaz, yani ayni veri iki kere inmez ve geri donunce onbellekten
         gelir. Merkeze en yakin parti once cekilir; ekranin ortasi hemen
         dolar, kenarlar arkadan gelir.
         Parti boyutu seviyeye gore ayri: olculdu, buyuk parti sunucuyu
         zaman asimina dusuruyordu (ilce seviyesinde 3x2 blok -> HTTP 504). */
      const p = Overpass.DETAY[this.seviye].parti || [2, 1];
      const om = Kamera.dunyaya(Kamera.genislik / 2, Kamera.yukseklik / 2);
      const gruplar = new Map();
      for (const t of eksik) {
        const mk = this.karoMetreKutusu(t.z, t.x, t.y);
        t._u = Math.hypot((mk.minx + mk.maxx) / 2 - om.x, (mk.miny + mk.maxy) / 2 - om.y);
        const gk = Math.floor(t.x / p[0]) + ',' + Math.floor(t.y / p[1]);
        let g = gruplar.get(gk);
        if (!g) { g = []; gruplar.set(gk, g); }
        g.push(t);
      }
      // gruplari merkeze yakinliga gore sirala, bos slot kadarini baslat
      const sirali = [];
      for (const g of gruplar.values()) {
        let u = Infinity;
        for (const t of g) if (t._u < u) u = t._u;
        sirali.push({ g: g, u: u });
      }
      sirali.sort(function (a, b) { return a.u - b.u; });
      for (const s of sirali) {
        if (this.yukleniyor >= this.ESZAMANLI) break;
        this.blokIndir(s.g);
      }
    }

    this.temizle(gorunen);
  },

  /* Eksik karolarin ORTAK kutusu icin TEK sorgu. */
  async blokIndir(eksik) {
    const seviye = this.seviye;
    let g = Infinity, b = Infinity, k = -Infinity, d = -Infinity;
    for (const t of eksik) {
      const kk = this.karoKutusu(t.z, t.x, t.y);
      if (kk[0] < g) g = kk[0];
      if (kk[1] < b) b = kk[1];
      if (kk[2] > k) k = kk[2];
      if (kk[3] > d) d = kk[3];
    }
    const kutu = [g, b, k, d];

    const anahtarlar = [];
    for (const t of eksik) {
      const a = seviye + '/' + t.z + '/' + t.x + '/' + t.y;
      anahtarlar.push(a);
      this.depo.set(a, {
        durum: 'iniyor', seviye: seviye, z: t.z, x: t.x, y: t.y,
        gorulme: this.saat, tekrar: 0, hata: 0,
        metreKutu: this.karoMetreKutusu(t.z, t.x, t.y)
      });
    }

    this.yukleniyor++;
    this.sonIstek = performance.now();
    this.sira = this.sira.concat(eksik);

    try {
      const ham = await Overpass.indirKutu(kutu, seviye, this.poiAcik);
      const blok = { sekil: Ayristirici.ayristir(ham), araziSurum: -1, zEnCok: 0 };
      Cizer.blokHazirla(blok);

      for (const a of anahtarlar) {
        const v = this.depo.get(a);
        if (!v || v.durum !== 'iniyor') continue;
        v.durum = 'hazir';
        v.blok = blok;
      }
      this.bekleme = 0;
      this.sonHata = '';
      this.surum++;
      Grafik.gecersiz = true;
      Cizer.kirlet();
    } catch (e) {
      this.hataSayisi++;
      this.sonHata = (e && e.message) || 'bilinmeyen hata';
      // ustel geri cekilme: 3, 6, 12, 24, en fazla 45 sn
      this.bekleme = this.bekleme ? Math.min(this.bekleme * 2, 45000) : 3000;
      this.tekrarZamani = performance.now() + this.bekleme;
      for (const a of anahtarlar) {
        const v = this.depo.get(a);
        if (!v || v.durum !== 'iniyor') continue;
        v.durum = 'hata';
        v.tekrar = this.tekrarZamani;
        v.hata++;
      }
    } finally {
      this.yukleniyor--;
      if (this.yukleniyor <= 0) { this.yukleniyor = 0; this.sira = []; }
    }
  },

  temizle(gorunen) {
    if (this.depo.size <= this.ENFAZLA_KARO) return;
    const gorunenAnahtar = new Set(gorunen.map(k => this.anahtar(k)));
    const adaylar = [];
    for (const [a, v] of this.depo) {
      if (gorunenAnahtar.has(a) || v.durum === 'iniyor') continue;
      /* Bina iceren karolar EN SON atilsin. Cizer bunlari aktif seviyeden
         bagimsiz kullaniyor (bkz. binaliBloklar): zoom cikip inince
         binalarin yeniden inmesini beklememek icin elde tutuluyorlar.
         Duz LRU'da uzaklasir uzaklasmaz atiliyorlardi. */
      const d = Overpass.DETAY[v.seviye];
      adaylar.push([a, v.gorulme + ((d && d.bina) ? 1e6 : 0)]);
    }
    adaylar.sort(function (p, q) { return p[1] - q[1]; });
    let at = this.depo.size - this.ENFAZLA_KARO;
    for (const [a] of adaylar) {
      if (at-- <= 0) break;
      this.depo.delete(a);
      this.surum++;
      Grafik.gecersiz = true;
    }
  },

  /* Aktif seviyenin EKRANDAKI karolarinin tamami hazir mi?
     Cizim buna gore kaba karolari birakip birakmayacagina karar veriyor.
     Pay 0: gorunenBolge zaten cizim marjini iceriyor; yukleme payini da
     katinca kosul neredeyse hic saglanmiyordu. */
  seviyeTamMi() {
    const liste = this.gorunenKarolar(0);
    if (!liste.length) return false;
    for (const k of liste) {
      const v = this.depo.get(this.anahtar(k));
      if (!v || v.durum !== 'hazir') return false;
    }
    return true;
  },

  hazirKarolar() {
    const cikti = [];
    for (const v of this.depo.values()) {
      if (v.durum === 'hazir' && v.seviye === this.seviye) cikti.push(v);
    }
    return cikti;
  },

  /* Bina iceren (mahalle) hazir bloklar — AKTIF SEVIYE NE OLURSA OLSUN.
     Bir kere inen bina verisi, zoom cikilinca cizimden dusuyordu ve geri
     yakinlasinca yeniden indirilmesi bekleniyordu. Veri zaten bellekte;
     Cizer bunu kullanarak binalari cizmeye devam ediyor. */
  binaliBloklar() {
    const gorulen = new Set(), cikti = [];
    for (const v of this.depo.values()) {
      if (v.durum !== 'hazir' || !v.blok) continue;
      const d = Overpass.DETAY[v.seviye];
      if (!d || !d.bina) continue;
      if (gorulen.has(v.blok)) continue;
      gorulen.add(v.blok);
      cikti.push(v.blok);
    }
    return cikti;
  },

  /* Butun seviyelerdeki FARKLI bloklar (grafik ve bellek hesabi icin) */
  hazirBloklar() {
    const gorulen = new Set(), cikti = [];
    for (const v of this.depo.values()) {
      if (v.durum !== 'hazir' || !v.blok) continue;
      if (gorulen.has(v.blok)) continue;
      gorulen.add(v.blok);
      cikti.push(v.blok);
    }
    return cikti;
  },

  durumMetni() {
    if (this.cokUzak) return 'Cok uzaktasin — yakinlas';
    const hazir = this.hazirKarolar().length;
    const s = Overpass.DETAY[this.seviye].ad + ' · ' + hazir + ' karo';
    if (this.yukleniyor) return s + ' · iniyor…';
    if (this.bekleme && this.sonHata) {
      const kalan = Math.max(0, Math.round((this.tekrarZamani - performance.now()) / 1000));
      return 'Sunucu vermiyor: ' + this.sonHata + ' — ' + kalan + ' sn sonra tekrar';
    }
    return s;
  },

  /* Proj merkezi tasindiginda eldeki veriyi yeniden yansit.
     lat/lon sakli oldugu icin bedava. */
  yenidenYansit() {
    for (const blok of this.hazirBloklar()) {
      const s = blok.sekil;
      for (const kume of [s.yollar, s.binalar, s.alanlar, s.kiyi]) {
        for (const o of kume) {
          for (const p of o.nokta) {
            const m = Proj.metreye(p.lat, p.lon);
            p.x = m.x; p.y = m.y;
          }
        }
      }
      for (const p of s.poiler) {
        const m = Proj.metreye(p.lat, p.lon);
        p.x = m.x; p.y = m.y;
      }
      blok.araziSurum = -1;
      Cizer.blokHazirla(blok);
    }
    for (const v of this.depo.values()) {
      if (v.durum === 'hazir') v.metreKutu = this.karoMetreKutusu(v.z, v.x, v.y);
    }
    this.surum++;
    Grafik.gecersiz = true;
  },

  hepsiniAt() {
    this.depo.clear();
    this.surum++;
    this.bekleme = 0;
    this.tekrarZamani = 0;
    Grafik.gecersiz = true;
  },

  /* Kabaca bellek kullanimi. Onbellekli: HUD saniyede 6 kere soruyor,
     her seferinde butun noktalari saymak bosuna is. */
  _bel: { nokta: 0, mb: 0 }, _belSurum: -1,
  bellekTahmini() {
    if (this._belSurum === this.surum) return this._bel;
    let nokta = 0;
    for (const blok of this.hazirBloklar()) {
      const s = blok.sekil;
      for (const kume of [s.yollar, s.binalar, s.alanlar, s.kiyi]) {
        for (const o of kume) nokta += o.nokta.length;
      }
      nokta += s.poiler.length;
    }
    this._bel = { nokta: nokta, mb: nokta * 120 / 1048576 };
    this._belSurum = this.surum;
    return this._bel;
  }
};
