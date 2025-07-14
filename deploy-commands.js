// deploy-commands.js
import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

config(); // Load from .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('🧭 Found command files:', commandFiles);

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  if (command.default?.data) {
    console.log(`✅ Loaded command: /${command.default.data.name}`);
    commands.push(command.default.data.toJSON());
  } else {
    console.warn(`⚠️ Skipping ${file} — no valid command export.`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

try {
  console.log('\n🚀 Registering slash commands to Discord...');
  await rest.put(
    Routes.applicationCommands(process.env.CID),
    { body: commands }
  );
  console.log('✅ All slash commands registered!');
} catch (error) {
  console.error('❌ Error while registering commands:', error);
}