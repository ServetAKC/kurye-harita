/* ============================================================
   terrain.js  —  Yukseklik verisi (karo bazli, akisli)
   ------------------------------------------------------------
   Kaynak: AWS "terrarium" karolari (anahtar gerekmiyor).
   Her karo 256x256 PNG, yukseklik renge gomulu:

       metre = (R * 256 + G + B / 256) - 32768

   Harita karolari gibi bunlar da gorundugunde inip gorunmedigi
   zaman bellekten atilir. Ornekleme KAROLARIN USTUNDEN yapilir:
   dort komsu piksel farkli karolarda olsa bile dogru interpolasyon
   yapilir, yani karo sinirlarinda dikis izi olusmaz.
   ============================================================ */

const Arazi = {
  etkin: true,                 // kullanici acik mi tuttu
  karolar: new Map(),          // "z/x/y" -> { veri: Float32Array, gorulme }
  z: 13,                       // aktif karo zoomu
  ENFAZLA_KARO: 96,
  /* AWS S3 tek karoyu ~1.5 sn'de veriyor; 4 slotla ekranin dolmasi
     gereksiz uzuyordu. S3 bu eszamanliligi rahat kaldiriyor. */
  ESZAMANLI: 8,
  sira: [],
  yukleniyor: 0,
  saat: 0,

  enAz: 0, enCok: 200,         // yuklu karolardaki yukseklik araligi
  abartma: 6,
  denizSeviyesi: 0.5,
  hataSayisi: 0,

  /* IKI ayri sayac var, bilerek:
     veriSurum — her karo inince/atilinca artar. Ornekleme dizini ve izgara
                 onbellegi bunu izler; ucuz seyler.
     surum     — PAHALI islerin sayaci (yollarin/binalarin yukseklik damgasi ve
                 tampon goruntunun gecersiz kilinmasi). Her karo icin degil,
                 karolar yuklenmeyi BITIRINCE (veya 1.5 sn'de bir) artar.
     Ayirmasak: 25 arazi karosunun her biri, yuklu butun harita karolarinin
     butun noktalarini yeniden damgalatiyordu — asil yavaslik oradaydi. */
  veriSurum: 0,
  surum: 0,
  yeniVeri: false,
  sonSurumZamani: 0,

  _sonAnahtar: '', _sonKaro: null,   // ornekleme icin tek karolu onbellek

  /* Elimizde bu gorunum icin veri var mi? */
  get hazir() { return this.etkin && this.karolar.size > 0; },

  /* --- karo matematigi --- */
  nZ(z) { return Math.pow(2, z); },
  lonKaro(lon, z) { return (lon + 180) / 360 * this.nZ(z); },
  latKaro(lat, z) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * this.nZ(z);
  },

  cozunurlukMetre() {
    return 40075017 * Math.cos(Proj.lat0 * Math.PI / 180) / this.nZ(this.z) / 256;
  },

  /* ------------------------------------------------------------
     Gorunen arazi karolarini yukle, gorunmeyenleri at.
     Harita karolariyla ayni ritimde cagrilir.
     ------------------------------------------------------------ */
  guncelle(araziZoom) {
    if (!this.etkin) return;
    if (araziZoom !== this.z) {
      this.z = araziZoom;
      this.sira.length = 0;
      this._sonAnahtar = ''; this._sonKaro = null;
      this.veriSurum++;
      this.surum++;
    }
    this.saat++;

    const gb = Cizer.gorunenBolge(0);
    const pay = 0.2;
    const gx = (gb.maxx - gb.minx) * pay, gy = (gb.maxy - gb.miny) * pay;
    const a = Proj.cografiye(gb.minx - gx, gb.miny - gy);
    const b = Proj.cografiye(gb.maxx + gx, gb.maxy + gy);
    const z = this.z, n = this.nZ(z);

    const x0 = Math.floor(this.lonKaro(Math.min(a.lon, b.lon), z));
    const x1 = Math.floor(this.lonKaro(Math.max(a.lon, b.lon), z));
    const y0 = Math.floor(this.latKaro(Math.max(a.lat, b.lat), z));
    const y1 = Math.floor(this.latKaro(Math.min(a.lat, b.lat), z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 48) return;   // cok uzak: yukleme yok

    const gorunenAnahtar = new Set();
    const bekleyen = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue;
        const kx = ((x % n) + n) % n;
        const ank = z + '/' + kx + '/' + y;
        gorunenAnahtar.add(ank);
        const v = this.karolar.get(ank);
        if (v) { v.gorulme = this.saat; continue; }
        bekleyen.push({ z: z, x: kx, y: y, ank: ank });
      }
    }
    if (bekleyen.length) this.sira = bekleyen;
    else this.sira.length = 0;
    this.siraCalistir();

    // bellekten atma
    if (this.karolar.size > this.ENFAZLA_KARO) {
      const adaylar = [];
      for (const [ank, v] of this.karolar) {
        if (gorunenAnahtar.has(ank) || v.durum === 'iniyor') continue;
        adaylar.push([ank, v.gorulme]);
      }
      adaylar.sort(function (p, q) { return p[1] - q[1]; });
      let at = this.karolar.size - this.ENFAZLA_KARO;
      for (const [ank] of adaylar) {
        if (at-- <= 0) break;
        this.karolar.delete(ank);
        if (this._sonAnahtar === ank) { this._sonAnahtar = ''; this._sonKaro = null; }
      }
      this.araligiHesapla();
      this.veriSurum++;
      this.yeniVeri = true;
    }

    /* PAHALI sayaci burada, kontrollu artiriyoruz: karo akisi bitince,
       ya da akis uzarsa 1.5 sn'de bir. Her karoda artirsak butun harita
       karolarinin yukseklik damgasi bastan hesaplanirdi. */
    if (this.yeniVeri) {
      const simdi = performance.now();
      const bitti = (this.yukleniyor === 0 && this.sira.length === 0);
      if (bitti || simdi - this.sonSurumZamani > 1500) {
        this.surum++;
        this.yeniVeri = false;
        this.sonSurumZamani = simdi;
        Cizer.kirlet();
        /* Akis bitince tek satirlik ozet: bir bolge bos kaliyorsa sebebi
           burada gorunur (inmeyen karo mu, yoksa veri gercekten deniz mi). */
        if (bitti) {
          let hazir = 0, yok = 0;
          for (const v of this.karolar.values()) {
            if (v.durum === 'hazir') hazir++; else if (v.durum === 'yok') yok++;
          }
          const ozet = hazir + '/' + yok + '/' + this.hataSayisi;
          if (ozet !== this._sonOzet) {
            this._sonOzet = ozet;
            console.log('[harita] arazi: ' + hazir + ' karo hazir, ' + yok +
                        ' karo YOK, ' + this.hataSayisi + ' hata · yukseklik ' +
                        (isFinite(this.enAz) ? this.enAz.toFixed(0) : '?') + '..' +
                        (isFinite(this.enCok) ? this.enCok.toFixed(0) : '?') + ' m');
          }
        }
      }
    }
  },

  siraCalistir() {
    while (this.yukleniyor < this.ESZAMANLI && this.sira.length) {
      const k = this.sira.shift();
      if (this.karolar.has(k.ank)) continue;
      // deneme sayaci kayit silinince kaybolmasin (bkz. karoYukle catch)
      this.karolar.set(k.ank, { durum: 'iniyor', gorulme: this.saat,
                                deneme: (this._denemeler && this._denemeler[k.ank]) || 0 });
      this.yukleniyor++;
      this.karoYukle(k);
    }
  },

  async karoYukle(k) {
    try {
      const url = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' +
                  k.z + '/' + k.x + '/' + k.y + '.png';
      const gorsel = await this.gorselYukle(url);
      const veri = this.pikselleriCoz(gorsel);
      const kayit = this.karolar.get(k.ank);
      if (!kayit) return;
      kayit.durum = 'hazir';
      kayit.veri = veri.h;
      kayit.enAz = veri.enAz;
      kayit.enCok = veri.enCok;
      this.araligiHesapla();
      this.veriSurum++;
      this.yeniVeri = true;
    } catch (e) {
      /* Kayit silinince guncelle() karoyu YENIDEN sıraya koyuyordu; kalici
         olarak inmeyen bir karo (AWS'de bazi z14 karolari gercekten yok,
         404 doner) boylece sonsuz dongude tekrar tekrar isteniyor, hicbir
         zaman hazir olmuyor ve o bolge surekli veri yoksa cizilmemis
         kaliyordu. Uc denemeden sonra "yok" diye isaretliyoruz: bir daha
         istenmiyor ve ornekleme daha KABA zoomdaki karoya dusuyor, yani
         bolge dusuk cozunurlukle de olsa doluyor. */
      this.hataSayisi++;
      const onceki = this.karolar.get(k.ank);
      const deneme = ((onceki && onceki.deneme) || 0) + 1;
      if (deneme >= 3) {
        this.karolar.set(k.ank, { durum: 'yok', gorulme: this.saat, deneme: deneme });
        this.sonHata = 'karo inmedi: ' + k.ank;
      } else {
        this.karolar.delete(k.ank);
        this._denemeler = this._denemeler || {};
        this._denemeler[k.ank] = deneme;
      }
    } finally {
      this.yukleniyor--;
      this.siraCalistir();
    }
  },

  gorselYukle(url) {
    return new Promise(function (coz, red) {
      const g = new Image();
      g.crossOrigin = 'anonymous';   // piksel okuyabilmek icin sart
      g.onload = function () { coz(g); };
      g.onerror = function () { red(new Error('karo inmedi')); };
      g.src = url;
    });
  },

  /* PNG'yi 256x256 Float32 yukseklik dizisine cevir.
     Tek bir 256x256 tuval tekrar tekrar kullanilir (her karo icin yeni
     tuval acmak bellegi bosa harciyor). */
  _tuval: null, _ctx: null,
  pikselleriCoz(gorsel) {
    if (!this._tuval) {
      this._tuval = document.createElement('canvas');
      this._tuval.width = 256; this._tuval.height = 256;
      this._ctx = this._tuval.getContext('2d', { willReadFrequently: true });
    }
    const c = this._ctx;
    c.clearRect(0, 0, 256, 256);
    c.drawImage(gorsel, 0, 0, 256, 256);
    const im = c.getImageData(0, 0, 256, 256).data;
    const h = new Float32Array(65536);
    let enAz = Infinity, enCok = -Infinity;
    for (let i = 0; i < 65536; i++) {
      const j = i * 4;
      const v = (im[j] * 256 + im[j + 1] + im[j + 2] / 256) - 32768;
      h[i] = v;
      if (v < enAz) enAz = v;
      if (v > enCok) enCok = v;
    }
    return { h: h, enAz: enAz, enCok: enCok };
  },

  araligiHesapla() {
    let enAz = Infinity, enCok = -Infinity;
    for (const v of this.karolar.values()) {
      if (v.durum !== 'hazir') continue;
      if (v.enAz < enAz) enAz = v.enAz;
      if (v.enCok > enCok) enCok = v.enCok;
    }
    if (enAz === Infinity) { enAz = 0; enCok = 200; }
    this.enAz = enAz; this.enCok = enCok;
  },

  /* --- ornekleme -------------------------------------------------
     Global mercator PIKSEL koordinatinda calisir: gx = lonKaro*256.
     Dort komsu piksel farkli karolarda olabilir; her biri ayri
     bulunur, boylece karo sinirinda dikis izi olusmaz.
     --------------------------------------------------------------- */
  /* Aktif zoomdaki karolarin SAYISAL anahtarli hizli dizini.
     Onceden her piksel okumasi icin "13/4747/3071" gibi bir metin uretiliyordu;
     metin birlestirme ornekleme dongusunun en pahali kismiydi. Sayisal anahtar
     (tx*65536+ty) ile o maliyet yok. */
  _dizin: new Map(),
  _dizinSurum: -1, _dizinZ: -1,

  dizinTazele() {
    if (this._dizinSurum === this.veriSurum && this._dizinZ === this.z) return;
    this._dizin.clear();
    const onEk = this.z + '/';
    for (const [ank, v] of this.karolar) {
      if (v.durum !== 'hazir' || ank.indexOf(onEk) !== 0) continue;
      const par = ank.split('/');
      this._dizin.set((+par[1]) * 65536 + (+par[2]), v.veri);
    }
    this._dizinSurum = this.veriSurum;
    this._dizinZ = this.z;
    this._sonTx = -1; this._sonTy = -1; this._sonVeri = null;
  },

  _sonTx: -1, _sonTy: -1, _sonVeri: null,

  /* Veri yoksa NaN doner — 0 DEGIL.
     Onceden 0 donuyordu; 0 metre "deniz seviyesi" demek oldugu icin henuz
     inmemis bolgeler koyu mavi kareler halinde goruniyordu. ("Yakinlasinca
     random yerler karariyor" sikayetinin sebebi buydu.)

     Ayrica aktif zoomda karo yoksa daha KABA zoomlardaki karolara bakiyoruz:
     onceki zoom seviyesinin karolari bellekte duruyor olabilir, o zaman
     dusuk cozunurlukle de olsa arazi gorunmeye devam eder. */
  _pikselAl(gx, gy) {
    const n = this.nZ(this.z) * 256;
    if (gy < 0 || gy >= n) return NaN;
    let px = gx % n; if (px < 0) px += n;
    const tx = (px / 256) | 0, ty = (gy / 256) | 0;
    let veri;
    if (tx === this._sonTx && ty === this._sonTy) {
      veri = this._sonVeri;
    } else {
      veri = this._dizin.get(tx * 65536 + ty);
      this._sonTx = tx; this._sonTy = ty; this._sonVeri = veri || null;
    }
    if (veri) return veri[((gy - ty * 256) | 0) * 256 + ((px - tx * 256) | 0)];

    /* Yedek: daha kaba zoomlarda elde kalmis karolar.
       Burada da IKI YONLU ARA DEGER hesapliyoruz. Onceden en yakin piksel
       aliniyordu (koordinat `| 0` ile tam sayiya yuvarlanarak); kaba karodan
       beslenen bolge boylece dz'ye gore 2x2, 4x4, hatta 16x16 piksellik DUZ
       KARELER haline geliyordu. Zoom sirasinda ekranin bir kismi yeni zoomun
       ince karolarindan, bir kismi eski zoomun kaba karolarindan beslendigi
       icin aralarinda gorunur basamaklar / kare sinirlari olusuyordu —
       zeminde fark edilen artifact buydu. */
    for (let dz = 1; dz <= 4; dz++) {
      const z = this.z - dz;
      if (z < 0) break;
      const b = 1 << dz;
      const gxb = px / b, gyb = gy / b;
      const kx = (gxb / 256) | 0, ky = (gyb / 256) | 0;
      const k = this.karolar.get(z + '/' + kx + '/' + ky);
      if (!k || k.durum !== 'hazir') continue;
      const lx = gxb - kx * 256, ly = gyb - ky * 256;
      const ix = lx | 0, iy = ly | 0;
      const fx = lx - ix, fy = ly - iy;
      /* Karo icinde kaldigi surece ara deger. Kenardaki tek piksellik
         seritte komsu karo elde olmayabilecegi icin en yakina duseriz;
         orada basamak gozle secilmiyor. */
      const ix1 = ix + 1 < 256 ? ix + 1 : ix;
      const iy1 = iy + 1 < 256 ? iy + 1 : iy;
      const v = k.veri;
      const v00 = v[iy * 256 + ix],  v10 = v[iy * 256 + ix1];
      const v01 = v[iy1 * 256 + ix], v11 = v[iy1 * 256 + ix1];
      return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
    }
    return NaN;
  },

  /* Global piksel koordinatinda iki yonlu dogrusal ara deger.
     Koselerden biri eksikse bilinen bir komsuyu kullanir; hicbiri yoksa NaN. */
  _ornekle(gx, gy) {
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const a = this._pikselAl(x0, y0),     b = this._pikselAl(x0 + 1, y0);
    const c = this._pikselAl(x0, y0 + 1), d = this._pikselAl(x0 + 1, y0 + 1);
    // NaN kontrolu: v !== v sadece NaN icin dogrudur
    if (a !== a || b !== b || c !== c || d !== d) {
      if (a === a) return a;
      if (b === b) return b;
      if (c === c) return c;
      if (d === d) return d;
      return NaN;
    }
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  },

  /* Tek nokta ornegi. Damgalama icin kullanildigindan NaN yerine 0 doner —
     yol/bina koordinatlarina NaN yazarsak geometri bozulur. */
  latLonYukseklik(lat, lon) {
    if (!this.etkin) return 0;
    this.dizinTazele();
    const v = this._ornekle(this.lonKaro(lon, this.z) * 256, this.latKaro(lat, this.z) * 256);
    return v === v ? v : 0;
  },

  metreYukseklik(x, y) {
    if (!this.etkin) return 0;
    const g = Proj.cografiye(x, y);
    return this.latLonYukseklik(g.lat, g.lon);
  },

  cz(metre) { return metre * this.abartma; },

  /* ------------------------------------------------------------
     Eksen hizali izgaranin butun kose yuksekliklerini topluca uret.
     Hile: izgara eksen hizali oldugu icin enlem sadece satira,
     boylam sadece sutuna bagli -> trigonometri (nx+1)+(ny+1) kere
     yapilir, (nx+1)*(ny+1) kere degil.
     ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     Onbellekli izgara: istenen bolgeden %25 GENIS bir izgara uretip
     saklar. Kaydirma/dondurme sirasinda istenen bolge hala saklanan
     izgaranin icinde kalirsa yeniden ornekleme YAPILMAZ — tampon
     goruntu mantiginin aynisi, sadece yukseklik verisi icin.
     Izgara koordinatlari adim'in tam katlarina hizalanir ki
     kaydirinca ayni orneklerin ustune denk gelsin.
     ------------------------------------------------------------ */
  _iz: null,
  izgaraIste(minx, miny, maxx, maxy, adim) {
    const iz = this._iz;
    if (iz && iz.adim === adim && iz.surum === this.veriSurum &&
        minx >= iz.x0 && miny >= iz.y0 &&
        maxx <= iz.x0 + iz.nx * adim && maxy <= iz.y0 + iz.ny * adim) {
      return iz;
    }
    const payX = (maxx - minx) * 0.25, payY = (maxy - miny) * 0.25;
    const x0 = Math.floor((minx - payX) / adim) * adim;
    const y0 = Math.floor((miny - payY) / adim) * adim;
    const nx = Math.ceil((maxx + payX - x0) / adim);
    const ny = Math.ceil((maxy + payY - y0) / adim);
    const yeni = { adim: adim, x0: x0, y0: y0, nx: nx, ny: ny, surum: this.veriSurum,
                   h: this.izgaraYukseklikleri(x0, y0, adim, nx, ny) };
    this._iz = yeni;
    return yeni;
  },

  izgaraYukseklikleri(x0, y0, adim, nx, ny) {
    const cikti = new Float32Array((nx + 1) * (ny + 1));
    if (!this.etkin) return cikti;
    this.dizinTazele();
    const z = this.z, olcek = this.nZ(z) * 256;

    const gxs = new Float64Array(nx + 1);
    for (let i = 0; i <= nx; i++) {
      const lon = Proj.lon0 + (x0 + i * adim) / Proj.mPerLon;
      gxs[i] = (lon + 180) / 360 * olcek;
    }
    const gys = new Float64Array(ny + 1);
    for (let j = 0; j <= ny; j++) {
      const lat = Proj.lat0 + (y0 + j * adim) / Proj.mPerLat;
      const r = lat * Math.PI / 180;
      gys[j] = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * olcek;
    }
    for (let j = 0; j <= ny; j++) {
      const gy = gys[j], sat = j * (nx + 1);
      for (let i = 0; i <= nx; i++) cikti[sat + i] = this._ornekle(gxs[i], gy);
    }

    /* HAFIF YUMUSATMA (3x3 agirlikli, merkez 4).
       Izgarayi artik veri cozunurlugunden daha ince orneklyoruz; bu yeni
       detay uretmiyor ama yukseklik verisindeki kucuk basamaklari oldugu
       gibi tasiyor. Egim hesabi bu basamaklari buyuttugu icin arazide
       izgara deseni goruluyordu. Burada bir kez yumusatmak hem golgeyi
       hem rengi ayni anda duzeltiyor — cizim dongusune hic maliyet
       eklemeden, cunku izgara zaten onbellekli.
       NaN (verisi gelmemis kose) yayilmasin diye komsulardan biri bile
       NaN ise o kose oldugu gibi birakiliyor. */
    const w = nx + 1, hgt = ny + 1;
    /* Iki gecis: tek gecis capraz desenin bir kismini birakiyordu. */
    for (let gecis = 0; gecis < 2 && w > 2 && hgt > 2; gecis++) {
      const kop = cikti.slice();
      for (let j = 1; j < hgt - 1; j++) {
        const sat = j * w;
        for (let i = 1; i < w - 1; i++) {
          const a = sat + i;
          const c0 = kop[a], l = kop[a - 1], r = kop[a + 1], u = kop[a - w], d = kop[a + w];
          const t = c0 * 4 + l + r + u + d;
          if (t === t) cikti[a] = t / 8;
        }
      }
    }
    return cikti;
  },

  /* Yukseklik farkinin ekranda gorunur olmasi icin gereken abartma.
     200 m'lik tepe 15 km'lik goruntude gercek olcekle 8 piksel eder
     (yani gorunmez), o yuzden bu sart. */
  abartmaOner(gorunenGenislikMetre) {
    const fark = Math.max(20, this.enCok - this.enAz);
    return Math.max(1, Math.min(25, 0.12 * gorunenGenislikMetre / fark));
  },

  /* --- GRI arazi tonlari (NFS gece paleti) ---------------------
     Renkli hipsometrik ton yerine gri: sehir ve neon yollar one
     ciksin, arazi arka planda kalsin. Yukseklik yine okunur cunku
     hem ton hem egim golgelemesi var. */
  BASAMAK: [
    { m: -60, r: 12, g: 15, b: 20 },
    { m: 0,   r: 22, g: 26, b: 32 },
    { m: 30,  r: 32, g: 36, b: 42 },
    { m: 80,  r: 44, g: 48, b: 54 },
    { m: 140, r: 58, g: 62, b: 68 },
    { m: 210, r: 74, g: 78, b: 84 },
    { m: 320, r: 92, g: 96, b: 102 },
    { m: 500, r: 118, g: 121, b: 126 }
  ],

  renk(metre, isik) {
    const B = this.BASAMAK;
    let i = 0;
    while (i < B.length - 2 && metre > B[i + 1].m) i++;
    const a = B[i], b = B[i + 1];
    const t = (metre - a.m) / (b.m - a.m);
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    let r = (a.r + (b.r - a.r) * u) * isik;
    let g = (a.g + (b.g - a.g) * u) * isik;
    let bl = (a.b + (b.b - a.b) * u) * isik;
    r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; bl = bl > 255 ? 255 : bl;
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')';
  },

  durumMetni() {
    let hazir = 0, iniyor = 0;
    for (const v of this.karolar.values()) {
      if (v.durum === 'hazir') hazir++; else iniyor++;
    }
    return hazir + ' arazi karosu' + (iniyor ? (' · ' + iniyor + ' iniyor') : '');
  }
};
