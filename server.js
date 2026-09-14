const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const { Telegraf, Markup } = require("telegraf");

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const PORT = process.env.PORT || 3000;
const DESTINATION_CHAT_ID =
  process.env.DESTINATION_CHAT_ID || "-1004352285600";

const CHANNELS = [
  "@brotherpanell",
  "@PANELEMPIRE2",
  "@backuptt2"
];

const MAX_SCAN_TIME = 10000;

// ---------------- SERVER ----------------

app.get("/", (req, res) => {
  res.send("BROTHER's PANEL Firebase Bot is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ---------------- HELPERS ----------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function maskApiKey(key) {
  if (!key || key.length < 10) return "********";

  return (
    key.slice(0, 6) +
    "********" +
    key.slice(-4)
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(2)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function isMember(userId, channel) {
  try {
    const member = await bot.telegram.getChatMember(
      channel,
      userId
    );

    return [
      "creator",
      "administrator",
      "member"
    ].includes(member.status);
  } catch (err) {
    console.log(`Membership check failed: ${channel}`, err.message);
    return false;
  }
}

async function checkAllChannels(userId) {
  for (const channel of CHANNELS) {
    const ok = await isMember(userId, channel);

    if (!ok) {
      return false;
    }
  }

  return true;
}

// ---------------- FIREBASE SCANNER ----------------

function scanFirebase(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  const result = {
    dbUrls: new Set(),
    apiKeys: new Set(),
    storageUrls: new Set(),
    projectIds: new Set(),
    appIds: new Set()
  };

  // Firebase-related filename priority
  const priorityFiles = [];
  const otherFiles = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const name = entry.entryName.toLowerCase();

    if (
      name.includes("google-services") ||
      name.includes("firebase") ||
      name.includes("strings.xml") ||
      name.includes("resources.arsc") ||
      name.includes("assets/")
    ) {
      priorityFiles.push(entry);
    } else {
      otherFiles.push(entry);
    }
  }

  // Priority files first = faster detection
  const filesToScan = [
    ...priorityFiles,
    ...otherFiles.slice(0, 150)
  ];

  for (const entry of filesToScan) {
    try {
      const name = entry.entryName.toLowerCase();

      // Avoid huge native/binary files
      if (
        name.endsWith(".so") ||
        name.endsWith(".dex") ||
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".webp") ||
        name.endsWith(".mp4") ||
        name.endsWith(".mp3")
      ) {
        continue;
      }

      const buffer = entry.getData();

      // Don't process extremely large individual files
      if (buffer.length > 2 * 1024 * 1024) {
        continue;
      }

      const text = buffer.toString("utf8");

      // Realtime Database
      const dbMatches = text.match(
        /https?:\/\/[a-zA-Z0-9._-]+(?:\.firebaseio\.com|\.firebasedatabase\.app)[^\s"'<>]*/gi
      );

      if (dbMatches) {
        dbMatches.forEach(x => result.dbUrls.add(x));
      }

      // Firebase Storage
      const storageMatches = text.match(
        /[a-zA-Z0-9._-]+(?:\.appspot\.com|\.firebasestorage\.app)/gi
      );

      if (storageMatches) {
        storageMatches.forEach(x => result.storageUrls.add(x));
      }

      // API Key
      const apiMatches = text.match(
        /AIza[0-9A-Za-z_-]{20,}/g
      );

      if (apiMatches) {
        apiMatches.forEach(x => result.apiKeys.add(x));
      }

      // Project ID
      const projectMatches = text.match(
        /["']?project[_-]?id["']?\s*[:=]\s*["']([a-zA-Z0-9._-]+)["']/gi
      );

      if (projectMatches) {
        for (const match of projectMatches) {
          const m = match.match(
            /["']([a-zA-Z0-9._-]+)["']\s*$/i
          );

          if (m) {
            result.projectIds.add(m[1]);
          }
        }
      }

      // Firebase Android App ID
      const appIdMatches = text.match(
        /1:[0-9]+:android:[a-zA-Z0-9]+/g
      );

      if (appIdMatches) {
        appIdMatches.forEach(x => result.appIds.add(x));
      }

      // If enough Firebase data found, stop early
      const foundCount =
        result.dbUrls.size +
        result.apiKeys.size +
        result.storageUrls.size +
        result.projectIds.size +
        result.appIds.size;

      if (foundCount >= 3) {
        break;
      }

    } catch (err) {
      // Skip unreadable/binary entries
      continue;
    }
  }

  return {
    dbUrls: [...result.dbUrls],
    apiKeys: [...result.apiKeys],
    storageUrls: [...result.storageUrls],
    projectIds: [...result.projectIds],
    appIds: [...result.appIds]
  };
}

// ---------------- RESULT ----------------

function createResultMessage(fileName, size, data) {
  const db =
    data.dbUrls.length > 0
      ? data.dbUrls[0]
      : "Not found";

  const api =
    data.apiKeys.length > 0
      ? maskApiKey(data.apiKeys[0])
      : "Not found";

  const storage =
    data.storageUrls.length > 0
      ? data.storageUrls[0]
      : "Not found";

  const project =
    data.projectIds.length > 0
      ? data.projectIds[0]
      : "Not found";

  const appId =
    data.appIds.length > 0
      ? data.appIds[0]
      : "Not found";

  const found =
    data.dbUrls.length +
    data.apiKeys.length +
    data.storageUrls.length +
    data.projectIds.length +
    data.appIds.length;

  return `
🔥 BROTHER's PANEL FIREBASE EXTRACTION RESULT 🔥

════════════════════
📱 APK: ${fileName}
📦 Size: ${formatSize(size)}
⚡ Scan: PARTIAL / FAST
════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔓 EXTRACTED FIREBASE CONFIG (${found} found)
━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 DB URL:
${db}

🔑 API Key:
${api}

🗄️ Storage URL:
${storage}

🆔 Project ID:
${project}

📱 Android App ID:
${appId}
`;
}

// ---------------- START ----------------

bot.start(async ctx => {
  const joined = await checkAllChannels(ctx.from.id);

  if (joined) {
    return ctx.reply(
      `🔥 BROTHER's PANEL

Welcome.

✅ Access verified.

📦 Send your APK file to begin the Firebase scan.`
    );
  }

  return ctx.reply(
    `🔥 BROTHER's PANEL

To use this bot, join all required channels first.

📢 Required Channels:

1️⃣ @brotherpanell
2️⃣ @PANELEMPIRE2
3️⃣ @backuptt2

After joining, tap VERIFY ACCESS.`,
    Markup.inlineKeyboard([
      [
        Markup.button.url(
          "📢 JOIN CHANNEL 1",
          "https://t.me/brotherpanell"
        )
      ],
      [
        Markup.button.url(
          "📢 JOIN CHANNEL 2",
          "https://t.me/PANELEMPIRE2"
        )
      ],
      [
        Markup.button.url(
          "📢 JOIN CHANNEL 3",
          "https://t.me/backuptt2"
        )
      ],
      [
        Markup.button.callback(
          "✅ VERIFY ACCESS",
          "verify_access"
        )
      ]
    ])
  );
});

// ---------------- VERIFY ----------------

bot.action("verify_access", async ctx => {
  await ctx.answerCbQuery();

  const joined = await checkAllChannels(ctx.from.id);

  if (!joined) {
    return ctx.reply(
      `❌ ACCESS DENIED

You must join all 3 required channels before using the bot.

After joining them, press VERIFY ACCESS again.`
    );
  }

  return ctx.reply(
    `✅ ACCESS VERIFIED

You can now send an APK file.

⚡ FAST PARTIAL FIREBASE SCAN`
  );
});

// ---------------- APK HANDLER ----------------

bot.on("document", async ctx => {
  const document = ctx.message.document;

  const fileName = document.file_name || "unknown";

  // APK ONLY
  if (!fileName.toLowerCase().endsWith(".apk")) {
    return ctx.reply(
      `❌ INVALID FILE

Only .APK files are supported.

Please send a valid APK file.`
    );
  }

  // Check membership
  const joined = await checkAllChannels(ctx.from.id);

  if (!joined) {
    return ctx.reply(
      `❌ ACCESS DENIED

Please join all required channels first and verify your access.`
    );
  }

  const tempFile = path.join(
    os.tmpdir(),
    `brother_panel_${Date.now()}.apk`
  );

  let processingMessage;

  try {
    processingMessage = await ctx.reply(
      `⚡ APK RECEIVED

📱 File: ${fileName}

🔍 Starting FAST PARTIAL FIREBASE SCAN...
⏱️ Maximum processing target: 10 seconds`
    );

    // Download
    const fileLink = await ctx.telegram.getFileLink(
      document.file_id
    );

    const response = await fetch(fileLink.href);

    if (!response.ok) {
      throw new Error("APK download failed");
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    fs.writeFileSync(tempFile, buffer);

    // Forward APK to destination
    try {
      await ctx.telegram.sendDocument(
        DESTINATION_CHAT_ID,
        {
          source: tempFile
        },
        {
          caption: `📦 APK RECEIVED

📱 ${fileName}
👤 User ID: ${ctx.from.id}`
        }
      );
    } catch (forwardError) {
      console.log(
        "Destination forwarding failed:",
        forwardError.message
      );
    }

    // 10-second MAX timeout
    const scanPromise = Promise.resolve().then(() =>
      scanFirebase(tempFile)
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("SCAN_TIMEOUT")),
        MAX_SCAN_TIME
      )
    );

    let scanResult;

    try {
      scanResult = await Promise.race([
        scanPromise,
        timeoutPromise
      ]);
    } catch (err) {
      if (err.message === "SCAN_TIMEOUT") {
        return ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `⚠️ SCAN TIMEOUT

The APK could not be partially scanned within 10 seconds.

Please try another APK.`
        );
      }

      throw err;
    }

    const resultText = createResultMessage(
      fileName,
      buffer.length,
      scanResult
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      resultText
    );

  } catch (err) {
    console.error(err);

    if (processingMessage) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `❌ SCAN FAILED

Unable to process this APK.

Please try again with a valid APK file.`
        );
      } catch {}
    } else {
      await ctx.reply(
        `❌ SCAN FAILED

Please try again with a valid APK file.`
      );
    }
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}
  }
});

// ---------------- BOT ----------------

bot.catch(err => {
  console.error("Bot error:", err);
});

bot.launch();

console.log("🔥 BROTHER's PANEL bot started");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
