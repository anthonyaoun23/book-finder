"use client";

import { Button, Card, Flex, Text } from "@radix-ui/themes";
import { UploadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { uploadFile } from "@/app/common/util/fetch";
import { useRouter } from "next/navigation";

interface UploadResponse {
  uploadId: string;
}

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Get file extension
    const fileExtension = selectedFile.name.split(".").pop()?.toLowerCase();

    // Validate file type (only png, jpeg, jpg, gif, webp)
    const allowedTypes = ["png", "jpeg", "jpg", "gif", "webp"];
    if (
      !allowedTypes.includes(fileExtension || "") ||
      !selectedFile.type.startsWith("image/")
    ) {
      setError("Please upload an image file (PNG, JPEG, GIF, or WEBP)");
      setFile(null);
      return;
    }

    // Validate file size (10MB max)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    setIsUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await uploadFile<UploadResponse>("upload", formData);

      if (result.error) {
        setError(result.error);
      } else {
        // Reset form on success
        setFile(null);
        if (e.target instanceof HTMLFormElement) {
          e.target.reset();
        }

        // Redirect to the upload detail page
        if (result.data && result.data.uploadId) {
          router.push(`/uploads/${result.data.uploadId}?upload=true`);
        }
      }
    } catch (err) {
      setError("Failed to upload file");
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Flex direction="column" gap="3">
      <Text size="5" weight="bold">
        Upload a Book Cover
      </Text>
      <Card size="2" style={{ boxShadow: "0 4px 20px rgba(0, 120, 255, 0.1)" }}>
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            <Flex
              direction="column"
              gap="2"
              p="4"
              style={{
                border: "1px dashed var(--blue-7)",
                borderRadius: "var(--radius-3)",
                backgroundColor: "rgba(224, 242, 254, 0.5)",
              }}
            >
              <Flex
                justify="center"
                align="center"
                direction="column"
                gap="2"
                py="6"
              >
                <UploadIcon width={24} height={24} color="var(--blue-10)" />
                <Text size="2">
                  {file ? file.name : "Drag & drop or click to select a file"}
                </Text>
                <Text size="1" color="gray">
                  Upload a book cover image (PNG, JPEG, GIF, WEBP) to extract
                  information
                </Text>

                <Button
                  size="2"
                  variant="soft"
                  color="blue"
                  style={{ position: "relative", overflow: "hidden" }}
                >
                  Select File
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/gif, image/webp"
                    onChange={handleFileChange}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                      cursor: "pointer",
                    }}
                  />
                </Button>
              </Flex>
            </Flex>

            {error && (
              <Text color="red" size="2">
                {error}
              </Text>
            )}

            <Button type="submit" disabled={!file || isUploading} color="blue">
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </Flex>
        </form>
      </Card>
    </Flex>
  );
}
