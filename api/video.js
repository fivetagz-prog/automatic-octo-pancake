const https = require("https");

function httpsGet(url) {
  // Rotate common User-Agents to reduce 403 / 401 blocks from cloud network blocks
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": randomUA }
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
    req.setTimeout(6000, () => { req.destroy(); reject(new Error("Timeout")); }); // Tightened timeout to cycle failures faster
  });
}

module.exports = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing video id" });
  }

  // Updated with reliable, high-uptime public Invidious instances
  const instances = [
    "https://invidious.asir.dev",
    "https://iv.melmac.space",
    "https://invidious.perennialte.ch",
    "https://invidious.projectsegfau.lt",
    "https://yewtu.be"
  ];

  const errors = [];

  for (const instance of instances) {
    try {
      const body = await httpsGet(instance + "/api/v1/videos/" + id + "?local=true");

      let data;
      try {
        data = JSON.parse(body);
      } catch(e) {
        errors.push(instance + " bad JSON");
        continue;
      }

      if (!data || (!data.adaptiveFormats && !data.formatStreams)) {
        errors.push(instance + " empty formats");
        continue;
      }

      const adaptive = data.adaptiveFormats || [];
      const streams = data.formatStreams || [];
      let best = null;

      // 1. Prefer formatStreams webm (combined video+audio)
      for (const sf of streams) {
        if (sf.url && sf.container === "webm") {
          if (!best || (sf.resolution && (!best.resolution || sf.resolution > best.resolution))) {
            best = sf;
          }
        }
      }

      // 2. Fallback: adaptive video webm
      if (!best) {
        for (const af of adaptive) {
          if (af.url && af.container === "webm" && af.type && af.type.includes("video")) {
            if (!best || (af.bitrate && (!best.bitrate || af.bitrate > best.bitrate))) {
              best = af;
            }
          }
        }
      }

      // 3. Fallback: any webm structure
      if (!best) {
        best = adaptive.find(f => f.url && f.container === "webm") || null;
      }

      // 4. Ultimate fallback: first valid direct URL stream
      if (!best) {
        best = streams.find(f => f.url) || null;
      }

      if (!best || !best.url) {
        errors.push(instance + " no usable format");
        continue;
      }

      return res.status(200).json({
        url: best.url,
        quality: best.qualityLabel || best.quality || "unknown",
        container: best.container || "unknown"
      });

    } catch(e) {
      errors.push(instance + " " + e.message);
    }
  }

  return res.status(500).json({ error: "All instances failed", details: errors });
};
