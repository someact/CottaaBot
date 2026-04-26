const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function initDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS temp_channels (
            channelId     TEXT PRIMARY KEY,
            textChannelId TEXT NOT NULL,
            guildId       TEXT NOT NULL,
            ownerId       TEXT NOT NULL,
            controlMsgId  TEXT,
            expiresAt     INTEGER
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            action    TEXT,
            userId    TEXT,
            guildId   TEXT,
            details   TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_expires ON temp_channels (expiresAt)
        WHERE expiresAt IS NOT NULL;
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS guild_config (
            guildId TEXT PRIMARY KEY,
            categoryId TEXT NOT NULL,
            defaultRoleId TEXT NOT NULL,
            logChannelId TEXT
        )
    `);

    return db;
}

module.exports = { initDb };