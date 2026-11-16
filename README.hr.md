# Authenticator Companion

Chrome ekstenzija za račune sinkronizirane u Google Authenticatoru. Eksperimentalna, neslužbena Google integracija. Ne zahtijeva poslužitelj, Node.js ili zasebnu Windows aplikaciju za korištenje.

## Instalacija

1. Raspakiraj paket na mjesto gdje ga želiš zadržati.
2. U Chromeu otvori `chrome://extensions` i uključi **Developer mode**.
3. Klikni **Load unpacked / Učitaj raspakirano** i odaberi mapu `extension` iz ovog paketa.
4. Otvori **Details → Extension options** ili ikonu ekstenzije pa **Postavi Authenticator**.
5. Odaberi zasebnu lozinku lokalne pohrane s najmanje 8 znakova. Ovo nije Googleova lozinka.
6. Upiši adresu Google računa s Authenticator zapisima i klikni **Prijavi se Googleom**. Dovrši prijavu i Googleove korake u otvorenoj Googleovoj kartici. Nakon uspješnog dohvata ekstenzija otvara svoje postavke i zatvara svoju Googleovu prijavnu karticu. Ako Google ostane na poruci Loading, u postavkama klikni **Prijava je dovršena — provjeri**.
7. Uključi **Automatsku ponudu** ako želiš da Chrome ponudi račun uz 2FA polje na povezanim HTTPS stranicama. Na već otvorenim stranicama osvježi karticu. Ekstenziju možeš prikvačiti u Chromeovu alatnu traku.

## Korištenje

- Uz prepoznato polje za 2FA pojavljuju se računi povezani s točnom domenom. Klik odabranog računa upisuje kod. Ekstenzija ne šalje obrazac za prijavu.
- Podržano je i šest odvojenih polja za znamenke. Neki obrasci, ugrađeni iframeovi i nestandardni prikazi zahtijevaju kopiranje koda iz ekstenzije.
- Za neprepoznatu domenu otvori ekstenziju na toj stranici i uz odabrani račun klikni **Poveži sa stranicom**. Chromeu možeš dopustiti pristup samo toj stranici.
- Povezivanje se dovršava u pozadini i kada Chrome zatvori prozorčić tijekom dopuštanja pristupa stranici. Uz naziv računa prikazuje se favicon povezane stranice.
- Postoji početni popis točnih domena za uobičajene servise. Naziv servisa nije dovoljan za sigurno prepoznavanje svakog mogućeg URL-a, pa je za ostale domene potrebno jednokratno povezivanje.
- Novi računi dodani u Google Authenticator pojavljuju se nakon sinkronizacije. Dok je pohrana otključana, provjera se radi približno svakih pet minuta; dostupan je i gumb **Osvježi s Googlea**.
- Kodovi se generiraju lokalno i iz predmemorije rade bez interneta. Za dohvat novih računa potreban je internet.
- Dok je lokalna pohrana otključana i sučelje ekstenzije vidljivo, kodovi su odmah prikazani uz odbrojavanje i automatski se osvježavaju. Samo prikazivanje kodova ne produžuje vrijeme otključanosti.
- Nakon ponovnog pokretanja Chromea ili 30 minuta bez korištenja ekstenzije upiši lozinku lokalne pohrane. Googleovu prijavu ponavljaš kada Google opozove pristup.

## Pohrana i pristup

Na disk se sprema šifrirana lokalna pohrana: AES-256-GCM s ključem izvedenim iz tvoje lozinke pomoću PBKDF2-SHA-256 i 600.000 iteracija. Otključani podaci čuvaju se u Chromeovoj memorijskoj pohrani dostupnoj samo pouzdanim kontekstima ove ekstenzije. Sadržaj web stranice ne dobiva 2FA ključeve ili Googleove tokene, nego samo trenutačni kod nakon tvog klika i provjere domene.

Sinkronizacija koristi Googleove servise `accounts.google.com`, `android.clients.google.com` i `passbox-pa.googleapis.com`. Za favicon se učitava ikona povezane web stranice. Nema dodatnog poslužitelja ili analitike. Chromeova sinkronizacija pohrane se ne koristi.

Zahtjevi ove ekstenzije prema Googleovu servisu dobivaju nužna protokolarna zaglavlja putem Chromeova API-ja declarativeNetRequest. Pravila su ograničena na zahtjeve ove ekstenzije prema točno određenim Googleovim adresama.

Brisanjem ekstenzije brišeš njezinu lokalnu pohranu; računi u Google Authenticatoru ostaju na Googleu. Ako zaboraviš lokalnu lozinku, ne postoji oporavak te lokalne pohrane. Možeš ponovno instalirati ekstenziju i prijaviti se Googleom za novi dohvat računa.

## Granice eksperimentalne verzije

Potvrđeni format s Googleova računa: vremenski TOTP kodovi sa šest znamenki. Podržani algoritmi generiranja su SHA-1, SHA-256 i SHA-512. Neprovjereni formati označavaju se kao nepodržani; HOTP brojači, push potvrde i passkey prijave nisu dio ove ekstenzije.

Google ne pruža javno podržan API za ovu sinkronizaciju. Prijava koristi interni Androidov postupak i servis Passbox te može prestati raditi bez najave. Ekstenzija nije objavljena u Chrome Web Storeu i ne ažurira se automatski. Instaliraj ažuriranje zamjenom datoteka u istoj mapi i klikom **Reload** u `chrome://extensions`.

## Razvoj i provjere

Za automatske provjere dovoljan je Node.js 22 ili noviji; nisu potrebni npm paketi:

```sh
npm test
```

Provjere pokrivaju RFC 6238 vektore, šifriranje i odbijanje pogrešne lozinke, čitanje protokola, zaštitu od sličnih domena te odvajanje poruka web stranice od povlaštenih poruka sučelja ekstenzije.

Izvori protokola: [Passbox bilješke](https://github.com/poloputoamo/google-passbox), [gpsoauth](https://github.com/simon-weber/gpsoauth). U živoj provjeri ispravljena je putanja popisa koja završava s `/externalservices/-`, dodana su aktualna polja za prijavu te je potvrđeno da oznaka broja znamenki `2` u dohvaćenom Passbox formatu znači šest znamenki.
