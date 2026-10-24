# BuildMates

**Find the teammate your idea is missing.**
MCA mini project · React (Vite) + Firebase · mobile-first PWA

---

## Phase 1 mein kya bana hai ✅

| Feature | Status |
|---|---|
| Logo, app icons, installable PWA (phone par "Add to Home screen") | ✅ |
| Login: Google + email link (bina password) + DPDP consent | ✅ |
| Onboarding: naam, DOB (age check), college, area, role, skills, interests, vision | ✅ |
| Under-18 Safe Mode + parent approval (admin record karta hai) | ✅ |
| Working-style quiz (TIPI, Big Five) + Team Type | ✅ |
| Hybrid matching (vision + skill fit + working style + distance) with "See why" | ✅ (vision abhi keyword based, Phase 2 mein AI) |
| Profile: edit, retake quiz, visibility, sign out, delete account | ✅ |
| Admin panel: stats, students list, Verify badge, parent approvals, admin log | ✅ |
| Firestore security rules (minor/adult isolation, khud ko verify nahi kar sakte) | ✅ |
| Dark mode, offline cache, security headers | ✅ |

## Phase 2 ✅ (Connect + Chat + Safety)

| Feature | Status |
|---|---|
| Connect request → accept / not now (sender is never told about "not now") | ✅ |
| Realtime 1-to-1 chat (opens only when both say yes) | ✅ |
| AI Chat Guard (Hinglish + English): blocks phone/social IDs, money requests, abuse; warns on flirting and links | ✅ |
| Server-side backup: database rejects phone numbers in the first 7 days even if someone bypasses the app | ✅ |
| 3 blocked messages → automatic report to admins | ✅ |
| Report (with last 5 messages attached) + Block / Unblock | ✅ |
| Admin: reports queue with Dismiss / Warn / Suspend / Ban / Restore, AI Guard stats, activity log | ✅ |
| Suspended / banned users can't send messages or requests (enforced by rules) | ✅ |

## Phase 3 ✅ (Python AI backend) – folder `ai-api/`

| Feature | Status |
|---|---|
| FastAPI server with Firebase token check, CORS, per-user rate limit | ✅ |
| AI matching: multilingual sentence embeddings (meaning, not keywords) stored on each profile | ✅ |
| Trained Hinglish Chat Guard (char n-gram + Logistic Regression), metrics in `ai-api/models/metrics.json` | ✅ |
| App uses rules instantly, then the trained model; falls back to rules if the server is asleep | ✅ |
| Idea check endpoint (banned ideas, secret-solution warning) – used by the Idea Board next | ✅ |
| Admin overview shows AI server status | ✅ |

Setup: see `ai-api/README.md`. Then add `VITE_AI_API_URL=http://localhost:8000` to `.env`.

## Phase 4 ✅ (Idea Board)

| Feature | Status |
|---|---|
| Post an idea: name, one-line pitch, areas, summary, full plan | ✅ |
| 3 levels enforced by security rules: pitch → everyone · summary → connected people · plan → team you choose | ✅ |
| AI idea check before posting (banned ideas go to admin review, "don't reveal your solution" warning) | ✅ |
| Server timestamp + SHA-256 fingerprint of the idea (proof of what you wrote and when; can't be edited) | ✅ |
| "I'm interested" + interested list for the owner with Connect | ✅ |
| "Who read your summary" log | ✅ |
| Report idea · Admin: approve / reject / take down | ✅ |

## Phase 6 ✅ (Pilot evaluation for the report)

| Feature | Status |
|---|---|
| On every match: "Would you work with them?" 1–5 stars (saved with the match score) | ✅ |
| Profile → Give feedback: 4-question survey (easy, useful, safe, recommend) + comment | ✅ |
| Admin → Research: Pearson r between match score and rating, ratings by score range, AI vs keyword matching, survey averages | ✅ |
| CSV export of ratings and feedback (no names or ids) for charts in the report | ✅ |

## Phase 7 ✅ (Teams + Safe Meet)

| Feature | Status |
|---|---|
| Start a team from your connections (up to 6), optionally linked to your idea | ✅ |
| Trial task first (e.g. "talk to 10 students"), then "make the team official" | ✅ |
| Task board: To do / Doing / Done, assign to a member, contribution record per member | ✅ |
| Team chat with AI Guard (contact sharing allowed only after the team is official) | ✅ |
| Team agreement: roles, time, decisions, credit, money; every member taps "I agree"; any edit asks everyone again | ✅ |
| Leave respectfully with a reason (owner role passes to the next member) | ✅ |
| Safe Meet (18+ only, enforced by rules): public places only, accept/decline, "I'm here and safe" check-in, share details with a trusted person, "I felt unsafe" → report | ✅ |

## Phase 8 ✅ (Beginner-friendly extras)

| Feature | Status |
|---|---|
| Badges on Profile (10), earned from real activity so they can't be faked | ✅ |
| Weekly mini-challenges (Teams page) → add to a team's board in one tap | ✅ |
| Idea Dost: 5-question coach with honest feedback → writes the pitch + summary → pre-fills "Post an idea" | ✅ |
| Area map in Matches (Leaflet + OpenStreetMap): students per area, top interests, never exact locations | ✅ |

## Phase 9 ✅ (Launchpad + Professionals)

| Feature | Status |
|---|---|
| Launchpad: list a built product (live link, stage, users, what you need) | ✅ |
| Link check on the AI server (only public https; blocks private-network tricks) → "Live link" badge | ✅ |
| Growth plan for the first 100 users, tailored to stage and area | ✅ |
| "Students who can help": matched by the skills your needs require | ✅ |
| "I can help", tester feedback (stars + comments) | ✅ |
| Professionals: apply (company, role, LinkedIn, work email) → admin verifies | ✅ |
| Pros request access to an idea's summary → owner allows → pro accepts NDA → summary shown with their name watermarked; every view logged | ✅ |
| Offers (mentor / co-build / non-binding buy) with a 3-day cooling-off reminder and a rough value guide that flags very low offers | ✅ |

**Not built (needs paid services or legal set-up):** real payments/escrow, video calls, automatic SMS alerts for Safe Meet, blockchain anchoring. These go in "Future scope" in the report.

**Baaki:** live deploy → college pilot → report + PPT.

## 7 languages + real location APIs ✅
**Languages:** 🌐 dropdown (Landing, Onboarding, Profile): **English, हिन्दी, ಕನ್ನಡ, മലയാളം, தமிழ், తెలుగు, मराठी**
- All 7 are written into the app (`src/i18n/strings.js`, `ml.js`, `ta.js`, `te.js`, `mr.js`), so switching is **instant** and works offline. No server or model needed
- Names in the dropdown come from the browser (`Intl.DisplayNames`)
- Malayalam, Tamil, Telugu and Marathi: get one native-speaker friend to check each once
- (Optional, not needed now: `ai-api/i18n_api.py` + `prepare_languages.py` can machine-translate more languages later with NLLB-200)

**Location:** Onboarding → "Where do you study and stay?" — nothing hard-coded
- **Pincode** → India Post API (`api.postalpincode.in`) → state, district, list of areas
- **Search area** → OpenStreetMap (Photon) · **Use my location** → area name (point rounded to ~1 km *before* it leaves the phone)
- **College** → OpenStreetMap search of colleges/universities/schools near you (or type any name)
- Matching uses **real km** between areas (`About 2 km away`), "Within 5 km" filter, map centres on your area
- Server proxy: `ai-api/geo.py` (`/geo/pincode`, `/geo/search`, `/geo/colleges`, `/geo/reverse`); app calls APIs directly if server is off

**Setup**
1. AI server restart (location search ke liye `geo.py` naya hai)
2. Firestore Rules → nayi `firestore.rules` **Publish** (profile location fields)
3. `npm run dev` restart
4. Purane profiles: Profile → Edit profile → pincode daal ke save (taaki km wala distance chale)

## Light / Dark mode ✅
- Upar ☀️/🌙 button (phone pe bell ke paas, laptop pe left menu ke neeche, Landing page pe bhi) → ek tap me light ↔ dark
- Profile → **Appearance**: **Auto** (phone/laptop ki setting follow kare) · **Light** · **Dark**
- Choice isi device pe yaad rehti hai; page khulte hi lag jati hai (white flash nahi)

## Phase 14 ✅ (Resume builder)
Profile → **Build my resume** (`/resume`)
- BuildMates ke asli kaam se apne aap bharta hai: profile skills, **published projects** (proof link `/p/...` ke saath), official teams, learning circles, Verified badge
- "Write it for me" → profile se headline + summary
- Khud jodo: contact, education, experience, other projects, achievements, languages
- 2 templates: **Classic (ATS)** aur **Modern** · **Download PDF** (A4) · **Copy as text** (job portals ke liye)
- Private: `resumes/{uid}` sirf owner padh/likh sakta hai. Contact details profile pe kabhi nahi dikhte
- Setup: nayi `firestore.rules` **Publish** karo

## Phase 13 ✅ (AI Team Builder + Growth analytics + Mentor office hours + Weekly email)
| Feature | Kahan | Kya karta hai |
|---|---|---|
| 🤖 AI Team Builder | Team → **Roles** tab → "Suggest people" | Team ki missing skills (ya open roles) dekh ke top 5 students suggest karta hai. Score = 40% missing skills + 25% vision (AI embeddings, team ka average) + 20% working-style balance (Big Five) + 15% distance. Har suggestion ke saath reasons + "How we scored" bars |
| 📈 Growth analytics | Admin → **Growth** | Funnel: Signed up → Vision → Quiz → Connected → Team → Official team → Project published. Weekly signups chart, totals, college-wise, **CSV** export (report ke Results chapter ke liye). Server sirf counts padhta hai, chats/messages kabhi nahi |
| 🎓 Mentor office hours | Ideas → **Mentor office hours** (18+ only) | Verified professional / admin group Q&A session rakhe (3–20 seats). Students book karein, pehle se question likhein. Call link sirf booked students ko, aur tabhi jab **kam se kam 2** book karein (kabhi 1:1 nahi) |
| ✉️ Weekly email | Profile → **Weekly email** (default OFF) · Admin → Growth → **Send now** | Har hafte: tumhari skills wale roles, events, circles, office hours, team update. Preview button, one-click unsubscribe, 6 din me ek hi baar |

### Phase 13 setup
1. Firestore → Rules → nayi `firestore.rules` paste → **Publish**
2. `ai-api\.env` me add karo: `APP_URL=http://localhost:5173` (live hone par Vercel wala link)
3. AI server restart: `.venv\Scripts\python -m uvicorn main:app --reload --port 8000`
4. Web app: `Ctrl+Shift+R`
5. (Baad me, deploy ke time) har Monday apne aap email: cron-job.org pe free job → `https://<server>/digest/cron?key=<DIGEST_CRON_KEY>`

### Phase 13 test checklist
- [ ] Team → Roles → Suggest people → 5 log + reasons dikhe → "How we scored"
- [ ] Admin → Growth → funnel + weekly chart + CSV download
- [ ] Admin account se Ideas → Mentor office hours → Host → doosre adult account se Book → 2 booking ke baad Call link dikhe
- [ ] Under-18 account pe Mentor office hours tile na dikhe
- [ ] Profile → Weekly email ON → Preview → Admin → Growth → Send now → inbox me email → Unsubscribe link → Profile me OFF

## Phase 12 ✅ (Open roles + Learning circles + Showcase + Check-ins)
Sab features **team, kaam aur seekhne** ke around hain. Dating jaisa kuch nahi: no swipe, no likes, no "kisne profile dekhi", no photo-first browsing, no 1:1 "milo" push.

| Feature | Kahan | Kya karta hai |
|---|---|---|
| 💼 Open roles | Team → **Roles** tab · Teams → **Open roles** | Team likhe "UI designer chahiye", students apply karein (note ke saath). Team **Invite** dabaye to student ko team invite jata hai, baat team chat me hoti hai |
| 📚 Learning circles | Ideas → **Learning circles** | 3–8 log ek skill seekhein: weekly plan, "I did this" progress bar, circle chat (AI Guard + phone number block). Safe Mode: sirf Online / At college |
| 🚀 Showcase + certificate | Team → **Showcase** tab · Ideas → **Showcase** | Official team apna project publish kare. Har member ko **certificate (PDF)** + **resume line**. Adults ka project page public link (`/p/...`) bhi; Safe Mode ka kabhi public nahi |
| 📊 Weekly check-ins | Team → **Check-ins** tab | Har hafte 2 minute: kya kiya, aage kya, kya atka, mood, hours. Team view + coach tips. Thu–Sun ko Notifications me yaad dilata hai |

### Phase 12 setup
1. Firestore → Rules → nayi `firestore.rules` paste → **Publish** (roles, circles, showcase, check-ins ke rules naye hain)
2. `npm run dev` restart + `Ctrl+Shift+R`. Server me kuch naya nahi.

### Phase 12 test checklist
- [ ] Team → Roles → Post a role → doosra account: Teams → Open roles → Apply → team me Invite → doosra account Teams me invite accept → team me aa gaya
- [ ] Ideas → Learning circles → Start one → doosra account Join → Weekly plan me week add → "I did this" → progress bar
- [ ] Circle chat me phone number bhejo → block hona chahiye
- [ ] Official team (trial complete) → Showcase → Publish → View page → Certificate → Download PDF
- [ ] Logout karke `/p/<teamId>` kholo → adult team ka page dikhe; under-18 team ka "not available"
- [ ] Team → Check-ins → save → coach tips + "x/y checked in"

## Phase 11 ✅ (ID verification + Parent email + Events + Phone notifications)
| Feature | Kya karta hai |
|---|---|
| 🪪 College ID verification | Profile → "Get the Verified badge" → ID card ki photo. Photo **private** rehti hai (Cloudinary "authenticated"), sirf admin server ke through dekh sakta hai, aur approve/reject hote hi **delete** ho jati hai. Admin → **ID checks** tab |
| 👪 Parent approval by email | Under-18 sign up kare to parent ko apne aap email jata hai. Parent link khol ke **Approve / Don't approve** dabaye → account khud khul jata hai. Email scanner galti se approve na kare isliye button + "I am the parent" checkbox. 2 min me 1, din me max 5 email |
| 🏆 Hackathons & events | Ideas → "Hackathons and events". Admin event daalta hai, adult student suggest karta hai (admin review). "I'm looking for a team" → same event ke log ek dusre ko dhundh ke Connect. Safe Mode wale sirf apni age group dekhte hain, 18+ events unhe nahi dikhte |
| 🔔 Phone notifications | Profile → Phone notifications ON. App band ho tab bhi naya message, request, team invite, Safe Meet ki notification. Message ka text notification me **kabhi nahi** dikhta. Server pehle check karta hai ki action sach me hua (spam nahi ho sakta) |

### Phase 11 setup (tumhe karna hai)
**A) Firebase admin key (sabse zaroori, baaki teeno isi pe chalte hain)**
1. Firebase Console → ⚙️ Project settings → **Service accounts** tab → **Generate new private key** → Generate key.
2. Ek `.json` file download hogi. Use rename karke **`serviceAccount.json`** karo aur **`ai-api` folder** ke andar rakho.
3. Ye file **kisi ko mat bhejna, GitHub pe mat daalna** (`.gitignore` me already hai).
4. `ai-api/.env` me add karo: `FIREBASE_SERVICE_ACCOUNT=serviceAccount.json`

**B) Parent email (Gmail se, free)**
1. Google Account → Security → **2-Step Verification** ON hona chahiye.
2. Google Account me search karo **"App passwords"** → naam `BuildMates` → Create → 16 letter ka password milega.
3. `ai-api/.env` me add karo:
   ```
   SMTP_USER=tumhara.email@gmail.com
   SMTP_PASS=wo 16 letter wala password
   ```

**C) ID photo (Cloudinary, wahi account jo photo ke liye banaya)**
1. Cloudinary Dashboard → **API Keys** (ya "Go to API Keys") → upar **API environment variable** dikhega: `cloudinary://123...:abc...@tumhara_cloud` → copy (`<your_api_secret>` ki jagah asli secret dikhane ke liye 👁️ dabao).
2. `ai-api/.env` me: `CLOUDINARY_URL=cloudinary://...` (poori line jaisi copy ki)

**D) Phone notifications key**
1. Firebase Console → ⚙️ Project settings → **Cloud Messaging** tab → neeche **Web configuration** → **Web Push certificates** → **Generate key pair** → jo lambi key dikhe copy.
2. Web app ki `.env` (buildmates folder wali, ai-api wali nahi) me: `VITE_FIREBASE_VAPID_KEY=wo key`

**E) Install + restart**
1. Terminal (ai-api folder, venv active): `pip install -r requirements.txt` (firebase-admin, cloudinary naye hain)
2. AI server band karke dobara: `uvicorn main:app --reload --port 8000`
3. Firestore → Rules → nayi `firestore.rules` paste → **Publish**
4. Web app: `npm run dev` restart. Notifications ke liye: `npm run build` + `npm run preview` (http://localhost:4173)
5. Admin → Overview → **Server features** me chaaron "Ready" dikhne chahiye.

### Phase 11 test checklist
- [ ] Admin → Overview → Server features: sab Ready
- [ ] Profile → Upload college ID → "Being checked" → Admin → ID checks → Check → photo dikhe → Approve → student pe Verified badge
- [ ] Reject karke dekho: student ko reason dikhe, dobara upload kar sake
- [ ] Naya under-18 account → Waiting page pe "Email sent to pa••@..." → parent ke email me link → Approve → app khud khul jaye
- [ ] Ideas → Hackathons and events → (admin) Add → event dikhe; dusre account se suggest → admin ko "Waiting for your review"
- [ ] Event → "I'm looking for a team" → dusre account pe uska naam + Connect
- [ ] `npm run preview` → Profile → Phone notifications ON (Allow dabao) → dusre browser/account se message bhejo, pehla tab minimize karo → notification aaye → click → chat khule

## Phase 10 ✅ (Notifications + Hindi/Kannada + Photo + Search + Offline app)
| Feature | Kya karta hai |
|---|---|
| 🔔 Notifications | Upar bell (phone) / left menu "Alerts" (laptop). Requests, team invites, Safe Meet, naye messages, aur tumhare idea/product pe interest, NDA request, offers, help – sab ek jagah. "Mark all as read" |
| 🌐 Hindi / ಕನ್ನಡ | Landing, Login, Onboarding, Quiz, Matches, Chats, Profile, menu – 3 bhashao mein. Profile → Language. Admin panel English hi rahega |
| 🖼️ Profile photo | Profile pe photo ke camera icon pe tap → photo choose → 512px square banke Cloudinary pe upload. **Under-18 (Safe Mode) ko photo nahi** – sirf initials (rules bhi enforce karte hain). Admin → Students se photo hata sakta hai |
| 🔍 Search | Matches mein naam, skill, interest, college ya vision ke words se search (Hindi skill naam se bhi, jaise "डिज़ाइन") |
| 📱 Offline app (PWA) | Live site pe "Install app" (Profile mein), phone home screen pe icon, kamzor/no internet mein bhi khulta hai, naya version aane pe "Update now" |

### Phase 10 setup (tumhe karna hai)
1. **Cloudinary (photo ke liye, free):** cloudinary.com pe sign up → Dashboard pe **Cloud name** copy karo → Settings (⚙️) → **Upload** → **Upload presets** → **Add upload preset** → *Signing mode* = **Unsigned**, *Folder* = `buildmates` → Save → preset ka **naam** copy karo.
2. Apni `.env` file mein ye 2 lines add karo (main `.env` nahi likh sakta):
   ```
   VITE_CLOUDINARY_CLOUD=tumhara_cloud_name
   VITE_CLOUDINARY_PRESET=tumhara_preset_name
   ```
3. Firebase Console → Firestore → **Rules** → nayi `firestore.rules` paste karke **Publish** (photo ka rule naya hai).
4. `npm run dev` band karke dobara chalao (.env badla hai), browser mein Ctrl+Shift+R.
5. Offline/Install sirf **build** mein chalta hai: `npm run build` phir `npm run preview` → http://localhost:4173 pe test karo (dev mode mein service worker jaan-boojh kar band hai).

### Phase 10 test checklist
- [ ] Landing pe हिंदी dabao → sab Hindi; page reload pe bhi Hindi rahe. ಕನ್ನಡ bhi try karo
- [ ] Doosre account se request bhejo → pehle account pe bell pe number + Notifications page pe "X wants to connect"
- [ ] Message aaye → bell count badhe; chat kholo → count ghat jaye
- [ ] Idea pe doosra account "Interested" kare → owner ke Notifications mein dikhe
- [ ] Profile → camera icon → photo upload → Matches/Chats mein dusre ko photo dikhe
- [ ] Under-18 account pe camera icon na dikhe
- [ ] Matches search box mein "design" ya college ka naam likho → list filter ho
- [ ] `npm run preview` → Chrome DevTools → Network → Offline → page reload → app phir bhi khule
- [ ] Phone pe live site (deploy ke baad) → Profile → Install

> Kannada translation ek baar kisi Kannada dost se check karwa lena. Purani Cloudinary photo account delete hone pe khud nahi hatti – Cloudinary Media Library se manually hata sakte ho.

### Phase 8 + 9 setup
Map ke liye ek naya package hai, isliye ek baar chalao:
```
npm install
```

### Phase 8 + 9 test checklist
| # | Test | Expected |
|---|---|---|
| 1 | Profile → Badges | Kuch badges "Earned" (gold) |
| 2 | Ideas → Idea Dost → 5 jawab → Post this idea | Post form mein pitch aur summary pehle se bhare |
| 3 | Matches → Area map | Bengaluru map par area circles |
| 4 | Teams → mini-challenge → Add to board | Team board mein task |
| 5 | Ideas → Launchpad → List a product (apna Vercel link) → Check | "The link opens" (AI server ON ho) |
| 6 | Doosre account se → Profile → Apply as professional → Admin → Professionals → Verify | Profile par "Verified professional" |
| 7 | Pro account → kisi idea par Request access → owner Allow → pro NDA accept | Summary watermark ke saath dikhegi |
| 8 | Pro → Make an offer (Offer to buy) | Owner ko offer + cooling-off warning |

### Phase 7 test checklist
| # | Test | Expected |
|---|---|---|
| 1 | Teams → Start a team → connected person ko invite | Team "Trial" status mein |
| 2 | Doosre account → Teams → Join team | Dono members mein dikhenge |
| 3 | Board pe task add → → se Doing/Done | Contribution bar badhega |
| 4 | Agreement likho → dono "I agree" | "Everyone agreed" |
| 5 | Chat → Plan a safe meet (dono 18+) | Doosre ko Accept/Decline dikhega |
| 6 | Under-18 account se chat kholo | "Meetings are turned off in Safe Mode" |
| 7 | Members → Leave team (reason ke saath) | Team list se hat jaayega |

### Phase 4 + 6 test checklist
| # | Test | Expected |
|---|---|---|
| 1 | Ideas → Post idea (normal) | "Idea posted and timestamped", fingerprint dikhega |
| 2 | Idea name mein "cricket betting app" | "Sent for admin review" → Admin → Ideas mein dikhega |
| 3 | Doosre account se (connect kiye bina) idea kholo | Pitch dikhega, summary aur plan pe 🔒 |
| 4 | Connect karke dobara kholo | Summary khul jaayegi; owner ko "Who read your summary" mein naam |
| 5 | Owner → Team mein us person ko tick karo | Use full plan dikhega |
| 6 | Matches par stars do + Profile → Give feedback | Admin → Research mein numbers aayenge |

### Phase 2 test checklist
| # | Test | Expected |
|---|---|---|
| 1 | Account A → match par **Connect** | "Request sent" |
| 2 | Account B → **Chats** (badge dikhega) → **Accept** | Chat khulega |
| 3 | Chat mein `bhai apna number de` | "Not sent · Contact sharing" |
| 4 | Teen baar block hone wala message bhejo | Admin → Reports mein auto report |
| 5 | **Report** → reason → Send | Admin ko report + last 5 messages |
| 6 | Admin → Suspend | Us user ka message box band, red notice |
| 7 | **Block** | Dono ek doosre ko matches/chats mein nahi dikhenge |

---

## Tumhe kya karna hai (step by step) 👇

### Step 1 – Laptop setup (ek baar)
1. **Node.js 20 ya usse naya** install karo: https://nodejs.org (LTS wala). Check: terminal mein `node -v`
2. **VS Code** install karo: https://code.visualstudio.com
3. **Git** install karo: https://git-scm.com

### Step 2 – Firebase project banao
1. https://console.firebase.google.com par jao → **Add project** → naam `buildmates` → Google Analytics **off** chalega → Create.
2. Left menu → **Build → Authentication → Get started**
   - **Sign-in method** tab → **Google** → Enable → support email chuno → Save
   - **Email/Password** → Enable → neeche **Email link (passwordless sign-in)** bhi **on** karo → Save
3. Left menu → **Build → Firestore Database → Create database**
   - Location: **asia-south1 (Mumbai)** chuno (India ke liye fast)
   - **Start in production mode** → Create
4. **Project settings** (gear icon) → **General** → neeche **Your apps** → **Web (</>)** icon → app naam `buildmates-web` → Register
   - Jo `firebaseConfig` dikhega, uski values copy kar lo (agle step mein chahiye)

> ⚠️ Firebase mein **billing / card mat jodna**. Free (Spark) plan kaafi hai.

### Step 3 – Project chalao
```bash
# zip extract karo, phir us folder mein terminal kholo
npm install
```
1. `.env.example` file ki copy banao, naam rakho **`.env`**
2. `.env` mein Step 2.4 wali values paste karo:
```
VITE_FIREBASE_API_KEY=AIza....
VITE_FIREBASE_AUTH_DOMAIN=buildmates-xxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=buildmates-xxxx
VITE_FIREBASE_STORAGE_BUCKET=buildmates-xxxx.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcd...
```
3. Chalao:
```bash
npm run dev
```
4. Browser mein http://localhost:5173 kholo 🎉

### Step 4 – Security rules lagao (bahut zaroori!)
Bina iske app ka data padh/likh nahi paoge.

**Aasaan tareeka (console se):** Firebase Console → Firestore Database → **Rules** tab → project ki `firestore.rules` file ka poora content copy karke paste karo → **Publish**.

**Ya command se:**
```bash
npm install -g firebase-tools
firebase login
firebase use --add        # apna project chuno
npm run deploy:rules
```

### Step 5 – Khud ko admin banao
1. App mein ek baar login karke profile bana lo.
2. Firebase Console → **Authentication → Users** → apni row mein **User UID** copy karo.
3. **Firestore Database → Start collection** → Collection ID: `admins` → Document ID: *apna UID paste karo* → field `role` = `owner` → Save.
4. App refresh karo → menu mein **Admin** aa jaayega.

### Step 6 – Live karo (Vercel, free)
1. Code GitHub par daalo:
```bash
git init
git add .
git commit -m "BuildMates phase 1"
git branch -M main
git remote add origin https://github.com/ErShivababu9792/buildmates.git
git push -u origin main
```
2. https://vercel.com → GitHub se login → **Add New → Project** → `buildmates` import karo.
3. **Environment Variables** mein `.env` ki saari 6 lines daalo → **Deploy**.
4. Jo link mile (jaise `buildmates.vercel.app`), use Firebase Console → **Authentication → Settings → Authorized domains → Add domain** mein add karo. (Iske bina Google login live site par nahi chalega.)

---

## Testing checklist (viva ke liye bhi kaam aayega) 🧪

| # | Test | Expected |
|---|---|---|
| 1 | Consent tick kiye bina login | Error message, login nahi hoga |
| 2 | Google login → onboarding poora | Quiz khulega, phir Matches |
| 3 | DOB 15 saal ka daalo | Safe Mode notice + parent email maangega → "Waiting for parent" screen |
| 4 | Admin → Parent approvals → Mark approved | Minor ka screen apne aap Matches par chala jayega |
| 5 | Adult account se matches dekho | Koi bhi minor profile nahi dikhega |
| 6 | Do alag Gmail se 2 profiles banao | Dono ek doosre ke matches mein, % aur reasons ke saath |
| 7 | Profile → Delete account | Profile + data + login sab hat jaayega |
| 8 | Phone par site kholo → browser menu → Add to Home screen | App icon ke saath install |

**Rules Playground se security test:** Firestore → Rules → **Rules Playground**:
- Kisi doosre user ka `users/{uid}` **get** karo → **Denied** aana chahiye ✅
- Apne `profiles/{uid}` mein `verified: true` **update** karo → **Denied** ✅

---

## Folder structure
```
src/
  firebase.js            Firebase connection (.env se)
  context/AuthContext    login + account + profile live sync
  components/            Logo, Icon, AppShell (nav), Guards (route protection), Sheet, Toast, Avatar
  pages/                 Landing, Login, Onboarding, Quiz, Matches, Profile, Admin, WaitingForParent
  lib/                   constants, age, personality (TIPI), matching algorithm
firestore.rules          database security
public/                  logo, favicon, PWA icons, manifest
```

## Data model
- `users/{uid}` – private: email, dob, minor, parentEmail, parentConsent, consentAt
- `profiles/{uid}` – public: name, college, area, role, skills, interests, vision, b5, teamType, verified, minor, visibility
- `admins/{uid}` – admin list (sirf console se)
- `adminLog/{id}` – har admin action ka record
