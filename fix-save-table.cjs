const fs = require("fs");

let txt = fs.readFileSync("server.js", "utf8");

const START = "/* ===== JAKSKY_FORCE_CLOUDINARY_TOP_START ===== */";
const END = "/* ===== JAKSKY_FORCE_CLOUDINARY_TOP_END ===== */";

while (txt.includes(START) && txt.includes(END)) {
  const a = txt.indexOf(START);
  const b = txt.indexOf(END) + END.length;
  txt = txt.slice(0, a) + txt.slice(b);
}

const block = `
${START}
function jakHeadersTop(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...extra
  };
}

function jakReadyTop() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function jakMakeVideoTop(body) {
  const now = new Date().toISOString();
  const title = body.title || body.judul || body.name || "Video JakSky";
  const thumb = body.thumbnailUrl || body.thumbnail || body.thumb || "";
  const video = body.videoUrl || body.video || body.url || "";
  const access = body.access || body.type || body.category || "public";

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
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
  try {
    if (!jakReadyTop()) return res.json([]);

    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/jaksky_videos?select=data&order=created_at.desc", {
      headers: jakHeadersTop()
    });

    if (!r.ok) return res.json([]);

    const rows = await r.json();
    const videos = rows.map(x => x.data).filter(Boolean);

    res.setHeader("cache-control", "no-store");
    res.json(videos);
  } catch (e) {
    res.status(500).json([]);
  }
});

app.post("/api/admin/cloudinary-save", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    if (!jakReadyTop()) {
      return res.status(500).json({ ok:false, error:"SUPABASE env belum ada" });
    }

    const v = jakMakeVideoTop(req.body || {});
    if (!v.videoUrl && !v.thumbnailUrl) {
      return res.status(400).json({ ok:false, error:"URL video/thumbnail kosong" });
    }

    const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/jaksky_videos", {
      method: "POST",
      headers: jakHeadersTop({
        "content-type": "application/json",
        "prefer": "return=representation"
      }),
      body: JSON.stringify({
        id: v.id,
        data: v
      })
    });

    const text = await r.text();

    if (!r.ok) {
      return res.status(500).json({ ok:false, saved:false, error:text });
    }

    res.json({ ok:true, success:true, saved:true, video:v, item:v });
  } catch (e) {
    res.status(500).json({ ok:false, saved:false, error:e.message });
  }
});
${END}
`;

const m = txt.match(/const\s+app\s*=\s*express\s*\(\s*\)\s*;?/);
if (!m) {
  console.error("Tidak ketemu const app = express()");
  process.exit(1);
}

const pos = m.index + m[0].length;
txt = txt.slice(0, pos) + "\n" + block + "\n" + txt.slice(pos);

fs.writeFileSync("server.js", txt);
console.log("✅ save video sekarang pakai Supabase table jaksky_videos");
