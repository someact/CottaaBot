const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot) return;
        if (!message.content.startsWith('!')) return; 

        // limited to Administrator only
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

        const args    = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();

        if (command === '!help') {
            const helpText =
                `**🛠️ ระบบคำสั่งของบอท (สำหรับ Admin เท่านั้น)**\n\n` +
                `- \`!setup\` : เสกข้อความแนะนำการใช้งานและปุ่มกดสร้างห้องเสียง\n` +
                `- \`!ipmc <ip>\` : เช็คสถานะและข้อมูลของเซิร์ฟเวอร์ Minecraft\n` +
                `- \`!cleartmp\` : บังคับลบห้องเสียงและห้องแชทชั่วคราวทั้งหมดทันที\n` +
                `- \`!clearchat\` : ล้างข้อความในห้องแชทปัจจุบัน`;
            return message.reply(helpText);
        }

        if (command === '!ipmc') {
            const ip = args[1];
            if (!ip) return message.reply('❌ กรุณาระบุ IP เซิร์ฟเวอร์ด้วยครับ (ตัวอย่าง: `!ipmc mc.hypixel.net`)');
            if (!/^[a-zA-Z0-9.\-:]+$/.test(ip)) return message.reply('❌ IP ไม่ถูกต้องครับ');

            const loadingMsg = await message.reply('⏳ กำลังสแกนข้อมูลเซิร์ฟเวอร์...');
            try {
                const response = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                if (!data.online) return loadingMsg.edit('❌ ไม่สามารถเชื่อมต่อได้ เซิร์ฟเวอร์อาจจะออฟไลน์ หรือ IP ไม่ถูกต้องครับ');

                const motd    = data.motd?.clean?.join('\n') ?? 'ไม่มีรายละเอียด';
                const iconUrl = `https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}`;

                const embed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle(`🎮 ข้อมูลเซิร์ฟเวอร์: ${ip}`)
                    .setThumbnail(iconUrl)
                    .addFields(
                        { name: '📝 MOTD', value: `\`\`\`\n${motd}\n\`\`\``, inline: false },
                        { name: '🌐 IP', value: `\`${data.hostname || ip}\``, inline: true },
                        { name: '📦 เวอร์ชั่น', value: `\`${data.version ?? 'ไม่ทราบ'}\``, inline: true },
                        { name: '👥 ผู้เล่นออนไลน์', value: `\`${data.players?.online ?? 0} / ${data.players?.max ?? 0}\``, inline: true }
                    )
                    .setFooter({ text: 'ข้อมูลอาจมีความหน่วงประมาณ 1-2 นาที' })
                    .setTimestamp();

                return loadingMsg.edit({ content: null, embeds: [embed] });
            } catch (error) {
                console.error('[ipmc]', error);
                return loadingMsg.edit('❌ เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบดึงข้อมูลครับ');
            }
        }

        if (command === '!setup') {
            const embed = new EmbedBuilder()
                .setTitle('🎙️ ระบบจัดการห้องเสียง')
                .setDescription('**คำแนะนำการใช้งาน**\n1. กดปุ่ม  **➕ สร้างห้องเสียง**  ด้านล่าง\n2. บอทจะสร้างห้องเสียง และห้องแชทสำหรับแผงควบคุม\n3. คุณสามารถตั้งค่าห้อง (ล็อค, ซ่อน, เปลี่ยนชื่อ, เตะ, โอนสิทธิ์) ได้จากห้องแชทนั้น')
                .setColor('#3498DB');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('create_temp_vc')
                    .setLabel('➕ สร้างห้องเสียง')
                    .setStyle(ButtonStyle.Primary)
            );
            await message.channel.send({ embeds: [embed], components: [row] });
            message.delete().catch(() => {});
        }

        if (command === '!cleartmp') {
            const db = client.db;
            const tempChannels = await db.all('SELECT * FROM temp_channels WHERE guildId = ?', [message.guild.id]);
            let count = 0;

            for (const data of tempChannels) {
                const vc = message.guild.channels.cache.get(data.channelId);
                const textChannel = message.guild.channels.cache.get(data.textChannelId);
                
                if (vc) await vc.delete().catch(() => {});
                if (textChannel) await textChannel.delete().catch(() => {});
                count++;
            }

            await db.run('DELETE FROM temp_channels WHERE guildId = ?', [message.guild.id]);
            const reply = await message.reply(`🗑️ ลบห้องเสียงและห้องแชทชั่วคราวทั้งหมดจำนวน **${count}** ชุด เรียบร้อยแล้ว`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            message.delete().catch(() => {});
        }

        if (command === '!clearchat') {
            try {
                const deleted = await message.channel.bulkDelete(100, true);
                const reply   = await message.channel.send(`🧹 ล้างข้อความจำนวน **${deleted.size}** ข้อความเรียบร้อยแล้ว`);
                setTimeout(() => reply.delete().catch(() => {}), 5000);
            } catch (error) {
                console.error('[clearchat]', error);
                message.reply('❌ เกิดข้อผิดพลาดในการลบแชท (ไม่สามารถลบข้อความที่เก่ากว่า 14 วันได้)');
            }
        }
    }
};