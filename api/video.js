const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 
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

  if (!q) {
    return res.status(400).json({ error: "Missing search query parameter 'q'" });
  }

  // Active public instances with reliable, unthrottled API search permissions
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
      if (!Array.isArray(searchData) || searchData.length === 0) {
        errors.push(`${instance} returned empty results`);
        continue;
      }

      // Format the top 3 video matches into clean data models for Roblox
      const structuredMatches = searchData.slice(0, 3).map(video => {
        return {
          title: video.title,
          id: video.videoId,
          author: video.author,
          duration: video.lengthSeconds,
          // Constructs the direct local stream endpoint for video stream rendering
          streamUrl: `${instance}/latest_version?id=${video.videoId}&itag=22&local=true`
        };
      });

      // Set explicit headers to allow Roblox outbound requests to read responses clearly
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).json({ success: true, results: structuredMatches });

    } catch (e) {
      errors.push(`${instance} failed: ${e.message}`);
    }
  }

  return res.status(500).json({ error: "All search backends failed", details: errors });
};
