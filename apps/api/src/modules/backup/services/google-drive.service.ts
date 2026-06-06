import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

@Injectable()
export class GoogleDriveService implements OnModuleInit {
  private readonly logger = new Logger(GoogleDriveService.name);
  private drive: drive_v3.Drive;
  private readonly folderId: string;

  constructor(private readonly configService: ConfigService) {
    this.folderId = this.configService.getOrThrow<string>('google.driveFolderId');
  }

  onModuleInit() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: this.configService.getOrThrow<string>('google.clientEmail'),
        private_key: this.configService.getOrThrow<string>('google.privateKey'),
      },
      // drive (not drive.file) is required for Shared Drive access
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async upload(filename: string, content: string): Promise<{ fileId: string; webViewLink: string }> {
    const stream = Readable.from([content]);
    const res = await this.drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: filename,
        parents: [this.folderId],
      },
      media: {
        mimeType: 'application/octet-stream',
        body: stream,
      },
      fields: 'id,webViewLink',
    });
    const fileId = res.data.id!;
    const webViewLink = res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}`;
    this.logger.log(`Uploaded backup to Drive: ${fileId}`);
    return { fileId, webViewLink };
  }

  async download(fileId: string): Promise<string> {
    const res = await this.drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' },
    );
    return res.data as string;
  }

  async listByFolder(): Promise<drive_v3.Schema$File[]> {
    const res = await this.drive.files.list({
      q: `'${this.folderId}' in parents and trashed = false`,
      fields: 'files(id,name,createdTime,size)',
      orderBy: 'createdTime asc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files ?? [];
  }

  async delete(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId, supportsAllDrives: true });
    this.logger.log(`Deleted Drive file: ${fileId}`);
  }
}
