const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionFlagsBits, EmbedBuilder
} = require("discord.js");
require("dotenv").config();

const { BOT_TOKEN, SERVER_ID, STAFF_ROLE_ID, TICKET_CATEGORY_ID } = process.env;

const missing = ["BOT_TOKEN", "SERVER_ID", "STAFF_ROLE_ID", "TICKET_CATEGORY_ID"]
  .filter(k => !process.env[k]?.trim());

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

const commands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("ส่งแผงเปิด Ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON()
];

/*
  ระบบเลข Ticket:
  TICKET-0001
  TICKET-0002
  TICKET-0003

  ทุกวันที่ 1 ของเดือนจะเริ่มกลับไปที่ 0001

  ตัวนับถูกเก็บไว้ใน "🔢・ticket-counter" บน Discord
  จึงไม่หายเมื่อ Railway restart/redeploy
*/

const COUNTER_CHANNEL_NAME = "🔢・ticket-counter";

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getCounterChannel(guild) {
  let channel = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
         c.name === COUNTER_CHANNEL_NAME
  );

  if (channel) return channel;

  channel = await guild.channels.create({
    name: COUNTER_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID,
    topic: `ticket-counter:${currentMonth()}:0`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      }
    ]
  });

  console.log(`Created counter channel: ${channel.id}`);
  return channel;
}

let counterLock = Promise.resolve();

function getNextTicketNumber(guild) {
  const job = counterLock.then(async () => {
    const channel = await getCounterChannel(guild);
    const month = currentMonth();

    let oldMonth = month;
    let oldNumber = 0;

    const match = channel.topic?.match(/^ticket-counter:(\d{4}-\d{2}):(\d+)$/);

    if (match) {
      oldMonth = match[1];
      oldNumber = Number(match[2]);
    }

    // เดือนใหม่ = รีเลขกลับ 0001
    const nextNumber = oldMonth === month ? oldNumber + 1 : 1;

    if (nextNumber > 9999) {
      throw new Error("Ticket number reached 9999 for this month.");
    }

    await channel.setTopic(`ticket-counter:${month}:${nextNumber}`);

    return nextNumber;
  });

  counterLock = job.catch(() => {});
  return job;
}

function ticketName(number) {
  return `ticket-${String(number).padStart(4, "0")}`;
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(SERVER_ID);
    const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, SERVER_ID),
      { body: commands }
    );

    console.log(`Guild: ${guild.name}`);
    console.log("Monnashop Ticket Bot is online.");
  } catch (err) {
    console.error("Startup check failed:", err);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket") {
      const embed = new EmbedBuilder()
        .setTitle("🎫 Monnashop Ticket")
        .setDescription(
          "กดปุ่มด้านล่างเพื่อเปิด Ticket\nระบบจะสร้างห้องส่วนตัวให้คุณและทีมงาน"
        )
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_open")
          .setLabel("เปิด Ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
      return;
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === "ticket_open") {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;

      if (!guild) {
        await interaction.editReply("ไม่สามารถใช้ Ticket นอกเซิร์ฟเวอร์ได้");
        return;
      }

      const existing = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildText &&
          c.topic === `ticket-owner:${interaction.user.id}`
      );

      if (existing) {
        await interaction.editReply(`คุณมี Ticket อยู่แล้ว: ${existing}`);
        return;
      }

      // ขอเลขใหม่แบบปลอดภัย ป้องกันเลขซ้ำถ้ามีคนกดพร้อมกัน
      const ticketNumber = await getNextTicketNumber(guild);
      const channelName = ticketName(ticketNumber);

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          },
          {
            id: STAFF_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ]
      });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("ปิด Ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, "0")} เปิดแล้ว`)
        .setDescription(
          `สวัสดี <@${interaction.user.id}>!\nกรุณาพิมพ์รายละเอียดที่ต้องการติดต่อทีมงานไว้ในห้องนี้`
        )
        .setColor(0x57f287);

      await channel.send({
        content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`,
        embeds: [embed],
        components: [closeRow]
      });

      await interaction.editReply(
        `เปิด Ticket #${String(ticketNumber).padStart(4, "0")} ให้แล้ว: ${channel}`
      );
      return;
    }

    if (interaction.customId === "ticket_close") {
      const channel = interaction.channel;

      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "ไม่สามารถปิด Ticket ห้องนี้ได้",
          ephemeral: true
        });
        return;
      }

      const member = interaction.member;

      const isStaff =
        member?.roles?.cache?.has(STAFF_ROLE_ID) ||
        member?.permissions?.has(PermissionFlagsBits.ManageChannels);

      const ownerId = channel.topic?.startsWith("ticket-owner:")
        ? channel.topic.split(":")[1]
        : null;

      if (!isStaff && ownerId !== interaction.user.id) {
        await interaction.reply({
          content: "คุณไม่มีสิทธิ์ปิด Ticket นี้",
          ephemeral: true
        });
        return;
      }

      await interaction.reply("🔒 กำลังปิด Ticket...");
      setTimeout(
        () => channel.delete("Ticket closed").catch(console.error),
        1500
      );
    }
  } catch (err) {
    console.error("Interaction error:", err);

    const payload = {
      content: "เกิดข้อผิดพลาด กรุณาตรวจสอบ Deploy Logs"
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction
        .reply({ ...payload, ephemeral: true })
        .catch(() => {});
    }
  }
});

process.on("unhandledRejection", err =>
  console.error("Unhandled promise rejection:", err)
);

process.on("uncaughtException", err =>
  console.error("Uncaught exception:", err)
);

client.login(BOT_TOKEN).catch(err => {
  console.error("Discord login failed.");
  console.error(err);
  process.exit(1);
});
