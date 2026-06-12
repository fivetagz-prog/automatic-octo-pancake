const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" 
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode));
        res.resume();
        return;
      }
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

module.exports = async (req, res) => {
  const { q } = req.query;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (!q) {
    return res.status(200).json({ success: true, results: [] });
  }

  const searchInstances = [
    "https://inv.thepixora.com",
    "https://invidious.f5.si",
    "https://invidious.perennialte.ch",
    "https://yewtu.be"
  ];

  const errors = [];

  for (const instance of searchInstances) {
    try {
      const searchUrl = `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video`;
      const body = await httpsGet(searchUrl);
      
      const searchData = JSON.parse(body);
      if (!Array.isArray(searchData)) {
        errors.push(`${instance} invalid search format array`);
        continue;
      }

      const structuredMatches = searchData.slice(0, 10).map(video => {
        return {
          title: video.title || "Unknown Title",
          id: video.videoId,
          author: video.author || "Unknown Channel",
          duration: video.lengthSeconds || 0,
          streamUrl: `${instance}/latest_version?id=${video.videoId}&itag=22&local=true`
        };
      });

      return res.status(200).json({ success: true, results: ...[structuredMatches] });

    } catch (e) {
      errors.push(`${instance} failed: ${e.message}`);
    }
  }

  return res.status(500).json({ error: "All backends failed", details: errors });
};
