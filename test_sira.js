/* Teslimat sirasi testi.
   Iddia: sira artik GERCEK yol maliyetine gore kuruluyor ve
   kus ucusuna gore kurulan siradan daha kisa tur uretiyor.
   Bunu olcmeden dogru kabul etmiyoruz. */

const fs = require('fs');
const path = require('path');
const KOK = __dirname;   // test depo kokunde duruyor

/* --- graph.js'i yukle (DOM istemiyor) --- */
global.Arazi = { latLonYukseklik: () => 0, cz: (z) => z };
const kaynakGraph = fs.readFileSync(path.join(KOK, 'js/graph.js'), 'utf8');
/* const'lar dogrudan eval'de kapali kaliyor; global'e tasi */
eval(kaynakGraph + ';global.Grafik=Grafik;');

/* --- main.js'i yukle: sadece window lazim --- */
global.window = { addEventListener: () => {} };
global.Proj = {
  /* Testte lat/lon = metre kabul: mesafe dogrudan oklid.
     Gercekte Proj.mesafe haversine, ama sira mantigi olcek
     birimine bagli degil. */
  mesafe: (la1, lo1, la2, lo2) => Math.hypot(la2 - la1, lo2 - lo1)
};
const kaynakMain = fs.readFileSync(path.join(KOK, 'js/main.js'), 'utf8');
eval(kaynakMain + ';global.Uyg=Uyg;');

/* ============================================================
   TEST SEHRI — ortasinda GOL olan bir izgara
   ------------------------------------------------------------
   21x21 dugum, 100 m aralikli. Ortadaki 9x9'luk blok gol:
   dugum yok, yol yok. Golun iki yakasi kus ucusu yakin ama
   yoldan dolasmak gerekiyor — Buyukcekmece'nin ta kendisi.
   ============================================================ */
const N = 21, ADIM = 100;
/* Haritayi ikiye bolen su serit: j = 10 boyunca, i = 0..17.
   Tek gecis sagdaki i = 18..20 koprusu. Iki yaka kus ucusu
   200 m, yoldan kilometrelerce — Buyukcekmece Golu boyle. */
const golde = (i, j) => (j === 10 && i <= 17);
const kimlik = (i, j) => i * 100 + j;

const D = new Map();
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    if (golde(i, j)) continue;
    D.set(kimlik(i, j), {
      id: kimlik(i, j), x: i * ADIM, y: j * ADIM,
      lat: i * ADIM, lon: j * ADIM, komsu: []
    });
  }
}
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    if (golde(i, j)) continue;
    const d = D.get(kimlik(i, j));
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N || golde(ni, nj)) return;
      d.komsu.push({ hedef: kimlik(ni, nj), uzunluk: ADIM, sure: ADIM / 13.9 });
    });
  }
}
Grafik.dugumler = D;

/* --- duraklar: golun DORT bir yaninda --- */
/* Duraklar suyun IKI yakasinda, karsilikli.
   Karsi yaka kus ucusu 200 m (en yakin komsu!), yoldan 3600 m.
   Ayni yakadaki komsu 600 m. Kus ucusu bakan algoritma her
   seferinde "karsiya gec" diyor. */
const durakYeri = [
  [2, 9],    // sube — alt yaka
  [2, 11],   // ust yaka, subenin TAM karsisi
  [8, 9],  [8, 11],
  [14, 9], [14, 11]
];
const durak = durakYeri.map(([i, j]) => ({
  dugumId: kimlik(i, j), lat: i * ADIM, lon: j * ADIM
}));

Uyg.sube = durak[0];
Uyg.musteriler = durak.slice(1);

/* --- matris --- */
const t0 = Date.now();
const mat = Uyg.maliyetMatrisi(durak, 'uzunluk');
const tMat = Date.now() - t0;

console.log('Sehir: ' + D.size + ' dugum, ortasinda ' +
            18 + ' dugumluk su serit (tek kopru sagda)');
console.log('Matris: ' + durak.length + ' durak, ' + tMat + ' ms\n');

/* Golun iki yakasi gercekten uzak mi? */
const kus = Math.hypot(durak[0].lat - durak[1].lat, durak[0].lon - durak[1].lon);
const yol = mat.d(0, 1);
console.log('Suyun iki yakasi:  kus ucusu ' + Math.round(kus) +
            ' m,  yoldan ' + Math.round(yol) + ' m  (x' + (yol / kus).toFixed(1) + ')');
if (mat.ulasilmaz) console.log('!! ulasilmaz cift: ' + mat.ulasilmaz);

/* --- YENI sira: gercek yol maliyeti --- */
const yeniSira = Uyg.teslimatSirasiBul(mat, true);
const yeniMaliyet = Uyg._turMaliyeti(mat, yeniSira, true);

/* --- ESKI sira: kus ucusu (karsilastirma icin yeniden kuruldu) --- */
function kusMatrisi(duraklar) {
  const n = duraklar.length, M = [];
  for (let i = 0; i < n; i++) {
    M[i] = [];
    for (let j = 0; j < n; j++) {
      M[i][j] = Math.hypot(duraklar[i].lat - duraklar[j].lat,
                           duraklar[i].lon - duraklar[j].lon);
    }
  }
  return { d: (i, j) => M[i][j], ulasilmaz: 0 };
}
const kmat = kusMatrisi(durak);
const eskiSira = Uyg.teslimatSirasiBul(kmat, true);
/* Eski sira kus ucusuna gore secildi ama kurye GERCEK yoldan
   gidecek: maliyeti gercek matrisle olcuyoruz. Adil karsilastirma
   bu — iki sirayi da ayni terazide tartmak. */
const eskiMaliyet = Uyg._turMaliyeti(mat, eskiSira, true);

/* --- KABA KUVVET: gercek en iyi --- */
function permutasyonlar(a) {
  if (a.length <= 1) return [a];
  const c = [];
  a.forEach((v, i) => {
    const kalan = a.slice(0, i).concat(a.slice(i + 1));
    permutasyonlar(kalan).forEach(p => c.push([v].concat(p)));
  });
  return c;
}
const hepsi = permutasyonlar(Uyg.musteriler.map((m, i) => i));
let enIyi = null, enIyiMaliyet = Infinity;
for (const p of hepsi) {
  const u = Uyg._turMaliyeti(mat, p, true);
  if (u < enIyiMaliyet) { enIyiMaliyet = u; enIyi = p; }
}

const yaz = (s) => s.map(i => (i + 1)).join(' -> ');
console.log('');
console.log('kus ucusuna gore sira : ' + yaz(eskiSira) +
            '   gercek maliyet ' + Math.round(eskiMaliyet) + ' m');
console.log('yol maliyetine gore   : ' + yaz(yeniSira) +
            '   gercek maliyet ' + Math.round(yeniMaliyet) + ' m');
console.log('kaba kuvvet en iyi    : ' + yaz(enIyi) +
            '   gercek maliyet ' + Math.round(enIyiMaliyet) + ' m   (' +
            hepsi.length + ' permutasyon)');

console.log('');
const kazanc = eskiMaliyet - yeniMaliyet;
console.log('KAZANC : ' + Math.round(kazanc) + ' m  (%' +
            (100 * kazanc / eskiMaliyet).toFixed(1) + ')');
console.log('EN IYIDEN SAPMA : %' +
            (100 * (yeniMaliyet - enIyiMaliyet) / enIyiMaliyet).toFixed(2));

let hata = 0;
if (yeniMaliyet > eskiMaliyet + 1e-6) { console.log('X yeni sira eskiden KOTU'); hata++; }
if (yeniMaliyet > enIyiMaliyet * 1.0001) { console.log('X yeni sira en iyi degil'); hata++; }
if (new Set(yeniSira).size !== Uyg.musteriler.length) { console.log('X sirada eksik/tekrar var'); hata++; }
// ozet en sonda

/* ============================================================
   ASIL SENARYO — KAPASITELI SEFERLER
   ------------------------------------------------------------
   Kurye 3 paket tasiyor, bitince subeye donuyor. Sira burada
   sadece "kim once" degil, KIMLER AYNI SEFERDE demek. Kus ucusu
   suyun iki yakasindaki musterileri komsu sanip ayni sefere
   koyuyor; kurye o seferde koprüyü iki kere geciyor.
   ============================================================ */
function boru(siraMat, olcMat, kapasite) {
  const seferler = Uyg.seferleriIyilestir(siraMat, Uyg.seferleriKur(siraMat, kapasite), kapasite);
  let t = 0;
  for (const s of seferler) t += Uyg._turMaliyeti(olcMat, s, true);
  return { seferler: seferler, maliyet: t };
}

console.log('\n=== kapasiteli seferler (kapasite 3) ===');
for (const kap of [2, 3, 4]) {
  const eski = boru(kmat, mat, kap);
  const yeni = boru(mat, mat, kap);
  const fark = eski.maliyet - yeni.maliyet;
  console.log('kapasite ' + kap + ':  kus ucusu ' + Math.round(eski.maliyet) +
              ' m   ->   yol ' + Math.round(yeni.maliyet) + ' m   ' +
              (fark > 0 ? ('KAZANC ' + Math.round(fark) + ' m (%' +
                           (100 * fark / eski.maliyet).toFixed(1) + ')')
                        : (fark < 0 ? 'KAYIP ' + Math.round(-fark) + ' m' : 'fark yok')));
  console.log('   kus ucusu seferleri: ' + eski.seferler.map(s => '[' + s.map(i => i + 1).join(',') + ']').join(' '));
  console.log('   yol seferleri      : ' + yeni.seferler.map(s => '[' + s.map(i => i + 1).join(',') + ']').join(' '));
}

console.log(hata ? '\nSONUC: ' + hata + ' hata' : '\nSONUC: gecti');

/* ============================================================
   DURUST KARSILASTIRMA — eski kodun tamami vs yeni kodun tamami
   ------------------------------------------------------------
   ESKI: kus ucusu matrisi + tek buyuk tur + kapasite kadar kesme
   YENI: gercek yol matrisi + Clarke-Wright + seferler arasi pas
   Tek bir dizilimde sonuc tesadufe bagli; rastgele 200 dizilimde
   ortalama aliniyor.
   ============================================================ */
function boruEski(kapasite) {
  const genel = Uyg.teslimatSirasiBul(kmat, true);          // kus ucusu sira
  const seferler = [];
  for (let i = 0; i < genel.length; i += kapasite) {
    seferler.push(Uyg.seferIciDuzelt(kmat, genel.slice(i, i + kapasite)));
  }
  let t = 0;
  for (const s of seferler) t += Uyg._turMaliyeti(mat, s, true);   // gercek maliyet
  return t;
}
function boruYeni(kapasite) {
  const seferler = Uyg.seferleriIyilestir(mat, Uyg.seferleriKur(mat, kapasite), kapasite);
  let t = 0;
  for (const s of seferler) t += Uyg._turMaliyeti(mat, s, true);
  return t;
}

/* Yol ustundeki rastgele bir dugum sec (gol/su disinda) */
const tumDugumler = Array.from(D.keys());
function rastgeleDurak(rnd) {
  const id = tumDugumler[Math.floor(rnd() * tumDugumler.length)];
  const d = D.get(id);
  return { dugumId: id, lat: d.lat, lon: d.lon };
}
/* Sabit tohumlu uretec: test her calistiginda ayni sonucu versin */
function uretec(tohum) {
  let s = tohum;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

console.log('\n=== 200 rastgele dizilim, 6 musteri, kapasite 3 ===');
const rnd = uretec(20260908);
let toplamEski = 0, toplamYeni = 0, yeniKazandi = 0, eskiKazandi = 0, berabere = 0;
const DENEME = 200;
for (let t = 0; t < DENEME; t++) {
  const sube = rastgeleDurak(rnd);
  const mus = [];
  for (let k = 0; k < 6; k++) mus.push(rastgeleDurak(rnd));
  Uyg.sube = sube; Uyg.musteriler = mus;

  const m = Uyg.maliyetMatrisi([sube].concat(mus), 'uzunluk');
  const km = kusMatrisi([sube].concat(mus));
  /* boruEski/boruYeni ust kapsamdaki mat/kmat'i kullaniyor;
     her denemede onlari degistiriyoruz */
  mat.d = m.d; kmat.d = km.d;

  const e = boruEski(3), y = boruYeni(3);
  toplamEski += e; toplamYeni += y;
  if (y < e - 1e-6) yeniKazandi++; else if (e < y - 1e-6) eskiKazandi++; else berabere++;
}
console.log('eski (kus ucusu + tur kesme)   ortalama: ' + Math.round(toplamEski / DENEME) + ' m');
console.log('yeni (yol matrisi + C-W + pas) ortalama: ' + Math.round(toplamYeni / DENEME) + ' m');
console.log('ortalama kazanc: %' + (100 * (toplamEski - toplamYeni) / toplamEski).toFixed(1));
console.log('yeni daha iyi: ' + yeniKazandi + ' · esit: ' + berabere + ' · eski daha iyi: ' + eskiKazandi);

process.exit(hata ? 1 : 0);
