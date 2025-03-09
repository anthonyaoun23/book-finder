"use client";

import { Grid, Box, Text, Flex, Spinner } from "@radix-ui/themes";
import { Upload as IUpload } from "./interfaces/upload.interface";
import Upload from "./upload";
import { useEffect, useState } from "react";
import revalidateUploads from "./actions/revalidate-uploads";
import getUploads from "./actions/get-uploads";

interface UploadGridProps {
  uploads: IUpload[];
}

export default function UploadGrid({ uploads: initialUploads }: UploadGridProps) {
  const [uploads, setUploads] = useState<IUpload[]>(initialUploads);
  const [isPolling, setIsPolling] = useState(false);
  
  // Poll for updates every 10 seconds for uploads that are pending or processing
  useEffect(() => {
    const pendingUploads = uploads.filter(
      upload => upload.status === 'pending' || upload.status === 'processing'
    );
    
    if (pendingUploads.length === 0) {
      setIsPolling(false);
      return;
    }
    
    setIsPolling(true);
    
    const interval = setInterval(async () => {
      try {
        // Revalidate the tag in the server cache
        await revalidateUploads();
        
        // Fetch the updated data directly
        const updatedUploads = await getUploads();
        setUploads(updatedUploads);
        
        // Check if we still need to poll
        const stillPending = updatedUploads.some(
          upload => upload.status === 'pending' || upload.status === 'processing'
        );
        
        if (!stillPending) {
          setIsPolling(false);
        }
      } catch (error) {
        console.error("Failed to update uploads:", error);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [uploads]);
  
  if (uploads.length === 0) {
    return (
      <Box py="6">
        <Text size="3" weight="medium" color="gray">No uploads yet. Upload a book cover to get started.</Text>
      </Box>
    );
  }

  return (
    <Box>
      {isPolling && (
        <Flex align="center" gap="2" mb="4">
          <Spinner size="1" />
          <Text size="2" color="gray">Checking for updates...</Text>
        </Flex>
      )}
      <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="4">
        {uploads.map((upload) => (
          <Upload key={upload.id} upload={upload} />
        ))}
      </Grid>
    </Box>
  );
}
