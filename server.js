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

app.get("/", (req, res) => {
  res.send("BROTHER's PANEL is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

async function isMember(userId, channel) {
  try {
    const member = await bot.telegram.getChatMember(
      channel,
      userId
    );

    return ["creator", "administrator", "member"]
      .includes(member.status);
  } catch {
    return false;
  }
}

async function checkAllChannels(userId) {
  for (const channel of CHANNELS) {
    if (!(await isMember(userId, channel))) {
      return false;
    }
  }

  return true;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(2)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ================= START =================

bot.start(async (ctx) => {
  if (await checkAllChannels(ctx.from.id)) {
    return ctx.reply(
      `🔥 BROTHER's PANEL

✅ Access verified.

📦 Send your APK file.`
    );
  }

  return ctx.reply(
    `🔥 BROTHER's PANEL

Join all required channels first.

📢 Required Channels:

1️⃣ @brotherpanell
2️⃣ @PANELEMPIRE2
3️⃣ @backuptt2`,
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

  if (!(await checkAllChannels(ctx.from.id))) {
    return ctx.reply(
      `❌ ACCESS DENIED

Join all 3 channels and try again.`
    );
  }

  return ctx.reply(
    `✅ ACCESS VERIFIED

📦 Send your APK file.`
  );
});

// ================= APK =================

bot.on("document", async (ctx) => {
  const document = ctx.message.document;
  const fileName = document.file_name || "unknown.apk";

  if (!fileName.toLowerCase().endsWith(".apk")) {
    return ctx.reply(
      `❌ INVALID FILE

Only .APK files are supported.`
    );
  }

  if (!(await checkAllChannels(ctx.from.id))) {
    return ctx.reply(
      `❌ ACCESS DENIED

Join all required channels first.`
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

📱 ${fileName}

⏳ Processing...`
    );

    const fileLink = await ctx.telegram.getFileLink(
      document.file_id
    );

    const response = await fetch(fileLink.href);

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    fs.writeFileSync(tempFile, buffer);

    const caption =
      `🔥 BROTHER's PANEL

📦 APK RECEIVED

📱 APK: ${fileName}
📦 Size: ${formatSize(buffer.length)}

🔗 FIREBASE DATABASE URL:

${FIREBASE_DATABASE_URL}

━━━━━━━━━━━━━━━━━━━━
⚡ APK + FIREBASE URL
━━━━━━━━━━━━━━━━━━━━`;

    await bot.telegram.sendDocument(
      DESTINATION_CHAT_ID,
      { source: tempFile },
      { caption }
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      `✅ COMPLETED

📱 APK: ${fileName}

🔗 FIREBASE DATABASE URL:

${FIREBASE_DATABASE_URL}

📦 APK + URL sent successfully.`
    );

  } catch (error) {
    console.error(error);

    if (processingMessage) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          `❌ FAILED

Unable to process the APK.`
        );
      } catch {}
    }

  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}
  }
});

bot.catch((error) => {
  console.error("Bot error:", error);
});

bot.launch();

console.log("🔥 BROTHER's PANEL bot started");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
