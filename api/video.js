module.exports = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing video id" });
  }

  try {
    // Use Invidious public API to get stream URLs (no API key needed)
    const instances = [
      "https://inv.nadeko.net",
      "https://invidious.fdn.fr",
      "https://invidious.nerdvpn.de",
    ];

    let data = null;
    let lastError = null;

    for (const instance of instances) {
      try {
        const response = await fetch(`${instance}/api/v1/videos/${id}?fields=adaptiveFormats,formatStreams`);
        if (response.ok) {
          data = await response.json();
          break;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    if (!data) {
      return res.status(500).json({ error: "All Invidious instances failed: " + lastError });
    }

    // Find best webm format
    const formats = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])];
    
    const webm = formats.find(f => f.container === "webm" && f.type?.includes("video")) 
      || formats.find(f => f.container === "webm")
      || formats[0];

    if (!webm || !webm.url) {
      return res.status(404).json({ error: "No suitable format found" });
    }

    return res.status(200).json({
      url: webm.url,
      quality: webm.qualityLabel || webm.quality || "unknown",
      container: webm.container || "unknown",
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

