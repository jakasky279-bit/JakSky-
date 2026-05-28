const fs = require("fs");

let txt = fs.readFileSync("server.js", "utf8");

txt = txt.replace(
  /const req = jakHttpsTop\.request\(url,\s*\{\s*method,\s*headers\s*\},\s*\(res\)\s*=>\s*\{/,
  `const req = jakHttpsTop.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {`
);

fs.writeFileSync("server.js", txt);
console.log("✅ HTTPS request options diperbaiki");
