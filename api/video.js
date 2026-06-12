const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
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
    req.setTimeout(6000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

module.exports = async (req, res) => {
  const { q } = req.query;

  // Set cross-origin headers to accept direct exploit requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (!q) {
    return res.status(200).json({ success: true, results: [] });
  }

  try {
    const API_KEY = "AIzaSyAdOQIPjpABx6-7BpJ27x5PQRxJ2jqQoJs";
    const targetUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=10&key=${API_KEY}`;
    
    const rawData = await httpsGet(targetUrl);
    const parsedData = JSON.parse(rawData);

    if (!parsedData.items || !Array.isArray(parsedData.items)) {
      return res.status(200).json({ success: true, results: [] });
    }

    // Process Google payload structures into clean layout schemas for Luau
    const structuredMatches = parsedData.items.map(item => {
      return {
        title: item.snippet.title || "Unknown Title",
        id: item.id.videoId,
        author: item.snippet.channelTitle || "Unknown Channel",
        duration: 0,
        streamUrl: `https://cobalt.tools/api/json`
      };
    });

    return res.status(200).json({ success: true, results: structuredMatches });

  } catch (error) {
    return res.status(500).json({ error: "Google API connection failure", details: error.message });
  }
};
