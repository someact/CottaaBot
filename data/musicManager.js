/**
 * musicManager.js
 * A central Map that stores per-guild music state.
 *
 * Shape of each value:
 * {
 *   connection     : VoiceConnection | null,
 *   player         : AudioPlayer     | null,
 *   queue          : Array<{ title, url, duration, requesterId }>,
 *   dashboardMsgId : string | null,   // ID of the pinned dashboard message
 *   dashboardChId  : string | null,   // Channel ID of the dashboard
 *   isPlaying      : boolean,
 * }
 */

/** @type {Map<string, Object>} guildId -> musicState */
const musicManager = new Map();

/**
 * Returns the music state for a guild, creating a fresh one if it doesn't exist.
 * @param {string} guildId
 */
function getState(guildId) {
    if (!musicManager.has(guildId)) {
        musicManager.set(guildId, {
            connection: null,
            player: null,
            queue: [],
            dashboardMsgId: null,
            dashboardChId: null,
            isPlaying: false,
        });
    }
    return musicManager.get(guildId);
}

/**
 * Completely resets the music state for a guild (called on leave/stop).
 * @param {string} guildId
 */
function resetState(guildId) {
    musicManager.set(guildId, {
        connection: null,
        player: null,
        queue: [],
        dashboardMsgId: null,
        dashboardChId: null,
        isPlaying: false,
    });
}

module.exports = { musicManager, getState, resetState };
