// commands/upload.js
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ComponentType,
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
const tempPath = path.join(__dirname, '../temp');
const devID = process.env.DevID;
const logPath = path.join(__dirname, '../cooldown-log.json');

const classOptions = [
  { name: 'X 1–7', values: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'] },
  { name: 'XI MIPA 1–4', values: ['ximipa1', 'ximipa2', 'ximipa3', 'ximipa4'] },
  { name: 'XI SOSHUM 5–7', values: ['xisoshum5', 'xisoshum6', 'xisoshum7'] },
  { name: 'XII SOSHUM 1–2', values: ['xiisoshum1', 'xiisoshum2'] },
  { name: 'XII MIPA 1–2', values: ['xiimipa1', 'xiimipa2'] },
  { name: 'XII TERAPAN 1–2', values: ['xiiterapan1', 'xiiterapan2'] },
  { name: 'XII FORMAL 1–2', values: ['xiiformal1', 'xiiformal2'] },
];

const allClassValues = classOptions.flatMap(group => group.values);

export default {
  data: new SlashCommandBuilder()
    .setName('upload')
    .setDescription('Upload jadwal baru')
    .addAttachmentOption(option =>
      option.setName('image').setDescription('Gambar jadwal (.jpg)').setRequired(true))
    .addStringOption(option =>
      option.setName('kelas')
        .setDescription('Pilih kelas kamu')
        .setRequired(true)
        .addChoices(...allClassValues.map(c => ({
          name: c.toUpperCase(),
          value: c,
        })))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const image = interaction.options.getAttachment('image');
    const kelas = interaction.options.getString('kelas').toLowerCase();
    const user = interaction.user;
    const userId = user.id;

    if (!image.name.endsWith('.jpg')) {
      return await interaction.editReply({ content: '❌ File harus berformat `.jpg`.' });
    }

    // ⏳ Cooldown
    const now = Date.now();
    let log = {};
    if (fs.existsSync(logPath)) {
      log = JSON.parse(fs.readFileSync(logPath));
    }

    const lastUpload = log[userId];
    if (userId !== devID && lastUpload && now - lastUpload < 7 * 24 * 60 * 60 * 1000) {
      const diff = 7 * 24 * 60 * 60 * 1000 - (now - lastUpload);
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      return await interaction.editReply({
        content: `⛔ Kamu sudah upload minggu ini. Coba lagi dalam ${d} hari, ${h} jam, ${m} menit, ${s} detik.`,
      });
    }

    // 📁 Save temp
    const newFileName = `${kelas}.jpg`;
    const fileData = await fetch(image.url).then(res => res.arrayBuffer());
    const tempFile = path.join(tempPath, `${Date.now()}_${newFileName}`);
    fs.writeFileSync(tempFile, Buffer.from(fileData));

    // 📩 Send to admin
    const preview = new AttachmentBuilder(tempFile);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve_${kelas}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${kelas}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

    const adminUser = await interaction.client.users.fetch(devID);
    await adminUser.send({
      content: `📥 **Request jadwal oleh ${user.username}**\nKelas: \`${kelas}\`\nFile: \`${image.name}\``,
      files: [preview],
      components: [row],
    });

    await interaction.editReply({ content: '✅ Request berhasil dikirim ke admin.' });

    // 🎯 Collector
    const collector = adminUser.dmChannel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.user.id !== devID) return i.reply({ content: '❌ Hanya admin yang bisa merespon.', ephemeral: true });
      await i.deferUpdate();

      const className = i.customId.split('_')[1];

      if (i.customId.startsWith('approve_')) {
        try {
          fs.copyFileSync(tempFile, path.join(jadwalPath, newFileName));
          fs.unlinkSync(tempFile);
          log[userId] = now;
          fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
          await adminUser.send(`✅ Jadwal kelas \`${className}\` disetujui.`);
          await user.send(`✅ Jadwal untuk kelas \`${className}\` kamu telah disetujui.`);
        } catch (err) {
          console.error(err);
          await adminUser.send('⚠️ Gagal menyimpan file.');
        }
      }

      if (i.customId.startsWith('reject_')) {
        const select = new StringSelectMenuBuilder()
          .setCustomId(`reject_reason_${kelas}_${userId}`)
          .setPlaceholder('Pilih alasan penolakan')
          .addOptions([
            { label: 'Bukan format JPG', value: 'Format file bukan JPG' },
            { label: 'Salah kelas', value: 'Kelas tidak sesuai' },
            { label: 'Jadwal buram/tidak jelas', value: 'Jadwal tidak jelas' },
            { label: 'Gambar tidak relevan', value: 'Gambar tidak sesuai' },
          ]);

        const selectRow = new ActionRowBuilder().addComponents(select);
        await adminUser.send({ content: '🔻 Pilih alasan penolakan:', components: [selectRow] });
      }
    });

    // 📩 Reason Collector
    const menuCollector = adminUser.dmChannel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 10 * 60 * 1000,
    });

    menuCollector.on('collect', async i => {
      const [_, __, kelasVal, targetId] = i.customId.split('_');
      const selectedReason = i.values[0];
      if (i.user.id !== devID) return i.reply({ content: 'Hanya admin.', ephemeral: true });

      fs.unlinkSync(tempFile);
      await i.reply({ content: `⛔ Ditolak: ${selectedReason}` });
      const targetUser = await interaction.client.users.fetch(targetId);
      await targetUser.send(`❌ Jadwal kamu untuk kelas \`${kelasVal}\` ditolak. Alasan: ${selectedReason}`);
    });
  },
};