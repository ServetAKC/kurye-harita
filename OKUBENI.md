| `js/depo.js` | Kalici onbellek (IndexedDB): inen bloklar diske yazilir, sayfa yenilenince ag'a cikilmaz |
| `js/depo.js` | Kalici onbellek (IndexedDB): inen bloklar diske yazilir, sayfa yenilenince aga cikilmaz |
| `js/proj.js` | Koordinat donusumleri: enlem/boylam ↔ metre ↔ izometrik piksel, kamera. Ayrica `Nefes`: uzun isi karelere bolme |
# Kurye Haritasi — izometrik altyapi

Gercek OpenStreetMap verisi + gercek yukseklikle izometrik (NFS mini-map tarzi)
sehir cizen, ve ayni veriden kurye algoritmasinin kullanacagi **yol grafigini**
kuran altyapi.

**Merkez/yaricap secme, "indir" butonu yok.** Harita neresi goruntuleniyorsa
orayi kendiliginden indirir, ekrandan cikani bellekten atar.

Su an yapilan: **harita altyapisi.** Kurye avatari ve asil algoritma sonraki adim.

---

## Calistirma

XAMPP acikken: http://localhost/kurye-harita/  ·  Apache kapaliysa `index.html`.

Ac, bekle. Ilk karolar birkac saniyede iner (ekran merkezinden disari dogru).
Sonra sadece gez.

---

## Dosyalar

| Dosya | Isi |
|---|---|
| `js/depo.js` | Kalici onbellek (IndexedDB): inen bloklar diske yazilir, sayfa yenilenince aga cikilmaz |
| `js/proj.js` | Koordinat donusumleri: enlem/boylam ↔ metre ↔ izometrik piksel, kamera. Ayrica `Nefes`: uzun isi karelere bolme |
| `js/terrain.js` | Yukseklik karolari: indirme, cozme, ornekleme, gri arazi paleti |
| `js/overpass.js` | OSM sorgusu ve ayristirma; detay seviyeleri; durak (POI) tanimlari |
| `js/tiles.js` | **Karo yoneticisi** — ne yuklenecek, ne atilacak, hangi detayda |
| `js/graph.js` | Yol grafigi + A* (ikili yigin ile) |
| `js/render.js` | Cizim motoru, tampon goruntu, durak ikonlari |
| `js/main.js` | Kamera yumusatma, arayuz, ana dongu |

---

## Nasil calisiyor

### 1. Karo mantigi
Ekranda gorunen bolge standart harita karolarina (z/x/y) bolunur. Elde olmayan
karolar sirayla indirilir — **once ekran merkezine yakin olanlar**. Uzun suredir
gorunmeyen karolar bellekten atilir (tavan 48 karo).

Detay seviyesi zoom'dan gelir. Karo boyu detayla birlikte kuculdugu icin
ekranda **her zaman 4-25 karo** olur; yani her zoom seviyesinde indirilen veri
benzer kalir:

| Seviye | Zoom esigi | Karo boyu | Ceker |
|---|---|---|---|
| Genis   | < 0.125 | 14.8 km | otoyol, ana arter |
| Bolge   | < 0.28  | 7.4 km  | + tali yollar |
| Ilce    | < 0.90  | 3.7 km  | + ara sokaklar |
| Mahalle | >= 0.90 | 1.85 km | + servis/yaya yollari + **binalar** |

### 2. Akicilik — isin puf noktasi
Duragan katman (arazi + yollar + binalar) ekrandan **her yanda 200 piksel buyuk**
bir tampona cizilir. Kaydirirken yeniden cizim yapilmaz; hazir goruntu kaydirilip
yapistirilir. Zoom sirasinda ayni goruntu olceklenir. Yeniden cizim sadece
hareket durunca, donunce veya marj tukenince olur.

Bu yaklasimda goruntunun **piksel piksel dogru** yerde durmasi sart. Matematigi
test edildi: kaydirma + zoom sonrasi sapma **0.000000000 piksel**.

Ayrica: zoom hedefe dogru yumusar, surukleme birakinca atalet ile kayar.

### 3. Yukseklik
AWS "terrarium" karolari, yukseklik renge gomulu:
`metre = (R*256 + G + B/256) - 32768`. Deniz negatif cikar, Beylikduzu tepeleri
~200 m. Ornekleme karolarin ustunden yapilir (dort komsu piksel farkli karolarda
olsa bile), o yuzden karo sinirinda dikis izi olusmaz.

Arazi **gri tonlu** — sehir ve yollar one ciksin diye. Yukseklik yine okunur:
hem ton hem egim golgelemesi hem es yukselti egrileri var.

Dikey abartma sart: 200 m'lik tepe 20 km'lik goruntude gercek olcegiyle 8 piksel
eder, yani gorunmez. Panelde kaydirak var, "Bu gorunume gore ayarla" da otomatik
secer.

### 4. Deniz
Kara ve deniz **ayni agda** cizilir: geometride yukseklik 0'in altina inmez
(deniz duz), renk gercek kota gore secilir. Boylece kiyida catlak olmaz.
Uzerine OSM'nin kiyi cizgisi ekleniyor.

### 5. Duraklar
8 tur: benzinlik, otopark, sarj, restoran, market, eczane, hastane, banka.
Benzinlik gercek pompa ikonu, otopark gercek mavi **P** levhasi.
Hepsi her zaman indirilir (ucuz), kutucuklar sadece gosterimi acar/kapar.

### 1b. Veri nasil cekiliyor (yuklenme sorunlari buradan cikti)

**Istek birlestirme.** Once her karo icin ayri sorgu atiliyordu: tek gorunum
16 istek. Artik eksik karolar sabit bir izgaraya gore partilere ayrilir
(seviyeye gore 2x1 / 2x2) ve her parti icin TEK sorgu atilir. Izgaranin sabit
olmasi partilerin cakismamasini saglar — ayni veri iki kere inmez, geri
donunce onbellekten gelir. Merkeze en yakin parti once cekilir.

**Seviyeye gore icerik.** Olculdu: 22x15 km bolge sorgusunda tertiary yollar
%17, landuse+leisure %20 yer kapliyordu ve o olcekte ikisi de gorunmuyordu.
Her seviye artik sadece kendi olceginde gorunecek seyi ceker
(`Overpass.DETAY` icindeki `yol` / `alan` / `su` / `poi` alanlari).

**Coklu ayna + geri cekilme.** Tek sunucuya bagli kalmak "yuklenmiyor"
demek — nitekim 4 Eylul 2026'da overpass-api.de ve kumi.systems bu agdan hic
cevap vermez oldu (ana sayfalari bile acilmiyordu; ayni anda AWS ve Nominatim
saniyenin altinda cevap veriyordu). Simdi dort ayna var, cevap vermeyen
25 sn'de birakilip siradaki denenir, calisan ayna basa alinir.

Hata alinca karo eskiden hemen siliniyor ve bir sonraki karede tekrar
isteniyordu — sunucu cevap vermeyince bu, saniyede birkac istekle suren bir
dovmeye donusuyordu. Artik ustel geri cekilme (3, 6, 12, 24, en fazla 45 sn)
ve hata panelde yaziyor.

**Yerel vekil (`osmveri.php`).** Tarayicida "CORS request did not succeed,
Status code: (null)" gorursen bu CORS basligi sorunu DEGIL — istek daha
cikmadan kesilmis demektir (izleme korumasi, reklam engelleyici, kurumsal ag,
antivirus). Hicbir ayna degisikligi bunu asamaz, cunku sorun disarida degil
tarayicida.

Cozum: sayfa kendi sunucusuna istek atar, dis baglantiyi sunucu kurar.
`osmveri.php` klasorde duruyor; XAMPP calisiyorsa hicbir sey yapmana gerek yok,
sayfa varligini kendi yoklar (`osmveri.php?ping=1`) ve varsa hep once onu
kullanir. Olculdu: vekil uzerinden 1.33 MB / 1.75 sn.

### 2b. Yumusak gecis (seamless)
Yeni karo indiginde, detay seviyesi degistiginde veya yukseklik verisi
geldiginde goruntu eskiden **bir anda** degisiyordu. Simdi eski goruntu
saklanip yenisi 260 ms boyunca uzerine erimeli biniyor.

Sart: eski goruntunun su anki ekrani **tam kapsamasi** (`tamponKapsiyor`).
Kapsamiyorsa gecis yapilmaz, yoksa kenarlarda karanlik bant olusur.
Pratikte: yeni karo geldiginde, zoom bittiginde (bulanik buyutulmus
goruntuden net goruntuye) ve kucuk kaydirmalarda yumusak; marji asan
kaydirmada ve donmede anlik. Iki goruntu de kendi kamera durumuyla
yapistirildigi icin gecis sirasinda kaydirsan bile ust uste binerler
(olculdu: 0.000000000 px sapma — yoksa hayal goruntu olurdu).

Maliyeti: ikinci bir tampon tuval, tembel olusuyor (ilk gecise kadar
ayrilmiyor).

### 5b. Zoom yaparken ekran neden bosalmiyor
Yakinlasinca detay seviyesi degisir ve yeni karolar inene kadar o seviyede
hicbir veri yoktur. Cizim bu yuzden **her seviyeden** karo alir: yeni karolar
gelene kadar eldeki kaba veri gorunmeye devam eder, ince veri gelince
uzerine biner (ayni yol iki seviyede varsa id'ye gore tekillenir).
Akis bitince kaba karolar cizimden dusurulur — ayni yolu iki kere elemek
bosa is olur.

### 6. Grafik
Cizimden bagimsiz olarak `dugum` (kavsak) + `kenar` (yol parcasi, uzunluk, sure)
agi kurulur. Gezinirken degil, **gerektiginde** kurulur (marker konarken /
rota istenirken) — kaydirirken her yeni karoda bastan kurmak bosa is olurdu.
Elde ne kadar karo varsa hepsi kullanilir.

---

## Kontroller

Surukle: kaydir · Shift+surukle veya Q/E: dondur · R: sifirla · Tekerlek: zoom
· "Sube koy" / "Musteri ekle" modunda haritaya tikla · "Rotayi ciz"

---

## Olculen degerler

Beylikduzu + Buyukcekmece, bolge seviyesi (19 km gorus, 16 karo, 5324 yol,
1369 durak):

| | |
|---|---|
| Kaydirma (marj icinde) | **cizim yok** — sadece goruntu kaydirilir |
| Marj tukenince cizim | 30 ms, ardisik kaydirmada 11 ms |
| Dondurme sonrasi | 30 ms |
| Zoom 2.5 kata kadar | cizim yok, goruntu olceklenir |
| Bellek | ~1.4–2 MB harita verisi + ~21 MB tampon goruntu |
| Grafik | 5960 dugum / 7786 kenar, kurulum 9 ms |
| A* rota | **1.9 ms/rota** |

Cizim maliyeti optimize edildi (42 ms → 21 ms):
- yukseklik ornekleme: metin anahtar yerine sayisal anahtar (2 kat)
- yukseklik izgarasi onbellege alindi, %25 genis uretilip tekrar kullaniliyor
- hucre boyu 15 → 21 piksel
- arazi hucrelerinde dolgu+cizgi yerine sadece dolgu; dikisleri kapatmak icin
  hucre merkezine gore %6 buyutuluyor (cizim islemi dolgudan pahali)
- yol noktalari her gecisde degil, bir kere yansitiliyor
- once KARO kutusu eleniyor, sonra sekiller (yakin zoomda 16 karodan 3'u kaliyor)
- A*'ta duz tarama yerine ikili yigin

Ayrica giderilen iki yavaslik:
- **Her arazi karosu inince butun harita karolarinin yukseklik damgasi
  bastan hesaplaniyordu** — 25 karo x ~90 ms = ~2 sn bosa is. Artik damgalama
  karo akisi bitince (veya 1.5 sn'de bir) ve sadece GORUNEN karolar icin.
- **Her karo inince tam yeniden cizim** yapiliyordu. Kamera oynamadiysa cizim
  saniyede 4'e sinirlandi.

---

## Bilinen davranislar (hata degil)

**Cok uzaklasinca yukleme durur.** 30'dan fazla karo gorunuyorsa istek
gonderilmez (panelde "Cok uzaktasin" yazar). En uzak zoom bu yuzden ~38 km
gorusle sinirli.

**Tek yonlu sokaklar yuzunden bazi rotalar bulunamaz.** Karo kenarindan kesilen
tek yonlu sokaklar "girilir ama cikilmaz" hale geliyor. Panelde
"Tek yon kurallarini uygula" kutucugu var; kapatinca cozulur.

**Bina sadece mahalle seviyesinde.** Kasitli — genis alanin butun binalarini
cekmek ~100 MB olurdu.

**Yukseklik verisi 14-29 m cozunurlukte** — arazinin genel sekli, tek tek
binalarin oturdugu kot degil.

**Yukseklik verisi olmayan bolge "deniz" degildir.** Ornekleme veri yoksa NaN
doner, 0 degil. 0 donuyordu ve 0 metre deniz seviyesi oldugu icin henuz inmemis
bolgeler koyu mavi/siyah kareler halinde goruniyordu. Ayrica aktif zoomda karo
yoksa daha kaba zoomdaki karolara bakilir — yakinlasirken arazi kaybolmaz,
sadece cozunurlugu dusuk kalir, sonra netlesir.

**Cok uzaga gidilirse projeksiyon merkezi tasinir.** 25 km'yi asinca otomatik.
lat/lon sakli oldugu icin eldeki karolar bedavaya yeniden yansitilir.

---

## Sonraki adimlar

1. **Kurye avatari** — rota uzerinde ilerleyen, yonune donen arac.
   `render.js`'te `rotaCiz` ve `isaretciCiz` hazir.
2. **Algoritma** — `graph.js`'teki `rotaBul` (A*) calisiyor. Uzerine gelecek:
   bir kuryenin 3-4 siparisi hangi sirayla dagitacagi (rota birlestirme).
3. **CarThing/CarDisplay-OS** — ESP32 320x240 mini-map. `graph.js`'in urettigi
   dugum/kenar listesi basitlestirilip ikili dosya olarak SD karta yazilmali.
   `proj.js`'teki izometrik formul C'ye birebir cevrilebilir (tamsayi
   aritmetigine dusurulmesi yeterli). Tampon goruntu mantigi de aynen gecerli.

---

Harita verisi © OpenStreetMap katkicilari, ODbL.
Yukseklik: AWS Terrain Tiles (SRTM / ASTER / NED).

---

## Adres cozumleme (geocoding)

"Beylikduzu Cumhuriyet Mahallesi" -> `41.0098, 28.6412`

Duraklar artik haritaya tiklayarak degil, panele **koordinat ya da adres
yazarak** konuyor. Kutu ikisini de kabul ediyor: `41.0011, 28.6417` gibi bir
sey yazilirsa dogrudan kullanilir, degilse adres sayilip cozulur.

Haritada bir noktaya tiklayarak da koordinat alinabiliyor: kutunun yanindaki
**Haritadan** dugmesi acilir, tiklanan noktanin koordinati kutuya yazilir ve
ters cozumleme ile "burasi neresi" durum satirinda gorunur. Ayni dugmeye tekrar
basmak modu kapatir. Durak KOYMAZ — koyma yine "Sube yap" / "Musteri ekle" ile.

### Parcalar

| dosya | isi |
|---|---|
| `adresveri.php` | dis servisle konusur: kimlik, hiz siniri, onbellek |
| `js/adres.js` | sayfaya tek arayuz sunar: `ara`, `oneri`, `ters`, `koordinatCozumle` |

### Neden vekil uzerinden? (Google kullanmadan, ucretsiz)

Ucu de tarayicidan cozulemeyen sebep:

1. **Kimlik.** Nominatim'in kullanim sartlari gercek bir `User-Agent` istiyor.
   Tarayici bu basligi JavaScript'ten set ETTIRMIYOR — yasakli baslik.
2. **Hiz siniri.** Saniyede 1 istek. Tarayicida her sekme kendi basina sayar,
   ortak sayac tutulamaz. `adresveri.php` tek bir kilit dosyasiyla butun
   istekleri siraya diziyor (`hizSinirla`).
3. **Onbellek.** Adresler yerinden oynamiyor, ayni sorgu iki kere sorulmamali.
   Sunucu tarafinda 30 gun saklaniyor; tarayici onbellegi sekme kapaninca
   gidiyordu.

Ayrica `osmveri.php`'nin var olma sebebi burada da gecerli: izleme korumasi ve
reklam engelleyiciler dis isteklerini kesebiliyor, ayni kaynaktan gelen bir PHP
dosyasi kesilmiyor.

### Servisler

**Photon** (`photon.komoot.io`) — yazarken oneri. Elasticsearch uzerine kurulu,
yarim kelimeyle calisiyor (`beylikd` -> Beylikduzu). Harita merkezi odak olarak
veriliyor, yoksa "Merkez Mahallesi" her ilcede var.

**Nominatim** (`nominatim.openstreetmap.org`) — kesin sonuc. Yavas ve sinirli,
o yuzden sadece Enter'a basildiginda ya da oneri secildiginde cagriliyor.

Ikisi de ayni OpenStreetMap verisini kullaniyor, ikisi de ucretsiz, ikisi de
anahtar istemiyor. Nominatim bos donerse Photon'a dusuluyor.

### Olculdu (8 Eylul 2026, bu agdan)

| sorgu | sonuc |
|---|---|
| `Beylikduzu Cumhuriyet Mahallesi` | ✔ 41.0098, 28.6412 |
| `beylikd` (oneri) | ✔ 4 sonuc, ilki Beylikduzu merkez |
| ters: `41.0011, 28.6417` | ✔ Buyuksehir Mahallesi, Beylikduzu |
| ayni sorgu ikinci kez | ✔ `X-Onbellek: hit` |
| `... Sakarya Caddesi 12 ...` | ✘ bos |

**Kapi numarasi cozulmuyor.** Turkiye'de OSM'e bina numaralari buyuk olcude
girilmemis; mahalle ve cadde seviyesi saglam, kapi seviyesi degil. Bu veri
eksikligi, kod hatasi degil — sorgu bos donuyor, hata donmuyor.

Kapi numarasi sart olursa secenekler: Turkiye'nin resmi adres sistemi (NVI/AKS,
kurumsal erisim gerekiyor) ya da ucretsiz katmani olan ticari bir servis
(Yandex, HERE, TomTom). Google zorunlu degil.

### Yuk artarsa: kendi sunucunda calistir

Nominatim de Photon da acik kaynak ve Docker imajlari hazir. Turkiye ozeti
Geofabrik'ten ~700 MB (butun dunya 80 GB degil). O zaman hiz siniri yok, gunluk
kota yok, ucuncu tarafa bagimlilik yok, veri de elinde. Bu dosyalarda
degistirilmesi gereken tek sey `adresveri.php` icindeki servis adresleri.

---

## Teslimat sirasi ve seferler

Etiketlerdeki **1 2 3** ekleme sirasi degil, kuryenin gercekten ugrayacagi sira.

### Sira gercek yol maliyetine gore

Eskiden sira kus ucusu mesafeye gore seciliyordu. Buyukcekmece'de bu yaniltiyor:
golun iki yakasi kus ucusu 200 m, yoldan 3.4 km. Algoritma karsi yakayi "en
yakin" sanip kuryeyi golun etrafinda gidip gelmeye sokuyordu.

Artik butun duraklar arasi **gercek yol maliyeti** cikariliyor
(`Grafik.maliyetler`, durak basina tek Dijkstra — n^2 A* degil). Sira, kapasite
bolunmesi, her sey bu matris uzerinden.

### Seferler dogrudan kuruluyor (Clarke-Wright)

Eskiden tek buyuk tur kurulup kapasite kadar parcaya **kesiliyordu**. Bu sessizce
yanlisti: tur kapali bir halka oldugu icin ters yonde dolasmak ayni maliyeti
verir ama kesim noktalari degisir, yani gruplar degisir. Olculdu: ayni maliyetli
iki turdan biri 9200 m, otekisi 11200 m sefer uretti — %20 fark, tamamen turun
hangi yone dolandigina bagli.

Yerine Clarke-Wright tasarruf yontemi kondu. Herkes kendi seferinde baslar
(`sube -> i -> sube`), sonra birlestirmenin en cok kazandirdigi ciftler sirayla
birlestirilir:

```
kazanc(i,j) = d(i,sube) + d(sube,j) - d(i,j)
```

Sonra seferler arasi bir pas: **tasima** (bir musteriyi baska sefere al) ve
**takas** (iki musteriyi degistir). Takas ayri lazim, iki sefer de doluysa
tasima yapilamiyor.

### Olculdu

`scratchpad/test_sira.js` — ortasindan su gecen 21x21 izgara, tek koprusu var.

- Sira kaba kuvvetle (butun permutasyonlar) birebir ayni cikiyor.
- 200 rastgele dizilim, 6 musteri, kapasite 3:
  **eski 12373 m -> yeni 11202 m, ortalama %9.5 kisa.**
  119 dizilimde yeni daha iyi, 78'inde esit, 3'unde eski daha iyi.

Son uc onemli: bunlar sezgisel yontemler, en iyiyi garanti etmiyorlar. Kucuk
musteri sayilarinda pratikte en iyiye cok yakin duruyorlar.

---

## Testler

**`test_sira.js`** — teslimat sirasi, tarayicisiz. Yapay bir sehir kurup
(ortasindan su gecen izgara) sirayi kaba kuvvetle karsilastiriyor ve eski
yontemle olcusuyor. `node test_sira.js`

**`test_e2e.js`** — gercek tarayicida, gercek Apache uzerinden, gercek OSM
verisiyle. Edge'i headless acip CDP ile suruyor; ek paket gerekmiyor (Node 24'te
`WebSocket` global). `node test_e2e.js`

Kapsadigi: sayfa aciliyor mu, abartma varsayilani, koordinatla durak koyma,
gecersiz giris (virgullu ondalik), rota ve teslimat sirasi, panel listesinin
sirasi, kurye ilerlemesi, haritadan koordinat secme.

Baska tarayici icin: `set TARAYICI=C:/.../chrome.exe && node test_e2e.js`

**Kuryenin ilerlemesi neden elle sinaniyor?** Kurye `requestAnimationFrame`
ile ilerliyor, headless tarayici ise rAF'i boguyor — ayni test bir kosumda
"DONUYOR", otekinde "DURMUS" veriyor. Bu tarayici davranisi, uygulama hatasi
degil. O yuzden test `kuryeIlerlet(1000)` ile bir saniyelik adimi elle atip
mantigi sinar; rAF'in durumu bilgi olarak yazilir.

Olculdu (8 Eylul 2026, Beylikduzu, 4 musteri, kapasite 3):
`4 teslimat · 2 sefer · 8948 m · 52403 dugumluk grafikte 67 ms (matris 58 ms)`

---

## Touge bul

Yuklu bolgede **surulecek yol** ariyor ve yesil vurguluyor. Panelin en altinda.

Dag gecidi sart degil — kullanicinin verdigi yon: *"dag gecidi degil, direk
sehrin icinde kivrimli yolda olur, veya iste sahil yolu gibi de"*. Rakim bu
yuzden bonus, sart degil.

**Iki tur:**
- **Virajli** — cok donen yol. Sehir ici de olabilir.
- **Uzun duz** — onunu gorebildigin, basilacak yol. Sahil yolu tam buraya duser.

**Ortak sart NIS olmak:** dusuk trafik sinifi, az kavsak, kenarinda ev
olmamasi. Ana arter ne kadar guzel olursa olsun touge degil.

### Nasil calisiyor

1. **Zincirleme.** OSM'de tek yol onlarca parcaya bolunmus olabilir (kopru,
   isim degisimi, karo kenari). Parca parca bakmak yaniltir: 400 m'lik parca
   "dumduz" gorunur ama bagli oldugu yol kivrimlidir. Uc uca gelen ve ayni yola
   ait parcalar once tek zincir yapiliyor. Kavsakta birden cok devam varsa
   birlestirilmiyor — hangi kola gidecegi belirsiz.

2. **Yeniden ornekleme.** Donus acisi ham OSM noktalarindan olculemez: bazi
   yollarda nokta her 3 m'de, bazisinda her 80 m'de. Sik noktali yolda olcum
   gurultusu sahte viraj uretiyor. Once 25 m'de bir yeniden ornekleniyor.

3. **Olcumler:** km basina donus (derece), kus ucusuna oran, rakim araligi,
   km basina kavsak, km basina bina, suya yakinlik orani.

4. **Puanlama.** Agirlikli ortalama, carpim degil: carpimda tek sifir her seyi
   siler, oysa rakimsiz ama cok kivrimli issiz bir yol da iyi yoldur.

### Elemeler

- **Halka ve cikmaz:** kus ucusuna oran 3.2'yi asarsa ya da bastan sona 300 m
  bile ilerlemiyorsa atiliyor. Sebep olculdu: Buyukcekmece'de `kivrim 28.47`
  cikan bir "yol" 800 m gidip 28 m otede bitiyordu — site ici halkasi.
- **Yaya yolu, merdiven, service** (otopark ici) hic bakilmiyor.
- **Otoyol ve trunk** trafik carpaniyla eleniyor.

### Bir hata: kavsak sayaci hep 0

Ilk surumde kavsak testi `Grafik.dugumler`'e bakiyordu. Grafik ancak bir rota
cizilince kuruluyor, dolayisiyla touge taramasinda hep bos ve **her yolda
"0 kavsak/km"** cikiyordu. Test bunu yakaladi. Kavsak zaten yol verisinden
cikarilabilir: bir dugum birden fazla yolda geciyorsa orasi kavsaktir. Artik
oyle sayiliyor, grafige bagimli degil.

### Olculdu (8 Eylul 2026, gercek OSM verisi)

Beylikduzu, 3071 yol parcasi -> 2191 zincir, 94 ms:

| tur | ornek | donus/km | kivrim |
|---|---|---|---|
| virajli | isimsiz residential, 0.9 km | 659 | 2.59 |
| duz | Yesilyurt Caddesi, 1.53 km | 19 | 1.00 |

Referans degerler: duz sahil yolu 17-73 °/km, mahalle arasi 250-330,
gercekten kivrimli 500-840.

Sahil bonusu isini goruyor: Buyukcekmece'de `Yuzuncu Yil Bulvari` (su
orani 0.80) duz listesinde birinci sirada.

Test: `node test_touge.js` — iki ayri bolgede tarayip "virajli denilen
gercekten kivrimli mi, duz denilen gercekten duz mu" diye olcuyor.
