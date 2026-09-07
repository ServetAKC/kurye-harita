<?php
/* ============================================================
   teshis.php — SADECE harita tuvalinin goruntusunu alir.
   Sayfa ?ss=1 ile acildiginda tuvali PNG olarak buraya gonderir;
   boylece bir cizim hatasi tarif uzerinden degil, dogrudan
   goruntu uzerinden incelenebilir. Ekranin geri kalani, baska
   pencereler, sekmeler DAHIL DEGILDIR — sadece <canvas> icerigi.
   Isi bitince bu dosya silinebilir.
   ============================================================ */
header('Content-Type: application/json; charset=utf-8');
$veri = isset($_POST['png']) ? $_POST['png'] : '';
$onEk = 'data:image/png;base64,';
if (strncmp($veri, $onEk, strlen($onEk)) !== 0) {
    http_response_code(400);
    echo json_encode(array('hata' => 'png verisi yok'));
    exit;
}
$ham = base64_decode(substr($veri, strlen($onEk)), true);
if ($ham === false || strlen($ham) < 100) {
    http_response_code(400);
    echo json_encode(array('hata' => 'cozulemedi'));
    exit;
}
$ad = isset($_POST['ad']) && preg_match('/^[a-z0-9_-]{1,40}$/', $_POST['ad']) ? $_POST['ad'] : 'tuval';
$yol = __DIR__ . '/teshis-' . $ad . '.png';
file_put_contents($yol, $ham);
if (isset($_POST['bilgi'])) file_put_contents(__DIR__ . '/teshis-' . $ad . '.json', $_POST['bilgi']);
echo json_encode(array('tamam' => true, 'bayt' => strlen($ham), 'dosya' => basename($yol)));
