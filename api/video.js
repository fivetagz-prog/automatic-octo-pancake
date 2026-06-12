const https = require("https");

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function getDirectWebm(videoId) {
  // Rotates across highly available public instances
  const nodes = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.privacydev.net"
  ];

  for (const node of nodes) {
    try {
      const res = await httpsRequest(`${node}/api/v1/videos/${videoId}?local=true`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (res.statusCode !== 200) continue;
      
      const data = JSON.parse(res.body);
      const formats = [...(data.formatStreams || []), ...(data.adaptiveFormats || [])];
      
      // Strict filtering logic to isolate valid webm video containers
      const target = formats.find(f => f.url && f.container === "webm" && (f.type || "").includes("video"));
      if (target && target.url) return target.url;
    } catch (e) {
      // Fallback directly to next available node
    }
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { q, page } = req.query;
  if (!q) return res.status(200).json({ success: true, results: [] });

  try {
    const API_KEY = "AIzaSyAdOQIPjpABx6-7BpJ27x5PQRxJ2jqQoJs";
    // Leverages page tokens or maxResults scrolling variations
    const maxResults = 6;
    const targetUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=${maxResults}&key=${API_KEY}`;
    
    const googleRes = await httpsRequest(targetUrl);
    if (googleRes.statusCode !== 200) {
      return res.status(500).json({ success: false, error: "Google API connection rejected" });
    }

    const parsedData = JSON.parse(googleRes.body);
    if (!parsedData.items || !Array.isArray(parsedData.items)) {
      return res.status(200).json({ success: true, results: [] });
    }

    // Resolves streaming structures in parallel batches
    const resolvedMatches = await Promise.all(parsedData.items.map(async (item) => {
      const videoId = item.id.videoId;
      const streamUrl = await getDirectWebm(videoId);
      
      return {
        title: item.snippet.title || "Unknown Track",
        id: videoId,
        author: item.snippet.channelTitle || "Unknown Channel",
        streamUrl: streamUrl || "" // Passed up directly to VideoFrame objects
      };
    }));

    return res.status(200).json({ success: true, results: resolvedMatches });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
