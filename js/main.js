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
  bacakBilgi: [],       // her rota bacaginin hedefi: musteri mi, subeye donus mu

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
    hiz: 35,         // metre/saniye (~126 km/s). Gercekci degil ama bu bir
                     // simulasyon: tur bastan sona makul surede izlenebilsin.
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
        /* Bacak hedefi musteri ise teslimat, sube ise yeniden yukleme.
           Ayirt etmezsek subeye donusler de teslimat sayilirdi. */
        const bilgi = this.bacakBilgi[k.rotaIdx];
        if (!bilgi || bilgi.tip === 'musteri') k.varis++;
        else k.paket = 0;                   // subede yeniden yuklendi
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
    /* On ayar dugmesi tam o degerdeyse isaretlensin. Kaydirici elle
       oynatildiginda hicbiri isaretli kalmaz — dogru olan bu, deger
       artik on ayarlardan biri degil. */
    document.querySelectorAll('[data-abartma]').forEach((b) => {
      b.classList.toggle('aktif', Math.abs(parseFloat(b.dataset.abartma) - Arazi.abartma) < 0.01);
    });
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
     kuruluyor, sonra 2-opt + tasima ile duzeltiliyor.

     Sira GERCEK YOL MALIYETINE gore seciliyor, kus ucusuna gore
     degil. Kus ucusu Buyukcekmece'de yaniliyordu: golun iki yakasi
     kus ucusu 1 km, yoldan 9 km — algoritma karsi yakayi "yakin"
     sanip kuryeyi golun etrafinda gidip gelmeye sokuyordu. Ayni
     sey sahil, otoyol boyu ve tek yon kurallari icin de gecerli.

     Maliyetler bir MATRIS olarak bir kez cikariliyor: durak basina
     tek Dijkstra (bkz. Grafik.maliyetler), n^2 A* degil. Etiketteki
     1 2 3 numaralari bu siranin ta kendisi.
     ------------------------------------------------------------ */

  /* Iki durak arasi kus ucusu mesafe (metre) — matris kurulamazsa yedek */
  _kusUcusu(a, b) {
    return Proj.mesafe(a.lat, a.lon, b.lat, b.lon);
  },

  /* ------------------------------------------------------------
     MALIYET MATRISI
     duraklar[0] = sube, duraklar[i+1] = musteriler[i]
     Donen: { d(i,j), ulasilmaz }  — d metre ya da saniye (olcut'e gore)

     Ulasilamayan cift Infinity yerine kus ucusunun 4 katiyla
     doldurulur: Infinity 2-opt karsilastirmalarini NaN'a cevirip
     sirayi bozuyor. Buyuk ama sonlu ceza, o bacagi pratikte hep
     en sona itiyor ve algoritma calismaya devam ediyor.
     ------------------------------------------------------------ */
  maliyetMatrisi(duraklar, olcut) {
    const n = duraklar.length;
    const idler = duraklar.map(d => d.dugumId);
    const D = [];
    let ulasilmaz = 0;

    for (let i = 0; i < n; i++) {
      const bulunan = Grafik.maliyetler(idler[i], idler, olcut);
      D[i] = new Array(n);
      for (let j = 0; j < n; j++) {
        if (i === j) { D[i][j] = 0; continue; }
        const m = bulunan.get(idler[j]);
        if (m === undefined) {
          ulasilmaz++;
          const ku = this._kusUcusu(duraklar[i], duraklar[j]);
          D[i][j] = (olcut === 'sure' ? ku / (40 * 1000 / 3600) : ku) * 4;
        } else {
          D[i][j] = m;
        }
      }
    }
    /* Tek yon kurallari yuzunden matris SIMETRIK DEGIL: A'dan B'ye
       gitmek B'den A'ya donmekten pahali olabilir. Ortalama alip
       simetrik yapma — kuryenin gercekten gidecegi yon bu. */
    return { d: (i, j) => D[i][j], ulasilmaz: ulasilmaz };
  },

  /* Bir sira dizisinin toplam maliyeti.
     s: musteriler[] indeksleri. Matriste sube 0, musteri i -> i+1.
     donus=true ise son musteriden subeye donus de sayilir. */
  _turMaliyeti(mat, s, donus) {
    if (!s.length) return 0;
    let t = mat.d(0, s[0] + 1);
    for (let i = 0; i + 1 < s.length; i++) t += mat.d(s[i] + 1, s[i + 1] + 1);
    if (donus) t += mat.d(s[s.length - 1] + 1, 0);
    return t;
  },

  /* 2-opt (parca ters cevirme) + tasima (bir duragi baska yere al).
     Ikisi farkli hatalari duzeltiyor: 2-opt kesisen bacaklari acar,
     tasima ise "yol ustundeki musteri en sona kalmis" durumunu. Tek
     basina 2-opt bunu cozemiyor cunku ters cevirme sirayi korur. */
  _sirayiIyilestir(mat, sira, donus, enFazlaTur) {
    if (sira.length < 3) return sira;
    let en = this._turMaliyeti(mat, sira, donus);
    let tur = 0, iyilesti = true;

    while (iyilesti && tur++ < (enFazlaTur || 40)) {
      iyilesti = false;

      // --- 2-opt ---
      for (let i = 0; i < sira.length - 1 && !iyilesti; i++) {
        for (let j = i + 1; j < sira.length; j++) {
          const aday = sira.slice(0, i)
            .concat(sira.slice(i, j + 1).reverse(), sira.slice(j + 1));
          const u = this._turMaliyeti(mat, aday, donus);
          if (u < en - 1e-6) { sira = aday; en = u; iyilesti = true; break; }
        }
      }
      if (iyilesti) continue;

      // --- tasima (or-opt, tek durak) ---
      for (let i = 0; i < sira.length && !iyilesti; i++) {
        const eksik = sira.slice(0, i).concat(sira.slice(i + 1));
        for (let j = 0; j <= eksik.length; j++) {
          if (j === i) continue;
          const aday = eksik.slice(0, j).concat([sira[i]], eksik.slice(j));
          const u = this._turMaliyeti(mat, aday, donus);
          if (u < en - 1e-6) { sira = aday; en = u; iyilesti = true; break; }
        }
      }
    }
    return sira;
  },

  /* Ziyaret sirasini bul. Donen dizi: musteriler[] icindeki indeksler. */
  teslimatSirasiBul(mat, donus) {
    const n = this.musteriler.length;
    if (n <= 1) return this.musteriler.map((m, i) => i);

    /* --- en yakin komsu: her adimda GERCEK yoldan en yakin olana git --- */
    const kalan = this.musteriler.map((m, i) => i);
    const sira = [];
    let su = 0;                                   // matris indeksi: 0 = sube
    while (kalan.length) {
      let en = 0, enD = Infinity;
      for (let j = 0; j < kalan.length; j++) {
        const d = mat.d(su, kalan[j] + 1);
        if (d < enD) { enD = d; en = j; }
      }
      su = kalan[en] + 1;
      sira.push(kalan[en]);
      kalan.splice(en, 1);
    }

    /* En yakin komsu acgozlu: son musteriler ic acici olmayan yerlerde
       kaliyor. Iyilestirme sart, tek basina yeterli degil. */
    return this._sirayiIyilestir(mat, sira, donus, 40);
  },

  /* Bir SEFERIN ic sirasini iyilestir (sube -> ... -> sube). */
  seferIciDuzelt(mat, sefer) {
    return this._sirayiIyilestir(mat, sefer, true, 20);
  },

  /* ============================================================
     SEFERLERE BOLME — Clarke-Wright tasarruf yontemi
     ------------------------------------------------------------
     Eskiden tek bir buyuk tur kurulup kapasite kadar parcaya
     KESILIYORDU. Bu yanlisti ve sessizce yanlisti: tur kapali bir
     halka oldugu icin ters yonde dolasmak ayni maliyeti verir ama
     KESIM NOKTALARI degisir, yani gruplar degisir.

     Olculdu (scratchpad/test_sira.js, ortasindan su gecen izgara,
     5 musteri, kapasite 3): ayni maliyetli iki turdan biri 9200 m,
     otekisi 11200 m sefer uretti. Grup kararini turun hangi yone
     dolandigina birakmak boyle bir sey — %20'lik fark, tamamen
     tesadufe bagli.

     Clarke-Wright gruplari DOGRUDAN kuruyor. Herkes kendi
     seferinde baslar (sube -> i -> sube), sonra "birlestirmenin
     en cok kazandirdigi" ciftler sirayla birlestirilir:

         kazanc(i,j) = d(i,sube) + d(sube,j) - d(i,j)

     yani i ile j'yi ayni sefere koyunca subeye bir gidip gelmeden
     kac metre kar edildigi. Kazanc negatifse birlestirmenin
     anlami yok, orada durulur.
     ============================================================ */
  seferleriKur(mat, kapasite) {
    const n = this.musteriler.length;
    if (!n) return [];
    if (kapasite >= n) {
      return [this._sirayiIyilestir(mat, this.musteriler.map((m, i) => i), true, 40)];
    }

    const sefer = this.musteriler.map((m, i) => [i]);   // herkes kendi seferinde
    const nerede = this.musteriler.map((m, i) => i);    // musteri -> sefer indeksi

    const kazanc = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        /* Matris simetrik degil (tek yon), o yuzden (i,j) ve (j,i)
           ayri ayri degerlendiriliyor: i'den sonra j gelmek ile
           j'den sonra i gelmek farkli maliyetler. */
        kazanc.push({ i: i, j: j, k: mat.d(i + 1, 0) + mat.d(0, j + 1) - mat.d(i + 1, j + 1) });
      }
    }
    kazanc.sort((a, b) => b.k - a.k);

    for (const kz of kazanc) {
      if (kz.k <= 0) break;                       // bundan sonrasi zarar
      const a = nerede[kz.i], b = nerede[kz.j];
      if (a === b) continue;                      // zaten ayni seferde
      const A = sefer[a], B = sefer[b];
      if (!A || !B) continue;
      /* i, A'nin SONUNDA ve j, B'nin BASINDA olmali: birlestirme
         A -> B seklinde uc uca ekleme. Ortadaki bir musteriyi
         baglamak seferin ic sirasini bozar. */
      if (A[A.length - 1] !== kz.i || B[0] !== kz.j) continue;
      if (A.length + B.length > kapasite) continue;

      for (const m of B) nerede[m] = a;
      sefer[a] = A.concat(B);
      sefer[b] = null;
    }

    return sefer.filter(Boolean).map((s) => this._sirayiIyilestir(mat, s, true, 20));
  },

  /* ------------------------------------------------------------
     SEFERLER ARASI IYILESTIRME
     Clarke-Wright acgozlu: erken yapilan birlestirmeler sonraki
     secenekleri kapatiyor. Bu pas iki hamleyle toparliyor —
     TASIMA (bir musteriyi baska sefere al) ve TAKAS (iki musteriyi
     degistir). Takas ayri lazim: iki sefer de doluysa tasima
     yapilamiyor, sadece takas kaliyor.
     ------------------------------------------------------------ */
  seferleriIyilestir(mat, seferler, kapasite) {
    const bedel = (s) => (s && s.length) ? this._turMaliyeti(mat, s, true) : 0;
    let tur = 0, iyilesti = true;

    while (iyilesti && tur++ < 30) {
      iyilesti = false;
      for (let a = 0; a < seferler.length && !iyilesti; a++) {
        for (let b = 0; b < seferler.length && !iyilesti; b++) {
          if (a === b) continue;
          const A = seferler[a], B = seferler[b];
          const eski = bedel(A) + bedel(B);

          // --- tasima: A'dan bir musteriyi B'ye al ---
          if (B.length < kapasite) {
            for (let i = 0; i < A.length && !iyilesti; i++) {
              const yeniA = A.slice(0, i).concat(A.slice(i + 1));
              for (let j = 0; j <= B.length; j++) {
                const yeniB = B.slice(0, j).concat([A[i]], B.slice(j));
                if (bedel(yeniA) + bedel(yeniB) < eski - 1e-6) {
                  seferler[a] = yeniA; seferler[b] = yeniB;
                  iyilesti = true; break;
                }
              }
            }
          }
          if (iyilesti) break;

          // --- takas: A'daki i ile B'deki j yer degistirsin ---
          for (let i = 0; i < A.length && !iyilesti; i++) {
            for (let j = 0; j < B.length; j++) {
              const yeniA = A.slice(); yeniA[i] = B[j];
              const yeniB = B.slice(); yeniB[j] = A[i];
              if (bedel(yeniA) + bedel(yeniB) < eski - 1e-6) {
                seferler[a] = this._sirayiIyilestir(mat, yeniA, true, 10);
                seferler[b] = this._sirayiIyilestir(mat, yeniB, true, 10);
                iyilesti = true; break;
              }
            }
          }
        }
      }
    }

    /* Bos kalan seferleri at, kalanlari subeye yakinliga gore
       sirala: kurye once yakin turu yapsin, numaralar da haritada
       merkezden disa dogru okunsun. */
    return seferler.filter((s) => s && s.length)
                   .sort((x, y) => mat.d(0, x[0] + 1) - mat.d(0, y[0] + 1));
  },

  testRota() {
    if (!this.sube) { this.durum('Once bir sube koy: koordinat ya da adres yazip "Sube yap".', 'uyari'); return; }
    if (!this.musteriler.length) { this.durum('Once en az bir musteri ekle.', 'uyari'); return; }
    const ist = this.grafigiHazirla();
    const olcut = document.getElementById('olcut').value;
    const kapK = document.getElementById('kapasite');
    const kapasite = Math.max(1, parseInt(kapK ? kapK.value : 3, 10) || 3);
    const t0 = performance.now();

    this.rotalar = [];
    this.bacakBilgi = [];
    /* Yeni rota cizilince kurye basa donsun: eski rotanin ortasinda kalmis
       bir kurye yeni rotada anlamsiz bir yerde duruyor. */
    this.kurye.aktif = false; this.kurye.rotaIdx = 0;
    this.kurye.segIdx = 0; this.kurye.t = 0; this.kurye.varis = 0;

    /* Butun duraklar arasi GERCEK yol maliyeti — bir kez, sira
       kararlarinin tamami bunun uzerinden veriliyor. Durak basina tek
       Dijkstra; 5 musteride 6 tarama, 15 musteride 16. */
    const mat = this.maliyetMatrisi([this.sube].concat(this.musteriler), olcut);
    const tMat = performance.now() - t0;

    /* Seferler dogrudan kuruluyor (Clarke-Wright), sonra seferler
       arasi tasima/takas ile toparlaniyor. Buyuk turu kesme yontemi
       kaldirildi — sebebi seferleriKur basliginda. */
    const seferler = this.seferleriIyilestir(
      mat, this.seferleriKur(mat, kapasite), kapasite);
    this.teslimatSirasi = [];
    for (const s of seferler) for (const i of s) this.teslimatSirasi.push(i);

    let toplam = 0, basarisiz = 0;
    for (let s = 0; s < seferler.length; s++) {
      const sefer = seferler[s];
      const durak = [this.sube];
      for (const i of sefer) durak.push(this.musteriler[i]);
      durak.push(this.sube);                       // kapasite bitti, yeniden yukle

      for (let i = 0; i + 1 < durak.length; i++) {
        const r = Grafik.rotaBul(durak[i].dugumId, durak[i + 1].dugumId, olcut);
        if (!r) { basarisiz++; continue; }
        this.rotalar.push(Grafik.rotaNoktalari(r.yol));
        /* Bacak hedefi: son bacak subeye donus, digerleri musteri.
           Kurye varis sayarken buna bakiyor — yoksa subeye donuslerı de
           teslimat sayardi. */
        const sonBacak = (i + 1 === durak.length - 1);
        this.bacakBilgi.push(sonBacak
          ? { tip: 'sube', sefer: s }
          : { tip: 'musteri', sefer: s, kalanPaket: sefer.length - i - 1 });
        toplam += r.maliyet;
      }
    }

    const ms = performance.now() - t0;
    const birim = olcut === 'sure' ? (Math.round(toplam / 60) + ' dk') : (Math.round(toplam) + ' m');
    this.durum(this.musteriler.length + ' teslimat · ' + seferler.length + ' sefer (kapasite ' +
               kapasite + ') · ' + birim + '  ·  ' + ist.dugum + ' dugumluk grafikte ' +
               ms.toFixed(0) + ' ms (matris ' + tMat.toFixed(0) + ' ms)' +
               (mat.ulasilmaz ? ('  ·  ' + mat.ulasilmaz + ' cift yoldan baglanmiyor') : '') +
               (basarisiz ? ('  ·  ' + basarisiz + ' bacakta yol yok') : ''),
               (basarisiz || mat.ulasilmaz) ? 'uyari' : 'iyi');
    this.duraklariYaz();
  },
  temizle() {
    this.musteriler = []; this.rotalar = []; this.teslimatSirasi = []; this.bacakBilgi = [];
    this.kurye.aktif = false; this.kurye.varis = 0;
    this.duraklariYaz();
    this.durum('Musteriler ve rotalar silindi.');
  },

  konum(nokta) {
    const m = Proj.metreye(nokta.lat, nokta.lon);
    return { x: m.x, y: m.y, z: Arazi.cz(Arazi.latLonYukseklik(nokta.lat, nokta.lon)) };
  },

  /* ============================================================
     KOORDINAT / ADRES ILE DURAK KOYMA
     ------------------------------------------------------------
     Haritaya tiklayarak koymak gosterim icin iyi ama gercek is
     akisi boyle degil: elde bir adres ya da koordinat listesi
     olur, tek tek tiklanmaz. Kutu ikisini birden kabul ediyor —
     koordinat yazilirsa dogrudan kullanilir, degilse adres
     sayilip cozulur (bkz. adres.js).

     Her durak EN YAKIN YOL DUGUMUNE oturtuluyor. Rota grafik
     uzerinde hesaplandigi icin durak grafikte olmayan bir yerde
     duramaz: bina ortasindaki bir koordinattan rota cikmaz.
     ============================================================ */

  _secilenAdres: null,     // oneriden secilen sonucun adi (etikette gorunsun)

  /* lat/lon -> en yakin yol dugumu. Veri inmemisse null. */
  yolDugumuBul(lat, lon, sinir) {
    const ist = this.grafigiHazirla();
    if (!ist || !ist.dugum) return null;
    const m = Proj.metreye(lat, lon);
    const yk = Grafik.enYakinDugum(m.x, m.y);
    if (!yk) return null;
    /* 400 m: kapali sitelerin ve sanayi alanlarinin ic yollari
       OSM'de her zaman cizili degil, adres dogru olsa bile en
       yakin yol biraz uzakta kalabiliyor. Daha genis tutulursa
       komsu mahalleye atlamaya baslar. */
    return yk.uzaklik <= (sinir || 400) ? yk : null;
  },

  /* Karolar inene kadar bekle. Uzak bir koordinat verildiginde
     grafikte o bolge henuz yok; once oraya gidiliyor, veri
     iniyor, sonra dugum aranıyor. */
  yolDugumuBekle(lat, lon, sure) {
    const bitis = Date.now() + (sure || 15000);
    return new Promise((coz) => {
      const dene = () => {
        const yk = this.yolDugumuBul(lat, lon);
        if (yk) { coz(yk); return; }
        if (Date.now() > bitis) { coz(null); return; }
        setTimeout(dene, 500);
      };
      setTimeout(dene, 700);
    });
  },

  async durakKoy(tip, lat, lon, ad) {
    let yk = this.yolDugumuBul(lat, lon);
    if (!yk) {
      this.durum('Oraya gidiliyor, yol verisi iniyor...');
      this.gitKonuma(lat, lon, Math.max(Kamera.olcek, 0.9));
      yk = await this.yolDugumuBekle(lat, lon, 20000);
    }
    if (!yk) {
      this.durum('O noktanin 400 m yakininda cizili yol yok — veri inmemis ' +
                 'olabilir ya da koordinat yolsuz bir alanda.', 'hata');
      return false;
    }

    const d = yk.dugum;
    const durak = { dugumId: d.id, lat: d.lat, lon: d.lon, ad: ad || null };
    /* Yola oturtma noktayi biraz kaydiriyor; kullanici ne kadar
       kaydigini bilsin, "yanlis yere koydu" sanmasin. */
    const kayma = Math.round(yk.uzaklik);

    if (tip === 'sube') {
      this.sube = durak;
      this.durum('Sube kondu' + (ad ? ': ' + ad.split(',').slice(0, 2).join(',') : '') +
                 (kayma > 25 ? '  ·  yola ' + kayma + ' m oturtuldu' : ''), 'iyi');
    } else {
      this.musteriler.push(durak);
      this.durum(this.musteriler.length + '. musteri kondu' +
                 (ad ? ': ' + ad.split(',').slice(0, 2).join(',') : '') +
                 (kayma > 25 ? '  ·  yola ' + kayma + ' m oturtuldu' : ''), 'iyi');
    }
    /* Durak degisti, eldeki rota artik o duraklara ait degil.
       Bayat rotayi ekranda birakmak "1 2 3" numaralarini da
       yanlis gosterirdi. */
    this.rotalariUnut();
    this.duraklariYaz();
    return true;
  },

  /* Kutudaki metni cozup durak koy. Koordinatsa dogrudan,
     adresse once cozup gerekirse secim listesi gosterir. */
  async durakEkle(tip) {
    const kutu = document.getElementById('konumKutu');
    const metin = kutu.value.trim();
    if (!metin) { this.durum('Once koordinat ya da adres yaz.', 'uyari'); return; }

    const nokta = Adres.koordinatCozumle(metin);
    if (nokta) {
      /* Oneriden secilmisse adi da tasi: koordinat ayni ise o adres. */
      const s = this._secilenAdres;
      const ad = (s && Math.abs(s.lat - nokta.lat) < 1e-6 &&
                       Math.abs(s.lon - nokta.lon) < 1e-6) ? s.ad : null;
      await this.durakKoy(tip, nokta.lat, nokta.lon, ad);
      return;
    }

    if (Adres.virgulluOndalik(metin)) {
      this.durum('Ondalik ayirac NOKTA olmali: "41,0011" degil "41.0011". ' +
                 'Virgul sadece enlem ile boylamı ayirir.', 'uyari');
      return;
    }

    this.durum('Adres cozuluyor: ' + metin);
    try {
      const liste = await Adres.ara(metin);
      if (!liste.length) { this.durum('Adres bulunamadi: ' + metin, 'uyari'); return; }
      if (liste.length === 1) {
        await this.durakKoy(tip, liste[0].lat, liste[0].lon, liste[0].ad);
        return;
      }
      /* Birden fazla sonuc: sessizce ilkini secmek yanlis semte
         durak koymak demek ("Merkez Mahallesi" her ilcede var). */
      this.adresSectir(liste, tip);
    } catch (e) {
      this.durum('Adres servisi hatasi: ' + e.message, 'hata');
    }
  },

  /* Cok sonuclu aramada hangisi oldugunu kullanici secsin. */
  adresSectir(liste, tip) {
    const kap = document.getElementById('konumOneri');
    kap.innerHTML = '';
    liste.forEach((y) => {
      const d = document.createElement('div');
      d.className = 'sonuc';
      d.textContent = y.ad;
      d.onclick = async () => {
        kap.innerHTML = '';
        await this.durakKoy(tip, y.lat, y.lon, y.ad);
      };
      kap.appendChild(d);
    });
    this.durum(liste.length + ' sonuc — hangisi oldugunu sec.', 'uyari');
  },

  /* Yazarken oneri. Secilince kutuya koordinat yaziliyor: boylece
     kullanici ne konacagini tam olarak goruyor ve isterse elle
     duzeltiyor. */
  async oneriGoster() {
    const kutu = document.getElementById('konumKutu');
    const kap = document.getElementById('konumOneri');
    const metin = kutu.value.trim();

    if (Adres.koordinatCozumle(metin) || metin.length < 3) { kap.innerHTML = ''; return; }
    /* Harita merkezini odak olarak ver: "Merkez Mahallesi" her
       ilcede var, yakindakiler one ciksin. */
    const liste = await Adres.oneri(metin, Proj.lat0, Proj.lon0);
    if (kutu.value.trim() !== metin) return;      // kullanici yazmaya devam etti

    kap.innerHTML = '';
    liste.forEach((y) => {
      const d = document.createElement('div');
      d.className = 'sonuc';
      d.textContent = y.ad;
      d.onclick = () => {
        kutu.value = y.lat.toFixed(6) + ', ' + y.lon.toFixed(6);
        this._secilenAdres = { lat: y.lat, lon: y.lon, ad: y.ad };
        kap.innerHTML = '';
        this.durum(y.ad, 'iyi');
      };
      kap.appendChild(d);
    });
  },

  rotalariUnut() {
    this.rotalar = []; this.teslimatSirasi = []; this.bacakBilgi = [];
    this.kurye.aktif = false; this.kurye.varis = 0;
    this.kurye.rotaIdx = 0; this.kurye.segIdx = 0; this.kurye.t = 0;
    /* Kurye yoldayken durak degisirse dugme "durdur"da kalirdi. */
    this.kuryeDugmesiniYaz();
  },

  /* Panel listesi. Rota cizilmisse TESLIMAT sirasina gore diziliyor —
     numaralar haritadaki isaretcilerle birebir ayni. */
  duraklariYaz() {
    const kap = document.getElementById('duraklarListe');
    if (!kap) return;
    kap.innerHTML = '';

    if (!this.sube && !this.musteriler.length) {
      kap.textContent = 'Sube yok · musteri yok';
      return;
    }

    const satir = (no, sinif, ad, silFn) => {
      const s = document.createElement('div');
      s.className = 'durakSatir';
      const n = document.createElement('b');
      n.className = 'no' + (sinif ? ' ' + sinif : '');
      n.textContent = no;
      const a = document.createElement('span');
      a.className = 'ad';
      a.textContent = ad;
      a.title = ad;
      s.appendChild(n); s.appendChild(a);
      if (silFn) {
        const b = document.createElement('button');
        b.className = 'sil'; b.textContent = '✕'; b.title = 'sil';
        b.onclick = silFn;
        s.appendChild(b);
      }
      kap.appendChild(s);
    };
    const yaz = (d) => d.ad ? d.ad.split(',').slice(0, 2).join(',')
                            : d.lat.toFixed(5) + ', ' + d.lon.toFixed(5);

    if (this.sube) {
      satir('S', 'sube', yaz(this.sube), () => {
        this.sube = null; this.rotalariUnut(); this.duraklariYaz();
        this.durum('Sube silindi.');
      });
    }

    /* Rota varsa teslimat sirasina gore, yoksa ekleme sirasina gore. */
    const sirali = this.teslimatSirasi.length === this.musteriler.length
      ? this.teslimatSirasi.slice()
      : this.musteriler.map((m, i) => i);

    sirali.forEach((i, yer) => {
      const m = this.musteriler[i];
      if (!m) return;
      const no = this.teslimatSirasi.length === this.musteriler.length
        ? String(yer + 1) : '#' + (i + 1);
      satir(no, '', yaz(m), () => {
        this.musteriler.splice(i, 1);
        this.rotalariUnut();      // indeksler kaydi, eski sira gecersiz
        this.duraklariYaz();
        this.durum(this.musteriler.length + ' musteri kaldi. Rotayi yeniden ciz.');
      });
    });
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

    /* --- koordinat / adres ile durak koyma --- */
    document.getElementById('subeYapBtn').onclick = () => this.durakEkle('sube');
    document.getElementById('musteriYapBtn').onclick = () => this.durakEkle('musteri');
    const kKutu = document.getElementById('konumKutu');
    kKutu.oninput = () => this.oneriGoster();
    kKutu.onkeydown = (e) => {
      /* Enter = musteri ekle: en sik yapilan is bu, sube bir kere
         konuyor. Shift+Enter sube yapar. */
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this.durakEkle(e.shiftKey ? 'sube' : 'musteri');
    };
    this.duraklariYaz();

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
      this.abartmaYaz();
      Cizer.kirlet();
    };
    /* On ayarlar. 2× "hafif kabartma" — yollar duz kalsin ama tepe
       nerede belli olsun diye; 6× varsayilan; 12× arazi calismasi. */
    document.querySelectorAll('[data-abartma]').forEach((b) => {
      b.onclick = () => {
        Arazi.abartma = parseFloat(b.dataset.abartma);
        this.abartmaYaz();
        Cizer.kirlet();
      };
    });
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
      this.sube = { dugumId: d.id, lat: d.lat, lon: d.lon, ad: null };
      this.durum('Sube isaretlendi.');
    } else {
      this.musteriler.push({ dugumId: d.id, lat: d.lat, lon: d.lon, ad: null });
      this.durum(this.musteriler.length + ' musteri.');
    }
    /* Koordinatla koymadaki ile ayni: durak degisti, eldeki rota
       ve numaralar artik bu duraklara ait degil. */
    this.rotalariUnut();
    this.duraklariYaz();
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
    /* Kamera takibi — OLU BOLGE ile.
       Her karede ortalamak kamerayi surekli oynatiyor, bu da duragan
       tamponu her karede gecersiz kilip tam yeniden cizime zorluyordu
       (takip modunda hissedilen agirlik buydu). Kurye ekranin ortasindaki
       kutunun disina cikmadikca kamera duruyor; cikinca ortaliyor.
       Ortalarken z SART, yoksa yukseklik yuzunden alakasiz yer gosterilir. */
    if (this.kurye.aktif && this.kuryeIzle) {
      const kz = Arazi.cz(this.kurye.z || 0);
      const p = Kamera.ekrana(this.kurye.x, this.kurye.y, kz);
      const payX = Kamera.genislik * 0.22, payY = Kamera.yukseklik * 0.22;
      if (Math.abs(p.sx - Kamera.genislik / 2) > payX ||
          Math.abs(p.sy - Kamera.yukseklik / 2) > payY) {
        Kamera.ortala(this.kurye.x, this.kurye.y, kz);
        hareket = true;
      }
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
        /* Elindeki paket: su an gidilen bacagin hedefi musteriyse, o
           teslimat dahil kalan paket sayisi. Subeye donerken 0. */
        const bilgi = this.bacakBilgi[this.kurye.rotaIdx];
        const paket = (bilgi && bilgi.tip === 'musteri')
          ? (bilgi.kalanPaket || 0) + 1 : 0;
        Cizer.kuryeCiz(c, this.kurye.x, this.kurye.y,
                       Arazi.cz(this.kurye.z || 0), this.kurye.aci, paket);
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
