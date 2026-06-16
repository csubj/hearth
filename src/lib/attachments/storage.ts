import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsDir } from "./config";

export function resolveUploadPath(storagePath: string): string {
  const uploadsDir = path.resolve(process.cwd(), getUploadsDir());
  const resolved = path.resolve(uploadsDir, storagePath);

  if (resolved !== uploadsDir && !resolved.startsWith(`${uploadsDir}${path.sep}`)) {
    throw new Error("Invalid storage path.");
  }

  return resolved;
}

export async function ensureUploadsDir(): Promise<string> {
  const uploadsDir = path.resolve(process.cwd(), getUploadsDir());
  await fs.mkdir(uploadsDir, { recursive: true });
  return uploadsDir;
}

export async function writeUploadFile(storagePath: string, data: Buffer): Promise<void> {
  await ensureUploadsDir();
  const filePath = resolveUploadPath(storagePath);
  await fs.writeFile(filePath, data);
}

export async function readUploadFile(storagePath: string): Promise<Buffer> {
  const filePath = resolveUploadPath(storagePath);
  return fs.readFile(filePath);
}

export async function deleteUploadFile(storagePath: string): Promise<void> {
  const filePath = resolveUploadPath(storagePath);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
