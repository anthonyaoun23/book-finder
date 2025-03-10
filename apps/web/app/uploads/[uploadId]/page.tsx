import UploadDetailClient from "./upload-detail-client";

interface UploadDetailProps {
  params: Promise<{ uploadId: string }>;
}

export default async function UploadDetail(props: UploadDetailProps) {
  const params = await props.params;
  const { uploadId } = params;
  
  return <UploadDetailClient uploadId={uploadId} />;
}
