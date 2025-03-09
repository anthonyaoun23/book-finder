import getUpload from "../actions/get-upload";
import UploadDetailClient from "./upload-detail-client";

interface UploadDetailProps {
  params: { uploadId: string };
}

export default async function UploadDetail(props: UploadDetailProps) {
  const params = await props.params;
  const uploadId = await params.uploadId;
  const upload = await getUpload(uploadId);

  return (
    <UploadDetailClient 
      initialUpload={upload} 
      getUploadAction={getUpload} 
    />
  );
} 