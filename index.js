// index.js
import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('🔍 Loading commands...');
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = (await import(`file://${filePath}`)).default;
  if (command?.data && command?.execute) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded: /${command.data.name}`);
  } else {
    console.warn(`⚠️ Skipped: ${file} (missing data or execute)`);
  }
}

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
try {
  console.log('🔁 Refreshing application (/) commands...');
  await rest.put(
    Routes.applicationCommands(process.env.CID),
    { body: commands }
  );
  console.log('✅ Slash commands registered successfully!');
} catch (err) {
  console.error('❌ Error registering slash commands:', err);
}

// On bot ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// Slash command interaction
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Error executing /${interaction.commandName}:`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Terjadi kesalahan saat menjalankan perintah ini.', ephemeral: true });
    }
  }
});

// Global error handler
process.on('unhandledRejection', error => {
  console.error('🔥 Unhandled promise rejection:', error);
});

client.login(process.env.TOKEN);