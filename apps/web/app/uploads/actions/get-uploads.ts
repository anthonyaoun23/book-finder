"use server";

import { Upload } from "../interfaces/upload.interface";

export default async function getUploads() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
      next: { tags: ["uploads"] },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch uploads');
    }
    
    return response.json() as Promise<Upload[]>;
  } catch (error) {
    console.error('Error fetching uploads:', error);
    return []; // Return empty array on error
  }
} 