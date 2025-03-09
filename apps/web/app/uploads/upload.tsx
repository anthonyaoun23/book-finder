"use client";

import { Card, Flex, Text, Badge, Avatar, Box } from "@radix-ui/themes";
import { FileTextIcon, BookmarkIcon } from "@radix-ui/react-icons";
import { Upload as IUpload } from "./interfaces/upload.interface";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface UploadProps {
  upload: IUpload;
}

export default function Upload({ upload }: UploadProps) {
  const router = useRouter();
  
  const getStatusBadge = () => {
    switch (upload.status) {
      case 'pending':
        return <Badge color="orange">Pending</Badge>;
      case 'processing':
        return <Badge color="blue">Processing</Badge>;
      case 'completed':
        return <Badge color="green">Completed</Badge>;
      case 'failed':
        return <Badge color="red">Failed</Badge>;
      default:
        return <Badge color="gray">Unknown</Badge>;
    }
  };

  return (
    <Card 
      asChild 
      size="2"
      style={{ 
        cursor: 'pointer',
        transition: 'transform 0.2s ease-in-out',
      }}
      className="upload-card"
      onClick={() => router.push(`/uploads/${upload.id}`)}
    >
      <div>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Flex align="center" gap="2">
              {upload.book ? (
                <Avatar 
                  fallback={<BookmarkIcon />}
                  src={upload.imageUrl}
                  radius="full"
                  size="2"
                />
              ) : (
                <Avatar 
                  fallback={<FileTextIcon />}
                  radius="full"
                  size="2"
                />
              )}
              <Text weight="bold" size="2">
                {upload.book?.title || upload.extractedTitle || "Untitled Book"}
              </Text>
            </Flex>
            {getStatusBadge()}
          </Flex>
          
          <Box position="relative" height="140px" style={{ overflow: 'hidden', borderRadius: 'var(--radius-2)' }}>
            <Image
              src={upload.imageUrl}
              alt="Book cover"
              fill
              style={{
                objectFit: 'cover',
              }}
            />
          </Box>
          
          <Flex direction="column" gap="1">
            {upload.book?.author || upload.extractedAuthor ? (
              <Text size="2" color="gray">
                By: {upload.book?.author || upload.extractedAuthor}
              </Text>
            ) : null}
            
            <Text size="2" color="gray">
              Uploaded: {new Date(upload.createdAt).toLocaleDateString()}
            </Text>
          </Flex>
        </Flex>
      </div>
    </Card>
  );
}
