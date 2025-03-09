"use server";

import { revalidateTag } from "next/cache";

export default async function createUpload(formData: FormData) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload`, {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { error: error.message || 'Upload failed' };
    }
    
    const data = await response.json();
    
    revalidateTag("uploads");
    
    return { data, error: '' };
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 