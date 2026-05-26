const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "data")
  : path.join(__dirname, "data");

const UPLOAD_DIR = process.env.VERCEL
  ? path.join("/tmp", "uploads")
  : path.join(__dirname, "uploads");

const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, "public"), { recursive: true });

app.use(express.json({ limit: "80mb" }));
app.use(express.urlencoded({ extended: true, limit: "80mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, def) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(def, null, 2));
    }
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(def));
  } catch {
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
      id: "owner",
      name: "Owner",
      key1: "xyron",
      key2: "store123",
      role: "owner",
      status: "active",
      verified: true
    }
  ]);
}

function writeAdmins(data) {
  writeJson(ADMINS_FILE, data);
}

function makeId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 8);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + safe);
  }
});

const upload = multer({ storage });

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "JakSky running" });
});

app.get("/api/posts", (req, res) => {
  res.json(readPosts());
});

app.get("/api/admin/posts", (req, res) => {
  res.json(readPosts());
});

app.post(
  ["/api/upload", "/api/admin/upload"],
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "thumb", maxCount: 1 },
    { name: "video", maxCount: 20 }
  ]),
  (req, res) => {
    const posts = readPosts();

    const thumbFile =
      req.files?.thumbnail?.[0] ||
      req.files?.thumb?.[0];

    const videoFiles = req.files?.video || [];

    if (!thumbFile) {
      return res.status(400).json({ message: "Thumbnail belum dipilih" });
    }

    if (!videoFiles.length) {
      return res.status(400).json({ message: "Video belum dipilih" });
    }

    const videos = videoFiles.map((f) => "/uploads/" + f.filename);

    const post = {
      id: makeId(),
      title: req.body.title || req.body.judul || "Video",
      desc: req.body.desc || req.body.description || "",
      thumb: "/uploads/" + thumbFile.filename,
      thumbnail: "/uploads/" + thumbFile.filename,
      video: videos[0],
      videos,
      isVip: req.body.isVip === "true" || req.body.type === "vip",
      vip: req.body.isVip === "true" || req.body.type === "vip",
      videoKey: req.body.videoKey || req.body.key || req.body.vipKey || "",
      expiredAt: req.body.expiredAt || "",
      expired: false,
      views: 0,
      viewUsers: [],
      likes: 0,
      unlikes: 0,
      dislikes: 0,
      downloads: 0,
      comments: [],
      ratings: {},
      ratingAvg: "0.0",
      ratingCount: 0,
      createdAt: new Date().toISOString()
    };

    posts.unshift(post);
    writePosts(posts);

    res.json({ ok: true, post });
  }
);

app.delete("/api/admin/posts/:id", (req, res) => {
  const posts = readPosts().filter((p) => p.id !== req.params.id);
  writePosts(posts);
  res.json({ ok: true });
});

app.post("/api/posts/:id/view", (req, res) => {
  const posts = readPosts();
  const post = posts.find((p) => p.id === req.params.id);

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const uid = req.headers["x-user-id"] || req.body.userId || "unknown";

  post.viewUsers = post.viewUsers || [];

  if (!post.viewUsers.includes(uid)) {
    post.viewUsers.push(uid);
    post.views = Number(post.views || 0) + 1;
    writePosts(posts);
  }

  res.json(post);
});

app.post("/api/posts/:id/like", (req, res) => {
  const posts = readPosts();
  const post = posts.find((p) => p.id === req.params.id);

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.likes = Number(post.likes || 0) + 1;
  writePosts(posts);
  res.json(post);
});

app.post(["/api/posts/:id/unlike", "/api/posts/:id/dislike"], (req, res) => {
  const posts = readPosts();
  const post = posts.find((p) => p.id === req.params.id);

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.unlikes = Number(post.unlikes || post.dislikes || 0) + 1;
  post.dislikes = post.unlikes;
  writePosts(posts);
  res.json(post);
});

app.post(["/api/posts/:id/rate", "/api/posts/:id/rating"], (req, res) => {
  const posts = readPosts();
  const post = posts.find((p) => p.id === req.params.id);

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const uid = req.headers["x-user-id"] || req.body.userId || "user";
  const rate = Number(req.body.rate || req.body.rating || req.body.value || 0);

  if (rate < 1 || rate > 5) {
    return res.status(400).json({ message: "Rating salah" });
  }

  post.ratings = post.ratings || {};
  post.ratings[uid] = rate;

  const vals = Object.values(post.ratings).map(Number);
  post.ratingCount = vals.length;
  post.ratingAvg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  post.rating = Number(post.ratingAvg);

  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/comment", (req, res) => {
  const posts = readPosts();
  const post = posts.find((p) => p.id === req.params.id);

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  post.comments = post.comments || [];

  post.comments.push({
    id: makeId(),
    userId: req.body.userId || req.headers["x-user-id"] || "",
    name: req.body.name || "User",
    text: req.body.text || req.body.comment || "",
    isAdmin: false,
    replies: [],
    createdAt: new Date().toISOString()
  });

  writePosts(posts);
  res.json(post);
});

app.delete("/api/admin/delete-comment/:postId/:commentIndex", (req, res) => {
  const posts = readPosts();
  const post = posts.find((p) => p.id === req.params.postId);

  if (!post) return res.status(404).json({ message: "Post tidak ditemukan" });

  const i = Number(req.params.commentIndex);

  if (!post.comments?.[i]) {
    return res.status(404).json({ message: "Komentar tidak ditemukan" });
  }

  post.comments.splice(i, 1);
  writePosts(posts);

  res.json(post);
});

app.post("/api/role-login", (req, res) => {
  const { key1, key2, role } = req.body || {};
  const admins = readAdmins();

  const admin = admins.find((a) => {
    const okKey = a.key1 === key1 && a.key2 === key2;
    const okRole = !role || a.role === role;
    const okStatus = !a.status || a.status === "active";
    return okKey && okRole && okStatus;
  });

  if (!admin) {
    return res.status(401).json({ message: "Login salah atau akun belum aktif" });
  }

  res.json({
    ok: true,
    admin,
    adminRole: admin.role,
    adminName: admin.name
  });
});

app.get("/api/owner/accounts", (req, res) => {
  res.json(readAdmins());
});

app.post("/api/owner/accounts", (req, res) => {
  const { name, key1, key2, role } = req.body || {};

  if (!name || !key1 || !key2 || !role) {
    return res.status(400).json({ message: "Data belum lengkap" });
  }

  if (role === "owner") {
    return res.status(400).json({ message: "Owner utama tidak bisa dibuat" });
  }

  const admins = readAdmins();

  if (admins.find((a) => a.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ message: "Nama akun sudah ada" });
  }

  const acc = {
    id: makeId(),
    name,
    key1,
    key2,
    role,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  admins.push(acc);
  writeAdmins(admins);

  res.json({ ok: true, account: acc, accounts: admins });
});

app.patch("/api/owner/accounts/:id", (req, res) => {
  const admins = readAdmins();

  const next = admins.map((a) => {
    if (a.id !== req.params.id) return a;

    return {
      ...a,
      status: req.body.status || a.status
    };
  });

  writeAdmins(next);
  res.json({ ok: true, accounts: next });
});

app.delete("/api/owner/accounts/:id", (req, res) => {
  const next = readAdmins().filter((a) => a.id !== req.params.id && a.role !== "owner");
  writeAdmins(next);
  res.json({ ok: true, accounts: next });
});

app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "API tidak ditemukan" });
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("Web aktif di http://localhost:" + PORT);
  });
}

module.exports = app;
