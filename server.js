require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");

const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ extended: true, limit: "1gb" }));

app.use((req, res, next) => {
  req.setTimeout(0);
  res.setTimeout(0);
  next();
});

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

function readJson(file, def) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(def, null, 2));
    }
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(def));
  } catch (e) {
    return def;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readPosts() {
  return readJson(POSTS_FILE, []);
}

function writePosts(data) {
  writeJson(POSTS_FILE, data);
}

function readAdmins() {
  return readJson(ADMINS_FILE, [
    {
      name: "Owner",
      key1: "xyron",
      key2: "store123",
      role: "owner",
      status: "active",
      verified: true,
      avatar: "/uploads/admin.png"
    }
  ]);
}

function writeAdmins(data) {
  writeJson(ADMINS_FILE, data);
}

function uid(req) {
  return String(
    req.headers["x-user-id"] ||
    req.body?.userId ||
    req.body?.deviceId ||
    req.ip ||
    "user"
  ).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function findPost(id) {
  const posts = readPosts();
  const post = posts.find(p => String(p.id) === String(id));
  return { posts, post };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safe = Date.now() + "-" + Math.random().toString(36).slice(2) + ext;
      cb(null, safe);
    }
  }),
  limits: {
    fileSize: 300 * 1024 * 1024
  }
});

/* =========================
   POSTS
========================= */

app.get("/api/posts", (req, res) => {
  res.json(readPosts());
});

app.get("/api/admin/posts", (req, res) => {
  res.json(readPosts());
});

/* =========================
   UPLOAD
========================= */

function handleUpload(req, res) {
  try {
    const posts = readPosts();

    const thumb =
      req.files?.thumbnail?.[0] ||
      req.files?.thumb?.[0] ||
      req.files?.image?.[0];

    const videoFiles =
      req.files?.video ||
      req.files?.videos ||
      [];

    const videos = videoFiles.map(v => "/uploads/" + v.filename);

    if (!thumb) {
      return res.status(400).json({ message: "Thumbnail wajib dipilih" });
    }

    if (!videos.length) {
      return res.status(400).json({ message: "Video wajib dipilih" });
    }

    if (videos.length > 9) {
      return res.status(400).json({ message: "Maksimal 9 video" });
    }

    const expiredHours = Number(req.body.expiredHours || 0);

    const post = {
      id: Date.now().toString(),
      title: req.body.title || "Video",
      desc: req.body.desc || "",
      type: req.body.type || "public",
      key: req.body.key || "",
      thumb: "/uploads/" + thumb.filename,
      thumbnail: "/uploads/" + thumb.filename,
      video: videos[0],
      videos,
      views: 0,
      likes: 0,
      unlikes: 0,
      dislikes: 0,
      downloads: 0,
      rating: 0,
      ratingAvg: "0.0",
      ratingCount: 0,
      comments: [],
      uploader: req.headers["x-admin-name"] || req.body.adminName || "Admin",
      createdAt: new Date().toISOString(),
      expiredAt: expiredHours
        ? new Date(Date.now() + expiredHours * 60 * 60 * 1000).toISOString()
        : ""
    };

    posts.unshift(post);
    writePosts(posts);

    return res.json({ ok: true, post });
  } catch (e) {
    return res.status(500).json({ message: "Upload gagal", error: e.message });
  }
}

app.post("/api/upload", upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "thumb", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 9 },
  { name: "videos", maxCount: 9 }
]), handleUpload);

app.post("/api/admin/upload-final", upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "thumb", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 9 },
  { name: "videos", maxCount: 9 }
]), handleUpload);

/* =========================
   USER ACTIONS
========================= */

app.post("/api/posts/:id/view", (req, res) => {
  const { posts, post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const u = uid(req);
  post.viewedBy = post.viewedBy || {};

  if (!post.viewedBy[u]) {
    post.viewedBy[u] = true;
    post.views = Number(post.views || 0) + 1;
  }

  writePosts(posts);
  res.json(post);
});

app.post("/api/view/:id", (req, res) => {
  req.url = "/api/posts/" + req.params.id + "/view";
  app._router.handle(req, res);
});

app.post("/api/posts/:id/like", (req, res) => {
  const { posts, post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const u = uid(req);
  post.likedBy = post.likedBy || {};

  if (!post.likedBy[u]) {
    post.likedBy[u] = true;
    post.likes = Number(post.likes || 0) + 1;
  }

  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/dislike", (req, res) => {
  const { posts, post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const u = uid(req);
  post.unlikedBy = post.unlikedBy || {};

  if (!post.unlikedBy[u]) {
    post.unlikedBy[u] = true;
    post.unlikes = Number(post.unlikes || post.dislikes || 0) + 1;
    post.dislikes = post.unlikes;
  }

  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/rating", (req, res) => {
  const { posts, post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const val = Number(req.body.rating || req.body.value || req.body.star || 0);
  if (val < 1 || val > 5) {
    return res.status(400).json({ message: "Rating salah" });
  }

  const u = uid(req);
  post.ratingBy = post.ratingBy || {};
  post.ratingBy[u] = val;

  const vals = Object.values(post.ratingBy).map(Number);
  post.ratingCount = vals.length;
  post.rating = vals.reduce((a, b) => a + b, 0) / vals.length;
  post.ratingAvg = post.rating.toFixed(1);

  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/comment", (req, res) => {
  const { posts, post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const text = String(req.body.text || req.body.comment || "").trim();
  const name = String(req.body.name || "User").trim();

  if (!text) return res.status(400).json({ message: "Komentar kosong" });

  post.comments = Array.isArray(post.comments) ? post.comments : [];

  post.comments.push({
    id: Date.now().toString(),
    name,
    text,
    comment: text,
    userId: uid(req),
    replies: [],
    createdAt: new Date().toISOString()
  });

  writePosts(posts);
  res.json(post);
});

app.post("/api/comment/:id", (req, res) => {
  req.url = "/api/posts/" + req.params.id + "/comment";
  app._router.handle(req, res);
});

app.post("/api/posts/:id/download", (req, res) => {
  const { posts, post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.downloads = Number(post.downloads || 0) + 1;
  writePosts(posts);
  res.json(post);
});

app.post("/api/download/:id", (req, res) => {
  req.url = "/api/posts/" + req.params.id + "/download";
  app._router.handle(req, res);
});

app.post("/api/unlock/:id", (req, res) => {
  const { post } = findPost(req.params.id);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const input = String(req.body.key || req.body.password || req.body.vipKey || "").trim();
  const real = String(post.key || post.vipKey || post.password || "").trim();

  if (real && input !== real) {
    return res.status(401).json({ message: "Kunci salah" });
  }

  res.json({
    ok: true,
    post,
    video: post.video || (post.videos && post.videos[0]) || "",
    videos: post.videos || (post.video ? [post.video] : [])
  });
});

/* =========================
   ADMIN / MOD COMMENTS
========================= */
app.post("/api/admin/posts/:postId/comment", (req, res) => {
  const { posts, post } = findPost(req.params.postId);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Komentar kosong" });

  post.comments = Array.isArray(post.comments) ? post.comments : [];

  post.comments.push({
    id: Date.now().toString(),
    name: req.body.name || req.body.adminName || "Admin",
    text,
    comment: text,
    role: req.body.role || "moderator",
    isAdmin: true,
    replies: [],
    createdAt: new Date().toISOString()
  });

  writePosts(posts);
  res.json({ ok: true, post });
});
app.post("/api/admin/posts/:postId/comments/:i/reply", (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => String(p.id) === String(req.params.postId));

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const id = String(req.params.i);
const comment = post.comments.find(c => String(c.id) === id);

  if (!comment) return res.status(404).json({ message: "Komentar tidak ditemukan" });

  const text = String(req.body.text || req.body.reply || req.body.comment || "").trim();
  if (!text) return res.status(400).json({ message: "Reply kosong" });

  const reply = {
    id: Date.now().toString(),
    name: req.body.adminName || req.headers["x-admin-name"] || "Moderator",
    text,
    comment: text,
    role: req.body.role || "moderator",
    isAdmin: true,
    createdAt: new Date().toISOString()
  };

  comment.replies = Array.isArray(comment.replies) ? comment.replies : [];
  comment.replies.push(reply);

  writePosts(posts);

  res.json({
    ok: true,
    post,
    comments: post.comments
  });
});

app.post("/api/admin/comments/:postId/:i/reply", (req, res) => {
  req.url = "/api/admin/posts/" + req.params.postId + "/comments/" + req.params.i + "/reply";
  app._router.handle(req, res);
});

app.delete("/api/admin/comment/:postId/:i", (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => String(p.id) === String(req.params.postId));

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.comments = Array.isArray(post.comments) ? post.comments : [];
  const id = String(req.params.i);

const exist = post.comments.find(c => String(c.id) === id);
if (!exist) {
  return res.status(404).json({ message: "Komentar tidak ditemukan" });
}

post.comments = post.comments.filter(c => String(c.id) !== id);
  writePosts(posts);

  res.json({ ok: true, post });
});

app.delete("/api/admin/delete-comment/:postId/:i", (req, res) => {
  req.url = "/api/admin/comment/" + req.params.postId + "/" + req.params.i;
  app._router.handle(req, res);
});

app.delete("/api/admin/posts/:id", (req, res) => {
  const posts = readPosts().filter(p => String(p.id) !== String(req.params.id));
  writePosts(posts);
  res.json({ ok: true });
});

/* =========================
   LOGIN
========================= */

app.post("/api/role-login", (req, res) => {
  const { key1, key2, role } = req.body || {};

  const acc = readAdmins().find(a =>
    String(a.key1 || "").trim() === String(key1 || "").trim() &&
    String(a.key2 || "").trim() === String(key2 || "").trim() &&
    (!role || String(a.role || "").toLowerCase() === String(role).toLowerCase())
  );

  if (!acc) return res.status(401).json({ message: "Login salah" });

  const status = String(acc.status || "active").toLowerCase();
  if (status !== "active") {
    return res.status(403).json({ message: "Akun tidak active" });
  }

  res.json({
    ok: true,
    admin: acc,
    adminName: acc.name,
    adminRole: acc.role
  });
});

app.post("/api/admin-login-real", (req, res) => {
  const { name, key } = req.body || {};
  const target = String(name || "").trim().toLowerCase();

  const acc = readAdmins().find(a =>
    String(a.name || "").trim().toLowerCase() === target
  );

  if (!acc) return res.status(404).json({ message: "Akun tidak ditemukan" });

  const status = String(acc.status || "active").toLowerCase();
  if (status !== "active") {
    return res.status(403).json({ message: "Akun tidak active" });
  }

  const okKey =
    String(acc.key1 || "") === String(key || "") ||
    String(acc.key2 || "") === String(key || "");

  if (!okKey) return res.status(401).json({ message: "Key salah" });

  res.json({
    ok: true,
    name: acc.name,
    role: acc.role || "admin",
    status
  });
});

/* =========================
   OWNER V2
========================= */

app.get("/api/owner-v2/accounts", (req, res) => {
  const admins = readAdmins();

  res.json(admins.map(a => ({
    name: a.name,
    key1: a.key1,
    key2: a.key2,
    role: a.role || "admin",
    status: String(a.status || "active").toLowerCase()
  })));
});

app.post("/api/owner-v2/accounts", (req, res) => {
  const { name, key1, key2, role, status } = req.body || {};

  if (!name || !key1 || !key2) {
    return res.status(400).json({ message: "Nama, key1, key2 wajib" });
  }

  const admins = readAdmins();
  const cleanName = String(name).trim();

  const idx = admins.findIndex(a =>
    String(a.name || "").toLowerCase() === cleanName.toLowerCase()
  );

  const acc = {
    name: cleanName,
    key1: String(key1).trim(),
    key2: String(key2).trim(),
    role: role || "admin",
    status: String(status || "active").toLowerCase(),
    verified: true
  };

  if (idx >= 0) {
    if (String(admins[idx].role || "").toLowerCase() === "owner") {
      return res.status(403).json({ message: "Owner tidak bisa diubah" });
    }
    admins[idx] = { ...admins[idx], ...acc };
  } else {
    admins.push(acc);
  }

  writeAdmins(admins);
  res.json({ ok: true, account: acc });
});

app.patch("/api/owner-v2/accounts/:name/status", (req, res) => {
  const admins = readAdmins();
  const target = String(req.params.name || "").toLowerCase();

  const acc = admins.find(a =>
    String(a.name || "").toLowerCase() === target
  );

  if (!acc) return res.status(404).json({ message: "Akun tidak ditemukan" });

  if (String(acc.role || "").toLowerCase() === "owner") {
    return res.status(403).json({ message: "Owner tidak bisa diubah" });
  }

  acc.status = String(req.body.status || "active").toLowerCase();
  writeAdmins(admins);

  res.json({ ok: true, account: acc });
});

app.delete("/api/owner-v2/accounts/:name", (req, res) => {
  const target = String(req.params.name || "").toLowerCase();
  let admins = readAdmins();

  const before = admins.length;

  admins = admins.filter(a => {
    if (String(a.role || "").toLowerCase() === "owner") return true;
    return String(a.name || "").toLowerCase() !== target;
  });

  if (admins.length === before) {
    return res.status(404).json({ message: "Akun tidak ditemukan / tidak bisa dihapus" });
  }

  writeAdmins(admins);
  res.json({ ok: true });
});

/* =========================
   COMPAT OWNER OLD
========================= */

app.get("/api/owner/accounts-final", (req, res) => {
  const admins = readAdmins();
  res.json(admins.map(a => ({
    name: a.name,
    role: a.role || "admin",
    status: String(a.status || "active").toLowerCase()
  })));
});

app.post("/api/owner/accounts-final", (req, res) => {
  req.url = "/api/owner-v2/accounts";
  app._router.handle(req, res);
});

app.patch("/api/owner/accounts-final/:name/status", (req, res) => {
  req.url = "/api/owner-v2/accounts/" + encodeURIComponent(req.params.name) + "/status";
  app._router.handle(req, res);
});

app.delete("/api/owner/accounts-final/:name", (req, res) => {
  req.url = "/api/owner-v2/accounts/" + encodeURIComponent(req.params.name);
  app._router.handle(req, res);
});

/* =========================
   ACCOUNT STATUS CHECK
========================= */

app.get("/api/check-account-status/:name", (req, res) => {
  const target = String(req.params.name || "").toLowerCase();

  const acc = readAdmins().find(a =>
    String(a.name || "").toLowerCase() === target
  );

  if (!acc) {
    return res.status(404).json({
      ok: false,
      status: "kicked"
    });
  }

  res.json({
    ok: true,
    name: acc.name,
    role: acc.role || "admin",
    status: String(acc.status || "active").toLowerCase()
  });
});
app.post("/api/posts/:postId/comments/:i/like", (req, res) => {
  const { posts, post } = findPost(req.params.postId);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const comment = post.comments?.[Number(req.params.i)];
  if (!comment) return res.status(404).json({ message: "Komentar tidak ditemukan" });

  const u = uid(req);
  comment.likedBy = comment.likedBy || {};

  if (comment.likedBy[u]) {
    delete comment.likedBy[u]; // klik lagi = batal like
  } else {
    comment.likedBy[u] = true;
  }

  comment.likes = Object.keys(comment.likedBy).length;

  writePosts(posts);
  res.json({ ok: true, post });
});
app.post("/api/posts/:postId/comments/:i/pin", (req, res) => {
  const role = String(req.body.role || "").toLowerCase();

  if (role !== "moderator" && role !== "owner") {
  return res.status(403).json({ message: "Hanya moderator/owner yang bisa pin" });
  }

  const { posts, post } = findPost(req.params.postId);
  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.comments = Array.isArray(post.comments) ? post.comments : [];

  const comment = post.comments[Number(req.params.i)];
  if (!comment) return res.status(404).json({ message: "Komentar tidak ditemukan" });

  comment.pinned = !comment.pinned;

  // 🔥 bikin pinned naik ke atas
  post.comments.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  writePosts(posts);
  res.json({ ok: true, post });
});
// ===== LIKE / UNLIKE TOGGLE FINAL ANTI BARENG =====
function getReactUid(req){
  return String(
    req.headers["x-user-id"] ||
    req.body?.userId ||
    req.ip ||
    "user"
  ).replace(/[^a-zA-Z0-9_-]/g,"_");
}

app.post("/api/react-like/:id",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>String(p.id)===String(req.params.id));

  if(!post){
    return res.status(404).json({message:"Post tidak ditemukan"});
  }

  const u=getReactUid(req);

  post.likedBy=post.likedBy || {};
  post.unlikedBy=post.unlikedBy || {};

  // Kalau sudah like, klik lagi = batal like
  if(post.likedBy[u]){
    delete post.likedBy[u];
  }else{
    // Like aktif, unlike otomatis mati
    post.likedBy[u]=true;
    delete post.unlikedBy[u];
  }

  post.likes=Object.keys(post.likedBy).length;
  post.unlikes=Object.keys(post.unlikedBy).length;
  post.dislikes=post.unlikes;

  writePosts(posts);
  res.json(post);
});

app.post("/api/react-unlike/:id",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>String(p.id)===String(req.params.id));

  if(!post){
    return res.status(404).json({message:"Post tidak ditemukan"});
  }

  const u=getReactUid(req);

  post.likedBy=post.likedBy || {};
  post.unlikedBy=post.unlikedBy || {};

  // Kalau sudah unlike, klik lagi = batal unlike
  if(post.unlikedBy[u]){
    delete post.unlikedBy[u];
  }else{
    // Unlike aktif, like otomatis mati
    post.unlikedBy[u]=true;
    delete post.likedBy[u];
  }

  post.likes=Object.keys(post.likedBy).length;
  post.unlikes=Object.keys(post.unlikedBy).length;
  post.dislikes=post.unlikes;

  writePosts(posts);
  res.json(post);
});
/* =========================
   START SERVER
========================= */

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 Web aktif di port", PORT);
});

server.timeout = 0;

app.post("/api/admin/comment/:postId/:i", (req, res) => {
  console.log("KENA DELETE", req.params.postId, req.params.i);
  const posts = readPosts();
  const post = posts.find(p => String(p.id) === String(req.params.postId));

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.comments = Array.isArray(post.comments) ? post.comments : [];

const id = String(req.params.i);

post.comments = post.comments.filter(c => String(c.id) !== id);

writePosts(posts);

res.json({ ok: true, post });
});
