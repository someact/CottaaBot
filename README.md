# CottaaBot

A multi-purpose Discord bot built with Discord.js v14. It features an advanced temporary voice channel management system, a high-quality YouTube music player utilizing yt-dlp, and a Minecraft server status utility.

## Features

### Temporary Voice Channels
*   **Auto-Creation:** Generates a private voice channel and an exclusive text control panel with a single click.
*   **Private Control Panel:** A dedicated text channel visible only to the channel owner for managing settings.
*   **Comprehensive Management:** Channel owners can rename the room, set user limits, lock/unlock, hide/unhide, and kick users via an interactive UI.
*   **Access Control:** Support for blacklisting specific users from joining and whitelisting friends to bypass locked channels.
*   **Ownership Transfer:** Easily transfer the voice channel ownership and control panel access to another user.
*   **Auto-Cleanup:** The system automatically tracks empty voice channels and deletes them, along with their control panels, after a specified timeout.

### Music Player
*   **High-Quality Streaming:** Streams audio directly from YouTube using `yt-dlp` and `@discordjs/voice`.
*   **Interactive Dashboard:** A dynamic embed message with buttons to Play/Add, Pause/Resume, Skip, Stop, and Leave.
*   **Anti-Bot Bypass:** Uses a local `cookies.txt` file to authenticate with YouTube, bypassing region locks and bot-blocking mechanisms for official music videos.
*   **Queue System:** Supports queuing multiple tracks and automatically plays the next song when the current one finishes.

### Utility & Admin Tools
*   **Minecraft Server Status:** Fetches live data (MOTD, player count, version) from any Java Minecraft server, including those using tunneling services like playit.gg or ngrok.
*   **Chat Management:** Bulk delete up to 100 recent messages in a text channel.
*   **System Cleanup:** Forcefully delete all active temporary voice and text channels if needed.

## Prerequisites

Before running the bot, ensure you have the following installed on your system:
*   Node.js (v18.x or higher)
*   Git
*   FFmpeg (Required for audio transcoding)
*   Python and yt-dlp (Required for the music player)

## Setup and Installation

### Windows and Linux

1.  Clone the repository:
    ```bash
    git clone <your_github_repository_url>
    cd cottaabot
    ```
2.  Install Node.js dependencies:
    ```bash
    npm install
    ```
3.  Install FFmpeg and yt-dlp:
    *   **Windows (via Winget):** Run `winget install ffmpeg` and `winget install yt-dlp` in Command Prompt/PowerShell.
    *   **Linux (Ubuntu/Debian):** Run `sudo apt update && sudo apt install ffmpeg python3 python3-pip` then `pip3 install yt-dlp`.

### Termux (Android)

1.  Update packages and install core dependencies:
    ```bash
    pkg update && pkg upgrade
    pkg install git nodejs-lts ffmpeg python yt-dlp
    ```
2.  Clone the repository and enter the directory:
    
```bash
    git clone <your_github_repository_url>
    cd cottaabot
    ```
3.  Fix Android NDK build issues (Required for sqlite3 on Termux) and install dependencies:
    ```bash
    export GYP_DEFINES="android_ndk_path=''"
    npm install
    ```

## Configuration

### 1. Environment Variables (.env)
Create a `.env` file in the root directory and insert your Discord Bot Token:
```env
TOKEN=Your_Discord_Bot_Token_Here
```

### 2. Bot Settings (config.json)
Edit the `config.json` file to customize timeouts and system settings:
```json
{
    "VC_TIMEOUT_MINUTES": 3,
    "REPLY_TIMEOUT_SECONDS": 5,
    "TEXT_CHANNEL_DELETE_DELAY_SECONDS": 5
}
```
*   **VC_TIMEOUT_MINUTES**: Duration (in minutes) to wait before deleting an empty voice channel.
*   **REPLY_TIMEOUT_SECONDS**: Auto-delete delay for the bot's ephemeral messages.
*   **TEXT_CHANNEL_DELETE_DELAY_SECONDS**: Delay (in seconds) before deleting the private text control panel after the voice channel is deleted.

## Running the Bot

Once setup is complete, start the bot:

```bash
node index.js
```

## Music Player Requirements

*   **Cookies File**: For the music player to work reliably with official music videos, you must create a `cookies.txt` file in the project root. This file is used by `yt-dlp` to authenticate with YouTube and bypass bot restrictions.

## Slash command
```bash
/setup
/join 
/ipmc <ip>
/cleartmp
/clearchat
/help
```