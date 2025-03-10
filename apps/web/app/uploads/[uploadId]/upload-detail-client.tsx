"use client";

import {
  Flex,
  Heading,
  Text,
  Card,
  Badge,
  Box,
  Grid,
  Button,
  Separator,
  Spinner,
} from "@radix-ui/themes";
import { Upload } from "../interfaces/upload.interface";
import Image from "next/image";
import { ArrowLeftIcon, ReloadIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadDetailClientProps {
  initialUpload: Upload;
  getUploadAction: (id: string) => Promise<Upload>;
}

export default function UploadDetailClient({
  initialUpload,
  getUploadAction,
}: UploadDetailClientProps) {
  const [upload, setUpload] = useState<Upload>(initialUpload);
  const [isPolling, setIsPolling] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const router = useRouter();

  // Poll for updates every 3 seconds if the upload is still processing
  useEffect(() => {
    if (!isPolling) return;
    
    // Only poll if the upload is still pending or processing
    if (upload.status !== "pending" && upload.status !== "processing") {
      setIsPolling(false);
      return;
    }

    const interval = setInterval(async () => {
      try {
        setIsFetching(true);
        const updatedUpload = await getUploadAction(upload.id);
        setUpload(updatedUpload);
        
        // Stop polling if the upload is done processing
        if (updatedUpload.status !== "pending" && updatedUpload.status !== "processing") {
          setIsPolling(false);
        }
      } catch (error) {
        console.error("Failed to fetch upload status:", error);
      } finally {
        setIsFetching(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [upload, getUploadAction, isPolling]);

  const getStatusBadge = () => {
    switch (upload.status) {
      case "pending":
        return <Badge color="orange">Pending</Badge>;
      case "processing":
        return <Badge color="blue">Processing</Badge>;
      case "completed":
        return <Badge color="green">Completed</Badge>;
      case "failed":
        return <Badge color="red">Failed</Badge>;
      default:
        return <Badge color="gray">Unknown</Badge>;
    }
  };

  const handleManualRefresh = async () => {
    try {
      setIsFetching(true);
      const updatedUpload = await getUploadAction(upload.id);
      setUpload(updatedUpload);
      // Force a router refresh to ensure we have the latest data
      router.refresh();
    } catch (error) {
      console.error("Failed to refresh upload:", error);
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <Flex direction="column" gap="6">
      <Flex justify="between" align="center">
        <Link href="/">
          <Button variant="soft" size="2" color="blue">
            <ArrowLeftIcon width={16} height={16} />
            Back to Uploads
          </Button>
        </Link>
        <Flex align="center" gap="2">
          {(upload.status === "pending" || upload.status === "processing") && (
            <Flex align="center" gap="2">
              {isFetching ? (
                <Spinner size="1" />
              ) : (
                <Button variant="outline" size="1" onClick={handleManualRefresh}>
                  <ReloadIcon width={14} height={14} />
                  Refresh
                </Button>
              )}
            </Flex>
          )}
          {getStatusBadge()}
        </Flex>
      </Flex>

      <Grid columns={{ initial: "1", md: "2" }} gap="6">
        <Box>
          <Card size="2" style={{ boxShadow: '0 4px 20px rgba(0, 120, 255, 0.1)' }}>
            <Flex direction="column" gap="4">
              <Heading size="5" color="blue">Book Cover</Heading>
              <Box
                position="relative"
                height="300px"
                style={{ 
                  overflow: "hidden", 
                  borderRadius: "var(--radius-3)",
                  border: "1px solid var(--blue-5)",
                }}
              >
                <Image
                  src={upload.imageUrl}
                  alt="Book cover"
                  fill
                  style={{
                    objectFit: "contain",
                  }}
                />
              </Box>
              
              <Flex direction="column" gap="2">
                <Text size="2" weight="bold" color="blue">Upload Details</Text>
                <Text size="2">
                  Uploaded: {new Date(upload.createdAt).toLocaleString()}
                </Text>
                <Flex align="center" gap="2">
                  <Text size="2">Status: {upload.status}</Text>
                  {(upload.status === "pending" || upload.status === "processing") && (
                    <Spinner size="1" />
                  )}
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Box>

        <Box>
          <Card size="2" style={{ boxShadow: '0 4px 20px rgba(0, 120, 255, 0.1)' }}>
            <Flex direction="column" gap="4">
              <Heading size="5" color="blue">Book Information</Heading>
              
              {upload.status === "pending" || upload.status === "processing" ? (
                <Flex direction="column" gap="3" align="center" py="4">
                  <Spinner size="2" />
                  <Text align="center">Processing book information...</Text>
                  <Text size="2" color="gray" align="center">This may take a minute</Text>
                </Flex>
              ) : upload.status === "failed" ? (
                <Text color="red">
                  Failed to extract book information. Please try again.
                </Text>
              ) : (
                <Flex direction="column" gap="4">
                  <Flex direction="column" gap="1">
                    <Text size="2" weight="bold" color="blue">Title</Text>
                    <Text>
                      {upload.book?.title || upload.extractedTitle || "Unknown"}
                    </Text>
                  </Flex>

                  <Flex direction="column" gap="1">
                    <Text size="2" weight="bold" color="blue">Author</Text>
                    <Text>
                      {upload.book?.author || upload.extractedAuthor || "Unknown"}
                    </Text>
                  </Flex>

                  <Flex direction="column" gap="1">
                    <Text size="2" weight="bold" color="blue">Type</Text>
                    <Text>
                      {upload.book?.fiction !== undefined || upload.extractedFiction !== undefined
                        ? (upload.book?.fiction || upload.extractedFiction)
                          ? "Fiction"
                          : "Non-Fiction"
                        : "Unknown"}
                    </Text>
                  </Flex>

                  {upload.book?.pageContent && (
                    <>
                      <Separator size="4" />
                      <Flex direction="column" gap="1">
                        <Text size="2" weight="bold" color="blue">First Page Content</Text>
                        <Card variant="classic" size="1" style={{ backgroundColor: 'rgba(224, 242, 254, 0.3)' }}>
                          <Text style={{ whiteSpace: "pre-wrap" }}>
                            {upload.book.pageContent}
                          </Text>
                        </Card>
                      </Flex>
                    </>
                  )}
                </Flex>
              )}
            </Flex>
          </Card>
        </Box>
      </Grid>
    </Flex>
  );
} 