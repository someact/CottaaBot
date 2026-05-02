/**
 * events/musicInteraction.js
 *
 * Handles ALL interactions whose customId starts with `music_` or `modal_music_url`.
 * Completely isolated from the existing interactionCreate.js (temp-vc system).
 *
 * KEY DESIGN: Instead of extracting a signed URL with `yt-dlp -g` (which expires
 * mid-song), we use `spawn('yt-dlp', ['-o', '-', ...])` to pipe audio data
 * directly into @discordjs/voice. This eliminates URL-expiry as a failure mode.
 */

const {
    ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const {
    createAudioResource, AudioPlayerStatus, StreamType,
} = require('@discordjs/voice');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { getState, resetState } = require('../data/musicManager');
const { buildDashboard } = require('../commands/music');

const execFilePromise = promisify(execFile);

// Absolute path to the Netscape-format cookies file exported from your browser.
// Keep this file out of version control (.gitignore).
const COOKIES_PATH = path.resolve(__dirname, '..', 'cookies.txt');

// ─── yt-dlp Helpers ──────────────────────────────────────────────────────────

/**
 * Fetches metadata (title, webpage_url, duration) for a search query or URL.
 * Uses execFile (buffered) since we only need the JSON, not a stream.
 * @param {string} query  YouTube URL or plain search term
 * @returns {Promise<{ title: string, url: string, duration: number }>}
 */
async function getYtInfo(query) {
    const { stdout } = await execFilePromise('yt-dlp', [
        '--cookies', COOKIES_PATH,
        '--dump-json',
        '--default-search', 'ytsearch1:',
        '--no-warnings',
        '--skip-download',
        query,
    ]);
    const data = JSON.parse(stdout.trim().split('\n')[0]); // first result only
    return {
        title: data.title || 'Unknown Title',
        url: data.webpage_url || data.url || query,
        duration: data.duration || 0,
    };
}

/**
 * Spawns yt-dlp and returns its stdout as a Readable stream.
 * Audio is piped in real-time — no signed URL involved, so no expiry risk.
 *
 * @param {string} url  YouTube video URL
 * @returns {{ stream: import('stream').Readable, process: import('child_process').ChildProcess }}
 */
function createYtDlpStream(url) {
    const ytDlpProcess = spawn('yt-dlp', [
        '--cookies', COOKIES_PATH,
        '-f', 'bestaudio[ext=webm]/bestaudio/best',
        '--no-warnings',
        '--no-playlist',
        '-o', '-',   // pipe audio data to stdout
        url,
    ]);

    ytDlpProcess.stderr.on('data', (chunk) => {
        const msg = chunk.toString().trim();
        if (msg) console.warn('[yt-dlp]', msg);
    });

    return { stream: ytDlpProcess.stdout, process: ytDlpProcess };
}

// ─── Dashboard Updater ────────────────────────────────────────────────────────

/**
 * Edits the pinned dashboard message with the latest state.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {Object} state
 * @param {{ title, url, duration } | null} currentTrack
 */
async function updateDashboard(client, guildId, state, currentTrack) {
    if (!state.dashboardChId || !state.dashboardMsgId) return;
    try {
        const channel = await client.channels.fetch(state.dashboardChId).catch(() => null);
        if (!channel) return;
        const msg = await channel.messages.fetch(state.dashboardMsgId).catch(() => null);
        if (!msg) return;
        await msg.edit(buildDashboard(currentTrack, state.queue));
    } catch (err) {
        console.error('[Music] Dashboard update failed:', err.message);
    }
}

// ─── Core Playback Logic ──────────────────────────────────────────────────────

/**
 * Dequeues the next track, spawns a yt-dlp stream, and starts playback.
 * Automatically chains to the next song on Idle or Error.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 */
async function playNext(client, guildId) {
    const state = getState(guildId);

    if (!state.player || !state.connection) return;

    if (state.queue.length === 0) {
        state.isPlaying = false;
        await updateDashboard(client, guildId, state, null);
        return;
    }

    const track = state.queue.shift();
    state.isPlaying = true;

    // Update the dashboard immediately so users see "Now Playing"
    await updateDashboard(client, guildId, state, track);

    // ── Wipe all previous listeners to prevent stacking ──────────────────────
    state.player.removeAllListeners(AudioPlayerStatus.Idle);
    state.player.removeAllListeners('error');

    // ── Idle: song finished normally → play next ─────────────────────────────
    state.player.once(AudioPlayerStatus.Idle, async () => {
        await playNext(client, guildId);
    });

    // ── Player error: log and skip to next ───────────────────────────────────
    state.player.once('error', async (error) => {
        console.error(`[Music] Player error for "${track.title}":`, error.message);
        await _notifyError(client, state, track.title, error.message);
        await playNext(client, guildId);
    });

    try {
        // Spawn yt-dlp and pipe its stdout directly — no URL extraction/expiry
        const { stream, process: ytDlpProcess } = createYtDlpStream(track.url);

        // Surface yt-dlp process failures (e.g. unavailable video)
        ytDlpProcess.on('error', async (err) => {
            console.error('[yt-dlp] Process error:', err.message);
            await _notifyError(client, state, track.title, err.message);
            await playNext(client, guildId);
        });

        ytDlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.warn(`[yt-dlp] Exited with code ${code} for "${track.title}"`);
            }
        });

        // StreamType.Arbitrary → @discordjs/voice uses ffmpeg to transcode the
        // piped WebM/Opus stream.  inlineVolume lets us adjust volume at runtime.
        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
        });
        resource.volume.setVolume(1);

        state.player.play(resource);

    } catch (err) {
        console.error(`[Music] Failed to start "${track.title}":`, err.message);
        await _notifyError(client, state, track.title, err.message);
        await playNext(client, guildId);
    }
}

/**
 * Sends a temporary error notification to the dashboard channel.
 * @private
 */
async function _notifyError(client, state, trackTitle, errMsg) {
    try {
        if (!state.dashboardChId) return;
        const ch = await client.channels.fetch(state.dashboardChId).catch(() => null);
        if (!ch) return;
        const msg = await ch.send(
            `⚠️ Failed to play **${trackTitle}** — skipping.\n\`\`\`${errMsg}\`\`\``
        );
        setTimeout(() => msg.delete().catch(() => {}), 10_000);
    } catch { /* ignore */ }
}

// ─── Event Module ─────────────────────────────────────────────────────────────

module.exports = {
    name: 'interactionCreate',

    /** @param {import('discord.js').Interaction} interaction */
    async execute(interaction, client) {
        // ── Early exit: only handle music-specific interactions ──────────────
        const isMusicButton = interaction.isButton() &&
            interaction.customId.startsWith('music_');
        const isMusicModal = interaction.isModalSubmit() &&
            interaction.customId === 'modal_music_url';

        if (!isMusicButton && !isMusicModal) return;

        const guildId = interaction.guild?.id;
        if (!guildId) return;
        const state = getState(guildId);

        // ════════════════════════════════════════════════════════════════════
        //  BUTTON: music_play  →  Open URL / Search modal
        // ════════════════════════════════════════════════════════════════════
        if (isMusicButton && interaction.customId === 'music_play') {
            const modal = new ModalBuilder()
                .setCustomId('modal_music_url')
                .setTitle('🎵 Add a Song');

            const input = new TextInputBuilder()
                .setCustomId('music_query')
                .setLabel('YouTube URL or search query')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g.  Never Gonna Give You Up  or  https://youtu.be/...')
                .setRequired(true)
                .setMaxLength(300);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // ════════════════════════════════════════════════════════════════════
        //  MODAL SUBMIT: modal_music_url  →  Fetch metadata & enqueue
        // ════════════════════════════════════════════════════════════════════
        if (isMusicModal) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const query = interaction.fields.getTextInputValue('music_query').trim();

            let trackInfo;
            try {
                trackInfo = await getYtInfo(query);
            } catch (err) {
                console.error('[Music] getYtInfo error:', err.message);
                return interaction.editReply({
                    content: `❌ Could not find a track for: \`${query}\`\n\`\`\`${err.message}\`\`\``,
                });
            }

            trackInfo.requesterId = interaction.user.id;
            state.queue.push(trackInfo);

            const mins = Math.floor(trackInfo.duration / 60);
            const secs = String(trackInfo.duration % 60).padStart(2, '0');
            await interaction.editReply({
                content: `✅ Added to queue: **${trackInfo.title}** (\`${mins}:${secs}\`)`,
            });

            if (!state.isPlaying) {
                await playNext(client, guildId);
            } else {
                // Refresh dashboard to reflect the new queue entry
                await updateDashboard(client, guildId, state, {
                    title: '(currently playing — check dashboard)',
                    url: '',
                    duration: 0,
                });
            }
            return;
        }

        // ════════════════════════════════════════════════════════════════════
        //  BUTTON: music_pause  →  Pause or Resume
        // ════════════════════════════════════════════════════════════════════
        if (interaction.customId === 'music_pause') {
            if (!state.player) {
                return interaction.reply({ content: '❌ No player active.', flags: MessageFlags.Ephemeral });
            }

            const status = state.player.state.status;

            if (status === AudioPlayerStatus.Playing) {
                state.player.pause();
                return interaction.reply({ content: '⏸ Paused.', flags: MessageFlags.Ephemeral });
            } else if (status === AudioPlayerStatus.Paused) {
                state.player.unpause();
                return interaction.reply({ content: '▶️ Resumed.', flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({ content: '❌ Nothing is playing right now.', flags: MessageFlags.Ephemeral });
        }

        // ════════════════════════════════════════════════════════════════════
        //  BUTTON: music_skip  →  Skip current track
        // ════════════════════════════════════════════════════════════════════
        if (interaction.customId === 'music_skip') {
            if (!state.player || !state.isPlaying) {
                return interaction.reply({ content: '❌ Nothing is playing to skip.', flags: MessageFlags.Ephemeral });
            }
            // stop(true) forces the Idle event → playNext
            state.player.stop(true);
            return interaction.reply({ content: '⏭ Skipped!', flags: MessageFlags.Ephemeral });
        }

        // ════════════════════════════════════════════════════════════════════
        //  BUTTON: music_stop  →  Clear queue and stop playback
        // ════════════════════════════════════════════════════════════════════
        if (interaction.customId === 'music_stop') {
            state.queue = [];
            state.isPlaying = false;
            if (state.player) {
                state.player.removeAllListeners(AudioPlayerStatus.Idle);
                state.player.removeAllListeners('error');
                state.player.stop(true);
            }
            await updateDashboard(client, guildId, state, null);
            return interaction.reply({ content: '⏹ Stopped and cleared the queue.', flags: MessageFlags.Ephemeral });
        }

        // ════════════════════════════════════════════════════════════════════
        //  BUTTON: music_leave  →  Disconnect and clean up
        // ════════════════════════════════════════════════════════════════════
        if (interaction.customId === 'music_leave') {
            if (state.player) {
                state.player.removeAllListeners(AudioPlayerStatus.Idle);
                state.player.removeAllListeners('error');
                state.player.stop(true);
            }
            if (state.connection) {
                state.connection.destroy();
            }
            await updateDashboard(client, guildId, state, null);
            resetState(guildId);
            return interaction.reply({ content: '👋 Left the voice channel and cleared the queue.', flags: MessageFlags.Ephemeral });
        }
    },
};
