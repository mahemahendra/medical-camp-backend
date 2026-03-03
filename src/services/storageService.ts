import { Storage, Bucket } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Storage service abstraction - supports local disk and Google Cloud Storage
 * 
 * Storage mode is determined by GCS_BUCKET_NAME env var:
 *   - If set: uploads go to GCS and URLs are public GCS URLs
 *   - If not set: uploads go to local disk (./uploads) — same as before
 * 
 * GCS Authentication:
 *   - On GCP VMs: automatic via service account (no key file needed)
 *   - Locally: set GOOGLE_APPLICATION_CREDENTIALS env var pointing to a key file
 */

export type StorageMode = 'local' | 'gcs';

interface UploadResult {
  /** Public URL to access the file */
  fileUrl: string;
  /** The filename/key stored */
  fileName: string;
}

class StorageService {
  private mode: StorageMode;
  private bucket?: Bucket;
  private bucketName?: string;
  private localUploadDir: string;

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME;
    this.localUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    
    if (this.bucketName) {
      this.mode = 'gcs';
      const storage = new Storage(); // Auto-detects credentials
      this.bucket = storage.bucket(this.bucketName);
      console.log(`Storage: Google Cloud Storage (bucket: ${this.bucketName})`);
    } else {
      this.mode = 'local';
      // Ensure local upload directory exists
      if (!fs.existsSync(this.localUploadDir)) {
        fs.mkdirSync(this.localUploadDir, { recursive: true });
      }
      console.log(`Storage: Local disk (${this.localUploadDir})`);
    }
  }

  getMode(): StorageMode {
    return this.mode;
  }

  /**
   * Upload a file from a multer-processed local temp file to the configured storage
   * Used after multer saves to disk — reads from disk then uploads to GCS
   */
  async uploadFromDisk(localPath: string, originalName: string, mimeType: string, backendUrl: string): Promise<UploadResult> {
    const ext = path.extname(originalName).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    const fileName = `${randomName}${ext}`;

    if (this.mode === 'gcs' && this.bucket) {
      // Upload to GCS
      const gcsFile = this.bucket.file(fileName);
      await gcsFile.save(fs.readFileSync(localPath), {
        metadata: { contentType: mimeType },
        public: true, // Make publicly accessible
      });

      // Delete local temp file
      fs.unlinkSync(localPath);

      const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
      return { fileUrl, fileName };
    } else {
      // Local mode — file is already in the right place (multer wrote it)
      // Just return the URL
      const fileUrl = `${backendUrl}/uploads/${path.basename(localPath)}`;
      return { fileUrl, fileName: path.basename(localPath) };
    }
  }

  /**
   * Upload raw buffer data (e.g., QR code image generated in memory)
   */
  async uploadBuffer(buffer: Buffer, fileName: string, mimeType: string, backendUrl: string): Promise<UploadResult> {
    if (this.mode === 'gcs' && this.bucket) {
      const gcsFile = this.bucket.file(fileName);
      await gcsFile.save(buffer, {
        metadata: { contentType: mimeType },
        public: true,
      });
      const fileUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
      return { fileUrl, fileName };
    } else {
      // Save to local disk
      const filePath = path.join(this.localUploadDir, fileName);
      fs.writeFileSync(filePath, buffer);
      const fileUrl = `${backendUrl}/uploads/${fileName}`;
      return { fileUrl, fileName };
    }
  }

  /**
   * Delete a file by its URL or filename
   */
  async deleteFile(fileUrlOrName: string): Promise<void> {
    try {
      if (this.mode === 'gcs' && this.bucket) {
        // Extract filename from GCS URL or use as-is
        const fileName = fileUrlOrName.includes('storage.googleapis.com')
          ? fileUrlOrName.split('/').pop()!
          : path.basename(fileUrlOrName);
        await this.bucket.file(fileName).delete({ ignoreNotFound: true });
      } else {
        // Local delete
        const fileName = path.basename(fileUrlOrName);
        const filePath = path.join(this.localUploadDir, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to delete file:', fileUrlOrName, error);
    }
  }

  /**
   * Get the local file path for serving (only works in local mode)
   */
  getLocalPath(fileName: string): string | null {
    if (this.mode !== 'local') return null;
    return path.join(this.localUploadDir, fileName);
  }
}

// Singleton instance
export const storageService = new StorageService();
