/* ============================================================
   proj.js  —  Koordinat donusumleri
   ------------------------------------------------------------
   Uc ayri "dunya" var, sirayla birbirine cevriliyor:

   1) Cografi   : enlem/boylam (lat/lon)   -> OSM'den boyle geliyor
   2) Metre     : x = dogu, y = kuzey      -> mesafe hesabi burada yapilir
   3) Ekran     : izometrik piksel         -> canvas'a boyle cizilir

   Izometrik cizim: dunyayi once 45 derece dondur, sonra kamerayi
   35.26 derece egik tut. Sabitleri asagida hazir yazdim.
   ============================================================ */

const Proj = {
  // --- 1) Cografi -> Metre --------------------------------------------
  lat0: 0,        // haritanin merkezi (bu nokta 0,0 metre kabul edilir)
  lon0: 0,
  mPerLat: 111132, // 1 derece enlem kac metre (her yerde yaklasik ayni)
  mPerLon: 85000,  // 1 derece boylam kac metre (enleme gore degisir)

  /* Haritanin merkezini belirle. Butun metre hesaplari buna gore. */
  merkeziAyarla(lat, lon) {
    this.lat0 = lat;
    this.lon0 = lon;
    // Boylamin metre karsiligi kutuplara gidildikce kisalir: cos(enlem)
    this.mPerLon = 111320 * Math.cos(lat * Math.PI / 180);
    this.mPerLat = 110574;
  },

  /* lat/lon -> {x: dogu metre, y: kuzey metre} */
  metreye(lat, lon) {
    return {
      x: (lon - this.lon0) * this.mPerLon,
      y: (lat - this.lat0) * this.mPerLat
    };
  },

  /* metre -> lat/lon (geri donus, marker kaydetmek icin lazim) */
  cografiye(x, y) {
    return {
      lat: this.lat0 + y / this.mPerLat,
      lon: this.lon0 + x / this.mPerLon
    };
  },

  /* Iki nokta arasi gercek mesafe (metre). Rota maliyeti bununla hesaplanir. */
  mesafe(lat1, lon1, lat2, lon2) {
    const a = this.metreye(lat1, lon1);
    const b = this.metreye(lat2, lon2);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
};


/* ============================================================
   Izometrik projeksiyon sabitleri
   ------------------------------------------------------------
   sx = (x - y) * 0.7071
   sy = -(x + y) * 0.4082 - z * 0.8165
   Eksi isaretler: kuzey ekranda YUKARI gitsin, yukseklik YUKARI cikssin.
   ============================================================ */
const IZO_X = 0.7071067811865476;
const IZO_Y = 0.4082482904638631;
const IZO_Z = 0.8164965809277260;


/* ============================================================
   Kamera —  nereye bakiyoruz, ne kadar yakiniz, ne kadar donuk
   ============================================================ */
const Kamera = {
  olcek: 0.9,   // 1 metre kac piksel
  panX: 0,      // ekran kaydirma
  panY: 0,
  aci: 0,       // dunyayi kendi ekseninde dondurme (radyan) — NFS mini-map icin
  genislik: 0,
  yukseklik: 0,

  /* Doner acinin kosinus/sinusu. Aci cizim boyunca SABIT kaliyor ama
     ekrana() nokta basina cagriliyor — mahalle seviyesinde bir cizimde
     yarim milyondan fazla kez. Her seferinde Math.cos/sin cagirmak
     olculebilir sekilde yavaslatiyordu; aci degismedikce hazir deger
     donduruluyor. Aci disaridan dogrudan atandigi icin (Kamera.aci = ...)
     setter yerine tembel kontrol kullaniyoruz: bir sayi karsilastirmasi
     iki trigonometri cagrisindan cok daha ucuz. */
  _aciSon: NaN,
  _c: 1,
  _s: 0,

  _trig() {
    if (this._aciSon !== this.aci) {
      this._aciSon = this.aci;
      this._c = Math.cos(this.aci);
      this._s = Math.sin(this.aci);
    }
  },

  /* Metre dunyasindaki (x,y,z) noktasini ekran pikseline cevirir. */
  ekrana(x, y, z) {
    // once kamerayi dondur
    if (this._aciSon !== this.aci) this._trig();
    const c = this._c, s = this._s;
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    // sonra izometrik yassilt
    return {
      sx: (rx - ry) * IZO_X * this.olcek + this.panX,
      sy: (-(rx + ry) * IZO_Y - (z || 0) * IZO_Z) * this.olcek + this.panY
    };
  },

  /* Sadece derinlik sirasi (hangisi arkada?). Buyuk deger = arkada. */
  derinlik(x, y) {
    if (this._aciSon !== this.aci) this._trig();
    const c = this._c, s = this._s;
    return (x * c - y * s) + (x * s + y * c);
  },

  /* Ekran pikseli -> metre dunyasi (z=0 zemininde).
     Fareyle haritaya tiklayip sube/musteri koymak icin lazim. */
  dunyaya(sx, sy) {
    const u = (sx - this.panX) / (this.olcek * IZO_X);   // = rx - ry
    const v = (sy - this.panY) / (this.olcek * IZO_Y);   // = -(rx + ry)
    const rx = (u - v) / 2;
    const ry = (-v - u) / 2;
    // kamera donusunu geri al
    const c = Math.cos(-this.aci), s = Math.sin(-this.aci);
    return { x: rx * c - ry * s, y: rx * s + ry * c };
  },

  /* Verilen metre dikdortgeni ekrana tam sigacak olcegi bul ve ortala.
     araziYukseklik: abartma uygulanmis en yuksek nokta — arazi yukseldiginde
     harita ekranda yukari dogru buyudugu icin dikeyde pay birakiyoruz. */
  sigdir(minx, miny, maxx, maxy, araziYukseklik) {
    const eskiOlcek = this.olcek, eskiX = this.panX, eskiY = this.panY;
    this.olcek = 1; this.panX = 0; this.panY = 0;

    let sxmin = Infinity, sxmax = -Infinity, symin = Infinity, symax = -Infinity;
    const koseler = [[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy]];
    for (const k of koseler) {
      const p = this.ekrana(k[0], k[1], 0);
      if (p.sx < sxmin) sxmin = p.sx;
      if (p.sx > sxmax) sxmax = p.sx;
      if (p.sy < symin) symin = p.sy;
      if (p.sy > symax) symax = p.sy;
    }
    this.olcek = eskiOlcek; this.panX = eskiX; this.panY = eskiY;

    const gx = Math.max(1, sxmax - sxmin);
    const gy = Math.max(1, (symax - symin) + (araziYukseklik || 0) * IZO_Z);
    this.olcek = Math.min(this.genislik * 0.94 / gx, this.yukseklik * 0.88 / gy);
    this.ortala((minx + maxx) / 2, (miny + maxy) / 2);
  },

  /* Kamerayi bir noktaya ortala */
  ortala(x, y) {
    const p = { sx: 0, sy: 0 };
    const c = Math.cos(this.aci), s = Math.sin(this.aci);
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    p.sx = (rx - ry) * IZO_X * this.olcek;
    p.sy = (-(rx + ry) * IZO_Y) * this.olcek;
    this.panX = this.genislik / 2 - p.sx;
    this.panY = this.yukseklik / 2 - p.sy;
  }
};
