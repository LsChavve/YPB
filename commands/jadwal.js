import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName('jadwal')
    .setDescription('Menampilkan jadwal pelajaran untuk kelas tertentu.')
    .addStringOption(option =>
      option
        .setName('kelas')
        .setDescription('Nama kelas (contoh: ximipa2, xiisoshum1, dll)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const kelas = interaction.options.getString('kelas').toLowerCase();
    const imagePath = path.join(__dirname, '..', 'jadwalFoto', `${kelas}.jpg`);

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return interaction.reply({
        content: `❌ Jadwal untuk kelas \`${kelas}\` tidak ditemukan.`,
        ephemeral: true
      });
    }

    const attachment = new AttachmentBuilder(imagePath);
    await interaction.reply({
      content: `📅 Jadwal untuk kelas **${kelas}**`,
      files: [attachment],
      ephemeral: true // ephemeral by your request
    });
  }
};