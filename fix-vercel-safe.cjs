const fs = require("fs");

let txt = fs.readFileSync("server.js", "utf8");

fs.writeFileSync("server.backup-safe.js", txt);

// data/uploads aman untuk Vercel
txt = txt.replace(
  /const DATA_DIR\s*=\s*path\.join\(__dirname,\s*["']data["']\);/g,
  'const DATA_DIR = process.env.VERCEL ? path.join("/tmp", "data") : path.join(__dirname, "data");'
);

txt = txt.replace(
  /const UPLOAD_DIR\s*=\s*path\.join\(__dirname,\s*["']uploads["']\);/g,
  'const UPLOAD_DIR = process.env.VERCEL ? path.join("/tmp", "uploads") : path.join(__dirname, "uploads");'
);

// hapus patch lama kalau ada
txt = txt.replace(/\/\/ ===== VERCEL[\s\S]*$/g, "");

// hapus module.exports lama
txt = txt.replace(/\n\s*module\.exports\s*=\s*app\s*;?\s*/g, "\n");

// hapus app.listen lama
txt = txt.replace(/\n\s*app\.listen\s*\([\s\S]*?\n\s*\}\s*\)\s*;?/g, "\n");
txt = txt.replace(/\n\s*app\.listen\s*\([\s\S]*?\n\s*\)\s*;?/g, "\n");

// tambah export aman
txt += `

// ===== VERCEL_SAFE_FINAL =====
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
`;

fs.writeFileSync("server.js", txt);
console.log("✅ server.js berhasil dipatch aman buat Vercel");
