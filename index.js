require('dotenv').config();
const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const { initDb } = require('./database');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel]
});

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

async function cleanupExpiredChannels(client) {
    const db = client.db;
    const now = Date.now();

    try {
        const expiredChannels = await db.all(
            'SELECT * FROM temp_channels WHERE expiresAt IS NOT NULL AND expiresAt < ?',
            [now]
        );

        for (const data of expiredChannels) {
            const guild = client.guilds.cache.get(data.guildId);
            if (!guild) {
                await db.run('DELETE FROM temp_channels WHERE channelId = ?', [data.channelId]);
                continue;
            }

            const vc = guild.channels.cache.get(data.channelId);
            const textChannel = guild.channels.cache.get(data.textChannelId);
            
            if (vc) await vc.delete().catch(() => {});
            if (textChannel) await textChannel.delete().catch(() => {});

            await db.run('DELETE FROM temp_channels WHERE channelId = ?', [data.channelId]);
            console.log(`[Cleanup] ลบห้องเสียงและห้องแชทที่หมดอายุ: ${data.channelId}`);
        }
    } catch (err) {
        console.error('[Cleanup] เกิดข้อผิดพลาด:', err);
    }
}

(async () => {
    const db = await initDb();
    client.db = db;

    client.once('clientReady', async () => {
        console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);

        const commands = [
            new SlashCommandBuilder()
                .setName('help')
                .setDescription('ดูคำสั่งทั้งหมดของบอท'),
            new SlashCommandBuilder()
                .setName('setup')
                .setDescription('ตั้งค่าระบบห้องเสียง')
                .addChannelOption(option => 
                    option.setName('category')
                        .setDescription('หมวดหมู่ (Category) ที่จะสร้างห้องเสียง')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true))
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('ยศเริ่มต้น (Role) ที่ใช้ควบคุมการล็อค/ซ่อนห้อง')
                        .setRequired(true))
                .addChannelOption(option => 
                    option.setName('log_channel')
                        .setDescription('ห้องสำหรับส่ง Log (Text Channel)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
            new SlashCommandBuilder()
                .setName('ipmc')
                .setDescription('เช็คสถานะเซิร์ฟเวอร์ Minecraft')
                .addStringOption(option => 
                    option.setName('ip')
                        .setDescription('IP เซิร์ฟเวอร์')
                        .setRequired(true)),
            new SlashCommandBuilder()
                .setName('cleartmp')
                .setDescription('บังคับลบห้องเสียงและห้องแชทชั่วคราวทั้งหมด')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
            new SlashCommandBuilder()
                .setName('clearchat')
                .setDescription('ล้างข้อความ 100 ข้อความล่าสุดในช่องนี้')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        ].map(command => command.toJSON());

        await client.application.commands.set(commands);
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อยแล้ว');

        cleanupExpiredChannels(client);
        setInterval(() => cleanupExpiredChannels(client), 60000);
    });

    client.login(process.env.TOKEN);
})();