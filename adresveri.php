<?php
/* ============================================================
   adresveri.php  —  Adres <-> koordinat vekili (geocoding)
   ------------------------------------------------------------
   "Vural Sokak 12, Beylikduzu" -> 41.0011, 28.6417

   ADI ONEMLI: osmveri.php ile ayni sebep. Icinde "geo", "proxy",
   "api", "track" gecen dosya adlari Firefox tabanli tarayicilarda
   izleme korumasi/reklam engelleyici filtrelerine takilabiliyor
   (bkz. osmveri.php basligi). Adini degistirme.

   ------------------------------------------------------------
   NEDEN VEKIL? Uc ayri sebep, ucu de tarayicidan cozulemez:

   1) Nominatim'in kullanim sartlari GERCEK bir User-Agent
      istiyor ("hangi uygulama, kim sorumlu"). Tarayici
      User-Agent basligini JavaScript'ten set ETTIRMIYOR —
      yasakli baslik. Sunucudan gonderiliyor.

   2) Saniyede 1 istek siniri var. Tarayicida her sekme kendi
      basina sayar, ortak bir sayac tutulamaz. Burada tek bir
      kilit dosyasi butun istekleri sirali tutuyor.

   3) Onbellek. Adresler yerinden oynamiyor; ayni sorguyu iki
      kere sormak bedava olmali. Tarayici onbellegi sekme
      kapaninca gidiyor, bu kalici.

   ------------------------------------------------------------
   SERVISLER — hepsi ucretsiz, anahtar istemiyor, Google yok:

   Photon (photon.komoot.io)
     Yazarken oneri icin. Elasticsearch uzerine kurulu, yarim
     kelimeyle calisiyor ("beylikd" -> Beylikduzu). Sonuclari
     kaba; kesin koordinat icin degil, secim listesi icin.

   Nominatim (nominatim.openstreetmap.org)
     Kesin sonuc icin. Tam adres cozer, ev numarasi bilir.
     Yavas ve sinirli — sadece kullanici bir oneri sectiginde
     ya da Enter'a bastiginda cagriliyor.

   Ikisi de OpenStreetMap verisi kullaniyor, yani ayni sehri
   goruyorlar. Ikisi de "adil kullanim" bekliyor: bu dosyadaki
   onbellek + hiz siniri tam olarak bunun icin.

   ------------------------------------------------------------
   GERCEK YUKTE NE YAPILIR (bu proje buyurse):
   Ikisi de kendi sunucunda calistirilabilir, ikisi de acik
   kaynak. Turkiye ozeti Geofabrik'ten ~700 MB (planet 80 GB
   degil). Docker imaji hazir. O zaman: sinir yok, hiz siniri
   yok, ucuncu tarafa bagimlilik yok, veri de senin elinde.
   Ayrintili anlatim: OKUBENI.md > "Adres cozumleme".
   ============================================================ */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (isset($_GET['ping'])) {
    echo json_encode(array('vekil' => true, 'curl' => function_exists('curl_init')));
    exit;
}

$mod = isset($_GET['mod']) ? $_GET['mod'] : 'ara';

/* Kimlik. Nominatim sartlari bunu ZORUNLU tutuyor; uygulamayi
   tanitmayan istekler engellenebiliyor. Projeyi baskasi
   yayinlarsa buradaki adresi kendi adresiyle degistirmeli. */
define('KIMLIK', 'kurye-harita/1.0 (OSM tabanli kurye rota simulasyonu; yerel calisma)');

/* Turkiye'ye sinirla: hem sonuc kalitesi artiyor hem de
   "Beylikduzu" yazinca dunyanin obur ucundan sonuc gelmiyor. */
define('ULKE', 'tr');

/* ------------------------------------------------------------
   ONBELLEK — adresler yerinden oynamadigi icin omru uzun.
   Ayri dizin: Overpass onbellegi (yuz MB'lar) budanirken adres
   sonuclari (birkac KB) onunla birlikte silinmesin.
   ------------------------------------------------------------ */
$onbellekDizin = __DIR__ . '/onbellek/adres';
$onbellekOmur  = 30 * 24 * 3600;

function onbellekAnahtar() {
    $g = $_GET;
    unset($g['_']);                       // tarayicinin onbellek kirici parametresi
    ksort($g);
    return md5(json_encode($g));
}

$onbellekDosya = $onbellekDizin . '/' . onbellekAnahtar() . '.json';
if (is_file($onbellekDosya) && (time() - filemtime($onbellekDosya)) < $onbellekOmur) {
    header('X-Onbellek: hit');
    readfile($onbellekDosya);
    exit;
}
header('X-Onbellek: miss');

function onbellegeYaz($dizin, $dosya, $icerik) {
    if (!is_dir($dizin)) @mkdir($dizin, 0777, true);
    if (!is_dir($dizin)) return;
    $ht = $dizin . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Deny from all\n");
    @file_put_contents($dosya, $icerik, LOCK_EX);

    // Ara sira budama: 20 MB'i asarsa en eskiler gitsin.
    if (mt_rand(1, 50) !== 1) return;
    $liste = glob($dizin . '/*.json');
    if (!$liste) return;
    $toplam = 0; $bilgi = array();
    foreach ($liste as $f) { $b = @filesize($f); $toplam += $b; $bilgi[$f] = array(@filemtime($f), $b); }
    if ($toplam <= 20 * 1024 * 1024) return;
    uasort($bilgi, function ($a, $b) { return $a[0] - $b[0]; });
    foreach ($bilgi as $f => $v) {
        @unlink($f);
        $toplam -= $v[1];
        if ($toplam <= 15 * 1024 * 1024) break;
    }
}

/* ------------------------------------------------------------
   HIZ SINIRI — saniyede en fazla 1 istek (Nominatim sarti).
   Kilit dosyasinda son istegin zamani duruyor; erken gelen
   istek farki kadar bekliyor. flock: iki sekme ayni anda
   sorarsa ikisi de ayni "son zaman"i okuyup birlikte gecmesin.
   Onbellekten donenler buraya hic ugramiyor, yani asil
   koruma onbellek; bu son savunma hatti.
   ------------------------------------------------------------ */
function hizSinirla($dizin) {
    if (!is_dir($dizin)) @mkdir($dizin, 0777, true);
    $kilit = $dizin . '/.hiz';
    $fp = @fopen($kilit, 'c+');
    if (!$fp) return;
    if (flock($fp, LOCK_EX)) {
        $son = (float) stream_get_contents($fp);
        $fark = microtime(true) - $son;
        if ($fark < 1.05) usleep((int) ((1.05 - $fark) * 1000000));
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, (string) microtime(true));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

function getir($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_ENCODING       => '',
            CURLOPT_USERAGENT      => KIMLIK,
            CURLOPT_HTTPHEADER     => array('Accept: application/json',
                                            'Accept-Language: tr,en')
        ));
        $govde = curl_exec($ch);
        $kod   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hata  = curl_error($ch);
        curl_close($ch);
        if ($govde !== false && $kod == 200) return array(true, $govde);
        return array(false, $hata ? $hata : ('HTTP ' . $kod));
    }

    $ctx = stream_context_create(array('http' => array(
        'method'  => 'GET',
        'header'  => "User-Agent: " . KIMLIK . "\r\nAccept: application/json\r\n",
        'timeout' => 20
    )));
    $govde = @file_get_contents($url, false, $ctx);
    if ($govde !== false) return array(true, $govde);
    return array(false, 'file_get_contents basarisiz (allow_url_fopen kapali olabilir)');
}

/* Iki servisin cikti bicimi farkli; sayfa tek bicim gorsun diye
   burada ayni kaliba donuyorlar: { ad, lat, lon, tur, kaynak } */
function nominatimBicimle($ham) {
    $liste = json_decode($ham, true);
    if (!is_array($liste)) return array();
    $cikti = array();
    foreach ($liste as $y) {
        if (!isset($y['lat'], $y['lon'])) continue;
        $cikti[] = array(
            'ad'     => isset($y['display_name']) ? $y['display_name'] : '',
            'lat'    => (float) $y['lat'],
            'lon'    => (float) $y['lon'],
            'tur'    => isset($y['type']) ? $y['type'] : '',
            'kaynak' => 'nominatim'
        );
    }
    return $cikti;
}

function photonBicimle($ham) {
    $j = json_decode($ham, true);
    if (!isset($j['features']) || !is_array($j['features'])) return array();
    $cikti = array();
    foreach ($j['features'] as $f) {
        if (!isset($f['geometry']['coordinates'][1])) continue;
        $p = isset($f['properties']) ? $f['properties'] : array();
        /* Photon parcali donuyor (isim / sokak / ilce / il); okunur
           tek satir icin dolu olanlari birlestiriyoruz. */
        $parca = array();
        foreach (array('name', 'street', 'housenumber', 'district', 'city', 'state') as $a) {
            if (!empty($p[$a]) && !in_array($p[$a], $parca, true)) $parca[] = $p[$a];
        }
        $cikti[] = array(
            'ad'     => implode(', ', $parca),
            'lat'    => (float) $f['geometry']['coordinates'][1],
            'lon'    => (float) $f['geometry']['coordinates'][0],
            'tur'    => isset($p['osm_value']) ? $p['osm_value'] : '',
            'kaynak' => 'photon'
        );
    }
    return $cikti;
}

/* ------------------------------------------------------------ */

$q = isset($_GET['q']) ? trim($_GET['q']) : '';

if ($mod === 'oneri') {
    /* Yazarken oneri. Photon hizli ve yarim kelimeyle calisiyor.
       Odak noktasi verilirse (haritanin merkezi) yakindaki
       sonuclar one cikiyor — "Merkez Mahallesi" her ilcede var. */
    if ($q === '') { echo json_encode(array()); exit; }
    $url = 'https://photon.komoot.io/api/?q=' . rawurlencode($q) . '&limit=6&lang=default';
    if (isset($_GET['lat'], $_GET['lon'])) {
        $url .= '&lat=' . rawurlencode($_GET['lat']) . '&lon=' . rawurlencode($_GET['lon']);
    }
    hizSinirla($onbellekDizin);
    list($ok, $cevap) = getir($url);
    if (!$ok) { http_response_code(502); echo json_encode(array('hata' => $cevap)); exit; }
    $sonuc = json_encode(photonBicimle($cevap), JSON_UNESCAPED_UNICODE);
    onbellegeYaz($onbellekDizin, $onbellekDosya, $sonuc);
    echo $sonuc;
    exit;
}

if ($mod === 'ters') {
    /* Koordinat -> adres. Haritada bir yere tiklayinca "burasi
       neresi" demek icin. */
    $lat = isset($_GET['lat']) ? (float) $_GET['lat'] : null;
    $lon = isset($_GET['lon']) ? (float) $_GET['lon'] : null;
    if ($lat === null || $lon === null) {
        http_response_code(400);
        echo json_encode(array('hata' => 'lat/lon gerekli'));
        exit;
    }
    $url = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18'
         . '&lat=' . rawurlencode($lat) . '&lon=' . rawurlencode($lon);
    hizSinirla($onbellekDizin);
    list($ok, $cevap) = getir($url);
    if (!$ok) { http_response_code(502); echo json_encode(array('hata' => $cevap)); exit; }
    $j = json_decode($cevap, true);
    $sonuc = json_encode(array(
        'ad'  => isset($j['display_name']) ? $j['display_name'] : '',
        'lat' => $lat, 'lon' => $lon, 'kaynak' => 'nominatim'
    ), JSON_UNESCAPED_UNICODE);
    onbellegeYaz($onbellekDizin, $onbellekDosya, $sonuc);
    echo $sonuc;
    exit;
}

/* mod=ara — kesin sonuc. Once Nominatim; bos donerse Photon'a dus.
   Ikisi ayni OSM verisini farkli indeksliyor, biri bulamayinca
   oteki bulabiliyor (ozellikle isim aramalarinda). */
if ($q === '') {
    http_response_code(400);
    echo json_encode(array('hata' => 'q parametresi yok'));
    exit;
}

$url = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1'
     . '&limit=8&countrycodes=' . ULKE . '&q=' . rawurlencode($q);
hizSinirla($onbellekDizin);
list($ok, $cevap) = getir($url);

$liste = $ok ? nominatimBicimle($cevap) : array();
$sonHata = $ok ? '' : $cevap;

if (!count($liste)) {
    $url2 = 'https://photon.komoot.io/api/?q=' . rawurlencode($q) . '&limit=8&lang=default';
    hizSinirla($onbellekDizin);
    list($ok2, $cevap2) = getir($url2);
    if ($ok2) $liste = photonBicimle($cevap2);
    else if ($sonHata === '') $sonHata = $cevap2;
}

if (!count($liste) && $sonHata !== '') {
    http_response_code(502);
    echo json_encode(array('hata' => 'adres servisi cevap vermedi: ' . $sonHata));
    exit;
}

$sonuc = json_encode($liste, JSON_UNESCAPED_UNICODE);
onbellegeYaz($onbellekDizin, $onbellekDosya, $sonuc);
echo $sonuc;
