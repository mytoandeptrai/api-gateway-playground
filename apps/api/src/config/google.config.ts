import { registerAs } from '@nestjs/config';

export default registerAs('google', () => ({
  clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
  privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
}));
