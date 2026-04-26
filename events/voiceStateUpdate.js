const config = require('../config.json');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        const db = client.db;

        // --- ออกจากห้อง: ตั้ง timer หากห้องว่าง ---
        if (oldState.channelId) {
            const channelData = await db.get(
                'SELECT * FROM temp_channels WHERE channelId = ?',
                [oldState.channelId]
            );

            if (channelData && oldState.channel) {
                const memberCount = oldState.channel.members.size;

                if (memberCount === 0) {
                    // ✅ ห้องว่าง: ตั้ง timer หมดอายุ
                    const expiresAt = Date.now() + (config.VC_TIMEOUT_MINUTES * 60 * 1000);
                    await db.run(
                        'UPDATE temp_channels SET expiresAt = ? WHERE channelId = ?',
                        [expiresAt, oldState.channelId]
                    );
                    console.log(`[VC] ห้อง ${oldState.channelId} ว่าง จะหมดอายุใน ${config.VC_TIMEOUT_MINUTES} นาที`);
                }
                // ✅ ยังมีคนอยู่: ยกเลิก timer (กรณีคนออกบางส่วน แต่ยังมีคนเหลือ)
                else if (channelData.expiresAt !== null) {
                    await db.run(
                        'UPDATE temp_channels SET expiresAt = NULL WHERE channelId = ?',
                        [oldState.channelId]
                    );
                }
            }
        }

        // --- เข้าห้อง: ยกเลิก timer ---
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
