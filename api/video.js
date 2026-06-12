const https = require("https");

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Fix: Parse query ('q') and page offset directly instead of 'id'
  const { q, page } = req.query;
  if (!q) return res.status(200).json({ success: true, results: [] });

  try {
    const API_KEY = "AIzaSyAdOQIPjpABx6-7BpJ27x5PQRxJ2jqQoJs";
    const maxResults = 5;
    
    // Call Official Google API v3 Engine
    const targetUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=${maxResults}&key=${API_KEY}`;
    const googleRes = await httpRequest(targetUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    
    if (googleRes.statusCode !== 200) {
      return res.status(200).json({ success: false, error: `Google API rejected request: ${googleRes.body}` });
    }

    const parsedData = JSON.parse(googleRes.body);
    if (!parsedData.items || !Array.isArray(parsedData.items)) {
      return res.status(200).json({ success: true, results: [] });
    }

    // Process list and extract progressive video file stream extensions (.webm format)
    const processedResults = await Promise.all(parsedData.items.map(async (item) => {
      const videoId = item.id.videoId;
      
      // Fallback Engine: Uses decentralized stream allocators to fetch unthrottled progressive .webm files
      let directWebmUrl = "";
      const nodes = ["https://inv.nadeko.net", "https://invidious.nerdvpn.de", "https://invidious.privacydev.net"];
      
      for (const node of nodes) {
        try {
          const invidiousRes = await httpRequest(`${node}/api/v1/videos/${videoId}`);
          if (invidiousRes.statusCode === 200) {
            const videoDetails = JSON.parse(invidiousRes.body);
            const checkStreams = [...(videoDetails.formatStreams || []), ...(videoDetails.adaptiveFormats || [])];
            
            // Isolate true progressive playback container files
            const match = checkStreams.find(f => f.url && f.container === "webm" && (f.type || "").includes("video"));
            if (match && match.url) {
              directWebmUrl = match.url;
              break;
            }
          }
        } catch (e) {}
      }

      return {
        title: item.snippet.title || "Unknown Title",
        id: videoId,
        author: item.snippet.channelTitle || "Unknown Channel",
        // Direct media content stream URL to bind to VideoFrame.Video properties inside Roblox
        streamUrl: directWebmUrl || `https://inv.nadeko.net/latest_version?id=${videoId}&itag=243`
      };
    }));

    return res.status(200).json({ success: true, results: processedResults });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
