"use server";

import { get } from "@/app/common/util/fetch";
import { Upload } from "../interfaces/upload.interface";

export default async function getUploads(): Promise<Upload[]> {
  return await get<Upload[]>("upload", ["uploads"]);
}
