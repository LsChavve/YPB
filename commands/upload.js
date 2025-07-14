// commands/upload.js
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jadwalPath = path.join(__dirname, '../jadwalFoto');
const tempPathDir = path.join(__dirname, '../temp');
const devID = process.env.DevID;
const logPath = path.join(__dirname, '../uploadLog.json');

const classChoices = [
  { name: 'X-1', value: 'x1' },
  { name: 'X-2', value: 'x2' },
  { name: 'X-3', value: 'x3' },
  { name: 'X-4', value: 'x4' },
  { name: 'X-5', value: 'x5' },
  { name: 'X-6', value: 'x6' },
  { name: 'X-7', value: 'x7' },

  { name: 'XI MIPA 1', value: 'ximipa1' },
  { name: 'XI MIPA 2', value: 'ximipa2' },
  { name: 'XI MIPA 3', value: 'ximipa3' },
  { name: 'XI MIPA 4', value: 'ximipa4' },

  { name: 'XI SOSHUM 5', value: 'xisoshum5' },
  { name: 'XI SOSHUM 6', value: 'xisoshum6' },
  { name: 'XI SOSHUM 7', value: 'xisoshum7' },

  { name: 'XII SOSHUM 1', value: 'xiisoshum1' },
  { name: 'XII SOSHUM 2', value: 'xiisoshum2' },

  { name: 'XII MIPA 1', value: 'xiimipa1' },
  { name: 'XII MIPA 2', value: 'xiimipa2' },

  { name: 'XII TERAPAN 1', value: 'xiiterapan1' },
  { name: 'XII TERAPAN 2', value: 'xiiterapan2' },

  { name: 'XII FORMAL 1', value: 'xiiformal1' },
  { name: 'XII FORMAL 2', value: 'xiiformal2' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('upload')
    .setDescription('Upload gambar jadwal baru')
    .addAttachmentOption(option =>
      option.setName('image').setDescription('Gambar jadwal (.jpg)').setRequired(true))
    .addStringOption(option =>
      option.setName('kelas').setDescription('Pilih kelas kamu').setRequired(true)
        .addChoices(...classChoices.map(c => ({ name: c, value: c })))
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    const userId = user.id;
    const kelas = interaction.options.getString('kelas');
    const image = interaction.options.getAttachment('image');

    if (!image.name.endsWith('.jpg')) {
      return await interaction.editReply({ content: '❌ File harus berformat `.jpg`.' });
    }

    // 🔹 Check cooldown
    const now = Date.now();
    let log = {};
    if (fs.existsSync(logPath)) {
      log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    }
    const lastUpload = log[userId];
    if (userId !== devID && lastUpload && now - lastUpload < 7 * 24 * 60 * 60 * 1000) {
      const msLeft = 7 * 24 * 60 * 60 * 1000 - (now - lastUpload);
      const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((msLeft % (1000 * 60)) / 1000);
      return await interaction.editReply({
        content: `⛔ Kamu sudah upload minggu ini. Coba lagi dalam ${days}h ${hours}j ${minutes}m ${seconds}d.`
      });
    }

    const timestamp = Date.now();
    const tempFileName = `${timestamp}_${kelas}.jpg`;
    const fullTempPath = path.join(tempPathDir, tempFileName);
    const imageBuffer = await fetch(image.url).then(res => res.arrayBuffer());
    fs.writeFileSync(fullTempPath, Buffer.from(imageBuffer));

    // 🔹 Prepare buttons & preview
    const preview = new AttachmentBuilder(fullTempPath);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve_${timestamp}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${timestamp}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

    const adminUser = await interaction.client.users.fetch(devID);
    const dm = await adminUser.createDM();
    await dm.send({
      content: `📥 **Request jadwal oleh ${user.username}**\nKelas: \`${kelas}\`\nNama file: \`${image.name}\``,
      files: [preview],
      components: [row]
    });

    await interaction.editReply({ content: '✅ Request berhasil dikirim ke admin.' });

    const collector = dm.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000,
      filter: i => i.user.id === devID
    });

    collector.on('collect', async i => {
      await i.deferUpdate();

      const finalFileName = `${kelas}.jpg`;
      const finalDestPath = path.join(jadwalPath, finalFileName);

      if (i.customId.startsWith('approve_')) {
        fs.copyFileSync(fullTempPath, finalDestPath);
        fs.unlinkSync(fullTempPath);

        log[userId] = now;
        fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

        await dm.send(`✅ Jadwal untuk \`${kelas}\` berhasil disimpan.`);
        await user.send(`✅ Jadwal kamu untuk \`${kelas}\` telah disetujui oleh admin.`);
      }

      if (i.customId.startsWith('reject_')) {
        const reasons = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`reason_${timestamp}`)
            .setPlaceholder('Pilih alasan penolakan')
            .addOptions([
              { label: 'Format salah', value: 'Format gambar tidak sesuai (.jpg)' },
              { label: 'Bukan jadwal', value: 'Gambar bukan foto jadwal pelajaran' },
              { label: 'Kualitas buruk', value: 'Kualitas gambar terlalu buram' },
              { label: 'Duplikat', value: 'Jadwal sudah tersedia' },
              { label: 'Lainnya', value: 'Alasan lain' }
            ])
        );

        await dm.send({ content: '❌ Pilih alasan penolakan:', components: [reasons] });

        const reasonCollector = dm.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          max: 1,
          time: 60_000,
          filter: x => x.user.id === devID
        });

        reasonCollector.on('collect', async select => {
          const reason = select.values[0];
          fs.unlinkSync(fullTempPath);
          await select.reply({ content: `⛔ Ditolak: ${reason}`, ephemeral: true });
          await user.send(`❌ Jadwal kamu untuk \`${kelas}\` ditolak. Alasan: ${reason}`);
        });
      }
    });
  }
};