"use server";

import { Upload } from "../interfaces/upload.interface";

export default async function getUpload(uploadId: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload/${uploadId}/status`, {
    next: { tags: [`upload-${uploadId}`] },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch upload');
  }
  
  return response.json() as Promise<Upload>;
} 