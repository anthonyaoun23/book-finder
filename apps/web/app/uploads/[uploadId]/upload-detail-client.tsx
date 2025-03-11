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
  Dialog,
} from "@radix-ui/themes";
import { Upload } from "../interfaces/upload.interface";
import Image from "next/image";
import { ArrowLeftIcon, ReloadIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { get } from "@/app/common/util/fetch";

interface UploadDetailClientProps {
  uploadId: string;
}

export default function UploadDetailClient({
  uploadId,
}: UploadDetailClientProps) {
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFailedModal, setShowFailedModal] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isUploader = searchParams.get('isUploader') === 'true';

  const fetchUpload = useCallback(async () => {
    try {
      setLoading(true);
      const data = await get<Upload>(`upload/${uploadId}/status`);
      setUpload(data);
      setError(null);
      return data;
    } catch (err) {
      console.error("Error fetching upload:", err);
      setError("Failed to load upload data");
      return null;
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  useEffect(() => {
    fetchUpload();
  }, [fetchUpload]);

  useEffect(() => {
    if (!upload || !isUploader) return;
    
    if (upload.status === "failed") {
      setShowFailedModal(true);
    }
    
    if (upload.status !== "pending" && upload.status !== "processing") {
      return;
    }
    
    const pollingTimer = setTimeout(async () => {
      await fetchUpload();
    }, 5000);
    
    return () => {
      clearTimeout(pollingTimer);
    };
  }, [upload, fetchUpload, isUploader]);

  const handleRefresh = async () => {
    await fetchUpload();
    router.refresh();
  };

  if (loading && !upload) {
    return (
      <Flex direction="column" align="center" justify="center" gap="3" py="9">
        <Spinner size="3" />
        <Text size="3">Loading upload details...</Text>
      </Flex>
    );
  }

  if (error && !upload) {
    return (
      <Flex direction="column" align="center" justify="center" py="9">
        <Text size="3" color="red">
          {error}
        </Text>
        <Button onClick={handleRefresh} variant="soft" mt="4">
          Try Again
        </Button>
      </Flex>
    );
  }

  if (!upload) {
    return (
      <Flex direction="column" align="center" justify="center" py="9">
        <Text size="3" color="red">
          Upload not found
        </Text>
      </Flex>
    );
  }

  // Get status badge
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Flex direction="column" gap="6">
      <Dialog.Root open={showFailedModal} onOpenChange={setShowFailedModal}>
        <Dialog.Content>
          <Dialog.Title>Upload Failed</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            The book upload process has failed. Either it wasn't a valid book cover or something went wrong during processing.
          </Dialog.Description>
          
          <Flex gap="3" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Stay on this page
              </Button>
            </Dialog.Close>
            <Button 
              color="blue" 
              onClick={() => router.push('/')}
            >
              Return to homepage
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

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
              {loading ? (
                <Spinner size="1" />
              ) : (
                <Button variant="outline" size="1" onClick={handleRefresh}>
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
                    <Box width="100%" height="100%" style={{ position: 'relative' }}>
                      <style jsx global>{`
                        @keyframes pulse {
                          0% { opacity: 0.6; }
                          100% { opacity: 1; }
                        }
                      `}</style>
                      <Flex 
                        align="center" 
                        justify="center" 
                        height="100%"
                        direction="column"
                        gap="2"
                      >
                        <Text color="gray" size="2">Image processing...</Text>
                        {(upload.status === "pending" || upload.status === "processing") && (
                          <Spinner size="2" />
                        )}
                      </Flex>
                    </Box>
                  </Flex>
                ) : (
                  <Image
                    src={upload.imageUrl}
                    alt="Book cover"
                    fill
                    style={{
                      objectFit: "contain",
                    }}
                  />
                )}
              </Box>
              
              <Flex direction="column" gap="2">
                <Text size="2" weight="bold" color="blue">Upload Details</Text>
                <Text size="2">
                  Uploaded: {formatDate(upload.createdAt)}
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