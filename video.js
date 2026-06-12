const ytdl = require("ytdl-core");

module.exports = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing video id" });
  }

  const url = `https://www.youtube.com/watch?v=${id}`;

  try {
    // Validate the video exists
    const info = await ytdl.getInfo(url);

    // Get the best audio+video webm format
    const format = ytdl.chooseFormat(info.formats, {
      quality: "highestvideo",
      filter: (f) =>
        f.container === "webm" &&
        f.hasVideo &&
        f.hasAudio,
    }) || ytdl.chooseFormat(info.formats, {
      // Fallback: any webm with video
      filter: (f) => f.container === "webm" && f.hasVideo,
    }) || ytdl.chooseFormat(info.formats, {
      // Last fallback: best overall
      quality: "highest",
    });

    if (!format || !format.url) {
      return res.status(404).json({ error: "No streamable format found" });
    }

    // Return the direct stream URL so Roblox VideoFrame can use it
    return res.status(200).json({
      url: format.url,
      container: format.container,
      quality: format.qualityLabel || "unknown",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

