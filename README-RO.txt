PAYMENT REMINDER — v3

NOU ÎN v3
- Web Push real pentru notificări chiar dacă aplicația este închisă.
- Integrare Supabase din Setări -> Push Cloud.
- Sesiune anonimă: nu ai nevoie de login/email pentru aplicație.
- Reminder-ele active sunt sincronizate în Supabase pentru ca serverul să știe când să trimită push-ul.
- Test push prin server.
- Pe iPhone funcționează ca Home Screen web app, după permisiunea de notificări.

APLICAȚIA RĂMÂNE FUNCȚIONALĂ ȘI FĂRĂ SUPABASE
Dacă Push Cloud nu este configurat, Payment Reminder păstrează datele local și poate afișa notificări cât timp aplicația rulează. Pentru aplicația complet închisă trebuie făcut setup-ul din supabase/SETUP-PUSH-RO.txt.

GITHUB PAGES
1. Urcă TOT conținutul ZIP-ului în repository.
2. Settings -> Pages -> Deploy from branch -> main / root.
3. Pe iPhone: deschide pagina -> Share -> Add to Home Screen.
4. Deschide aplicația de pe Home Screen.

PENTRU PUSH ÎN FUNDAL
Urmează: supabase/SETUP-PUSH-RO.txt

ÎMBUNĂTĂȚIRI iPhone (Plus)
- Zoom-ul pinch este dezactivat în aplicație (viewport).
- Căutare rapidă după prieten, abonament sau notiță.
- Filtru „Doar restante” în lista de plăți.
- Câmpurile au font de 16px pentru a evita zoom-ul automat la focus pe iPhone.

PAYMENT REMINDER PRO – funcții adăugate
- Calendar lunar cu zilele în care există scadențe.
- Sumar lunar: număr scadențe, total și încasări din istoric.
- Raport imprimabil / salvabil PDF din dialogul de print iOS.
- Mesaj WhatsApp precompletat per plată.
- Temă luminoasă / întunecată.
- PIN local (protecție simplă pe dispozitiv; nu este Face ID).
- Face ID și widget iOS nativ necesită o aplicație nativă iOS, nu sunt disponibile direct într-un PWA.

\nAUTENTIFICARE GOOGLE ȘI SINCRONIZARE (VERSIUNE MODERN)\n
1. În Supabase → SQL Editor, rulează fișierul setup-auth-sync.sql inclus în arhivă.
2. În Supabase → Authentication → Providers → Anonymous, activează Anonymous Sign-Ins pentru butonul „Continuă fără cont”.
3. În Supabase → Authentication → URL Configuration, Site URL și Redirect URL trebuie să includă:
   https://alexandrujoanta2005-ctrl.github.io/Payment-Reminder/
4. În Google Cloud OAuth Web Client:
   Authorized JavaScript origins: https://alexandrujoanta2005-ctrl.github.io
   Authorized redirect URI: https://mmgclcdmywnumvdmvlhi.supabase.co/auth/v1/callback
5. În Supabase → Authentication → Providers → Google, activează Google și introdu Client ID și Client Secret.
6. Încarcă fișierele din arhivă în repository-ul GitHub Pages.

Sincronizarea completă a datelor aplicației folosește tabelul user_app_data și RLS, astfel fiecare cont poate citi și modifica doar propriul rând. Datele utilizatorilor fără cont rămân locale; Supabase creează o sesiune anonimă pentru fluxul de acces, dar nu sincronizează datele anonime între dispozitive.


DEBLOCARE BIOMETRICĂ (Face ID / amprentă / autentificarea dispozitivului)
- Deschide aplicația prin HTTPS, pe un dispozitiv și browser compatibil.
- Intră în Setări > Deblocare biometrică > Activează și confirmă în fereastra sistemului.
- La următoarea blocare, butonul „Deblocare biometrică” apare pe ecranul PIN.
- Sistemul decide metoda disponibilă: Face ID, amprentă sau PIN/parola dispozitivului. Aplicația nu poate forța Face ID pe toate dispozitivele.
- PIN-ul aplicației rămâne alternativă.
- Implementarea folosește WebAuthn local pentru confortul deblocării. Verificarea criptografică a autentificării pe server nu este configurată în acest pachet; nu considera această opțiune un substitut pentru autentificarea server-side.
