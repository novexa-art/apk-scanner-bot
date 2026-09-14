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

// ================= SERVER =================

app.get("/", (req, res) => {
  res.send("BROTHER's PANEL Firebase Bot is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ================= HELPERS =================

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

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

  } catch (error) {
    console.log(
      `Membership check failed for ${channel}:`,
      error.message
    );

    return false;
  }
}

async function checkAllChannels(userId) {
  for (const channel of CHANNELS) {
    const joined = await isMember(userId, channel);

    if (!joined) {
      return false;
    }
  }

  return true;
}

// ================= FIREBASE URL SCANNER =================

function scanFirebaseUrl(apkPath) {
  const zip = new AdmZip(apkPath);
  const entries = zip.getEntries();

  const firebaseRegex =
    /https?:\/\/[a-zA-Z0-9._-]+(?:\.firebaseio\.com|\.firebasedatabase\.app)(?:\/[^\s"'<>]*)?/gi;

  const priorityFiles = [];
  const normalFiles = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const name = entry.entryName.toLowerCase();

    if (
      name.includes("google-services") ||
      name.includes("firebase") ||
      name.includes("strings.xml") ||
      name.includes("resources")
    ) {
      priorityFiles.push(entry);
    } else {
      normalFiles.push(entry);
    }
  }

  // Priority files first.
  // Only a limited number of other files are checked.
  const filesToScan = [
    ...priorityFiles,
    ...normalFiles.slice(0, 50)
  ];

  for (const entry of filesToScan) {
    try {
      const name = entry.entryName.toLowerCase();

      // Skip unnecessary binary files.
      if (
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".webp") ||
        name.endsWith(".gif") ||
        name.endsWith(".mp3") ||
        name.endsWith(".mp4") ||
        name.endsWith(".avi") ||
        name.endsWith(".mkv") ||
        name.endsWith(".so")
      ) {
        continue;
      }

      const data = entry.getData();

      // Don't process huge individual files.
      if (data.length > 1024 * 1024) {
        continue;
      }

      const text = data.toString("utf8");

      const matches = text.match(firebaseRegex);

      if (matches && matches.length > 0) {
        return [...new Set(matches)];
      }

    } catch (error) {
      continue;
    }
  }

  return [];
}

// ================= RESULT =================

function createResult(fileName, fileSize, urls) {
  if (urls.length > 0) {
    return `🔥 BROTHER's PANEL FIREBASE RESULT 🔥

════════════════════
📱 APK: ${fileName}
📦 Size: ${formatSize(fileSize)}
════════════════════

🔗 FIREBASE DATABASE URL:

${urls[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ FAST PARTIAL SCAN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  return `🔥 BROTHER's PANEL FIREBASE RESULT 🔥

════════════════════
📱 APK: ${fileName}
📦 Size: ${formatSize(fileSize)}
════════════════════

❌ Firebase Database URL not found.

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ FAST PARTIAL SCAN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ================= /START =================

bot.start(async (ctx) => {
  const joined = await checkAllChannels(ctx.from.id);

  if (joined) {
    return ctx.reply(
      `🔥 BROTHER's PANEL

Welcome.

✅ Access verified.

📦 Send your APK file to start the Firebase scan.`
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

// ================= VERIFY =================

bot.action("verify_access", async (ctx) => {
  await ctx.answerCbQuery();

  const joined = await checkAllChannels(ctx.from.id);

  if (!joined) {
    return ctx.reply(
      `❌ ACCESS DENIED

You must join all 3 required channels first.

After joining, tap VERIFY ACCESS again.`
    );
  }

  return ctx.reply(
    `✅ ACCESS VERIFIED

You can now send an APK file.

⚡ FAST FIREBASE URL SCAN`
  );
});

// ================= APK HANDLER =================

bot.on("document", async (ctx) => {
  const document = ctx.message.document;

  const fileName = document.file_name || "unknown.apk";

  // APK ONLY
  if (!fileName.toLowerCase().endsWith(".apk")) {
    return ctx.reply(
      `❌ INVALID FILE

Only .APK files are supported.

Please send a valid APK file.`
    );
  }

  // Membership check
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

  let processingMessage = null;

  try {
    // Processing message
    processingMessage = await ctx.reply(
      `⚡ APK RECEIVED

📱 File: ${fileName}

🔍 Searching for Firebase Database URL...
⏱️ Maximum scan time: 10 seconds`
    );

    // ================= DOWNLOAD =================

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

    // ================= FORWARD APK =================

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

    } catch (error) {
      console.log(
        "Destination forwarding failed:",
        error.message
      );
    }

    // ================= FAST SCAN =================

    const scanPromise = Promise.resolve().then(() => {
      return scanFirebaseUrl(tempFile);
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("SCAN_TIMEOUT"));
      }, MAX_SCAN_TIME);
    });

    let firebaseUrls;

    try {
      firebaseUrls = await Promise.race([
        scanPromise,
        timeoutPromise
      ]);

    } catch (error) {
      if (error.message === "SCAN_TIMEOUT") {
        return await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `⚠️ SCAN TIMEOUT

Firebase Database URL could not be found within 10 seconds.

Please try another APK.`
        );
      }

      throw error;
    }

    // ================= RESULT =================

    const resultText = createResult(
      fileName,
      buffer.length,
      firebaseUrls
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      resultText
    );

  } catch (error) {
    console.error("APK processing error:", error);

    try {
      if (processingMessage) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `❌ SCAN FAILED

Unable to process this APK.

Please try again with a valid APK file.`
        );
      } else {
        await ctx.reply(
          `❌ SCAN FAILED

Please try again with a valid APK file.`
        );
      }

    } catch (editError) {
      console.error(
        "Error sending failure message:",
        editError.message
      );
    }

  } finally {
    // Remove temporary APK
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (error) {
      console.log(
        "Temporary file cleanup failed:",
        error.message
      );
    }
  }
});

// ================= BOT ERRORS =================

bot.catch((error) => {
  console.error("Bot error:", error);
});

// ================= START BOT =================

bot.launch();

console.log("🔥 BROTHER's PANEL bot started");

// Graceful shutdown
process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});
