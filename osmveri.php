<?php
/* ============================================================
   osmveri.php  —  Overpass vekili
   ------------------------------------------------------------
   ADI ONEMLI: bu dosya eskiden "proxy.php" idi ve Firefox tabanli
   tarayicilarda (Zen'de olculdu, 7 Eylul 2026) Enhanced Tracking
   Protection istegi "NetworkError" ile kesiyordu — reklam/izleme
   engelleyici filtre listeleri yolunda "proxy" gecen istekleri
   hedefliyor. Yerel bir dosya olmasi fark etmiyor. Adi geri
   "proxy.php" yapma; "ads", "track", "analytics" gibi kelimeler de
   ayni sonucu verir.
   ------------------------------------------------------------
   Neden var: tarayici tarafindaki engellenme (izleme korumasi,
   reklam engelleyici, kurumsal ag, antivirus) hicbir Overpass
   aynasiyla asilamiyor — istek daha cikmadan kesiliyor ve
   "CORS request did not succeed, status null" hatasi aliniyor.

   Bu dosya sayfayla AYNI kaynakta oldugu icin tarayici onu
   engellemez; dis baglantiyi PHP kurar. Sayfa `osmveri.php` varsa
   kendiliginden bunu kullanir (bkz. Overpass.vekilBul).

   Kullanim:
     GET  osmveri.php?ping=1   -> {"vekil":true}
     POST osmveri.php          -> govde: data=<overpass sorgusu>
   ============================================================ */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Yoklama: sayfa vekilin var olup olmadigini boyle anliyor
if (isset($_GET['ping'])) {
    echo json_encode(array('vekil' => true, 'curl' => function_exists('curl_init')));
    exit;
}

$sorgu = isset($_POST['data']) ? $_POST['data'] : '';
if ($sorgu === '') {
    http_response_code(400);
    echo json_encode(array('hata' => 'data parametresi yok'));
    exit;
}

// Kotuye kullanimi onlemek icin: sadece Overpass sorgusu gecsin
if (strlen($sorgu) > 20000) {
    http_response_code(413);
    echo json_encode(array('hata' => 'sorgu cok uzun'));
    exit;
}

/* Sira ONEMLI: ilk cevap veren kullanilir, digerlerine sira gelmez.
   7 Eylul 2026 olcumu (ayni bina sorgusu, bu agdan):
     maps.mail.ru      6.0 sn  ->  calisiyor, 481 KB
     kumi.systems      0.3 sn  ->  HTTP 429 (istek siniri)
     private.coffee    0.3 sn  ->  HTTP 429
     z.overpass-api.de  12 sn  ->  443 portuna hic baglanamiyor
     overpass-api.de    12 sn  ->  443 portuna hic baglanamiyor
   Olu ikisi bastayken her sorgu ~24 sn'yi bosa harciyordu; tarayici
   25 sn'de vazgectigi icin bina iceren bloklar hic tamamlanamiyordu.
   mail.ru tarayicida engelleniyor ama burada baglantiyi PHP kuruyor —
   vekilin var olma sebebi zaten tam olarak bu. */
$sunucular = array(
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
);

$sonHata = 'bilinmeyen';

/* ------------------------------------------------------------
   ONBELLEK — ayni bolgeye tekrar bakmak bedava olsun.
   Olculdu (7 Eylul 2026): ayni blok arka arkaya iki kere istendi,
   ikisi de ~7 sn surdu. Ayni olcumde 3.4 kat KUCUK bir sorgu da
   6.8 sn surdu — yani gecikme veri boyutundan bagimsiz, Overpass'in
   sorgu isleme suresi sabit. Bu yuzden karo kucultmek ise yaramiyor
   (sure ayni kalir, sorgu sayisi artar); tek gercek cozum cevabi
   saklamak. OSM verisi gunler icinde degistigi icin bir hafta taze
   saymak fazlasiyla guvenli.
   ------------------------------------------------------------ */
$onbellekDizin = __DIR__ . '/onbellek';
$onbellekOmur  = 7 * 24 * 3600;
$onbellekDosya = $onbellekDizin . '/' . md5($sorgu) . '.json';

if (is_file($onbellekDosya) && (time() - filemtime($onbellekDosya)) < $onbellekOmur) {
    header('X-Onbellek: hit');
    readfile($onbellekDosya);
    exit;
}
header('X-Onbellek: miss');

function onbellegeYaz($dizin, $dosya, $icerik) {
    if (!is_dir($dizin)) @mkdir($dizin, 0777, true);
    if (!is_dir($dizin)) return;
    // web'den okunmasin (veri zaten acik OSM ama dizin listesi sizmasin)
    $ht = $dizin . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Deny from all\n");
    @file_put_contents($dosya, $icerik, LOCK_EX);

    // Ara sira budama: 400 MB'i asarsa en eski dosyalari at.
    if (mt_rand(1, 40) !== 1) return;
    $liste = glob($dizin . '/*.json');
    if (!$liste) return;
    $toplam = 0; $bilgi = array();
    foreach ($liste as $f) { $b = @filesize($f); $toplam += $b; $bilgi[$f] = array(@filemtime($f), $b); }
    if ($toplam <= 400 * 1024 * 1024) return;
    uasort($bilgi, function ($a, $b) { return $a[0] - $b[0]; });   // eskiden yeniye
    foreach ($bilgi as $f => $v) {
        @unlink($f);
        $toplam -= $v[1];
        if ($toplam <= 300 * 1024 * 1024) break;
    }
}

/* ------------------------------------------------------------
   AYNA YARISI — sirayla denemek yerine ilk uc aynaya AYNI ANDA
   soruyoruz, ilk gecerli cevap kazaniyor, digerleri iptal.
   Hangi aynanin o an hizli oldugu degisken (biri 429 verirken oteki
   6 sn'de donuyor); sirali deneme yavas aynalarin suresini ust uste
   toplayip bekletiyordu.
   ------------------------------------------------------------ */
if (function_exists('curl_multi_init')) {
    $yarisanlar = array_slice($sunucular, 0, 3);
    $mh = curl_multi_init();
    $eller = array();
    foreach ($yarisanlar as $s) {
        $ch = curl_init($s);
        curl_setopt_array($ch, array(
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query(array('data' => $sorgu)),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_ENCODING       => '',
            CURLOPT_USERAGENT      => 'kurye-harita/1.0 (yerel vekil)'
        ));
        curl_multi_add_handle($mh, $ch);
        $eller[] = $ch;
    }

    $kazanan = null;
    do {
        $durum = curl_multi_exec($mh, $calisan);
        if ($calisan) curl_multi_select($mh, 0.5);
        while ($bilgi = curl_multi_info_read($mh)) {
            $ch  = $bilgi['handle'];
            $kod = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($bilgi['result'] === CURLE_OK && $kod == 200) {
                $govde = curl_multi_getcontent($ch);
                if ($govde !== false && $govde !== '') { $kazanan = $govde; break 2; }
            }
            $e = curl_error($ch);
            $sonHata = $e ? $e : ('HTTP ' . $kod);
        }
    } while ($calisan && $durum == CURLM_OK);

    foreach ($eller as $ch) { curl_multi_remove_handle($mh, $ch); curl_close($ch); }
    curl_multi_close($mh);

    if ($kazanan !== null) {
        onbellegeYaz($onbellekDizin, $onbellekDosya, $kazanan);
        echo $kazanan;
        exit;
    }
    // yarisi kimse kazanmadiysa kalan aynalara sirayla dusulur
    $sunucular = array_slice($sunucular, 3);
}

foreach ($sunucular as $sunucu) {
    if (function_exists('curl_init')) {
        $ch = curl_init($sunucu);
        curl_setopt_array($ch, array(
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query(array('data' => $sorgu)),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_ENCODING       => '',            // gzip kabul et
            CURLOPT_USERAGENT      => 'kurye-harita/1.0 (yerel vekil)'
        ));
        $cevap = curl_exec($ch);
        $kod   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hata  = curl_error($ch);
        curl_close($ch);

        if ($cevap !== false && $kod == 200) {
            onbellegeYaz($onbellekDizin, $onbellekDosya, $cevap);
            echo $cevap;
            exit;
        }
        $sonHata = $hata ? $hata : ('HTTP ' . $kod);
    } else {
        // curl yoksa akis sarmalayicisiyla dene
        $ctx = stream_context_create(array('http' => array(
            'method'  => 'POST',
            'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query(array('data' => $sorgu)),
            'timeout' => 60
        )));
        $cevap = @file_get_contents($sunucu, false, $ctx);
        if ($cevap !== false) {
            onbellegeYaz($onbellekDizin, $onbellekDosya, $cevap);
            echo $cevap;
            exit;
        }
        $sonHata = 'file_get_contents basarisiz (allow_url_fopen kapali olabilir)';
    }
}

http_response_code(502);
echo json_encode(array('hata' => 'hicbir Overpass sunucusuna ulasilamadi: ' . $sonHata));
