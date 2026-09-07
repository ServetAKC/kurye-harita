/* ============================================================
   main.js  —  Kamera, arayuz, ana dongu
   ------------------------------------------------------------
   Kamera "yumusak": zoom hedefe dogru yumusar, surukleme birakinca
   atalet ile kayar. Karo yukleme kamera durunca tetiklenir, yani
   hareket sirasinda ag trafigi hareketi bolmez.
   ============================================================ */

const Uyg = {
  /* Baslangic konumu — Beylikduzu / Buyukcekmece arasi */
  BASLANGIC: { lat: 41.0110, lon: 28.6130, olcek: 0.15 },

  GIT: {
    beylikduzu: { ad: 'Beylikduzu + Buyukcekmece', lat: 41.0110, lon: 28.6130, olcek: 0.15 },
    bd_merkez:  { ad: 'Beylikduzu merkez',          lat: 41.0011, lon: 28.6417, olcek: 1.1 },
    bc_golu:    { ad: 'Buyukcekmece Golu',          lat: 41.0180, lon: 28.5750, olcek: 0.22 },
    marmara:    { ad: 'Sahil / Marmara',            lat: 40.9760, lon: 28.6300, olcek: 0.35 },
    suadiye:    { ad: 'SushiCo Saskinbakkal',       lat: 40.9611, lon: 29.0777, olcek: 1.4 }
  },

  mod: 'gez',
  sube: null,            // { dugumId, lat, lon }
  musteriler: [],
  rotalar: [],
  teslimatSirasi: [],   // musteriler[] icindeki indekslerin ziyaret sirasi

  kuryeIzle: false,

  /* ------------------------------------------------------------
     KURYE — rota uzerinde hareket eden arac
     ------------------------------------------------------------
     Konum bir SEGMENT indeksi + o segmentteki oran (0..1) ile tutuluyor;
     her karede kat edilen mesafe kadar ilerletiliyor. Boylece hiz kare
     hizindan bagimsiz: 60 fps'te de 30 fps'te de ayni sure gecince ayni
     yere varilir.
     ------------------------------------------------------------ */
  kurye: {
    aktif: false,
    rotaIdx: 0,      // kacinci rota (sube -> musteri i)
    segIdx: 0,       // rota icinde kacinci parca
    t: 0,            // parca icinde oran, 0..1
    hiz: 11,         // metre/saniye (~40 km/s)
    x: 0, y: 0, z: 0,
    aci: 0,          // gidis yonu (radyan, metre dunyasinda)
    varis: 0         // kac musteriye ulasildi
  },

  kuryeBaslat() {
    if (!this.rotalar.length) {
      this.durum('Once "Rotayi ciz" ile bir rota olustur.', 'uyari');
      return;
    }
    const k = this.kurye;
    k.aktif = true; k.rotaIdx = 0; k.segIdx = 0; k.t = 0; k.varis = 0;
    this.kuryeKonumla();
    this.kuryeDugmesiniYaz();
    this.durum('Kurye yola cikti.', 'iyi');
  },

  kuryeDurdur(mesaj) {
    this.kurye.aktif = false;
    this.kuryeDugmesiniYaz();
    if (mesaj) this.durum(mesaj, 'iyi');
  },

  kuryeDugmesiniYaz() {
    const b = document.getElementById('kuryeBtn');
    if (b) b.textContent = this.kurye.aktif ? 'Kuryeyi durdur' : 'Kuryeyi baslat';
  },

  /* Segment + oran -> metre konumu ve yon acisi */
  kuryeKonumla() {
    const k = this.kurye;
    const yol = this.rotalar[k.rotaIdx];
    if (!yol || yol.length < 2) return;

    /* Yolun SONUNDAYSA son noktada dur. Burada da a + (b-a)*t hesaplamak
       hataliydi: parca bitince segIdx son noktayi gosterir ve t sifirlanir,
       yani kurye parcanin BASINA doner. Testte yakalandi. */
    if (k.segIdx >= yol.length - 1) {
      const o = yol[yol.length - 2], s = yol[yol.length - 1];
      k.x = s.x; k.y = s.y; k.z = s.z || 0;
      k.aci = Math.atan2(s.y - o.y, s.x - o.x);
      return;
    }

    const a = yol[k.segIdx], b = yol[k.segIdx + 1];
    k.x = a.x + (b.x - a.x) * k.t;
    k.y = a.y + (b.y - a.y) * k.t;
    k.z = (a.z || 0) + ((b.z || 0) - (a.z || 0)) * k.t;
    k.aci = Math.atan2(b.y - a.y, b.x - a.x);
  },

  kuryeIlerlet(dt) {
    const k = this.kurye;
    if (!k.aktif || !this.rotalar.length) return false;
    let kalan = k.hiz * dt / 1000;          // bu karede kat edilecek metre
    let guvenlik = 0;                       // bozuk rotada sonsuz donguye karsi

    while (kalan > 0 && guvenlik++ < 10000) {
      const yol = this.rotalar[k.rotaIdx];
      if (!yol || yol.length < 2) { this.kuryeDurdur(); return false; }

      if (k.segIdx >= yol.length - 1) {
        k.varis++;                          // bu musteriye varildi
        if (k.rotaIdx + 1 >= this.rotalar.length) {
          this.kuryeKonumla();              // son noktada dur
          this.kuryeDurdur('Kurye ' + k.varis + ' teslimati tamamladi.');
          return true;
        }
        k.rotaIdx++; k.segIdx = 0; k.t = 0;
        continue;
      }

      const a = yol[k.segIdx], b = yol[k.segIdx + 1];
      const uz = Math.hypot(b.x - a.x, b.y - a.y);
      if (uz < 1e-6) { k.segIdx++; k.t = 0; continue; }

      const kalanParca = uz * (1 - k.t);
      if (kalan < kalanParca) { k.t += kalan / uz; kalan = 0; }
      else { kalan -= kalanParca; k.segIdx++; k.t = 0; }
    }

    this.kuryeKonumla();
    return true;
  },

  miniMap: false,
  otoDon: false,

  /* --- kamera yumusatma --- */
  hedefOlcek: 0.15,
  hizX: 0, hizY: 0,      // atalet
  surukluyor: false,
  sonFare: { x: 0, y: 0 },
  sonZaman: 0,
  sonKaroKontrol: 0,
  duragan: 0,            // kac ms'dir hareket yok

  ENAZ_OLCEK: 0.075,   // daha uzagi cekmek istenen karo sayisini patlatiyor
  ENCOK_OLCEK: 12,

  baslat() {
    Cizer.baslat(document.getElementById('tuval'));

    /* Adres cubugundan baslangic konumu: ?lat=41.0011&lon=28.6417&olcek=5
       Belirli bir yeri/zoomu tekrar tekrar ayni sekilde acabilmek icin —
       bir gorunumu paylasmak ya da bir hatayi ayni kosulda incelemek
       gerektiginde elle gezinip aramak zorunda kalmiyoruz. */
    const q = new URLSearchParams(location.search);
    const qlat = parseFloat(q.get('lat'));
    const qlon = parseFloat(q.get('lon'));
    const qol  = parseFloat(q.get('olcek'));
    const bas = (isFinite(qlat) && isFinite(qlon))
      ? { lat: qlat, lon: qlon, olcek: isFinite(qol) ? qol : 1.2 }
      : this.BASLANGIC;

    Proj.merkeziAyarla(bas.lat, bas.lon);
    Kamera.olcek = this.hedefOlcek = bas.olcek;
    Kamera.aci = 0;
    Kamera.ortala(0, 0);

    Karolar.poiAcik = null;     // butun durak turleri inisin (ucuz), gosterim ayri
    this.poiKutulariniUret();
    this.gitListesiniUret();
    this.olaylariBagla();
    this.abartmaYaz();
    requestAnimationFrame((t) => this.dongu(t));
  },

  /* ---------------- panel ---------------- */
  poiKutulariniUret() {
    const kap = document.getElementById('poiKatman');
    kap.innerHTML = '';
    for (const k of Object.keys(Overpass.POI)) {
      const p = Overpass.POI[k];
      const l = document.createElement('label');
      l.className = 'onay poiSatir';
      const g = document.createElement('input');
      g.type = 'checkbox';
      g.checked = !!Cizer.katman.poi[k];
      g.onchange = () => { Cizer.katman.poi[k] = g.checked; Cizer.katmanDegisti(); };
      // ikonun kucuk onizlemesi
      const on = document.createElement('canvas');
      on.width = 20; on.height = 20; on.className = 'poiOn';
      this.ikonOnizle(on, k);
      const ad = document.createElement('span');
      ad.textContent = p.ad;
      const say = document.createElement('b');
      say.className = 'poiSayi'; say.dataset.tur = k;
      l.appendChild(g); l.appendChild(on); l.appendChild(ad); l.appendChild(say);
      kap.appendChild(l);
    }
  },

  ikonOnizle(tuval, tur) {
    const c = tuval.getContext('2d');
    const st = Overpass.POI[tur];
    c.clearRect(0, 0, 20, 20);
    if (tur === 'otopark') { Ikon.otopark(c, 10, 10, 7.5); return; }
    c.beginPath();
    c.arc(10, 10, 8, 0, Math.PI * 2);
    c.fillStyle = st.renk;
    c.fill();
    c.fillStyle = 'rgba(8,11,16,0.92)';
    c.strokeStyle = 'rgba(8,11,16,0.92)';
    c.lineCap = 'round';
    const ciz = Ikon[tur];
    if (ciz) ciz(c, 10, 10, 8);
  },

  gitListesiniUret() {
    const s = document.getElementById('git');
    for (const k of Object.keys(this.GIT)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = this.GIT[k].ad;
      s.appendChild(o);
    }
  },

  durum(metin, tur) {
    const d = document.getElementById('durum');
    d.textContent = metin;
    d.className = 'durum ' + (tur || '');
  },

  abartmaYaz() {
    document.getElementById('abartma').value = Arazi.abartma.toFixed(1);
    document.getElementById('abartmaDeger').textContent = Arazi.abartma.toFixed(1) + '×';
  },

  /* ---------------- kamera hareketleri ---------------- */

  /* Bir cografi noktaya git (yumusak degil, aninda) */
  gitKonuma(lat, lon, olcek) {
    this.merkezTasi(lat, lon);
    if (olcek) { Kamera.olcek = this.hedefOlcek = olcek; }
    const m = Proj.metreye(lat, lon);
    Kamera.ortala(m.x, m.y);
    this.hizX = this.hizY = 0;
    Cizer.kirlet();
    this.karolariGuncelle(true);
  },

  /* Projeksiyon merkezini tasi (uzaga gidildiginde bozulma olmasin diye).
     lat/lon sakli oldugu icin eldeki karolar bedavaya yeniden yansitilir. */
  merkezTasi(lat, lon) {
    const eski = Proj.metreye(lat, lon);
    if (Math.hypot(eski.x, eski.y) < 25000) return false;
    Proj.merkeziAyarla(lat, lon);
    Karolar.yenidenYansit();
    Kamera.ortala(0, 0);
    Cizer.kirlet();
    return true;
  },

  merkezKontrol() {
    const om = Kamera.dunyaya(Kamera.genislik / 2, Kamera.yukseklik / 2);
    if (Math.hypot(om.x, om.y) < 25000) return;
    const g = Proj.cografiye(om.x, om.y);
    Proj.merkeziAyarla(g.lat, g.lon);
    Karolar.yenidenYansit();
    Kamera.ortala(0, 0);
    Cizer.kirlet();
  },

  karolariGuncelle(zorla) {
    this.merkezKontrol();
    Karolar.guncelle(Kamera.olcek);
    Arazi.guncelle(Overpass.DETAY[Karolar.seviye].araziZoom);
  },

  /* ---------------- rota ---------------- */
  grafigiHazirla() {
    Grafik.secenek = { tekYon: document.getElementById('tekYon').checked };
    return Grafik.hazirla();
  },

  /* ------------------------------------------------------------
     TESLIMAT TURU
     ------------------------------------------------------------
     Eskiden her musteri icin AYRI bir "sube -> musteri" rotasi
     hesaplaniyordu. Kurye birine varinca sirasi gelen rotanin
     BASINA, yani subeye isinlaniyordu — gercek bir kurye turu
     degil, bagimsiz cizgiler demekti.

     Artik tek zincir kuruluyor: sube -> m -> m -> ... -> sube.
     Bacaklar ardisik oldugu icin kurye kesintisiz ilerliyor.

     Ziyaret sirasi da onemli: ekleme sirasiyla gitmek gereksiz
     gidip gelme uretiyor. Once en yakin komsu ile bir sira
     kuruluyor, sonra 2-opt ile kesisen bacaklar duzeltiliyor.
     Sira KUS UCUSU mesafeye gore secilyor (A* ile her cifti
     hesaplamak n^2 rota demek olurdu); secilen sira icin gercek
     yol rotalari bir kez hesaplaniyor.
     ------------------------------------------------------------ */

  /* Iki durak arasi kus ucusu mesafe (metre) */
  _kusUcusu(a, b) {
    return Proj.mesafe(a.lat, a.lon, b.lat, b.lon);
  },

  /* Ziyaret sirasini bul. Donen dizi: musteriler[] icindeki indeksler. */
  teslimatSirasiBul(donus) {
    const M = this.musteriler, n = M.length;
    if (n <= 1) return M.map((m, i) => i);

    // --- en yakin komsu ---
    const kalan = M.map((m, i) => i);
    const sira = [];
    let su = this.sube;
    while (kalan.length) {
      let en = 0, enD = Infinity;
      for (let j = 0; j < kalan.length; j++) {
        const d = this._kusUcusu(su, M[kalan[j]]);
        if (d < enD) { enD = d; en = j; }
      }
      su = M[kalan[en]];
      sira.push(kalan[en]);
      kalan.splice(en, 1);
    }
    if (n < 3) return sira;

    // --- 2-opt: kesisen bacaklari duzelt ---
    const uzunluk = (s) => {
      let t = this._kusUcusu(this.sube, M[s[0]]);
      for (let i = 0; i + 1 < s.length; i++) t += this._kusUcusu(M[s[i]], M[s[i + 1]]);
      if (donus) t += this._kusUcusu(M[s[s.length - 1]], this.sube);
      return t;
    };
    /* n buyudukce O(n^2) tarama pahalilasir; tur sayisi sinirli tutuluyor.
       Elle konan musteri sayisi kucuk oldugu icin pratikte birkac tur yeter. */
    let en = uzunluk(sira), tur = 0;
    let iyilesti = true;
    while (iyilesti && tur++ < 40) {
      iyilesti = false;
      for (let i = 0; i < sira.length - 1 && !iyilesti; i++) {
        for (let j = i + 1; j < sira.length; j++) {
          const aday = sira.slice(0, i)
            .concat(sira.slice(i, j + 1).reverse(), sira.slice(j + 1));
          const u = uzunluk(aday);
          if (u < en - 1e-6) {
            sira.length = 0;
            for (const v of aday) sira.push(v);
            en = u; iyilesti = true; break;
          }
        }
      }
    }
    return sira;
  },

  testRota() {
    if (!this.sube) { this.durum('Once "Sube koy" ile bir sube isaretle.', 'uyari'); return; }
    if (!this.musteriler.length) { this.durum('Once "Musteri ekle" ile musteri koy.', 'uyari'); return; }
    const ist = this.grafigiHazirla();
    const olcut = document.getElementById('olcut').value;
    const donusKutu = document.getElementById('subeyeDon');
    const donus = donusKutu ? donusKutu.checked : true;
    const t0 = performance.now();

    this.rotalar = [];
    /* Yeni rota cizilince kurye basa donsun: eski rotanin ortasinda kalmis
       bir kurye yeni rotada anlamsiz bir yerde duruyor. */
    this.kurye.aktif = false; this.kurye.rotaIdx = 0;
    this.kurye.segIdx = 0; this.kurye.t = 0; this.kurye.varis = 0;

    this.teslimatSirasi = this.teslimatSirasiBul(donus);

    // duraklar: sube -> musteriler (sirayla) -> (istege bagli) sube
    const durak = [this.sube];
    for (const i of this.teslimatSirasi) durak.push(this.musteriler[i]);
    if (donus) durak.push(this.sube);

    let toplam = 0, basarisiz = 0;
    for (let i = 0; i + 1 < durak.length; i++) {
      const r = Grafik.rotaBul(durak[i].dugumId, durak[i + 1].dugumId, olcut);
      if (!r) { basarisiz++; continue; }
      this.rotalar.push(Grafik.rotaNoktalari(r.yol));
      toplam += r.maliyet;
    }

    const ms = performance.now() - t0;
    const birim = olcut === 'sure' ? (Math.round(toplam / 60) + ' dk') : (Math.round(toplam) + ' m');
    this.durum(this.musteriler.length + ' teslimatlik tur · ' + birim + '  ·  ' +
               ist.dugum + ' dugumluk grafikte ' + ms.toFixed(0) + ' ms' +
               (basarisiz ? ('  ·  ' + basarisiz + ' bacakta yol yok') : ''),
               basarisiz ? 'uyari' : 'iyi');
  },

  temizle() {
    this.musteriler = []; this.rotalar = []; this.teslimatSirasi = [];
    this.kurye.aktif = false; this.kurye.varis = 0;
    this.durum('Musteriler ve rotalar silindi.');
  },

  konum(nokta) {
    const m = Proj.metreye(nokta.lat, nokta.lon);
    return { x: m.x, y: m.y, z: Arazi.cz(Arazi.latLonYukseklik(nokta.lat, nokta.lon)) };
  },

  /* ---------------- olaylar ---------------- */
  olaylariBagla() {
    const t = document.getElementById('tuval');

    document.getElementById('araBtn').onclick = () => this.ara();
    document.getElementById('aramaKutu').onkeydown = (e) => { if (e.key === 'Enter') this.ara(); };
    document.getElementById('kuryeBtn').onclick = () => {
      if (this.kurye.aktif) this.kuryeDurdur('Kurye durduruldu.');
      else this.kuryeBaslat();
    };
    document.getElementById('kuryeIzle').onchange = (e) => {
      this.kuryeIzle = e.target.checked;
    };
    const kHiz = document.getElementById('kuryeHiz');
    const kHizYaz = () => {
      this.kurye.hiz = parseFloat(kHiz.value);
      document.getElementById('kuryeHizDeger').textContent =
        Math.round(this.kurye.hiz * 3.6) + ' km/s';
    };
    kHiz.oninput = kHizYaz;
    kHizYaz();
    document.getElementById('rotaBtn').onclick = () => this.testRota();
    document.getElementById('temizleBtn').onclick = () => this.temizle();

    document.getElementById('git').onchange = (e) => {
      const h = this.GIT[e.target.value];
      if (h) this.gitKonuma(h.lat, h.lon, h.olcek);
      e.target.value = '';
    };

    document.querySelectorAll('[data-mod]').forEach(b => {
      b.onclick = () => {
        this.mod = b.dataset.mod;
        document.querySelectorAll('[data-mod]').forEach(x => x.classList.toggle('aktif', x === b));
      };
    });

    const kat = { katBina: 'binalar', katAlan: 'alanlar', katAd: 'yolAdlari',
                  katDugum: 'grafikDugum', katEs: 'esYukselti', katKiyi: 'kiyi' };
    Object.keys(kat).forEach(id => {
      const e = document.getElementById(id);
      e.checked = Cizer.katman[kat[id]];
      e.onchange = () => {
        Cizer.katman[kat[id]] = e.checked;
        if (kat[id] === 'grafikDugum' && e.checked) this.grafigiHazirla();
        Cizer.katmanDegisti();
      };
    });

    document.getElementById('araziAc').checked = Arazi.etkin;
    document.getElementById('araziAc').onchange = (e) => {
      Arazi.etkin = e.target.checked;
      Cizer.katman.arazi = e.target.checked;
      Arazi.surum++;
      Cizer.katmanDegisti();
      if (Arazi.etkin) this.karolariGuncelle(true);
    };

    document.getElementById('abartma').oninput = (e) => {
      Arazi.abartma = parseFloat(e.target.value);
      document.getElementById('abartmaDeger').textContent = Arazi.abartma.toFixed(1) + '×';
      Cizer.kirlet();
    };
    document.getElementById('abartmaOto').onclick = () => {
      const gb = Cizer.gorunenBolge(0);
      Arazi.abartma = Arazi.abartmaOner(gb.maxx - gb.minx);
      this.abartmaYaz();
      Cizer.kirlet();
    };

    document.getElementById('miniMap').onchange = (e) => {
      this.miniMap = e.target.checked; Cizer.kirlet();
    };
    document.getElementById('otoDon').onchange = (e) => { this.otoDon = e.target.checked; };
    document.getElementById('tekYon').onchange = () => { Grafik.gecersiz = true; };

    /* --- surukleme + atalet --- */
    t.onmousedown = (e) => {
      this.surukluyor = true;
      this.basladiginda = { x: e.clientX, y: e.clientY };
      this.sonFare = { x: e.clientX, y: e.clientY };
      this.hizX = this.hizY = 0;
      t.style.cursor = 'grabbing';
    };
    window.onmouseup = (e) => {
      if (!this.surukluyor) return;
      this.surukluyor = false;
      t.style.cursor = '';
      const dx = e.clientX - this.basladiginda.x, dy = e.clientY - this.basladiginda.y;
      if (Math.hypot(dx, dy) < 4) { this.hizX = this.hizY = 0; this.tikla(e); }
    };
    window.onmousemove = (e) => {
      const r = t.getBoundingClientRect();
      const w = Kamera.dunyayaArazi(e.clientX - r.left, e.clientY - r.top);
      this.imlecYaz(w);
      if (!this.surukluyor) return;
      const dx = e.clientX - this.sonFare.x, dy = e.clientY - this.sonFare.y;
      if (e.shiftKey) {
        Kamera.aci += dx * 0.006;
      } else {
        Kamera.panX += dx; Kamera.panY += dy;
        // atalet icin hizi yumusatarak biriktir
        this.hizX = this.hizX * 0.6 + dx * 0.4;
        this.hizY = this.hizY * 0.6 + dy * 0.4;
      }
      this.sonFare = { x: e.clientX, y: e.clientY };
      this.duragan = 0;
    };

    /* --- zoom: hedefe dogru yumusar --- */
    t.onwheel = (e) => {
      e.preventDefault();
      const r = t.getBoundingClientRect();
      this.zoomOdak = { x: e.clientX - r.left, y: e.clientY - r.top };
      const k = e.deltaY < 0 ? 1.35 : 1 / 1.35;
      this.hedefOlcek = Math.max(this.ENAZ_OLCEK, Math.min(this.ENCOK_OLCEK, this.hedefOlcek * k));
      this.duragan = 0;
    };

    window.onkeydown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'q' || e.key === 'Q') { Kamera.aci -= 0.09; this.duragan = 0; }
      if (e.key === 'e' || e.key === 'E') { Kamera.aci += 0.09; this.duragan = 0; }
      if (e.key === 'r' || e.key === 'R') { Kamera.aci = 0; this.duragan = 0; }
      if (e.key === '+' || e.key === '=') {
        this.zoomOdak = null;
        this.hedefOlcek = Math.min(this.ENCOK_OLCEK, this.hedefOlcek * 1.5); this.duragan = 0;
      }
      if (e.key === '-') {
        this.zoomOdak = null;
        this.hedefOlcek = Math.max(this.ENAZ_OLCEK, this.hedefOlcek / 1.5); this.duragan = 0;
      }
    };

    window.onresize = () => { Cizer.olcuAyarla(); };
  },

  imlecYaz(w) {
    let s = Math.round(w.x) + ', ' + Math.round(w.y) + ' m';
    if (Arazi.hazir) s += '  ·  ' + Math.round(Arazi.metreYukseklik(w.x, w.y)) + ' m yukseklik';
    document.getElementById('konum').textContent = s;
  },

  tikla(e) {
    if (this.mod === 'gez') return;
    const ist = this.grafigiHazirla();
    if (!ist || !ist.dugum) { this.durum('Once biraz bekle, yol verisi insin.', 'uyari'); return; }
    const r = document.getElementById('tuval').getBoundingClientRect();
    const w = Kamera.dunyayaArazi(e.clientX - r.left, e.clientY - r.top);
    const yk = Grafik.enYakinDugum(w.x, w.y);
    if (!yk) return;
    const sinir = Math.max(200, 60 / Math.max(Kamera.olcek, 0.005));
    if (yk.uzaklik > sinir) {
      this.durum('En yakin yol ' + Math.round(yk.uzaklik) + ' m uzakta — yola daha yakin tikla.', 'uyari');
      return;
    }
    const d = yk.dugum;
    if (this.mod === 'sube') {
      this.sube = { dugumId: d.id, lat: d.lat, lon: d.lon };
      this.durum('Sube isaretlendi.');
    } else {
      this.musteriler.push({ dugumId: d.id, lat: d.lat, lon: d.lon });
      this.durum(this.musteriler.length + ' musteri.');
    }
  },

  /* ---------------- ana dongu ---------------- */
  dongu(zaman) {
    const dt = Math.min(50, zaman - (this.sonZaman || zaman));
    this.sonZaman = zaman;

    let hareket = false;

    /* Kurye hareketi. Canli katman her karede yeniden ciziliyor
       (Cizer.ciz kosulsuz cagriliyor), yani ayrica tazeleme bayragi
       gerekmiyor. */
    this.kuryeIlerlet(dt);
    if (this.kurye.aktif && this.kuryeIzle) {
      Kamera.ortala(this.kurye.x, this.kurye.y);
      hareket = true;
    }

    // otomatik donme
    if (this.otoDon) { Kamera.aci += 0.0022 * dt / 16; hareket = true; }

    // yumusak zoom: her karede hedefe %22 yaklas
    const oran = this.hedefOlcek / Kamera.olcek;
    if (Math.abs(oran - 1) > 0.0015) {
      const odak = this.zoomOdak || { x: Kamera.genislik / 2, y: Kamera.yukseklik / 2 };
      const once = Kamera.dunyaya(odak.x, odak.y);
      const k = 1 - Math.pow(1 - 0.22, dt / 16);
      Kamera.olcek = Kamera.olcek * Math.pow(oran, k);
      // odak noktasi sabit kalsin
      const p = Kamera.ekrana(once.x, once.y, 0);
      Kamera.panX += odak.x - p.sx;
      Kamera.panY += odak.y - p.sy;
      hareket = true;
    } else if (Kamera.olcek !== this.hedefOlcek) {
      Kamera.olcek = this.hedefOlcek;
      hareket = true;
    }

    // surukleme ataleti
    if (!this.surukluyor && (Math.abs(this.hizX) > 0.15 || Math.abs(this.hizY) > 0.15)) {
      Kamera.panX += this.hizX; Kamera.panY += this.hizY;
      const sonum = Math.pow(0.90, dt / 16);
      this.hizX *= sonum; this.hizY *= sonum;
      hareket = true;
    } else if (!this.surukluyor) {
      this.hizX = this.hizY = 0;
    }

    if (this.surukluyor) hareket = true;
    Cizer.hareketli = hareket;
    this.duragan = hareket ? 0 : this.duragan + dt;

    // Karo yukleme: hareket bittikten kisa sure sonra, ve hareket
    // uzarsa da arada bir (yoksa uzun surukleme bos ekranda kalir).
    this.sonKaroKontrol += dt;
    if ((!hareket && this.duragan >= 90 && this.sonKaroKontrol > 90) ||
        this.sonKaroKontrol > 420) {
      this.sonKaroKontrol = 0;
      this.karolariGuncelle();
    }

    Cizer.ciz((c) => {
      /* Bacaklar sirayla ciziliyor; kuryenin GECTIGI bacaklar soluk,
         gidecegi bacaklar parlak. Boylece turun neresinde oldugu
         bir bakista belli oluyor. */
      this.rotalar.forEach((r, i) => {
        const gecti = this.kurye.varis > i || (this.kurye.aktif && this.kurye.rotaIdx > i);
        c.globalAlpha = gecti ? 0.32 : 1;
        Cizer.rotaCiz(c, r, RENK.rota, 3.5);
        if (!gecti) Cizer.rotaOklariCiz(c, r, 'rgba(190,240,255,0.9)');
        c.globalAlpha = 1;
      });
      this.musteriler.forEach((m, i) => {
        const k = this.konum(m);
        /* Etiket ekleme sirasi degil TESLIMAT sirasi: kurye hangi sirayla
           ugrayacaksa o. Rota henuz cizilmediyse ekleme sirasi gosterilir. */
        const s = this.teslimatSirasi.indexOf(i);
        Cizer.isaretciCiz(c, k.x, k.y, k.z, RENK.musteri,
                          s >= 0 ? String(s + 1) : '#' + (i + 1), 22);
      });
      if (this.sube) {
        const k = this.konum(this.sube);
        Cizer.isaretciCiz(c, k.x, k.y, k.z, RENK.sube, 'SUBE', 34);
      }
      if (this.kurye.aktif || this.kurye.varis) {
        Cizer.kuryeCiz(c, this.kurye.x, this.kurye.y,
                       Arazi.cz(this.kurye.z || 0), this.kurye.aci);
      }
      if (this.miniMap) this.miniMapMaskesi(c);
    });

    this.hudYaz();
    requestAnimationFrame((z) => this.dongu(z));
  },

  _hudSayac: 0,
  hudYaz() {
    if (++this._hudSayac % 10) return;      // saniyede ~6 kere yeter
    document.getElementById('karoDurum').textContent = Karolar.durumMetni();
    /* Sunucu hatasini kucuk satirda birakmak "yuklenmiyor" sikayetine yol
       aciyordu — kullanici neden beklediğini gormuyordu. Vurgulu kutuya da yaz. */
    if (Karolar.bekleme && Karolar.sonHata) {
      this.durum("Harita sunucusu su an veri vermiyor (" + Karolar.sonHata +
                 "). Otomatik tekrar denenecek; elde olan veri ekranda kaliyor.", "hata");
      this._hataGosterildi = true;
    } else if (this._hataGosterildi) {
      this._hataGosterildi = false;
      this.durum("Baglanti duzeldi.", "iyi");
    }
    document.getElementById('araziDurum').textContent =
      Arazi.etkin ? Arazi.durumMetni() : 'arazi kapali';

    const b = Karolar.bellekTahmini();
    document.getElementById('istatistik').innerHTML =
      'Olcek <b>' + Kamera.olcek.toFixed(3) + '</b> px/m' +
      (Arazi.hazir ? ('  ·  yukseklik <b>' + Math.round(Arazi.enAz) + '</b>–<b>' +
                      Math.round(Arazi.enCok) + '</b> m') : '') +
      '<br>Bellek ~<b>' + b.mb.toFixed(1) + ' MB</b> (' + b.nokta.toLocaleString('tr') + ' nokta)' +
      '<br>Cizim <b>' + Cizer.sonSure.toFixed(0) + ' ms</b>' +
      (Grafik.dugumler ? ('  ·  grafik <b>' + Grafik.dugumler.size + '</b> dugum' +
                          (Grafik.gecersiz ? ' (eski)' : '')) : '');

    const t = Cizer._toplam;
    if (t) {
      if (!this._poiSayiDugum) this._poiSayiDugum = document.querySelectorAll('.poiSayi');
      this._poiSayiDugum.forEach(e => { e.textContent = t.poiSay[e.dataset.tur] || 0; });
    }
    this.yukseklikSeridi();
  },

  yukseklikSeridi() {
    const e = document.getElementById('seritBar');
    if (!Arazi.hazir) return;
    const anahtar = Math.round(Arazi.enAz) + ':' + Math.round(Arazi.enCok);
    if (this._seritAnahtar === anahtar) return;
    this._seritAnahtar = anahtar;
    const durak = [];
    for (let i = 0; i <= 10; i++) {
      const m = Arazi.enAz + (Arazi.enCok - Arazi.enAz) * i / 10;
      durak.push((m <= Arazi.denizSeviyesi ? RENK.deniz : Arazi.renk(m, 1)) + ' ' + (i * 10) + '%');
    }
    e.style.background = 'linear-gradient(to right, ' + durak.join(', ') + ')';
    document.getElementById('seritAz').textContent = Math.round(Arazi.enAz) + ' m';
    document.getElementById('seritCok').textContent = Math.round(Arazi.enCok) + ' m';
  },

  /* ---------------- arama ---------------- */
  async ara() {
    const metin = document.getElementById('aramaKutu').value.trim();
    if (!metin) return;
    this.durum('Araniyor...');
    try {
      const liste = await Overpass.yerAra(metin);
      const kap = document.getElementById('aramaSonuc');
      kap.innerHTML = '';
      if (!liste.length) { this.durum('Sonuc yok.', 'uyari'); return; }
      liste.forEach((y) => {
        const d = document.createElement('div');
        d.className = 'sonuc';
        d.textContent = y.ad;
        d.onclick = () => {
          kap.innerHTML = '';
          this.gitKonuma(y.lat, y.lon, Math.max(Kamera.olcek, 0.9));
          this.durum(y.ad.split(',').slice(0, 3).join(','), 'iyi');
        };
        kap.appendChild(d);
      });
      this.durum(liste.length + ' sonuc.');
    } catch (e) {
      this.durum('Arama hatasi: ' + e.message, 'hata');
    }
  },

  /* NFS tarzi yuvarlak mini-map maskesi — CarThing ekrani icin prova */
  miniMapMaskesi(c) {
    const g = Kamera.genislik, y = Kamera.yukseklik;
    const cx = g / 2, cy = y / 2;
    const r = Math.min(g, y) * 0.36;

    c.save();
    c.globalCompositeOperation = 'destination-in';
    const grad = c.createRadialGradient(cx, cy, r * 0.75, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(34,211,238,0.55)';
    c.lineWidth = 2;
    c.stroke();

    const a = -Kamera.aci - Math.PI / 2;
    const nx = cx + Math.cos(a) * (r + 9), ny = cy + Math.sin(a) * 0.5 * (r + 9);
    c.beginPath();
    c.arc(nx, ny, 5, 0, Math.PI * 2);
    c.fillStyle = '#22d3ee';
    c.fill();
    c.font = 'bold 9px system-ui, sans-serif';
    c.fillStyle = '#04222a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('K', nx, ny + 0.5);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }
};

window.addEventListener('DOMContentLoaded', () => Uyg.baslat());
