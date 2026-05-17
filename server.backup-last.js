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
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, "public"), { recursive: true });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, def){
  try{
    if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def,null,2));
    return JSON.parse(fs.readFileSync(file,"utf8") || JSON.stringify(def));
  }catch(e){ return def; }
}
function writeJson(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }
function readPosts(){ return readJson(POSTS_FILE, []); }
function writePosts(data){ writeJson(POSTS_FILE, data); }
function readAdmins(){ return readJson(ADMINS_FILE, [{name:"Owner",key1:"xyron",key2:"store123",role:"owner",avatar:"/uploads/admin.png",verified:true}]); }
function writeAdmins(data){ writeJson(ADMINS_FILE, data); }
function findAdmin(key1,key2,role){ return readAdmins().find(a=>a.key1===key1 && a.key2===key2 && (!role || a.role===role)); }

const upload = multer({ storage: multer.diskStorage({
  destination:(req,file,cb)=>cb(null,UPLOAD_DIR),
  filename:(req,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname||""))
})});

app.get("/api/posts",(req,res)=>res.json(readPosts()));
app.get("/api/admin/posts",(req,res)=>res.json(readPosts()));

app.post("/api/upload", upload.fields([{name:"thumbnail",maxCount:1},{name:"thumb",maxCount:1},{name:"video",maxCount:1}]), (req,res)=>{
  const posts=readPosts();
  const thumb=req.files?.thumbnail?.[0] || req.files?.thumb?.[0];
  const video=req.files?.video?.[0];
  const post={
    id:Date.now().toString(),
    title:req.body.title || req.body.judul || "Video",
    desc:req.body.desc || req.body.description || "",
    type:req.body.type || req.body.videoType || "public",
    key:req.body.key || req.body.vipKey || req.body.vip || "",
    expired:req.body.expired || "",
    thumb:thumb?"/uploads/"+thumb.filename:"",
    thumbnail:thumb?"/uploads/"+thumb.filename:"",
    video:video?"/uploads/"+video.filename:"",
    views:0,likes:0,dislikes:0,downloads:0,rating:0,ratings:[],
    comments:[],
    createdAt:new Date().toISOString()
  };
  posts.unshift(post); writePosts(posts); res.json({ok:true,post});
});

app.delete("/api/admin/posts/:id",(req,res)=>{
  writePosts(readPosts().filter(p=>p.id!==req.params.id));
  res.json({ok:true});
});

app.post("/api/posts/:id/view",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  p.views=Number(p.views||0)+1; writePosts(posts); res.json(p);
});

app.post(["/api/download/:id","/api/posts/:id/download"],(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  p.downloads=Number(p.downloads||0)+1; writePosts(posts); res.json(p);
});

app.post("/api/posts/:id/like",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  p.likes=Number(p.likes||0)+1; writePosts(posts); res.json(p);
});

app.post("/api/posts/:id/dislike",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  p.dislikes=Number(p.dislikes||0)+1; writePosts(posts); res.json(p);
});

app.post("/api/posts/:id/rating",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  const val=Number(req.body.rating || req.body.value || 0);
  if(val<1 || val>5) return res.status(400).json({message:"Rating salah"});
  p.ratings=Array.isArray(p.ratings)?p.ratings:[];
  p.ratings.push(val);
  p.rating=p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length;
  writePosts(posts); res.json(p);
});

app.post("/api/posts/:id/comment",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  p.comments=Array.isArray(p.comments)?p.comments:[];
  p.comments.push({id:Date.now().toString(),name:req.body.name||"User",text:req.body.text||req.body.comment||"",userId:req.body.userId||req.headers["x-user-id"]||"",role:req.body.role||"user",replies:[],createdAt:new Date().toISOString()});
  writePosts(posts); res.json(p);
});

app.post("/api/admin/posts/:postId/comments/:i/reply",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.postId);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  const c=p.comments?.[Number(req.params.i)];
  if(!c) return res.status(404).json({message:"Komentar tidak ditemukan"});
  c.replies=Array.isArray(c.replies)?c.replies:[];
  c.replies.push({name:req.body.adminName||"Admin",text:req.body.text||"",role:req.body.role||"admin",avatar:req.body.avatar||"/uploads/admin.png",verified:true,createdAt:new Date().toISOString()});
  writePosts(posts); res.json(p);
});

app.delete("/api/admin/delete-comment/:postId/:i",(req,res)=>{
  const posts=readPosts(); const p=posts.find(x=>x.id===req.params.postId);
  if(!p) return res.status(404).json({message:"Post tidak ditemukan"});
  p.comments.splice(Number(req.params.i),1); writePosts(posts); res.json(p);
});

app.post("/api/role-login",(req,res)=>{
  const {key1,key2,role}=req.body||{};
  const admin=findAdmin(key1,key2,role);
  if(!admin) return res.status(401).json({message:"Login salah"});
  res.json({ok:true,admin,adminRole:admin.role,adminName:admin.name});
});

app.get("/api/owner/accounts",(req,res)=>res.json(readAdmins()));

app.post("/api/owner/accounts",(req,res)=>{
  const {name,key1,key2,role}=req.body||{};
  if(!name||!key1||!key2||!role) return res.status(400).json({message:"Data belum lengkap"});
  if(role==="owner") return res.status(400).json({message:"Owner utama tidak bisa dibuat dari panel"});
  const admins=readAdmins(); const old=admins.find(a=>a.name===name);
  if(old){ old.key1=key1; old.key2=key2; old.role=role; old.verified=true; }
  else admins.push({name,key1,key2,role,avatar:"/uploads/admin.png",verified:true});
  writeAdmins(admins); res.json({ok:true,admins});
});

app.delete("/api/owner/accounts/:name",(req,res)=>{
  let admins=readAdmins().filter(a=>a.name!==req.params.name || a.role==="owner");
  writeAdmins(admins); res.json({ok:true,admins});
});

app.post("/api/admin/profile", upload.single("avatar"), (req,res)=>{
  const admins=readAdmins();
  const name=req.body.name||"Admin", key1=req.body.key1||"", key2=req.body.key2||"", role=req.body.role||"admin";
  const avatar=req.file?"/uploads/"+req.file.filename:"/uploads/admin.png";
  const old=admins.find(a=>a.name===name);
  if(old){ old.key1=key1; old.key2=key2; old.role=role; old.avatar=avatar; old.verified=true; }
  else admins.push({name,key1,key2,role,avatar,verified:true});
  writeAdmins(admins); res.json({ok:true,admins});
});





// ===== ADMIN LOGIN AUTO FIX =====
function clean(v){ return String(v || "").trim().toLowerCase(); }

function loginAdminAuto(req,res){
  const b = req.body || {};
  const k1 = clean(b.key1 || b.username || b.user || b.name);
  const k2 = clean(b.key2 || b.password || b.pass || b.sandi);

  const admin = readAdmins().find(a =>
    clean(a.key1) === k1 &&
    clean(a.key2) === k2 &&
    clean(a.role) === "admin"
  );

  if(!admin) return res.status(401).json({message:"Login salah"});
  res.json({ok:true,admin,adminRole:"admin",adminName:admin.name});
}

app.post("/api/admin/login", loginAdminAuto);
app.post("/api/login-admin", loginAdminAuto);
app.post("/api/login", loginAdminAuto);


app.post("/api/admin-login-final",(req,res)=>{
  const b=req.body||{};
  const key1=String(b.key1||"").trim().toLowerCase();
  const key2=String(b.key2||"").trim().toLowerCase();

  const admin=readAdmins().find(a=>
    String(a.key1||"").trim().toLowerCase()===key1 &&
    String(a.key2||"").trim().toLowerCase()===key2 &&
    String(a.role||"").trim().toLowerCase()==="admin"
  );

  if(!admin) return res.status(401).json({message:"Login salah"});
  res.json({ok:true,admin,adminRole:"admin",adminName:admin.name});
});


// ===== LOGIN ADMIN PASTI FIX =====
app.post("/api/admin-login-pasti",(req,res)=>{
  const b=req.body||{};
  const key1=String(b.key1||b.username||b.name||"").trim().toLowerCase();
  const key2=String(b.key2||b.password||b.pass||"").trim().toLowerCase();

  const admin=readAdmins().find(a=>
    String(a.name||"").trim().toLowerCase()===key1 &&
    String(a.key2||"").trim().toLowerCase()===key2 &&
    String(a.role||"").trim().toLowerCase()==="admin"
  );

  if(!admin) return res.status(401).json({message:"Login salah"});
  res.json({ok:true,admin,adminName:admin.name,adminRole:"admin"});
});

app.listen(PORT,"0.0.0.0",()=>console.log("🔥 Web aktif di http://localhost:"+PORT));
