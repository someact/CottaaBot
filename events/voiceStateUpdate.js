const config = require('../config.json');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        const db = client.db;

        // --- Leaving the room: Set a timer if the room is empty. ---
        if (oldState.channelId) {
            const channelData = await db.get(
                'SELECT * FROM temp_channels WHERE channelId = ?',
                [oldState.channelId]
            );

            if (channelData && oldState.channel) {
                const memberCount = oldState.channel.members.size;

                if (memberCount === 0) {
                    // empty room: set expiration timer
                    const expiresAt = Date.now() + (config.VC_TIMEOUT_MINUTES * 60 * 1000);
                    await db.run(
                        'UPDATE temp_channels SET expiresAt = ? WHERE channelId = ?',
                        [expiresAt, oldState.channelId]
                    );
                    console.log(`[VC] ห้อง ${oldState.channelId} ว่าง จะหมดอายุใน ${config.VC_TIMEOUT_MINUTES} นาที`);
                }
                // still has members: cancel timer (case: some members leave but others remain)
                else if (channelData.expiresAt !== null) {
                    await db.run(
                        'UPDATE temp_channels SET expiresAt = NULL WHERE channelId = ?',
                        [oldState.channelId]
                    );
                }
            }
        }

        // --- Joining the room: Cancel timer ---
        if (newState.channelId) {
            const channelData = await db.get(
                'SELECT * FROM temp_channels WHERE channelId = ?',
                [newState.channelId]
            );
            if (channelData && channelData.expiresAt !== null) {
                await db.run(
                    'UPDATE temp_channels SET expiresAt = NULL WHERE channelId = ?',
                    [newState.channelId]
                );
                console.log(`[VC] ห้อง ${newState.channelId} มีคนเข้า ยกเลิก timer แล้ว`);
            }
        }
    }
};
