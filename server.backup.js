require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");


// ===== ADMIN CONFIG =====
const ADMIN_AVATAR = "/uploads/admin.png";

const app =
 express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname,"uploads")));

const DATA_DIR = path.join(__dirname,"data");
const DATA_FILE = path.join(DATA_DIR,"posts.json");
fs.mkdirSync(DATA_DIR,{recursive:true});
fs.mkdirSync(path.join(__dirname,"uploads"),{recursive:true});

function readPosts(){
  if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE,"[]","utf8");
  return JSON.parse(fs.readFileSync(DATA_FILE,"utf8") || "[]");
}
function writePosts(posts){
  fs.writeFileSync(DATA_FILE, JSON.stringify(posts,null,2),"utf8");
}

const ADMIN_PROFILE_FILE = path.join(DATA_DIR,"admins.json");


    ],null,2),"utf8");
  }
  return JSON.parse(fs.readFileSync(ADMIN_PROFILE_FILE,"utf8") || "[]");
}

function findAdminByName(name){
  const admins = readAdmins();
  return admins.find(a=>(a.name||"").toLowerCase()===(name||"").toLowerCase()) || admins[0] || {name:"Admin", avatar:"/uploads/admin.png", verified:true};
}

function makeId(){
  return Date.now().toString()+Math.random().toString(36).slice(2,7);
}

const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,path.join(__dirname,"uploads")),
  filename:(req,file,cb)=>cb(null,Date.now()+"-"+file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"))
});
const upload = multer({storage});

app.get("/api/posts",(req,res)=>res.json(readPosts()));

app.post("/api/admin/login",(req,res)=>{
  const {key1,key2,password}=req.body||{};
  const admins = readAdmins();
  const PASS=process.env.ADMIN_PASSWORD||"12345";

  const admin = admins.find(a=>a.key1===key1 && a.key2===key2);

  if(admin || password===PASS){
    const chosen = admin || admins[0] || {name:"Admin",avatar:"/uploads/admin.png",verified:true};
    return res.json({ok:true,success:true,admin:chosen});
  }

  res.status(401).json({message:"Kunci admin salah"});
});

app.get("/api/admin/posts",(req,res)=>res.json(readPosts()));

app.post("/api/admin/upload", upload.fields([{name:"thumb",maxCount:1},{name:"video",maxCount:9}]), (req,res)=>{
  const posts=readPosts();
  const thumb=req.files?.thumb?.[0]?"/uploads/"+req.files.thumb[0].filename:"";
  const videos=req.files?.video?.map(f=>"/uploads/"+f.filename)||[];
  if(!thumb) return res.status(400).json({message:"Thumbnail belum dipilih"});
  if(!videos.length) return res.status(400).json({message:"Video belum dipilih"});

  const vip=req.body.isVip==="true"||req.body.isVip==="on";
  const post={
    id:makeId(),
    title:req.body.title||"Tanpa Judul",
    desc:req.body.desc||"",
    thumb,
    videos,
    video:videos[0],
    isVip:vip,
    locked:vip,
    videoKey:req.body.videoKey||"",
    expiredAt:req.body.expiredAt||"",
    expired:false,
    views:0,
    viewUsers:[],
    likes:0,
    unlikes:0,
    downloads:0,
    comments:[],
    ratings:{},
    ratingAvg:"0.0",
    ratingCount:0,
    createdAt:new Date().toISOString()
  };
  posts.unshift(post);
  writePosts(posts);
  res.json(post);
});

app.delete("/api/admin/posts/:id",(req,res)=>{
  writePosts(readPosts().filter(p=>p.id!==req.params.id));
  res.json({ok:true});
});

app.post("/api/video/:id/unlock",(req,res)=>{
  const post=readPosts().find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  if(post.videoKey && req.body.key!==post.videoKey) return res.status(401).json({message:"Kunci salah"});
  res.json({videos:post.videos||[post.video]});
});

app.post("/api/posts/:id/view",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  const uid=req.headers["x-user-id"]||"unknown";
  post.viewUsers=post.viewUsers||[];
  if(!post.viewUsers.includes(uid)){
    post.viewUsers.push(uid);
    post.views=Number(post.views||0)+1;
    writePosts(posts);
  }
  res.json(post);
});

app.post("/api/posts/:id/like",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  post.likes=Number(post.likes||0)+1;
  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/unlike",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  post.unlikes=Number(post.unlikes||0)+1;
  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/rate",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  const uid=req.headers["x-user-id"]||"user";
  const rate=Number(req.body.rate||0);
  if(rate<1||rate>5) return res.status(400).json({message:"Rating salah"});
  post.ratings=post.ratings||{};
  post.ratings[uid]=rate;
  const vals=Object.values(post.ratings).map(Number);
  post.ratingCount=vals.length;
  post.ratingAvg=(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/comment",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  post.comments=post.comments||[];
  post.comments.push({
    id:makeId(),
    userId:req.body.userId||req.headers["x-user-id"]||"",
    name:req.body.name||"User",
    text:req.body.text||"",
    isAdmin:false,
    replies:[]
  });
  writePosts(posts);
  res.json(post);
});

app.post("/api/posts/:id/comments/:cid/reply",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  const c=post.comments.find(x=>x.id===req.params.cid)||post.comments[Number(req.params.cid)];
  if(!c) return res.status(404).json({message:"Komentar tidak ditemukan"});
  c.replies=c.replies||[];
  c.replies.push({id:makeId(),name:req.body.name||"User",text:req.body.text||"",isAdmin:false});
  writePosts(posts);
  res.json(post);
});

app.post("/api/admin/posts/:id/comments/:cid/reply",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  const c=post.comments.find(x=>x.id===req.params.cid)||post.comments[Number(req.params.cid)];
  if(!c) return res.status(404).json({message:"Komentar tidak ditemukan"});
  c.replies=c.replies||[];
  c.replies.push({id:makeId(),name:"Admin",text:req.body.text||"",isAdmin:true, avatar: ADMIN_AVATAR});
  writePosts(posts);
  res.json(post);
});

app.delete("/api/user/delete-comment/:postId/:commentIndex",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.postId);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  const i=Number(req.params.commentIndex);
  const uid=req.headers["x-user-id"];
  if(!post.comments?.[i]) return res.status(404).json({message:"Komentar tidak ditemukan"});
  if(post.comments[i].userId!==uid) return res.status(403).json({message:"Tidak boleh hapus komentar orang lain"});
  post.comments.splice(i,1);
  writePosts(posts);
  res.json(post);
});

app.delete("/api/admin/delete-comment/:postId/:commentIndex",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.postId);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  const i=Number(req.params.commentIndex);
  if(!post.comments?.[i]) return res.status(404).json({message:"Komentar tidak ditemukan"});
  post.comments.splice(i,1);
  writePosts(posts);
  res.json(post);
});

app.post("/api/download/:id",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  post.downloads=Number(post.downloads||0)+1;
  writePosts(posts);
  console.log("DOWNLOAD +1:",post.id,"=",post.downloads);
  res.json(post);
});

app.post("/api/posts/:id/download",(req,res)=>{
  const posts=readPosts();
  const post=posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({message:"Post tidak ditemukan"});
  post.downloads=Number(post.downloads||0)+1;
  writePosts(posts);
  res.json(post);
});


app.get("/api/admin/profiles",(req,res)=>{
  res.json(readAdmins());
});

app.post("/api/admin/profile", upload.single("avatar"), (req,res)=>{
  const admins = readAdmins();
  const name = req.body.name || "Admin";
  const key1 = req.body.key1 || "xyron";
  const key2 = req.body.key2 || "store123";
  const avatar = req.file ? "/uploads/"+req.file.filename : (req.body.avatar || "/uploads/admin.png");
  const role = req.body.role || "admin";

  let admin = admins.find(a=>a.name===name);
  if(admin){
    admin.key1 = key1;
    admin.key2 = key2;
    admin.avatar = avatar;
    admin.verified = true;
    admin.role = role;
  }else{
    admin = {name,key1,key2,avatar,verified:true,role};
    admins.push(admin);
  }

  writeAdmins(admins);
  res.json(admin);
});


app.get("/api/owner/admins",(req,res)=>{
  res.json(readAdmins ? readAdmins() : []);
});

app.post("/api/owner/admins",(req,res)=>{
  const admins = readAdmins();
  const {name,key1,key2,role} = req.body;

  if(!name || !key1 || !key2){
    return res.status(400).json({message:"Data belum lengkap"});
  }

  const old = admins.find(a=>a.name===name);
  if(old){
    old.key1=key1;
    old.key2=key2;
    old.role=role || "admin";
    old.verified=true;
  }else{
    admins.push({
      name,
      key1,
      key2,
      role:role || "admin",
      avatar:"/uploads/admin.png",
      verified:true
    });
  }

  writeAdmins(admins);
  res.json({ok:true,admins});
});

app.delete("/api/owner/admins/:name",(req,res)=>{
  let admins = readAdmins();
  admins = admins.filter(a=>a.name !== req.params.name && a.role !== "owner");
  writeAdmins(admins);
  res.json({ok:true,admins});
});


app.post("/api/role-login",(req,res)=>{
  const {key1,key2,role}=req.body||{};
  const admin = findLogin(key1,key2,role);
  if(!admin) return res.status(401).json({message:"Login salah"});
  res.json({ok:true,admin});
});

app.get("/api/owner/accounts",(req,res)=>{
  res.json(readAdmins());
});

app.post("/api/owner/accounts",(req,res)=>{
  const {name,key1,key2,role}=req.body||{};
  if(!name || !key1 || !key2 || !role){
    return res.status(400).json({message:"Data belum lengkap"});
  }
  if(role==="owner"){
    return res.status(400).json({message:"Owner utama tidak bisa dibuat dari panel"});
  }

  const admins=readAdmins();
  const old=admins.find(a=>a.name===name);
  if(old){
    old.key1=key1;
    old.key2=key2;
    old.role=role;
  }else{
    admins.push({name,key1,key2,role,avatar:"/uploads/admin.png",verified:true});
  }

  writeAdmins(admins);
  res.json({ok:true,admins});
});

app.delete("/api/owner/accounts/:name",(req,res)=>{
  let admins=readAdmins();
  admins=admins.filter(a=>a.name!==req.params.name || a.role==="owner");
  writeAdmins(admins);
  res.json({ok:true,admins});
});

app.listen(PORT,()=>console.log("Web aktif di http://localhost:"+PORT));
