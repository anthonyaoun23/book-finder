"use client";

import { Grid, Box, Text } from "@radix-ui/themes";
import { Upload as IUpload } from "./interfaces/upload.interface";
import Upload from "./upload";
import { useEffect, useState } from "react";
import revalidateUploads from "./actions/revalidate-uploads";

interface UploadGridProps {
  uploads: IUpload[];
}

export default function UploadGrid({ uploads: initialUploads }: UploadGridProps) {
  const [uploads, setUploads] = useState<IUpload[]>(initialUploads);
  
  // Poll for updates every 10 seconds for uploads that are pending or processing
  useEffect(() => {
    const pendingUploads = uploads.filter(
      upload => upload.status === 'pending' || upload.status === 'processing'
    );
    
    if (pendingUploads.length === 0) return;
    
    const interval = setInterval(async () => {
      await revalidateUploads();
      // We can't directly get the updated data here since this is a client component
      // The page will rerender with new data when the cache is revalidated
    }, 10000);
    
    return () => clearInterval(interval);
  }, [uploads]);
  
  if (uploads.length === 0) {
    return (
      <Box py="8">
        <Text align="center" size="3" color="gray">
          No uploads yet. Upload a book cover to get started.
        </Text>
      </Box>
    );
  }

  return (
    <Grid 
      columns={{ initial: "1", sm: "2", md: "3" }}
      gap="4"
      py="4"
    >
      {uploads.map((upload) => (
        <Upload key={upload.id} upload={upload} />
      ))}
    </Grid>
  );
}
