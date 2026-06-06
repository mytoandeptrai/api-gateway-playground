import { registerAs } from '@nestjs/config';

export default registerAs('backup', () => ({
  adminEmail: process.env.ADMIN_EMAIL || '',
  notificationEmails: process.env.BACKUP_NOTIFICATION_EMAILS || '',
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
  maxBackups: parseInt(process.env.MAX_BACKUPS, 10) || 4,
}));
