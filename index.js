require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
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

    client.once('clientReady', () => {
        console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
        cleanupExpiredChannels(client);
        setInterval(() => cleanupExpiredChannels(client), 60000);
    });

    client.login(process.env.TOKEN);
})();