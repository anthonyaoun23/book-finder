"use client";

import { Card, Flex, Text, Badge, Box, Spinner } from "@radix-ui/themes";
import { BookmarkIcon } from "@radix-ui/react-icons";
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

  const getFictionBadge = () => {
    if (upload.extractedFiction === undefined && !upload.book) {
      return null;
    }
    
    const isFiction = upload.book?.fiction ?? upload.extractedFiction;
    
    return (
      <Badge color={isFiction ? "purple" : "indigo"} variant="soft">
        <Flex align="center" gap="1">
          <BookmarkIcon />
          <Text>{isFiction ? "Fiction" : "Non-Fiction"}</Text>
        </Flex>
      </Badge>
    );
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
            <Text weight="bold" size="2">
              {upload.book?.title || upload.extractedTitle || "Untitled Book"}
            </Text>
            {getStatusBadge()}
          </Flex>
          
          <Box position="relative" height="140px" style={{ overflow: 'hidden', borderRadius: 'var(--radius-2)' }}>
            {!upload.imageUrl ? (
              <Flex 
                align="center" 
                justify="center" 
                height="100%"
                style={{ 
                  backgroundColor: 'var(--gray-3)', 
                  animation: 'pulse 1.5s ease-in-out infinite alternate',
                }}
              >
                <style jsx global>{`
                  @keyframes pulse {
                    0% { opacity: 0.6; }
                    100% { opacity: 1; }
                  }
                `}</style>
                {(upload.status === "pending" || upload.status === "processing") && (
                  <Spinner size="1" />
                )}
              </Flex>
            ) : (
              <Image
                src={upload.imageUrl}
                alt="Book cover"
                fill
                style={{
                  objectFit: 'cover',
                }}
              />
            )}
          </Box>
          
          <Flex direction="column" gap="1">
            {upload.book?.author || upload.extractedAuthor ? (
              <Text size="2" color="gray">
                By: {upload.book?.author || upload.extractedAuthor}
              </Text>
            ) : null}
            
            <Flex justify="between" align="center">
              <Text size="2" color="gray">
                {new Date(upload.createdAt).toLocaleDateString()}
              </Text>
              {getFictionBadge()}
            </Flex>
          </Flex>
        </Flex>
      </div>
    </Card>
  );
}
