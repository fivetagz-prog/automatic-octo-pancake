const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
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
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

module.exports = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing video id" });
  }

  const instances = [
    "https://inv.nadeko.net",
    "https://invidious.fdn.fr",
    "https://invidious.nerdvpn.de",
    "https://yt.cdaut.de",
    "https://invidious.privacydev.net"
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

      // Prefer formatStreams webm (video+audio)
      for (const sf of streams) {
        if (sf.url && sf.container === "webm") {
          if (!best || (sf.resolution && (!best.resolution || sf.resolution > best.resolution))) {
            best = sf;
          }
        }
      }

      // Fallback: adaptive video webm
      if (!best) {
        for (const af of adaptive) {
          if (af.url && af.container === "webm" && af.type && af.type.includes("video")) {
            if (!best || (af.bitrate && (!best.bitrate || af.bitrate > best.bitrate))) {
              best = af;
            }
          }
        }
      }

      // Fallback: any webm
      if (!best) {
        best = adaptive.find(f => f.url && f.container === "webm") || null;
      }

      // Last fallback: any stream
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
