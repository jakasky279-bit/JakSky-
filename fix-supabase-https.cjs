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
const jakHttpsTop = require("https");

function jakSupabaseBaseTop() {
  return String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\\/rest\\/v1\\/?$/i, "")
    .replace(/\\/+$/, "");
}

function jakServiceKeyTop() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function jakReadyTop() {
  return !!(jakSupabaseBaseTop() && jakServiceKeyTop());
}

function jakHttpTop(method, path, body) {
  return new Promise((resolve, reject) => {
    const base = jakSupabaseBaseTop();
    const key = jakServiceKeyTop();

    if (!base) return reject(new Error("SUPABASE_URL kosong"));
    if (!key) return reject(new Error("SUPABASE_SERVICE_ROLE_KEY kosong"));
    if (!base.startsWith("https://")) return reject(new Error("SUPABASE_URL harus diawali https:// => " + base));

    const url = new URL(path, base);
    const payload = body ? JSON.stringify(body) : null;

    const headers = {
      apikey: key,
      authorization: "Bearer " + key,
      accept: "application/json"
    };

    if (payload) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(payload);
      headers["prefer"] = "return=representation";
    }

    const req = jakHttpsTop.request(url, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (d) => raw += d);
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: raw
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
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
    createdAt: now,
    updatedAt: now
  };
}

app.get(["/api/cloudinary-videos","/api/videos","/api/items","/api/all-videos","/api/admin/videos"], async (req, res) => {
  try {
    const r = await jakHttpTop("GET", "/rest/v1/jaksky_videos?select=data&order=created_at.desc");

    if (!r.ok) {
      return res.status(500).json({
        ok:false,
        error:"Supabase GET gagal",
        status:r.status,
        detail:r.text,
        base:jakSupabaseBaseTop()
      });
    }

    const rows = JSON.parse(r.text || "[]");
    res.setHeader("cache-control", "no-store");
    res.json(rows.map(x => x.data).filter(Boolean));
  } catch (e) {
    res.status(500).json({
      ok:false,
      error:e.message,
      code:e.code || "",
      base:jakSupabaseBaseTop(),
      hasKey:!!jakServiceKeyTop()
    });
  }
});

app.post("/api/admin/cloudinary-save", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const v = jakMakeVideoTop(req.body || {});

    if (!v.videoUrl && !v.thumbnailUrl) {
      return res.status(400).json({ ok:false, error:"URL video/thumbnail kosong" });
    }

    const r = await jakHttpTop("POST", "/rest/v1/jaksky_videos", {
      id: v.id,
      data: v
    });

    if (!r.ok) {
      return res.status(500).json({
        ok:false,
        saved:false,
        error:"Supabase POST gagal",
        status:r.status,
        detail:r.text,
        base:jakSupabaseBaseTop()
      });
    }

    res.json({ ok:true, success:true, saved:true, video:v, item:v });
  } catch (e) {
    res.status(500).json({
      ok:false,
      saved:false,
      error:e.message,
      code:e.code || "",
      base:jakSupabaseBaseTop(),
      hasKey:!!jakServiceKeyTop()
    });
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
console.log("✅ Supabase diganti pakai HTTPS request + debug");
