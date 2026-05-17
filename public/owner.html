<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Owner Panel</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial;background:linear-gradient(135deg,#ff9bdc,#ffc2e2,#ffe1ef);min-height:100vh;color:#222}
.box{width:94%;max-width:760px;margin:24px auto;background:white;border-radius:24px;padding:24px;box-shadow:0 15px 35px #ff3f9d33}
#loginBox{max-width:390px;margin-top:28vh;text-align:center}
h2{color:#ff3f9d}
input,select{width:100%;padding:13px;margin:8px 0 12px;border:1px solid #ffc2dc;border-radius:14px}
button{width:100%;border:0;border-radius:999px;background:linear-gradient(90deg,#ff3f9d,#ff7ac3);color:white;padding:12px;font-weight:900;margin:6px 0}
.hidden{display:none!important}
.acc{background:#fff6fb;border:1px solid #ffd1e5;border-radius:16px;padding:12px;margin:10px 0}
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.badge{font-size:11px;border-radius:99px;padding:4px 8px;color:white;font-weight:900}
.role{background:#1d9bf0}
.active{background:#22c55e}
.pending{background:#f59e0b}
.kicked{background:#ef4444}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:white;color:#ff3f9d;padding:12px 18px;border-radius:999px;box-shadow:0 10px 25px #0003;display:none;font-weight:900;z-index:99}
</style>
</head>

<body>

<section class="box" id="loginBox">
<h2>Login Owner 👑</h2>
<input id="owner1" placeholder="Owner key 1">
<input id="owner2" placeholder="Owner key 2">
<button onclick="loginOwner()">Masuk</button>
</section>

<section class="box hidden" id="panel">
<h2>Buat Akun</h2>
<input id="accName" placeholder="Nama akun">
<input id="key1" placeholder="Key 1">
<input id="key2" placeholder="Key 2">

<select id="role">
<option value="admin">Admin</option>
<option value="moderator">Moderator</option>
</select>

<button onclick="saveAccount()">Simpan</button>

<h2>Daftar Akun</h2>
<div id="accounts">Memuat...</div>
</section>

<div id="toast" class="toast"></div>

<script>
const API = "/api/owner-v2/accounts";

function toastMsg(msg){
  toast.innerText=msg;
  toast.style.display="block";
  setTimeout(()=>toast.style.display="none",1800);
}

function loginOwner(){
  if(owner1.value.trim()!=="Jaksky" || owner2.value.trim()!=="Jaksky"){
    return toastMsg("Owner key salah");
  }

  loginBox.classList.add("hidden");
  panel.classList.remove("hidden");
  loadAccounts();
}

async function saveAccount(){
  const data={
    name:accName.value.trim(),
    key1:key1.value.trim(),
    key2:key2.value.trim(),
    role:role.value,
    status:"active"
  };

  if(!data.name||!data.key1||!data.key2){
    return toastMsg("Isi semua data");
  }

  const r=await fetch(API,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(data)
  });

  const d=await r.json().catch(()=>({}));
  if(!r.ok) return toastMsg(d.message||"Gagal simpan");

  accName.value="";
  key1.value="";
  key2.value="";

  toastMsg("Akun tersimpan");
  loadAccounts();
}

async function loadAccounts(){
  const r=await fetch(API+"?t="+Date.now());
  const data=await r.json().catch(()=>[]);

  accounts.innerHTML=data.map(a=>{
    const st=(a.status||"active").toLowerCase();
    const roleName=a.role||"admin";
    const isOwner=roleName.toLowerCase()==="owner";

    return `
    <div class="acc">
      <b>${a.name}</b>
      <span class="badge role">${roleName}</span>
      <span class="badge ${st}">${st}</span>

      ${isOwner ? `<p>Owner tidak bisa diubah</p>` : `
      <div class="row">
        <button onclick="setStatus('${a.name}','active')">Active</button>
        <button onclick="setStatus('${a.name}','pending')">Pending</button>
        <button onclick="setStatus('${a.name}','kicked')">Kick</button>
        <button onclick="delAcc('${a.name}')">Hapus</button>
      </div>`}
    </div>`;
  }).join("") || "Belum ada akun";
}

async function setStatus(n,st){
  const r=await fetch(API+"/"+encodeURIComponent(n)+"/status",{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({status:st})
  });

  const d=await r.json().catch(()=>({}));
  if(!r.ok) return toastMsg(d.message||"Gagal ubah status");

  toastMsg("Status jadi "+st);
  loadAccounts();
}

async function delAcc(n){
  if(!confirm("Hapus akun "+n+"?")) return;

  const r=await fetch(API+"/"+encodeURIComponent(n),{
    method:"DELETE"
  });

  const d=await r.json().catch(()=>({}));
  if(!r.ok) return toastMsg(d.message||"Gagal hapus");

  toastMsg("Akun dihapus");
  loadAccounts();
}
</script>

</body>
</html>
