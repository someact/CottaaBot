const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
    TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits,
    UserSelectMenuBuilder, MessageFlags
} = require('discord.js');
const config = require('../config.json'); 

const cooldowns = new Map();
const COOLDOWN_MS = 2000; 

function isOnCooldown(userId) {
    const last = cooldowns.get(userId);
    if (last && Date.now() - last < COOLDOWN_MS) return true;
    cooldowns.set(userId, Date.now());
    return false;
}

const MAX_CHANNEL_NAME = 100;
const MAX_USER_LIMIT   = 99;

// ✅ ระบบกระซิบและลบตัวเอง
async function replyAndAutoDelete(interaction, content) {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    setTimeout(() => {
        interaction.deleteReply().catch(() => {});
    }, config.REPLY_TIMEOUT_SECONDS * 1000);
}

async function sendDiscordLog(interaction, action, details) {
    const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
    if (logChannel) {
        await logChannel.send(
            `📝 **${action}**\n👤 **โดย:** <@${interaction.user.id}>\n⏰ **เวลา:** <t:${Math.floor(Date.now() / 1000)}:F>\n📌 **รายละเอียด:** ${details}`
        ).catch(() => {});
    }
}

function parseVcCustomId(customId) {
    const parts = customId.split('_');
    if (parts.length < 3) return null;
    const action = parts[1];
    const vcId   = parts.slice(2).join('_'); 
    return { action, vcId };
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        const db = client.db;

        // --- 1. สร้างห้องเสียง ---
        if (interaction.isButton() && interaction.customId === 'create_temp_vc') {
            if (isOnCooldown(interaction.user.id)) return replyAndAutoDelete(interaction, '⏳ กรุณารอสักครู่ก่อนกดซ้ำ');

            const guild = interaction.guild;
            const user  = interaction.user;

            const existing = await db.get('SELECT channelId FROM temp_channels WHERE ownerId = ? AND guildId = ?', [user.id, guild.id]);
            if (existing) return replyAndAutoDelete(interaction, `❌ คุณมีห้องเสียงอยู่แล้วที่ <#${existing.channelId}>`);

            // สร้างห้องเสียง
            const vc = await guild.channels.create({
                name: `🔊 ห้องของ ${user.username}`,
                type: ChannelType.GuildVoice,
                parent: config.CATEGORY_ID || null,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.Connect] },
                    { id: user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] }
                ]
            });

            // ✅ สร้างห้องแชทส่วนตัว (Text Channel) 
            const textChannel = await guild.channels.create({
                name: `⚙️ควบคุม-${user.username}`,
                type: ChannelType.GuildText,
                parent: config.CATEGORY_ID || null,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, // ซ่อนจากทุกคน
                    { id: user.id, allow: [PermissionFlagsBits.ViewChannel] }                 // ให้เฉพาะคนสร้างเห็น
                ]
            });

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`vc_rename_${vc.id}`).setLabel('📝 เปลี่ยนชื่อ').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`vc_limit_${vc.id}`).setLabel('👥 จำกัดคน').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`vc_lock_${vc.id}`).setLabel('🔒 ล็อค/ปลดล็อค').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`vc_hide_${vc.id}`).setLabel('👁️ ซ่อน/แสดง').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`vc_delete_${vc.id}`).setLabel('🗑️ ลบห้อง').setStyle(ButtonStyle.Danger)
            );

            const row2 = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`vc_kick_${vc.id}`).setPlaceholder('🥾 เตะผู้ใช้ออกจากห้อง'));
            const row3 = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`vc_transfer_${vc.id}`).setPlaceholder('👑 โอนสิทธิ์เจ้าของห้อง'));
            const row4 = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`vc_blacklist_${vc.id}`).setPlaceholder('🚫 แบล็คลิสต์ (บล็อคไม่ให้เข้า)'));
            const row5 = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`vc_whitelist_${vc.id}`).setPlaceholder('✅ ไวท์ลิสต์ (อนุญาตให้เข้าตอนล็อคห้อง)'));

            // ส่งแผงควบคุมไปที่ห้องแชทใหม่ที่เพิ่งสร้าง
            const controlMsg = await textChannel.send({
                content: `**แผงควบคุมห้องเสียง:** <#${vc.id}>\n👑 **เจ้าของห้อง:** <@${user.id}>`,
                components: [row1, row2, row3, row4, row5]
            });

            await db.run(
                'INSERT INTO temp_channels (channelId, textChannelId, guildId, ownerId, controlMsgId, expiresAt) VALUES (?, ?, ?, ?, ?, NULL)',
                [vc.id, textChannel.id, guild.id, user.id, controlMsg.id]
            );

            const memberVoice = interaction.member.voice;
            if (memberVoice.channel) await memberVoice.setChannel(vc).catch(() => {});

            await sendDiscordLog(interaction, 'สร้างห้องเสียงชั่วคราว', `ห้อง <#${vc.id}> และห้องแชท <#${textChannel.id}> ถูกสร้างขึ้น`);
            return replyAndAutoDelete(interaction, `✅ สร้างห้องสำเร็จ! ไปจัดการได้ที่ <#${textChannel.id}>`);
        }

        // --- 2. จัดการ Action จาก ปุ่มและ Select Menu ---
        if ((interaction.isButton() || interaction.isUserSelectMenu()) && interaction.customId.startsWith('vc_')) {
            if (isOnCooldown(interaction.user.id)) return replyAndAutoDelete(interaction, '⏳ กรุณารอสักครู่ก่อนกดซ้ำ');

            const parsed = parseVcCustomId(interaction.customId);
            if (!parsed) return;
            const { action, vcId } = parsed;

            const channelData = await db.get('SELECT * FROM temp_channels WHERE channelId = ?', [vcId]);
            if (!channelData) return replyAndAutoDelete(interaction, '❌ ข้อมูลห้องนี้ถูกลบไปแล้ว');
            if (interaction.user.id !== channelData.ownerId) return replyAndAutoDelete(interaction, '❌ คุณไม่ใช่เจ้าของห้องนี้!');

            const vc = interaction.guild.channels.cache.get(vcId);
            if (!vc) {
                await db.run('DELETE FROM temp_channels WHERE channelId = ?', [vcId]);
                return replyAndAutoDelete(interaction, '❌ ไม่พบห้องเสียง (อาจถูกลบไปแล้ว)');
            }

            if (action === 'rename') {
                const modal = new ModalBuilder().setCustomId(`modal_rename_${vcId}`).setTitle('เปลี่ยนชื่อห้องเสียง');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel(`ชื่อห้องใหม่`).setStyle(TextInputStyle.Short).setMaxLength(MAX_CHANNEL_NAME).setRequired(true)));
                return interaction.showModal(modal);
            }

            if (action === 'limit') {
                const modal = new ModalBuilder().setCustomId(`modal_limit_${vcId}`).setTitle('ตั้งค่าจำนวนคน');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit_num').setLabel(`จำนวนคนสูงสุด (0 = ไม่จำกัด)`).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)));
                return interaction.showModal(modal);
            }

            if (action === 'lock') {
                const everyoneOverwrite = vc.permissionOverwrites.cache.get(config.DEFAULT_ROLE_ID);
                const isLocked = everyoneOverwrite?.deny.has(PermissionFlagsBits.Connect);
                await vc.permissionOverwrites.edit(config.DEFAULT_ROLE_ID, { Connect: isLocked ? null : false });
                await sendDiscordLog(interaction, 'ตั้งค่าห้อง', `**${isLocked ? 'ปลดล็อค' : 'ล็อค'}** ห้อง <#${vc.id}>`);
                return replyAndAutoDelete(interaction, isLocked ? '🔓 ปลดล็อคห้องแล้ว' : '🔒 ล็อคห้องแล้ว');
            }

            if (action === 'hide') {
                const everyoneOverwrite = vc.permissionOverwrites.cache.get(config.DEFAULT_ROLE_ID);
                const isHidden = everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel);
                await vc.permissionOverwrites.edit(config.DEFAULT_ROLE_ID, { ViewChannel: isHidden ? null : false });
                await sendDiscordLog(interaction, 'ตั้งค่าห้อง', `**${isHidden ? 'แสดง' : 'ซ่อน'}** ห้อง <#${vc.id}>`);
                return replyAndAutoDelete(interaction, isHidden ? '👁️ เลิกซ่อนห้องแล้ว' : '👻 ซ่อนห้องแล้ว');
            }

            if (action === 'delete') {
                await db.run('DELETE FROM temp_channels WHERE channelId = ?', [vcId]);
                await sendDiscordLog(interaction, 'ลบห้องเสียง', `ลบห้อง ${vc.name} เรียบร้อยแล้ว`);
                
                // แจ้งเตือนก่อนลบ
                await replyAndAutoDelete(interaction, `🗑️ ลบห้องเสียงเรียบร้อยแล้ว ห้องแชทควบคุมนี้จะหายไปใน ${config.TEXT_CHANNEL_DELETE_DELAY_SECONDS} วินาที`);

                // ดีเลย์ลบห้อง
                setTimeout(async () => {
                    const vcToDelete = interaction.guild.channels.cache.get(vcId);
                    const textChannel = interaction.guild.channels.cache.get(channelData.textChannelId);
                    if (vcToDelete) await vcToDelete.delete().catch(() => {});
                    if (textChannel) await textChannel.delete().catch(() => {});
                }, config.TEXT_CHANNEL_DELETE_DELAY_SECONDS * 1000);
                
                return;
            }

            if (interaction.isUserSelectMenu()) {
                const targetUserId = interaction.values[0];

                if (action === 'kick') {
                    if (targetUserId === interaction.user.id) return replyAndAutoDelete(interaction, '❌ คุณไม่สามารถเตะตัวเองได้');
                    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
                    if (targetMember && targetMember.voice.channelId === vcId) {
                        await targetMember.voice.disconnect();
                        return replyAndAutoDelete(interaction, `🥾 เตะ <@${targetUserId}> ออกจากห้องแล้ว`);
                    }
                    return replyAndAutoDelete(interaction, '❌ ผู้ใช้นั้นไม่ได้อยู่ในห้องนี้');
                }

                if (action === 'transfer') {
                    if (targetUserId === interaction.user.id) return replyAndAutoDelete(interaction, '❌ คุณเป็นเจ้าของห้องอยู่แล้ว');
                    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
                    if (!targetMember || targetMember.user.bot) return replyAndAutoDelete(interaction, '❌ ไม่สามารถโอนสิทธิ์ให้บอทหรือผู้ใช้นี้ได้');

                    await db.run('UPDATE temp_channels SET ownerId = ? WHERE channelId = ?', [targetUserId, vcId]);
                    
                    // สลับ Permission ห้องเสียง
                    await vc.permissionOverwrites.edit(targetUserId, { Connect: true, ManageChannels: true });
                    await vc.permissionOverwrites.edit(interaction.user.id, { ManageChannels: null }); 

                    // ✅ สลับ Permission ห้องแชทควบคุม (เจ้าของใหม่เห็น คนเก่าหมดสิทธิ์เห็น)
                    const textChannel = interaction.guild.channels.cache.get(channelData.textChannelId);
                    if (textChannel) {
                        await textChannel.permissionOverwrites.edit(targetUserId, { ViewChannel: true });
                        await textChannel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: null }); 
                        
                        await textChannel.send(`👑 <@${targetUserId}> คุณได้รับสิทธิ์เป็นเจ้าของห้องเสียง <#${vcId}> คนใหม่แล้ว!`);
                    }

                    if (interaction.message) {
                        await interaction.message.edit({
                            content: `**แผงควบคุมห้องเสียง:** <#${vc.id}>\n👑 **เจ้าของห้อง:** <@${targetUserId}>`
                        }).catch(() => {});
                    }

                    return replyAndAutoDelete(interaction, `✅ โอนสิทธิ์เจ้าของห้องให้ <@${targetUserId}> เรียบร้อยแล้ว แผงควบคุมจะถูกสลับไปให้คนใหม่`);
                }

                if (action === 'blacklist') {
                    if (targetUserId === interaction.user.id) return replyAndAutoDelete(interaction, '❌ คุณไม่สามารถแบล็คลิสต์ตัวเองได้');
                    await vc.permissionOverwrites.edit(targetUserId, { Connect: false });
                    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
                    if (targetMember && targetMember.voice.channelId === vcId) await targetMember.voice.disconnect();
                    return replyAndAutoDelete(interaction, `🚫 แบล็คลิสต์ <@${targetUserId}> และเตะออกจากห้อง (ถ้าอยู่) เรียบร้อยแล้ว`);
                }

                if (action === 'whitelist') {
                    if (targetUserId === interaction.user.id) return replyAndAutoDelete(interaction, '❌ คุณเข้าห้องได้อยู่แล้ว');
                    await vc.permissionOverwrites.edit(targetUserId, { Connect: true });
                    return replyAndAutoDelete(interaction, `✅ เพิ่ม <@${targetUserId}> ลงในไวท์ลิสต์เรียบร้อยแล้ว เขาสามารถเข้าห้องที่ล็อคอยู่ได้`);
                }
            }
        }

        // --- 3. Modal Submit ---
        if (interaction.isModalSubmit()) {
            if (!interaction.customId.startsWith('modal_rename_') && !interaction.customId.startsWith('modal_limit_')) return;

            const parts  = interaction.customId.split('_');
            const action = parts[1];
            const vcId   = parts.slice(2).join('_');
            const vc     = interaction.guild.channels.cache.get(vcId);
            if (!vc) return replyAndAutoDelete(interaction, '❌ ไม่พบห้องเสียง');

            const channelData = await db.get('SELECT * FROM temp_channels WHERE channelId = ?', [vcId]);
            if (!channelData) return replyAndAutoDelete(interaction, '❌ ห้องนี้ถูกลบไปแล้ว');
            if (interaction.user.id !== channelData.ownerId) return replyAndAutoDelete(interaction, '❌ คุณไม่ใช่เจ้าของห้องนี้!');

            if (action === 'rename') {
                const newName = interaction.fields.getTextInputValue('new_name').trim();
                if (!newName) return replyAndAutoDelete(interaction, '❌ ชื่อห้องต้องไม่ว่างเปล่า');
                await vc.setName(newName);
                await sendDiscordLog(interaction, 'เปลี่ยนชื่อห้อง', `เปลี่ยนชื่อห้องเป็น **${newName}**`);
                return replyAndAutoDelete(interaction, `✅ เปลี่ยนชื่อเป็น **${newName}** แล้ว`);
            }

            if (action === 'limit') {
                const raw   = interaction.fields.getTextInputValue('limit_num').trim();
                const limit = parseInt(raw, 10);
                if (isNaN(limit) || limit < 0 || limit > MAX_USER_LIMIT) {
                    return replyAndAutoDelete(interaction, `❌ กรุณาใส่ตัวเลข 0–${MAX_USER_LIMIT} เท่านั้น`);
                }
                await vc.setUserLimit(limit);
                await sendDiscordLog(interaction, 'จำกัดจำนวนคน', `ตั้งจำนวนคนสูงสุดในห้อง <#${vcId}> เป็น **${limit}** คน`);
                return replyAndAutoDelete(interaction, `✅ ตั้งจำนวนคนสูงสุดเป็น **${limit === 0 ? 'ไม่จำกัด' : `${limit} คน`}** แล้ว`);
            }
        }
    }
};