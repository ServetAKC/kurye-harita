/* ============================================================
   adres.js  —  Adres <-> koordinat (geocoding) istemcisi
   ------------------------------------------------------------
   "Beylikduzu Cumhuriyet Mahallesi" -> 41.0011, 28.6417

   Isi bolumu:
     adresveri.php  dis servisle konusur (kimlik, hiz siniri, onbellek)
     bu dosya       sayfaya tek bir arayuz sunar

   Vekil yoksa (dosyayi cift tiklayip actiysan, PHP kapaliysa)
   dogrudan Nominatim'e dusuyoruz. Calisir ama:
     - User-Agent gonderilemez (tarayici izin vermiyor)
     - hiz siniri paylasilamaz, her sekme kendi basina sayar
     - onbellek sekme kapaninca gider
   Yani gelistirme icin idare eder, gercek kullanim icin vekil sart.

   Ucretsiz servisler, Google yok, anahtar yok:
     Photon    -> yazarken oneri (yarim kelimeyle calisir)
     Nominatim -> kesin sonuc (ev numarasi cozer)
   ============================================================ */

const Adres = {

  vekil: null,          // '' = yok, 'adresveri.php' = var
  _vekilSozu: null,
  _oneriZaman: null,
  _sonIstek: 0,

  async vekilBul() {
    if (this.vekil !== null) return this.vekil;
    if (this._vekilSozu) return this._vekilSozu;
    this._vekilSozu = (async () => {
      let bulunan = '';
      const sunucudan = (location.protocol === 'http:' || location.protocol === 'https:');
      try {
        const c = await fetch('adresveri.php?ping=1', { cache: 'no-store' });
        if (c.ok) {
          const j = await c.json();
          if (j && j.vekil) bulunan = 'adresveri.php';
        }
      } catch (e) {
        /* Yoklamanin kendisi engellenmis olabilir (izleme korumasi,
           HTTPS-Only kipi, eklenti). Sayfa bir sunucudan geldiyse
           dosya buyuk ihtimalle YINE DE duruyordur; varsayip
           deniyoruz. Varsayim yanlissa istek hata verir ve
           dogrudan Nominatim'e dusulur. osmveri.php'de de ayni
           mantik var, sebebi orada uzun uzun yazili. */
        if (sunucudan) bulunan = 'adresveri.php';
        console.warn('[adres] vekil yoklamasi basarisiz:', (e && e.message) || e);
      }
      this.vekil = bulunan;
      console.log('[adres] vekil:', bulunan || 'yok — dogrudan Nominatim');
      return bulunan;
    })();
    return this._vekilSozu;
  },

  /* Vekil yokken kendi hiz sinirimizi uygulayalim: Nominatim'in
     kurali saniyede 1 istek ve buna uymayan IP engelleniyor. */
  async _bekle() {
    const gecen = Date.now() - this._sonIstek;
    if (gecen < 1100) await new Promise(r => setTimeout(r, 1100 - gecen));
    this._sonIstek = Date.now();
  },

  async _cek(url) {
    const c = await fetch(url, { cache: 'no-store' });
    if (!c.ok) {
      let ek = '';
      try { const j = await c.json(); if (j && j.hata) ek = ' — ' + j.hata; } catch (e) {}
      throw new Error('HTTP ' + c.status + ek);
    }
    return c.json();
  },

  /* ------------------------------------------------------------
     KESIN ARAMA — kullanici Enter'a bastiginda / oneri sectiginde
     Donen: [{ ad, lat, lon, tur, kaynak }]
     ------------------------------------------------------------ */
  async ara(metin) {
    const v = await this.vekilBul();
    if (v) return this._cek(v + '?mod=ara&q=' + encodeURIComponent(metin));

    await this._bekle();
    const url = 'https://nominatim.openstreetmap.org/search?format=json' +
                '&addressdetails=1&limit=8&countrycodes=tr&q=' + encodeURIComponent(metin);
    const liste = await this._cek(url);
    return liste.map(y => ({
      ad: y.display_name, lat: parseFloat(y.lat), lon: parseFloat(y.lon),
      tur: y.type || '', kaynak: 'nominatim'
    }));
  },

  /* ------------------------------------------------------------
     YAZARKEN ONERI — her tusa basista degil, duraklayinca.
     Debounce sart: her harfte istek atmak hem yavas hem de
     servisin adil kullanim sinirini deler.
     lat/lon verilirse yakindaki sonuclar one cikar ("Merkez
     Mahallesi" her ilcede var).
     ------------------------------------------------------------ */
  oneri(metin, lat, lon, gecikme) {
    clearTimeout(this._oneriZaman);
    return new Promise((coz) => {
      this._oneriZaman = setTimeout(async () => {
        if (!metin || metin.trim().length < 3) { coz([]); return; }
        try {
          const v = await this.vekilBul();
          if (v) {
            let u = v + '?mod=oneri&q=' + encodeURIComponent(metin);
            if (lat !== undefined && lon !== undefined) u += '&lat=' + lat + '&lon=' + lon;
            coz(await this._cek(u));
            return;
          }
          await this._bekle();
          let u = 'https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(metin);
          if (lat !== undefined && lon !== undefined) u += '&lat=' + lat + '&lon=' + lon;
          const j = await this._cek(u);
          coz((j.features || []).map((f) => {
            const p = f.properties || {}, parca = [];
            ['name', 'street', 'housenumber', 'district', 'city', 'state'].forEach((a) => {
              if (p[a] && parca.indexOf(p[a]) < 0) parca.push(p[a]);
            });
            return {
              ad: parca.join(', '),
              lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
              tur: p.osm_value || '', kaynak: 'photon'
            };
          }));
        } catch (e) {
          console.warn('[adres] oneri alinamadi:', (e && e.message) || e);
          coz([]);
        }
      }, gecikme === undefined ? 350 : gecikme);
    });
  },

  /* Koordinat -> adres. "Bu nokta neresi" demek icin. */
  async ters(lat, lon) {
    const v = await this.vekilBul();
    if (v) return this._cek(v + '?mod=ters&lat=' + lat + '&lon=' + lon);
    await this._bekle();
    const j = await this._cek('https://nominatim.openstreetmap.org/reverse?format=json' +
                              '&zoom=18&lat=' + lat + '&lon=' + lon);
    return { ad: j.display_name || '', lat: lat, lon: lon, kaynak: 'nominatim' };
  },

  /* ------------------------------------------------------------
     KOORDINAT AYRISTIRMA
     Kabul edilenler:
        41.0011, 28.6417      41.0011 28.6417      41.0011;28.6417
        41.0011, 28.6417 seklinde N/E harfleriyle
        Google'dan kopyalanan "41.0011,28.6417" da ayni sey
     Donen: { lat, lon }  ya da  null (koordinat degil, adres)

     Ondalik AYIRAC NOKTA. Turkce klavyede virgul yazmak dogal
     ama "41,0011, 28,6417" ile "41.0011, 28.6417" ayirt
     edilemiyor — dort parca mi iki parca mi belli olmuyor.
     O yuzden virgul sadece lat/lon ayiraci sayiliyor; virgullu
     ondalik yazan kullaniciya asagida acik hata veriliyor.
     ------------------------------------------------------------ */
  koordinatCozumle(metin) {
    if (!metin) return null;
    const t = metin.trim().replace(/[NnKk]|[EeDd]$/g, ' ');
    const p = t.split(/[,;\s]+/).filter(s => s.length);
    if (p.length !== 2) return null;
    if (!/^-?\d+(\.\d+)?$/.test(p[0]) || !/^-?\d+(\.\d+)?$/.test(p[1])) return null;
    const lat = parseFloat(p[0]), lon = parseFloat(p[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon };
  },

  /* Virgullu ondalik yazilmis mi? ("41,0011 28,6417")
     Hata mesajini anlamli yapmak icin ayri kontrol. */
  virgulluOndalik(metin) {
    return /^\s*-?\d+,\d+[\s;]+-?\d+,\d+\s*$/.test(metin || '');
  }
};
