"use server";

import { get } from "@/app/common/util/fetch";
import { Upload } from "../interfaces/upload.interface";

export default async function getUpload(uploadId: string): Promise<Upload> {
  return get<Upload>(`upload/${uploadId}/status`, [`upload-${uploadId}`]);
} 