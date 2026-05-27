const fs = require("fs");

let txt = fs.readFileSync("server.js", "utf8");

const START = "/* ===== JAKSKY_FORCE_CLOUDINARY_TOP_START ===== */";
const END = "/* ===== JAKSKY_FORCE_CLOUDINARY_TOP_END ===== */";

// hapus patch top lama kalau ada
while (txt.includes(START) && txt.includes(END)) {
  const a = txt.indexOf(START);
  const b = txt.indexOf(END) + END.length;
  txt = txt.slice(0, a) + txt.slice(b);
}

const block = `
${START}
const JAKSKY_DB_BUCKET_TOP = "jaksky-db";
const JAKSKY_DB_FILE_TOP = "db.json";

function jakskyDefaultDbTop(){
  return { videos: [], comments: [], updatedAt: new Date().toISOString() };
}

async function jakskyEnsureBucketTop(){
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try{
    await fetch(process.env.SUPABASE_URL + "/storage/v1/bucket", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        id: JAKSKY_DB_BUCKET_TOP,
        name: JAKSKY_DB_BUCKET_TOP,
        public: false
      })
    });
  }catch(e){}
  return true;
}

async function jakskyLoadDbTop(){
  const def = jakskyDefaultDbTop();

  if(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY){
    try{
      await jakskyEnsureBucketTop();
      const r = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/" + JAKSKY_DB_BUCKET_TOP + "/" + JAKSKY_DB_FILE_TOP, {
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY
        }
      });
      if(r.ok){
        const data = await r.json();
        data.videos = Array.isArray(data.videos) ? data.videos : [];
        data.comments = Array.isArray(data.comments) ? data.comments : [];
        return { ...def, ...data };
      }
    }catch(e){}
  }

  return def;
}

async function jakskySaveDbTop(db){
  db.updatedAt = new Date().toISOString();

  if(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY){
    await jakskyEnsureBucketTop();
    const r = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/" + JAKSKY_DB_BUCKET_TOP + "/" + JAKSKY_DB_FILE_TOP, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-upsert": "true",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify(db)
    });
    return r.ok;
  }

  return false;
}

function jakskyVideoTop(body){
  const now = new Date().toISOString();
  const title = body.title || body.judul || body.name || "Video JakSky";
  const thumb = body.thumbnailUrl || body.thumbnail || body.thumb || "";
  const video = body.videoUrl || body.video || body.url || "";
  const access = body.access || body.type || body.category || "public";

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,8),
    title,
    judul: title,
    name: title,
    description: body.description || body.deskripsi || "",
    deskripsi: body.description || body.deskripsi || "",
    access,
    type: access,
    category: access,
    isVip: /vip/i.test(String(access)),
    thumbnail: thumb,
    thumbnailUrl: thumb,
    thumb,
    image: thumb,
    poster: thumb,
    video,
    videoUrl: video,
    url: video,
    src: video,
    views: 0,
    likes: 0,
    dislikes: 0,
    downloads: 0,
    comments: [],
    rating: 0,
    thumbnailPublicId: body.thumbnailPublicId || "",
    videoPublicId: body.videoPublicId || "",
    createdAt: now,
    updatedAt: now
  };
}

app.get(["/api/cloudinary-videos","/api/videos","/api/items","/api/all-videos","/api/admin/videos"], async (req, res) => {
  const db = await jakskyLoadDbTop();
  res.setHeader("cache-control", "no-store");
  res.json(db.videos || []);
});

app.post("/api/admin/cloudinary-save", express.json({ limit: "10mb" }), async (req, res) => {
  try{
    const v = jakskyVideoTop(req.body || {});
    if(!v.videoUrl && !v.thumbnailUrl){
      return res.status(400).json({ ok:false, error:"URL video/thumbnail kosong" });
    }

    const db = await jakskyLoadDbTop();
    db.videos = Array.isArray(db.videos) ? db.videos : [];
    db.videos.unshift(v);

    const saved = await jakskySaveDbTop(db);
    res.json({ ok:true, success:true, saved, video:v, item:v });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});
${END}
`;

const m = txt.match(/const\s+app\s*=\s*express\s*\(\s*\)\s*;?/);
if(!m){
  console.error("❌ Tidak ketemu const app = express()");
  process.exit(1);
}

const pos = m.index + m[0].length;
txt = txt.slice(0, pos) + "\n" + block + "\n" + txt.slice(pos);

fs.writeFileSync("server.js", txt);
console.log("✅ route Cloudinary dipasang paling atas setelah app express");
