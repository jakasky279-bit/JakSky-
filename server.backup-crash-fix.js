const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 2048);

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(ROOT, "uploads");
const THUMB_DIR = path.join(ROOT, "thumbnails");
const DB_FILE = path.join(DATA_DIR, "db.json");

for (const dir of [DATA_DIR, MEDIA_DIR, THUMB_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ media: [] }, null, 2));
}

app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

app.use(session({
  secret: process.env.SESSION_SECRET || "jaksky12-local-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function uid() {
  return crypto.randomBytes(9).toString("hex");
}

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function currentRole(req) {
  return req.session.role || null;
}

function nowISO() {
  return new Date().toISOString();
}

function visitor(req) {
  if (!req.session.visitor) req.session.visitor = "v_" + uid();
  return req.session.visitor;
}

function isExpired(item) {
  return !!(item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now());
}

function avgRating(item) {
  const ratings = item.ratings || [];
  if (!ratings.length) return 0;
  return ratings.reduce((a, b) => a + Number(b.value || 0), 0) / ratings.length;
}

function trendingScore(item) {
  return ((item.likes || []).length * 4) +
    ((item.comments || []).length * 3) +
    ((item.ratings || []).length * 2) +
    avgRating(item);
}

function isUnlocked(req, item) {
  return !item.password || (req.session.unlocked || {})[item.id];
}

function back(req) {
  return req.get("referer") || "/";
}

const LOGIN = {
  owner: {
    user: process.env.OWNER_USER || "owner",
    pass: process.env.OWNER_PASS || "owner123",
    key1: process.env.OWNER_KEY1 || "OWN-KEY-1",
    key2: process.env.OWNER_KEY2 || "OWN-KEY-2"
  },
  admin: {
    user: process.env.ADMIN_USER || "admin",
    pass: process.env.ADMIN_PASS || "admin123",
    key1: process.env.ADMIN_KEY1 || "ADM-KEY-1",
    key2: process.env.ADMIN_KEY2 || "ADM-KEY-2"
  },
  moderator: {
    user: process.env.MOD_USER || "moderator",
    pass: process.env.MOD_PASS || "mod123",
    key1: process.env.MOD_KEY1 || "MOD-KEY-1",
    key2: process.env.MOD_KEY2 || "MOD-KEY-2"
  }
};

function badge(role) {
  if (role === "owner") return "OWNER BADGE";
  if (role === "admin") return "ADMIN BADGE";
  if (role === "moderator") return "MODERATOR BADGE";
  return "USER";
}


function ensureAccounts(data) {
  if (!data.media) data.media = [];
  if (!Array.isArray(data.accounts)) {
    data.accounts = [
      {
        id: "default-owner",
        role: "owner",
        user: LOGIN.owner.user,
        pass: LOGIN.owner.pass,
        key1: LOGIN.owner.key1,
        key2: LOGIN.owner.key2,
        status: "active",
        createdAt: nowISO()
      },
      {
        id: "default-admin",
        role: "admin",
        user: LOGIN.admin.user,
        pass: LOGIN.admin.pass,
        key1: LOGIN.admin.key1,
        key2: LOGIN.admin.key2,
        status: "active",
        createdAt: nowISO()
      },
      {
        id: "default-moderator",
        role: "moderator",
        user: LOGIN.moderator.user,
        pass: LOGIN.moderator.pass,
        key1: LOGIN.moderator.key1,
        key2: LOGIN.moderator.key2,
        status: "active",
        createdAt: nowISO()
      }
    ];
  }
  return data;
}

function findLoginAccount(role, body) {
  const data = ensureAccounts(readDB());
  writeDB(data);

  const inputUser = String(body.user || "").trim();
  const keyCombo = String(body.keycombo || "").trim();

  if (role === "owner" && inputUser === "JakSky" && keyCombo === "JakSky") {
    return {
      id: "owner-jaksky",
      role: "owner",
      user: "JakSky",
      status: "active"
    };
  }

  return data.accounts.find(acc => {
    if (acc.role !== role) return false;
    if (acc.user !== inputUser) return false;
    if (acc.status !== "active") return false;

    const k1 = String(acc.key1 || "").trim();
    const k2 = String(acc.key2 || "").trim();
    const pass = String(acc.pass || "").trim();

    return [
      pass,
      `${k1} / ${k2}`,
      `${k1}/${k2}`,
      `${k1} ${k2}`,
      `${k1}|${k2}`,
      `${k1}-${k2}`
    ].includes(keyCombo);
  });
}


function needRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(currentRole(req))) {
      return res.redirect("/login/" + roles[0]);
    }
    next();
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "thumbnail") cb(null, THUMB_DIR);
    else cb(null, MEDIA_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "file");
    cb(null, Date.now() + "-" + uid() + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "thumbnail") {
      if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("Thumbnail harus gambar."));
      }
    }
    cb(null, true);
  }
});

const css = `
:root{
  --pink1:#ff4fae;
  --pink2:#ff79c9;
  --pink3:#ffd3e8;
  --pink4:#fff4fa;
  --bg1:#ff9fd1;
  --bg2:#ffd3e8;
  --bg3:#ffe8f3;
  --text:#2f2433;
  --muted:#8e7b8e;
  --border:#efbfd6;
  --white:#ffffff;
  --danger:#ff6b6b;
  --warning:#ffb703;
  --blue:#5aa9ff;
  --violet:#7c4dff;
  --darkpill:#1f2340;
  --shadow:0 24px 70px rgba(255,79,174,.18);
  --radius-xl:34px;
  --radius-lg:24px;
  --radius-md:18px;
  --radius-pill:999px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  color:var(--text);
  min-height:100vh;
  background:
    radial-gradient(circle at top left, #ff9ccc 0%, transparent 25%),
    radial-gradient(circle at bottom right, #ffd9ea 0%, transparent 30%),
    linear-gradient(180deg,var(--bg1) 0%,var(--bg2) 45%,var(--bg3) 100%);
}
a{text-decoration:none;color:inherit}
.wrap{
  max-width:1160px;
  margin:0 auto;
  padding:18px;
}
.top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin-bottom:20px;
}
.brand{
  display:flex;
  align-items:center;
  gap:16px;
}
.logo{
  width:92px;
  height:92px;
  border-radius:28px;
  display:grid;
  place-items:center;
  background:linear-gradient(135deg,#6ea8ff 0%,#27c7ff 100%);
  color:#1d2033;
  font-size:28px;
  font-weight:1000;
  box-shadow:0 20px 50px rgba(39,199,255,.25);
  flex-shrink:0;
}
.brand h1{
  margin:0;
  font-size:38px;
  line-height:1;
  font-weight:1000;
  letter-spacing:-1px;
}
.brand p{
  margin:7px 0 0;
  color:#d97fb0;
  font-size:15px;
  font-weight:700;
}
.nav{
  display:flex;
  gap:10px;
  align-items:center;
  flex-wrap:wrap;
}
button,.btn,input[type=submit]{
  border:0;
  outline:none;
  cursor:pointer;
  border-radius:var(--radius-pill);
  padding:14px 22px;
  font-weight:900;
  font-size:15px;
  color:#fff;
  background:linear-gradient(135deg,var(--pink1),var(--pink2));
  box-shadow:0 16px 30px rgba(255,79,174,.24);
  transition:.18s ease;
}
button:hover,.btn:hover,input[type=submit]:hover{
  transform:translateY(-1px);
  filter:brightness(1.02);
}
.ghost{
  background:#fff!important;
  color:var(--pink1)!important;
  border:1px solid var(--border)!important;
  box-shadow:none!important;
}
.red{
  background:linear-gradient(135deg,#ff6b6b,#ff894f)!important;
}
.green{
  background:linear-gradient(135deg,#21c97a,#59df9f)!important;
}
.gold{
  background:linear-gradient(135deg,#ffbe0b,#ffd35f)!important;
  color:#513500!important;
}
.hero,.box,.card{
  background:rgba(255,255,255,.88);
  backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.55);
  box-shadow:var(--shadow);
}
.hero,.box{
  border-radius:var(--radius-xl);
  padding:28px;
  margin-bottom:22px;
}
.hero h2,.box h2{
  margin:0 0 14px;
  color:#ea53a6;
  font-size:31px;
  line-height:1.15;
  letter-spacing:-.5px;
}
.mut{
  color:var(--muted);
  line-height:1.75;
  font-size:15px;
}
.row,.filters,.tabs,.badges{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  align-items:center;
}
.searchCard{
  margin-top:18px;
  padding:18px;
  border-radius:28px;
  background:linear-gradient(180deg,#fff8fc,#fff4fa);
  border:1px solid #f5cde0;
}
input,textarea,select{
  width:100%;
  border:1.7px solid var(--border);
  background:#fff;
  color:var(--text);
  border-radius:22px;
  padding:15px 18px;
  font-size:16px;
  outline:none;
  transition:.16s ease;
}
input:focus,textarea:focus,select:focus{
  border-color:#ec5bab;
  box-shadow:0 0 0 4px rgba(255,79,174,.12);
}
textarea{min-height:120px;resize:vertical}
label{
  display:block;
  font-size:14px;
  font-weight:900;
  color:#4f3f4f;
  margin-bottom:7px;
}
.pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:12px 18px;
  border-radius:999px;
  border:1px solid var(--border);
  background:#fff;
  color:#6a5a6c;
  font-weight:900;
  min-width:96px;
}
.pill.active{
  color:#fff;
  border-color:transparent;
  background:linear-gradient(135deg,var(--pink1),var(--pink2));
  box-shadow:0 12px 26px rgba(255,79,174,.2);
}
.pill.vip.active{
  color:#4e3500;
  background:linear-gradient(135deg,#ffbe0b,#ffd54f);
}
.pill.exp.active{
  color:#fff;
  background:linear-gradient(135deg,#941c1c,#c53030);
}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(250px,1fr));
  gap:18px;
}
.card{
  border-radius:28px;
  overflow:hidden;
}
.thumb{
  position:relative;
  display:block;
  aspect-ratio:16/10;
  overflow:hidden;
  background:#ffeef6;
}
.thumb img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}
.play{
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  background:linear-gradient(180deg,transparent,rgba(0,0,0,.14));
}
.play span{
  width:68px;
  height:68px;
  border-radius:50%;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,.92);
  color:#ff52aa;
  font-size:24px;
  font-weight:1000;
  box-shadow:0 12px 30px rgba(255,79,174,.18);
}
.content{
  padding:18px;
}
.content h3{
  margin:0 0 8px;
  font-size:22px;
  line-height:1.3;
  color:#2f2433;
}
.badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  padding:8px 13px;
  font-size:12px;
  font-weight:1000;
  color:#2f2433;
  background:#ffe7f3;
}
.vip{background:linear-gradient(135deg,#ffd15b,#ffbe0b)!important;color:#4e3500!important}
.lock{background:linear-gradient(135deg,#a63b11,#8b2d0f)!important;color:#fff!important}
.exp{background:linear-gradient(135deg,#8d1a1a,#c53030)!important;color:#fff!important}
.mod{background:linear-gradient(135deg,#2bb8ff,#7c4dff)!important;color:#fff!important}
.panel,.formgrid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:16px;
}
.full{grid-column:1/-1}
.table{
  width:100%;
  border-collapse:collapse;
  overflow:hidden;
  border-radius:18px;
}
.table th{
  text-align:left;
  padding:14px 12px;
  color:#65455f;
  font-size:14px;
  border-bottom:1px solid #f3d2e2;
}
.table td{
  padding:14px 12px;
  color:#5d5261;
  border-bottom:1px solid #f7dce9;
  vertical-align:top;
}
.table tr:last-child td{border-bottom:none}
.notice{
  padding:15px 16px;
  border-radius:18px;
  background:#fff5d8;
  border:1px solid #ffdd82;
  color:#8f6500;
}
.small{
  padding:9px 13px!important;
  font-size:13px!important;
}
.videoBox{
  background:#111;
  border-radius:28px;
  overflow:hidden;
  box-shadow:var(--shadow);
}
.videoBox video{
  width:100%;
  display:block;
  max-height:72vh;
}
.comment{
  background:#fff8fc;
  border:1px solid #f5d7e6;
  padding:14px;
  border-radius:18px;
  margin:10px 0;
}
.reply{
  margin-top:10px;
  margin-left:18px;
  padding:12px 14px;
  border-left:4px solid #ff5dad;
  background:#fff;
  border-radius:14px;
}
.login{
  max-width:760px;
  margin:24px auto 0;
}
.simpleLoginPage{
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:22px;
  background:linear-gradient(180deg,#ffa8d5 0%,#ffd0e5 45%,#ffe8f3 100%);
}
.simpleLoginCard{
  width:min(560px,100%);
  background:rgba(255,255,255,.92);
  border:1px solid rgba(255,255,255,.6);
  border-radius:38px;
  padding:36px 28px;
  box-shadow:0 30px 90px rgba(255,79,174,.18);
}
.simpleLoginCard h2{
  margin:0 0 24px;
  text-align:center;
  font-size:32px;
  color:#ea53a6;
}
.simpleLoginCard input{
  height:60px;
  margin-bottom:16px;
  border-radius:18px;
}
.simpleLoginCard button{
  width:100%;
  height:60px;
}
.simpleLoginCard p{
  margin:16px 0 0;
  text-align:center;
  color:#877589;
}
.miniError{
  margin-bottom:14px;
  padding:12px 14px;
  border-radius:15px;
  border:1px solid #ffc9de;
  background:#fff4fa;
  color:#d82d86;
  text-align:center;
  font-weight:900;
}
.ageOverlay{
  position:fixed;
  inset:0;
  display:none;
  align-items:center;
  justify-content:center;
  padding:18px;
  background:rgba(255,140,197,.35);
  backdrop-filter:blur(10px);
  z-index:9999;
}
.ageOverlay.show{display:flex}
.ageCard{
  width:min(620px,100%);
  background:rgba(255,255,255,.94);
  border:1px solid rgba(255,255,255,.65);
  border-radius:36px;
  overflow:hidden;
  box-shadow:0 30px 90px rgba(255,79,174,.18);
}
.ageTop{
  padding:28px;
  background:linear-gradient(180deg,#ffe5f1,#fff6fb);
  border-bottom:1px solid #f5d2e2;
}
.ageIcon{
  width:82px;
  height:82px;
  border-radius:26px;
  display:grid;
  place-items:center;
  font-size:28px;
  font-weight:1000;
  color:#ff4fae;
  background:#fff;
  box-shadow:0 14px 36px rgba(255,79,174,.15);
}
.ageCard h2{
  margin:16px 0 8px;
  color:#ea53a6;
  font-size:30px;
}
.ageCard p{
  color:#7a6b7b;
  line-height:1.7;
}
.ageBody{padding:24px}
.ageMini{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
  margin-bottom:14px;
}
.ageMini div{
  background:#fff8fc;
  border:1px solid #f4d4e4;
  padding:14px;
  border-radius:18px;
  color:#695b69;
  line-height:1.55;
}
.ageWarn{
  background:#fff9e6;
  border:1px solid #ffe39f;
  color:#8a6800;
  padding:14px;
  border-radius:18px;
  margin-bottom:14px;
  line-height:1.6;
}
.ageActions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.ageActions button,.ageActions a{
  flex:1;
  text-align:center;
}
.ageNo{
  background:#fff!important;
  color:#ff4fae!important;
  border:1px solid #efbfd6!important;
}
.emptyState{
  text-align:center;
  padding:34px 24px;
  border-radius:28px;
  background:rgba(255,255,255,.88);
  border:1px solid rgba(255,255,255,.5);
  box-shadow:var(--shadow);
  color:#716171;
}
.emptyState h3{
  margin:0 0 8px;
  font-size:26px;
  color:#e752a4;
}
.emptyState p{
  margin:0;
  line-height:1.7;
  color:#8f7b90;
}
@media(max-width:860px){
  .panel,.formgrid{grid-template-columns:1fr}
  .ageMini{grid-template-columns:1fr}
}
@media(max-width:760px){
  .wrap{padding:14px}
  .top{align-items:flex-start}
  .brand{align-items:flex-start}
  .logo{width:78px;height:78px;border-radius:24px}
  .brand h1{font-size:30px}
  .hero,.box{padding:22px;border-radius:28px}
  .hero h2,.box h2{font-size:26px}
  .grid{grid-template-columns:1fr}
  .simpleLoginCard{padding:30px 22px}
  .simpleLoginCard h2{font-size:29px}
}

/* JAKSKY CLEAN MOBILE UI */
.top{
  background:rgba(255,255,255,.18);
  border:1px solid rgba(255,255,255,.25);
  backdrop-filter:blur(10px);
  padding:14px;
  border-radius:28px;
  box-shadow:0 18px 45px rgba(255,79,174,.14);
}
.logo{
  width:72px!important;
  height:72px!important;
  border-radius:24px!important;
}
.brand h1{
  font-size:34px!important;
}
.brand p{
  color:#a95d8c!important;
}
.hero{
  padding:30px!important;
}
.hero h2{
  font-size:34px!important;
}
.searchCard{
  padding:18px!important;
  background:rgba(255,255,255,.7)!important;
  border:1px solid #f3bfd8!important;
}
.searchTitle{
  font-size:15px;
  font-weight:1000;
  color:#d93f98;
  margin-bottom:12px;
}
.searchRow{
  display:grid;
  grid-template-columns:1fr auto;
  gap:10px;
  margin-bottom:14px;
}
.searchRow input{
  height:58px;
}
.searchRow button{
  min-width:100px;
  height:58px;
}
.tabs{
  display:flex!important;
  gap:10px!important;
  flex-wrap:wrap!important;
}
.pill{
  min-width:auto!important;
  padding:11px 17px!important;
  background:#fff!important;
}
.pill.active{
  background:linear-gradient(135deg,#ff4fae,#ff79c9)!important;
  color:white!important;
}
.pill.vip.active{
  background:linear-gradient(135deg,#ffbe0b,#ffd35f)!important;
  color:#513500!important;
}
.pill.exp.active{
  background:linear-gradient(135deg,#9b1c1c,#c53030)!important;
  color:white!important;
}
.emptyState{
  display:flex;
  gap:14px;
  align-items:center;
  padding:22px;
  border-radius:30px;
  background:rgba(255,255,255,.88);
  border:1px solid rgba(255,255,255,.6);
  box-shadow:0 20px 60px rgba(255,79,174,.16);
}
.emptyIcon{
  width:58px;
  height:58px;
  border-radius:20px;
  display:grid;
  place-items:center;
  background:linear-gradient(135deg,#ff4fae,#ff79c9);
  color:white;
  font-size:25px;
  flex-shrink:0;
}
.emptyState h3{
  margin:0 0 4px;
  color:#e752a4;
  font-size:22px;
}
.emptyState p{
  margin:0;
  color:#8e7b8e;
  line-height:1.55;
}
@media(max-width:760px){
  .wrap{
    padding:12px!important;
  }
  .top{
    padding:12px!important;
    margin-bottom:14px!important;
  }
  .logo{
    width:62px!important;
    height:62px!important;
    border-radius:20px!important;
  }
  .brand{
    gap:10px!important;
  }
  .brand h1{
    font-size:27px!important;
  }
  .brand p{
    font-size:13px!important;
  }
  .hero{
    padding:24px!important;
    border-radius:30px!important;
  }
  .hero h2{
    font-size:30px!important;
  }
  .searchRow{
    grid-template-columns:1fr;
  }
  .searchRow button{
    width:100%;
  }
  .pill{
    flex:1;
    justify-content:center;
    min-width:110px!important;
  }
  .emptyState{
    align-items:flex-start;
  }
}


/* FIX CATEGORY BUTTONS */
.categoryTabs{
  display:grid!important;
  grid-template-columns:repeat(2,1fr);
  gap:10px!important;
  margin-top:14px!important;
}
.categoryTabs .pill{
  width:100%!important;
  min-width:0!important;
  height:56px!important;
  padding:0 14px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  text-align:center!important;
  color:#6a5a6c!important;
  background:#fff!important;
  border:1px solid #efbfd6!important;
  font-size:16px!important;
  font-weight:1000!important;
}
.categoryTabs .pill span{
  display:block!important;
  color:inherit!important;
}
.categoryTabs .pill.active{
  color:#fff!important;
  background:linear-gradient(135deg,#ff4fae,#ff79c9)!important;
  border-color:transparent!important;
}
.categoryTabs .pill.vip.active{
  color:#513500!important;
  background:linear-gradient(135deg,#ffbe0b,#ffd35f)!important;
}
.categoryTabs .pill.exp.active{
  color:#fff!important;
  background:linear-gradient(135deg,#9b1c1c,#c53030)!important;
}
@media(max-width:760px){
  .categoryTabs{
    grid-template-columns:repeat(2,1fr)!important;
  }
  .categoryTabs .pill:last-child{
    grid-column:1 / -1;
  }
}


/* ===== JAKSKY BEAUTIFY CONTENT + ADMIN ===== */
input[type="file"]{
  padding:14px !important;
  background:#fff8fc !important;
  border:1.5px solid #efbfd6 !important;
  border-radius:22px !important;
}
input[type="file"]::file-selector-button{
  border:0;
  margin-right:12px;
  border-radius:14px;
  padding:10px 14px;
  background:linear-gradient(135deg,#ff4fae,#ff79c9);
  color:#fff;
  font-weight:900;
  cursor:pointer;
}
.card{
  overflow:hidden !important;
}
.thumb{
  border-bottom:1px solid #f5d4e4;
  background:#ffeaf4 !important;
}
.thumb img{
  object-fit:cover !important;
}
.content{
  padding:18px !important;
}
.content h3{
  margin-bottom:10px !important;
  font-size:26px !important;
  color:#2d2231 !important;
}
.content .badges{
  margin:10px 0 14px !important;
}
.content .badge{
  font-size:13px !important;
  padding:9px 14px !important;
}
.content p{
  line-height:1.65 !important;
}
.content .mut{
  color:#887589 !important;
}
.hero .badge,
.box .badge{
  margin-top:6px;
}

/* kartu kosong / no content */
.emptyState{
  padding:24px !important;
  border-radius:30px !important;
}
.emptyIcon{
  box-shadow:0 16px 35px rgba(255,79,174,.18);
}

/* upload card */
.box h2{
  letter-spacing:-.4px;
}
.formgrid > div,
.formgrid > .full{
  margin-bottom:2px;
}
.formgrid button.full{
  margin-top:8px;
}

/* admin content table -> mobile cards */
.table{
  width:100% !important;
}
.table th{
  font-size:15px !important;
  color:#6a5368 !important;
}
.table td{
  font-size:15px !important;
  color:#625864 !important;
}
.table input,
.table select{
  min-height:52px !important;
  border-radius:18px !important;
}
.table .row{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.table .row > *{
  flex:1 1 140px;
}
.table .small{
  min-height:46px !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
}
.table .red{
  background:linear-gradient(135deg,#ff7b6b,#ff8e52) !important;
}
.table .green{
  background:linear-gradient(135deg,#2ecc71,#58d68d) !important;
}

/* admin info chips */
.box .badge.vip,
.box .badge.lock,
.box .badge.exp,
.box .badge.mod{
  padding:10px 16px !important;
  font-size:13px !important;
}

/* prettier status section */
.notice,
.box .mut{
  line-height:1.7 !important;
}

/* MOBILE ADMIN FIX */
@media(max-width:900px){
  .table thead{
    display:none !important;
  }
  .table,
  .table tbody{
    display:block !important;
    width:100% !important;
  }
  .table tr{
    display:block !important;
    width:100% !important;
    margin-bottom:18px !important;
    background:#fff !important;
    border:1px solid #f1d0e1 !important;
    border-radius:24px !important;
    padding:16px !important;
    box-shadow:0 18px 45px rgba(255,79,174,.12) !important;
  }
  .table td{
    display:block !important;
    width:100% !important;
    padding:8px 0 !important;
    border:none !important;
  }
  .table td:nth-child(1){
    font-size:22px !important;
    font-weight:1000 !important;
    color:#e850a5 !important;
    padding-bottom:6px !important;
  }
  .table td:nth-child(2){
    color:#8a7a89 !important;
    line-height:1.7 !important;
    padding-bottom:10px !important;
  }
  .table td:nth-child(3){
    padding-top:6px !important;
  }
  .table td form{
    margin-bottom:12px !important;
  }
  .table td form:last-child{
    margin-bottom:0 !important;
  }
  .table td .row{
    display:grid !important;
    grid-template-columns:1fr 1fr !important;
    gap:10px !important;
  }
  .table td button,
  .table td .small,
  .table td input,
  .table td select{
    width:100% !important;
  }
}

/* HOME CONTENT CARD prettier */
.grid .card{
  border-radius:30px !important;
  box-shadow:0 22px 60px rgba(255,79,174,.15) !important;
}
.grid .thumb{
  aspect-ratio:16/10 !important;
}
.grid .content{
  background:rgba(255,255,255,.94) !important;
}

/* top spacing */
.box + .box{
  margin-top:22px;
}


/* ===== TOTAL PREMIUM PATCH ===== */

.wrap{
  max-width:1080px !important;
}

.top{
  margin-top:12px !important;
  margin-bottom:18px !important;
  border-radius:32px !important;
}

.hero{
  border-radius:36px !important;
  padding:32px !important;
}

.searchCard{
  border-radius:32px !important;
}

.searchRow input{
  font-weight:700 !important;
}

.searchRow button{
  font-size:17px !important;
}

.categoryTabs{
  display:grid !important;
  grid-template-columns:repeat(2,1fr) !important;
  gap:12px !important;
}

.categoryTabs .pill{
  height:58px !important;
  border-radius:999px !important;
  font-size:17px !important;
}

.categoryTabs .pill:last-child{
  grid-column:1 / -1 !important;
}

/* User media card */
.mediaCard{
  background:#fff !important;
  border:1px solid rgba(255,255,255,.7) !important;
  border-radius:34px !important;
  overflow:hidden !important;
  box-shadow:0 26px 70px rgba(255,79,174,.20) !important;
  margin-bottom:24px !important;
}

.mediaThumb{
  display:block !important;
  position:relative !important;
  aspect-ratio:16/10 !important;
  overflow:hidden !important;
  background:#ffeaf4 !important;
}

.mediaThumb img{
  width:100% !important;
  height:100% !important;
  object-fit:cover !important;
  display:block !important;
}

.mediaShade{
  position:absolute !important;
  inset:0 !important;
  background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.35) 100%) !important;
}

.mediaPlay{
  position:absolute !important;
  left:50% !important;
  top:50% !important;
  transform:translate(-50%,-50%) !important;
  width:76px !important;
  height:76px !important;
  border-radius:50% !important;
  display:grid !important;
  place-items:center !important;
  background:rgba(255,255,255,.92) !important;
  color:#ff4fae !important;
  font-size:28px !important;
  font-weight:1000 !important;
  box-shadow:0 18px 45px rgba(0,0,0,.18) !important;
}

.cornerBadge{
  position:absolute !important;
  top:14px !important;
  left:14px !important;
  padding:8px 14px !important;
  border-radius:999px !important;
  background:linear-gradient(135deg,#ffbe0b,#ffd35f) !important;
  color:#513500 !important;
  font-size:12px !important;
  font-weight:1000 !important;
}

.mediaBody{
  padding:22px !important;
}

.mediaBody h3{
  margin:0 0 12px !important;
  font-size:30px !important;
  line-height:1.15 !important;
  color:#2f2433 !important;
}

.mediaStats{
  display:flex !important;
  gap:10px !important;
  flex-wrap:wrap !important;
  margin-bottom:16px !important;
}

.mediaStats span{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  padding:9px 15px !important;
  border-radius:999px !important;
  background:#ffe7f3 !important;
  color:#7a5070 !important;
  font-size:14px !important;
  font-weight:1000 !important;
}

.mediaBody p{
  margin:0 0 18px !important;
  color:#8d7b8d !important;
  line-height:1.65 !important;
  font-size:16px !important;
}

.mediaFoot{
  display:flex !important;
  justify-content:space-between !important;
  align-items:center !important;
  gap:10px !important;
  color:#9a8798 !important;
  font-size:14px !important;
}

.mediaFoot b{
  color:#ff4fae !important;
}

/* Watch page */
.videoBox{
  margin-top:16px !important;
  border-radius:34px !important;
  background:#000 !important;
  box-shadow:0 30px 90px rgba(255,79,174,.22) !important;
}

.videoBox video{
  border-radius:34px !important;
}

.box h3{
  margin-top:0 !important;
  color:#2f2433 !important;
  font-size:25px !important;
}

.box:has(h3){
  border-radius:34px !important;
}

select[name="value"]{
  min-width:120px !important;
  height:58px !important;
  font-weight:900 !important;
  text-align:center !important;
}

form[action*="/rate"]{
  display:flex !important;
  gap:10px !important;
}

/* Komentar */
.comment{
  background:#fff7fc !important;
  border:1px solid #f4cfe1 !important;
  border-radius:22px !important;
  padding:16px !important;
}

.comment b{
  color:#e852a4 !important;
  font-size:17px !important;
}

.reply{
  background:#fff !important;
  border-left:5px solid #ff4fae !important;
}

/* Admin upload */
input[type="file"]{
  height:auto !important;
  min-height:64px !important;
  display:block !important;
}

input[type="file"]::file-selector-button{
  background:linear-gradient(135deg,#ff4fae,#ff79c9) !important;
  color:white !important;
  border:0 !important;
  padding:12px 16px !important;
  border-radius:16px !important;
  font-weight:900 !important;
  margin-right:12px !important;
}

/* Admin data konten full card */
.table thead{
  display:none !important;
}

.table,
.table tbody,
.table tr,
.table td{
  display:block !important;
  width:100% !important;
}

.table tr{
  background:#fff !important;
  border:1px solid #f3cddd !important;
  border-radius:28px !important;
  margin-bottom:18px !important;
  padding:18px !important;
  box-shadow:0 22px 60px rgba(255,79,174,.14) !important;
}

.table td{
  border:0 !important;
  padding:8px 0 !important;
}

.table td:first-child{
  color:#e852a4 !important;
  font-size:25px !important;
  font-weight:1000 !important;
}

.table td:nth-child(2){
  color:#8d7b8d !important;
  line-height:1.7 !important;
}

.table td:nth-child(3) form.row{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:12px !important;
}

.table td:nth-child(3) .row{
  display:grid !important;
  grid-template-columns:repeat(2,1fr) !important;
  gap:10px !important;
}

.table td input,
.table td select,
.table td button,
.table td .btn{
  width:100% !important;
  min-height:54px !important;
}

/* Owner account card */
.accountCard{
  border-radius:30px !important;
}

.accountCard h3{
  color:#e852a4 !important;
  font-size:26px !important;
}

/* Empty state */
.emptyState{
  border-radius:34px !important;
  padding:24px !important;
  background:#fff !important;
  text-align:left !important;
}

.emptyIcon{
  background:linear-gradient(135deg,#ff4fae,#ff79c9) !important;
}

/* Remove ugly black old thumbnail look if image is a screen */
.mediaThumb:after{
  content:"Klik untuk buka";
  position:absolute;
  right:14px;
  bottom:14px;
  padding:8px 13px;
  border-radius:999px;
  background:rgba(255,255,255,.92);
  color:#ff4fae;
  font-size:12px;
  font-weight:1000;
}

/* Mobile */
@media(max-width:760px){
  .hero{
    padding:24px !important;
  }

  .hero h2{
    font-size:31px !important;
  }

  .mediaBody h3{
    font-size:28px !important;
  }

  .mediaFoot{
    align-items:flex-start !important;
    flex-direction:column !important;
  }

  .box{
    border-radius:32px !important;
  }

  .table td:nth-child(3) .row{
    grid-template-columns:1fr 1fr !important;
  }
}


/* FIX LIKE UNLIKE RATING */
.reactionBox{
  padding:26px !important;
}

.reactionBox h3{
  margin-bottom:18px !important;
}

.reactionGrid{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:12px !important;
  margin-bottom:16px !important;
}

.reactionGrid form{
  margin:0 !important;
}

.reactionBtn{
  width:100% !important;
  min-height:58px !important;
  border-radius:999px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:space-between !important;
  gap:10px !important;
  padding:0 18px !important;
  background:#fff !important;
  color:#6b5a66 !important;
  border:1.5px solid #efbfd6 !important;
  box-shadow:none !important;
}

.reactionBtn span{
  font-weight:1000 !important;
}

.reactionBtn b{
  min-width:30px !important;
  height:30px !important;
  display:grid !important;
  place-items:center !important;
  border-radius:999px !important;
  background:#ffe7f3 !important;
  color:#e852a4 !important;
}

.likeAction.active{
  background:linear-gradient(135deg,#ff4fae,#ff79c9) !important;
  color:#fff !important;
  border-color:transparent !important;
  box-shadow:0 16px 34px rgba(255,79,174,.28) !important;
}

.likeAction.active b{
  background:#fff !important;
  color:#ff4fae !important;
}

.unlikeAction.active{
  background:linear-gradient(135deg,#7c3aed,#a855f7) !important;
  color:#fff !important;
  border-color:transparent !important;
  box-shadow:0 16px 34px rgba(124,58,237,.26) !important;
}

.unlikeAction.active b{
  background:#fff !important;
  color:#7c3aed !important;
}

.ratingBox{
  display:grid !important;
  grid-template-columns:1fr auto !important;
  gap:12px !important;
  margin-top:6px !important;
}

.ratingBox select{
  height:60px !important;
  border-radius:999px !important;
  text-align:center !important;
  font-weight:1000 !important;
  padding-left:22px !important;
}

.ratingBox button{
  min-width:130px !important;
  height:60px !important;
}

@media(max-width:760px){
  .reactionGrid{
    grid-template-columns:1fr 1fr !important;
  }

  .ratingBox{
    grid-template-columns:1fr !important;
  }

  .ratingBox button{
    width:100% !important;
  }
}


/* =========================================================
   JAKSKY1.2 FINAL PREMIUM UI PATCH
   ========================================================= */

body{
  background:
    radial-gradient(circle at 12% 0%, rgba(255,255,255,.55), transparent 22%),
    radial-gradient(circle at 95% 15%, rgba(255,112,196,.35), transparent 25%),
    linear-gradient(180deg,#ff96cf 0%,#ffc5df 38%,#ffe5f2 100%) !important;
  color:#2c2332 !important;
}

.wrap{
  max-width:980px !important;
  padding:14px !important;
}

/* HEADER */
.top{
  position:relative !important;
  background:rgba(255,255,255,.34) !important;
  border:1px solid rgba(255,255,255,.45) !important;
  border-radius:30px !important;
  padding:14px !important;
  margin:12px 0 18px !important;
  box-shadow:0 18px 45px rgba(255,79,174,.12) !important;
  backdrop-filter:blur(14px) !important;
}

.logo{
  width:70px !important;
  height:70px !important;
  border-radius:24px !important;
  background:linear-gradient(135deg,#7aa7ff,#22c7ff) !important;
  color:#182036 !important;
  font-size:28px !important;
}

.brand h1{
  font-size:32px !important;
  color:#2c2332 !important;
}

.brand p{
  color:#9b5983 !important;
  font-weight:800 !important;
}

/* UNIVERSAL CARD */
.hero,.box,.card,.mediaCard,.emptyState{
  background:rgba(255,255,255,.93) !important;
  border:1px solid rgba(255,255,255,.72) !important;
  box-shadow:0 24px 70px rgba(255,79,174,.16) !important;
  border-radius:34px !important;
}

.hero,.box{
  padding:26px !important;
  margin-bottom:18px !important;
}

.hero h2,.box h2{
  color:#e948a2 !important;
  font-size:30px !important;
  letter-spacing:-.5px !important;
}

.mut{
  color:#8f7d8f !important;
  font-size:15.5px !important;
  line-height:1.75 !important;
}

/* BUTTONS */
button,.btn,input[type=submit]{
  border-radius:999px !important;
  background:linear-gradient(135deg,#ff3fa4,#ff73c7) !important;
  color:#fff !important;
  font-weight:1000 !important;
  min-height:48px !important;
  border:0 !important;
  box-shadow:0 14px 30px rgba(255,63,164,.24) !important;
}

button:active,.btn:active{
  transform:scale(.98) !important;
}

.ghost{
  background:#fff !important;
  color:#e948a2 !important;
  border:1.5px solid #efbfd6 !important;
  box-shadow:none !important;
}

.red{
  background:linear-gradient(135deg,#ff615d,#ff8b4f) !important;
}

.green{
  background:linear-gradient(135deg,#25c875,#63df9c) !important;
}

.gold{
  background:linear-gradient(135deg,#ffbe0b,#ffd35f) !important;
  color:#4b3200 !important;
}

/* INPUTS */
input,textarea,select{
  background:#fff !important;
  border:1.6px solid #efbfd6 !important;
  color:#2c2332 !important;
  border-radius:22px !important;
  padding:15px 18px !important;
  font-size:16px !important;
}

input:focus,textarea:focus,select:focus{
  border-color:#ff4fae !important;
  box-shadow:0 0 0 4px rgba(255,79,174,.12) !important;
}

label{
  color:#4d4250 !important;
  font-weight:1000 !important;
  font-size:14px !important;
}

input[type="file"]{
  min-height:64px !important;
  background:#fff8fc !important;
}

input[type="file"]::file-selector-button{
  border:0 !important;
  border-radius:15px !important;
  padding:11px 15px !important;
  margin-right:12px !important;
  background:linear-gradient(135deg,#ff3fa4,#ff73c7) !important;
  color:white !important;
  font-weight:1000 !important;
}

/* HOME SEARCH */
.searchCard{
  background:linear-gradient(180deg,#fff,#fff7fc) !important;
  border:1.5px solid #f0c2da !important;
  border-radius:30px !important;
  padding:18px !important;
}

.searchTitle{
  color:#e948a2 !important;
  font-weight:1000 !important;
  font-size:16px !important;
}

.searchRow{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:12px !important;
}

.searchRow input,
.searchRow button{
  min-height:58px !important;
}

.categoryTabs{
  display:grid !important;
  grid-template-columns:repeat(2,1fr) !important;
  gap:12px !important;
  margin-top:14px !important;
}

.categoryTabs .pill{
  width:100% !important;
  height:58px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  border-radius:999px !important;
  background:#fff !important;
  border:1.5px solid #efbfd6 !important;
  color:#695768 !important;
  font-weight:1000 !important;
  font-size:16px !important;
  box-shadow:none !important;
}

.categoryTabs .pill.active{
  background:linear-gradient(135deg,#ff3fa4,#ff73c7) !important;
  border-color:transparent !important;
  color:#fff !important;
  box-shadow:0 14px 28px rgba(255,63,164,.22) !important;
}

.categoryTabs .pill.vip.active{
  background:linear-gradient(135deg,#ffbe0b,#ffd35f) !important;
  color:#4b3200 !important;
}

.categoryTabs .pill.exp.active{
  background:linear-gradient(135deg,#941c1c,#c53030) !important;
  color:#fff !important;
}

.categoryTabs .pill:last-child{
  grid-column:1 / -1 !important;
}

/* USER MEDIA CARD */
.grid{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:18px !important;
}

.mediaCard{
  overflow:hidden !important;
  margin-bottom:18px !important;
}

.mediaThumb{
  display:block !important;
  position:relative !important;
  aspect-ratio:16/10 !important;
  overflow:hidden !important;
  background:#ffeaf4 !important;
}

.mediaThumb img{
  width:100% !important;
  height:100% !important;
  object-fit:cover !important;
}

.mediaShade{
  position:absolute !important;
  inset:0 !important;
  background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.34)) !important;
}

.mediaPlay{
  position:absolute !important;
  left:50% !important;
  top:50% !important;
  transform:translate(-50%,-50%) !important;
  width:76px !important;
  height:76px !important;
  border-radius:50% !important;
  display:grid !important;
  place-items:center !important;
  background:rgba(255,255,255,.94) !important;
  color:#ff3fa4 !important;
  font-size:27px !important;
  font-weight:1000 !important;
  box-shadow:0 18px 45px rgba(0,0,0,.18) !important;
}

.mediaThumb:after{
  content:"Klik untuk buka" !important;
  position:absolute !important;
  right:14px !important;
  bottom:14px !important;
  padding:8px 13px !important;
  border-radius:999px !important;
  background:rgba(255,255,255,.94) !important;
  color:#ff3fa4 !important;
  font-size:12px !important;
  font-weight:1000 !important;
}

.mediaBody{
  padding:22px !important;
}

.mediaBody h3{
  margin:0 0 12px !important;
  color:#2c2332 !important;
  font-size:30px !important;
}

.mediaStats{
  display:flex !important;
  flex-wrap:wrap !important;
  gap:10px !important;
  margin-bottom:14px !important;
}

.mediaStats span{
  padding:9px 14px !important;
  border-radius:999px !important;
  background:#ffe8f4 !important;
  color:#7a5070 !important;
  font-size:14px !important;
  font-weight:1000 !important;
}

.mediaBody p{
  color:#8d7b8d !important;
  line-height:1.65 !important;
}

.mediaFoot{
  display:flex !important;
  flex-direction:column !important;
  gap:4px !important;
  color:#9a8798 !important;
}

.mediaFoot b{
  color:#e948a2 !important;
}

/* WATCH VIDEO */
.videoBox{
  margin:14px 0 18px !important;
  border-radius:34px !important;
  overflow:hidden !important;
  box-shadow:0 24px 70px rgba(255,79,174,.2) !important;
}

.videoBox video{
  width:100% !important;
  border-radius:34px !important;
  background:#000 !important;
}

/* REACTION / LIKE / UNLIKE / RATING */
.reactionBox{
  padding:26px !important;
}

.reactionBox h3,
.box h3{
  margin:0 0 18px !important;
  color:#2c2332 !important;
  font-size:28px !important;
}

.reactionGrid{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:12px !important;
  margin-bottom:12px !important;
}

.reactionBtn{
  width:100% !important;
  height:62px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:space-between !important;
  background:#fff !important;
  color:#625164 !important;
  border:1.6px solid #efbfd6 !important;
  box-shadow:none !important;
  padding:0 18px !important;
}

.reactionBtn b{
  min-width:32px !important;
  height:32px !important;
  display:grid !important;
  place-items:center !important;
  border-radius:999px !important;
  background:#ffe5f2 !important;
  color:#e948a2 !important;
}

.likeAction.active{
  background:linear-gradient(135deg,#ff3fa4,#ff73c7) !important;
  color:#fff !important;
  border-color:transparent !important;
  box-shadow:0 14px 30px rgba(255,63,164,.24) !important;
}

.likeAction.active b{
  background:#fff !important;
  color:#ff3fa4 !important;
}

.unlikeAction.active{
  background:linear-gradient(135deg,#7c3aed,#a855f7) !important;
  color:#fff !important;
  border-color:transparent !important;
  box-shadow:0 14px 30px rgba(124,58,237,.24) !important;
}

.unlikeAction.active b{
  background:#fff !important;
  color:#7c3aed !important;
}

.ratingBox{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:12px !important;
}

.ratingBox select,
.ratingBox button{
  height:62px !important;
  width:100% !important;
}

/* COMMENT */
.comment{
  background:#fff7fc !important;
  border:1.5px solid #f1c8dc !important;
  border-radius:24px !important;
  padding:18px !important;
  margin-top:16px !important;
}

.comment b{
  color:#e948a2 !important;
  font-size:19px !important;
}

.reply{
  margin:16px 0 0 10px !important;
  padding:18px !important;
  background:#fff !important;
  border-left:6px solid #ff3fa4 !important;
  border-radius:22px !important;
}

.reply .badge{
  margin-bottom:10px !important;
}

/* ADMIN / OWNER FORM */
.panel,.formgrid{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:14px !important;
}

.formgrid button.full{
  height:60px !important;
  margin-top:8px !important;
}

/* TABLE TO BEAUTIFUL CARDS */
.table,
.table tbody,
.table tr,
.table td{
  display:block !important;
  width:100% !important;
}

.table thead{
  display:none !important;
}

.table tr{
  background:#fff !important;
  border:1.5px solid #f1c8dc !important;
  border-radius:28px !important;
  padding:18px !important;
  margin-bottom:18px !important;
  box-shadow:0 20px 55px rgba(255,79,174,.13) !important;
}

.table td{
  border:0 !important;
  padding:8px 0 !important;
}

.table td:first-child{
  color:#e948a2 !important;
  font-size:24px !important;
  font-weight:1000 !important;
}

.table td:nth-child(3) form.row{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:12px !important;
}

.table td:nth-child(3) .row{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:10px !important;
}

.table td input,
.table td select,
.table td button,
.table td .btn{
  width:100% !important;
  min-height:54px !important;
}

/* OWNER ACCOUNT */
.accountCard{
  border-radius:30px !important;
}

.accountCard h3{
  color:#e948a2 !important;
  font-size:26px !important;
}

/* EMPTY STATE */
.emptyState{
  display:flex !important;
  align-items:center !important;
  gap:14px !important;
  padding:24px !important;
}

.emptyIcon{
  width:62px !important;
  height:62px !important;
  border-radius:22px !important;
  background:linear-gradient(135deg,#ff3fa4,#ff73c7) !important;
}

/* LOGIN */
.simpleLoginCard{
  border-radius:38px !important;
  background:#fff !important;
  box-shadow:0 30px 90px rgba(255,79,174,.22) !important;
}

.simpleLoginCard h2{
  color:#e948a2 !important;
}

@media(max-width:760px){
  .wrap{
    padding:10px !important;
  }

  .top{
    padding:12px !important;
    border-radius:26px !important;
  }

  .logo{
    width:60px !important;
    height:60px !important;
    border-radius:20px !important;
    font-size:24px !important;
  }

  .brand h1{
    font-size:27px !important;
  }

  .brand p{
    font-size:13px !important;
  }

  .hero,.box{
    padding:22px !important;
    border-radius:30px !important;
  }

  .hero h2,.box h2{
    font-size:28px !important;
  }

  .reactionGrid,
  .ratingBox{
    grid-template-columns:1fr 1fr !important;
  }

  .mediaBody h3{
    font-size:28px !important;
  }
}


/* ===== USER GRID 2 KOLOM ===== */
.grid{
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:14px !important;
  align-items:start !important;
}

.mediaCard{
  margin:0 !important;
  height:100% !important;
  border-radius:26px !important;
  overflow:hidden !important;
}

.mediaThumb{
  aspect-ratio:1/1 !important;
  border-radius:0 !important;
}

.mediaPlay{
  width:58px !important;
  height:58px !important;
  font-size:22px !important;
}

.mediaThumb:after{
  right:10px !important;
  bottom:10px !important;
  font-size:11px !important;
  padding:7px 10px !important;
}

.cornerBadge{
  top:10px !important;
  left:10px !important;
  padding:6px 10px !important;
  font-size:11px !important;
}

.mediaBody{
  padding:14px !important;
}

.mediaBody h3{
  font-size:20px !important;
  line-height:1.2 !important;
  margin:0 0 10px !important;
  display:-webkit-box !important;
  -webkit-line-clamp:2 !important;
  -webkit-box-orient:vertical !important;
  overflow:hidden !important;
}

.mediaStats{
  gap:8px !important;
  margin-bottom:10px !important;
}

.mediaStats span{
  padding:7px 10px !important;
  font-size:12px !important;
}

.mediaBody p{
  font-size:14px !important;
  line-height:1.45 !important;
  margin:0 0 12px !important;
  display:-webkit-box !important;
  -webkit-line-clamp:2 !important;
  -webkit-box-orient:vertical !important;
  overflow:hidden !important;
}

.mediaFoot{
  font-size:12px !important;
  gap:3px !important;
}

@media(max-width:420px){
  .grid{
    grid-template-columns:repeat(2,minmax(0,1fr)) !important;
    gap:12px !important;
  }
  .mediaBody h3{
    font-size:18px !important;
  }
}


/* ===== GAS 2: GALLERY + WATCH POLISH ===== */

/* Gallery 2 kolom yang lebih enak dilihat */
.grid{
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:12px !important;
  align-items:stretch !important;
}

.mediaCard{
  border-radius:26px !important;
  overflow:hidden !important;
  margin:0 !important;
  height:100% !important;
  background:#fff !important;
}

.mediaThumb{
  aspect-ratio:1/1 !important;
  border-radius:0 !important;
}

.mediaThumb img{
  object-fit:cover !important;
}

.mediaPlay{
  width:54px !important;
  height:54px !important;
  font-size:20px !important;
}

.mediaThumb:after{
  content:"Buka" !important;
  right:9px !important;
  bottom:9px !important;
  font-size:10px !important;
  padding:6px 10px !important;
}

.cornerBadge{
  top:9px !important;
  left:9px !important;
  padding:6px 10px !important;
  font-size:10px !important;
}

.mediaBody{
  padding:13px !important;
  text-align:center !important;
}

.mediaBody h3{
  font-size:18px !important;
  line-height:1.2 !important;
  margin:0 0 9px !important;
  text-align:center !important;
  display:-webkit-box !important;
  -webkit-line-clamp:2 !important;
  -webkit-box-orient:vertical !important;
  overflow:hidden !important;
}

.mediaStats{
  justify-content:center !important;
  gap:6px !important;
  margin:0 0 10px !important;
}

.mediaStats span{
  padding:6px 8px !important;
  font-size:11px !important;
}

.mediaBody p{
  font-size:13px !important;
  line-height:1.4 !important;
  margin:0 0 10px !important;
  text-align:center !important;
  display:-webkit-box !important;
  -webkit-line-clamp:2 !important;
  -webkit-box-orient:vertical !important;
  overflow:hidden !important;
}

.mediaFoot{
  align-items:center !important;
  text-align:center !important;
  font-size:11px !important;
}

.mediaFoot span{
  display:none !important;
}

.mediaFoot b{
  font-size:13px !important;
  color:#e948a2 !important;
}

/* Header home lebih ringkas */
.hero{
  margin-bottom:14px !important;
}

.searchCard{
  margin-top:14px !important;
}

/* Watch page polish */
.videoBox{
  border-radius:30px !important;
  margin-top:10px !important;
  margin-bottom:16px !important;
  background:#000 !important;
}

.videoBox video{
  border-radius:30px !important;
  max-height:70vh !important;
}

/* Tombol back di halaman watch */
a.btn.ghost[href="/"]{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:46px !important;
  padding:0 18px !important;
  margin-bottom:10px !important;
  background:#fff !important;
  color:#e948a2 !important;
  border:1.5px solid #efbfd6 !important;
}

/* Aksi user lebih rapi */
.reactionBox{
  padding:24px !important;
}

.reactionBox h3{
  text-align:left !important;
  margin-bottom:16px !important;
}

.reactionGrid{
  grid-template-columns:1fr 1fr !important;
  gap:12px !important;
}

.reactionBtn{
  height:60px !important;
  border-radius:24px !important;
}

.ratingBox{
  grid-template-columns:1fr 1fr !important;
  gap:12px !important;
}

.ratingBox select,
.ratingBox button{
  height:60px !important;
  border-radius:24px !important;
}

/* Komentar lebih premium */
.box h3{
  font-size:27px !important;
  margin-bottom:18px !important;
}

form[action*="/comment/"]{
  display:grid !important;
  gap:12px !important;
}

form[action*="/comment/"] input{
  height:58px !important;
}

form[action*="/comment/"] button{
  height:60px !important;
  margin-top:8px !important;
}

.comment{
  margin-top:16px !important;
  border-radius:24px !important;
  background:linear-gradient(180deg,#fff,#fff8fc) !important;
}

.comment b{
  display:block !important;
  margin-bottom:8px !important;
}

.reply{
  margin-left:0 !important;
  margin-top:14px !important;
  border-radius:22px !important;
  background:#fff !important;
  box-shadow:0 12px 30px rgba(255,79,174,.10) !important;
}

/* Admin / owner / moderator cards tetap full */
body:has(form[action="/panel/upload"]) .grid,
body:has(form[action="/owner/accounts/create"]) .grid{
  grid-template-columns:1fr !important;
}

/* Mobile kecil */
@media(max-width:380px){
  .grid{
    gap:10px !important;
  }
  .mediaBody{
    padding:11px !important;
  }
  .mediaBody h3{
    font-size:16px !important;
  }
  .mediaStats span{
    font-size:10px !important;
    padding:5px 7px !important;
  }
}

/* HP normal tetap 2 kolom */
@media(max-width:760px){
  .grid{
    grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  }

  .categoryTabs{
    grid-template-columns:repeat(2,1fr) !important;
  }

  .reactionGrid,
  .ratingBox{
    grid-template-columns:1fr 1fr !important;
  }

  .videoBox,
  .videoBox video{
    border-radius:28px !important;
  }
}


/* ===== WATCH PAGE SUPER POLISH + COMMENT COUNT ===== */
.watchTopCard,
.box.watchTopCard{
  border-radius:34px !important;
  background:linear-gradient(180deg,#fff,#fff8fc) !important;
  box-shadow:0 18px 45px rgba(255,79,174,.12) !important;
}

.videoBox{
  border-radius:32px !important;
  overflow:hidden !important;
  background:#000 !important;
  box-shadow:0 18px 45px rgba(0,0,0,.18) !important;
  margin:18px 0 18px !important;
}

.videoBox video{
  border-radius:32px !important;
  background:#000 !important;
}

.reactionBox{
  border-radius:30px !important;
  box-shadow:0 18px 45px rgba(255,79,174,.10) !important;
}

.reactionGrid{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:14px !important;
}

.reactionBtn,
.ratingBox button,
.ratingBox select{
  min-height:62px !important;
  border-radius:24px !important;
  font-size:17px !important;
  font-weight:800 !important;
}

.ratingBox{
  display:grid !important;
  grid-template-columns:1fr 1fr !important;
  gap:14px !important;
}

.commentSummary{
  display:flex !important;
  gap:10px !important;
  flex-wrap:wrap !important;
  margin:-6px 0 18px !important;
}

.commentPill{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:40px !important;
  padding:0 14px !important;
  border-radius:999px !important;
  font-size:14px !important;
  font-weight:800 !important;
  background:#fff !important;
  border:1.5px solid #efbfd6 !important;
  color:#cb4a98 !important;
  box-shadow:0 10px 24px rgba(255,79,174,.08) !important;
}

.commentPill.reply{
  background:linear-gradient(135deg,#f3f8ff,#fff) !important;
  color:#6a54f7 !important;
  border-color:#d8ddff !important;
}

.commentPill.total{
  background:linear-gradient(135deg,#ff49aa,#ff77cb) !important;
  color:#fff !important;
  border-color:transparent !important;
}

.box h3{
  letter-spacing:-0.02em !important;
}

.comment{
  border-radius:28px !important;
  padding:26px !important;
  background:linear-gradient(180deg,#fff,#fff9fc) !important;
  border:1.5px solid #f2ccde !important;
  box-shadow:0 12px 30px rgba(255,79,174,.08) !important;
}

.comment b{
  display:block !important;
  font-size:20px !important;
  color:#d94c9c !important;
  margin-bottom:10px !important;
}

.comment p{
  font-size:18px !important;
  line-height:1.65 !important;
  color:#4a3e49 !important;
}

.reply{
  margin-top:16px !important;
  margin-left:0 !important;
  padding:22px !important;
  border-radius:24px !important;
  background:linear-gradient(180deg,#fff,#fbfbff) !important;
  border-left:6px solid #ff4fae !important;
  box-shadow:0 12px 30px rgba(110,88,255,.10) !important;
}

.reply .badge,
.replyBadge,
.moderatorBadge{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:40px !important;
  padding:0 16px !important;
  border-radius:999px !important;
  background:linear-gradient(135deg,#34b9ff,#6d4dff) !important;
  color:#fff !important;
  font-size:13px !important;
  font-weight:900 !important;
  margin-bottom:12px !important;
}

.reply h4,
.reply strong{
  display:block !important;
  font-size:19px !important;
  color:#d94c9c !important;
  margin:0 0 10px !important;
}

.reply p{
  margin:0 !important;
  font-size:17px !important;
  line-height:1.6 !important;
  color:#453949 !important;
}

.box input,
.box textarea,
.box select{
  border-radius:22px !important;
}

.box button[type="submit"],
.btn.primary{
  border-radius:24px !important;
}

.watchMetaRow{
  display:flex !important;
  gap:10px !important;
  flex-wrap:wrap !important;
  margin-top:10px !important;
}

.watchMetaChip{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  min-height:40px !important;
  padding:0 14px !important;
  border-radius:999px !important;
  background:#ffeaf5 !important;
  color:#8a5170 !important;
  font-size:14px !important;
  font-weight:800 !important;
}

.watchMetaChip.vip{
  background:linear-gradient(135deg,#ffbf1f,#ffd95f) !important;
  color:#5b3a00 !important;
}

.watchMetaChip.good{
  background:linear-gradient(135deg,#ff49aa,#ff77cb) !important;
  color:#fff !important;
}

@media(max-width:760px){
  .reactionGrid,
  .ratingBox{
    grid-template-columns:1fr 1fr !important;
    gap:12px !important;
  }

  .reactionBtn,
  .ratingBox button,
  .ratingBox select{
    min-height:58px !important;
    font-size:16px !important;
  }

  .comment{
    padding:22px !important;
  }

  .comment b{
    font-size:18px !important;
  }

  .comment p,
  .reply p{
    font-size:16px !important;
  }
}


/* ===== FINAL FIX: KATEGORI 1 BARIS + THUMBNAIL LEBIH KECIL ===== */
.categoryTabs{
  display:flex !important;
  flex-wrap:nowrap !important;
  overflow-x:auto !important;
  gap:10px !important;
  margin-top:14px !important;
  padding:2px 2px 8px !important;
  scrollbar-width:none !important;
}
.categoryTabs::-webkit-scrollbar{
  display:none !important;
}
.categoryTabs .pill{
  flex:0 0 auto !important;
  min-width:118px !important;
  height:54px !important;
  padding:0 18px !important;
  border-radius:18px !important;
  white-space:nowrap !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  font-size:15px !important;
  font-weight:900 !important;
}
.categoryTabs .pill.exp{
  min-width:128px !important;
}

/* grid konten jadi 2 kolom */
.galleryGrid,
.galleryList,
.contentGrid,
.mediaGrid,
.cardGrid,
.itemsGrid,
.listGrid{
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:14px !important;
  align-items:start !important;
}

/* card konten */
.galleryCard,
.mediaCard,
.contentCard,
.thumbCard,
.itemCard,
.postCard,
.videoCard{
  width:100% !important;
  min-width:0 !important;
  border-radius:24px !important;
  overflow:hidden !important;
  box-shadow:0 12px 28px rgba(255,79,174,.10) !important;
}

/* thumbnail / preview jangan terlalu besar */
.galleryCard img,
.galleryCard video,
.mediaCard img,
.mediaCard video,
.contentCard img,
.contentCard video,
.thumbCard img,
.thumbCard video,
.itemCard img,
.itemCard video,
.postCard img,
.postCard video,
.videoCard img,
.videoCard video,
.thumbWrap img,
.thumbWrap video,
.thumbBox img,
.thumbBox video,
.previewWrap img,
.previewWrap video{
  width:100% !important;
  height:165px !important;
  object-fit:cover !important;
  display:block !important;
  border-radius:18px !important;
  background:#111 !important;
}

/* body card */
.galleryCard .body,
.mediaCard .body,
.contentCard .body,
.thumbCard .body,
.itemCard .body,
.postCard .body,
.videoCard .body{
  padding:14px !important;
}

.galleryCard h3,
.mediaCard h3,
.contentCard h3,
.thumbCard h3,
.itemCard h3,
.postCard h3,
.videoCard h3{
  font-size:16px !important;
  line-height:1.35 !important;
  margin:0 0 8px !important;
}

/* statistik kecil rapi */
.galleryCard .stats,
.mediaCard .stats,
.contentCard .stats,
.thumbCard .stats,
.itemCard .stats,
.postCard .stats,
.videoCard .stats{
  display:flex !important;
  flex-wrap:wrap !important;
  gap:8px !important;
  margin-top:8px !important;
}

.galleryCard .stats span,
.mediaCard .stats span,
.contentCard .stats span,
.thumbCard .stats span,
.itemCard .stats span,
.postCard .stats span,
.videoCard .stats span{
  font-size:13px !important;
  padding:7px 10px !important;
  border-radius:999px !important;
}

/* tombol buka */
.galleryCard .openBtn,
.mediaCard .openBtn,
.contentCard .openBtn,
.thumbCard .openBtn,
.itemCard .openBtn,
.postCard .openBtn,
.videoCard .openBtn,
.galleryCard a[href^="/watch/"],
.mediaCard a[href^="/watch/"],
.contentCard a[href^="/watch/"],
.thumbCard a[href^="/watch/"],
.itemCard a[href^="/watch/"],
.postCard a[href^="/watch/"],
.videoCard a[href^="/watch/"]{
  max-width:100% !important;
}

/* mobile */
@media (max-width:640px){
  .categoryTabs .pill{
    min-width:112px !important;
    height:52px !important;
    font-size:15px !important;
  }

  .galleryCard img,
  .galleryCard video,
  .mediaCard img,
  .mediaCard video,
  .contentCard img,
  .contentCard video,
  .thumbCard img,
  .thumbCard video,
  .itemCard img,
  .itemCard video,
  .postCard img,
  .postCard video,
  .videoCard img,
  .videoCard video,
  .thumbWrap img,
  .thumbWrap video,
  .thumbBox img,
  .thumbBox video,
  .previewWrap img,
  .previewWrap video{
    height:150px !important;
  }
}

/* === WATCH VIDEO SIZE FIX START === */

/* === WATCH VIDEO SIZE FIX START === */
.watchVideo{
  display:block !important;
  width:100% !important;
  height:auto !important;
  max-width:100% !important;
  max-height:48vh !important;
  object-fit:contain !important;
  background:#000 !important;
  border-radius:28px !important;
  margin:0 auto !important;
  box-shadow:0 12px 28px rgba(0,0,0,.18) !important;
}

@media (max-width: 640px){
  .watchVideo{
    max-height:38vh !important;
    border-radius:24px !important;
  }
}

/* === WATCH VIDEO SIZE FIX END === */


/* =====================================================
   JAKSKY PRO THEME - SAME AS REFERENCE
   ===================================================== */

body{
  margin:0!important;
  min-height:100vh!important;
  color:#222!important;
  background:linear-gradient(180deg,#ffc3df 0%,#ffd4e8 45%,#ffe6f2 100%)!important;
  font-family:Inter,system-ui,Arial,sans-serif!important;
}

.wrap{
  max-width:980px!important;
  padding:20px!important;
  margin:0 auto!important;
}

/* header */
.proTopbar{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:14px!important;
  background:rgba(255,255,255,.85)!important;
  border:1px solid rgba(255,255,255,.7)!important;
  border-radius:30px!important;
  padding:20px!important;
  margin:0 0 22px!important;
  box-shadow:0 18px 45px rgba(255,55,150,.16)!important;
}

.proBrand{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:12px!important;
  text-decoration:none!important;
  color:#222!important;
  width:100%!important;
}

.proLogo{
  width:56px!important;
  height:56px!important;
  border-radius:22px!important;
  display:grid!important;
  place-items:center!important;
  font-size:42px!important;
  color:#9333ea!important;
  background:transparent!important;
}

.proBrand h1{
  margin:0!important;
  font-size:40px!important;
  line-height:1!important;
  font-weight:1000!important;
  color:#8b3bea!important;
  letter-spacing:-1px!important;
}

.proBrand p{
  margin:8px 0 0!important;
  font-size:14px!important;
  font-weight:900!important;
  color:#7b2f62!important;
}

.logoutBtn{
  min-width:108px!important;
  min-height:54px!important;
  border-radius:999px!important;
  background:linear-gradient(135deg,#ef4444,#f85e5e)!important;
  color:white!important;
  border:0!important;
  font-weight:1000!important;
}

/* universal card */
.hero,.box,.card,.mediaCard,.emptyState{
  background:rgba(255,255,255,.94)!important;
  border:1px solid rgba(255,255,255,.8)!important;
  border-radius:32px!important;
  box-shadow:0 22px 55px rgba(255,60,160,.14)!important;
}

.hero,.box{
  padding:28px!important;
  margin-bottom:22px!important;
}

.hero h2,.box h2{
  color:#f03c9f!important;
  font-size:34px!important;
  line-height:1.15!important;
  margin:0 0 16px!important;
  letter-spacing:-.5px!important;
}

.mut{
  color:#6f606b!important;
  line-height:1.7!important;
  font-size:16px!important;
}

/* search */
.searchCard{
  margin-top:20px!important;
  background:rgba(255,255,255,.85)!important;
  border:3px solid #f052a7!important;
  border-radius:22px!important;
  padding:0!important;
  box-shadow:none!important;
}

.searchTitle{
  display:none!important;
}

.searchRow{
  display:block!important;
  margin:0!important;
}

.searchRow input{
  height:62px!important;
  border:0!important;
  border-radius:20px!important;
  background:#fff!important;
  padding:0 22px!important;
  font-size:18px!important;
  color:#333!important;
  box-shadow:none!important;
}

.searchRow button{
  display:none!important;
}

/* tabs 1 baris */
.categoryTabs{
  display:flex!important;
  gap:10px!important;
  flex-wrap:nowrap!important;
  overflow-x:auto!important;
  padding:16px 0 4px!important;
  margin-top:0!important;
  scrollbar-width:none!important;
}

.categoryTabs::-webkit-scrollbar{
  display:none!important;
}

.categoryTabs .pill{
  flex:0 0 auto!important;
  min-width:104px!important;
  height:50px!important;
  padding:0 18px!important;
  border-radius:999px!important;
  border:0!important;
  background:linear-gradient(135deg,#ff77bf,#ff9bd2)!important;
  color:white!important;
  font-size:16px!important;
  font-weight:1000!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  box-shadow:0 12px 25px rgba(255,65,160,.2)!important;
}

.categoryTabs .pill.active{
  background:linear-gradient(135deg,#12a8f5,#2b9fe8)!important;
  color:white!important;
  position:relative!important;
}

.categoryTabs .pill.active::after{
  content:""!important;
  position:absolute!important;
  left:50%!important;
  bottom:-9px!important;
  transform:translateX(-50%)!important;
  width:42px!important;
  height:5px!important;
  border-radius:99px!important;
  background:#22a7f2!important;
}

.categoryTabs .pill.vip.active{
  background:linear-gradient(135deg,#ff77bf,#ff9bd2)!important;
}

.categoryTabs .pill.exp.active{
  background:linear-gradient(135deg,#ff77bf,#ff9bd2)!important;
}

.categoryTabs .pill:last-child{
  grid-column:auto!important;
}

/* empty */
.emptyState{
  min-height:260px!important;
  display:grid!important;
  place-items:center!important;
  text-align:center!important;
  color:#f03c9f!important;
  font-size:22px!important;
  font-weight:1000!important;
}

.emptyState .emptyIcon,
.emptyState p{
  display:none!important;
}

/* media cards */
.grid{
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:14px!important;
  align-items:start!important;
}

.mediaCard{
  overflow:hidden!important;
  border-radius:24px!important;
  margin:0!important;
}

.mediaThumb{
  aspect-ratio:1/1!important;
  display:block!important;
  position:relative!important;
  overflow:hidden!important;
  background:#111!important;
}

.mediaThumb img{
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  display:block!important;
}

.mediaPlay{
  width:58px!important;
  height:58px!important;
  border-radius:50%!important;
  display:grid!important;
  place-items:center!important;
  background:rgba(255,255,255,.92)!important;
  color:#ff3fa4!important;
  font-size:22px!important;
  box-shadow:0 16px 35px rgba(0,0,0,.22)!important;
}

.mediaBody{
  padding:14px!important;
  text-align:center!important;
}

.mediaBody h3{
  margin:0 0 10px!important;
  font-size:18px!important;
  line-height:1.25!important;
  color:#222!important;
  text-align:center!important;
}

.mediaStats{
  display:flex!important;
  justify-content:center!important;
  gap:7px!important;
  flex-wrap:wrap!important;
  margin-bottom:10px!important;
}

.mediaStats span{
  padding:7px 9px!important;
  border-radius:999px!important;
  background:#ffe6f4!important;
  color:#ad3c80!important;
  font-size:12px!important;
  font-weight:1000!important;
}

.mediaBody p{
  font-size:13px!important;
  color:#7c6c78!important;
  margin:0 0 10px!important;
  line-height:1.4!important;
}

.mediaFoot{
  text-align:center!important;
  display:block!important;
  color:#f03c9f!important;
  font-size:13px!important;
}

.mediaFoot span{
  display:none!important;
}

.cornerBadge{
  position:absolute!important;
  top:10px!important;
  left:10px!important;
  border-radius:999px!important;
  background:#ffd23f!important;
  color:#422800!important;
  padding:7px 12px!important;
  font-weight:1000!important;
  font-size:12px!important;
}

/* popup 18+ */
.ageOverlay{
  position:fixed!important;
  inset:0!important;
  display:none!important;
  align-items:center!important;
  justify-content:center!important;
  padding:18px!important;
  background:rgba(0,0,0,.62)!important;
  backdrop-filter:blur(8px)!important;
  z-index:9999!important;
}

.ageOverlay.show{
  display:flex!important;
}

.proAgeCard{
  width:min(500px,100%)!important;
  background:white!important;
  border:3px solid #f052a7!important;
  border-radius:28px!important;
  padding:28px 24px!important;
  text-align:center!important;
  position:relative!important;
  box-shadow:0 35px 80px rgba(0,0,0,.25)!important;
}

.ageClose{
  position:absolute!important;
  top:14px!important;
  right:14px!important;
  width:42px!important;
  height:42px!important;
  border-radius:50%!important;
  background:transparent!important;
  color:#999!important;
  box-shadow:none!important;
  font-size:34px!important;
  line-height:1!important;
  padding:0!important;
}

.animeAvatar{
  width:110px!important;
  height:110px!important;
  border-radius:50%!important;
  margin:0 auto 18px!important;
  display:grid!important;
  place-items:center!important;
  background:#ffe6f4!important;
  box-shadow:0 0 35px rgba(255,60,160,.25)!important;
  font-size:54px!important;
}

.warningIcon{
  font-size:50px!important;
  margin-bottom:10px!important;
}

.proAgeCard h2{
  margin:0 0 14px!important;
  color:#f03c9f!important;
  font-size:30px!important;
}

.proAgeCard p{
  color:#555!important;
  line-height:1.55!important;
  font-size:15px!important;
}

.dangerNote{
  background:#ffe4f1!important;
  color:#cb126d!important;
  padding:15px!important;
  border-radius:18px!important;
  font-weight:1000!important;
  margin:18px 0!important;
}

.enterBtn{
  width:100%!important;
  min-height:52px!important;
  background:linear-gradient(135deg,#ff198b,#ff3fa4)!important;
  color:white!important;
  border-radius:999px!important;
  margin-top:10px!important;
}

.exitBtn{
  display:flex!important;
  width:100%!important;
  min-height:48px!important;
  border-radius:999px!important;
  align-items:center!important;
  justify-content:center!important;
  margin-top:10px!important;
  background:#e5e7eb!important;
  color:#333!important;
  font-weight:1000!important;
}

/* admin owner moderator */
input,textarea,select{
  border:1.5px solid #f1b7d5!important;
  border-radius:18px!important;
  padding:15px 18px!important;
  font-size:16px!important;
  background:white!important;
  color:#222!important;
}

button,.btn,input[type=submit]{
  border-radius:999px!important;
  background:linear-gradient(135deg,#ff2f9b,#ff69c0)!important;
  color:white!important;
  font-weight:1000!important;
  box-shadow:0 14px 30px rgba(255,63,164,.23)!important;
}

.panel,.formgrid{
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:14px!important;
}

.table,
.table tbody,
.table tr,
.table td{
  display:block!important;
  width:100%!important;
}

.table thead{
  display:none!important;
}

.table tr{
  background:#fff7fc!important;
  border:1px solid #f4c6dc!important;
  border-radius:22px!important;
  padding:16px!important;
  margin-bottom:14px!important;
}

.table td{
  border:0!important;
  padding:8px 0!important;
}

@media(max-width:640px){
  .wrap{
    padding:14px!important;
  }

  .proTopbar{
    padding:18px!important;
  }

  .proBrand h1{
    font-size:34px!important;
  }

  .proBrand{
    justify-content:center!important;
  }

  .hero h2,.box h2{
    font-size:30px!important;
  }

  .categoryTabs .pill{
    min-width:98px!important;
    height:48px!important;
    font-size:15px!important;
  }

  .grid{
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
  }
}


/* =====================================================
   JAKSKY REFERENCE UI FINAL
   ===================================================== */

body{
  margin:0!important;
  min-height:100vh!important;
  font-family:Inter,system-ui,Arial,sans-serif!important;
  color:#222!important;
  background:linear-gradient(180deg,#ffc4df 0%,#ffd5e8 46%,#ffe6f2 100%)!important;
}

.wrap{
  max-width:980px!important;
  margin:0 auto!important;
  padding:20px!important;
}

/* HEADER */
.proTopbar{
  background:rgba(255,255,255,.86)!important;
  border-radius:34px!important;
  padding:28px 20px!important;
  margin:0 0 26px!important;
  box-shadow:0 22px 55px rgba(255,60,160,.16)!important;
  border:1px solid rgba(255,255,255,.85)!important;
  text-align:center!important;
}

.proBrand{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:14px!important;
  color:#222!important;
  text-decoration:none!important;
}

.proBolt{
  font-size:58px!important;
  line-height:1!important;
  color:#ffca28!important;
  filter:drop-shadow(0 8px 16px rgba(255,192,0,.25))!important;
}

.proBrand h1{
  margin:0!important;
  font-size:48px!important;
  line-height:1!important;
  font-weight:1000!important;
  color:#7c3aed!important;
  letter-spacing:-1px!important;
}

.proBrand p{
  margin:8px 0 0!important;
  font-size:16px!important;
  font-weight:1000!important;
  color:#6b2457!important;
}

.logoutBtn{
  min-width:104px!important;
  min-height:54px!important;
  border-radius:999px!important;
  background:linear-gradient(135deg,#ef4444,#f87171)!important;
  color:white!important;
  border:0!important;
  font-weight:1000!important;
}

/* CARD UMUM */
.hero,.box,.card,.mediaCard,.emptyState{
  background:rgba(255,255,255,.96)!important;
  border-radius:34px!important;
  border:1px solid rgba(255,255,255,.8)!important;
  box-shadow:0 24px 60px rgba(255,60,160,.14)!important;
}

.hero,.box{
  padding:30px!important;
  margin-bottom:22px!important;
}

.hero h2,.box h2{
  margin:0 0 16px!important;
  color:#222!important;
  font-size:38px!important;
  line-height:1.15!important;
  font-weight:1000!important;
  letter-spacing:-.6px!important;
}

.hero p,.mut{
  color:#55515a!important;
  font-size:17px!important;
  line-height:1.75!important;
}

/* HOME TITLE */
.hero h2{
  color:#222!important;
}

.hero h2::before{
  content:""!important;
}

/* SEARCH */
.searchCard{
  margin-top:22px!important;
  padding:0!important;
  background:transparent!important;
  border:0!important;
  box-shadow:none!important;
}

.searchTitle{
  display:none!important;
}

.searchRow{
  display:block!important;
  margin:0!important;
}

.searchRow input{
  width:100%!important;
  height:66px!important;
  border:2px solid #ff8fca!important;
  border-radius:22px!important;
  background:#fff!important;
  padding:0 22px!important;
  font-size:18px!important;
  font-weight:800!important;
  color:#333!important;
  box-shadow:0 12px 28px rgba(255,60,160,.10)!important;
}

.searchRow input::placeholder{
  color:#777!important;
}

.searchRow button{
  display:none!important;
}

/* KATEGORI 1 BARIS */
.categoryTabs{
  display:flex!important;
  flex-wrap:nowrap!important;
  overflow-x:auto!important;
  gap:12px!important;
  padding:18px 2px 10px!important;
  margin:0!important;
  scrollbar-width:none!important;
}

.categoryTabs::-webkit-scrollbar{
  display:none!important;
}

.categoryTabs .pill{
  flex:0 0 auto!important;
  min-width:102px!important;
  height:52px!important;
  padding:0 18px!important;
  border:0!important;
  border-radius:999px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  color:#fff!important;
  font-size:16px!important;
  font-weight:1000!important;
  background:linear-gradient(135deg,#ff73bd,#ff9bd2)!important;
  box-shadow:0 14px 28px rgba(255,70,170,.22)!important;
}

.categoryTabs .pill.active{
  background:linear-gradient(135deg,#0ea5e9,#38bdf8)!important;
  position:relative!important;
}

.categoryTabs .pill.active::after{
  content:""!important;
  position:absolute!important;
  bottom:-9px!important;
  left:50%!important;
  transform:translateX(-50%)!important;
  width:42px!important;
  height:5px!important;
  border-radius:999px!important;
  background:#38bdf8!important;
}

.categoryTabs .pill.vip.active,
.categoryTabs .pill.exp.active{
  background:linear-gradient(135deg,#0ea5e9,#38bdf8)!important;
  color:white!important;
}

/* EMPTY STATE */
.emptyState{
  min-height:300px!important;
  display:grid!important;
  place-items:center!important;
  text-align:center!important;
  color:#f03c9f!important;
  font-size:24px!important;
  font-weight:1000!important;
  padding:30px!important;
}

.emptyState .emptyIcon{
  width:92px!important;
  height:92px!important;
  border-radius:26px!important;
  background:#ffe1f0!important;
  color:#f03c9f!important;
  display:grid!important;
  place-items:center!important;
  font-size:42px!important;
  margin-bottom:14px!important;
}

.emptyState h3{
  color:#f03c9f!important;
  font-size:26px!important;
  margin:0 0 8px!important;
}

.emptyState p{
  color:#666!important;
  font-size:16px!important;
  margin:0!important;
}

/* GALLERY */
.grid{
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:14px!important;
  align-items:start!important;
}

.mediaCard{
  border-radius:24px!important;
  overflow:hidden!important;
  margin:0!important;
}

.mediaThumb{
  aspect-ratio:1/1!important;
  position:relative!important;
  display:block!important;
  overflow:hidden!important;
  background:#111!important;
}

.mediaThumb img{
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  display:block!important;
}

.mediaPlay{
  width:58px!important;
  height:58px!important;
  border-radius:50%!important;
  display:grid!important;
  place-items:center!important;
  background:rgba(255,255,255,.95)!important;
  color:#ff3fa4!important;
  font-size:22px!important;
  box-shadow:0 16px 35px rgba(0,0,0,.22)!important;
}

.mediaThumb:after{
  content:"Buka"!important;
  position:absolute!important;
  right:10px!important;
  bottom:10px!important;
  padding:8px 12px!important;
  border-radius:999px!important;
  background:#fff!important;
  color:#f03c9f!important;
  font-weight:1000!important;
  font-size:12px!important;
}

.mediaBody{
  padding:15px!important;
  text-align:center!important;
}

.mediaBody h3{
  margin:0 0 10px!important;
  color:#222!important;
  font-size:20px!important;
  line-height:1.25!important;
  text-align:center!important;
}

.mediaStats{
  display:flex!important;
  justify-content:center!important;
  gap:7px!important;
  flex-wrap:wrap!important;
  margin:0 0 10px!important;
}

.mediaStats span{
  padding:7px 10px!important;
  border-radius:999px!important;
  background:#ffe6f4!important;
  color:#ad3c80!important;
  font-size:12px!important;
  font-weight:1000!important;
}

.mediaBody p{
  margin:0 0 10px!important;
  color:#777!important;
  font-size:13px!important;
  line-height:1.45!important;
}

.mediaFoot{
  display:block!important;
  text-align:center!important;
  color:#f03c9f!important;
  font-weight:1000!important;
  font-size:13px!important;
}

.mediaFoot span{
  display:none!important;
}

.cornerBadge{
  position:absolute!important;
  top:10px!important;
  left:10px!important;
  padding:7px 12px!important;
  border-radius:999px!important;
  background:#ffd23f!important;
  color:#422800!important;
  font-size:12px!important;
  font-weight:1000!important;
}

/* POPUP 18+ */
.ageOverlay{
  position:fixed!important;
  inset:0!important;
  display:none!important;
  align-items:center!important;
  justify-content:center!important;
  padding:18px!important;
  z-index:9999!important;
  background:rgba(0,0,0,.62)!important;
  backdrop-filter:blur(8px)!important;
}

.ageOverlay.show{
  display:flex!important;
}

.newAgeCard{
  width:min(500px,100%)!important;
  background:#fff!important;
  border:3px solid #f052a7!important;
  border-radius:28px!important;
  padding:28px 24px!important;
  text-align:center!important;
  position:relative!important;
  box-shadow:0 35px 90px rgba(0,0,0,.28)!important;
}

.ageClose{
  position:absolute!important;
  top:14px!important;
  right:14px!important;
  width:42px!important;
  height:42px!important;
  border:0!important;
  background:transparent!important;
  color:#999!important;
  box-shadow:none!important;
  font-size:34px!important;
  padding:0!important;
}

.ageAvatar{
  width:110px!important;
  height:110px!important;
  margin:0 auto 16px!important;
  border-radius:50%!important;
  display:grid!important;
  place-items:center!important;
  background:#ffe5f2!important;
  font-size:54px!important;
  box-shadow:0 0 35px rgba(255,60,160,.25)!important;
}

.ageWarnIcon{
  font-size:48px!important;
  margin-bottom:10px!important;
}

.newAgeCard h2{
  margin:0 0 14px!important;
  color:#f03c9f!important;
  font-size:30px!important;
}

.newAgeCard p{
  color:#555!important;
  font-size:15px!important;
  line-height:1.6!important;
}

.ageNotice{
  margin:18px 0!important;
  padding:15px!important;
  border-radius:18px!important;
  background:#ffe4f1!important;
  color:#cb126d!important;
  font-weight:1000!important;
}

.ageEnter{
  width:100%!important;
  min-height:52px!important;
  border-radius:999px!important;
  background:linear-gradient(135deg,#ff198b,#ff3fa4)!important;
  color:white!important;
  border:0!important;
}

.ageExit{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  width:100%!important;
  min-height:48px!important;
  border-radius:999px!important;
  background:#e5e7eb!important;
  color:#333!important;
  font-weight:1000!important;
  margin-top:10px!important;
}

/* ADMIN OWNER MOD */
input,textarea,select{
  border:1.5px solid #f1b7d5!important;
  border-radius:18px!important;
  padding:15px 18px!important;
  font-size:16px!important;
  background:#fff!important;
  color:#222!important;
}

button,.btn,input[type=submit]{
  border-radius:999px!important;
  border:0!important;
  background:linear-gradient(135deg,#ff2f9b,#ff69c0)!important;
  color:white!important;
  font-weight:1000!important;
  box-shadow:0 14px 30px rgba(255,63,164,.23)!important;
}

.panel,.formgrid{
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:14px!important;
}

.table,
.table tbody,
.table tr,
.table td{
  display:block!important;
  width:100%!important;
}

.table thead{
  display:none!important;
}

.table tr{
  background:#fff7fc!important;
  border:1px solid #f4c6dc!important;
  border-radius:22px!important;
  padding:16px!important;
  margin-bottom:14px!important;
}

.table td{
  border:0!important;
  padding:8px 0!important;
}

@media(max-width:640px){
  .wrap{
    padding:14px!important;
  }

  .proTopbar{
    padding:24px 16px!important;
    border-radius:30px!important;
  }

  .proBolt{
    font-size:46px!important;
  }

  .proBrand h1{
    font-size:38px!important;
  }

  .proBrand p{
    font-size:14px!important;
  }

  .hero,.box{
    padding:24px!important;
    border-radius:30px!important;
  }

  .hero h2,.box h2{
    font-size:32px!important;
  }

  .categoryTabs .pill{
    min-width:92px!important;
    height:48px!important;
    font-size:14px!important;
    padding:0 13px!important;
  }

  .grid{
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
  }
}


/* ===== REF 2 HOME FINAL - SAMA KAYA FOTO NOMOR 2 ===== */

/* khusus halaman user/home yang punya search */
body:has(.searchCard) .wrap{
  max-width:980px!important;
  padding:20px!important;
}

/* header atas */
.proTopbar{
  background:rgba(255,255,255,.88)!important;
  border-radius:34px!important;
  padding:26px 20px!important;
  margin:0 0 26px!important;
  text-align:center!important;
  box-shadow:0 22px 55px rgba(255,60,160,.16)!important;
  border:1px solid rgba(255,255,255,.8)!important;
}

.proBrand{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:14px!important;
  width:100%!important;
}

.proBolt{
  font-size:56px!important;
  line-height:1!important;
  color:#ffca28!important;
}

.proBrand h1{
  margin:0!important;
  color:#7c3aed!important;
  font-size:46px!important;
  font-weight:1000!important;
  line-height:1!important;
}

.proBrand p{
  margin:8px 0 0!important;
  color:#6b2457!important;
  font-size:15px!important;
  font-weight:1000!important;
}

/* home hero jangan jadi card besar */
body:has(.searchCard) .hero{
  background:transparent!important;
  border:0!important;
  box-shadow:none!important;
  padding:0!important;
  margin:0 0 20px!important;
}

/* sembunyikan judul/deskripsi home biar sama nomor 2 */
body:has(.searchCard) .hero > h2,
body:has(.searchCard) .hero > p,
body:has(.searchCard) .hero > .mut{
  display:none!important;
}

/* search box */
body:has(.searchCard) .searchCard{
  background:transparent!important;
  border:0!important;
  box-shadow:none!important;
  padding:0!important;
  margin:0!important;
}

body:has(.searchCard) .searchTitle{
  display:none!important;
}

body:has(.searchCard) .searchRow{
  display:block!important;
  margin:0!important;
}

body:has(.searchCard) .searchRow input{
  width:100%!important;
  height:62px!important;
  border:3px solid #f052a7!important;
  border-radius:22px!important;
  background:#fff!important;
  padding:0 20px!important;
  color:#333!important;
  font-size:18px!important;
  font-weight:800!important;
  box-shadow:none!important;
}

body:has(.searchCard) .searchRow input::placeholder{
  color:#777!important;
}

body:has(.searchCard) .searchRow button{
  display:none!important;
}

/* kategori 1 baris semua kelihatan */
body:has(.searchCard) .categoryTabs{
  display:flex!important;
  flex-direction:row!important;
  flex-wrap:nowrap!important;
  gap:10px!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  width:100%!important;
  padding:16px 0 10px!important;
  margin:0!important;
  scrollbar-width:none!important;
}

body:has(.searchCard) .categoryTabs::-webkit-scrollbar{
  display:none!important;
}

body:has(.searchCard) .categoryTabs .pill{
  flex:0 0 auto!important;
  width:auto!important;
  min-width:92px!important;
  height:50px!important;
  padding:0 16px!important;
  border-radius:999px!important;
  border:0!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  background:linear-gradient(135deg,#ff73bd,#ff9bd2)!important;
  color:#fff!important;
  font-size:15px!important;
  font-weight:1000!important;
  box-shadow:0 14px 28px rgba(255,70,170,.22)!important;
  white-space:nowrap!important;
}

body:has(.searchCard) .categoryTabs .pill.active{
  background:linear-gradient(135deg,#0ea5e9,#38bdf8)!important;
  color:#fff!important;
  position:relative!important;
}

body:has(.searchCard) .categoryTabs .pill.active::after{
  content:""!important;
  position:absolute!important;
  bottom:-9px!important;
  left:50%!important;
  transform:translateX(-50%)!important;
  width:38px!important;
  height:5px!important;
  border-radius:999px!important;
  background:#38bdf8!important;
}

body:has(.searchCard) .categoryTabs .pill.vip.active,
body:has(.searchCard) .categoryTabs .pill.exp.active{
  background:linear-gradient(135deg,#0ea5e9,#38bdf8)!important;
  color:#fff!important;
}

/* card kosong seperti nomor 2 */
body:has(.searchCard) .emptyState,
body:has(.searchCard) .box:has(.emptyIcon){
  min-height:260px!important;
  background:#fff!important;
  border-radius:30px!important;
  box-shadow:0 18px 45px rgba(255,60,160,.12)!important;
  border:1px solid rgba(255,255,255,.8)!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  text-align:center!important;
  padding:32px!important;
  color:#f03c9f!important;
}

body:has(.searchCard) .emptyState h3{
  color:#f03c9f!important;
  font-size:24px!important;
  margin:0 0 8px!important;
}

body:has(.searchCard) .emptyState p{
  color:#666!important;
  font-size:15px!important;
  margin:0!important;
}

body:has(.searchCard) .emptyIcon{
  display:none!important;
}

/* kalau ada konten, tetap 2 kolom kecil */
body:has(.searchCard) .grid{
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:14px!important;
  align-items:start!important;
}

body:has(.searchCard) .mediaCard{
  width:100%!important;
  border-radius:24px!important;
  overflow:hidden!important;
  margin:0!important;
}

body:has(.searchCard) .mediaThumb{
  aspect-ratio:1/1!important;
}

body:has(.searchCard) .mediaBody{
  padding:14px!important;
  text-align:center!important;
}

body:has(.searchCard) .mediaBody h3{
  font-size:19px!important;
  text-align:center!important;
  margin:0 0 10px!important;
}

body:has(.searchCard) .mediaStats{
  justify-content:center!important;
}

body:has(.searchCard) .mediaFoot{
  text-align:center!important;
}

body:has(.searchCard) .mediaFoot span{
  display:none!important;
}

/* floating chat hijau kayak nomor 2 */
.floatChat{
  position:fixed!important;
  right:26px!important;
  bottom:34px!important;
  width:70px!important;
  height:70px!important;
  border-radius:50%!important;
  display:grid!important;
  place-items:center!important;
  background:#22c55e!important;
  color:white!important;
  font-size:28px!important;
  box-shadow:0 16px 35px rgba(0,0,0,.25)!important;
  z-index:50!important;
}

@media(max-width:640px){
  body:has(.searchCard) .wrap{
    padding:20px!important;
  }

  .proTopbar{
    padding:24px 16px!important;
    border-radius:30px!important;
  }

  .proBolt{
    font-size:48px!important;
  }

  .proBrand h1{
    font-size:40px!important;
  }

  .proBrand p{
    font-size:14px!important;
  }

  body:has(.searchCard) .categoryTabs .pill{
    min-width:88px!important;
    height:48px!important;
    padding:0 14px!important;
    font-size:14px!important;
  }

  .floatChat{
    width:62px!important;
    height:62px!important;
    right:22px!important;
    bottom:30px!important;
    font-size:25px!important;
  }
}

`;

function topbar({ panel = false } = {}) {
  return `
  <div class="proTopbar">
    <a class="proBrand" href="/">
      <div class="proBolt">⚡</div>
      <div>
        <h1>JakSky</h1>
        <p>Premium Video Gate • VIP Access • Fast Update</p>
      </div>
    </a>

    ${
      panel
      ? `<form method="post" action="/logout" style="margin:0">
          <button class="logoutBtn">Logout</button>
        </form>`
      : ``
    }
  </div>`;
}

function page(title, body, opt = {}) {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - JakSky</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
${topbar(opt)}
${body}
</div>


<a class="floatChat" href="/">💬</a>
</body>
</html>`;
}

function agePopup() {
  return `
  <div class="ageOverlay" id="agePopup">
    <div class="ageCard newAgeCard">
      <button class="ageClose" onclick="document.getElementById('agePopup').classList.remove('show')">×</button>

      <div class="ageAvatar">🐱</div>
      <div class="ageWarnIcon">⚠️</div>

      <h2>Peringatan Konten 18+</h2>
      <p>Website ini berisi konten khusus dewasa.<br>Semua konten hanya untuk hiburan.</p>

      <div class="ageNotice">Jangan meniru apa pun yang ada di dalam video.</div>

      <p>Dengan melanjutkan, kamu menyatakan sudah cukup umur dan bertanggung jawab atas tindakanmu sendiri.</p>

      <button class="ageEnter" onclick="localStorage.setItem('jaksky_age_ok_ref','yes');document.getElementById('agePopup').classList.remove('show')">
        Saya Mengerti & Masuk
      </button>
      <a class="ageExit" href="https://google.com">Keluar</a>
    </div>
  </div>

  <script>
    if(localStorage.getItem("jaksky_age_ok_ref") !== "yes"){
      document.getElementById("agePopup").classList.add("show");
    }
  </script>`;
}

function userTabs(active) {
  const tabs = [
    ["semua", "Semua", ""],
    ["terbaru", "Terbaru", ""],
    ["favorit", "Favorit", ""],
    ["trending", "Trending", ""],
    ["vip", "VIP", "vip"],
    ["expired", "Expired", "exp"]
  ];

  return `
  <div class="categoryTabs">
    ${tabs.map(([k, n, extra]) => `
      <a class="pill ${active === k ? "active" : ""} ${extra}" href="/?tab=${k}">
        ${n}
      </a>
    `).join("")}
  </div>`;
}

function card(item) {
  return `
  <article class="mediaCard">
    <a class="mediaThumb" href="/watch/${item.id}">
      <img src="/thumb/${item.id}" alt="${esc(item.title)}">
      <div class="mediaShade"></div>
      <div class="mediaPlay">▶</div>
      ${item.vip ? `<div class="cornerBadge">VIP</div>` : ``}
    </a>

    <div class="mediaBody">
      <h3>${esc(item.title)}</h3>

      <div class="mediaStats">
        <span>⭐ ${avgRating(item).toFixed(1)}</span>
        <span>👍 ${(item.likes || []).length}</span>
        <span>👎 ${(item.unlikes || []).length}</span>
      </div>

      <p>${esc(item.desc || "Tidak ada deskripsi")}</p>

      <div class="mediaFoot">
        <span>${new Date(item.createdAt).toLocaleString("id-ID")}</span>
        <b>${((item.size || 0) / 1024 / 1024).toFixed(1)} MB</b>
      </div>
    </div>
  </article>`;
}

app.get("/", (req, res) => {
  const data = readDB();
  const q = String(req.query.q || "").toLowerCase().trim();
  const tab = String(req.query.tab || "semua");

  let list = data.media || [];

  if (tab === "expired") list = list.filter(isExpired);
  else list = list.filter(x => !isExpired(x));

  if (q) {
    list = list.filter(x => `${x.title} ${x.desc}`.toLowerCase().includes(q));
  }

  if (tab === "vip") list = list.filter(x => x.vip);
  if (tab === "favorit") {
    list.sort((a, b) => ((b.likes || []).length + avgRating(b)) - ((a.likes || []).length + avgRating(a)));
  } else if (tab === "trending") {
    list.sort((a, b) => trendingScore(b) - trendingScore(a));
  } else {
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const body = `
  ${agePopup()}

  <section class="hero">
    <h2>JakSky Video</h2>
    <p class="mut">
      Cari video terbaru, VIP, favorit, trending, dan konten expired dari satu halaman premium.
    </p>

    <div class="searchCard">
      <div class="searchTitle">Cari & pilih kategori</div>
      <form class="searchRow" method="get">
        <input type="hidden" name="tab" value="${esc(tab)}">
        <input name="q" value="${esc(req.query.q || "")}" placeholder="Cari video, file, VIP, favorit...">
        <button>Cari</button>
      </form>
      ${userTabs(tab)}
    </div>
  </section>

  <div class="grid">
    ${list.length ? list.map(card).join("") : `
      <div class="emptyState">
        <div class="emptyIcon">📁</div>
        <div>
          <h3>Belum ada video</h3>
          <p>Konten akan muncul di sini setelah admin upload video atau file.</p>
        </div>
      </div>
    `}
  </div>`;

  res.send(page("Home", body, { panel: false }));
});

app.get("/thumb/:id", (req, res) => {
  const item = readDB().media.find(x => x.id === req.params.id);
  if (!item) return res.status(404).send("Not found");

  const file = path.join(THUMB_DIR, item.thumbnail || "");
  if (item.thumbnail && fs.existsSync(file)) return res.sendFile(file);

  res.type("svg").send(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#7c3aed"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="100%" height="100%" fill="#050712"/><rect x="55" y="55" width="790" height="410" rx="40" fill="url(#g)" opacity=".6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="68" font-family="Arial" font-weight="900">JakSky</text></svg>`);
});

app.get("/watch/:id", (req, res) => {
  const item = readDB().media.find(x => x.id === req.params.id);

  if (!item || isExpired(item)) {
    return res.send(page("Expired", `<div class="box"><h2>Konten tidak ada atau sudah expired.</h2><a class="btn" href="/">Kembali</a></div>`));
  }

  let mediaBox = "";

  if (!isUnlocked(req, item)) {
    mediaBox = `
    <div class="box">
      <h2>Konten Terkunci</h2>
      <p class="mut">Admin memberi password pada thumbnail ini. Masukkan password agar video/file muncul.</p>
      ${req.query.err ? `<div class="notice">Password salah.</div>` : ``}
      <form method="post" action="/unlock/${item.id}">
        <input name="password" type="password" placeholder="Password dari admin" required>
        <br><br>
        <button>Buka Konten</button>
      </form>
    </div>`;
  } else if (String(item.mime || "").startsWith("video/")) {
    mediaBox = `<div class="videoBox"><video class="watchVideo" controls preload="metadata" src="/stream/${item.id}"></video></div>`;
  } else {
    mediaBox = `<div class="box"><h2>File Siap Dibuka</h2><a class="btn" href="/stream/${item.id}" target="_blank">Buka / Download File</a></div>`;
  }

  const v = visitor(req);
  const userLiked = (item.likes || []).includes(v);
  const userUnliked = (item.unlikes || []).includes(v);
  const userRating = ((item.ratings || []).find(r => r.visitor === v) || {}).value || 5;

  const commentTotalSimple = (item.comments || []).reduce((total, c) => {
    return total + 1 + ((c.replies || []).length);
  }, 0);

  const comments = (item.comments || []).map(c => `
    <div class="comment">
      <b>${esc(c.name)}</b>
      <p>${esc(c.text)}</p>
      ${(c.replies || []).map(r => `
        <div class="reply">
          <span class="badge mod">${esc(r.badge)}</span>
          <b>${esc(r.by)}</b>
          <p>${esc(r.text)}</p>
        </div>`).join("")}
    </div>`).join("") || `<p class="mut">Belum ada komentar.</p>`;

  const body = `
  <a class="btn ghost" href="/">← Kembali</a>

  <section class="hero" style="margin-top:16px">
    <h2>${esc(item.title)}</h2>
    <div class="badges">
      ${item.vip ? `<span class="badge vip">VIP</span>` : ``}
      ${item.password ? `<span class="badge lock">PASSWORD</span>` : ``}
      <span class="badge">⭐ ${avgRating(item).toFixed(1)}</span>
      <span class="badge">👍 ${(item.likes || []).length}</span>
      <span class="badge">👎 ${(item.unlikes || []).length}</span>
    </div>
    <p class="mut">${esc(item.desc || "")}</p>
  </section>

  ${mediaBox}

  <div class="box reactionBox" style="margin-top:16px">
    <h3>Aksi User</h3>

    <div class="reactionGrid">
      <form method="post" action="/react/${item.id}/like">
        <button class="reactionBtn likeAction ${userLiked ? "active" : ""}">
          <span>👍 Like</span>
          <b>${(item.likes || []).length}</b>
        </button>
      </form>

      <form method="post" action="/react/${item.id}/unlike">
        <button class="reactionBtn unlikeAction ${userUnliked ? "active" : ""}">
          <span>👎 Unlike</span>
          <b>${(item.unlikes || []).length}</b>
        </button>
      </form>
    </div>

    <form method="post" action="/rate/${item.id}" class="ratingBox">
      <select name="value">
        <option value="5" ${Number(userRating) === 5 ? "selected" : ""}>5 ⭐</option>
        <option value="4" ${Number(userRating) === 4 ? "selected" : ""}>4 ⭐</option>
        <option value="3" ${Number(userRating) === 3 ? "selected" : ""}>3 ⭐</option>
        <option value="2" ${Number(userRating) === 2 ? "selected" : ""}>2 ⭐</option>
        <option value="1" ${Number(userRating) === 1 ? "selected" : ""}>1 ⭐</option>
      </select>
      <button>Rating</button>
    </form>
  </div>

  <div class="box">
    <h3>Komentar (${commentTotalSimple})</h3>
    <form method="post" action="/comment/${item.id}" class="formgrid">
      <input name="name" placeholder="Nama kamu" required>
      <input name="text" placeholder="Tulis komentar..." required>
      <button class="full">Kirim Komentar</button>
    </form>
    ${comments}
  </div>`;

  res.send(page(item.title, body, { panel: false }));
});

app.post("/unlock/:id", (req, res) => {
  const item = readDB().media.find(x => x.id === req.params.id);
  if (!item) return res.redirect("/");

  if (String(req.body.password || "") === String(item.password || "")) {
    if (!req.session.unlocked) req.session.unlocked = {};
    req.session.unlocked[item.id] = true;
    return res.redirect("/watch/" + item.id);
  }

  res.redirect("/watch/" + item.id + "?err=1");
});

app.post("/react/:id/:type", (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.id);

  if (item) {
    const v = visitor(req);
    item.likes = item.likes || [];
    item.unlikes = item.unlikes || [];

    const hadLike = item.likes.includes(v);
    const hadUnlike = item.unlikes.includes(v);

    item.likes = item.likes.filter(x => x !== v);
    item.unlikes = item.unlikes.filter(x => x !== v);

    if (req.params.type === "like") {
      if (!hadLike) item.likes.push(v);
    }

    if (req.params.type === "unlike") {
      if (!hadUnlike) item.unlikes.push(v);
    }

    writeDB(data);
  }

  res.redirect(back(req));
});

app.post("/rate/:id", (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.id);

  if (item) {
    const v = visitor(req);
    const value = Math.max(1, Math.min(5, Number(req.body.value || 5)));
    item.ratings = (item.ratings || []).filter(x => x.visitor !== v);
    item.ratings.push({ visitor: v, value, createdAt: nowISO() });
    writeDB(data);
  }

  res.redirect(back(req));
});

app.post("/comment/:id", (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.id);

  if (item) {
    item.comments = item.comments || [];
    item.comments.push({
      id: uid(),
      name: String(req.body.name || "User").slice(0, 40),
      text: String(req.body.text || "").slice(0, 500),
      createdAt: nowISO(),
      replies: []
    });
    writeDB(data);
  }

  res.redirect("/watch/" + req.params.id);
});

app.get("/stream/:id", (req, res) => {
  const item = readDB().media.find(x => x.id === req.params.id);

  if (!item || isExpired(item)) return res.status(404).send("Expired / Not found");
  if (!isUnlocked(req, item)) return res.status(403).send("Masukkan password dulu.");

  const file = path.join(MEDIA_DIR, item.filename || "");
  if (!fs.existsSync(file)) return res.status(404).send("File tidak ditemukan.");

  const stat = fs.statSync(file);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunk = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunk,
      "Content-Type": item.mime || "application/octet-stream"
    });

    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": item.mime || "application/octet-stream"
    });

    fs.createReadStream(file).pipe(res);
  }
});

app.get("/login/:role", (req, res) => {
  const r = req.params.role;
  if (!LOGIN[r]) return res.redirect("/");

  const niceRole = r.charAt(0).toUpperCase() + r.slice(1);

  const body = `
  <div class="simpleLoginPage">
    <div class="simpleLoginCard">
      <h2>Login ${esc(niceRole)} 🧸</h2>

      ${req.query.err ? `<div class="miniError">Nama akun atau password salah.</div>` : ``}

      <form method="post">
        <input name="user" placeholder="Nama akun" required>
        <input name="password" type="password" placeholder="Password" required>
        <button>Masuk</button>
      </form>

      <p>Gunakan akun role ${esc(r)} yang statusnya active</p>
    </div>
  </div>`;

  res.send(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(niceRole)} Login</title>
<style>${css}</style>
</head>
<body>
${body}


<a class="floatChat" href="/">💬</a>
</body>
</html>`);
});

app.post("/login/:role", (req, res) => {
  const r = req.params.role;
  if (!LOGIN[r]) return res.redirect("/");

  const user = String(req.body.user || "").trim();
  const password = String(req.body.password || req.body.keycombo || "").trim();

  // OWNER KHUSUS: pasti bisa login pakai JakSky / JakSky
  if (r === "owner" && user === "JakSky" && password === "JakSky") {
    req.session.role = "owner";
    req.session.accountId = "owner-jaksky";
    req.session.accountUser = "JakSky";
    return res.redirect("/owner");
  }

  const data = ensureAccounts(readDB());
  writeDB(data);

  const acc = data.accounts.find(a =>
    a.role === r &&
    a.user === user &&
    String(a.pass || "") === password &&
    a.status === "active"
  );

  if (!acc) {
    return res.redirect("/login/" + r + "?err=1");
  }

  req.session.role = r;
  req.session.accountId = acc.id;
  req.session.accountUser = acc.user;

  res.redirect("/" + r);
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

function uploadForm() {
  return `
  <div class="box">
    <h2>Upload Konten</h2>
    <p class="mut">Upload hanya untuk admin/owner. Max default ${MAX_UPLOAD_MB} MB.</p>

    <form method="post" action="/panel/upload" enctype="multipart/form-data" class="formgrid">
      <div><label>Judul</label><input name="title" required></div>
      <div><label>Status</label><select name="vip"><option value="0">Biasa</option><option value="1">VIP</option></select></div>
      <div class="full"><label>Deskripsi</label><textarea name="desc" rows="3"></textarea></div>
      <div>
        <label>Thumbnail dulu</label>
        <input type="file" name="thumbnail" accept="image/*" required>
      </div>

      <div>
        <label>Baru Video/File besar</label>
        <input type="file" name="media" required>
      </div>

      <div>
        <label>Password thumbnail opsional</label>
        <input name="password" placeholder="Kosong = langsung masuk">
      </div>
      <div><label>Expired otomatis</label><input name="expiresAt" type="datetime-local"></div>
      <button class="full">Upload ke JakSky</button>
    </form>
  </div>`;
}

function mediaTable() {
  const list = readDB().media.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return `
  <div class="box">
    <h2>Data Konten</h2>
    <table class="table">
      <thead><tr><th>Konten</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${list.map(item => `
          <tr>
            <td>
              <b>${esc(item.title)}</b>
              <p class="mut">${esc(item.original || "")}</p>
              <div class="badges">
                ${item.vip ? `<span class="badge vip">VIP</span>` : ``}
                ${item.password ? `<span class="badge lock">PASSWORD</span>` : ``}
                ${isExpired(item) ? `<span class="badge exp">EXPIRED</span>` : ``}
              </div>
            </td>
            <td>
              <p class="mut">${item.expiresAt ? new Date(item.expiresAt).toLocaleString("id-ID") : "Tidak ada expired"}</p>
              <p class="mut">${((item.size || 0) / 1024 / 1024).toFixed(1)} MB</p>
            </td>
            <td>
              <form method="post" action="/panel/${item.id}/update" class="row">
                <input name="title" value="${esc(item.title)}" style="min-width:140px">
                <input name="password" value="${esc(item.password || "")}" placeholder="Password kosong" style="min-width:140px">
                <input name="expiresAt" type="datetime-local">
                <label class="row"><input type="checkbox" name="vip" value="1" ${item.vip ? "checked" : ""} style="width:auto"> VIP</label>
                <button class="small">Simpan</button>
              </form>

              <div class="row" style="margin-top:8px">
                <form method="post" action="/panel/${item.id}/expire"><button class="small red">Expired Manual</button></form>
                <form method="post" action="/panel/${item.id}/restore"><button class="small green">Aktifkan</button></form>
                <form method="post" action="/panel/${item.id}/delete" onsubmit="return confirm('Hapus permanen?')"><button class="small red">Hapus</button></form>
                <a class="btn ghost small" href="/watch/${item.id}">Lihat</a>
              </div>
            </td>
          </tr>`).join("") || `<tr><td colspan="3">Belum ada video.</td></tr>`}
      </tbody>
    </table>
  </div>`;
}

app.get("/admin", needRole(["admin"]), (req, res) => {
  const body = `
  <section class="hero">
    <h2>Admin Panel JakSky</h2>
    <p class="mut">Panel admin tidak muncul di halaman user.</p>
    <span class="badge mod">${badge(currentRole(req))}</span>
  </section>
  <div class="panel">
    ${uploadForm()}
    <div class="box">
      <h2>Fitur Admin</h2>
      <div class="badges">
        <span class="badge vip">VIP</span>
        <span class="badge lock">Password Konten</span>
        <span class="badge exp">Expired</span>
        <span class="badge mod">Double Key Login</span>
      </div>
      <p class="mut">User hanya melihat halaman utama dan halaman watch. Upload, edit, VIP, password konten, dan expired hanya di admin.</p>
    </div>
  </div>
  ${mediaTable()}`;

  res.send(page("Admin", body, { panel: true }));
});


function accountPanel() {
  const data = ensureAccounts(readDB());
  writeDB(data);

  const accounts = (data.accounts || []).filter(acc => acc.role !== "owner");

  return `
  <div class="box pinkBox">
    <h2>Buat Akun</h2>
    <p class="mut">Owner hanya membuat akun admin dan moderator. Cukup pakai nama akun dan password.</p>

    <form method="post" action="/owner/accounts/create" class="formgrid">
      <div>
        <label>Nama akun</label>
        <input name="user" placeholder="Nama akun" required>
      </div>

      <div>
        <label>Password</label>
        <input name="pass" type="password" placeholder="Password" required>
      </div>

      <div class="full">
        <label>Role</label>
        <select name="role">
          <option value="admin">Admin</option>
          <option value="moderator">Moderator</option>
        </select>
      </div>

      <button class="full">Simpan</button>
    </form>
  </div>

  <div class="box pinkBox">
    <h2>Daftar Akun</h2>
    <p class="mut">Akun active bisa login. Akun pending/kicked tidak bisa login.</p>

    <div class="grid">
      ${accounts.length ? accounts.map(acc => `
        <div class="card accountCard">
          <div class="content">
            <h3>${esc(acc.user)}</h3>

            <div class="badges">
              <span class="badge mod">${esc(acc.role)}</span>
              <span class="badge ${acc.status === "active" ? "vip" : acc.status === "kicked" ? "exp" : "lock"}">
                ${esc(acc.status)}
              </span>
            </div>

            <p class="mut">Login pakai nama akun dan password.</p>

            <div class="row">
              <form method="post" action="/owner/accounts/${acc.id}/status/active">
                <button class="small">Active</button>
              </form>

              <form method="post" action="/owner/accounts/${acc.id}/status/pending">
                <button class="small ghost">Pending</button>
              </form>

              <form method="post" action="/owner/accounts/${acc.id}/status/kicked">
                <button class="small red">Kick</button>
              </form>

              <form method="post" action="/owner/accounts/${acc.id}/delete" onsubmit="return confirm('Hapus akun ini?')">
                <button class="small red">Hapus</button>
              </form>
            </div>
          </div>
        </div>
      `).join("") : `<div class="box">Belum ada akun admin atau moderator.</div>`}
    </div>
  </div>`;
}

app.get("/owner", needRole(["owner"]), (req, res) => {
  const body = `
  <section class="hero">
    <h2>Owner Panel</h2>
    <p class="mut">
      Owner khusus untuk membuat dan mengatur akun admin / moderator.
      Upload konten hanya ada di panel admin.
    </p>
    <span class="badge mod">OWNER BADGE</span>
  </section>

  ${accountPanel()}

  <div class="box">
    <h2>Fungsi Owner</h2>
    <p class="mut">
      Owner hanya bertugas membuat akun admin dan moderator, mengaktifkan akun,
      pending akun, kick akun, dan menghapus akun.
    </p>
    <div class="badges">
      <span class="badge vip">Buat Admin</span>
      <span class="badge mod">Buat Moderator</span>
      <span class="badge lock">Atur Status Akun</span>
    </div>
  </div>`;

  res.send(page("Owner", body, { panel: true }));
});


app.get("/moderator", needRole(["moderator"]), (req, res) => {
  const list = readDB().media.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const blocks = list.map(item => `
    <div class="box">
      <h3>${esc(item.title)}</h3>
      ${(item.comments || []).map(c => `
        <div class="comment">
          <b>${esc(c.name)}</b>
          <p>${esc(c.text)}</p>

          ${(c.replies || []).map(r => `
            <div class="reply">
              <span class="badge mod">${esc(r.badge)}</span>
              <b>${esc(r.by)}</b>
              <p>${esc(r.text)}</p>
            </div>`).join("")}

          <form method="post" action="/reply/${item.id}/${c.id}" class="row">
            <input name="text" placeholder="Balas komentar sebagai ${badge(currentRole(req))}" required>
            <button class="small">Balas + Badge</button>
          </form>

          <form method="post" action="/moderator/comment/${item.id}/${c.id}/delete" onsubmit="return confirm('Hapus komentar user ini?')" style="margin-top:8px">
            <button class="small red">Hapus Komentar User</button>
          </form>
        </div>`).join("") || `<p class="mut">Belum ada komentar.</p>`}
    </div>`).join("") || `<div class="box">Belum ada video.</div>`;

  const body = `
  <section class="hero">
    <h2>Moderator Room</h2>
    <p class="mut">Moderator bisa membalas komentar user dengan badge.</p>
    <span class="badge mod">${badge(currentRole(req))}</span>
  </section>
  ${blocks}`;

  res.send(page("Moderator", body, { panel: true }));
});


app.post("/owner/accounts/create", needRole(["owner"]), (req, res) => {
  const data = ensureAccounts(readDB());

  const user = String(req.body.user || "").trim();
  const pass = String(req.body.pass || "").trim();
  const role = String(req.body.role || "admin").trim();

  if (!user || !pass) {
    return res.redirect("/owner");
  }

  if (!["admin", "moderator"].includes(role)) {
    return res.redirect("/owner");
  }

  const exists = data.accounts.some(acc => acc.user === user && acc.role === role);
  if (exists) {
    return res.redirect("/owner");
  }

  data.accounts.push({
    id: uid(),
    role,
    user,
    pass,
    key1: "",
    key2: "",
    status: "active",
    createdAt: nowISO()
  });

  writeDB(data);
  res.redirect("/owner");
});

app.post("/owner/accounts/:id/status/:status", needRole(["owner"]), (req, res) => {
  const data = ensureAccounts(readDB());
  const acc = data.accounts.find(x => x.id === req.params.id);

  if (acc) {
    const status = req.params.status;
    if (["active", "pending", "kicked"].includes(status)) {
      acc.status = status;
      writeDB(data);
    }
  }

  res.redirect("/owner");
});

app.post("/owner/accounts/:id/delete", needRole(["owner"]), (req, res) => {
  const data = ensureAccounts(readDB());

  data.accounts = data.accounts.filter(acc => {
    if (acc.role === "owner") return true;
    return acc.id !== req.params.id;
  });

  writeDB(data);
  res.redirect("/owner");
});


app.post("/panel/upload", needRole(["admin"]), upload.fields([{ name: "media", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), (req, res) => {
  const media = req.files?.media?.[0];
  const thumb = req.files?.thumbnail?.[0];

  if (!media || !thumb) return res.status(400).send("Media dan thumbnail wajib.");

  const data = readDB();

  data.media.push({
    id: uid(),
    title: String(req.body.title || "Tanpa Judul").slice(0, 100),
    desc: String(req.body.desc || "").slice(0, 1000),
    vip: req.body.vip === "1",
    password: String(req.body.password || "").trim(),
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt).toISOString() : null,
    filename: media.filename,
    thumbnail: thumb.filename,
    original: media.originalname,
    size: media.size,
    mime: media.mimetype,
    createdAt: nowISO(),
    likes: [],
    unlikes: [],
    ratings: [],
    comments: []
  });

  writeDB(data);
  res.redirect("/" + currentRole(req));
});

app.post("/panel/:id/update", needRole(["admin"]), (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.id);

  if (item) {
    item.title = String(req.body.title || item.title).slice(0, 100);
    item.password = String(req.body.password || "").trim();
    item.vip = req.body.vip === "1";
    if (req.body.expiresAt) item.expiresAt = new Date(req.body.expiresAt).toISOString();
    writeDB(data);
  }

  res.redirect(back(req));
});

app.post("/panel/:id/expire", needRole(["admin"]), (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.id);
  if (item) {
    item.expiresAt = nowISO();
    writeDB(data);
  }
  res.redirect(back(req));
});

app.post("/panel/:id/restore", needRole(["admin"]), (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.id);
  if (item) {
    item.expiresAt = null;
    writeDB(data);
  }
  res.redirect(back(req));
});

app.post("/panel/:id/delete", needRole(["admin"]), (req, res) => {
  const data = readDB();
  const i = data.media.findIndex(x => x.id === req.params.id);

  if (i >= 0) {
    const item = data.media[i];
    const media = path.join(MEDIA_DIR, item.filename || "");
    const thumb = path.join(THUMB_DIR, item.thumbnail || "");

    if (fs.existsSync(media)) fs.unlinkSync(media);
    if (fs.existsSync(thumb)) fs.unlinkSync(thumb);

    data.media.splice(i, 1);
    writeDB(data);
  }

  res.redirect(back(req));
});

app.post("/reply/:mid/:cid", needRole(["moderator"]), (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.mid);
  const comment = item?.comments?.find(x => x.id === req.params.cid);

  if (comment) {
    comment.replies = comment.replies || [];
    comment.replies.push({
      id: uid(),
      by: currentRole(req).toUpperCase(),
      badge: badge(currentRole(req)),
      text: String(req.body.text || "").slice(0, 500),
      createdAt: nowISO()
    });
    writeDB(data);
  }

  res.redirect(back(req));
});


app.post("/moderator/comment/:mid/:cid/delete", needRole(["moderator"]), (req, res) => {
  const data = readDB();
  const item = data.media.find(x => x.id === req.params.mid);

  if (item && Array.isArray(item.comments)) {
    item.comments = item.comments.filter(c => c.id !== req.params.cid);
    writeDB(data);
  }

  res.redirect(back(req));
});


app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(page("Error", `<div class="box"><h2>Error</h2><p>${esc(err.message)}</p><a class="btn" href="/">Kembali</a></div>`));
});
});


// ===== VERCEL_FINAL_EXPORT =====
app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "API tidak ditemukan" });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("Web aktif di http://localhost:" + PORT);
  });
}

module.exports = app;
