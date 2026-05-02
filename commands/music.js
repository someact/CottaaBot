const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { getState, resetState } = require('../data/musicManager');

// ─── Dashboard Builder ────────────────────────────────────────────────────────

/**
 * Builds the music dashboard Embed and ActionRow buttons.
 * @param {{ title?: string, url?: string, duration?: number } | null} currentTrack
 * @param {Array} queue
 */
function buildDashboard(currentTrack, queue) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎵 Music Dashboard')
        .setFooter({ text: 'CottaaBot Music Player' });

    if (currentTrack) {
        const mins = Math.floor((currentTrack.duration || 0) / 60);
        const secs = String((currentTrack.duration || 0) % 60).padStart(2, '0');
        embed.setDescription(
            `**🎶 Now Playing**\n` +
            `[${currentTrack.title}](${currentTrack.url})\n` +
            `⏱️ Duration: \`${mins}:${secs}\``
        );
    } else {
        embed.setDescription('**No track is currently playing.**\nPress **▶ Play / Add** to queue a song!');
    }

    if (queue.length > 0) {
        const queueList = queue
            .slice(0, 10)
            .map((t, i) => {
                const m = Math.floor((t.duration || 0) / 60);
                const s = String((t.duration || 0) % 60).padStart(2, '0');
                return `\`${i + 1}.\` [${t.title}](${t.url}) — \`${m}:${s}\``;
            })
            .join('\n');
        embed.addFields({ name: `📋 Queue (${queue.length} track${queue.length > 1 ? 's' : ''})`, value: queueList });
        if (queue.length > 10) {
            embed.addFields({ name: '\u200b', value: `…and ${queue.length - 10} more` });
        }
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_play')
            .setLabel('▶ Play / Add')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setLabel('⏸ Pause / Resume')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setLabel('⏭ Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setLabel('⏹ Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('music_leave')
            .setLabel('👋 Leave')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

// ─── Slash Command ────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel and open the music dashboard'),

    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        const member = interaction.member;

        // Guard: user must be in a voice channel
        if (!member.voice?.channel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel first!',
                ephemeral: true,
            });
        }

        const voiceChannel = member.voice.channel;
        const guild = interaction.guild;
        const state = getState(guild.id);

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        // Create a new AudioPlayer and subscribe the connection to it
        const player = createAudioPlayer();
        connection.subscribe(player);

        state.connection = connection;
        state.player = player;
        state.isPlaying = false;

        // Gracefully handle disconnects initiated from outside the bot
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    new Promise(resolve =>
                        connection.once(VoiceConnectionStatus.Signalling, resolve)
                    ),
                    new Promise(resolve =>
                        connection.once(VoiceConnectionStatus.Connecting, resolve)
                    ),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 5000)
                    ),
                ]);
            } catch {
                connection.destroy();
                resetState(guild.id);
            }
        });

        // Send the dashboard
        await interaction.deferReply();
        const dashboardPayload = buildDashboard(null, state.queue);
        const dashboardMsg = await interaction.editReply(dashboardPayload);

        state.dashboardMsgId = dashboardMsg.id;
        state.dashboardChId = interaction.channelId;
    },

    // Export the builder so index.js can register it easily
    buildDashboard,
};
