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
} from "@radix-ui/themes";
import getUpload from "../actions/get-upload";
import Image from "next/image";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import Link from "next/link";

interface UploadDetailProps {
  params: { uploadId: string };
}

export default async function UploadDetail({ params }: UploadDetailProps) {
  const uploadId = await params.uploadId;
  const upload = await getUpload(uploadId);

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

  return (
    <Flex direction="column" gap="6">
      <Flex justify="between" align="center">
        <Link href="/">
          <Button variant="soft" size="2" color="blue">
            <ArrowLeftIcon width={16} height={16} />
            Back to Uploads
          </Button>
        </Link>
        {getStatusBadge()}
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
                <Text size="2">Status: {upload.status}</Text>
              </Flex>
            </Flex>
          </Card>
        </Box>

        <Box>
          <Card size="2" style={{ boxShadow: '0 4px 20px rgba(0, 120, 255, 0.1)' }}>
            <Flex direction="column" gap="4">
              <Heading size="5" color="blue">Book Information</Heading>
              
              {upload.status === "pending" || upload.status === "processing" ? (
                <Text>Processing book information...</Text>
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