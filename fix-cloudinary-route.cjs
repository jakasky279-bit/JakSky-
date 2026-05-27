const fs = require("fs");

let txt = fs.readFileSync("server.js", "utf8");

const START = "/* ===== JAKSKY_CLOUDINARY_SERVER_PATCH_START ===== */";
const END = "/* ===== JAKSKY_CLOUDINARY_SERVER_PATCH_END ===== */";

// hapus patch lama
while (txt.includes(START) && txt.includes(END)) {
  const a = txt.indexOf(START);
  const b = txt.indexOf(END) + END.length;
  txt = txt.slice(0, a) + txt.slice(b);
}

const block = `
${START}
const fsJakCloud = require("fs");
const pathJakCloud = require("path");

const JAK_BUCKET = "jaksky-db";
const JAK_OBJECT = "db.json";

function jakDefaultDb(){
  return { videos: [], comments: [], updatedAt: new Date().toISOString() };
}

function jakLocalDbFile(){
  const dir = pathJakCloud.join(__dirname, "data");
  try { fsJakCloud.mkdirSync(dir, { recursive: true }); } catch(e){}
  return pathJakCloud.join(dir, "db.json");
}

function jakSbReady(){
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function jakSbHeaders(extra = {}){
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...extra
  };
}

async function jakEnsureBucket(){
  if(!jakSbReady()) return false;
  try{
    await fetch(process.env.SUPABASE_URL + "/storage/v1/bucket", {
      method: "POST",
      headers: jakSbHeaders({"content-type":"application/json"}),
      body: JSON.stringify({ id: JAK_BUCKET, name: JAK_BUCKET, public: false })
    });
    return true;
  }catch(e){
    return false;
  }
}

async function jakLoadDb(){
  const def = jakDefaultDb();

  if(jakSbReady()){
    try{
      await jakEnsureBucket();
      const r = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/" + JAK_BUCKET + "/" + JAK_OBJECT, {
        headers: jakSbHeaders()
      });
      if(r.ok){
        const data = await r.json();
        data.videos = Array.isArray(data.videos) ? data.videos : [];
        data.comments = Array.isArray(data.comments) ? data.comments : [];
        return { ...def, ...data };
      }
    }catch(e){}
  }

  try{
    const f = jakLocalDbFile();
    if(fsJakCloud.existsSync(f)){
      const data = JSON.parse(fsJakCloud.readFileSync(f, "utf8"));
      data.videos = Array.isArray(data.videos) ? data.videos : [];
      data.comments = Array.isArray(data.comments) ? data.comments : [];
      return { ...def, ...data };
    }
  }catch(e){}

  return def;
}

async function jakSaveDb(db){
  db.updatedAt = new Date().toISOString();

  if(jakSbReady()){
    try{
      await jakEnsureBucket();
      const r = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/" + JAK_BUCKET + "/" + JAK_OBJECT, {
        method: "POST",
        headers: jakSbHeaders({
          "content-type":"application/json",
          "x-upsert":"true"
        }),
        body: JSON.stringify(db)
      });
      if(r.ok) return true;
    }catch(e){}
  }

  try{
    fsJakCloud.writeFileSync(jakLocalDbFile(), JSON.stringify(db, null, 2));
    return true;
  }catch(e){
    return false;
  }
}

function jakMakeVideo(body){
  const now = new Date().toISOString();
  const id = body.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,8));
  const title = body.title || body.judul || body.name || "Video JakSky";
  const desc = body.description || body.deskripsi || "";
  const thumb = body.thumbnailUrl || body.thumbnail || body.thumb || "";
  const vid = body.videoUrl || body.video || body.url || "";
  const access = body.access || body.type || body.category || "public";

  return {
    id,
    title,
    judul: title,
    name: title,
    description: desc,
    deskripsi: desc,
    access,
    type: access,
    category: access,
    isVip: /vip/i.test(String(access)),
    thumbnail: thumb,
    thumbnailUrl: thumb,
    thumb,
    image: thumb,
    poster: thumb,
    video: vid,
    videoUrl: vid,
    url: vid,
    src: vid,
    views: 0,
    likes: 0,
    dislikes: 0,
    downloads: 0,
    comments: [],
    rating: 0,
    thumbnailPublicId: body.thumbnailPublicId || "",
    videoPublicId: body.videoPublicId || "",
    extra: body.extra || {},
    createdAt: now,
    updatedAt: now
  };
}

app.get("/api/cloudinary-videos", async (req, res) => {
  try{
    const db = await jakLoadDb();
    res.setHeader("cache-control", "no-store");
    res.json(db.videos || []);
  }catch(e){
    res.status(500).json([]);
  }
});

app.post("/api/admin/cloudinary-save", express.json({ limit: "5mb" }), async (req, res) => {
  try{
    const video = jakMakeVideo(req.body || {});
    if(!video.videoUrl && !video.thumbnailUrl){
      return res.status(400).json({ ok:false, error:"Tidak ada URL video/thumbnail" });
    }

    const db = await jakLoadDb();
    db.videos = Array.isArray(db.videos) ? db.videos : [];
    db.videos.unshift(video);

    await jakSaveDb(db);
    res.json({ ok:true, success:true, video, item:video });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});
${END}
`;

// taruh patch SEBELUM fallback API "API tidak ditemukan"
let idx = txt.indexOf('message: "API tidak ditemukan"');
if (idx < 0) idx = txt.indexOf("message: 'API tidak ditemukan'");
if (idx < 0) idx = txt.indexOf("API tidak ditemukan");

if (idx >= 0) {
  const before = txt.lastIndexOf("app.", idx);
  idx = before >= 0 ? before : idx;
} else {
  idx = txt.indexOf("// ===== VERCEL_SAFE_FINAL");
  if (idx < 0) idx = txt.indexOf("// ===== VERCEL_FINAL_EXPORT");
  if (idx < 0) idx = txt.indexOf("module.exports = app");
  if (idx < 0) idx = txt.length;
}

txt = txt.slice(0, idx) + "\n" + block + "\n" + txt.slice(idx);

fs.writeFileSync("server.js", txt);
console.log("✅ route Cloudinary dipindah sebelum fallback API");
