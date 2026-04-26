# CottaaBot

A personal Discord bot dedicated to managing temporary voice channels and providing utility features for your server.

## Features

### Temporary Voice Channels
* **Auto-Create Rooms:** Automatically generate private voice and text control channels with a single click.
* **Private Control Panel:** Each voice channel comes with a dedicated text channel for configuration, visible exclusively to the channel owner.
* **Comprehensive Permissions Management:** Easily rename the channel, limit user capacity, lock or unlock, hide or unhide, and kick users.
* **Ownership Transfer:** Transfer the ownership of the voice channel to another user. The control panel access will automatically shift to the new owner.
* **Access Control (Blacklist & Whitelist):** Block specific users from joining, or whitelist friends to bypass a locked channel.
* **Auto-Cleanup:** Automatically deletes the temporary voice channel and its associated control text channel after it remains empty for a configurable amount of time.
* **Activity Logging:** Records important channel actions and administrative commands to a designated log channel.

### Commands
* `!help`: Displays a list of available commands and their descriptions.
* `!setup`: Initializes the bot by sending the control panel interface for users to create temporary voice channels.
* `!clearchat`: Clears up to 100 recent messages in the current text channel.
* `!cleartmp`: Forcefully deletes all temporary voice and text channels currently active in the server.
* `!ipmc <server-ip>`: Fetches and displays the current status, MOTD, and player count of a specified Minecraft server.

---

## Prerequisites

* Node.js 18.x or above
* SQLite3
* Git

---

## Installation and Setup

### Windows and Linux
1. Clone the repository:
   ```bash
   git clone https://github.com/someact/CottaaBot.git
   cd cottaabot
   ```
2. Install the required dependencies:
   ```bash
   npm install
   ```

### Termux (Android)
1. Update packages and install Node.js and Git:
   ```bash
   pkg update && pkg upgrade
   pkg install git nodejs-lts
   ```
2. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/someact/CottaaBot.git
   cd cottaabot
   npm install
   ```

---

## Configuration

### Discord Bot Token
Create a `.env` file in the root directory of the project and add your bot token:
```env
TOKEN=Insert_bot_token_here
```

### Configuration File
Configure your server IDs and timeout preferences in `config.json`:
```json
{
    "CATEGORY_ID": "",
    "DEFAULT_ROLE_ID": "",
    "LOG_CHANNEL_ID": "",
    "VC_TIMEOUT_MINUTES": 3,
    "REPLY_TIMEOUT_SECONDS": 5,
    "TEXT_CHANNEL_DELETE_DELAY_SECONDS": 5
}
```
* **CATEGORY_ID**: The ID of the category where the temporary channels will be created.
* **DEFAULT_ROLE_ID**: The ID of the server's default role (usually the `@everyone` role).
* **LOG_CHANNEL_ID**: The ID of the text channel where bot activity logs will be sent.
* **VC_TIMEOUT_MINUTES**: The number of minutes an empty voice channel will remain open before being deleted.
* **REPLY_TIMEOUT_SECONDS**: The number of seconds before the bot's ephemeral reply messages are automatically deleted.
* **TEXT_CHANNEL_DELETE_DELAY_SECONDS**: The delay (in seconds) before deleting the private control text channel after the voice channel is manually deleted.

---

## Running the Bot

Once the installation and configuration are complete, you can start the bot using the following command:
```bash
node index.js
```