(function(){
  if(window.__JAKSKY_CLOUDINARY_PATCH__) return;
  window.__JAKSKY_CLOUDINARY_PATCH__ = true;

  const CLOUD_NAME = "dwj9xnhqt";
  const UPLOAD_PRESET = "Jaksky";
  const oldFetch = window.fetch.bind(window);

  function isFile(v){
    return v && typeof v === "object" && typeof v.name === "string" && typeof v.size === "number";
  }

  function getFile(fd, kind){
    const arr = [];
    for(const [k,v] of fd.entries()){
      if(isFile(v) && v.size > 0) arr.push([String(k).toLowerCase(), v]);
    }
    if(kind === "video"){
      return (arr.find(([k,f]) => f.type.startsWith("video/") || k.includes("video")) || [null,null])[1];
    }
    return (arr.find(([k,f]) => f.type.startsWith("image/") || k.includes("thumb") || k.includes("image") || k.includes("foto")) || [null,null])[1];
  }

  function val(fd, keys){
    for(const k of keys){
      const v = fd.get(k);
      if(v && !isFile(v)) return String(v);
    }
    return "";
  }

  function info(msg){
    let el = document.getElementById("jaksky-cloudinary-info");
    if(!el){
      el = document.createElement("div");
      el.id = "jaksky-cloudinary-info";
      el.style.cssText = "position:fixed;left:18px;right:18px;bottom:18px;z-index:999999;background:#fff;color:#f2389a;border:1px solid #ffc1dd;border-radius:18px;padding:14px 16px;font-weight:800;box-shadow:0 15px 35px rgba(0,0,0,.22);white-space:pre-line";
      document.body.appendChild(el);
    }
    el.textContent = msg;
  }

  function uploadCloud(file, label){
    return new Promise((resolve, reject) => {
      if(!file) return resolve(null);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", UPLOAD_PRESET);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);

      xhr.upload.onprogress = (e) => {
        if(e.lengthComputable){
          const p = Math.round((e.loaded / e.total) * 100);
          info(`Mengupload ${label} ${p}%\nJangan keluar.`);
        } else {
          info(`Mengupload ${label}...\nJangan keluar.`);
        }
      };

      xhr.onload = () => {
        try{
          const json = JSON.parse(xhr.responseText || "{}");
          if(xhr.status >= 200 && xhr.status < 300 && json.secure_url){
            resolve(json);
          } else {
            reject(new Error(json.error?.message || "Upload Cloudinary gagal"));
          }
        }catch(e){ reject(e); }
      };

      xhr.onerror = () => reject(new Error("Koneksi upload gagal"));
      xhr.send(fd);
    });
  }

  window.fetch = async function(input, init = {}){
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = String(init.method || "GET").toUpperCase();

    if(method === "GET" && /\/api\/(videos|items|all-videos|admin\/videos)(\?|$)/i.test(url) && !url.includes("cloudinary")){
      return oldFetch("/api/cloudinary-videos?t=" + Date.now(), {cache:"no-store"});
    }

    if(method !== "GET" && init.body instanceof FormData && /upload/i.test(url)){
      const fd = init.body;
      const videoFile = getFile(fd, "video");
      const thumbFile = getFile(fd, "image");

      if(videoFile || thumbFile){
        try{
          info("Mulai upload ke Cloudinary...");
          const thumb = await uploadCloud(thumbFile, "thumbnail");
          const video = await uploadCloud(videoFile, "video");

          const extra = {};
          for(const [k,v] of fd.entries()){
            if(!isFile(v)) extra[k] = v;
          }

          const title = val(fd, ["title","judul","name","nama","videoTitle"]) || (videoFile ? videoFile.name.replace(/\.[^/.]+$/, "") : "Video JakSky");
          const description = val(fd, ["description","deskripsi","desc"]) || "";
          const access = val(fd, ["access","type","kategori","category","visibility"]) || "public";

          const res = await oldFetch("/api/admin/cloudinary-save", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
              title,
              description,
              access,
              extra,
              thumbnailUrl: thumb ? thumb.secure_url : "",
              videoUrl: video ? video.secure_url : "",
              thumbnailPublicId: thumb ? thumb.public_id : "",
              videoPublicId: video ? video.public_id : ""
            })
          });

          info(res.ok ? "Upload berhasil ✅\nData tersimpan." : "Upload masuk Cloudinary, tapi save data gagal.");
          return res;
        }catch(e){
          info("Upload gagal ❌\n" + e.message);
          return new Response(JSON.stringify({ok:false,error:e.message}), {status:500, headers:{"Content-Type":"application/json"}});
        }
      }
    }

    return oldFetch(input, init);
  };
})();
