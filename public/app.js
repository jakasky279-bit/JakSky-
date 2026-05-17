const socket = io();

const loginPage = document.getElementById("loginPage");
const chatPage = document.getElementById("chatPage");
const loginForm = document.getElementById("loginForm");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const roomLabel = document.getElementById("roomLabel");
const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const typingBox = document.getElementById("typingBox");

const userList = document.getElementById("userList");
const onlineCount = document.getElementById("onlineCount");
const clearBtn = document.getElementById("clearBtn");

let myName = "";
let myRoom = "";
let typingTimer = null;

function timeFormat(ts) {
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(msg) {
  const div = document.createElement("div");
  div.className = "msg" + (msg.name === myName ? " mine" : "");

  div.innerHTML = `
    <div class="meta">${escapeHtml(msg.name)} • ${timeFormat(msg.time)}</div>
    <div class="text">${escapeHtml(msg.text)}</div>
  `;

  messages.appendChild(div);
  scrollBottom();
}

function addSystem(text, time = Date.now()) {
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = `${text} • ${timeFormat(time)}`;
  messages.appendChild(div);
  scrollBottom();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  myName = nameInput.value.trim() || "Guest";
  myRoom = roomInput.value;

  loginPage.classList.add("hidden");
  chatPage.classList.remove("hidden");

  roomLabel.textContent = "Room: " + myRoom;

  socket.emit("join", {
    name: myName,
    room: myRoom
  });

  messageInput.focus();
});

messageForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit("message", text);
  socket.emit("typing", false);

  messageInput.value = "";
  messageInput.focus();
});

messageInput.addEventListener("input", () => {
  socket.emit("typing", true);

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("typing", false);
  }, 900);
});

socket.on("history", (history) => {
  messages.innerHTML = "";

  if (!history.length) {
    addSystem("Belum ada chat di room ini");
    return;
  }

  history.forEach(addMessage);
});

socket.on("message", addMessage);

socket.on("system", (data) => {
  addSystem(data.text, data.time);
});

socket.on("typing", (data) => {
  if (!data.isTyping) {
    typingBox.textContent = "";
    return;
  }

  typingBox.textContent = `${data.name} sedang mengetik...`;

  setTimeout(() => {
    typingBox.textContent = "";
  }, 1200);
});

socket.on("users", (users) => {
  onlineCount.textContent = `${users.length} user`;
  userList.innerHTML = "";

  users.forEach((name) => {
    const div = document.createElement("div");
    div.className = "user";

    div.innerHTML = `
      <div class="avatar">${escapeHtml(name[0] || "?").toUpperCase()}</div>
      <div>${escapeHtml(name)}</div>
    `;

    userList.appendChild(div);
  });
});

socket.on("cleared", (data) => {
  messages.innerHTML = "";
  addSystem(data.text, data.time);
});

clearBtn.addEventListener("click", () => {
  const code = prompt("Masukkan kode admin:");
  if (!code) return;

  socket.emit("clearRoom", code, (res) => {
    alert(res.message);
  });
});
