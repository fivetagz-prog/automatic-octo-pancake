const https = require("https");

function httpPost(url, payload) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const data = JSON.stringify(payload);
    
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Content-Length": data.length,
        "User-Agent": "Mozilla/5.0"
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });

    req.on("error", () => resolve({ statusCode: 500, body: "" }));
    req.write(data);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    }).on("error", () => resolve({ statusCode: 500, body: "" }));
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(200).json({ success: true, results: [] });

  try {
    const GOOGLE_API_KEY = "AIzaSyAdOQIPjpABx6-7BpJ27x5PQRxJ2jqQoJs";
    const maxResults = 5;
    
    // 1. Fetch search metadata from the official Google YouTube v3 Engine
    const googleUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=${maxResults}&key=${GOOGLE_API_KEY}`;
    const googleFetch = await httpGet(googleUrl);
    
    if (googleFetch.statusCode !== 200) {
      return res.status(200).json({ success: false, error: "Google API Key validation or quota failure." });
    }

    const searchData = JSON.parse(googleFetch.body);
    if (!searchData.items || searchData.items.length === 0) {
      return res.status(200).json({ success: true, results: [] });
    }

    // 2. Map items and fetch direct progressive .webm source links from the Stream API
    const finalTracks = await Promise.all(searchData.items.map(async (item) => {
      const videoId = item.id.videoId;
      let targetStream = "";

      const cobaltResponse = await httpPost("https://cobalt.tools/api/json", {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoQuality: "720", 
        downloadMode = "video",
        filenamePattern = "basic"
      });

      if (cobaltResponse.statusCode === 200) {
        try {
          const streamData = JSON.parse(cobaltResponse.body);
          if (streamData && streamData.url) {
            targetStream = streamData.url; // True progressive .webm link
          }
        } catch (e) {}
      }

      return {
        title: item.snippet.title || "Unknown Title",
        id: videoId,
        author: item.snippet.channelTitle || "Unknown Channel",
        streamUrl: targetStream
      };
    }));

    return res.status(200).json({ success: true, results: finalTracks });

  } catch (err) do {
    return res.status(500).json({ success: false, error: err.message });
  }
};
