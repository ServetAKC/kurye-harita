/* ============================================================
   depo.js  —  Kalici onbellek (IndexedDB)
   ------------------------------------------------------------
   Sayfa her yenilendiginde harita sifirdan iniyordu. Sunucu
   tarafinda disk onbellegi var (osmveri.php), o yuzden istek
   hizli donuyor — ama yine de bir ag gidis donusu, JSON cozumu
   ve ayristirma yapiliyor.

   Burada Overpass'tan donen HAM cevap sorgu metnine gore
   saklaniyor. Ayni sorgu tekrar istendiginde ag'a hic
   cikilmiyor: kayit diskten okunup dogrudan kullaniliyor.

   NEDEN ayristirilmis sekiller degil de ham metin:
   ayristirma 36 bin nokta NESNESI uretiyor; bunlari IndexedDB'ye
   yazmak structured clone demek ve olculdu, 48 ms suruyor —
   hem yazarken hem okurken. Ham metin tek parca string oldugu
   icin hem yazmasi hem okumasi ucuz, uzerine JSON.stringify
   maliyeti de yok (cevap zaten metin olarak aliniyor).

   Her sey iyimser calisir: IndexedDB yoksa, kota dolduysa ya da
   gizli sekmede aciksa sessizce devre disi kalir, program
   eskisi gibi ag'dan iner.
   ============================================================ */

const Depo = {
  ADI: 'kurye-harita',
  SURUM: 1,
  MAGAZA: 'bloklar',

  /* OSM verisi gunler icinde degisiyor; bir hafta taze saymak guvenli.
     Sunucu onbellegiyle (osmveri.php) ayni omur. */
  OMUR_MS: 7 * 24 * 3600 * 1000,
  /* Kaba tavan. Bir mahalle blogu ~3.5 MB; 60 blok makul bir tarayici
     kotasina sigar. Asilirsa en eski kayitlar atilir. */
  TAVAN_BAYT: 250 * 1024 * 1024,

  _db: null,
  _acilis: null,
  kapali: false,
  okundu: 0,      // bu oturumda onbellekten gelen blok sayisi
  yazildi: 0,

  ac() {
    if (this._db) return Promise.resolve(this._db);
    if (this._acilis) return this._acilis;
    if (this.kapali || typeof indexedDB === 'undefined') return Promise.resolve(null);
    const ben = this;
    this._acilis = new Promise(function (coz) {
      let istek;
      try { istek = indexedDB.open(ben.ADI, ben.SURUM); }
      catch (e) { ben.kapali = true; return coz(null); }

      istek.onupgradeneeded = function () {
        const db = istek.result;
        if (!db.objectStoreNames.contains(ben.MAGAZA)) {
          const m = db.createObjectStore(ben.MAGAZA, { keyPath: 'anahtar' });
          m.createIndex('zaman', 'zaman');
        }
      };
      istek.onsuccess = function () {
        ben._db = istek.result;
        ben._db.onversionchange = function () { try { ben._db.close(); } catch (e) {} ben._db = null; };
        coz(ben._db);
      };
      istek.onerror = function () { ben.kapali = true; coz(null); };
      istek.onblocked = function () { ben.kapali = true; coz(null); };
    });
    return this._acilis;
  },

  /* Sorgu metninden kisa anahtar. FNV-1a 32 bit + uzunluk: bu boyutta
     carpisma ihtimali ihmal edilebilir, uzunluk da ikinci bir emniyet. */
  anahtarla(metin) {
    let h = 0x811c9dc5;
    for (let i = 0; i < metin.length; i++) {
      h ^= metin.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36) + '-' + metin.length;
  },

  async oku(anahtar) {
    const db = await this.ac();
    if (!db) return null;
    const ben = this;
    return new Promise(function (coz) {
      let i;
      try {
        const t = db.transaction(ben.MAGAZA, 'readonly');
        i = t.objectStore(ben.MAGAZA).get(anahtar);
      } catch (e) { return coz(null); }
      i.onsuccess = function () {
        const k = i.result;
        if (!k || !k.metin) return coz(null);
        if (Date.now() - k.zaman > ben.OMUR_MS) return coz(null);   // bayat
        ben.okundu++;
        coz(k.metin);
      };
      i.onerror = function () { coz(null); };
    });
  },

  /* Beklenmesi gerekmiyor: cagiran taraf sonucu zaten elinde tutuyor. */
  async yaz(anahtar, metin) {
    const db = await this.ac();
    if (!db) return;
    const ben = this;
    try {
      const t = db.transaction(this.MAGAZA, 'readwrite');
      t.objectStore(this.MAGAZA).put({
        anahtar: anahtar, metin: metin, bayt: metin.length, zaman: Date.now()
      });
      t.oncomplete = function () {
        ben.yazildi++;
        if (ben.yazildi % 8 === 0) ben.buda();
      };
      /* Kota dolmasi normal bir sonuc, hata degil: sessizce vazgec. */
      t.onerror = function () { t.onerror = null; };
      t.onabort = function () { t.onabort = null; };
    } catch (e) { /* yazamadik, onemli degil */ }
  },

  /* Bayat kayitlari ve tavani asan fazlaligi (en eskiden baslayarak) atar. */
  async buda() {
    const db = await this.ac();
    if (!db) return;
    const ben = this;
    try {
      const t = db.transaction(this.MAGAZA, 'readwrite');
      const m = t.objectStore(this.MAGAZA);
      const imlec = m.index('zaman').openCursor();
      const kayitlar = [];
      let toplam = 0;
      imlec.onsuccess = function () {
        const c = imlec.result;
        if (c) {
          const v = c.value;
          if (Date.now() - v.zaman > ben.OMUR_MS) { c.delete(); }
          else { toplam += (v.bayt || 0); kayitlar.push(v.anahtar); }
          return c.continue();
        }
        // en eskiden baslayarak tavana inene kadar at (index zamana gore sirali)
        let i = 0;
        while (toplam > ben.TAVAN_BAYT && i < kayitlar.length) {
          m.delete(kayitlar[i]);
          toplam -= ben.TAVAN_BAYT / Math.max(1, kayitlar.length);
          i++;
        }
      };
    } catch (e) { /* budayamadik, onemli degil */ }
  },

  /* Panelden/konsoldan cagirmak icin: her seyi sil. */
  async hepsiniSil() {
    const db = await this.ac();
    if (!db) return false;
    return new Promise((coz) => {
      try {
        const t = db.transaction(this.MAGAZA, 'readwrite');
        t.objectStore(this.MAGAZA).clear();
        t.oncomplete = () => coz(true);
        t.onerror = () => coz(false);
      } catch (e) { coz(false); }
    });
  }
};
