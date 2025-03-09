"use server";

import { revalidateTag } from "next/cache";
import { uploadFile } from "@/app/common/util/fetch";
import { FormResponse } from "@/app/common/interfaces/form-response.interface";

export default async function createUpload(formData: FormData): Promise<FormResponse<{uploadId: string}>> {
  const response = await uploadFile("upload", formData);
  
  if (!response.error) {
    revalidateTag("uploads");
  }
  
  return response;
} 